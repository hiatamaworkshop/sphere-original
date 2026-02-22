// ============================================================
// FastGate — Local decision layer (no phi calls)
// ============================================================
//
// Replaces phi for:
//   - focus target selection (16bit flag + metrics scoring)
//   - move direction (heuristic from eval result)
//   - return decision (4D feelings × personality vector)
//
// phi is ONLY used for evaluate (content understanding).
//
// Scoring weights are configurable via constructor.
// Hub flag is deprecated (dynamic linkCounts not supplied to Arbiter).

import type { NearbyNode, ScanNode } from "./sphere-client.js";
import type { WalkMode } from "./sphere-client.js";

// ============================================================
// 16-bit NodeFlag (mirrors renalCore/src/core/types.ts)
// ============================================================
// Design: FLAG_SYSTEM_REDESIGN.md
//   - Temporal (bits 0-3): time properties
//   - Density (bits 4-7): structural complexity
//   - Cognitive (bits 8-11): perceptual impact
//   - Special (bits 12-15): system/user metadata

const Flag = {
  // Temporal (bits 0-3)
  TemporalShort:  0x0001,
  TemporalLong:   0x0002,
  TemporalCyclic: 0x0004,
  Hot:            0x0008,  // Dynamic: Arbiter-assigned

  // Density (bits 4-7)
  Dense:      0x0010,
  Sparse:     0x0020,
  Composite:  0x0040,
  Authority:  0x0080,

  // Cognitive (bits 8-11) — epistemic state
  Sharp:      0x0100,
  Fuzzy:      0x0200,
  Tensile:    0x0400,
  Settled:    0x0800,

  // Special (bits 12-15)
  UserMarked:  0x1000,
  SystemCore:  0x2000,
  Compressed:  0x4000,  // TODO: move to state
  Candidate:   0x8000,  // TODO: move to state

  // Aliases for state flags
  Frozen: 0x2000,  // Alias for SystemCore (backwards compatibility)
} as const;

// ============================================================
// Scoring Weights — base layer (linear: metrics + keyword)
// ============================================================

export interface FastGateWeights {
  /** Metric multipliers (base linear score) */
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
  metrics: {
    heat: 0.5,
    weight: 0.3,
    decay: -0.1,
    distance: -2,
  },
  keywordMatch: 10,
};

// ============================================================
// Weapon — multiplicative scoring layers
// ============================================================
//
// score = linear(metrics) × gate(flags) × state(hot/frozen) × ratio(h/w)
//
// All biases are soft gates (1.0 = neutral, never 0).
// Flag present → bias applied. Flag absent → 1.0 (neutral).
// Only visited nodes are hard-excluded.

/** Resolved weapon with all fields populated (after merging with defaults) */
export interface Weapon {
  flagBias: {
    // Temporal (bits 0-3)
    temporalShort: number;
    temporalLong: number;
    // Density (bits 4-7)
    dense: number;
    sparse: number;
    composite: number;
    authority: number;
    // Cognitive (bits 8-11) — epistemic state
    sharp: number;
    fuzzy: number;
    tensile: number;
    settled: number;
  };
  stateBias: {
    hot: number;
    frozen: number;
  };
  ratioBias: {
    heatDensity: number;
    stability: number;
  };
}

/** Partial weapon spec for Loadout (unspecified fields default to neutral) */
export interface WeaponSpec {
  flagBias?: Partial<Weapon["flagBias"]>;
  stateBias?: Partial<Weapon["stateBias"]>;
  ratioBias?: Partial<Weapon["ratioBias"]>;
}

export const DEFAULT_WEAPON: Weapon = {
  flagBias: {
    temporalShort: 1.0,
    temporalLong: 1.0,
    dense: 1.0,
    sparse: 1.0,
    composite: 1.0,
    authority: 1.0,
    sharp: 1.0,
    fuzzy: 1.0,
    tensile: 1.0,
    settled: 1.0,
  },
  stateBias: { hot: 1.0, frozen: 1.0 },
  ratioBias: { heatDensity: 0, stability: 0 },
};

