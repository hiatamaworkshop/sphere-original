/**
 * Sphere Project - Arbiter
 *
 * 審判者（Arbiter）= Sphere空間の監視・判定者
 *
 * [Role] 水面を見下ろし、状態変化を検出・判定する
 * [Principle] RenalCore が物理を実行し、Arbiter が遷移を観測・判定
 *
 * [Responsibilities]
 * 1. observe(): Heat/Weight 閾値を監視 → 昇天/風化の候補をキューイング
 * 2. diff(): 事後の状態変化を検出 → TTL切れノードを CleanerFish へ
 *
 * [Design] キューイングのみ、実行は Bookkeeper が担当
 *   - Arbiter は「判定」のみ（node.kind を変更しない）
 *   - Bookkeeper が「実行」（node.kind を変更 + DB永続化）
 *
 * [Symbiosis]
 *   - Arbiter finds prey → CleanerFish processes (Fossilization/Planktonization)
 *   - Arbiter queues transitions → Bookkeeper executes (Ascension/Erosion)
 */

import type { SphereNode, NodeKind, CrystallizationData } from "@sphere/renal-core";
import { NodeFlag } from "@sphere/renal-core";
import { cosineDistance } from "../lib/vector.js";

/**
 * Arbiter 設定（Ascension/Erosion 閾値）
 */
export interface ArbiterConfig {
  // 昇天閾値
  amberHeatThreshold: number;
  amberWeightThreshold: number;

  // 風化閾値
  erosionHeatThreshold: number;

  // Pause判定
  pauseErosionBoost: number;

  // === Dynamic Flags 閾値 ===
  // Hot: heat がこの閾値を超えると Hot フラグを付与
  hotHeatThreshold: number;
  // Hub: リンク数がこの閾値を超えると Hub フラグを付与
  hubLinkThreshold: number;
  // Isolated: リンク数がこの閾値以下で Isolated フラグを付与
  isolatedLinkThreshold: number;

  // === 遅延観測設定 ===
  // 観測間隔（ミリ秒）- この間隔内のリクエストは統合される
  observeThrottleMs: number;
  // アイドルタイムアウト（ミリ秒）- 最後のリクエストからこの時間後に実行
  observeIdleTimeoutMs: number;

  // === Ascension 冷却期間設定 ===
  // 冷却期間（ミリ秒）- 閾値超過後、この期間生存で Amber 昇格
  ascensionCooldownMs: number;
  // Ascension スコア閾値 - h + w がこれを超えると候補登録
  ascensionScoreThreshold: number;
  // 下方スレッショルド比率 - initialScore × この値を冷却期間中維持必要（例: 0.9）
  lowerThresholdRatio: number;

  // === Dropout Reset 設定（整数スケール）===
  // 冷却期間失敗時にリセットするデフォルトメトリクス
  dropoutResetH?: number;  // default: 0
  dropoutResetW?: number;  // default: 500 (normal tier)
  dropoutResetD?: number;  // default: 1000 (baseline)

  // === Crystallization 設定（結晶化・巻き込み） ===
  // 結晶化機能の有効/無効
  absorptionEnabled?: boolean;
  // 近傍判定の cosine distance 閾値
  absorptionRadius?: number;
  // metrics 継承係数（選出上位の平均 × この値）
  absorptionFactor?: number;
  // 結晶化レコードの最大保存数
  maxAbsorbedNodes?: number;

  // === Revival 設定（Fossil → Active 復活） ===
  // Revival スコア閾値: h × w がこれ以上で復活候補
  revivalThreshold?: number;   // default: 2500
  // Revival d 閾値: d がこれ以下で復活許可
  revivalDThreshold?: number;  // default: 800
  // 捕食保護閾値: h + w がこれ以上で CleanerFish から保護
  protectionThreshold?: number; // default: 100
}

/**
 * Deferred observation options
 */
export interface DeferredObserveOptions {
  isPaused?: boolean;
  linkCounts?: Map<string, number>;
}

/**
 * Snapshot of node states (id → kind, ttl, heat)
 */
export type StateSnapshot = Map<string, { kind: NodeKind; ttl: number; heat: number }>;

