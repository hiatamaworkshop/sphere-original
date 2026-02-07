/**
 * Sphere Project - Global Ambient Field Types
 *
 * [Design] 磁場は揮発性データ、DB に書き込まない
 * [Principle] ノード全体のメトリクスの統計的分布から算出される「気候」
 */
/**
 * Default Field Configuration
 */
export const DEFAULT_FIELD_CONFIG = {
    updateIntervalTicks: 10, // 10 tick (10秒) ごとに更新
    targetSampleOps: 50000, // サンプリング計算負荷目標 (sense/scanL1 用)
    minSampleSize: 10, // 最低10ノード
    maxSampleSize: 500, // 最大500ノード
    minSamplePercent: 0.2, // 最低20%サンプル (気候精度維持)
    intensityDecay: 0.1, // intensity の滑らかさ
    emptyIntensity: 0, // 空なら 0
};
//# sourceMappingURL=types.js.map