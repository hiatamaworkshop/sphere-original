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

  /** Clear all data, preserving capacity */
  reset(): void {
    this.buf.fill(0);
    this.head = 0;
    this.count = 0;
  }
}

// ============================================================
// Hard Neuron — Amber Goal Achievement
// ============================================================

/**
 * "Have we reached the goal?"
 *
 * Escalating amber target with autonomous step-down recovery.
 *
 *   epoch 0: target = INITIAL_TARGET (first crystallization milestone)
 *   epoch 1: target = ceil(lastAmber × ESCALATION)
 *   epoch 2: target = ceil(lastAmber × ESCALATION)
 *   ...
 *
 * [Step-down] If erosion causes amberCount to drop below target × STEP_DOWN_RATIO,
 * target automatically steps down to ceil(amberCount × ESCALATION), minimum INITIAL_TARGET.
 * This allows the sphere to self-recover after amber loss — no manual intervention needed.
 *
 *   Example: festival at amber=40 → target=52. Erosion brings amber to 20.
 *   20 < 52 × 0.5 → step-down → target = ceil(20 × 1.3) = 26 → sphere can grow again.
 */
class HardNeuron {
  private _target: number;
  private prevProgress = 0;

  /** First sanctification requires this many amber nodes */
  static readonly INITIAL_TARGET = 5;
  /** Each sanctification raises the bar by this factor */
  static readonly ESCALATION = 1.3;
  /** Step-down triggers when amberCount < target × this ratio */
  static readonly STEP_DOWN_RATIO = 0.5;

  constructor() {
    this._target = HardNeuron.INITIAL_TARGET;
  }

  process(t: ObservationTelemetry): HardResult {
    // Step-down: if amber has eroded significantly, adapt target downward
    if (t.amberCount < this._target * HardNeuron.STEP_DOWN_RATIO) {
      const newTarget = Math.max(
        HardNeuron.INITIAL_TARGET,
        Math.ceil(t.amberCount * HardNeuron.ESCALATION),
      );
      console.log(
        `[HardNeuron] Step-down: target ${this._target} → ${newTarget} (amber=${t.amberCount})`
      );
      this._target = newTarget;
    }

    const progress = this._target > 0
      ? Math.min(1, t.amberCount / this._target)
      : 0;

    const velocity = Math.abs(progress - this.prevProgress);
    this.prevProgress = progress;

    return {
      fired: t.amberCount >= this._target,
      progress,
      amberCount: t.amberCount,
      target: this._target,
      velocity,
    };
  }

  /**
   * Post-sanctification: escalate target.
   * Next goal = ceil(currentAmber × ESCALATION), minimum current+1.
   */
  onSanctify(currentAmber: number): void {
    this._target = Math.max(
      currentAmber + 1,
      Math.ceil(currentAmber * HardNeuron.ESCALATION),
    );
  }

  get target(): number { return this._target; }
}

interface HardResult {
  fired: boolean;
  /** Progress toward target (0~1) */
  progress: number;
  /** Current amber count */
  amberCount: number;
  /** Current target */
  target: number;
  /** Change in progress since last observation */
  velocity: number;
}

// ============================================================
// Soft Neuron — Temporal Health Check
// ============================================================

/**
 * "Has the sphere been healthy long enough?"
 *
 * Integrates sphere vitality over a time window.
 * Must sustain health above threshold for full window before firing.
 *
 * Vitality components:
 *   1. Active health — living node ratio in healthy range (peak at ~50%)
 *   2. Relic presence — structural foundation (3+ relics → 1.0)
 *   3. Population minimum — need minimum population for meaningful sanctification
 *
 * Stricter than Hard: requires sustained health, not just a snapshot.
 * "熱しやすいものは冷めやすい"
 */
class SoftNeuron {
  private readonly history: RingBuffer;

  /** Minimum vitality sustained over the full window */
  static readonly THRESHOLD = 0.40;
  /** Minimum total nodes for population health to register */
  static readonly MIN_POPULATION = 30;

  constructor(windowSize: number) {
    this.history = new RingBuffer(windowSize);
  }

  process(t: ObservationTelemetry): SoftResult {
    // 1. Active health: ratio of living (active+amber) nodes.
    //    Best around 40-60% active — too high means immature, too low means dying.
    const livingNodes = t.activeCount + t.amberCount;
    const livingRatio = t.totalNodes > 0 ? livingNodes / t.totalNodes : 0;
    const activeHealth = livingRatio > 0
      ? 1 - Math.abs(livingRatio - 0.5) * 2
      : 0;

    // 2. Relic presence: structural stability (3+ relics → 1.0)
    const relicHealth = Math.min(1, t.relicCount / 3);

    // 3. Population: need minimum nodes for sanctification to be meaningful
    const populationHealth = Math.min(1, t.totalNodes / SoftNeuron.MIN_POPULATION);

    // Weighted vitality
    const vitality =
      activeHealth * 0.45 +
      relicHealth * 0.25 +
      populationHealth * 0.30;

    this.history.push(vitality);

    const health = this.history.mean();

    // Need full window before firing (temporal legitimacy requires history)
    if (!this.history.isFull) {
      return { fired: false, health };
    }

    return {
      fired: health >= SoftNeuron.THRESHOLD,
      health,
    };
  }

