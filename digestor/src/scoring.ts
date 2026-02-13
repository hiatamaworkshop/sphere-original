// ============================================================
// Scoring — balanced_qv × time_decay (neutral evaluation)
// ============================================================
//
// Step 1 of Digestor: score all evaluations neutrally.
// balanced_qv = [0.33, 0.34, 0.33] — no species bias.
// time_decay = exp(-age / half_life) — old memories fade.
//
// This is the "natural selection" phase:
// no species gets to judge its own kind.

const BALANCED_QV = [0.33, 0.34, 0.33] as const;

// ---- Types ----

export interface FlatEval {
  nodeId: string;
  h: number;
  w: number;
  d: number;
  tags: string[];
  signal?: string;
  loadout: string;
  model?: string;
  timestamp: number;
}

export interface ScoredEval extends FlatEval {
  score: number;
}

// ---- Score computation ----

export function computeScore(
  h: number, w: number, d: number,
  ageHours: number, halfLifeHours: number,
): number {
  const raw = BALANCED_QV[0] * h + BALANCED_QV[1] * w + BALANCED_QV[2] * d;
  const timeDecay = Math.exp(-ageHours / halfLifeHours);
  return raw * timeDecay;
}

// ---- Hunger ----
// Tuned for 3h digest interval (default).
// 3 agents × 30s sleep × 3h ≈ 360-450 evals → hunger 0.4-0.5 (ideal).
// 1h → ~120 evals → 0.2 (no pruning). 6h → ~900 evals → 0.9+ (aggressive).

export function computeHunger(totalEvalCount: number): number {
  if (totalEvalCount < 200) return 0.2;
  if (totalEvalCount > 500) return Math.min(1.0, 0.8 + (totalEvalCount - 500) / 2500);
  // Linear interpolation 200-500 → 0.2-0.8
  return 0.2 + (totalEvalCount - 200) / 500 * 0.6;
}

// ---- Pruning ----

export function prune(
  scored: ScoredEval[],
  hunger: number,
  minPerSpecies: number = 20,
): ScoredEval[] {
  // Sort ascending by score to find threshold
  const sorted = [...scored].sort((a, b) => a.score - b.score);
  const thresholdIndex = Math.floor(sorted.length * hunger);
  const threshold = thresholdIndex < sorted.length ? sorted[thresholdIndex].score : 0;

  // Count evaluations per species (for minimum protection)
  const speciesCounts = new Map<string, number>();
  for (const e of scored) {
    speciesCounts.set(e.loadout, (speciesCounts.get(e.loadout) ?? 0) + 1);
  }

  const survived: ScoredEval[] = [];

  for (const e of scored) {
    if (e.score >= threshold) {
      // Above threshold: always survives
      survived.push(e);
    } else {
      const speciesTotal = speciesCounts.get(e.loadout) ?? 0;
      if (speciesTotal <= minPerSpecies) {
        // Protect small species: always survives
        survived.push(e);
      } else {
        // Survival lottery: min 5% chance
        const prob = Math.max(0.05, e.score / Math.max(threshold, 0.001));
        if (Math.random() < prob) {
          survived.push(e);
        }
      }
    }
  }

  return survived;
}
