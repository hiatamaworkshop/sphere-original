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

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { computeScore, computeHunger, prune } from "./scoring.js";
import type { FlatEval, ScoredEval } from "./scoring.js";
import { buildProfile } from "./profiler.js";
import { startServer } from "./server.js";

// ---- Config (environment variables) ----

export const DATA_DIR = process.env.DATA_DIR ?? "/app/data";
export const EVAL_LOG = join(DATA_DIR, "eval-log.jsonl");
export const PROFILE_OUT = join(DATA_DIR, "species-profile.json");
export const GEN_DIR = join(DATA_DIR, "generations");
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT ?? "5000");
const INTERVAL_MS = parseInt(process.env.DIGEST_INTERVAL_MS ?? "3600000"); // 1h default
const HALF_LIFE_HOURS = parseFloat(process.env.HALF_LIFE_HOURS ?? "72");
const MIN_EVALS = parseInt(process.env.MIN_EVALS ?? "50");
const MIN_PER_SPECIES = parseInt(process.env.MIN_PER_SPECIES ?? "20");
const ONCE = process.env.ONCE === "1";

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

// ---- Generation archive ----

function nextGeneration(): number {
  if (!existsSync(GEN_DIR)) return 1;
  const files = readdirSync(GEN_DIR).filter(f => /^gen-\d+\.json$/.test(f));
  if (files.length === 0) return 1;
  const nums = files.map(f => parseInt(f.match(/gen-(\d+)\.json/)![1], 10));
  return Math.max(...nums) + 1;
}

function saveGeneration(
  gen: number,
  profile: ReturnType<typeof buildProfile>,
  inputEvals: number,
  hunger: number,
): void {
  if (!existsSync(GEN_DIR)) mkdirSync(GEN_DIR, { recursive: true });
  const padded = String(gen).padStart(3, "0");
  const data = {
    generation: gen,
    timestamp: new Date().toISOString(),
    inputEvaluations: inputEvals,
    survivedEvaluations: profile.survivedEvaluations,
    hunger,
    halfLifeHours: HALF_LIFE_HOURS,
    species: profile.species,
    global: profile.global,
  };
  writeFileSync(join(GEN_DIR, `gen-${padded}.json`), JSON.stringify(data, null, 2), "utf-8");
  console.log(`[digestor] Generation ${gen} archived`);
}

// ---- Truncate eval-log to survived entries ----

function rebuildEntries(survived: ScoredEval[]): EvalLogEntry[] {
  // Group survived evals back into session-like entries by loadout+timestamp
  const groups = new Map<string, { loadout: string; model?: string; timestamp: number; evals: ScoredEval[] }>();
  for (const e of survived) {
    const key = `${e.loadout}:${e.timestamp}`;
    const g = groups.get(key);
    if (g) {
      g.evals.push(e);
    } else {
      groups.set(key, { loadout: e.loadout, model: e.model, timestamp: e.timestamp, evals: [e] });
    }
  }
  const entries: EvalLogEntry[] = [];
  for (const g of groups.values()) {
    entries.push({
      loadout: g.loadout,
      model: g.model,
      timestamp: g.timestamp,
      evaluations: g.evals.map(e => ({
        nodeId: e.nodeId, h: e.h, w: e.w, d: e.d, tags: e.tags,
      })),
    });
  }
  return entries;
}

function truncateLog(survived: ScoredEval[]): void {
  const entries = rebuildEntries(survived);
  const lines = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
  // Atomic write: tmp → rename (safe against concurrent agent appends)
  const tmpFile = EVAL_LOG + ".tmp";
  writeFileSync(tmpFile, lines, "utf-8");
  renameSync(tmpFile, EVAL_LOG);
  console.log(`[digestor] eval-log truncated: ${entries.length} sessions (from survived evals)`);
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

  // Step 4: Write profile (overwrite)
  writeFileSync(PROFILE_OUT, JSON.stringify(profile, null, 2), "utf-8");
  console.log(`[digestor] Profile written: ${Object.keys(profile.species).length} species, ${profile.survivedEvaluations} surviving evals`);

  // Step 5: Archive generation snapshot
  const gen = nextGeneration();
  saveGeneration(gen, profile, flat.length, hunger);

  // Step 6: Truncate eval-log to survived entries only
  truncateLog(survived);

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
  console.log(`[digestor] Starting — ${ONCE ? "one-shot" : `interval=${INTERVAL_MS}ms`}, half_life=${HALF_LIFE_HOURS}h, min_evals=${MIN_EVALS}`);
  console.log(`[digestor] Source: ${EVAL_LOG}`);
  console.log(`[digestor] Output: ${PROFILE_OUT}`);

  // Start IO Gateway (HTTP server)
  if (!ONCE) {
    startServer(GATEWAY_PORT, { dataDir: DATA_DIR, evalLog: EVAL_LOG, profileOut: PROFILE_OUT, genDir: GEN_DIR });
  }

  // Run immediately on startup
  digest();

  if (ONCE) {
    console.log("[digestor] One-shot complete.");
    return;
  }

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
