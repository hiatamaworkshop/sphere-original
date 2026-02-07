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
 * - Decay: 全ノードの Heat/TTL/Fertility を減衰させる
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
/**
 * RenalCore 設定
 * sphere.config.json から読み込むことを想定
 */
export interface RenalCoreConfig {
    alpha: number;
    heatDecayFactor: number;
    weightDecayFactor: number;
    amberHeatThreshold: number;
    amberWeightThreshold: number;
    fossilHeatThreshold: number;
    erosionHeatThreshold: number;
    ghostHeatThreshold: number;
    ghostTTLMultiplier: number;
    planktonConversionRate: number;
    fertilityDecayRate: number;
    pauseIdleThreshold: number;
    pauseErosionBoost: number;
}
/**
 * RenalCore クラス
 *
 * 純粋な物理エンジン。Decay のみを担当。
 */
export declare class RenalCore {
    projectionDB: Map<string, SphereNode>;
    referenceDB: Map<string, ReferenceRecord>;
    spatialFields: Map<string, SpatialField>;
    config: RenalCoreConfig;
    tickCount: number;
    idleTickCount: number;
    lastNodeCount: number;
    agentCount: number;
    constructor(projectionDB: Map<string, SphereNode>, referenceDB: Map<string, ReferenceRecord>, spatialFields: Map<string, SpatialField>, config: RenalCoreConfig);
    /**
     * 1心拍 (Tick) の実行
     * 物理的減衰のみを実行
     */
    tick(loadFactor: number): void;
    /**
     * Decay: 全ノードの Heat/TTL と Fertility を減衰させる
     *
     * [Design] 物理的減衰を一括処理
     * - Node: Heat, TTL
     * - SpatialField: Fertility
     */
    private processDecay;
    /**
     * Telemetry: 統計ログ (observation interval と同期して呼ばれる)
     */
    logTelemetry(): void;
    /**
     * Update agent count for Dormancy feature
     * [Design] When agentCount drops to 0, RenalCore can enter dormancy mode
     */
    updateAgentCount(count: number): void;
}
//# sourceMappingURL=renalcore.d.ts.map