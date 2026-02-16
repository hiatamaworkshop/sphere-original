/**
 * BroadcastRenderer — Deterministic projection of observation data
 *
 * Design constraints:
 *   1. Pure function — same input always produces same output
 *   2. No emotion words — flags and metrics only
 *   3. No lesson statements — observation, not interpretation
 *   4. Per-node data — each encountered node gets a line
 *   5. Flags + metrics mandatory
 *   6. Traceable — every character maps to actual Sphere data
 *   7. X/Twitter compatible — 280 char limit per post
 *   8. Causal chain — Sphere → Agent → Broadcast, no human editor
 *   9. Human-readable — abbreviations expanded, flags as labels
 */

export interface BroadcastEncounter {
  nodeId: string;
  tags: string[];
  summary: string;
  h: number;
  w: number;
  d: number;
  flags: number;
}

export interface BroadcastMeta {
  loadout: string;
  query: string;
  cycles: number;
  nodesExamined: number;
  evaluations: number;
  energy: number;
  initialEnergy: number;
  duration: number;   // ms
  timestamp: number;  // epoch ms
}

export interface BroadcastPost {
  text: string;
  index: number;
  total: number;
}

const POST_LIMIT = 280;

/** 16-bit flag → human-readable labels (deterministic, no interpretation) */
const FLAG_LABELS: [number, string][] = [
  [0x0001, "recent"],
  [0x0002, "timeless"],
  [0x0004, "cyclic"],
  [0x0010, "dense"],
  [0x0020, "sparse"],
  [0x0040, "composite"],
  [0x0080, "authority"],
  [0x0100, "sharp"],
  [0x0200, "fuzzy"],
  [0x0400, "tensile"],
  [0x0800, "settled"],
  [0x1000, "marked"],
  [0x2000, "core"],
  [0x4000, "compressed"],
  [0x8000, "candidate"],
];

export function flagsToLabels(flags: number): string {
  if (flags === 0) return "";
  return FLAG_LABELS
    .filter(([bit]) => flags & bit)
    .map(([, label]) => label)
    .join(", ");
}

/**
 * Render a broadcast thread from observation data.
 * Pure function: same encounters + meta always produces same output.
 */
export function renderBroadcast(
  encounters: BroadcastEncounter[],
  meta: BroadcastMeta
): BroadcastPost[] {
  if (encounters.length === 0) return [];

  const posts: string[] = [];

  // --- Header ---
  const durSec = Math.floor(meta.duration / 1000);
  const energyPct = meta.initialEnergy > 0
    ? Math.round((meta.energy / meta.initialEnergy) * 100)
    : 0;

  const QUERY_MAX = 50;
  const q = meta.query.length > QUERY_MAX
    ? meta.query.slice(0, QUERY_MAX) + "..."
    : meta.query;

  const header = [
    `[${meta.loadout}] query: "${q}"`,
    `${meta.cycles} cycles · ${encounters.length} nodes · energy ${energyPct}% · ${durSec}s`,
  ].join("\n");

  posts.push(header);

  // --- Node blocks: summary-first, readable ---
  let currentPost = "";

  for (const enc of encounters) {
    const tagStr = enc.tags.slice(0, 3).join(", ");
    const summ = enc.summary.slice(0, 120).replace(/\n/g, " ");

    const block = `▸ ${summ}\n  h:${enc.h} w:${enc.w} d:${enc.d} [${tagStr}]`;

    if (currentPost.length === 0) {
      currentPost = block;
    } else if (currentPost.length + 1 + block.length <= POST_LIMIT) {
      currentPost += "\n" + block;
    } else {
      posts.push(currentPost);
      currentPost = block;
    }
  }
  if (currentPost.length > 0) {
    posts.push(currentPost);
  }

  const total = posts.length;
  return posts.map((text, index) => ({ text, index, total }));
}
