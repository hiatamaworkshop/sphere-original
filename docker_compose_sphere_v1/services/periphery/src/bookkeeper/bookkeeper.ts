/**
 * Sphere Project - Bookkeeper
 *
 * [Role] DB Controller / Abstraction Layer
 * [Pattern] Repository Pattern - depends on interfaces, not implementations
 *
 * [Principle 1] Single Source of Truth:
 *   All incarnation starts from RefDB. No node exists in ProjDB without relic_id.
 *
 * [Principle 2] Hash Link:
 *   ID is content hash, enabling automatic deduplication.
 *
 * [Principle 5] Pheromone Feedback:
 *   Only ProjDB is mutable. RefDB is only synced on Amber ascension.
 */

import type { SphereNode, ReferenceRecord } from "@sphere/renal-core";
import { NodeFlag } from "@sphere/renal-core";
import type { NodeEvaluation } from "../types/capsule.js";
import type {
  IReferenceRepository,
  IProjectionRepository,
  ISpatialFieldRepository,
} from "../repository/index.js";
// NOTE: FlagUpdate is architectural anchor - Arbiter boundary type for future flag rewriting
import {
  Arbiter,
  type TransitionQueue,
  type FlagUpdate as _FlagUpdate,
  type CrystallizationResult,
} from "../arbiter/arbiter.js";

/**
 * Evaluation Config (2-Layer Architecture)
 *
 * [Design] Agent provides intuitive 0-10 scores, computation layer adjusts impact
 *   - coefficients: delta = (input - neutral) × coefficient
 *   - maturityPreWeight: lifecycle-based multiplier on coefficients (future)
 */
export interface EvaluationConfig {
  neutral: number;
  coefficients: { h: number; w: number; d: number };
  amberMaxHeat: number;
  maturityPreWeight?: {
    young?:  { h: number; w: number; d: number };
    mature?: { h: number; w: number; d: number };
    elder?:  { h: number; w: number; d: number };
  };
}

export class Bookkeeper {
  // === Flux Seep: 対流因子による局所 TTL 染み出し ===
  // [Design] 分解地点の position に flux を蓄積し、近傍ノードの TTL にわずかずつ還元する
  // [Performance] 疎な Map — 分解イベントのたびにエントリ生成、閾値以下で自然消滅
  private static readonly SEEP_RATE = 0.02;       // pool の 2% を 1 ノードに滴下
  private static readonly SEEP_SAMPLE_N = 3;       // サイクルあたりサンプル数
  private static readonly SEEP_DECAY = 0.995;      // 毎サイクル 0.5% 蒸発
  private static readonly SEEP_MIN_FLUX = 0.1;     // この値以下でエントリ削除
  private static readonly SEEP_RADIUS = 1.0;       // queryNearby の cosine distance 上限

  private fluxPool: Map<string, { position: number[]; amount: number }> = new Map();

  private static readonly DEFAULT_EVAL_CONFIG: EvaluationConfig = {
    neutral: 5,
    coefficients: { h: 5, w: 2, d: 5 },
    amberMaxHeat: 500,
  };

  constructor(
    private projectionRepo: IProjectionRepository,
    private referenceRepo: IReferenceRepository,
    private spatialRepo: ISpatialFieldRepository,
    private evalConfig: EvaluationConfig = Bookkeeper.DEFAULT_EVAL_CONFIG,
  ) {}