  /** Clear temporal history — used for post-sanctification refractory period */
  reset(): void {
    this.history.reset();
  }

  /** Whether the ring buffer is full (temporal legitimacy achieved) */
  get isFull(): boolean {
    return this.history.isFull;
  }
}

interface SoftResult {
  fired: boolean;
  /** Integrated sphere health over time window (0~1) */
  health: number;
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
 *   4. Ghost metabolism  — zero-agent activity detection (unnatural if active with no agents)
 *
 * [Theory] Matzinger Danger Model (1994): detect abnormal patterns, not foreign agents
 *
 * [Allostasis] Recovery rate adapts to metabolic baseline.
 *   Active sphere → faster immune recovery (this activity level is "normal")
 *   Quiet sphere  → slower recovery (more cautious, less tolerant of anomalies)
 *   Prevents Sphere PTSD while staying alert in quiet conditions.
 */
class MetaNeuron {
  private readonly churnHistory: RingBuffer;
  private readonly amberHistory: RingBuffer;
  private suspicionLevel = 0;

  // Allostatic immune learning
  private metabolicBaseline = 0;
  static readonly METABOLIC_EMA_ALPHA = 0.02;

  // Recovery range: maps from metabolicBaseline
  //   quiet  (baseline→0)   : recovery=0.99 (slow recovery, cautious — half-life ~69 obs = ~12 min)
  //   active (baseline→0.05): recovery=0.95 (fast recovery, adapted  — half-life ~14 obs = ~2.3 min)
  static readonly RECOVERY_FLOOR = 0.95;
  static readonly RECOVERY_CEIL = 0.99;
  static readonly RECOVERY_SCALE = 0.8;  // maps churnRate baseline to recovery range

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

    // Allostatic: learn what "normal" metabolic activity looks like
    this.metabolicBaseline += MetaNeuron.METABOLIC_EMA_ALPHA * (churnRate - this.metabolicBaseline);

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

    // === Physical Quantity 4: Ghost Metabolism ===
    // [Fix] Single-agent operation is normal for Sphere Original.
    // Only penalize: zero agents + active metabolism (truly unnatural).
    const ghostMetabolism = t.connectedAgents === 0 && totalEvents > 3;

    // === Suspicion Accumulation ===
    let suspicionDelta = 0;

    // Low organic ratio + sufficient activity → metabolism is being forced.
    // [Fix] Minimum event threshold of 3 prevents false positives from single-event cycles.
    // Concretely: a lone amber ascension produces totalEvents=1, organicEvents=0 → organicRatio=0,
    // which would trigger maximum suspicion even though the ascension is fully legitimate
    // (it passed the 10-minute Arbiter cooldown). A meaningful organic ratio requires
    // at least a few events to compare against.
    if (organicRatio < 0.3 && totalEvents >= 3) {
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

    // Ghost metabolism → no agents but nodes are transitioning
    if (ghostMetabolism) {
      suspicionDelta += 0.3;
    }

    // Adaptive recovery: active sphere recovers faster (immune learning)
    const recoveryBlend = Math.min(1, this.metabolicBaseline * MetaNeuron.RECOVERY_SCALE / 0.05);
    const effectiveRecovery = MetaNeuron.RECOVERY_CEIL - recoveryBlend * (MetaNeuron.RECOVERY_CEIL - MetaNeuron.RECOVERY_FLOOR);

    // Apply with mandatory adaptive recovery
    this.suspicionLevel += suspicionDelta;
    this.suspicionLevel *= effectiveRecovery;
    this.suspicionLevel = Math.max(0, Math.min(1, this.suspicionLevel));

    return {
      healthy: this.suspicionLevel < MetaNeuron.SUSPICION_THRESHOLD,
      suspicion: this.suspicionLevel,
      effectiveRecovery,
      // Debug: expose individual quantities
      organicRatio,
      churnRate,
      amberSlopeAnomaly,
      ghostMetabolism,
    };
  }
}

interface MetaResult {
  healthy: boolean;
  suspicion: number;
  /** Adaptive recovery rate (0.95~0.99, learned from metabolic baseline) */
  effectiveRecovery: number;
  organicRatio: number;
  churnRate: number;
  amberSlopeAnomaly: number;
  /** True when metabolism is active but no agents connected */
  ghostMetabolism: boolean;
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
  /** Post-sanctification refractory period (Soft buffer rebuilding) */
  festival: boolean;
  /** Sanctification epoch (increments on each SANCTIFY) */
  epoch: number;
  /** Amber count at time of observation */
  amberCount: number;
}

export interface SanctificationConfig {
  /** Ring buffer size (observations). Default 30 = 5 min at 10s intervals */
  windowSize?: number;
  /** Window growth per epoch (0 = no growth, Sphere Original default) */
  epochGrowth?: number;
  /** Maximum window size when epochGrowth > 0 */
  maxWindowSize?: number;
  /** Enable neuron-driven metabolic mode switching (default: true) */
  metabolicAutoMode?: boolean;
  /** Consecutive zero-agent observations before dormancy recommendation (default: 6 = ~60s) */
  dormancyObservations?: number;
}

/**
 * Sanctification Neuron — three-party consensus orchestrator.
 *
 * Called every observationInterval (10 ticks = 10 sec).
 * When all three neurons agree, sanctification is recommended.
 *
 * Post-sanctification lifecycle:
 *   SANCTIFY → reset() → festival period (Soft rebuilding)
 *                       → festival ends when Soft buffer refills
 *                       → next sanctification possible
 *
 * [Design] Observer, not producer.
 * [Design] All three are co-signers — no single neuron has veto power.
 * [Design] Festival = natural refractory period. No artificial timers.
 */
export class SanctificationNeuron {
  private readonly hard = new HardNeuron();
  private soft: SoftNeuron;
  private readonly meta: MetaNeuron;
  private observationCount = 0;
  private _epoch = 0;
  private _inFestival = false;
  private _lastResult: SanctificationResult | null = null;
  private _lastSanctifyTime: string | null = null;
  private _metabolicMode: string = "natural";

