/**
 * Sanctification Neuron — 聖域化ニューロンモデル
 *
 * Three-party consensus for Sphere state sanctification.
 * Based on McCulloch-Pitts dual neuron model + Meta observer.
 *
 * [Design] reports/SANCTIFICATION_NEURON_DESIGN.md
 * [Reference] phi-agent/src/fast-gate.ts (FastGate shouldReturn pattern)
 *
 * Architecture:
 *   Hard  (Aδ fiber) — instantaneous state qualification
 *   Soft  (C fiber)  — temporal integration with velocity cooling
 *   Meta  (observer) — metabolic process authenticity
 *
 * All three must agree (co-signers, not vetoes) for sanctification.
 */

// ============================================================
// Telemetry Input
// ============================================================

/**
 * Observation telemetry gathered from the Periphery cycle.
 * All fields are derived from existing subsystem outputs —
 * no new measurements required.
 */
export interface ObservationTelemetry {
  // From Arbiter TransitionQueue
  ascendCount: number;
  erodeCount: number;
  reviveCount: number;
  flagUpdateCount: number;

  // From CleanerFish ProcessResult
  ghostifiedCount: number;
  fossilizedCount: number;
  decomposedCount: number;

  // From projectionDB snapshot
  totalNodes: number;
  activeCount: number;
  amberCount: number;
  fossilCount: number;
  ghostCount: number;
  relicCount: number;

  // From environment
  dbCapacityRatio: number;
  fieldIntensity: number;

  // Agent diversity (from gateway connection count)
  connectedAgents: number;

  // Time
  tickCounter: number;
}

// ============================================================
// Ring Buffer (shared temporal window)
// ============================================================

class RingBuffer {
  private readonly buf: number[];
  private head = 0;
  private count = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buf = new Array(capacity).fill(0);
  }

  push(value: number): void {
    this.buf[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  get length(): number { return this.count; }
  get isFull(): boolean { return this.count >= this.capacity; }

  /** Arithmetic mean of all values in buffer */
  mean(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      sum += this.buf[i];
    }
    return sum / this.count;
  }

  /** Access values as ordered array (oldest → newest) */
  toArray(): number[] {
    const result: number[] = [];
    const start = this.isFull ? this.head : 0;
    for (let i = 0; i < this.count; i++) {
      result.push(this.buf[(start + i) % this.capacity]);
    }
    return result;
  }

  /** Get the most recent value */
  last(): number {
    if (this.count === 0) return 0;
    return this.buf[(this.head - 1 + this.capacity) % this.capacity];
  }
}

// ============================================================
// Hard Neuron — State Qualification
// ============================================================

/**
 * "Where am I now?"
 *
 * Instantaneous sphere health from node distribution.
 * Fires when the sphere meets minimum quality thresholds.
 */
class HardNeuron {
  private prevConfidence = 0;

  /** Hard threshold: minimum health to consider sanctification */
  static readonly THRESHOLD = 0.3;

  process(t: ObservationTelemetry): HardResult {
    if (t.totalNodes === 0) {
      return { fired: false, confidence: 0, velocity: 0 };
    }

    // Health signals (all normalized 0~1):
    // 1. Amber ratio — crystallized knowledge fraction
    const amberRatio = t.amberCount / t.totalNodes;

    // 2. Active health — best around 50%, too high=immature, too low=dying
    const activeRatio = t.activeCount / t.totalNodes;
    const activeHealth = 1 - Math.abs(activeRatio - 0.5) * 2;

    // 3. Capacity — needs minimum population (20% → 1.0)
    const capacityHealth = Math.min(1, t.dbCapacityRatio * 5);

    // 4. Relic presence — structural stability (3+ relics → 1.0)
    const relicHealth = Math.min(1, t.relicCount / 3);

    // Weighted confidence
    const confidence =
      amberRatio * 0.35 +
      activeHealth * 0.25 +
      capacityHealth * 0.25 +
      relicHealth * 0.15;

    // Velocity: crossing speed (used by Soft for cooling)
    const velocity = Math.abs(confidence - this.prevConfidence);
    this.prevConfidence = confidence;

    return {
      fired: confidence >= HardNeuron.THRESHOLD,
      confidence,
      velocity,
    };
  }
}

interface HardResult {
  fired: boolean;
  confidence: number;
  velocity: number;
}

