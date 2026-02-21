/**
 * RenalCore: 心拍と代謝の制御クラス
 *
 * [Principle] 物理法則の執行
 * - 非知性的・決定論的
 * - payload を読まない
 * - 意味論的判断の禁止（metrics のみ）
 * - すべての定数は config から
 *
 * [Single Metabolic Process]
 * - Decay: 全ノードの Heat/TTL/Flux を減衰させる
 *
 * [Removed - Handled by Periphery]
 * - Evaporation: CleanerFish (fossilize/decompose/evaporate)
 * - Erosion: Arbiter.shouldErode() + Bookkeeper.applyTransitions()
 * - Ascension: Arbiter.shouldAscend() + Bookkeeper.applyTransitions()
 * - Ghostification: 削除（Ghost は Packer のみが生成）
 * - LinkGeneration: NodeForge（外部生成）
 * - Pulse Broadcast: PulseBroadcaster（Periphery）
 */

import type { SphereNode } from "./types/sphere_node.js";
import type { ReferenceRecord, SpatialField } from "./core/types.js";
import { NodeFlag } from "./core/types.js";
import {
  computeEffectiveDecayRate,
  computeEffectiveTTLDecay,
  computeEffectiveWeightDecay,
  hasFlag,
} from "./lib/bit_math.js";

/**
 * RenalCore 設定
 * sphere.config.json から読み込むことを想定
 */
export interface RenalCoreConfig {
  // 物理定数
  alpha: number;                      // 宇宙定数: 基本減衰率
  heatDecayFactor: number;            // 熱量減衰係数（毎Tick）
  weightDecayFactor: number;          // 重み減衰係数（毎Tick、heatより緩やか）

  // 代謝閾値
  amberHeatThreshold: number;         // Amber化に必要なHeat閾値
  amberWeightThreshold: number;       // Amber化に必要なWeight閾値
  fossilHeatThreshold: number;        // Fossil化する Heat閾値
  erosionHeatThreshold: number;       // Erosion（Amber→Active）の閾値

  // ゴースト化設定 (未使用だが互換性のため保持)
  ghostHeatThreshold: number;         // Ghost化する Heat閾値
  ghostTTLMultiplier: number;         // Ghost の TTL 減衰倍率

  // 空間管理
  planktonConversionRate: number;     // [Unused] 蒸発時に Flux へ還元する熱量の割合
  fluxDecayRate: number;              // Flux（対流因子）の自然減衰率

  // Pause判定
  pauseIdleThreshold: number;         // Pause判定の Tick 数閾値
  pauseErosionBoost: number;          // Pause時の Erosion 促進倍率
}

/**
 * RenalCore クラス
 *
 * 純粋な物理エンジン。Decay のみを担当。
 */
export class RenalCore {
  // データベース
  projectionDB: Map<string, SphereNode>;
  referenceDB: Map<string, ReferenceRecord>;
  spatialFields: Map<string, SpatialField>;

  // 設定
  config: RenalCoreConfig;

  // 状態
  tickCount: number = 0;
  idleTickCount: number = 0;      // Pause判定用の連続Idle Tick数
  lastNodeCount: number = 0;      // 前回のノード数
  agentCount: number = 0;         // 接続中エージェント数（Dormancy判定用）

  constructor(
    projectionDB: Map<string, SphereNode>,
    referenceDB: Map<string, ReferenceRecord>,
    spatialFields: Map<string, SpatialField>,
    config: RenalCoreConfig
  ) {
    this.projectionDB = projectionDB;
    this.referenceDB = referenceDB;
    this.spatialFields = spatialFields;
    this.config = config;
  }

  /**
   * 1心拍 (Tick) の実行
   * 物理的減衰のみを実行
   */
  tick(loadFactor: number) {
    this.tickCount++;

    // Pause判定: ノード数の変化を監視
    const currentNodeCount = this.projectionDB.size;
    if (currentNodeCount === this.lastNodeCount) {
      this.idleTickCount++;
    } else {
      this.idleTickCount = 0;
    }
    this.lastNodeCount = currentNodeCount;

    // [Telemetry] Tick開始 - 毎秒の心拍ログ（tickCount, 負荷係数, アイドル連続数）
    // console.log(`[RenalCore] tick=${this.tickCount} loadFactor=${loadFactor.toFixed(3)} idle=${this.idleTickCount}`);

    // Decay: 全ノードの Heat/TTL + Flux を減衰させる
    this.processDecay(loadFactor);

    // [Telemetry] observation interval と同期 (10 ticks)
    if (this.tickCount % 10 === 0) {
      this.logTelemetry();
    }
  }

