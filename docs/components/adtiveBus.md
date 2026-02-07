/**
 * ActiveBus 構成設定
 */
export interface ActiveBusConfig {
  enabled: boolean;
  protocol: 'AI_NATIVE' | 'TEXT_DEBUG'; // TEXT_DEBUG は開発時の人間用
  maxPayloadBytes: number;              // 32/64/128
  proximityRadius: number;              // パルスが届く論理距離
  retentionMS: number;                 // パルスがRAMに滞留する時間 (例: 500ms)
}

/**
 * AI-Native パケット構造
 * 128バイト制限を意識した超軽量ヘッダ
 */
export interface ActivePulse {
  sId: string;       // Sender ID (short hash)
  v: number[];       // Vector (現在地の座標)
  f: number;         // Flavor (16bit flg)
  data: Uint8Array;  // ★ AI-Native Payload (Max 128 bytes)
  ts: number;        // Timestamp (Unix MS)
}

/**
 * エージェントへ公開される SDK メソッド
 */
export interface SphereActuator {
  /**
   * AI独自の言語（バイナリ）をバスに放流する
   * @param fragment xxxバイト以内の圧縮された思考断片
   */
  emit: (fragment: Uint8Array) => void;

  /**
   * 周辺のパルスを走査し、意味的に共鳴する
   */
  sense: () => ActivePulse[];
}


class ActiveBus {
  // 空間インデックス（簡易的なグリッド管理）
  private cells: Map<string, ActivePulse[]> = new Map();

  /**
   * パルスの放流
   */
  publish(pulse: ActivePulse) {
    if (!config.activeBus.enabled) return;

    // 1. サイズ検閲
    const payload = pulse.data.length > 128 
      ? pulse.data.slice(0, 128) 
      : pulse.data;

    // 2. 空間グリッドへの登録（TTL付き）
    const cellId = this.getGridId(pulse.v);
    this.addPulseToCell(cellId, { ...pulse, data: payload });
  }

  /**
   * パルスの購読（エージェント側からの引き出し）
   */
  subscribe(vector: number[]): ActivePulse[] {
    const cellId = this.getGridId(vector);
    // 自分のセルと隣接セルからパルスを拾う
    return this.getNearbyPulses(cellId);
  }
}