/**
 * Dynamic flag update (Arbiter が判定、Bookkeeper が実行)
 */
export interface FlagUpdate {
  node: SphereNode;
  add: number;     // ビット OR で追加する flags
  remove: number;  // ビット AND NOT で除去する flags
  /**
   * Metrics reset on candidate dropout (fake amber punishment)
   * [Design] 冷却期間失敗 → デフォルトメトリクスに戻す
   */
  resetMetrics?: { h: number; w: number; d: number };
}

/**
 * Ascension スコア計算（確定: h + w のみ）
 *
 * [Design] 琥珀化 = 「死を回避する特権」
 *   - d は琥珀化"前"の生存競争（TTL 減衰速度）
 *   - h / w は琥珀化"後"の正当性（資格）
 *   - 世界を分けることで物語も挙動もきれい
 *
 * @param h Heat メトリクス
 * @param w Weight メトリクス
 * @returns Ascension スコア
 */
export function computeAscensionScore(h: number, w: number): number {
  return h + w;
}

/**
 * CrystallizationResult: 結晶化処理の結果（Bookkeeper へ渡す）
 *
 * [Design] 昇天確定時に近傍ノードを吸収した結果
 *   - data: RefDB の payload.crystallization に保存
 *   - absorbedNodeIds: ProjDB + RefDB から削除するノード ID
 */
export interface CrystallizationResult {
  data: CrystallizationData;
  absorbedNodeIds: string[];
}

/**
 * 遷移キュー（Bookkeeper が実行する）
 */
export interface TransitionQueue {
  /** Nodes that should ascend (active → amber) */
  shouldAscend: SphereNode[];
  /** Nodes that should erode (amber → active) */
  shouldErode: SphereNode[];
  /** Nodes that should revive (fossil → active) */
  shouldRevive: SphereNode[];
  /** Dynamic flag updates (Hot, Hub, Isolated, etc.) */
  flagUpdates: FlagUpdate[];
  /** Crystallization results for ascending nodes (nodeId → result) */
  crystallizations: Map<string, CrystallizationResult>;
}

/**
 * 検出結果（事後の状態変化）
 */
export interface StateChanges {
  /** Nodes that became amber (active → amber) */
  ascended: SphereNode[];
  /** Nodes that eroded (amber → active) */
  eroded: SphereNode[];
  /** Nodes with TTL <= 0 (prey for cleaner fish, including ghost) */
  expired: SphereNode[];
}

/**
 * Callback type for deferred observation results
 */
export type ObserveCallback = (queue: TransitionQueue) => void | Promise<void>;

/**
 * CandidateEntry: Ascension 候補のトラッキング
 *
 * [Design] 冷却期間中の候補を監視
 *   - 評価凍結: Candidate フラグ持ちは評価を受け付けない
 *   - 下方スレッショルド: initialScore × lowerThresholdRatio を維持必要
 *   - 動的スコア再計算: 毎 observe() でスコアを再計算
 */
export interface CandidateEntry {
  /** 対象ノード ID */
  nodeId: string;
  /** 候補登録時刻 */
  candidateSince: number;
  /** 登録時の複合スコア */
  initialScore: number;
  /** 下方スレッショルド = initialScore × lowerThresholdRatio */
  lowerThreshold: number;
  /** 参考用: 登録時のメトリクス */
  snapshot: { h: number; w: number; d: number };
}

/**
 * Arbiter: ProjDB を監視し、状態遷移を判定・検出する
 *
 * Usage (Immediate):
 *   const arbiter = new Arbiter(config);
 *   const queue = arbiter.observe(projDB, { isPaused });  // 即時判定
 *   await bookkeeper.applyTransitions(queue);              // 実行
 *
 * Usage (Deferred):
 *   const arbiter = new Arbiter(config);
 *   arbiter.onObserve(async (queue) => {
 *     await bookkeeper.applyTransitions(queue);
 *   });
 *   arbiter.scheduleObserve(projDB, { isPaused });  // 遅延キューイング
 *   // ... 後でまとめて実行される
 */
export class Arbiter {
  private config: ArbiterConfig;