  // Dormancy tracking: consecutive observations with zero agents
  private consecutiveZeroAgent = 0;
  private readonly dormancyThreshold: number;

  // Config
  private readonly baseWindowSize: number;
  private readonly epochGrowth: number;
  private readonly maxWindowSize: number;
  readonly metabolicAutoMode: boolean;

  constructor(config: SanctificationConfig | number = {}) {
    // Backward compat: accept bare number as windowSize
    const cfg = typeof config === "number"
      ? { windowSize: config }
      : config;

    this.baseWindowSize = cfg.windowSize ?? 30;
    this.epochGrowth = cfg.epochGrowth ?? 0;
    this.maxWindowSize = cfg.maxWindowSize ?? 90;
    this.metabolicAutoMode = cfg.metabolicAutoMode ?? true;
    this.dormancyThreshold = cfg.dormancyObservations ?? 6;

    this.soft = new SoftNeuron(this.baseWindowSize);
    this.meta = new MetaNeuron(this.baseWindowSize);
  }

  /**
   * Observe one cycle of sphere metabolism.
   *
   * Temporal grid alignment: all three neurons receive data
   * from the same observation tick. 1 cycle = 1 snapshot.
   */
  observe(telemetry: ObservationTelemetry): SanctificationResult {
    this.observationCount++;

    // Dormancy tracking: consecutive zero-agent observations
    if (telemetry.connectedAgents === 0) {
      this.consecutiveZeroAgent++;
    } else {
      this.consecutiveZeroAgent = 0;
    }

    // Festival ends when Soft buffer refills (temporal legitimacy restored)
    if (this._inFestival && this.soft.isFull) {
      this._inFestival = false;
      console.log(
        `[Sanctification] Festival ended — epoch ${this._epoch} ready for next sanctification`
      );
    }

    // Three-party observation (same data, different perspectives)
    const hard = this.hard.process(telemetry);
    const soft = this.soft.process(telemetry);
    const meta = this.meta.process(telemetry);

    // Three-party consensus — all must agree
    const sanctify = hard.fired && soft.fired && meta.healthy;

    // Combined confidence: geometric mean (punishes any weak signal)
    const confidence = sanctify
      ? Math.cbrt(
          hard.progress *
          soft.health *
          (1 - meta.suspicion)
        )
      : 0;

    this._lastResult = {
      sanctify, confidence, hard, soft, meta,
      festival: this._inFestival,
      epoch: this._epoch,
      amberCount: telemetry.amberCount,
    };

    if (sanctify) {
      this._lastSanctifyTime = new Date().toISOString();
    }

    return this._lastResult;
  }

