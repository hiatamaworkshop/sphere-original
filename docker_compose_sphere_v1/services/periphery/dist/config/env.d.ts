/**
 * Environment Configuration
 * 開発環境と本番環境の判定
 */
export declare const isDevelopment: boolean;
export declare const isProduction: boolean;
export declare const isTest: boolean;
/**
 * 開発用の設定倍率
 *
 * 減衰パラメータは decay-presets.ts の preset で管理。
 * ここには preset でカバーできない開発用設定のみ残す。
 */
export declare const DEV_CONFIG: {
    logInterval: number;
    ttlMultiplier: number;
};
//# sourceMappingURL=env.d.ts.map