  // === Deferred Observation State ===
  private pendingObserve: {
    projDB: Map<string, SphereNode>;
    options: DeferredObserveOptions;
  } | null = null;
  private observeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastObserveTime: number = 0;
  private observeCallbacks: ObserveCallback[] = [];

  // === Candidate Store (Ascension 冷却期間管理) ===
  // Key: nodeId
  private candidateStore: Map<string, CandidateEntry> = new Map();

  constructor(config: ArbiterConfig) {
    this.config = config;
  }

  // =========================================================================
  // Deferred Observation API
  // =========================================================================

  /**
   * Register callback for deferred observation results
   *
   * [Design] Multiple callbacks can be registered
   * [Usage] Bookkeeper registers to apply transitions
   */
  onObserve(callback: ObserveCallback): void {
    this.observeCallbacks.push(callback);
  }

  /**
   * Schedule deferred observation (throttle + debounce)
   *
   * [Design] Combines throttle and idle timeout:
   *   - If called within throttleMs of last execution, delays
   *   - Waits for idleTimeoutMs of inactivity before executing
   *   - Latest projDB/options are used (overwrites pending)
   *
   * @param projDB - Current projection database
   * @param options - Observation options
   */
  scheduleObserve(
    projDB: Map<string, SphereNode>,
    options: DeferredObserveOptions = {}
  ): void {
    // Update pending observation (latest wins)
    this.pendingObserve = { projDB, options };

    // Clear existing timer
    if (this.observeTimer) {
      clearTimeout(this.observeTimer);
      this.observeTimer = null;
    }

    // Calculate delay
    const now = Date.now();
    const timeSinceLastObserve = now - this.lastObserveTime;
    const throttleRemaining = Math.max(
      0,
      this.config.observeThrottleMs - timeSinceLastObserve
    );
    const delay = Math.max(throttleRemaining, this.config.observeIdleTimeoutMs);

    // Schedule execution
    this.observeTimer = setTimeout(() => {
      this.executeDeferred();
    }, delay);
  }

  /**
   * Execute pending deferred observation immediately
   *
   * [Usage] Force execution without waiting for timeout
   */
  async flushObserve(): Promise<TransitionQueue | null> {
    if (this.observeTimer) {
      clearTimeout(this.observeTimer);
      this.observeTimer = null;
    }
    return this.executeDeferred();
  }

  /**
   * Cancel pending deferred observation
   */
  cancelObserve(): void {
    if (this.observeTimer) {
      clearTimeout(this.observeTimer);
      this.observeTimer = null;
    }
    this.pendingObserve = null;
  }

  /**
   * Check if there's a pending observation
   */
  hasPendingObserve(): boolean {
    return this.pendingObserve !== null;
  }

  /**
   * Execute deferred observation and notify callbacks
   */
  private async executeDeferred(): Promise<TransitionQueue | null> {
    if (!this.pendingObserve) {
      return null;
    }

    const { projDB, options } = this.pendingObserve;
    this.pendingObserve = null;
    this.observeTimer = null;
    this.lastObserveTime = Date.now();

    // Execute observation
    const queue = this.observe(projDB, options);

    // Notify all callbacks
    for (const callback of this.observeCallbacks) {
      try {
        await callback(queue);
      } catch (error) {
        console.error("[Arbiter] Callback error:", error);
      }
    }

    return queue;
  }

  /**
   * Take a snapshot of current node states
   */
  snapshot(projDB: Map<string, SphereNode>): StateSnapshot {
    const snap: StateSnapshot = new Map();
    for (const [id, node] of projDB) {
      snap.set(id, {
        kind: node.kind,
        ttl: node.metrics.ttl,
        heat: node.metrics.h,
      });
    }
    return snap;
  }

