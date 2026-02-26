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
import { createHash } from "node:crypto";
import { computeScore, computeHunger, prune } from "./scoring.js";
import type { FlatEval, ScoredEval } from "./scoring.js";
import { buildProfile } from "./profiler.js";
import type { WeightDelta } from "./profiler.js";
import { startServer } from "./server.js";

// ---- Config (environment variables) ----

export const DATA_DIR = process.env.DATA_DIR ?? "/app/data";
export const EVAL_LOG = join(DATA_DIR, "eval-log.jsonl");
export const NARRATIVE_LOG = join(DATA_DIR, "narrative-log.jsonl");
export const PROFILE_OUT = join(DATA_DIR, "species-profile.json");
export const GEN_DIR = join(DATA_DIR, "generations");
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT ?? "5000");
const INTERVAL_MS = parseInt(process.env.DIGEST_INTERVAL_MS ?? "10800000"); // 3h default (hunger ~0.5 at ~450 evals)
const HALF_LIFE_HOURS = parseFloat(process.env.HALF_LIFE_HOURS ?? "72");
const MIN_EVALS = parseInt(process.env.MIN_EVALS ?? "50");
const MIN_PER_SPECIES = parseInt(process.env.MIN_PER_SPECIES ?? "20");
const ONCE = process.env.ONCE === "1";
const SPHERE_URL = process.env.SPHERE_URL ?? "http://localhost:3001";

// ---- EvalLog types (mirrors phi-agent/src/eval-log.ts) ----