  /**
   * Decay: 全ノードの Heat/TTL と Flux を減衰させる
   *
   * [Design] 物理的減衰を一括処理
   * - Node: Heat, TTL
   * - SpatialField: Flux
   */
  private processDecay(loadFactor: number) {
    // === Node Decay ===
    for (const node of this.projectionDB.values()) {
      // SystemCore フラグがある場合は代謝を停止（relic, environment 等）
      if (hasFlag(node, NodeFlag.SystemCore)) {
        continue;
      }

      // フラグに基づいて実効的なTTL減衰率を計算
      const effectiveTTLDecay = computeEffectiveTTLDecay(
        this.config.alpha * loadFactor,
        node.metrics.flg
      );
      node.metrics.ttl -= effectiveTTLDecay;

      // フラグに基づいて実効的な Heat 減衰を計算
      const effectiveHeatDecay = computeEffectiveDecayRate(
        this.config.heatDecayFactor,
        node.metrics.flg
      );
      // [Node immunity] immuneMod adjusts heat decay rate (body temperature regulation)
      // Bookkeeper sets immuneMod on evaluation; RenalCore applies recovery per tick.
      const immuneMod = node.metrics.immuneMod ?? 1.0;
      node.metrics.h *= (1 - effectiveHeatDecay * immuneMod);
      // Recovery toward 1.0 per tick (half-life ~340 ticks ≈ 6 min from peak)
      if (immuneMod !== 1.0) {
        node.metrics.immuneMod = Math.max(0.97, Math.min(1.03,
          immuneMod + (1.0 - immuneMod) * 0.01
        ));
      }

      // フラグに基づいて実効的な Weight 減衰を計算
      const effectiveWeightDecay = computeEffectiveWeightDecay(
        this.config.weightDecayFactor,
        node.metrics.flg
      );
      node.metrics.w *= (1 - effectiveWeightDecay);

      // [Telemetry] Decay実行時の詳細ログ（サンプリング）
      if (this.tickCount % 10 === 0 && node.id.endsWith("0")) {
        console.log(
          `[RenalCore] decay node=${node.id.slice(0, 8)} ` +
          `ttl=${node.metrics.ttl.toFixed(1)} heat=${node.metrics.h.toFixed(3)} weight=${node.metrics.w.toFixed(1)}`
        );
      }
    }

    // === Spatial Field Decay ===
    // [Cycle] decompose → flux += h×w → decay here → seep to nearby nodes as TTL bonus
    // [Design] flux = 対流因子（分解地点の活動痕跡）。近傍ノードに染み出して消費される。
    for (const field of this.spatialFields.values()) {
      field.flux *= (1 - this.config.fluxDecayRate);
    }
  }

  // =========================================================================
  // [REMOVED] 全ての状態遷移・外部通信は Periphery に移行済み
  // - processEvaporation() → CleanerFish
  // - processErosion() → Arbiter + Bookkeeper
  // - processGhostification() → 削除（Ghost は Packer のみが生成）
  // - processAscension() → Arbiter + Bookkeeper
  // - processLinkGeneration() → NodeForge
  // - processPulseBroadcast() → PulseBroadcaster (Periphery)
  // 詳細: reports/RENALCORE_REFACTOR_MEMO.md
  // =========================================================================

  /**
   * Telemetry: 統計ログ (observation interval と同期して呼ばれる)
   */
  logTelemetry() {
    const stats: Record<string, number> = {};
    for (const node of this.projectionDB.values()) {
      stats[node.kind] = (stats[node.kind] ?? 0) + 1;
    }

    let totalFlux = 0;
    for (const f of this.spatialFields.values()) {
      totalFlux += f.flux;
    }

    console.log(
      `[RenalCore] tick=${this.tickCount} nodes=${this.projectionDB.size} ` +
      `active=${stats["active"] ?? 0} amber=${stats["amber"] ?? 0} ` +
      `fossil=${stats["fossil"] ?? 0} ghost=${stats["ghost"] ?? 0} ` +
      `relic=${stats["relic"] ?? 0} flux=${totalFlux.toFixed(1)}`
    );
  }

  /**
   * Update agent count for Dormancy feature
   * [Design] When agentCount drops to 0, RenalCore can enter dormancy mode
   */
  updateAgentCount(count: number) {
    this.agentCount = count;
  }
}