  /**
   * Ingest nodes: RefDB first, then ProjDB projection
   * [Principle 1] All incarnation starts from RefDB
   *
   * @param nodes SphereNodes with content-hash IDs
   */
  public async ingest(nodes: SphereNode[]): Promise<void> {
    // [Log] ベクトル情報サマリー - 受肉結果確認用
    const vectorized = nodes.filter(n => n.vector.length > 0);
    const emptyVec = nodes.filter(n => n.vector.length === 0);
    const dim = vectorized[0]?.vector.length ?? 0;
    console.log(
      `[Bookkeeper] ingest_start nodes=${nodes.length} vectorized=${vectorized.length}(dim=${dim}) empty=${emptyVec.length}`
    );

    for (const node of nodes) {
      // === Phase 1: RefDB (Soul) ===
      // Check for existing record (deduplication via hash)
      const exists = await this.referenceRepo.exists(node.id);

      if (!exists) {
        // Create new ReferenceRecord (kind matches SphereNode.kind)
        // [Design] RefDB records the initial state of the node with all L1-L4 data
        const refRecord: ReferenceRecord = {
          id: node.id,              // ProjDBとの連携キー（コンテンツハッシュ）
          timestamp: node.timestamp,
          kind: "active",
          payload: {
            // L1: Header
            tags: node.payload?.tags,
            // L2: Summary
            summary: node.payload?.summary,
            // L3: Content
            content: node.payload?.content,
            // L4: References
            sourceNodeId: node.payload?.sourceNodeId,
            links: node.payload?.links,
            ref_url: node.payload?.ref_url,
          },
          snapshot: {
            vector: node.vector,
            weight: node.metrics.w,
            heat: node.metrics.h,
            decay: node.metrics.d,
            flags: node.metrics.flg,
          },
        };
        await this.referenceRepo.create(refRecord);

        // [Log] RefDB新規作成 - ベクトル次元含む
        console.log(
          `[Bookkeeper] refdb_create id=${node.id.slice(0, 8)} vec=${node.vector.length > 0 ? node.vector.length : "empty"}`
        );
      } else {
      }

      // === Phase 2: ProjDB (Body) ===
      // [Design] ProjDB stores L1+L2 only for fast perception (scanL1/sense)
      // L3+L4 (content, references) are RefDB-only, retrieved via focus()
      const projectedNode: SphereNode = {
        id: node.id,
        kind: node.kind,
        vector: node.vector,
        payload: {
          // L1: Header
          tags: node.payload?.tags,
          // L2: Summary
          summary: node.payload?.summary,
          // L3+L4: NOT stored in ProjDB (retrieved from RefDB on focus)
        },
        metrics: node.metrics,
        timestamp: node.timestamp,
      };
      await this.projectionRepo.set(node.id, projectedNode);
    }

    const refCount = await this.referenceRepo.count();
    const projCount = await this.projectionRepo.count();

    // [Log] Ingestサマリー
    console.log(`[Bookkeeper] ingest_end nodes=${nodes.length} refdb=${refCount} projdb=${projCount}`);
  }

  // ============================================================
  // Arbiter Integration: Execute State Transitions
  // ============================================================

  /**
   * Apply state transitions from Arbiter queue
   *
   * [Design] Arbiter queues transitions, Bookkeeper executes
   * - Arbiter は node.kind を変更しない（判定のみ）
   * - Bookkeeper が node.kind を変更し、DB を更新する
   *
   * @param queue TransitionQueue from Arbiter.observe()
   */
  /**
   * Default TTL for revived nodes (normal tier)
   * [Note] Should match sphere.config.json packer.tierTTLs.normal
   */
  private static readonly REVIVAL_TTL = 86400;

  /**
   * Default heat for Amber nodes (on ascension)
   * [Design] Relic (baseHeat×0.4 ≈ 300) より高い初期値で発見されやすく
   * ただし floor ではない — 低評価で erosionHeatThreshold (100) まで落ちれば Erosion 発動
   * 代謝凍結 (SystemCore) により自然減衰はない。heat 変動は評価のみ
   */
  private static readonly AMBER_DEFAULT_HEAT = 400;

