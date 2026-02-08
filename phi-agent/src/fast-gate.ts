// ============================================================
// FastGate — Local decision layer (no phi calls)
// ============================================================
//
// Replaces phi for:
//   - focus target selection (16bit flag + metrics scoring)
//   - move direction (heuristic from eval result)
//   - return decision (satisfaction vector × return vector)
//
// phi is ONLY used for evaluate (content understanding).
//
// Scoring weights are configurable via constructor.
// Hub flag is deprecated (dynamic linkCounts not supplied to Arbiter).

import type { NearbyNode } from "./sphere-client.js";
import type { WalkMode } from "./sphere-client.js";

// ============================================================
// 16-bit NodeFlag (mirrors renalCore/src/core/types.ts)
// ============================================================

const Flag = {
  Authority:   0x0001,
  Freshness:   0x0002,
  Catalyst:    0x0004,
  Ephemeral:   0x0008,
  Sticky:      0x0010,
  Volatile:    0x0020,
  Hot:         0x0040,
  Frozen:      0x0080,
  Hub:         0x0100,   // deprecated (dynamic), Tagger-only
  Isolated:    0x0200,
  Compressed:  0x4000,
  Candidate:   0x8000,
} as const;

// ============================================================
// Scoring Weights — configurable coefficients
// ============================================================

export interface FastGateWeights {
  /** Flag bonuses (additive score) */
  flags: {
    hot: number;
    authority: number;
    freshness: number;
    sticky: number;
    candidate: number;
    catalyst: number;
    ephemeral: number;   // negative
    isolated: number;    // negative
    volatile: number;    // negative
  };
  /** Metric multipliers */
  metrics: {
    heat: number;
    weight: number;
    decay: number;       // negative: high decay = less desirable
    distance: number;    // negative: far = less desirable
  };
  /** Keyword match bonus per token hit */
  keywordMatch: number;
}

export const DEFAULT_WEIGHTS: FastGateWeights = {
  flags: {
    hot: 8,
    authority: 5,
    freshness: 3,
    sticky: 3,
    candidate: 2,
    catalyst: 2,
    ephemeral: -3,
    isolated: -2,
    volatile: -1,
  },
  metrics: {
    heat: 0.5,
    weight: 0.3,
    decay: -0.1,
    distance: -2,
  },
  keywordMatch: 10,
};

// ============================================================
// Satisfaction Vector — 4D evaluation profile
// ============================================================
//
// S = [avg_h/10, avg_w/10, 1 - avg_d/10, hitRate]
//   dim 0: relevance  (high h = found useful content)
//   dim 1: authority   (high w = found authoritative content)
//   dim 2: preservation (low d = content worth keeping)
//   dim 3: hit rate    (h >= 7 ratio = consistency of good finds)
//
// R = return vector (dot product target)
//   Default: [0.4, 0.3, 0.2, 0.1] — balanced, relevance-weighted

export type SatisfactionVector = [number, number, number, number];

// ============================================================
// Return Vector Presets — agent personality / exploration mode
// ============================================================
//
// Each preset weights the 4 satisfaction dimensions differently:
//   [relevance, authority, preservation, hitRate]

export const RETURN_PRESETS = {
  /** Balanced — general exploration (default) */
  balanced:   [0.4, 0.3, 0.2, 0.1] as SatisfactionVector,
  /** Scholar — prioritizes authoritative, well-established content */
  scholar:    [0.2, 0.5, 0.2, 0.1] as SatisfactionVector,
  /** Scout — quick reconnaissance, returns fast on good finds */
  scout:      [0.5, 0.1, 0.1, 0.3] as SatisfactionVector,
  /** Archivist — seeks content worth preserving (low decay) */
  archivist:  [0.2, 0.3, 0.4, 0.1] as SatisfactionVector,
  /** Hunter — wants consistent high-quality hits */
  hunter:     [0.3, 0.2, 0.1, 0.4] as SatisfactionVector,
} as const;

export type ReturnPreset = keyof typeof RETURN_PRESETS;

// ============================================================
// Loadout — Agent personality bundle
// ============================================================
//
// Intelligence is not in the Sphere (physics only).
// Intelligence is not in the LLM (sensory organ only).
// Intelligence is in the Coupling — the way you measure.
//
// Loadout bundles: what to look at, when to return, how to move,
// and how to feel about energy. Same Sphere, same phi, same nodes —
// different Loadout = different personality. Zero retraining.

