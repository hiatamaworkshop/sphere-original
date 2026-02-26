// ============================================================
// Profiler — species aggregation + environmental blend
// ============================================================
//
// Step 2 of Digestor: aggregate survived evaluations per species.
// Each species entry is pre-blended: 0.7 × own + 0.3 × global.
// phi-agent reads the profile and uses it directly (no re-blending).

import type { ScoredEval } from "./scoring.js";

// ---- Weight Delta (learned_weight Phase 2) ----
//
// effective = base × (1 + δ)
// δ accumulates across generations, clamped to ±DELTA_CLAMP.
// Computed from evaluation_consistency + evaluation patterns.
// See: LEARNED_WEIGHT_DESIGN.md §Phase 2

export interface WeightDelta {
  flagBias: Record<string, number>;
  returnWeights: [number, number, number, number];
  qualityVector: [number, number, number, number];
}

const LEARNING_RATE = 0.03;   // base ε per generation
const DELTA_CLAMP = 0.3;      // max ±30% total deviation (matches fast-gate.ts)
const MIN_CONSISTENCY_NODES = 3;  // minimum revisited nodes for learning

// ---- Types ----

export interface NodeCount {
  nodeId: string;
  count: number;
}

export interface EvalConsistency {
  /** Composite consistency score (0=random, 1=perfectly consistent) */
  score: number;
  /** Number of nodes with 2+ evaluations (sample size) */
  nodes: number;
  /** Mean std per dimension (lower = more consistent) */
  meanStdH: number;
  meanStdW: number;
  meanStdD: number;
}

export interface SpeciesEntry {
  evaluations: number;
  avgH: number;
  avgW: number;
  avgD: number;
  hotNodes: NodeCount[];
  commonTags: string[];
  /** Nodes evaluated 2+ times (re-evaluation consistency tracking) */
  revisitedNodes?: number;
  /** Total re-evaluation count (sum of visits - unique nodes for revisited) */
  totalRevisits?: number;
  /** Sensor consistency: same node → same score? (not blended — species-own metric) */
  evaluationConsistency?: EvalConsistency;
  /** Learned weight delta — accumulated across generations (Phase 2) */
  weightDelta?: WeightDelta;
}

export interface SpeciesProfile {
  generated: string;
  totalEvaluations: number;
  survivedEvaluations: number;
  species: Record<string, SpeciesEntry>;
  global: SpeciesEntry;
}

// ---- Blend constants ----

const SELF_W = 0.7;
const ENV_W = 0.3;

// ---- Helpers ----

/** Population standard deviation */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ---- Aggregation ----

function aggregateGroup(evals: ScoredEval[]): SpeciesEntry {
  if (evals.length === 0) {
    return { evaluations: 0, avgH: 0, avgW: 0, avgD: 0, hotNodes: [], commonTags: [] };
  }

  let totalH = 0, totalW = 0, totalD = 0;
  const nodeCount = new Map<string, number>();
  const tagCount = new Map<string, number>();
  // Collect per-node h/w/d arrays for consistency computation
  const nodeEvals = new Map<string, { h: number[]; w: number[]; d: number[] }>();

  for (const e of evals) {
    totalH += e.h;
    totalW += e.w;
    totalD += e.d;
    nodeCount.set(e.nodeId, (nodeCount.get(e.nodeId) ?? 0) + 1);
    for (const tag of e.tags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
    let ne = nodeEvals.get(e.nodeId);
    if (!ne) {
      ne = { h: [], w: [], d: [] };
      nodeEvals.set(e.nodeId, ne);
    }
    ne.h.push(e.h);
    ne.w.push(e.w);
    ne.d.push(e.d);
  }

  const n = evals.length;

  const hotNodes = [...nodeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nodeId, count]) => ({ nodeId, count }));

  const commonTags = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag]) => tag);

  // Consistency: count nodes evaluated more than once
  let revisitedNodes = 0;
  let totalRevisits = 0;
  for (const count of nodeCount.values()) {
    if (count >= 2) {
      revisitedNodes++;
      totalRevisits += count;
    }
  }

  // Evaluation consistency: std of h/w/d for revisited nodes
  // score = 1 - meanStd/4.0  (4.0 ≈ max practical std on 1-9 scale)
  let evaluationConsistency: EvalConsistency | undefined;
  if (revisitedNodes > 0) {
    let sumStdH = 0, sumStdW = 0, sumStdD = 0;
    let count = 0;
    for (const ne of nodeEvals.values()) {
      if (ne.h.length < 2) continue;
      sumStdH += stddev(ne.h);
      sumStdW += stddev(ne.w);
      sumStdD += stddev(ne.d);
      count++;
    }
    const meanStdH = sumStdH / count;
    const meanStdW = sumStdW / count;
    const meanStdD = sumStdD / count;
    const meanStd = (meanStdH + meanStdW + meanStdD) / 3;
    evaluationConsistency = {
      score: Math.max(0, 1 - meanStd / 4.0),
      nodes: count,
      meanStdH: +meanStdH.toFixed(3),
      meanStdW: +meanStdW.toFixed(3),
      meanStdD: +meanStdD.toFixed(3),
    };
  }

  return {
    evaluations: n,
    avgH: totalH / n,
    avgW: totalW / n,
    avgD: totalD / n,
    hotNodes,
    commonTags,
    revisitedNodes,
    totalRevisits,
    evaluationConsistency,
  };
}

// ---- Environmental blend ----

