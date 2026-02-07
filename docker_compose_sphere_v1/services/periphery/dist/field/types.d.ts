/**
 * Sphere Project - Global Ambient Field Types
 *
 * [Design] 磁場は揮発性データ、DB に書き込まない
 * [Principle] ノード全体のメトリクスの統計的分布から算出される「気候」
 */
/**
 * Global Ambient Field - スフィア全体の「気候」
 *
 * scanL1() で参照される広範囲の磁場情報
 */
export interface GlobalAmbientField {
    /** 最終更新時刻 (timestamp) */
    updatedAt: number;
    /** 384次元の「平均的な風向き」- 重心ベクトル */
    vector: number[];
    /** 磁場の強さ (0..1) - ノード密度と活性度から計算 */
    intensity: number;
    /** 空間の入れ替わり速度 - 平均 decay の逆数 (0..1) */
    volatility: number;
    /** 16bit フラグの論理和 - 支配的な特性 */
    dominantFlags: number;
    /** サンプル数 (デバッグ用) */
    sampleCount: number;
}
/**
 * Local Field - 局所の「気圧」
 *
 * sense() で計算される近傍ノードからの磁場
 */
export interface LocalField {
    /** エージェント視点での方向ベクトル (正規化済み) */
    direction: number[];
    /** 局所の強さ (0..1) */
    strength: number;
    /** 近傍ノードの 16bit フラグ論理和 */
    flags: number;
    /** 計算に使用したノード数 */
    nodeCount: number;
}
/**
 * Field Info - エージェントに返す磁場情報
 */
export interface FieldInfo {
    /** 全体の気候 (常に利用可能) */
    global: GlobalAmbientField;
    /** 局所の気圧 (sense 後のみ利用可能) */
    local?: LocalField;
}
/**
 * Field Configuration - 磁場計算の設定
 */
export interface FieldConfig {
    /** 更新間隔 (tick 数) - 低頻度で十分 */
    updateIntervalTicks: number;
    /** サンプリング目標負荷 (deprecated: sense/scanL1 用) */
    targetSampleOps: number;
    /** 最小サンプル数 (下限) */
    minSampleSize: number;
    /** 最大サンプル数 (上限) */
    maxSampleSize: number;
    /** 最小サンプル割合 (0.0-1.0) - 気候精度維持のため */
    minSamplePercent: number;
    /** intensity 計算の減衰係数 */
    intensityDecay: number;
    /** 空の Sphere 時のデフォルト intensity */
    emptyIntensity: number;
}
/**
 * Default Field Configuration
 */
export declare const DEFAULT_FIELD_CONFIG: FieldConfig;
//# sourceMappingURL=types.d.ts.map