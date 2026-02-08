// ============================================================
// Membrane — sanitization + validation gate
// ============================================================
//
// Sphere の Gatekeeper に相当するが、Pool 版は 2 つの責務を持つ:
//   1. Validate: Sphere 作法に則っていないものを弾く
//   2. Sanitize: スコアラーが快適に評価できるようデータを成型する
//
// Gatekeeper (検問) ではなく Membrane (浸透膜):
//   通過するものを変換して整える。

import type { PoolEntry } from "./types.js";

// --- Sphere constraints (from schema) ---
const LIMITS = {
  maxSummaryLength: 500,
  maxContentLength: 50_000,
  maxRefUrlLength: 256,
  maxTagCount: 20,
  maxTagLength: 50,
  minContentLength: 10,
  minSummaryLength: 5,
  minTagCount: 1,
} as const;

// --- Validation result ---

export interface MembraneResult {
  valid: boolean;
  entry: PoolEntry | null;
  errors: string[];
}

// --- Sanitization helpers ---

/** Strip HTML tags, script blocks, and excessive whitespace */
function sanitizeText(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, "")   // script blocks
    .replace(/<style[\s\S]*?<\/style>/gi, "")      // style blocks
    .replace(/<[^>]+>/g, "")                        // remaining HTML tags
    .replace(/\r\n/g, "\n")                         // normalize line endings
    .replace(/\t/g, " ")                            // tabs → spaces
    .replace(/ {2,}/g, " ")                         // collapse multiple spaces
    .replace(/\n{3,}/g, "\n\n")                     // collapse excessive newlines
    .trim();
}

/** Normalize a single tag: lowercase, trim, strip special chars */
function sanitizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\-\/\.]/g, "")   // keep alphanumeric, dash, slash, dot
    .replace(/\s+/g, "-")             // spaces → dashes
    .slice(0, LIMITS.maxTagLength);
}

/** Validate URL format (basic check, not exhaustive) */
function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// --- Main membrane function ---

export function membrane(raw: PoolEntry): MembraneResult {
  const errors: string[] = [];

  // --- 1. Required fields existence ---
  if (!raw.tags || !Array.isArray(raw.tags)) {
    errors.push("tags: missing or not an array");
  }
  if (!raw.summary || typeof raw.summary !== "string") {
    errors.push("summary: missing or not a string");
  }
  if (!raw.content || typeof raw.content !== "string") {
    errors.push("content: missing or not a string");
  }

  // Bail early if structure is broken
  if (errors.length > 0) {
    return { valid: false, entry: null, errors };
  }

  // --- 2. Sanitize text fields ---
  const summary = sanitizeText(raw.summary).slice(0, LIMITS.maxSummaryLength);
  const content = sanitizeText(raw.content).slice(0, LIMITS.maxContentLength);

  // --- 3. Sanitize tags ---
  const tags = [...new Set(
    raw.tags
      .map(sanitizeTag)
      .filter(t => t.length > 0)
  )].slice(0, LIMITS.maxTagCount);

  // --- 4. Validate lengths ---
  if (summary.length < LIMITS.minSummaryLength) {
    errors.push(`summary: too short after sanitization (${summary.length} < ${LIMITS.minSummaryLength})`);
  }
  if (content.length < LIMITS.minContentLength) {
    errors.push(`content: too short after sanitization (${content.length} < ${LIMITS.minContentLength})`);
  }
  if (tags.length < LIMITS.minTagCount) {
    errors.push(`tags: no valid tags after sanitization`);
  }

  // --- 5. Validate optional fields ---
  let ref_url = raw.ref_url;
  if (ref_url) {
    ref_url = ref_url.trim().slice(0, LIMITS.maxRefUrlLength);
    if (!isValidUrl(ref_url)) {
      errors.push(`ref_url: invalid URL format`);
      ref_url = undefined;   // strip invalid URL, don't reject entire entry
    }
  }

  if (errors.length > 0) {
    return { valid: false, entry: null, errors };
  }

  // --- 6. Return sanitized entry ---
  return {
    valid: true,
    entry: {
      source: raw.source ?? "unknown",
      tags,
      summary,
      content,
      ref_url,
      ingestedAt: raw.ingestedAt ?? Date.now(),
    },
    errors: [],
  };
}
