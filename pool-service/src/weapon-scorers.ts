// ============================================================
// Weapon Scorers — Pool-specific personality evaluators
// ============================================================
//
// Reuses the Weapon scoring pattern from phi-agent (multiplicative gates)
// but tuned for Pool context:
//   - heat is artificial (Scorer A derived) → de-emphasized
//   - weight and decay are the primary signals
//   - flags from Tagger + Scorer A bridge
//
// score = base(w, d) × flagGate × ratioMod

import type { InitialMetrics, WeaponScore } from "./types.js";

// --- Flag constants (mirror of Sphere/phi-agent) ---
// Design: FLAG_SYSTEM_REDESIGN.md
const Flag = {
  // Temporal (bits 0-3)
  TemporalShort: 0x0001,
  TemporalLong:  0x0002,
  // Density (bits 4-7)
  Dense:      0x0010,
  Authority:  0x0080,
  // Cognitive (bits 8-11)
  Insightful: 0x0100,
} as const;

// --- Pool Weapon definition ---
interface PoolWeapon {
  name: string;
  /** How much this scorer's vote counts in weighted average */
  voteWeight: number;
  /** Base layer: linear combination of metrics */
  metricWeights: { heat: number; weight: number; decay: number };
  /** Flag multipliers (1.0 = neutral) */
  flagBias: { temporalShort: number; temporalLong: number; dense: number; authority: number };
  /** Ratio-based modifier */
  ratioBias: { stability: number };
  /** Score threshold for this scorer's accept/reject */
  threshold: number;
}

// --- Pool Weapon presets ---
// heat is intentionally near-zero: Pool entries have no organic heat.

const POOL_WEAPONS: PoolWeapon[] = [
  {
    name: "sentinel",
    voteWeight: 0.5,
    metricWeights: { heat: 0.0, weight: 0.4, decay: -0.3 },
    flagBias: { authority: 1.3, temporalShort: 1.0, temporalLong: 1.2, dense: 1.1 },
    ratioBias: { stability: 0.3 },
    threshold: 20,
  },
  {
    name: "curator",
    voteWeight: 0.3,
    metricWeights: { heat: 0.0, weight: 0.6, decay: -0.5 },
    flagBias: { authority: 1.8, temporalShort: 0.7, temporalLong: 1.5, dense: 1.3 },
    ratioBias: { stability: 0.5 },
    threshold: 25,
  },
  {
    name: "scout",
    voteWeight: 0.2,
    metricWeights: { heat: 0.1, weight: 0.2, decay: -0.1 },
    flagBias: { authority: 0.8, temporalShort: 1.5, temporalLong: 0.8, dense: 0.9 },
    ratioBias: { stability: 0.0 },
    threshold: 15,
  },
];

// --- Scoring function ---

function scoreEntry(weapon: PoolWeapon, metrics: InitialMetrics): number {
  const mw = weapon.metricWeights;

  // Base: linear (weight and decay dominant, heat near-zero)
  let base = metrics.heat * mw.heat + metrics.weight * mw.weight + metrics.decay * mw.decay;
  base = Math.max(base, 0.1);

  // Flag gate
  let flagGate = 1.0;
  if (metrics.flags & Flag.TemporalShort) flagGate *= weapon.flagBias.temporalShort;
  if (metrics.flags & Flag.TemporalLong)  flagGate *= weapon.flagBias.temporalLong;
  if (metrics.flags & Flag.Dense)         flagGate *= weapon.flagBias.dense;
  if (metrics.flags & Flag.Authority)     flagGate *= weapon.flagBias.authority;

  // Ratio modifier: stability = weight × (1 - decay/100)
  const stability = metrics.weight * (1 - metrics.decay / 100);
  const ratioMod = Math.max(0.1, 1 + stability * weapon.ratioBias.stability);

  return base * flagGate * ratioMod;
}

// --- Public API ---

export function runWeaponScorers(metrics: InitialMetrics): {
  scores: WeaponScore[];
  weightedAverage: number;
  accepted: boolean;
} {
  const scores: WeaponScore[] = [];
  let totalWeightedScore = 0;
  let totalVoteWeight = 0;

  for (const weapon of POOL_WEAPONS) {
    const score = scoreEntry(weapon, metrics);
    const verdict = score >= weapon.threshold ? "accept" : "reject";
    scores.push({ scorerName: weapon.name, score, verdict });
    totalWeightedScore += score * weapon.voteWeight;
    totalVoteWeight += weapon.voteWeight;
  }

  const weightedAverage = totalVoteWeight > 0 ? totalWeightedScore / totalVoteWeight : 0;

  // Weighted average threshold: derived from individual thresholds × vote weights
  const weightedThreshold = POOL_WEAPONS.reduce(
    (sum, w) => sum + w.threshold * w.voteWeight, 0
  ) / totalVoteWeight;

  return {
    scores,
    weightedAverage,
    accepted: weightedAverage >= weightedThreshold,
  };
}