  /**
   * Observe ProjDB and queue transitions (判定のみ、実行しない)
   *
   * [Design] Arbiter は node.kind を変更しない
   * - 昇天/風化の「候補」を返すだけ
   * - 動的 flags の更新候補も返す
   * - 実際の変更は Bookkeeper が行う
   *
   * [Ascension Cooldown]
   * - 複合スコア閾値超過 → Candidate フラグ付与（候補登録）
   * - 冷却期間中: 毎 observe() でスコア再計算
   * - 下方スレッショルド未達 → 脱落（Candidate 除去）
   * - 冷却期間完了 + スコア維持 → Amber 昇格
   *
   * @param projDB - Current projection database
   * @param options.isPaused - Whether Sphere is paused
   * @param options.linkCounts - Map of nodeId → link count (for Hub/Isolated detection)
   */
  observe(
    projDB: Map<string, SphereNode>,
    options: { isPaused?: boolean; linkCounts?: Map<string, number> } = {}
  ): TransitionQueue {
    const queue: TransitionQueue = {
      shouldAscend: [],
      shouldErode: [],
      shouldRevive: [],
      flagUpdates: [],
      crystallizations: new Map(),
    };

    const now = Date.now();

    // === Phase 0: 既存候補の監視（脱落/昇格判定）===
    this.monitorCandidates(projDB, now, queue);

    for (const node of projDB.values()) {
      // 1. Erosion 判定: Amber → Active
      if (this.shouldErode(node, options.isPaused)) {
        queue.shouldErode.push(node);
        continue;
      }

      // 2. Revival 判定: Fossil → Active
      if (this.shouldRevive(node)) {
        queue.shouldRevive.push(node);
        continue;
      }

      // 3. Ascension 判定（冷却期間対応）: Active → Candidate → Amber
      // 既に Candidate の場合は monitorCandidates で処理済み
      if (!this.hasFlag(node, NodeFlag.Candidate)) {
        const candidateUpdate = this.checkNewCandidate(node, now);
        if (candidateUpdate) {
          queue.flagUpdates.push(candidateUpdate);
        }
      }

      // 4. Dynamic Flags 更新判定
      const flagUpdate = this.computeFlagUpdate(node, options.linkCounts);
      if (flagUpdate) {
        queue.flagUpdates.push(flagUpdate);
      }
    }

    this.logQueue(queue);
    return queue;
  }

  /**
   * Monitor existing candidates: dropout or promotion
   *
   * [Design] 毎 observe() で全候補をチェック
   *   - スコア再計算: currentScore = (h + w) / (1 + d / 1000)
   *   - currentScore < lowerThreshold → 脱落（Candidate 除去）
   *   - 冷却期間完了 AND currentScore ≥ lowerThreshold → Amber 昇格
   */
  private monitorCandidates(
    projDB: Map<string, SphereNode>,
    now: number,
    queue: TransitionQueue
  ): void {
    const toRemove: string[] = [];

    for (const [nodeId, entry] of this.candidateStore) {
      const node = projDB.get(nodeId);

      // ノードが存在しない（削除済み）→ 候補から除去
      if (!node) {
        toRemove.push(nodeId);
        continue;
      }

      // スコア再計算（h + w のみ、d は TTL 減衰で既に影響済み）
      const currentScore = computeAscensionScore(
        node.metrics.h,
        node.metrics.w
      );

      // 下方スレッショルド未達 → 脱落 + メトリクスリセット
      if (currentScore < entry.lowerThreshold) {
        console.log(
          `[Arbiter] Candidate dropout: ${nodeId.slice(0, 8)} ` +
          `score=${currentScore.toFixed(2)} < threshold=${entry.lowerThreshold.toFixed(2)}`
        );
        // Candidate フラグ除去 + デフォルトメトリクスにリセット（整数スケール）
        queue.flagUpdates.push({
          node,
          add: 0,
          remove: NodeFlag.Candidate,
          resetMetrics: {
            h: this.config.dropoutResetH ?? 0,
            w: this.config.dropoutResetW ?? 500,
            d: this.config.dropoutResetD ?? 1000,
          },
        });
        toRemove.push(nodeId);
        continue;
      }

      // 冷却期間完了チェック
      const elapsed = now - entry.candidateSince;
      if (elapsed >= this.config.ascensionCooldownMs) {
        // ★ 結晶化処理（成功確定後）★
        const crystallization = this.absorbAndCrystallize(node, projDB);
        if (crystallization) {
          queue.crystallizations.set(nodeId, crystallization);
        }

        // 冷却期間完了 + スコア維持 → Amber 昇格
        console.log(
          `[Arbiter] Candidate promoted: ${nodeId.slice(0, 8)} ` +
          `score=${currentScore.toFixed(2)} cooldown=${elapsed}ms`
        );
        // Candidate フラグ除去（Frozen は Bookkeeper が付与）
        queue.flagUpdates.push({
          node,
          add: 0,
          remove: NodeFlag.Candidate,
        });
        queue.shouldAscend.push(node);
        toRemove.push(nodeId);
      }
    }

    // 処理済み候補を削除
    for (const nodeId of toRemove) {
      this.candidateStore.delete(nodeId);
    }
  }