  public async applyTransitions(queue: TransitionQueue): Promise<void> {
    const { shouldAscend, shouldErode, shouldRevive, flagUpdates, crystallizations } = queue;

    // 1. Ascension: Active → Amber
    for (const node of shouldAscend) {
      node.kind = "amber";
      node.metrics.h = Bookkeeper.AMBER_DEFAULT_HEAT;  // heat リセット（sense/scanL1 支配防止）
      node.metrics.flg |= NodeFlag.SystemCore; // 代謝停止 (Frozen metabolism)
      await this.projectionRepo.set(node.id, node);
    }

    // 2. Erosion: Amber → Active
    for (const node of shouldErode) {
      node.kind = "active";
      node.metrics.flg &= ~NodeFlag.SystemCore; // 代謝再開
      await this.projectionRepo.set(node.id, node);
    }

    // 3. Revival: Fossil → Active
    for (const node of shouldRevive) {
      node.kind = "active";
      node.metrics.ttl = Bookkeeper.REVIVAL_TTL;  // TTL リセット（新しい生命）
      node.metrics.flg &= ~NodeFlag.Compressed;   // Compressed フラグ除去
      // h, w, d は維持（評価の蓄積は資産）
      await this.projectionRepo.set(node.id, node);

      console.log(
        `[Bookkeeper] revival id=${node.id.slice(0, 8)} ` +
        `h=${node.metrics.h.toFixed(0)} w=${node.metrics.w.toFixed(0)} ttl=${node.metrics.ttl}`
      );
    }

    // 3. Dynamic Flags: Hot, Hub, Isolated, etc.
    // [Design] resetMetrics: 冷却期間失敗時のペナルティ（デフォルトメトリクスに戻す）
    for (const update of flagUpdates) {
      update.node.metrics.flg = Arbiter.applyFlagUpdate(
        update.node.metrics.flg,
        update
      );

      // Metrics reset on candidate dropout
      if (update.resetMetrics) {
        update.node.metrics.h = update.resetMetrics.h;
        update.node.metrics.w = update.resetMetrics.w;
        update.node.metrics.d = update.resetMetrics.d;
        console.log(
          `[Bookkeeper] dropout_reset id=${update.node.id.slice(0, 8)} ` +
          `h=${update.resetMetrics.h} w=${update.resetMetrics.w} d=${update.resetMetrics.d}`
        );
      }

      await this.projectionRepo.set(update.node.id, update.node);
    }

    const total =
      shouldAscend.length +
      shouldErode.length +
      shouldRevive.length +
      flagUpdates.length;

    if (total > 0) {
      console.log(
        `[Bookkeeper] transitions ascended=${shouldAscend.length} eroded=${shouldErode.length} revived=${shouldRevive.length} flags=${flagUpdates.length}`
      );
    }

    // 5. Crystallization: 吸収されたノードを ProjDB + RefDB から削除
    if (crystallizations.size > 0) {
      const allAbsorbedIds: string[] = [];
      for (const result of crystallizations.values()) {
        allAbsorbedIds.push(...result.absorbedNodeIds);
      }

      // ProjDB から削除
      for (const id of allAbsorbedIds) {
        await this.projectionRepo.delete(id);
      }

      // RefDB から削除
      for (const id of allAbsorbedIds) {
        await this.referenceRepo.delete(id);
      }

      console.log(
        `[Bookkeeper] crystallization_absorbed projdb=${allAbsorbedIds.length} refdb=${allAbsorbedIds.length}`
      );
    }

    // Record ascensions to RefDB (with crystallization data)
    if (shouldAscend.length > 0) {
      await this.recordAscensions(shouldAscend, crystallizations);
    }
  }

  /**
   * Record ascensions: Update RefDB when nodes become Amber
   * [Principle 5] RefDB is synced on Amber ascension
   *
   * [Design] All nodes have RefDB entries from ingest
   *   - Active nodes: created by ingest()
   *   - markAsAmber updates kind to "amber" and snapshot
   *   - crystallization data is stored in payload.crystallization
   *
   * @param nodes SphereNodes that have transitioned to amber
   * @param crystallizations Map of nodeId → CrystallizationResult
   */
  public async recordAscensions(
    nodes: SphereNode[],
    crystallizations: Map<string, CrystallizationResult> = new Map()
  ): Promise<void> {
    if (nodes.length === 0) return;

    for (const node of nodes) {
      const snapshot = {
        vector: node.vector,
        weight: node.metrics.w,
        heat: node.metrics.h,
        decay: node.metrics.d,
        flags: node.metrics.flg,
      };

      // Get crystallization data if available
      const crystallization = crystallizations.get(node.id)?.data;

      await this.referenceRepo.markAsAmber(node.id, snapshot, crystallization);

      const crystalInfo = crystallization
        ? ` crystal=${crystallization.absorbed.length}/${crystallization.totalCount}`
        : "";
      console.log(
        `[Bookkeeper] refdb_ascend id=${node.id.slice(0, 8)} heat=${node.metrics.h.toFixed(3)} weight=${node.metrics.w.toFixed(3)}${crystalInfo}`
      );
    }

    console.log(`[Bookkeeper] ascensions_recorded count=${nodes.length}`);
  }