export interface Loadout {
  name: string;
  weights: Partial<FastGateWeights>;
  returnVector: SatisfactionVector;
  walkPreference: WalkMode;
  minCycles: number;
  /** Energy sensitivity: how soon the agent feels return pressure from low energy.
   *  High (2.5) = feels pressure early (Scout). Low (0.5) = stays until the end (Scholar).
   *  Internally: energyPressure = (1 - energyRatio) ^ (1 / sensitivity) */
  energySensitivity: number;
}

export const LOADOUTS: Record<string, Loadout> = {
  balanced: {
    name: "balanced",
    weights: {},  // use DEFAULT_WEIGHTS as-is
    returnVector: RETURN_PRESETS.balanced,
    walkPreference: "explore",
    minCycles: 3,
    energySensitivity: 1.0,
  },
  scholar: {
    name: "scholar",
    weights: {
      flags: { ...DEFAULT_WEIGHTS.flags, authority: 8, freshness: 1 },
      metrics: { ...DEFAULT_WEIGHTS.metrics, weight: 0.5, distance: -1 },
    },
    returnVector: RETURN_PRESETS.scholar,
    walkPreference: "deep",
    minCycles: 5,
    energySensitivity: 0.5,
  },
  scout: {
    name: "scout",
    weights: {
      flags: { ...DEFAULT_WEIGHTS.flags, hot: 10, freshness: 6 },
      metrics: { ...DEFAULT_WEIGHTS.metrics, heat: 0.8, distance: -3 },
    },
    returnVector: RETURN_PRESETS.scout,
    walkPreference: "explore",
    minCycles: 2,
    energySensitivity: 2.5,
  },
  archivist: {
    name: "archivist",
    weights: {
      flags: { ...DEFAULT_WEIGHTS.flags, sticky: 6, authority: 6 },
      metrics: { ...DEFAULT_WEIGHTS.metrics, weight: 0.5, decay: -0.3 },
    },
    returnVector: RETURN_PRESETS.archivist,
    walkPreference: "deep",
    minCycles: 4,
    energySensitivity: 0.8,
  },
  hunter: {
    name: "hunter",
    weights: {
      flags: { ...DEFAULT_WEIGHTS.flags, hot: 10 },
      metrics: { ...DEFAULT_WEIGHTS.metrics, heat: 0.8 },
    },
    returnVector: RETURN_PRESETS.hunter,
    walkPreference: "hot",
    minCycles: 3,
    energySensitivity: 1.5,
  },
};

export type LoadoutName = keyof typeof LOADOUTS;

// ============================================================
// SessionMemory — tracks evaluations within a session
// ============================================================

interface EvalRecord {
  nodeId: string;
  h: number;
  w: number;
  d: number;
  tags: string[];
}

export class SessionMemory {
  readonly evals: EvalRecord[] = [];
  private _totalH = 0;
  private _totalW = 0;
  private _totalD = 0;
  private _hits = 0;  // h >= 7
  private _visitedNodeIds = new Set<string>();
  private _allTags = new Set<string>();

  // --- Delta Profile (observation only, doesn't affect decisions) ---
  // Δ = [h/10, w/10, 1-d/10, hitDelta, tagDiversity]
  private _deltas: number[][] = [];
  private _prevState: number[] | null = null;

  record(nodeId: string, h: number, w: number, d: number, tags: string[]): void {
    this.evals.push({ nodeId, h, w, d, tags });
    this._totalH += h;
    this._totalW += w;
    this._totalD += d;
    if (h >= 7) this._hits++;
    this._visitedNodeIds.add(nodeId);

    // Track tag diversity
    const prevTagCount = this._allTags.size;
    for (const t of tags) this._allTags.add(t);
    const newTags = this._allTags.size - prevTagCount;

    // Compute current state snapshot
    const state = [
      h / 10,                      // heat (this eval, normalized)
      w / 10,                      // weight (this eval, normalized)
      1 - d / 10,                  // preservation (inverted decay)
      h >= 7 ? 1 : 0,             // hit (binary)
      newTags / Math.max(tags.length, 1),  // novelty (ratio of new tags)
    ];

    // Record delta from previous state
    if (this._prevState) {
      const delta = state.map((v, i) => v - this._prevState![i]);
      this._deltas.push(delta);
    }
    this._prevState = state;
  }