  /**
   * Check if node should become a new candidate
   *
   * [Design] 複合スコアが閾値を超えたら候補登録
   *   - Candidate フラグ付与
   *   - 下方スレッショルド = initialScore × lowerThresholdRatio
   */
  private checkNewCandidate(node: SphereNode, now: number): FlagUpdate | null {
    // active のみ対象
    if (node.kind !== "active") {
      return null;
    }

    // Ascension スコア計算（h + w のみ）
    const score = computeAscensionScore(
      node.metrics.h,
      node.metrics.w
    );

    // 閾値チェック
    if (score < this.config.ascensionScoreThreshold) {
      return null;
    }

    // 候補登録
    const entry: CandidateEntry = {
      nodeId: node.id,
      candidateSince: now,
      initialScore: score,
      lowerThreshold: score * this.config.lowerThresholdRatio,
      snapshot: {
        h: node.metrics.h,
        w: node.metrics.w,
        d: node.metrics.d,
      },
    };
    this.candidateStore.set(node.id, entry);

    console.log(
      `[Arbiter] Candidate registered: ${node.id.slice(0, 8)} ` +
      `score=${score.toFixed(2)} threshold=${entry.lowerThreshold.toFixed(2)}`
    );

    // Candidate フラグ付与
    return {
      node,
      add: NodeFlag.Candidate,
      remove: 0,
    };
  }

  /**
   * Detect changes between snapshot and current state (事後検出)
   *
   * Note: Bookkeeper が遷移を実行した後に呼び出す
   * - 実際に起きた変化を検出
   * - TTL切れノードを CleanerFish へ報告（ghost 含む）
   */
  diff(before: StateSnapshot, projDB: Map<string, SphereNode>): StateChanges {
    const changes: StateChanges = {
      ascended: [],
      eroded: [],
      expired: [],
    };

    for (const [id, prevState] of before) {
      const node = projDB.get(id);
      if (!node) continue;

      const currKind = node.kind;

      // Detect kind transitions
      if (prevState.kind !== currKind) {
        if (currKind === "amber") {
          changes.ascended.push(node);
        } else if (currKind === "active" && prevState.kind === "amber") {
          changes.eroded.push(node);
        }
      }

      // Detect TTL expiration (all mortal nodes including ghost)
      if (prevState.ttl > 0 && node.metrics.ttl <= 0) {
        if (
          node.kind === "active" ||
          node.kind === "fossil" ||
          node.kind === "ghost"
        ) {
          changes.expired.push(node);
        }
      }
    }

    return changes;
  }

  // =========================================================================
  // 判定ロジック
  // =========================================================================

  /**
   * Erosion 判定: Amber → Active
   */
  private shouldErode(node: SphereNode, isPaused?: boolean): boolean {
    if (node.kind !== "amber") return false;

    const effectiveThreshold = isPaused
      ? this.config.erosionHeatThreshold * this.config.pauseErosionBoost
      : this.config.erosionHeatThreshold;

    return node.metrics.h < effectiveThreshold;
  }

  /**
   * Revival 判定: Fossil → Active
   *
   * [Design] h×w 積 + d 安定性ゲート
   *   - h×w >= revivalThreshold (両メトリクス必要、単発評価では達成不可)
   *   - d <= revivalDThreshold (複数回「安定」と評価された)
   *
   * [Philosophy] 一度の評価では復活できない = 複数の関心が必要
   */
  private shouldRevive(node: SphereNode): boolean {
    if (node.kind !== "fossil") return false;

    const revivalThreshold = this.config.revivalThreshold ?? 2500;
    const dThreshold = this.config.revivalDThreshold ?? 800;

    const hwProduct = node.metrics.h * node.metrics.w;

    if (hwProduct >= revivalThreshold && node.metrics.d <= dThreshold) {
      console.log(
        `[Arbiter] Revival candidate: ${node.id.slice(0, 8)} ` +
        `h×w=${hwProduct.toFixed(0)} d=${node.metrics.d.toFixed(0)}`
      );
      return true;
    }

    return false;
  }

