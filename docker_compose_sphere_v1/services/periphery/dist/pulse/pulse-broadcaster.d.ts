/**
 * Sphere Project - Pulse Broadcaster
 *
 * [Role] 環境信号の UDP broadcast
 * [Principle] 外部通信は Periphery が担当
 *
 * RenalCore から移行: 物理エンジンは通信を行わない
 */
import type { SphereNode, SpatialField } from "@sphere/renal-core";
import type { PulseConfig } from "@sphere/renal-core";
/**
 * PulseBroadcaster 設定
 */
export interface PulseBroadcasterConfig {
    pulse: PulseConfig;
    amberHeatThreshold: number;
}
/**
 * PulseBroadcaster: 環境信号の UDP broadcast
 */
export declare class PulseBroadcaster {
    private socket;
    private lastNodeCount;
    private config;
    constructor(config: PulseBroadcasterConfig);
    /**
     * UDP Socket 初期化
     */
    private initSocket;
    /**
     * Socket クローズ
     */
    close(): void;
    /**
     * Pulse broadcast を実行
     *
     * @param tickCount 現在の tick 数
     * @param projectionDB ノードの Map
     * @param spatialFields 空間フィールドの Map
     */
    broadcast(tickCount: number, projectionDB: Map<string, SphereNode>, spatialFields: Map<string, SpatialField>): void;
    /**
     * PulsePacket 生成
     */
    private generatePacket;
    /**
     * PulsePacket を UDP broadcast
     */
    private send;
}
//# sourceMappingURL=pulse-broadcaster.d.ts.map