// ============================================================
// Soft Neuron — Temporal Legitimacy
// ============================================================

/**
 * "How long has this been true?"
 *
 * Integrates Hard's confidence over a time window.
 * Velocity cooling discounts artificial spikes:
 *   coolingWeight = 1 / (1 + velocity × COOLING_FACTOR)
 *   → natural growth (low velocity): weight ≈ 1.0
 *   → artificial spike (high velocity): weight → 0
 *
 * "熱しやすいものは冷めやすい"
 */
class SoftNeuron {
  private readonly history: RingBuffer;

  static readonly COOLING_FACTOR = 5.0;
  static readonly THRESHOLD = 0.25;

  constructor(windowSize: number) {
    this.history = new RingBuffer(windowSize);
  }

  process(hardConfidence: number, velocity: number): SoftResult {
    // Velocity cooling: fast changes are discounted
    const coolingWeight = 1.0 / (1.0 + velocity * SoftNeuron.COOLING_FACTOR);
    const cooledValue = hardConfidence * coolingWeight;

    this.history.push(cooledValue);

    const integrated = this.history.mean();

    // Need full window before firing (temporal legitimacy requires history)
    if (!this.history.isFull) {
      return { fired: false, integrated };
    }

    return {
      fired: integrated >= SoftNeuron.THRESHOLD,
      integrated,
    };
  }
}

interface SoftResult {
  fired: boolean;
  integrated: number;
}

// ============================================================
// Meta Neuron — Metabolic Authenticity
// ============================================================

/**
 * "How did we get here?"
 *
 * Observes process, not results. Semantic blind — sees only
 * numbers, speeds, distributions. Never node content or flags.
 *
 * Four physical quantities:
 *   1. Organic ratio    — natural lifecycle vs total events
 *   2. Graph churn rate — total transitions / node count
 *   3. Amber slope      — amber count trend vs historical mean
 *   4. Agent diversity   — evaluation source diversity (v1: connection count proxy)
 *
 * [Theory] Matzinger Danger Model (1994): detect abnormal patterns, not foreign agents
 * [Design] Recovery mandatory: suspicion *= 0.995 per tick (prevent Sphere PTSD)
 */
class MetaNeuron {
  private readonly churnHistory: RingBuffer;
  private readonly amberHistory: RingBuffer;
  private suspicionLevel = 0;

  // Recovery: prevent chronic inflammation
  static readonly RECOVERY_RATE = 0.995;
  static readonly SUSPICION_THRESHOLD = 0.5;

  // Anomaly thresholds (conservative defaults)
  static readonly MAX_CHURN_RATE = 0.3;
  static readonly MAX_AMBER_SLOPE_SIGMA = 3.0;

  constructor(windowSize: number) {
    this.churnHistory = new RingBuffer(windowSize);
    this.amberHistory = new RingBuffer(windowSize);
  }

