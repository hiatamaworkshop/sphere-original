/**
 * Environment Configuration
 * 開発環境と本番環境の判定
 */
export const isDevelopment = process.env.NODE_ENV !== 'production';
export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';
/**
 * 開発用の設定倍率
 *
 * 減衰パラメータは decay-presets.ts の preset で管理。
 * ここには preset でカバーできない開発用設定のみ残す。
 */
export const DEV_CONFIG = {
    // ログ間隔（開発: 10tick、本番: 100tick）
    logInterval: isDevelopment ? 10 : 100,
    // TTL 倍率（開発: 0.1倍で短く、本番: 1倍）— Packer の初期 TTL に適用
    ttlMultiplier: isDevelopment ? 0.1 : 1.0,
};
//# sourceMappingURL=env.js.map