  /**
   * Ascension 判定: Active → Amber
   */
  private shouldAscend(node: SphereNode): boolean {
    if (node.kind !== "active") return false;

    const effectiveWeight = this.computeEffectiveWeight(node);

    return (
      node.metrics.h > this.config.amberHeatThreshold &&
      effectiveWeight > this.config.amberWeightThreshold
    );
  }

  // =========================================================================
  // Dynamic Flags 判定
  // =========================================================================

  /**
   * Compute dynamic flag updates for a node
   *
   * [Dynamic Flags]
   *   - Hot: heat > hotHeatThreshold
   *   - Hub: linkCount > hubLinkThreshold
   *   - Isolated: linkCount <= isolatedLinkThreshold
   *
   * @returns FlagUpdate if any changes needed, null otherwise
   */
  private computeFlagUpdate(
    node: SphereNode,
    linkCounts?: Map<string, number>
  ): FlagUpdate | null {
    let add = 0;
    let remove = 0;

    // === Hot Flag ===
    const isHot = node.metrics.h > this.config.hotHeatThreshold;
    const hasHot = this.hasFlag(node, NodeFlag.Hot);

    if (isHot && !hasHot) {
      add |= NodeFlag.Hot;
    } else if (!isHot && hasHot) {
      remove |= NodeFlag.Hot;
    }

    // === Hub / Isolated Flags ===
    if (linkCounts) {
      const linkCount = linkCounts.get(node.id) ?? 0;

      // Hub: many connections
      const isHub = linkCount > this.config.hubLinkThreshold;
      const hasHub = this.hasFlag(node, NodeFlag.Hub);

      if (isHub && !hasHub) {
        add |= NodeFlag.Hub;
      } else if (!isHub && hasHub) {
        remove |= NodeFlag.Hub;
      }

      // Isolated: no connections (mutually exclusive with Hub)
      const isIsolated = linkCount <= this.config.isolatedLinkThreshold;
      const hasIsolated = this.hasFlag(node, NodeFlag.Isolated);

      if (isIsolated && !isHub && !hasIsolated) {
        add |= NodeFlag.Isolated;
      } else if ((!isIsolated || isHub) && hasIsolated) {
        remove |= NodeFlag.Isolated;
      }
    }

    // Return update only if there are changes
    if (add === 0 && remove === 0) {
      return null;
    }

    return { node, add, remove };
  }

  // =========================================================================
  // ユーティリティ
  // =========================================================================

  private hasFlag(node: SphereNode, flag: NodeFlag): boolean {
    return (node.metrics.flg & flag) !== 0;
  }

  /**
   * Apply flag update to node (utility for Bookkeeper)
   *
   * @returns New flags value
   */
  static applyFlagUpdate(currentFlags: number, update: FlagUpdate): number {
    return (currentFlags | update.add) & ~update.remove;
  }

  private computeEffectiveWeight(node: SphereNode): number {
    let weight = node.metrics.w;
    if (this.hasFlag(node, NodeFlag.Hub)) {
      weight *= 1.1;
    }
    return weight;
  }

  private logQueue(queue: TransitionQueue): void {
    const total =
      queue.shouldAscend.length +
      queue.shouldErode.length +
      queue.shouldRevive.length +
      queue.flagUpdates.length;

    if (total === 0) return;

    console.log(
      `[Arbiter] Queue: ` +
        `ascend=${queue.shouldAscend.length} ` +
        `erode=${queue.shouldErode.length} ` +
        `revive=${queue.shouldRevive.length} ` +
        `flags=${queue.flagUpdates.length}`
    );
  }

