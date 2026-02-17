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

export class Bookkeeper {
  constructor(
    private projectionRepo: IProjectionRepository,
    private referenceRepo: IReferenceRepository,
    private spatialRepo: ISpatialFieldRepository
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
        // [Principle 2] Same content = same hash = skip (deduplicated)
        // console.log(`[Bookkeeper] refdb_dedup id=${node.id.slice(0, 8)}`);
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
   * Default heat for Amber nodes
   * [Design] Amber は sense/scanL1 を支配しないよう、昇格時に heat をリセット
   * erosionHeat (100) より余裕を持たせ、1回の低評価で即 Erosion を防ぐ
   */
  private static readonly AMBER_DEFAULT_HEAT = 200;

  /**
   * Maximum heat for Amber nodes
   * [Design] 評価で heat が上がりすぎると sense/scanL1 を支配してしまう
   * 上限を設けることで Amber が Active より目立たないようにする
   */
  private static readonly AMBER_MAX_HEAT = 500;

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
   * [Principle] Delete from both ProjDB and RefDB, add fertility to SpatialField
   * [Design] decompose = 完全消去 — ProjDB (body) + RefDB (soul) 両方から削除
   *
   * @param decompositions Decomposition results from cleaner fish
   */
  public async applyDecomposition(
    decompositions: { nodeId: string; cellId: string; fertilityGain: number }[]
  ): Promise<void> {
    if (decompositions.length === 0) return;

    const nodeIds = decompositions.map((d) => d.nodeId);

    // Delete nodes from ProjDB
    await this.projectionRepo.batchDelete(nodeIds);

    // Delete nodes from RefDB (decompose = complete erasure)
    for (const id of nodeIds) {
      await this.referenceRepo.delete(id);
    }

    // Update fertility in SpatialFields
    const fertilityByCell = new Map<string, number>();
    for (const d of decompositions) {
      const current = fertilityByCell.get(d.cellId) ?? 0;
      fertilityByCell.set(d.cellId, current + d.fertilityGain);
    }

    for (const [cellId, fertilityGain] of fertilityByCell) {
      const field = await this.spatialRepo.get(cellId);
      if (field) {
        field.fertility += fertilityGain;
        field.lastUpdate = Date.now();
        await this.spatialRepo.set(cellId, field);
      } else {
        // Create new field if not exists
        await this.spatialRepo.set(cellId, {
          cellId,
          fertility: fertilityGain,
          nodeCount: 0,
          avgHeat: 0,
          lastUpdate: Date.now(),
        });
      }
    }

    console.log(
      `[Bookkeeper] decomposed nodes=${nodeIds.length} refdb=${nodeIds.length} cells=${fertilityByCell.size}`
    );
  }

  // Note: evaporateGhosts() removed - ghost evaporation is now handled by
  // CleanerFish.evaporate() → applyDecomposition() with fertilityGain=0

  // ============================================================
  // Evaluation Processing
  // ============================================================

  /**
   * Evaluation Coefficients (2-Layer Architecture, Integer Scale)
   *
   * [Design] Agent provides intuitive 0-10 scores, computation layer adjusts impact
   *   - h, w: Primary metrics for Ascension (threshold 1000)
   *   - d: TTL decay speed control (baseline 1000, high = early death)
   *
   * [Tuning] Adjust these values to balance evaluation impact
   */
  private static readonly EVAL_COEFFICIENTS = {
    h: 5,       // Heat: (input - 5) * 5 → max ±25 per evaluation
    w: 2,       // Weight: (input - 5) * 2 → max ±10 per evaluation
    d: 5,       // Decay: (input - 5) * 5 → max ±25 per evaluation (affects TTL)
  };
  private static readonly EVAL_NEUTRAL = 5;

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

    const { h: hCoef, w: wCoef, d: dCoef } = Bookkeeper.EVAL_COEFFICIENTS;
    const neutral = Bookkeeper.EVAL_NEUTRAL;

    for (const evaluation of evaluations) {
      const node = await this.projectionRepo.get(evaluation.nodeId);

      if (!node) {
        // Node not found in ProjDB (may have decayed)
        notFound++;
        continue;
      }

      // [Evaluation Freeze] Candidate / SystemCore (Relic) は評価を無視
      if (node.metrics.flg & (NodeFlag.Candidate | NodeFlag.SystemCore)) {
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

      // [Amber Heat Cap] Amber の heat が上がりすぎると sense/scanL1 を支配する
      // 上限を設けることで Active より目立たないようにする
      if (node.kind === "amber") {
        node.metrics.h = Math.min(node.metrics.h, Bookkeeper.AMBER_MAX_HEAT);
      }

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

    console.log(
      `[Bookkeeper] evaluations applied=${applied} not_found=${notFound} frozen=${frozen}`
    );
  }
}