function blendEntry(species: SpeciesEntry, global: SpeciesEntry): SpeciesEntry {
  // Blend hotNodes: merge visit counts with weighted ratio
  const blendedNodes = new Map<string, number>();
  for (const n of species.hotNodes) {
    blendedNodes.set(n.nodeId, (blendedNodes.get(n.nodeId) ?? 0) + n.count * SELF_W);
  }
  for (const n of global.hotNodes) {
    blendedNodes.set(n.nodeId, (blendedNodes.get(n.nodeId) ?? 0) + n.count * ENV_W);
  }

  // Blend tags: merge with weighted ratio
  const blendedTagMap = new Map<string, number>();
  for (const tag of species.commonTags) {
    blendedTagMap.set(tag, (blendedTagMap.get(tag) ?? 0) + SELF_W);
  }
  for (const tag of global.commonTags) {
    blendedTagMap.set(tag, (blendedTagMap.get(tag) ?? 0) + ENV_W);
  }

  const hotNodes = [...blendedNodes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nodeId, count]) => ({ nodeId, count }));

  const commonTags = [...blendedTagMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag]) => tag);

  return {
    evaluations: species.evaluations,
    avgH: species.avgH * SELF_W + global.avgH * ENV_W,
    avgW: species.avgW * SELF_W + global.avgW * ENV_W,
    avgD: species.avgD * SELF_W + global.avgD * ENV_W,
    hotNodes,
    commonTags,
    // Consistency is NOT blended — it's a sensor quality metric, not environmental
    evaluationConsistency: species.evaluationConsistency,
  };
}

// ---- Weight Delta computation ----

function clampDelta(d: number): number {
  return Math.max(-DELTA_CLAMP, Math.min(DELTA_CLAMP, d));
}

/**
 * Compute learned_δ from evaluation patterns + consistency.
 *
 * Algorithm:
 *   1. evaluation_consistency gates the learning rate (noisy sensor → small updates)
 *   2. Evaluation averages (h, w, d) indicate species preferences
 *   3. Delta accumulates on top of previous generation (momentum)
 *   4. Clamped to ±0.3
 *
 * flagBias: carried forward from previous (needs per-node flag data for learning — future)
 * returnWeights: consistency → trust satisfaction; inconsistency → trust frustration
 * qualityVector: evaluation pattern → what this species considers "good"
 */
function computeWeightDelta(
  species: SpeciesEntry,
  prev?: WeightDelta,
): WeightDelta | undefined {
  const ec = species.evaluationConsistency;
  if (!ec || ec.nodes < MIN_CONSISTENCY_NODES) return prev; // not enough data, carry forward

  const lr = LEARNING_RATE * ec.score; // scale by consistency (0-1)

  // --- Quality vector delta ---
  // avgH/W/D on ~1-9 scale, neutral=5. Deviation = species preference.
  const hSignal = (species.avgH - 5) / 5;   // -1 to +1
  const wSignal = (species.avgW - 5) / 5;
  const dSignal = (species.avgD - 5) / 5;

  const prevQV = prev?.qualityVector ?? [0, 0, 0, 0] as [number, number, number, number];
  const qualityVector: [number, number, number, number] = [
    clampDelta(prevQV[0] + lr * hSignal),      // h tendency
    clampDelta(prevQV[1] + lr * wSignal),      // w tendency
    clampDelta(prevQV[2] + lr * (-dSignal)),   // preservation (invert d)
    clampDelta(prevQV[3]),                      // hitRate: no direct signal, hold
  ];

  // --- Return weights delta ---
  // Consistent sensor → satisfaction is reliable → boost sat weight
  // Inconsistent sensor → frustration should kick in → boost frust weight
  const prevRW = prev?.returnWeights ?? [0, 0, 0, 0] as [number, number, number, number];
  const returnWeights: [number, number, number, number] = [
    clampDelta(prevRW[0] + lr * ec.score),              // sat: boost when consistent
    clampDelta(prevRW[1] + lr * (1 - ec.score)),        // frust: boost when inconsistent
    clampDelta(prevRW[2]),                                // stamina: physics, not learned
    clampDelta(prevRW[3] + lr * (1 - ec.score) * 0.5),  // stale: mild boost when inconsistent
  ];

  // --- Flag bias delta ---
  // Carry forward previous. Per-node flag correlation requires flag data
  // in eval-log (future enhancement). For now, no flag-level learning.
  const flagBias: Record<string, number> = { ...(prev?.flagBias ?? {}) };

  return { flagBias, returnWeights, qualityVector };
}

// ---- Profile builder ----

export function buildProfile(
  survived: ScoredEval[],
  totalEvaluations: number,
  previousDeltas?: Record<string, WeightDelta>,
): SpeciesProfile {
  // Group by loadout
  const groups = new Map<string, ScoredEval[]>();
  for (const e of survived) {
    const group = groups.get(e.loadout) ?? [];
    group.push(e);
    groups.set(e.loadout, group);
  }

  // Global aggregation (all species combined)
  const global = aggregateGroup(survived);

  // Per-species aggregation with environmental blend + learned delta
  const species: Record<string, SpeciesEntry> = {};
  for (const [loadout, evals] of groups) {
    const raw = aggregateGroup(evals);
    const blended = blendEntry(raw, global);
    // Compute learned_δ from raw (unblended) consistency + previous delta
    const prevDelta = previousDeltas?.[loadout];
    blended.weightDelta = computeWeightDelta(raw, prevDelta);
    species[loadout] = blended;
  }

  return {
    generated: new Date().toISOString(),
    totalEvaluations,
    survivedEvaluations: survived.length,
    species,
    global,
  };
}