  /**
   * Log summary of detected changes
   */
  logChanges(changes: StateChanges): void {
    const total =
      changes.ascended.length +
      changes.eroded.length +
      changes.expired.length;

    if (total === 0) return;

    console.log(
      `[Arbiter] Detected: ` +
        `ascended=${changes.ascended.length} ` +
        `eroded=${changes.eroded.length} ` +
        `expired=${changes.expired.length}`
    );
  }

  // =========================================================================
  // Crystallization API (結晶化・巻き込み)
  // =========================================================================

  /**
   * Absorb nearby nodes and crystallize on successful ascension
   *
   * [Design] 冷却期間成功後に実行
   *   - 近傍 = vector 距離が absorptionRadius 以内
   *   - 削除対象 = active, ghost（amber, link, relic は除外）
   *   - 選出対象 = active のみ（ghost は削除のみ）
   *   - 選出 = h + w スコア上位（琥珀化と同じロジック）
   *   - 継承 = 選出上位ノードの平均 h, w × factor を琥珀に加算
   *   - 吸収後は ProjDB + RefDB から削除
   *
   * [Principle] 反対意見でも優れていれば高スコア
   *
   * @param node - 昇天するノード
   * @param projDB - Projection Database
   * @returns CrystallizationResult if any nodes absorbed, null otherwise
   */
  private absorbAndCrystallize(
    node: SphereNode,
    projDB: Map<string, SphereNode>
  ): CrystallizationResult | null {
    // 機能無効 or 設定なし
    if (!this.config.absorptionEnabled) return null;

    const absorptionRadius = this.config.absorptionRadius ?? 0.3;
    const absorptionFactor = this.config.absorptionFactor ?? 0.1;
    const maxAbsorbedNodes = this.config.maxAbsorbedNodes ?? 5;

    // ノードに vector がない場合はスキップ
    if (!node.vector || node.vector.length === 0) return null;

    const activeNodes: SphereNode[] = [];  // 選出対象
    const ghostNodes: SphereNode[] = [];   // 削除のみ

    // 1. 近傍ノード収集
    for (const other of projDB.values()) {
      if (other.id === node.id) continue;

      // amber, link, relic は対象外
      if (other.kind !== "active" && other.kind !== "ghost") continue;

      // vector がないノードはスキップ
      if (!other.vector || other.vector.length === 0) continue;

      // 次元が異なる場合はスキップ
      if (other.vector.length !== node.vector.length) continue;

      const distance = cosineDistance(node.vector, other.vector);
      if (distance > absorptionRadius) continue;

      if (other.kind === "active") {
        activeNodes.push(other);
      } else if (other.kind === "ghost") {
        ghostNodes.push(other);
      }
    }

    const allNearby = [...activeNodes, ...ghostNodes];
    if (allNearby.length === 0) return null;

    // 2. スコア上位を選出（active のみ）+ supportRatio 算出
    const topNodes = activeNodes
      .map(n => ({
        node: n,
        score: n.metrics.h + n.metrics.w,
        supportRatio: n.metrics.h / (n.metrics.h + n.metrics.d || 1),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxAbsorbedNodes);

    // 3. 結晶化レコード生成
    const absorbed = topNodes.map(t => ({
      id: t.node.id,
      score: t.score,
      supportRatio: t.supportRatio,
    }));

    // 4. 選出上位ノードのみから平均算出 → 琥珀に weight のみ継承
    // [Design] heat は継承しない（Amber が sense/scanL1 を支配するのを防ぐ）
    if (topNodes.length > 0) {
      const avgW = topNodes.reduce((sum, t) => sum + t.node.metrics.w, 0) / topNodes.length;
      node.metrics.w += avgW * absorptionFactor;
      // h, d は継承しない
    }

    const totalHeat = allNearby.reduce((sum, n) => sum + n.metrics.h, 0);
    const absorbedNodeIds = allNearby.map(n => n.id);

    console.log(
      `[Arbiter] crystallization: node=${node.id.slice(0, 8)} ` +
      `active=${activeNodes.length} ghost=${ghostNodes.length} ` +
      `selected=${absorbed.length} heat=${totalHeat.toFixed(2)}`
    );

    return {
      data: {
        absorbed,
        totalCount: allNearby.length,
        totalHeat,
      },
      absorbedNodeIds,
    };
  }

}