  process(t: ObservationTelemetry): MetaResult {
    // === Physical Quantity 1: Organic Ratio ===
    // Natural lifecycle events / total metabolic events
    const totalEvents =
      t.ascendCount + t.erodeCount + t.reviveCount +
      t.ghostifiedCount + t.fossilizedCount + t.decomposedCount;
    const organicEvents =
      t.ghostifiedCount + t.fossilizedCount + t.decomposedCount;
    const organicRatio = totalEvents > 0 ? organicEvents / totalEvents : 1.0;

    // === Physical Quantity 2: Graph Churn Rate ===
    const churnRate = t.totalNodes > 0 ? totalEvents / t.totalNodes : 0;
    this.churnHistory.push(churnRate);

    // === Physical Quantity 3: Amber Promotion Slope ===
    this.amberHistory.push(t.amberCount);
    let amberSlopeAnomaly = 0;
    if (this.amberHistory.length >= 3) {
      const values = this.amberHistory.toArray();
      const n = values.length;
      const currentSlope = values[n - 1] - values[n - 2];

      // Mean absolute slope over history
      let slopeSum = 0;
      for (let i = 1; i < n; i++) {
        slopeSum += Math.abs(values[i] - values[i - 1]);
      }
      const meanAbsSlope = slopeSum / (n - 1);

      // Deviation from normal (0 if mean is 0 — no history to compare)
      amberSlopeAnomaly = meanAbsSlope > 0
        ? Math.abs(currentSlope) / meanAbsSlope
        : 0;
    }

    // === Physical Quantity 4: Agent Diversity ===
    // v1 proxy: connected agent count → diversity score
    // 1 agent = 0, 4+ agents = 1.0
    const agentDiversity = Math.min(1, Math.max(0, (t.connectedAgents - 1) / 3));

    // === Suspicion Accumulation ===
    let suspicionDelta = 0;

    // Low organic ratio + activity → metabolism is being forced
    if (organicRatio < 0.3 && totalEvents > 0) {
      suspicionDelta += (0.3 - organicRatio) * 0.5;
    }

    // High churn rate → unstable metabolism
    if (churnRate > MetaNeuron.MAX_CHURN_RATE) {
      suspicionDelta += (churnRate - MetaNeuron.MAX_CHURN_RATE) * 2;
    }

    // Amber slope anomaly → unnatural promotion pattern
    if (amberSlopeAnomaly > MetaNeuron.MAX_AMBER_SLOPE_SIGMA) {
      suspicionDelta += (amberSlopeAnomaly - MetaNeuron.MAX_AMBER_SLOPE_SIGMA) * 0.3;
    }

    // Low diversity + high activity → single-source manipulation
    if (agentDiversity < 0.3 && totalEvents > 2) {
      suspicionDelta += (0.3 - agentDiversity) * 0.5;
    }

    // Apply with mandatory recovery
    this.suspicionLevel += suspicionDelta;
    this.suspicionLevel *= MetaNeuron.RECOVERY_RATE;
    this.suspicionLevel = Math.max(0, Math.min(1, this.suspicionLevel));

    return {
      healthy: this.suspicionLevel < MetaNeuron.SUSPICION_THRESHOLD,
      suspicion: this.suspicionLevel,
      // Debug: expose individual quantities
      organicRatio,
      churnRate,
      amberSlopeAnomaly,
      agentDiversity,
    };
  }
}

interface MetaResult {
  healthy: boolean;
  suspicion: number;
  organicRatio: number;
  churnRate: number;
  amberSlopeAnomaly: number;
  agentDiversity: number;
}

// ============================================================
// Sanctification Neuron — Orchestrator
// ============================================================

export interface SanctificationResult {
  /** Three-party consensus reached */
  sanctify: boolean;
  /** Combined confidence (geometric mean, 0~1) */
  confidence: number;
  /** Per-neuron results for telemetry/debug */
  hard: HardResult;
  soft: SoftResult;
  meta: MetaResult;
}

/**
 * Sanctification Neuron — three-party consensus orchestrator.
 *
 * Called every observationInterval (10 ticks = 10 sec).
 * When all three neurons agree, sanctification is recommended.
 *
 * [Design] Observer, not producer.
 * [Design] All three are co-signers — no single neuron has veto power.
 */
export class SanctificationNeuron {
  private readonly hard = new HardNeuron();
  private readonly soft: SoftNeuron;
  private readonly meta: MetaNeuron;
  private observationCount = 0;

  /**
   * @param windowSize Ring buffer size (observations).
   *   Default 30 = 5 minutes at 10-second intervals.
   */
  constructor(windowSize: number = 30) {
    this.soft = new SoftNeuron(windowSize);
    this.meta = new MetaNeuron(windowSize);
  }

  /**
   * Observe one cycle of sphere metabolism.
   *
   * Temporal grid alignment: all three neurons receive data
   * from the same observation tick. 1 cycle = 1 snapshot.
   */
  observe(telemetry: ObservationTelemetry): SanctificationResult {
    this.observationCount++;

    // Three-party observation (same data, different perspectives)
    const hard = this.hard.process(telemetry);
    const soft = this.soft.process(hard.confidence, hard.velocity);
    const meta = this.meta.process(telemetry);

    // Three-party consensus — all must agree
    const sanctify = hard.fired && soft.fired && meta.healthy;

    // Combined confidence: geometric mean (punishes any weak signal)
    const confidence = sanctify
      ? Math.cbrt(
          hard.confidence *
          soft.integrated *
          (1 - meta.suspicion)
        )
      : 0;

    return { sanctify, confidence, hard, soft, meta };
  }

  /** Number of observation cycles completed */
  get cycles(): number {
    return this.observationCount;
  }
}
