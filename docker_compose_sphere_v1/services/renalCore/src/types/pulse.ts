/**
 * Sphere Project - Pulse Packet Definition
 *
 * [Role] Environmental Broadcast Signal
 * [Purpose] UDP broadcast for external Observatory monitoring
 *
 * PulsePacket は RenalCore の代謝状態を外部に放射する信号。
 * Observatory がこれを受信し、統計的異常を検知する。
 */

/**
 * Pulse Signal: 環境信号の4要素
 */
export interface PulseSignal {
  /** Attractant: プランクトン密度 + Amber残存熱 */
  a: number;
  /** Repellent: Ghost密集度 + 解釈エラー率 */
  r: number;
  /** Density: 実体密度（Active/Relic ノード数） */
  d: number;
  /** Flow: 前回Tickからの流動性（ノード増減率） */
  f: number;
}

/**
 * Pulse Flags: 環境異常フラグ (bitfield)
 */
export const PulseFlag = {
  /** Burst: 急激な熱上昇 */
  Burst: 0x01,
  /** Thorn: Ghost過多 */
  Thorn: 0x02,
  /** Bloom: Amber結晶化発生中 */
  Bloom: 0x04,
  /** Drought: 活性ノード不足 */
  Drought: 0x08,
  /** Storm: 大量蒸発発生中 */
  Storm: 0x10,
} as const;

export type PulseFlagValue = (typeof PulseFlag)[keyof typeof PulseFlag];

/**
 * Pulse Packet: 外部観測用の環境放射信号
 *
 * RenalCore が N tick ごとに UDP broadcast する。
 * 軽量なバイナリ形式での送信も視野に入れた設計。
 */
export interface PulsePacket {
  /** Sphere ID: 発信元スフィアの識別子 (multi-sphere Observatory 用) */
  sphereId: string;
  /** Cell ID: 空間セルの識別子 */
  cid: string;
  /** Timestamp: パケット生成時刻 */
  ts: number;
  /** Signal: 環境信号 */
  sig: PulseSignal;
  /** Flags: 環境異常フラグ */
  flg: number;
  /** Tick: RenalCore の現在 tick 数 */
  tick: number;
}

/**
 * Pulse Config: パルス送信設定
 */
export interface PulseConfig {
  /** 有効/無効 */
  enabled: boolean;
  /** UDP 送信ポート */
  port: number;
  /** 送信間隔 (tick 数) */
  intervalTicks: number;
  /** ブロードキャストアドレス */
  broadcastAddress: string;
}

/**
 * Pulse Statistics: 統計情報（Observatory用）
 */
export interface PulseStatistics {
  /** 受信パケット数 */
  packetCount: number;
  /** 平均 Attractant */
  avgAttractant: number;
  /** 平均 Repellent */
  avgRepellent: number;
  /** 平均 Density */
  avgDensity: number;
  /** 平均 Flow */
  avgFlow: number;
  /** 標準偏差 */
  stdDev: {
    a: number;
    r: number;
    d: number;
    f: number;
  };
  /** 最終受信時刻 */
  lastReceived: number;
}