  /**
   * Get current database stats
   */
  public async getStats() {
    return {
      projectionNodes: await this.projectionRepo.count(),
      referenceRecords: await this.referenceRepo.count(),
      spatialCells: await this.spatialRepo.count(),
      fluxPoolSize: this.fluxPool.size,
    };
  }

  // ============================================================
  // Cleaner Fish Integration
  // ============================================================

  /**
   * Apply ghostification results from cleaner fish
   * [Principle] Cleaner fish does not touch DB, Bookkeeper does
   *
   * [Design] Active → Ghost (Access Level L4 → L3)
   *   - TTL continues decreasing (not frozen)
   *   - Only summary + tags are publicly accessible
   *
   * @param ghostNodes Ghost nodes generated by cleaner fish
   */
  public async applyGhostification(ghostNodes: SphereNode[]): Promise<void> {
    if (ghostNodes.length === 0) return;

    await this.projectionRepo.batchSet(ghostNodes);

    console.log(
      `[Bookkeeper] projdb_ghostify count=${ghostNodes.length}`
    );
  }

  /**
   * Apply fossilization results from cleaner fish
   * [Principle] Cleaner fish does not touch DB, Bookkeeper does
   *
   * [Design] Ghost → Fossil (Access Level L3 → L2)
   *   - TTL frozen (stops decreasing)
   *   - Only tags are publicly accessible
   *
   * @param fossilNodes Fossil nodes generated by cleaner fish
   */
  public async applyFossilization(fossilNodes: SphereNode[]): Promise<void> {
    if (fossilNodes.length === 0) return;

    await this.projectionRepo.batchSet(fossilNodes);

    console.log(
      `[Bookkeeper] projdb_fossilize count=${fossilNodes.length}`
    );
  }

  /**
   * Apply decomposition results from cleaner fish
   * [Principle] Delete from both ProjDB and RefDB, add flux to SpatialField
   * [Design] decompose = 完全消去 — ProjDB (body) + RefDB (soul) 両方から削除
   * [Design] flux = 対流因子（分解地点の活動痕跡）。近傍ノードの TTL に染み出す。
   *
   * @param decompositions Decomposition results from cleaner fish
   */
  public async applyDecomposition(
    decompositions: { nodeId: string; cellId: string; fluxGain: number; position: number[] }[]
  ): Promise<void> {
    if (decompositions.length === 0) return;

    const nodeIds = decompositions.map((d) => d.nodeId);

    // Delete nodes from ProjDB
    await this.projectionRepo.batchDelete(nodeIds);

    // Delete nodes from RefDB (decompose = complete erasure)
    for (const id of nodeIds) {
      await this.referenceRepo.delete(id);
    }

    // Update flux in SpatialFields (cell-based, for telemetry)
    const fluxByCell = new Map<string, number>();
    for (const d of decompositions) {
      const current = fluxByCell.get(d.cellId) ?? 0;
      fluxByCell.set(d.cellId, current + d.fluxGain);
    }

    for (const [cellId, fluxGain] of fluxByCell) {
      const field = await this.spatialRepo.get(cellId);
      if (field) {
        field.flux += fluxGain;
        field.lastUpdate = Date.now();
        await this.spatialRepo.set(cellId, field);
      } else {
        await this.spatialRepo.set(cellId, {
          cellId,
          flux: fluxGain,
          nodeCount: 0,
          avgHeat: 0,
          lastUpdate: Date.now(),
        });
      }
    }

    // Populate fluxPool (position-based, for seep mechanism)
    for (const d of decompositions) {
      if (d.fluxGain > 0 && d.position.length > 0) {
        this.fluxPool.set(d.nodeId, {
          position: d.position,
          amount: d.fluxGain,
        });
      }
    }

    console.log(
      `[Bookkeeper] decomposed nodes=${nodeIds.length} cells=${fluxByCell.size} pool=${this.fluxPool.size}`
    );
  }

