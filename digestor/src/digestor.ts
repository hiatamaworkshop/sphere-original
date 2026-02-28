// ============================================================
// Digestor — Species memory metabolism (main loop)
// ============================================================
//
// The Digestor is a mini-Sphere for eval-log.
// It reads raw evaluation history, applies natural selection
// (balanced_qv × time_decay), and outputs a digested
// species-profile that phi-agents consume.
//
// Like CleanerFish: independent, periodic, stateless.

import { join } from "node:path";
import { createHash } from "node:crypto";
import { computeScore, computeHunger, prune } from "./scoring.js";
import type { FlatEval, ScoredEval } from "./scoring.js";
import { buildProfile } from "./profiler.js";
import type { WeightDelta } from "./profiler.js";
import { startServer } from "./server.js";
import { computeSessionMetrics, aggregateSpeciesTrajectory, MIN_WAYPOINTS, MIN_SPECIES_TRAILS } from "./trajectory-statistics.js";
import type { TrailEntry as TrajTrailEntry, TrajectoryStats, SphereAverages } from "./trajectory-statistics.js";
import { createStorage } from "./storage.js";
import type { Storage, EvalLogEntry, GenerationData } from "./storage.js";

// ---- Config (environment variables) ----

export const DATA_DIR = process.env.DATA_DIR ?? "/app/data";
export const EVAL_LOG = join(DATA_DIR, "eval-log.jsonl");
export const NARRATIVE_LOG = join(DATA_DIR, "narrative-log.jsonl");
export const TRAIL_LOG = join(DATA_DIR, "trail-log.jsonl");
export const PROFILE_OUT = join(DATA_DIR, "species-profile.json");
export const GEN_DIR = join(DATA_DIR, "generations");
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT ?? "5000");
const INTERVAL_MS = parseInt(process.env.DIGEST_INTERVAL_MS ?? "10800000"); // 3h default
const HALF_LIFE_HOURS = parseFloat(process.env.HALF_LIFE_HOURS ?? "72");
const MIN_EVALS = parseInt(process.env.MIN_EVALS ?? "50");
const MIN_PER_SPECIES = parseInt(process.env.MIN_PER_SPECIES ?? "20");
const ONCE = process.env.ONCE === "1";
const SPHERE_URL = process.env.SPHERE_URL ?? "http://localhost:3001";

// ---- flatten ----

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
  decayDistribution?: { mean: number; std: number; min: number; max: number };
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
    decayDistribution: snapshot.decayDistribution,
    flagDistribution: snapshot.flagDistribution,
    flux: snapshot.flux,
    generation,
  };
  return createHash("sha256")
    .update(JSON.stringify(hashInput))
    .digest("hex")
    .slice(0, 16);
}

// ---- Rebuild entries from survived evals (for truncation) ----

