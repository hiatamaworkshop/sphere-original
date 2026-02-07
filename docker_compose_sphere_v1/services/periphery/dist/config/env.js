/**
 * Environment Configuration
 * 開発環境と本番環境の判定
 */
export const isDevelopment = process.env.NODE_ENV !== 'production';
export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';
/**
 * 開発用の設定倍率
 * 時間経過を速めて、すぐに結果が見えるようにする
 */
export const DEV_CONFIG = {
    // 時間加速（開発: 3倍速、本番: 1倍速）
    timeAcceleration: isDevelopment ? 3 : 1,
    // ログ間隔（開発: 10tick、本番: 100tick）
    logInterval: isDevelopment ? 10 : 100,
    // loadFactor 下限（開発: 1.0、本番: 0.1）
    minLoadFactor: isDevelopment ? 1.0 : 0.1,
    // TTL 倍率（開発: 0.1倍で短く、本番: 1倍）
    ttlMultiplier: isDevelopment ? 0.1 : 1.0,
};
// 使用例：
// const effectiveTTL = baseTTL * DEV_CONFIG.ttlMultiplier;
// const logEvery = DEV_CONFIG.logInterval;
//# sourceMappingURL=env.js.map