  // Note: evaporateGhosts() removed - ghost evaporation is now handled by
  // CleanerFish.evaporate() → applyDecomposition() with fluxGain=0

  // ============================================================
  // Flux Seep: 対流因子の染み出し
  // ============================================================

  /**
   * Flux Seep: fluxPool から近傍ノードの TTL にわずかずつ染み出す
   *
   * [Cycle] decompose → fluxPool += { position, amount }
   *         → processFluxSeep (毎 observation) → nearby node.TTL += drip
   *         → pool 自然蒸発 → pool < threshold → エントリ削除
   *
   * [Performance] O(poolSize × queryNearby) — poolSize は数十〜数百に収束
   *   queryNearby は sampleRatio=0.3 で O(n) コストを軽減
   */
  public async processFluxSeep(): Promise<void> {
    if (this.fluxPool.size === 0) return;

    let totalDrip = 0;
    let seepedEntries = 0;
    const toDelete: string[] = [];

    for (const [key, pool] of this.fluxPool) {
      if (pool.amount <= Bookkeeper.SEEP_MIN_FLUX) {
        toDelete.push(key);
        continue;
      }

      // 近傍ノードをランダムサンプル（sampleRatio で走査コスト軽減）
      const nearby = await this.projectionRepo.queryNearby(
        pool.position,
        Bookkeeper.SEEP_SAMPLE_N,
        Bookkeeper.SEEP_RADIUS,
        0.3
      );

      // TTL 滴下
      for (const { node } of nearby) {
        // 代謝停止ノード（Amber, Relic）と環境ノードは対象外
        if (node.metrics.flg & NodeFlag.SystemCore) continue;
        if (node.kind === "environment") continue;

        const drip = pool.amount * Bookkeeper.SEEP_RATE;
        node.metrics.ttl += drip;
        pool.amount -= drip;
        totalDrip += drip;
        await this.projectionRepo.set(node.id, node);
      }

      if (nearby.length > 0) seepedEntries++;

      // 自然蒸発
      pool.amount *= Bookkeeper.SEEP_DECAY;

      // 閾値以下 → 自然消滅
      if (pool.amount < Bookkeeper.SEEP_MIN_FLUX) {
        toDelete.push(key);
      }
    }

    // 枯渇エントリ削除
    for (const key of toDelete) {
      this.fluxPool.delete(key);
    }

    if (totalDrip > 0 || toDelete.length > 0) {
      console.log(
        `[Bookkeeper] flux_seep pool=${this.fluxPool.size} seeped=${seepedEntries} ` +
        `drip=${totalDrip.toFixed(1)} evaporated=${toDelete.length}`
      );
    }
  }

  // ============================================================
  // Evaluation Processing
  // ============================================================

  /**
   * Node Immunity Tracker — Bloom Filter based evaluator diversity detection
   *
   * [Design] reports/SANCTIFICATION_NEURON_DESIGN.md §Node免疫
   * [Principle] Semantic blind: hashes eval delta patterns, never agent identity.
   *
   * Bloom Filter (32bit, 3 hashes):
   *   Input: Δh × Δw bucketed into 6×6 = 36 patterns
   *   Window: OBS_WINDOW observations, then reset
   *   Trigger: saturation < MIN_DIVERSITY → stress spike → immuneMod rise
   *
   * immuneMod (on node struct, persisted in projectionDB):
   *   1.0 = baseline, clamp [0.97, 1.03]
   *   Rise: bookkeeper applies stress spike each observation
   *   Recovery: RenalCore applies 1% per tick toward 1.0 (~6 min half-life)
   */
  private readonly immunityTracker = new NodeImmunityTracker();

