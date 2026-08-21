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
import type { SpatialField } from "./core/types.js";
/**
 * RenalCore 設定
 * sphere.config.json から読み込むことを想定
 */
export interface RenalCoreConfig {
    alpha: number;
    heatDecayFactor: number;
    weightDecayFactor: number;
    ghostTTLMultiplier: number;
    planktonConversionRate: number;
    fluxDecayRate: number;
    pauseIdleThreshold: number;
    pauseErosionBoost: number;
}
/**
 * RenalCore が必要とする最小限のコレクションインターフェース
 * Map<string, T> は構造的にこれを満たす
 */
export interface NodeStore<T> {
    readonly size: number;
    values(): IterableIterator<T>;
}
/**
 * RenalCore クラス
 *
 * 純粋な物理エンジン。Decay のみを担当。
 */
export declare class RenalCore {
    projectionDB: NodeStore<SphereNode>;
    spatialFields: NodeStore<SpatialField>;
    config: RenalCoreConfig;
    tickCount: number;
    idleTickCount: number;
    lastNodeCount: number;
    agentCount: number;
    constructor(projectionDB: NodeStore<SphereNode>, spatialFields: NodeStore<SpatialField>, config: RenalCoreConfig);
    /**
     * 1心拍 (Tick) の実行
     * 物理的減衰のみを実行
     */
    tick(loadFactor: number): void;
    /**
     * Decay: 全ノードの Heat/TTL と Flux を減衰させる
     *
     * [Design] 物理的減衰を一括処理
     * - Node: Heat, TTL
     * - SpatialField: Flux
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