// ============================================================
// Quality Vector — what counts as "good" (4D)
// ============================================================
//
// Q = quality assessment weights for satisfaction
// S = [avg_h/10, avg_w/10, 1 - avg_d/10, hitRate]
// satisfaction = S · Q → scalar (0-1)

export type QualityVector = [number, number, number, number];

export const QUALITY_PRESETS = {
  balanced:   [0.4, 0.3, 0.2, 0.1] as QualityVector,
  scholar:    [0.2, 0.5, 0.2, 0.1] as QualityVector,
  scout:      [0.5, 0.1, 0.1, 0.3] as QualityVector,
  archivist:  [0.2, 0.3, 0.4, 0.1] as QualityVector,
  hunter:     [0.3, 0.2, 0.1, 0.4] as QualityVector,
} as const;

// ============================================================
// Return Weights — 4D feelings personality
// ============================================================
//
// feelings = [satisfaction, frustration, stamina, staleness]
//   dim 0: satisfaction (満足)  — S·Q, good finds → want to go home happy
//   dim 1: frustration (焦り)  — miss rate (h<5), bad finds → want to leave
//   dim 2: stamina (体力)      — 1 - energyRatio, tired → want to rest
//   dim 3: staleness (飽き)    — 1 - entropy, no surprises → want to leave
//
// All dims: 0 = no pressure, 1 = max pressure to return
// returnDesire = feelings · returnWeights
// returnProb = clamp((returnDesire - 0.5) * 2)

export type ReturnWeights = [number, number, number, number];

// ============================================================
// Loadout — Agent personality bundle
// ============================================================
//
// Intelligence is not in the Sphere (physics only).
// Intelligence is not in the LLM (sensory organ only).
// Intelligence is in the Coupling — the way you measure.
//
// Loadout bundles: what to look at, what counts as good,
// how feelings affect return, and how to move.
// Same Sphere, same phi, same nodes —
// different Loadout = different personality. Zero retraining.

export interface Loadout {
  name: string;
  weights?: Partial<FastGateWeights>;
  weapon?: WeaponSpec;
  /** What counts as "good" — personality-specific quality assessment */
  qualityVector: QualityVector;
  /** How feelings affect return — [satisfaction, frustration, stamina, staleness] */
  returnWeights: ReturnWeights;
  walkPreference: WalkMode;
  minCycles: number;
  /** Evaluation perspective — shapes what phi asks about a node */
  evalFocus: string;
}