interface EvalLogEntry {
  loadout: string;
  model?: string;
  timestamp: number;
  configHash?: string;
  evaluations: Array<{
    nodeId: string;
    h: number;
    w: number;
    d: number;
    tags: string[];
    expression?: number[];
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
        expression: ev.expression,
        loadout: entry.loadout,
        model: entry.model,
        timestamp: entry.timestamp,
        configHash: entry.configHash,
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

// ---- Sphere Snapshot ----

interface SphereSnapshot {
  timestamp: string;
  nodeCount: Record<string, number>;
  heatDistribution: { mean: number; std: number; min: number; max: number };
  weightDistribution: { mean: number; std: number; min: number; max: number };
  flagDistribution: Record<number, number>;
  flux: { total: number };
  field: { intensity: number; dominantFlags: number; volatility: number } | null;
}

async function fetchSphereSnapshot(): Promise<SphereSnapshot | null> {
  try {
    const res = await fetch(`${SPHERE_URL}/sphere/snapshot`);
    if (!res.ok) {
      console.warn(`[digestor] Snapshot fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    return await res.json() as SphereSnapshot;
  } catch (err) {
    console.warn(`[digestor] Snapshot fetch error (Sphere may be offline):`, (err as Error).message);
    return null;
  }
}

function computeSphereHash(snapshot: SphereSnapshot, generation: number): string {
  const hashInput = {
    nodeCount: snapshot.nodeCount,
    heatDistribution: snapshot.heatDistribution,
    weightDistribution: snapshot.weightDistribution,
    flagDistribution: snapshot.flagDistribution,
    flux: snapshot.flux,
    generation,
  };
  return createHash("sha256")
    .update(JSON.stringify(hashInput))
    .digest("hex")
    .slice(0, 16); // Short hash (64-bit) — sufficient for identification
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
  sphereSnapshot: SphereSnapshot | null,
): void {
  if (!existsSync(GEN_DIR)) mkdirSync(GEN_DIR, { recursive: true });
  const padded = String(gen).padStart(3, "0");

  const sphereHash = sphereSnapshot
    ? computeSphereHash(sphereSnapshot, gen)
    : null;

  const data = {
    generation: gen,
    timestamp: new Date().toISOString(),
    sphereHash,
    inputEvaluations: inputEvals,
    survivedEvaluations: profile.survivedEvaluations,
    hunger,
    halfLifeHours: HALF_LIFE_HOURS,
    ...(sphereSnapshot && {
      sphereSnapshot: {
        nodeCount: sphereSnapshot.nodeCount,
        heatDistribution: sphereSnapshot.heatDistribution,
        weightDistribution: sphereSnapshot.weightDistribution,
        flagDistribution: sphereSnapshot.flagDistribution,
        flux: sphereSnapshot.flux,
        field: sphereSnapshot.field,
      },
    }),
    species: profile.species,
    global: profile.global,
  };
  writeFileSync(join(GEN_DIR, `gen-${padded}.json`), JSON.stringify(data, null, 2), "utf-8");

  if (sphereHash) {
    console.log(`[digestor] Generation ${gen} archived (sphere_hash: ${sphereHash})`);
  } else {
    console.log(`[digestor] Generation ${gen} archived (no sphere snapshot)`);
  }
}

// ---- Truncate eval-log to survived entries ----

function rebuildEntries(survived: ScoredEval[]): EvalLogEntry[] {
  // Group survived evals back into session-like entries by loadout+timestamp
  const groups = new Map<string, { loadout: string; model?: string; timestamp: number; configHash?: string; evals: ScoredEval[] }>();
  for (const e of survived) {
    const key = `${e.loadout}:${e.timestamp}`;
    const g = groups.get(key);
    if (g) {
      g.evals.push(e);
    } else {
      groups.set(key, { loadout: e.loadout, model: e.model, timestamp: e.timestamp, configHash: e.configHash, evals: [e] });
    }
  }
  const entries: EvalLogEntry[] = [];
  for (const g of groups.values()) {
    entries.push({
      loadout: g.loadout,
      model: g.model,
      timestamp: g.timestamp,
      ...(g.configHash && { configHash: g.configHash }),
      evaluations: g.evals.map(e => ({
        nodeId: e.nodeId, h: e.h, w: e.w, d: e.d, tags: e.tags,
        ...(e.expression && { expression: e.expression }),
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

// ---- Previous generation delta loader ----

function loadPreviousDeltas(): Record<string, WeightDelta> | undefined {
  if (!existsSync(GEN_DIR)) return undefined;
  const files = readdirSync(GEN_DIR).filter(f => /^gen-\d+\.json$/.test(f));
  if (files.length === 0) return undefined;
  const nums = files.map(f => parseInt(f.match(/gen-(\d+)\.json/)![1], 10));
  const latest = Math.max(...nums);
  const padded = String(latest).padStart(3, "0");
  const path = join(GEN_DIR, `gen-${padded}.json`);
  try {
    const raw = readFileSync(path, "utf-8");
    const gen = JSON.parse(raw) as { species?: Record<string, { weightDelta?: WeightDelta }> };
    if (!gen.species) return undefined;
    const deltas: Record<string, WeightDelta> = {};
    for (const [name, entry] of Object.entries(gen.species)) {
      if (entry.weightDelta) {
        deltas[name] = entry.weightDelta;
      }
    }
    return Object.keys(deltas).length > 0 ? deltas : undefined;
  } catch {
    return undefined;
  }
}

// ---- Main digest cycle ----

async function digest(): Promise<void> {
  const entries = readLog();
  const flat = flatten(entries);

  console.log(`[digestor] Read ${entries.length} sessions, ${flat.length} evaluations`);

  if (flat.length < MIN_EVALS) {
    console.log(`[digestor] Skip: ${flat.length} < ${MIN_EVALS} minimum evaluations`);
    return;
  }

  // Step 0: Fetch Sphere snapshot (non-blocking — continues without if Sphere is offline)
  const sphereSnapshot = await fetchSphereSnapshot();
  if (sphereSnapshot) {
    console.log(`[digestor] Sphere snapshot: ${sphereSnapshot.nodeCount.total} nodes, flux=${sphereSnapshot.flux.total}`);
  }

  // Step 1: Score neutrally (balanced_qv × time_decay)
  const scored = scoreAll(flat);
  const hunger = computeHunger(flat.length);
  console.log(`[digestor] Hunger: ${hunger.toFixed(2)} (${flat.length} evals)`);

  // Step 2: Prune (survival lottery for below-threshold)
  const survived = prune(scored, hunger, MIN_PER_SPECIES);
  console.log(`[digestor] Survived: ${survived.length}/${flat.length} (${(survived.length / flat.length * 100).toFixed(0)}%)`);

  // Step 3: Build species profile (aggregate + environmental blend + learned delta)
  const previousDeltas = loadPreviousDeltas();
  if (previousDeltas) {
    console.log(`[digestor] Loaded previous deltas for: ${Object.keys(previousDeltas).join(", ")}`);
  }
  const profile = buildProfile(survived, flat.length, previousDeltas);

  // Step 4: Write profile (overwrite)
  writeFileSync(PROFILE_OUT, JSON.stringify(profile, null, 2), "utf-8");
  console.log(`[digestor] Profile written: ${Object.keys(profile.species).length} species, ${profile.survivedEvaluations} surviving evals`);

  // Step 5: Archive generation snapshot (with sphere_hash if available)
  const gen = nextGeneration();
  saveGeneration(gen, profile, flat.length, hunger, sphereSnapshot);

  // Step 6: Truncate eval-log to survived entries only
  truncateLog(survived);

  // Log species summary
  for (const [name, sp] of Object.entries(profile.species)) {
    const ec = sp.evaluationConsistency;
    const ecStr = ec ? `, consistency=${ec.score.toFixed(2)} (${ec.nodes} nodes)` : "";
    const wdStr = sp.weightDelta ? `, δ=[qv:${sp.weightDelta.qualityVector.map(v => (v >= 0 ? "+" : "") + (v * 100).toFixed(0) + "%").join(",")} rw:${sp.weightDelta.returnWeights.map(v => (v >= 0 ? "+" : "") + (v * 100).toFixed(0) + "%").join(",")}]` : "";
    console.log(`  ${name}: ${sp.evaluations} evals, h=${sp.avgH.toFixed(1)} w=${sp.avgW.toFixed(1)} d=${sp.avgD.toFixed(1)}, ${sp.hotNodes.length} nodes, ${sp.commonTags.length} tags${ecStr}${wdStr}`);
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
  console.log(`[digestor] Sphere: ${SPHERE_URL} (for snapshot)`);

  // Start IO Gateway (HTTP server)
  if (!ONCE) {
    startServer(GATEWAY_PORT, { dataDir: DATA_DIR, evalLog: EVAL_LOG, narrativeLog: NARRATIVE_LOG, profileOut: PROFILE_OUT, genDir: GEN_DIR });
  }

  // Run immediately on startup
  await digest();

  if (ONCE) {
    console.log("[digestor] One-shot complete.");
    return;
  }

  // Then periodic loop
  while (true) {
    await sleep(INTERVAL_MS);
    await digest();
  }
}

main().catch(err => {
  console.error("[digestor] Fatal:", err);
  process.exit(1);
});