  /**
   * Apply evaluations to existing nodes
   *
   * [2-Layer Evaluation Architecture]
   *   Agent layer: Intuitive 0-10 evaluation per metric (neutral = 5)
   *   Computation layer: Coefficients adjust actual impact to ProjDB
   *
   * [Integer Scale] Metrics use integer scale (threshold 1000 for Ascension)
   *   - h: heat, starts at 0, no upper bound
   *   - w: weight, starts at 0, no upper bound
   *   - d: decay, baseline 1000, range ±300
   *
   * [Flow] No buffer needed - direct ProjDB write
   *
   * @param evaluations NodeEvaluation array from capsule
   */
  /**
   * Apply evaluations to existing nodes
   *
   * [2-Layer Evaluation Architecture]
   *   Agent layer: Intuitive 0-10 evaluation per metric (neutral = 5)
   *   Computation layer: Coefficients adjust actual impact to ProjDB
   *
   * [Evaluation Freeze] Candidate フラグ持ちは評価を無視
   *   - Ascension 冷却期間中のノードは評価を受け付けない
   *   - 自然減衰のみで生存を試験する
   *
   * [Integer Scale] Metrics use integer scale (threshold 1000 for Ascension)
   *   - h: heat, starts at 0, no upper bound
   *   - w: weight, starts at 0, no upper bound
   *   - d: decay, baseline 1000, range ±300
   *
   * @param evaluations NodeEvaluation array from capsule
   */
  public async applyEvaluations(evaluations: NodeEvaluation[]): Promise<void> {
    if (evaluations.length === 0) return;

    let applied = 0;
    let notFound = 0;
    let frozen = 0;

    const { h: hCoef, w: wCoef, d: dCoef } = this.evalConfig.coefficients;
    const neutral = this.evalConfig.neutral;

    for (const evaluation of evaluations) {
      const node = await this.projectionRepo.get(evaluation.nodeId);

      if (!node) {
        // Node not found in ProjDB (may have decayed)
        notFound++;
        continue;
      }

      // [Evaluation Freeze] Candidate（昇格冷却中）と Relic/Environment は評価を無視
      // [Note] Amber ノードは SystemCore を持つが評価は受け付ける（代謝停止 ≠ 評価不可）
      if (
        node.metrics.flg & NodeFlag.Candidate ||
        node.kind === "relic" ||
        node.kind === "environment"
      ) {
        frozen++;
        continue;
      }

      // Calculate deltas: (input - neutral) * coefficient
      const hDelta = (evaluation.h - neutral) * hCoef;
      const wDelta = (evaluation.w - neutral) * wCoef;
      const dDelta = (evaluation.d - neutral) * dCoef;

      // Apply changes (h, w have no upper bound; d has soft range around 1000)
      node.metrics.h = Math.max(0, node.metrics.h + hDelta);
      node.metrics.w = Math.max(0, node.metrics.w + wDelta);
      node.metrics.d = Math.max(0, node.metrics.d + dDelta);

      // [Amber Heat Cap] Amber の heat 上限（sense/scanL1 支配防止）
      // 下限なし — 低評価で erosionHeatThreshold (100) まで落ちれば Erosion 発動
      if (node.kind === "amber") {
        node.metrics.h = Math.min(node.metrics.h, this.evalConfig.amberMaxHeat);
      }

      // [Node immunity] Track eval delta pattern in Bloom filter
      this.immunityTracker.addEval(node.id, hDelta, wDelta);

      // Update node in ProjDB
      await this.projectionRepo.set(node.id, node);
      applied++;

      // Debug log for significant changes
      if (Math.abs(hDelta) >= 25 || Math.abs(wDelta) >= 12) {
        console.log(
          `[Bookkeeper] eval_apply id=${node.id.slice(0, 8)} h+=${hDelta} w+=${wDelta} d+=${dDelta.toFixed(2)}`
        );
      }
    }

    // [Node immunity] Tick tracker once per observation cycle for all affected nodes
    for (const nodeId of this.immunityTracker.affectedThisCycle()) {
      const stressDelta = this.immunityTracker.tick(nodeId);
      if (stressDelta > 0) {
        const node = await this.projectionRepo.get(nodeId);
        if (node) {
          const curr = node.metrics.immuneMod ?? 1.0;
          node.metrics.immuneMod = Math.min(1.03, curr + stressDelta);
          await this.projectionRepo.set(nodeId, node);
          console.log(
            `[Bookkeeper] immunity_spike id=${nodeId.slice(0, 8)} immuneMod=${node.metrics.immuneMod.toFixed(4)}`
          );
        }
      }
    }
    this.immunityTracker.endCycle();

    console.log(
      `[Bookkeeper] evaluations applied=${applied} not_found=${notFound} frozen=${frozen}`
    );
  }
}