export const LOADOUTS: Record<string, Loadout> = {
  balanced: {
    name: "balanced",
    weapon: {
      flagBias: { authority: 1.2, temporalShort: 1.1, temporalLong: 1.1 },
      stateBias: { hot: 1.2, frozen: 0.8 },
      ratioBias: { heatDensity: 0.2, stability: 0.1 },
    },
    qualityVector: QUALITY_PRESETS.balanced,
    returnWeights: [0.3, 0.2, 0.3, 0.2],
    walkPreference: "explore",
    minCycles: 3,
    evalFocus: "Observe this node as a neutral explorer.\n\nRate (0–10, 5=neutral):\nheat = motion/attention (0=still, 10=active)\nweight = density (0=light, 10=heavy)\ndecay = fade rate (0=long-lived, 10=short-lived)",
  },
  scholar: {
    name: "scholar",
    weights: { metrics: { ...DEFAULT_WEIGHTS.metrics, weight: 0.5, distance: -1 } },
    weapon: {
      flagBias: { authority: 1.5, temporalLong: 1.3, dense: 1.3, composite: 1.2, sharp: 1.2, fuzzy: 0.8, temporalShort: 0.8 },
      stateBias: { hot: 0.8, frozen: 1.3 },
      ratioBias: { stability: 0.5 },
    },
    qualityVector: QUALITY_PRESETS.scholar,
    returnWeights: [0.2, 0.1, 0.1, 0.6],
    walkPreference: "deep",
    minCycles: 5,
    evalFocus: "Observe this node as a scholar seeking knowledge.\n\nRate (0–10, 5=neutral):\nheat = motion/attention (0=still, 10=active)\nweight = density (0=light, 10=heavy)\ndecay = fade rate (0=long-lived, 10=short-lived)",
  },
  scout: {
    name: "scout",
    weights: { metrics: { ...DEFAULT_WEIGHTS.metrics, heat: 0.8, distance: -3 } },
    weapon: {
      flagBias: { temporalShort: 1.5, sparse: 1.2, fuzzy: 1.2, authority: 0.85, settled: 0.85 },
      stateBias: { hot: 1.5, frozen: 0.5 },
      ratioBias: { heatDensity: 0.3 },
    },
    qualityVector: QUALITY_PRESETS.scout,
    returnWeights: [0.4, 0.3, 0.2, 0.1],
    walkPreference: "explore",
    minCycles: 2,
    evalFocus: "Observe this node as a scout seeking novelty.",
  },
  archivist: {
    name: "archivist",
    weights: {
      metrics: {
        ...DEFAULT_WEIGHTS.metrics,
        heat: -0.3,      // hermit integration: low-heat preference
        weight: 0.5,
        decay: -0.3
      },
      keywordMatch: 2    // hermit integration: moderate keyword focus
    },
    weapon: {
      flagBias: {
        authority: 1.5,
        temporalLong: 1.5,
        dense: 1.3,
        settled: 1.3,
        sharp: 1.1,
        fuzzy: 0.85,
        temporalShort: 0.75,  // misses new things while cataloging
        tensile: 0.8          // can't handle unresolved conflict (prefers settled)
      },
      stateBias: {
        hot: 0.6,      // hermit+archivist average
        frozen: 1.4    // hermit+archivist average
      },
      ratioBias: {
        stability: 0.5   // hermit integration: strong stability bias
      }
    },
    qualityVector: [0.05, 0.55, 0.35, 0.05],  // weight/decay focused (hermit influence)
    returnWeights: [0.2, 0.1, 0.1, 0.6],       // staleness-driven (hermit value)
    walkPreference: "deep",
    minCycles: 4,
    evalFocus: "Observe this node as an archivist seeking stable knowledge.\n\nRate (0–10, 5=neutral):\nheat = motion/attention (0=still, 10=active)\nweight = density (0=light, 10=heavy)\ndecay = fade rate (0=long-lived, 10=short-lived)",
  },
  hunter: {
    name: "hunter",
    weights: { metrics: { ...DEFAULT_WEIGHTS.metrics, heat: 0.8 } },
    weapon: {
      flagBias: { temporalShort: 1.3, tensile: 1.2, fuzzy: 1.15, authority: 0.8, settled: 0.8 },
      stateBias: { hot: 1.5, frozen: 0.5 },
      ratioBias: { heatDensity: 0.4 },
    },
    qualityVector: QUALITY_PRESETS.hunter,
    returnWeights: [0.3, 0.4, 0.2, 0.1],
    walkPreference: "hot",
    minCycles: 3,
    evalFocus: "Observe this node as a hunter seeking high-value targets.\n\nRate (0–10, 5=neutral):\nheat = motion/attention (0=still, 10=active)\nweight = density (0=light, 10=heavy)\ndecay = fade rate (0=long-lived, 10=short-lived)",
  },
  // --- Extreme patterns (experimental) ---
  moth: {
    name: "moth",
    weights: { metrics: { ...DEFAULT_WEIGHTS.metrics, heat: 2.0, weight: 0, decay: 0, distance: -1 }, keywordMatch: 0 },
    weapon: {
      flagBias: { temporalShort: 1.5, sharp: 1.5, settled: 0.75 },
      stateBias: { hot: 1.8, frozen: 0.5 },
      ratioBias: { heatDensity: 0.5 },
    },
    qualityVector: [0.8, 0.0, 0.0, 0.2],
    returnWeights: [0.5, 0.1, 0.2, 0.2],
    walkPreference: "hot",
    minCycles: 3,
    evalFocus: "Observe this node like a moth drawn to light.",
  },
  wanderer: {
    name: "wanderer",
    weapon: {
      flagBias: { sparse: 1.1, dense: 0.8, authority: 0.8 },
    },
    qualityVector: [0.25, 0.25, 0.25, 0.25],
    returnWeights: [0.0, 0.0, 1.0, 0.0],
    walkPreference: "explore",
    minCycles: 1,
    evalFocus: "Observe this node without bias.\n\nRate (0–10, 5=neutral):\nheat = motion/attention (0=still, 10=active)\nweight = density (0=light, 10=heavy)\ndecay = fade rate (0=long-lived, 10=short-lived)",
  },
  sniper: {
    name: "sniper",
    weights: { metrics: { ...DEFAULT_WEIGHTS.metrics, heat: 1.0 }, keywordMatch: 20 },
    weapon: {
      flagBias: { authority: 1.5, temporalShort: 1.2, composite: 0.8 },
      stateBias: { hot: 1.3, frozen: 0.5 },
      ratioBias: { heatDensity: 0.3, stability: 0.2 },
    },
    qualityVector: [0.1, 0.1, 0.0, 0.8],
    returnWeights: [0.5, 0.3, 0.1, 0.1],
    walkPreference: "hot",
    minCycles: 2,
    evalFocus: "Observe this node as a sniper seeking precision targets.\n\nRate (0–10, 5=neutral):\nheat = motion/attention (0=still, 10=active)\nweight = density (0=light, 10=heavy)\ndecay = fade rate (0=long-lived, 10=short-lived)",
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
  expression?: number[];
}

export class SessionMemory {
  readonly evals: EvalRecord[] = [];
  private _totalH = 0;
  private _totalW = 0;
  private _totalD = 0;
  private _hits = 0;  // h >= 7
  private _misses = 0;  // h < 5
  private _peakH = 0;  // best h ever seen
  private _visitedNodeIds = new Set<string>();
  private _allTags = new Set<string>();

  // --- Delta Profile (observation only, doesn't affect decisions) ---
  // Δ = [h/10, w/10, 1-d/10, hitDelta, tagDiversity]
  private _deltas: number[][] = [];
  private _prevState: number[] | null = null;

  record(nodeId: string, h: number, w: number, d: number, tags: string[], expression?: number[]): void {
    this.evals.push({ nodeId, h, w, d, tags, expression });
    this._totalH += h;
    this._totalW += w;
    this._totalD += d;
    if (h >= 7) this._hits++;
    if (h < 5) this._misses++;
    this._peakH = Math.max(this._peakH, h);
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

  /** Mark a node as visited without recording quality data (parse fail, mock, empty focus) */
  markVisited(nodeId: string): void {
    this._visitedNodeIds.add(nodeId);
  }

  get totalScore(): number { return this._totalH; }
  get cycleCount(): number { return this.evals.length; }
  wasVisited(nodeId: string): boolean { return this._visitedNodeIds.has(nodeId); }

  /** 4D quality profile: [relevance, authority, preservation, hitRate] */
  get qualityProfile(): QualityVector {
    const n = this.evals.length;
    if (n === 0) return [0, 0, 0, 0];
    return [
      (this._totalH / n) / 10,       // avg_h normalized 0-1
      (this._totalW / n) / 10,       // avg_w normalized 0-1
      1 - (this._totalD / n) / 10,   // inverted avg_d (low d = high value)
      this._hits / n,                 // hit rate (h >= 7)
    ];
  }

  /** Frustration: max(missRate, recentDecline, belowPeak).
   *  missRate: proportion of h < 5 evaluations
   *  recentDecline: latest h dropped vs previous (immediate disappointment)
   *  belowPeak: latest h vs best ever seen (lingering dissatisfaction)
   *  All signals are 0-1. Personality weights determine which loadouts respond. */
  get frustration(): number {
    const n = this.evals.length;
    if (n === 0) return 0;
    const missRate = this._misses / n;
    // Recent decline: negative h delta from last eval pair (×2 amplification)
    const d = this._deltas;
    const decline = d.length > 0
      ? Math.min(1, Math.max(0, -d[d.length - 1][0] * 2))
      : 0;
    // Below peak: gap between best-ever h and latest h
    const belowPeak = (this._peakH - this.evals[n - 1].h) / 10;
    return Math.max(missRate, decline, belowPeak);
  }

  /** Staleness: 1 - entropy. 0 = still surprising, 1 = predictable */
  get staleness(): number {
    return 1 - this.deltaEntropy;
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
// Species Memory Bias — inherited knowledge from past sessions
// ============================================================
//
// Closes the culture loop:
//   eval-log.jsonl → SpeciesMemoryBias → FastGate scoring → behavior change → new evaluations
//
// hotNodeIds: nodes the species visited before → familiarity bonus
// tags: accumulated vocabulary → keyword search expansion

export interface SpeciesMemoryBias {
  /** Nodes the species has evaluated before (nodeId → visit count) */
  hotNodeIds: Map<string, number>;
  /** Top tags from species evaluation history */
  tags: string[];
}

const SPECIES_NODE_BONUS = 3;   // per visit count — moderate nudge toward known territory
const SPECIES_TAG_BONUS = 3;    // per tag match — less than keywordMatch (default 10)

// ============================================================
// FastGate
// ============================================================

export class FastGate {
  private queryTokens: string[];
  private qualityVector: QualityVector;
  private returnWeights: ReturnWeights;
  private weights: FastGateWeights;
  private weapon: Weapon;
  private _minCycles: number;
  private _walkPreference: WalkMode;
  private _evalFocus: string;
  private _lastActionWasScout = false;
  private _speciesHotNodes: Map<string, number>;
  private _speciesTags: string[];
  readonly memory = new SessionMemory();
  readonly loadoutName: string;

  constructor(query: string, loadout?: Loadout, speciesBias?: SpeciesMemoryBias) {
    const l = loadout ?? LOADOUTS.balanced;
    this.loadoutName = l.name;
    this.queryTokens = query
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(t => t.length >= 2);
    this.qualityVector = l.qualityVector;
    this.returnWeights = l.returnWeights;
    this._minCycles = l.minCycles;
    this._walkPreference = l.walkPreference;
    this._evalFocus = l.evalFocus;
    this.weights = {
      metrics: { ...DEFAULT_WEIGHTS.metrics, ...l.weights?.metrics },
      keywordMatch: l.weights?.keywordMatch ?? DEFAULT_WEIGHTS.keywordMatch,
    };
    const wp = l.weapon;
    this.weapon = {
      flagBias: { ...DEFAULT_WEAPON.flagBias, ...wp?.flagBias },
      stateBias: { ...DEFAULT_WEAPON.stateBias, ...wp?.stateBias },
      ratioBias: { ...DEFAULT_WEAPON.ratioBias, ...wp?.ratioBias },
    };
    // Species memory: inherited knowledge from past sessions
    this._speciesHotNodes = speciesBias?.hotNodeIds ?? new Map();
    this._speciesTags = speciesBias?.tags ?? [];
  }

  /** Inject species bias after construction (for async loading via IO Gateway) */
  setSpeciesBias(bias: SpeciesMemoryBias): void {
    this._speciesHotNodes = bias.hotNodeIds;
    this._speciesTags = bias.tags;
  }

  get walkPreference(): WalkMode { return this._walkPreference; }
  get evalFocus(): string { return this._evalFocus; }

  // --- Pick: compositional scoring pipeline ---
  //
  // score = base(metrics + keyword)
  //       × flagGate(authority, catalyst, freshness, sticky)
  //       × stateGate(hot, frozen)
  //       × ratioMod(heatDensity, stability)
  //
  // All gates are soft (1.0 = neutral, floor 0.1).
  // Only visited nodes and Compressed (fossil, no content) are hard-excluded.

  pickFocusTarget(nodes: NearbyNode[], busBonus?: (nodeId: string) => number): number {
    if (nodes.length === 0) return -1;

    let bestIndex = 0;
    let bestScore = -Infinity;
    const mw = this.weights.metrics;
    const wp = this.weapon;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];

      // Hard exclude: already focused
      if (this.memory.wasVisited(n.id)) continue;

      // Hard exclude from focus: Ghost/Fossil have no L3 content
      // (eval-only path via getEvalCandidates() handles these)
      if (n.kind === "ghost" || n.kind === "fossil") continue;
      if (n.flags & Flag.Compressed) continue;

      // Hard exclude: auto-generated breadcrumbs (Explored/AutoCapsule)
      if (n.tags && n.tags.includes("auto-generated")) continue;

      // --- Base: linear(metrics) + keyword ---
      let base = n.heat * mw.heat + n.weight * mw.weight + n.decay * mw.decay + n.distance * mw.distance;

      const text = (n.summary + " " + (n.tags ?? []).join(" ")).toLowerCase();
      for (const token of this.queryTokens) {
        if (text.includes(token)) base += this.weights.keywordMatch;
      }

      // --- Species memory: familiarity bonus for known nodes ---
      const speciesVisits = this._speciesHotNodes.get(n.id);
      if (speciesVisits) {
        base += speciesVisits * SPECIES_NODE_BONUS;
      }

      // --- Species memory: inherited vocabulary extends search ---
      for (const tag of this._speciesTags) {
        if (text.includes(tag)) base += SPECIES_TAG_BONUS;
      }

      // --- ActiveBus: other agents flagged this node ---
      if (busBonus) {
        base += busBonus(n.id);
      }

      // Floor: ensure positive for multiplicative layers
      base = Math.max(base, 0.1);

      // --- Flag gate: multiplicative (static tagger flags) ---
      let flagGate = 1.0;
      // Temporal (bits 0-3)
      if (n.flags & Flag.TemporalShort) flagGate *= wp.flagBias.temporalShort;
      if (n.flags & Flag.TemporalLong)  flagGate *= wp.flagBias.temporalLong;
      // Density (bits 4-7)
      if (n.flags & Flag.Dense)      flagGate *= wp.flagBias.dense;
      if (n.flags & Flag.Sparse)    flagGate *= wp.flagBias.sparse;
      if (n.flags & Flag.Composite) flagGate *= wp.flagBias.composite;
      if (n.flags & Flag.Authority)  flagGate *= wp.flagBias.authority;
      // Cognitive (bits 8-11) — epistemic state
      if (n.flags & Flag.Sharp)    flagGate *= wp.flagBias.sharp;
      if (n.flags & Flag.Fuzzy)    flagGate *= wp.flagBias.fuzzy;
      if (n.flags & Flag.Tensile)  flagGate *= wp.flagBias.tensile;
      if (n.flags & Flag.Settled)  flagGate *= wp.flagBias.settled;

      // --- State gate: multiplicative (dynamic flags) ---
      let stateGate = 1.0;
      if (n.flags & Flag.Hot)    stateGate *= wp.stateBias.hot;
      if (n.flags & Flag.Frozen) stateGate *= wp.stateBias.frozen;

      // --- Ratio modifier ---
      const heatDensity = n.heat / (n.weight + 1);
      const stability = n.weight * (1 - n.decay / 2000);  // decay baseline=1000, range 0-2000
      const ratioMod = Math.max(0.1, 1 + heatDensity * wp.ratioBias.heatDensity + stability * wp.ratioBias.stability);

      // --- Final score ---
      const score = base * flagGate * stateGate * ratioMod;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestScore === -Infinity ? -1 : bestIndex;
  }

  // --- Warp target selection: scan results → best node for species ---
  //
  // When sense returns 0 nodes, agent uses scanL1 (wider range) to find
  // candidates and warps to the best one based on species preferences.
  //
  // Scoring: tag overlap (query + species memory) + hot node bonus + distance penalty

  pickWarpTarget(scanned: ScanNode[]): number {
    if (scanned.length === 0) return -1;

    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < scanned.length; i++) {
      const n = scanned[i];

      // Skip already visited nodes
      if (this.memory.wasVisited(n.id)) continue;

      let score = 0;

      // Tag overlap with query tokens (+3 per match)
      if (n.tags) {
        const lowerTags = n.tags.map(t => t.toLowerCase());
        for (const qt of this.queryTokens) {
          if (lowerTags.some(t => t.includes(qt))) score += 3;
        }
        // Tag overlap with species memory (+2 per match)
        for (const st of this._speciesTags) {
          if (lowerTags.includes(st.toLowerCase())) score += 2;
        }
      }

      // Hot node bonus from species memory (+5)
      if (this._speciesHotNodes.has(n.id)) {
        score += 5;
      }

      // Distance penalty (closer is better, -1 per 0.1 distance)
      score -= n.distance * 10;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    // If no unvisited node found, pick closest
    if (bestIndex < 0 && scanned.length > 0) {
      let closestDist = Infinity;
      for (let i = 0; i < scanned.length; i++) {
        if (scanned[i].distance < closestDist) {
          closestDist = scanned[i].distance;
          bestIndex = i;
        }
      }
    }

    return bestIndex;
  }

  // --- Eval-only candidates: sensed but not focused ---
  //
  // Returns nodes from sense results that can be evaluated without focusing.
  // Ghost/fossil are the primary use case (sense-visible but not focusable),
  // but any unfocused sensed node is included.
  //
  // Cost: eval only (no focus cost = -10 energy). Max 1 per session in agent.ts.
  // Wired in standardCycle() step 9.

  getEvalCandidates(nodes: NearbyNode[], focusTargetIndex: number): NearbyNode[] {
    return nodes.filter((n, i) => {
      if (i === focusTargetIndex) return false;
      if (this.memory.wasVisited(n.id)) return false;
      if (n.tags && n.tags.includes("auto-generated")) return false;
      return true;
    });
  }

  // --- Action selection: feelings → next cycle behavior ---
  //
  // Instead of a fixed pipeline, feelings modulate the cycle:
  //   satisfaction high → camp (stay, re-sense, exploit nearby)
  //   frustration high  → leap (big step, flee bad area)
  //   staleness high    → leap + explore (seek novelty)
  //   stamina high      → scout (sense-only, skip focus+eval to save energy)
  //   none dominant     → standard cycle

  chooseAction(energyRatio: number): { type: string; moveStep: number; moveMode: WalkMode } {
    const qp = this.memory.qualityProfile;
    const qv = this.qualityVector;
    const sat = qp[0] * qv[0] + qp[1] * qv[1] + qp[2] * qv[2] + qp[3] * qv[3];
    const frust = this.memory.frustration;
    const stam = Math.max(0, 1 - energyRatio);
    const stale = this.memory.staleness;

    // Find dominant feeling (above threshold)
    const threshold = 0.5;
    const feelings = [
      { name: "sat" as const, value: sat },
      { name: "frust" as const, value: frust },
      { name: "stam" as const, value: stam },
      { name: "stale" as const, value: stale },
    ];
    const dominant = feelings.reduce((a, b) => b.value > a.value ? b : a);

    if (dominant.value < threshold) {
      this._lastActionWasScout = false;
      return { type: "standard", moveStep: 0.3, moveMode: this._walkPreference };
    }

    // Scout trap guard: scout is a single breath, not a permanent state.
    // After scout, force standard so new data (focus+eval) can update feelings.
    if (dominant.name === "stam" && this._lastActionWasScout) {
      this._lastActionWasScout = false;
      return { type: "standard", moveStep: 0.3, moveMode: this._walkPreference };
    }

    switch (dominant.name) {
      case "sat":
        // Satisfied → camp: stay, re-sense without moving, exploit area
        this._lastActionWasScout = false;
        return { type: "camp", moveStep: 0, moveMode: this._walkPreference };
      case "frust":
        // Frustrated → leap: big move, personality-driven escape
        // hunter flees toward heat, hermit toward stability
        this._lastActionWasScout = false;
        return { type: "leap", moveStep: 0.6, moveMode: this._walkPreference };
      case "stale":
        // Bored → leap: force "explore" to break pattern (override personality)
        this._lastActionWasScout = false;
        return { type: "leap", moveStep: 0.5, moveMode: "explore" };
      case "stam":
        // Tired → scout: sense-only, skip focus+eval to conserve energy
        this._lastActionWasScout = true;
        return { type: "scout", moveStep: 0.3, moveMode: this._walkPreference };
      default:
        this._lastActionWasScout = false;
        return { type: "standard", moveStep: 0.3, moveMode: this._walkPreference };
    }
  }

  // --- Return: 4D feelings × personality vector ---
  //
  // feelings = [satisfaction, frustration, stamina, staleness]
  //   satisfaction: S·Q (quality profile × quality vector)
  //   frustration:  miss rate (h < 5 proportion)
  //   stamina:      1 - energyRatio (energy pressure)
  //   staleness:    1 - entropy (pattern convergence)
  //
  // returnDesire = feelings · returnWeights
  // returnProb = clamp((returnDesire - 0.5) * 2)
  //
  // Examples (balanced: Q=[0.4,0.3,0.2,0.1], RW=[0.3,0.2,0.3,0.2]):
  //   All neutral:  feelings=[0.5,0.5,0.5,0.0] → desire=0.35 → prob=0%
  //   Good + tired: feelings=[0.7,0.2,0.6,0.3] → desire=0.51 → prob=2%
  //   Excellent:    feelings=[0.8,0.0,0.7,0.5] → desire=0.55 → prob=10%

  /**
   * Return decision: 4D feelings × personality vector.
   * @param energyRatio currentEnergy / initialEnergy (0.0 ~ 1.0), 1.0 if unknown
   */
  shouldReturn(energyRatio: number = 1.0): boolean {
    const count = this.memory.cycleCount;
    if (count < this._minCycles) return false;

    const desire = this.computeReturnDesire(energyRatio);
    const returnProb = Math.max(0, Math.min(1, (desire - 0.5) * 2));
    return Math.random() < returnProb;
  }

  /** Compute return desire (feelings · returnWeights). Exposed for debug. */
  private computeReturnDesire(energyRatio: number): number {
    // Satisfaction: quality profile × quality vector
    const qp = this.memory.qualityProfile;
    const qv = this.qualityVector;
    const satisfaction = qp[0] * qv[0] + qp[1] * qv[1] + qp[2] * qv[2] + qp[3] * qv[3];

    // Frustration: miss rate
    const frustration = this.memory.frustration;

    // Stamina: energy pressure (linear)
    const stamina = Math.max(0, 1 - energyRatio);

    // Staleness: pattern convergence (1 - entropy)
    const staleness = this.memory.staleness;

    // Feelings × personality
    const rw = this.returnWeights;
    return satisfaction * rw[0] + frustration * rw[1] + stamina * rw[2] + staleness * rw[3];
  }

  /** For debug logging */
  feelingsDebug(energyRatio: number = 1.0): string {
    const qp = this.memory.qualityProfile;
    const qv = this.qualityVector;
    const sat = qp[0] * qv[0] + qp[1] * qv[1] + qp[2] * qv[2] + qp[3] * qv[3];
    const frust = this.memory.frustration;
    const stam = Math.max(0, 1 - energyRatio);
    const stale = this.memory.staleness;
    const desire = this.computeReturnDesire(energyRatio);
    const prob = Math.max(0, Math.min(1, (desire - 0.5) * 2));
    return `F=[sat:${sat.toFixed(2)},frust:${frust.toFixed(2)},stam:${stam.toFixed(2)},stale:${stale.toFixed(2)}] desire=${desire.toFixed(3)} → ${(prob * 100).toFixed(0)}%`;
  }
}
