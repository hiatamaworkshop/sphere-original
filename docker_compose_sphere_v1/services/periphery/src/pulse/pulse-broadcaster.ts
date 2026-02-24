/**
 * Sphere Project - Pulse Broadcaster
 *
 * [Role] 環境信号の UDP broadcast
 * [Principle] 外部通信は Periphery が担当
 *
 * RenalCore から移行: 物理エンジンは通信を行わない
 */

import * as dgram from "node:dgram";
import type { SphereNode, SpatialField } from "@sphere/renal-core";
import type { PulsePacket, PulseConfig } from "@sphere/renal-core";
import { PulseFlag } from "@sphere/renal-core";

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
export class PulseBroadcaster {
  private socket: dgram.Socket | null = null;
  private lastNodeCount: number = 0;
  private config: PulseBroadcasterConfig;

  constructor(config: PulseBroadcasterConfig) {
    this.config = config;

    if (config.pulse?.enabled) {
      this.initSocket();
    }
  }

  /**
   * UDP Socket 初期化
   */
  private initSocket(): void {
    console.log("[PulseBroadcaster] Initializing socket...");
    try {
      this.socket = dgram.createSocket("udp4");

      this.socket.on("error", (err) => {
        console.error("[PulseBroadcaster] Socket error:", err);
        this.socket?.close();
        this.socket = null;
      });

      this.socket.on("listening", () => {
        const addr = this.socket?.address();
        console.log(`[PulseBroadcaster] Socket bound to ${addr?.address}:${addr?.port}`);
      });

      // Bind to random port for sending
      this.socket.bind(0, "0.0.0.0", () => {
        console.log(`[PulseBroadcaster] Ready (target: ${this.config.pulse.broadcastAddress}:${this.config.pulse.port})`);
      });
    } catch (err) {
      console.error("[PulseBroadcaster] Failed to create socket:", err);
    }
  }

  /**
   * Socket クローズ
   */
  close(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      console.log("[PulseBroadcaster] Socket closed");
    }
  }

  /**
   * Pulse broadcast を実行
   *
   * @param tickCount 現在の tick 数
   * @param projectionDB ノードの Map
   * @param spatialFields 空間フィールドの Map
   */
  broadcast(
    tickCount: number,
    projectionDB: Map<string, SphereNode>,
    spatialFields: Map<string, SpatialField>
  ): void {
    if (!this.config.pulse?.enabled || !this.socket) return;

    // N tick ごとに broadcast
    if (tickCount % this.config.pulse.intervalTicks !== 0) return;

    const packet = this.generatePacket(tickCount, projectionDB, spatialFields);
    this.send(packet);

    // Flow 計算用に現在のノード数を保存
    this.lastNodeCount = projectionDB.size;
  }

  /**
   * PulsePacket 生成
   */
  private generatePacket(
    tickCount: number,
    projectionDB: Map<string, SphereNode>,
    spatialFields: Map<string, SpatialField>
  ): PulsePacket {
    // 統計収集
    let totalHeat = 0;
    let ghostCount = 0;
    let amberCount = 0;
    let activeRelicCount = 0;
    let amberHeat = 0;

    for (const node of projectionDB.values()) {
      totalHeat += node.metrics.h;
      if (node.kind === "ghost") ghostCount++;
      if (node.kind === "amber") {
        amberCount++;
        amberHeat += node.metrics.h;
      }
      if (node.kind === "active" || node.kind === "relic") activeRelicCount++;
    }

    const nodeCount = projectionDB.size;
    const totalFlux = [...spatialFields.values()].reduce(
      (sum, f) => sum + f.flux, 0
    );

    // Signal 計算
    const sig = {
      a: totalFlux + amberHeat,                              // Attractant
      r: ghostCount / Math.max(nodeCount, 1),                     // Repellent (Ghost比率)
      d: activeRelicCount,                                        // Density
      f: (nodeCount - this.lastNodeCount) / Math.max(this.lastNodeCount, 1), // Flow
    };

    // Flags 計算
    let flg = 0;
    const avgHeat = nodeCount > 0 ? totalHeat / nodeCount : 0;

    // Burst: 平均熱量が閾値を超えた場合
    if (avgHeat > this.config.amberHeatThreshold * 2) {
      flg |= PulseFlag.Burst;
    }

    // Thorn: Ghost比率が高い場合
    if (sig.r > 0.3) {
      flg |= PulseFlag.Thorn;
    }

    // Bloom: Amber化が活発な場合
    if (amberCount > 0 && amberHeat > this.config.amberHeatThreshold * amberCount) {
      flg |= PulseFlag.Bloom;
    }

    // Drought: Active ノードが少ない場合
    if (activeRelicCount < 5) {
      flg |= PulseFlag.Drought;
    }

    // Storm: Flow が大きく負の場合（大量蒸発）
    if (sig.f < -0.2) {
      flg |= PulseFlag.Storm;
    }

    return {
      cid: "global",  // 将来的にはセル単位で分割
      ts: Date.now(),
      sig,
      flg,
      tick: tickCount,
    };
  }

  /**
   * PulsePacket を UDP broadcast
   */
  private send(packet: PulsePacket): void {
    if (!this.socket || !this.config.pulse) return;

    const message = Buffer.from(JSON.stringify(packet));
    const port = this.config.pulse.port;
    const address = this.config.pulse.broadcastAddress;

    this.socket.send(message, port, address, (err) => {
      if (err) {
        console.error("[PulseBroadcaster] Broadcast error:", err);
      }
    });
  }
}