  get totalScore(): number { return this._totalH; }
  get cycleCount(): number { return this.evals.length; }
  wasVisited(nodeId: string): boolean { return this._visitedNodeIds.has(nodeId); }

  /** 4D satisfaction vector: [relevance, authority, preservation, hitRate] */
  get satisfaction(): SatisfactionVector {
    const n = this.evals.length;
    if (n === 0) return [0, 0, 0, 0];
    return [
      (this._totalH / n) / 10,       // avg_h normalized 0-1
      (this._totalW / n) / 10,       // avg_w normalized 0-1
      1 - (this._totalD / n) / 10,   // inverted avg_d (low d = high value)
      this._hits / n,                 // hit rate (h >= 7)
    ];
  }

  // --- Delta Profile accessors (observation only) ---

  get deltaCount(): number { return this._deltas.length; }

  /** Per-dimension mean of Δ */
  get deltaMean(): number[] {
    const n = this._deltas.length;
    if (n === 0) return [0, 0, 0, 0, 0];
    const sum = [0, 0, 0, 0, 0];
    for (const d of this._deltas) {
      for (let i = 0; i < 5; i++) sum[i] += d[i];
    }
    return sum.map(s => s / n);
  }

  /** Per-dimension variance of Δ */
  get deltaVariance(): number[] {
    const n = this._deltas.length;
    if (n < 2) return [0, 0, 0, 0, 0];
    const mean = this.deltaMean;
    const sumSq = [0, 0, 0, 0, 0];
    for (const d of this._deltas) {
      for (let i = 0; i < 5; i++) sumSq[i] += (d[i] - mean[i]) ** 2;
    }
    return sumSq.map(s => s / (n - 1));
  }

  /** Approximate entropy of recent deltas (normalized 0-1).
   *  High = diverse changes. Low = predictable pattern. */
  get deltaEntropy(): number {
    const n = this._deltas.length;
    if (n < 3) return 1.0;  // assume maximum entropy when insufficient data

    // Use variance sum as proxy for entropy (cheap, no binning needed)
    // High total variance → high entropy (diverse Δ patterns)
    const v = this.deltaVariance;
    const totalVar = v.reduce((a, b) => a + b, 0);
    // Normalize: each dim is [-1,1] so max variance ≈ 1.0 per dim
    return Math.min(1, totalVar / v.length);
  }

  /** Debug string for delta profile */
  deltaDebug(): string {
    if (this._deltas.length === 0) return "Δ: no data";
    const m = this.deltaMean;
    const v = this.deltaVariance;
    const dims = ["h", "w", "p", "hit", "nov"];
    const parts = dims.map((d, i) => `${d}:${m[i] >= 0 ? "+" : ""}${m[i].toFixed(2)}(±${Math.sqrt(v[i]).toFixed(2)})`);
    return `Δ: [${parts.join(", ")}] entropy=${this.deltaEntropy.toFixed(3)}`;
  }
}

// ============================================================
// FastGate
// ============================================================

export class FastGate {
  private queryTokens: string[];
  private returnVector: SatisfactionVector;
  private weights: FastGateWeights;
  private energySensitivity: number;
  private _minCycles: number;
  private _walkPreference: WalkMode;
  readonly memory = new SessionMemory();
  readonly loadoutName: string;

  constructor(query: string, loadout?: Loadout) {
    const l = loadout ?? LOADOUTS.balanced;
    this.loadoutName = l.name;
    this.queryTokens = query
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(t => t.length >= 2);
    this.returnVector = l.returnVector;
    this.energySensitivity = l.energySensitivity;
    this._minCycles = l.minCycles;
    this._walkPreference = l.walkPreference;
    this.weights = {
      flags: { ...DEFAULT_WEIGHTS.flags, ...l.weights.flags },
      metrics: { ...DEFAULT_WEIGHTS.metrics, ...l.weights.metrics },
      keywordMatch: l.weights.keywordMatch ?? DEFAULT_WEIGHTS.keywordMatch,
    };
  }

  get walkPreference(): WalkMode { return this._walkPreference; }

  // --- Pick: choose focus target from sense results ---

  pickFocusTarget(nodes: NearbyNode[]): number {
    if (nodes.length === 0) return -1;

    let bestIndex = 0;
    let bestScore = -Infinity;
    const fw = this.weights.flags;
    const mw = this.weights.metrics;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];