function rebuildEntries(survived: ScoredEval[]): EvalLogEntry[] {
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

// ---- Previous generation delta loader ----

function extractDeltas(gen: GenerationData): Record<string, WeightDelta> | undefined {
  const species = gen.species as Record<string, { weightDelta?: WeightDelta }> | undefined;
  if (!species) return undefined;
  const deltas: Record<string, WeightDelta> = {};
  for (const [name, entry] of Object.entries(species)) {
    if (entry.weightDelta) {
      deltas[name] = entry.weightDelta;
    }
  }
  return Object.keys(deltas).length > 0 ? deltas : undefined;
}

// ---- Trajectory digest ----

function trajectoryDigest(
  trails: TrajTrailEntry[],
  sphereSnapshot: SphereSnapshot | null,
): Record<string, TrajectoryStats> | null {
  if (trails.length === 0) return null;

  const sphereAvg: SphereAverages | undefined = sphereSnapshot ? {
    avgHeat: sphereSnapshot.heatDistribution.mean,
    avgWeight: sphereSnapshot.weightDistribution.mean,
    avgDecay: sphereSnapshot.decayDistribution?.mean,
  } : undefined;

  const sessionsBySpecies = new Map<string, ReturnType<typeof computeSessionMetrics>[]>();
  let computed = 0;
  let skipped = 0;

  for (const trail of trails) {
    const metrics = computeSessionMetrics(trail, sphereAvg);
    if (!metrics) { skipped++; continue; }
    computed++;
    const list = sessionsBySpecies.get(metrics.loadout) ?? [];
    list.push(metrics);
    sessionsBySpecies.set(metrics.loadout, list);
  }

  console.log(`[digestor] Trajectory: ${trails.length} trails, ${computed} computed, ${skipped} skipped (< ${MIN_WAYPOINTS} waypoints)`);

  const result: Record<string, TrajectoryStats> = {};
  for (const [loadout, sessions] of sessionsBySpecies) {
    const valid = sessions.filter((s): s is NonNullable<typeof s> => s !== null);
    const stats = aggregateSpeciesTrajectory(valid);
    if (stats) {
      result[loadout] = stats;
      console.log(`[digestor]   ${loadout}: ${stats.sessions} sessions, spread=${stats.avgSpread.toFixed(2)}, path=${stats.avgPathLength.toFixed(1)}, straight=${stats.avgStraightness.toFixed(2)}${stats.avgHeatBias !== undefined ? `, hBias=${stats.avgHeatBias.toFixed(2)}` : ""}${stats.avgWeightBias !== undefined ? `, wBias=${stats.avgWeightBias.toFixed(2)}` : ""}${stats.avgDecayBias !== undefined ? `, dBias=${stats.avgDecayBias.toFixed(2)}` : ""}`);
    } else {
      console.log(`[digestor]   ${loadout}: ${valid.length} sessions (< ${MIN_SPECIES_TRAILS} minimum)`);
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ---- Main digest cycle ----

async function digest(storage: Storage): Promise<void> {
  const entries = await storage.readEvalLog();
  const flat = flatten(entries);

  console.log(`[digestor] Read ${entries.length} sessions, ${flat.length} evaluations`);

  if (flat.length < MIN_EVALS) {
    console.log(`[digestor] Skip: ${flat.length} < ${MIN_EVALS} minimum evaluations`);
    return;
  }

  // Step 0: Fetch Sphere snapshot
  const sphereSnapshot = await fetchSphereSnapshot();
  if (sphereSnapshot) {
    console.log(`[digestor] Sphere snapshot: ${sphereSnapshot.nodeCount.total} nodes, flux=${sphereSnapshot.flux.total}`);
  }

  // Step 1: Score neutrally
  const scored = scoreAll(flat);
  const hunger = computeHunger(flat.length);
  console.log(`[digestor] Hunger: ${hunger.toFixed(2)} (${flat.length} evals)`);

  // Step 2: Prune
  const survived = prune(scored, hunger, MIN_PER_SPECIES);
  console.log(`[digestor] Survived: ${survived.length}/${flat.length} (${(survived.length / flat.length * 100).toFixed(0)}%)`);

  // Step 3: Build species profile
  const latestGen = await storage.loadLatestGeneration();
  const previousDeltas = latestGen ? extractDeltas(latestGen) : undefined;
  if (previousDeltas) {
    console.log(`[digestor] Loaded previous deltas for: ${Object.keys(previousDeltas).join(", ")}`);
  }
  const profile = buildProfile(survived, flat.length, previousDeltas);

  // Step 3.5: Trajectory analysis
  const trails = await storage.readTrailLog() as TrajTrailEntry[];
  const trajectoryResult = trajectoryDigest(trails, sphereSnapshot);
  if (trajectoryResult) {
    for (const [loadout, stats] of Object.entries(trajectoryResult)) {
      if (profile.species[loadout]) {
        profile.species[loadout].trajectoryStats = stats;
      }
    }
  }

  // Step 4: Write profile
  await storage.writeProfile(profile);
  console.log(`[digestor] Profile written: ${Object.keys(profile.species).length} species, ${profile.survivedEvaluations} surviving evals`);

  // Step 5: Archive generation
  const gen = await storage.nextGeneration();
  const sphereHash = sphereSnapshot ? computeSphereHash(sphereSnapshot, gen) : null;

  const genData: GenerationData = {
    generation: gen,
    timestamp: new Date().toISOString(),
    sphereHash,
    inputEvaluations: flat.length,
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
    species: profile.species as unknown as Record<string, unknown>,
    global: profile.global as unknown as Record<string, unknown>,
  };
  await storage.saveGeneration(genData);
  if (sphereHash) {
    console.log(`[digestor] Generation ${gen} archived (sphere_hash: ${sphereHash})`);
  } else {
    console.log(`[digestor] Generation ${gen} archived (no sphere snapshot)`);
  }

  // Step 6: Truncate eval-log to survived entries
  const rebuiltEntries = rebuildEntries(survived);
  await storage.truncateEvalLog(rebuiltEntries);
  console.log(`[digestor] eval-log truncated: ${rebuiltEntries.length} sessions (from survived evals)`);

  // Log species summary
  for (const [name, sp] of Object.entries(profile.species)) {
    const ec = sp.evaluationConsistency;
    const ecStr = ec ? `, consistency=${ec.score.toFixed(2)} (${ec.nodes} nodes)` : "";
    const wdStr = sp.weightDelta ? `, δ=[qv:${sp.weightDelta.qualityVector.map((v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(0) + "%").join(",")} rw:${sp.weightDelta.returnWeights.map((v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(0) + "%").join(",")}]` : "";
    console.log(`  ${name}: ${sp.evaluations} evals, h=${sp.avgH.toFixed(1)} w=${sp.avgW.toFixed(1)} d=${sp.avgD.toFixed(1)}, ${sp.hotNodes.length} nodes, ${sp.commonTags.length} tags${ecStr}${wdStr}`);
  }
}

// ---- Sleep loop ----

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const backend = process.env.STORAGE_BACKEND ?? "file";
  console.log(`[digestor] Starting — ${ONCE ? "one-shot" : `interval=${INTERVAL_MS}ms`}, half_life=${HALF_LIFE_HOURS}h, min_evals=${MIN_EVALS}`);
  console.log(`[digestor] Storage backend: ${backend}`);
  console.log(`[digestor] Sphere: ${SPHERE_URL} (for snapshot)`);

  // Initialize storage
  const storage = await createStorage({
    dataDir: DATA_DIR,
    evalLog: EVAL_LOG,
    narrativeLog: NARRATIVE_LOG,
    trailLog: TRAIL_LOG,
    profileOut: PROFILE_OUT,
    genDir: GEN_DIR,
    tursoUrl: process.env.TURSO_URL,
    tursoToken: process.env.TURSO_AUTH_TOKEN,
  });

  // Start IO Gateway (HTTP server)
  if (!ONCE) {
    startServer(GATEWAY_PORT, storage);
  }

  // Run immediately on startup
  await digest(storage);

  if (ONCE) {
    console.log("[digestor] One-shot complete.");
    await storage.close();
    return;
  }

  // Periodic loop
  while (true) {
    await sleep(INTERVAL_MS);
    await digest(storage);
  }
}

main().catch(err => {
  console.error("[digestor] Fatal:", err);
  process.exit(1);
});