// ============================================================
// Node Immunity Tracker
// ============================================================

/**
 * Per-node Bloom filter tracking evaluator pattern diversity.
 *
 * Lives in-memory (volatile): resets on restart, which is acceptable
 * since the 2-minute window is short enough that loss is negligible.
 * immuneMod itself persists on the node struct in projectionDB.
 */
class NodeImmunityTracker {
  // Window: reset filter after this many observation cycles
  private static readonly OBS_WINDOW = 12;         // 12 × 10s = 120s
  // Diversity threshold: if fewer than this fraction of 32 bits are set → low diversity
  private static readonly MIN_DIVERSITY = 0.40;
  // Stress spike applied to immuneMod when low diversity detected
  private static readonly HARD_SPIKE = 0.005;      // per firing obs; clamp limits total

  private states = new Map<string, { bits: number; obsCount: number }>();
  private cycleAffected = new Set<string>();

  /** Register one evaluation for a node this cycle. */
  addEval(nodeId: string, hDelta: number, wDelta: number): void {
    let s = this.states.get(nodeId);
    if (!s) {
      s = { bits: 0, obsCount: 0 };
      this.states.set(nodeId, s);
    }
    s.bits |= bloomBits(hDelta, wDelta);
    this.cycleAffected.add(nodeId);
  }

  /** Nodes that received at least one eval this cycle. */
  affectedThisCycle(): Set<string> {
    return this.cycleAffected;
  }

  /**
   * Advance one observation cycle for a node.
   * Returns stress delta to apply to immuneMod (0 or HARD_SPIKE).
   */
  tick(nodeId: string): number {
    const s = this.states.get(nodeId);
    if (!s) return 0;

    s.obsCount++;
    const saturation = popcount32(s.bits) / 32;
    const stress = saturation < NodeImmunityTracker.MIN_DIVERSITY
      ? NodeImmunityTracker.HARD_SPIKE
      : 0;

    if (s.obsCount >= NodeImmunityTracker.OBS_WINDOW) {
      s.bits = 0;
      s.obsCount = 0;
    }
    return stress;
  }

  /** Clear the per-cycle affected set after tick() calls. */
  endCycle(): void {
    this.cycleAffected.clear();
  }
}

// ── Bloom Filter helpers ──────────────────────────────────────

/**
 * Bucket Δh (range ±25) into 6 levels.
 *   0: ≤-17  1: -17~-8  2: -8~0  3: 0~8  4: 8~17  5: >17
 */
function hBucket(dh: number): number {
  if (dh <= -17) return 0;
  if (dh <= -8)  return 1;
  if (dh <= 0)   return 2;
  if (dh <= 8)   return 3;
  if (dh <= 17)  return 4;
  return 5;
}

/**
 * Bucket Δw (range ±10) into 6 levels.
 *   0: ≤-7  1: -7~-3  2: -3~0  3: 0~3  4: 3~7  5: >7
 */
function wBucket(dw: number): number {
  if (dw <= -7) return 0;
  if (dw <= -3) return 1;
  if (dw <= 0)  return 2;
  if (dw <= 3)  return 3;
  if (dw <= 7)  return 4;
  return 5;
}

/**
 * Map pattern index (0–35) to 3 bit positions in a 32-bit filter.
 * Three independent hash functions via prime-offset modular arithmetic.
 */
function bloomBits(dh: number, dw: number): number {
  const p = hBucket(dh) * 6 + wBucket(dw);  // 0–35
  const b1 = p % 32;
  const b2 = (p * 7 + 11) % 32;
  const b3 = (p * 13 + 7) % 32;
  return (1 << b1) | (1 << b2) | (1 << b3);
}

/** Count set bits in a 32-bit integer (Hamming weight). */
function popcount32(n: number): number {
  n = n >>> 0;
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  n = (n + (n >>> 4)) & 0x0f0f0f0f;
  return (n * 0x01010101) >>> 24;
}