      // Skip: already visited
      if (this.memory.wasVisited(n.id)) continue;

      // Skip: dead nodes (Frozen or Fossil)
      if (n.flags & (Flag.Frozen | Flag.Compressed)) continue;

      let score = 0;

      // --- 16bit flag scoring ---
      if (n.flags & Flag.Hot)        score += fw.hot;
      if (n.flags & Flag.Authority)  score += fw.authority;
      if (n.flags & Flag.Freshness)  score += fw.freshness;
      if (n.flags & Flag.Sticky)     score += fw.sticky;
      if (n.flags & Flag.Candidate)  score += fw.candidate;
      if (n.flags & Flag.Catalyst)   score += fw.catalyst;
      if (n.flags & Flag.Ephemeral)  score += fw.ephemeral;
      if (n.flags & Flag.Isolated)   score += fw.isolated;
      if (n.flags & Flag.Volatile)   score += fw.volatile;
      // Hub: deprecated (dynamic linkCounts not supplied), Tagger-only keyword match remains via tags

      // --- Keyword relevance (summary + tags vs query) ---
      const text = (n.summary + " " + (n.tags ?? []).join(" ")).toLowerCase();
      for (const token of this.queryTokens) {
        if (text.includes(token)) score += this.weights.keywordMatch;
      }

      // --- Metrics ---
      score += n.heat * mw.heat;
      score += n.weight * mw.weight;
      score += n.decay * mw.decay;
      score += n.distance * mw.distance;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  // --- Move: heuristic based on eval result ---

  computeNextMove(evalH: number): WalkMode {
    if (evalH >= 7) return "deep";
    if (evalH >= 5) return "hot";
    return "explore";
  }

  // --- Return: satisfaction vector × return vector ---
  //
  // S · R → returnProb = clamp((dot - 0.5) * 2, 0, 1)
  //
  // Examples (with default R = [0.4, 0.3, 0.2, 0.1]):
  //   Neutral (h=5,w=5,d=5, 0 hits): S=[0.5,0.5,0.5,0.0] → dot=0.45 → prob=0%
  //   Good (h=7,w=6,d=4, 60% hits): S=[0.7,0.6,0.6,0.6] → dot=0.64 → prob=28%
  //   Excellent (h=9,w=8,d=3, 80%): S=[0.9,0.8,0.7,0.8] → dot=0.82 → prob=64%

  /**
   * Return decision: satisfaction × return vector + energy pressure.
   * @param energyRatio currentEnergy / initialEnergy (0.0 ~ 1.0), 1.0 if unknown
   */
  shouldReturn(energyRatio: number = 1.0): boolean {
    const count = this.memory.cycleCount;
    if (count < this._minCycles) return false;

    const s = this.memory.satisfaction;
    const r = this.returnVector;
    const dot = s[0] * r[0] + s[1] * r[1] + s[2] * r[2] + s[3] * r[3];
    const baseProb = Math.max(0, Math.min(1, (dot - 0.5) * 2));

    // Energy pressure: (1 - ratio) ^ (1 / sensitivity)
    // High sensitivity (2.5) → low exponent (0.4) → pressure rises early
    // Low sensitivity (0.5) → high exponent (2.0) → pressure rises late
    const exponent = 1 / this.energySensitivity;
    const energyPressure = Math.pow(Math.max(0, 1 - energyRatio), exponent);

    const finalProb = Math.min(1, baseProb + energyPressure);
    return Math.random() < finalProb;
  }

  /** For debug logging */
  satisfactionDebug(energyRatio: number = 1.0): string {
    const s = this.memory.satisfaction;
    const r = this.returnVector;
    const dot = s[0] * r[0] + s[1] * r[1] + s[2] * r[2] + s[3] * r[3];
    const baseProb = Math.max(0, Math.min(1, (dot - 0.5) * 2));
    const exponent = 1 / this.energySensitivity;
    const energyPressure = Math.pow(Math.max(0, 1 - energyRatio), exponent);
    const finalProb = Math.min(1, baseProb + energyPressure);
    return `S=[${s.map(v => v.toFixed(2)).join(",")}] dot=${dot.toFixed(3)} base=${(baseProb * 100).toFixed(0)}% +E=${(energyPressure * 100).toFixed(0)}% → ${(finalProb * 100).toFixed(0)}%`;
  }
}
