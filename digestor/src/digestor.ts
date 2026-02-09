// ============================================================
// Digestor — Species memory metabolism (main loop)
// ============================================================
//
// The Digestor is a mini-Sphere for eval-log.jsonl.
// It reads raw evaluation history, applies natural selection
// (balanced_qv × time_decay), and outputs a digested
// species-profile.json that phi-agents consume.
//
// Like CleanerFish: independent, periodic, stateless.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { computeScore, computeHunger, prune } from "./scoring.js";
import type { FlatEval, ScoredEval } from "./scoring.js";
import { buildProfile } from "./profiler.js";

// ---- Config (environment variables) ----

const DATA_DIR = process.env.DATA_DIR ?? "/app/data";
const EVAL_LOG = join(DATA_DIR, "eval-log.jsonl");
const PROFILE_OUT = join(DATA_DIR, "species-profile.json");
const INTERVAL_MS = parseInt(process.env.DIGEST_INTERVAL_MS ?? "3600000"); // 1h default
const HALF_LIFE_HOURS = parseFloat(process.env.HALF_LIFE_HOURS ?? "72");
const MIN_EVALS = parseInt(process.env.MIN_EVALS ?? "50");
const MIN_PER_SPECIES = parseInt(process.env.MIN_PER_SPECIES ?? "20");

// ---- EvalLog types (mirrors phi-agent/src/eval-log.ts) ----

interface EvalLogEntry {
  loadout: string;
  model?: string;
  timestamp: number;
  evaluations: Array<{
    nodeId: string;
    h: number;
    w: number;
    d: number;
    tags: string[];
  }>;
}

// ---- Read & flatten ----

function readLog(): EvalLogEntry[] {
  if (!existsSync(EVAL_LOG)) return [];
  const raw = readFileSync(EVAL_LOG, "utf-8");
  const entries: EvalLogEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch { /* skip malformed */ }
  }
  return entries;
}

function flatten(entries: EvalLogEntry[]): FlatEval[] {
  const flat: FlatEval[] = [];
  for (const entry of entries) {
    for (const ev of entry.evaluations) {
      flat.push({
        nodeId: ev.nodeId,
        h: ev.h,
        w: ev.w,
        d: ev.d,
        tags: ev.tags,
        loadout: entry.loadout,
        model: entry.model,
        timestamp: entry.timestamp,
      });
    }
  }
  return flat;
}

// ---- Score all evaluations ----

function scoreAll(flat: FlatEval[]): ScoredEval[] {
  const now = Date.now();
  return flat.map(e => ({
    ...e,
    score: computeScore(e.h, e.w, e.d, (now - e.timestamp) / 3600000, HALF_LIFE_HOURS),
  }));
}

// ---- Main digest cycle ----

function digest(): void {
  const entries = readLog();
  const flat = flatten(entries);

  console.log(`[digestor] Read ${entries.length} sessions, ${flat.length} evaluations`);

  if (flat.length < MIN_EVALS) {
    console.log(`[digestor] Skip: ${flat.length} < ${MIN_EVALS} minimum evaluations`);
    return;
  }

  // Step 1: Score neutrally (balanced_qv × time_decay)
  const scored = scoreAll(flat);
  const hunger = computeHunger(flat.length);
  console.log(`[digestor] Hunger: ${hunger.toFixed(2)} (${flat.length} evals)`);

  // Step 2: Prune (survival lottery for below-threshold)
  const survived = prune(scored, hunger, MIN_PER_SPECIES);
  console.log(`[digestor] Survived: ${survived.length}/${flat.length} (${(survived.length / flat.length * 100).toFixed(0)}%)`);

  // Step 3: Build species profile (aggregate + environmental blend)
  const profile = buildProfile(survived, flat.length);

  // Step 4: Write output (overwrite)
  writeFileSync(PROFILE_OUT, JSON.stringify(profile, null, 2), "utf-8");
  console.log(`[digestor] Profile written: ${Object.keys(profile.species).length} species, ${profile.survivedEvaluations} surviving evals`);

  // Log species summary
  for (const [name, sp] of Object.entries(profile.species)) {
    console.log(`  ${name}: ${sp.evaluations} evals, h=${sp.avgH.toFixed(1)} w=${sp.avgW.toFixed(1)} d=${sp.avgD.toFixed(1)}, ${sp.hotNodes.length} nodes, ${sp.commonTags.length} tags`);
  }
}

// ---- Sleep loop ----

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log(`[digestor] Starting — interval=${INTERVAL_MS}ms, half_life=${HALF_LIFE_HOURS}h, min_evals=${MIN_EVALS}`);
  console.log(`[digestor] Source: ${EVAL_LOG}`);
  console.log(`[digestor] Output: ${PROFILE_OUT}`);

  // Run immediately on startup
  digest();

  // Then periodic loop
  while (true) {
    await sleep(INTERVAL_MS);
    digest();
  }
}

main().catch(err => {
  console.error("[digestor] Fatal:", err);
  process.exit(1);
});
