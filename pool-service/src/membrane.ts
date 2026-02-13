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

/**
 * Main membrane function.
 * Accepts standard field names (title, body, url)
 * AND legacy Sphere names (summary, content, ref_url) for compatibility.
 */
export function membrane(raw: Record<string, unknown>): MembraneResult {
  const errors: string[] = [];

  // --- 0. Field aliasing: world standard ← legacy Sphere names ---
  const rawTitle = (raw.title ?? raw.summary) as string | undefined;
  const rawBody  = (raw.body  ?? raw.content) as string | undefined;
  const rawUrl   = (raw.url   ?? raw.ref_url) as string | undefined;
  const rawTags  = raw.tags as string[] | undefined;

  // --- 1. Required fields existence ---
  if (!rawTags || !Array.isArray(rawTags)) {
    errors.push("tags: missing or not an array");
  }
  if (!rawTitle || typeof rawTitle !== "string") {
    errors.push("title: missing or not a string");
  }
  if (!rawBody || typeof rawBody !== "string") {
    errors.push("body: missing or not a string");
  }

  // Bail early if structure is broken
  if (errors.length > 0) {
    return { valid: false, entry: null, errors };
  }

  // --- 2. Sanitize text fields (non-null guaranteed by early return above) ---
  const title = sanitizeText(rawTitle!).slice(0, LIMITS.maxSummaryLength);
  const body  = sanitizeText(rawBody!).slice(0, LIMITS.maxContentLength);

  // --- 3. Sanitize tags ---
  const tags = [...new Set(
    rawTags!
      .map(sanitizeTag)
      .filter(t => t.length > 0)
  )].slice(0, LIMITS.maxTagCount);

  // --- 4. Validate lengths ---
  if (title.length < LIMITS.minSummaryLength) {
    errors.push(`title: too short after sanitization (${title.length} < ${LIMITS.minSummaryLength})`);
  }
  if (body.length < LIMITS.minContentLength) {
    errors.push(`body: too short after sanitization (${body.length} < ${LIMITS.minContentLength})`);
  }
  if (tags.length < LIMITS.minTagCount) {
    errors.push(`tags: no valid tags after sanitization`);
  }

  // --- 5. Validate optional fields ---
  let url = rawUrl;
  if (url) {
    url = url.trim().slice(0, LIMITS.maxRefUrlLength);
    if (!isValidUrl(url)) {
      errors.push(`url: invalid URL format`);
      url = undefined;   // strip invalid URL, don't reject entire entry
    }
  }

  if (errors.length > 0) {
    return { valid: false, entry: null, errors };
  }

  // --- 6. Return sanitized entry (standard field names) ---
  return {
    valid: true,
    entry: {
      source: (raw.source as string) ?? "unknown",
      tags,
      title,
      body,
      url,
      ingestedAt: (raw.ingestedAt as number) ?? Date.now(),
    },
    errors: [],
  };
}
