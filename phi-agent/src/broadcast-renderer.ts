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
  const ts = new Date(meta.timestamp).toISOString().slice(0, 16) + "Z";

  const header = [
    `[${meta.loadout}] q="${meta.query}"`,
    `${meta.cycles}cyc ${encounters.length}nodes ${meta.evaluations}evals`,
    `energy:${energyPct}% ${durSec}s`,
    ts,
  ].join(" | ");

  posts.push(header);

  // --- Node lines: pack into posts within POST_LIMIT ---
  let currentPost = "";

  for (const enc of encounters) {
    const flagHex = "0x" + enc.flags.toString(16).padStart(4, "0");
    const tagStr = enc.tags.slice(0, 3).join(",");
    const id = enc.nodeId.slice(0, 8);
    const summ = enc.summary.slice(0, 60).replace(/\n/g, " ");

    const line = `${id} ${flagHex} h${enc.h}w${enc.w}d${enc.d} [${tagStr}] ${summ}`;

    if (currentPost.length === 0) {
      currentPost = line;
    } else if (currentPost.length + 1 + line.length <= POST_LIMIT) {
      currentPost += "\n" + line;
    } else {
      posts.push(currentPost);
      currentPost = line;
    }
  }
  if (currentPost.length > 0) {
    posts.push(currentPost);
  }

  const total = posts.length;
  return posts.map((text, index) => ({ text, index, total }));
}