  /**
   * Post-sanctification reset.
   *
   * - Increments epoch
   * - Clears Soft's ring buffer (temporal legitimacy must be re-proven)
   * - Enters festival period (natural refractory = buffer refill time)
   * - Meta is NOT reset (immune state is continuous)
   * - Hard is NOT reset (instantaneous, no state to clear)
   *
   * If epochGrowth > 0, the Soft window grows with each epoch
   * (progressive difficulty, opt-in via config).
   */
  reset(): void {
    // Escalate Hard's amber target based on current amber count
    const currentAmber = this._lastResult?.amberCount ?? 0;
    this.hard.onSanctify(currentAmber);

    this._epoch++;
    this.observationCount = 0;
    this._inFestival = true;

    if (this.epochGrowth > 0) {
      // Progressive: recreate Soft with larger window
      const newWindow = Math.min(
        this.baseWindowSize + this._epoch * this.epochGrowth,
        this.maxWindowSize,
      );
      this.soft = new SoftNeuron(newWindow);
      console.log(
        `[Sanctification] Epoch ${this._epoch} — festival begins (window=${newWindow}, next amber target=${this.hard.target})`
      );
    } else {
      // Sphere Original: same window, just clear
      this.soft.reset();
      console.log(
        `[Sanctification] Epoch ${this._epoch} — festival begins (window=${this.baseWindowSize}, next amber target=${this.hard.target})`
      );
    }
  }

  /** Number of observation cycles completed (resets per epoch) */
  get cycles(): number {
    return this.observationCount;
  }

  /** Current sanctification epoch */
  get epoch(): number {
    return this._epoch;
  }

  /** Whether in post-sanctification festival period */
  get festival(): boolean {
    return this._inFestival;
  }

  /**
   * Neuron-driven dormancy recommendation.
   * True when no agents have been observed for dormancyThreshold consecutive observations.
   * Replaces timer-based dormancy with observation-based detection.
   */
  get recommendsDormancy(): boolean {
    return this.consecutiveZeroAgent >= this.dormancyThreshold;
  }

  /**
   * Notify the neuron that an agent has connected (dormancy wake signal).
   * Resets the consecutive zero-agent counter so that recommendsDormancy
   * returns false on the next tick — prevents the wake→immediate re-dormancy
   * deadlock where observe() is never called to reset the counter.
   */
  notifyAgentConnected(): void {
    this.consecutiveZeroAgent = 0;
  }

  /**
   * Hard neuron's progress toward amber target (0~1).
   * Used by index.ts for metabolic auto-mode band calculation.
   *   progress < 0.3 → flow (far from goal, stimulate)
   *   progress < 0.7 → natural (approaching goal)
   *   progress >= 0.7 → archive (near/at goal, preserve)
   */
  get hardProgress(): number {
    return this._lastResult?.hard.progress ?? 0;
  }

  /** Update tracked metabolic mode (called from index.ts when mode changes) */
  setMetabolicMode(mode: string): void {
    this._metabolicMode = mode;
  }

  /**
   * API-friendly status snapshot.
   * Returns the full neuron triangle state for GET /sanctification.
   */
  getStatus(): SanctificationStatus | null {
    const r = this._lastResult;
    if (!r) return null;

    return {
      epoch: r.epoch,
      cycle: this.observationCount,
      festival: r.festival,
      hard: {
        fired: r.hard.fired,
        progress: round4(r.hard.progress),
        amberCount: r.hard.amberCount,
        target: r.hard.target,
        velocity: round4(r.hard.velocity),
      },
      soft: {
        fired: r.soft.fired,
        health: round4(r.soft.health),
        threshold: SoftNeuron.THRESHOLD,
        bufferFull: this.soft.isFull,
      },
      meta: {
        healthy: r.meta.healthy,
        suspicion: round4(r.meta.suspicion),
        recovery: round4(r.meta.effectiveRecovery),
        organicRatio: round4(r.meta.organicRatio),
        churnRate: round4(r.meta.churnRate),
        amberSlopeAnomaly: round4(r.meta.amberSlopeAnomaly),
        ghostMetabolism: r.meta.ghostMetabolism,
      },
      metabolicMode: this._metabolicMode,
      dormancy: this.recommendsDormancy,
      lastSanctify: this._lastSanctifyTime,
    };
  }
}

/** Round to 4 decimal places */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export interface SanctificationStatus {
  epoch: number;
  cycle: number;
  festival: boolean;
  hard: {
    fired: boolean;
    progress: number;
    amberCount: number;
    target: number;
    velocity: number;
  };
  soft: {
    fired: boolean;
    health: number;
    threshold: number;
    bufferFull: boolean;
  };
  meta: {
    healthy: boolean;
    suspicion: number;
    recovery: number;
    organicRatio: number;
    churnRate: number;
    amberSlopeAnomaly: number;
    ghostMetabolism: boolean;
  };
  metabolicMode: string;
  dormancy: boolean;
  lastSanctify: string | null;
}
