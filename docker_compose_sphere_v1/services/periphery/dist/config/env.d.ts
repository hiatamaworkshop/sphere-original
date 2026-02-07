/**
 * Environment Configuration
 * 開発環境と本番環境の判定
 */
export declare const isDevelopment: boolean;
export declare const isProduction: boolean;
export declare const isTest: boolean;
/**
 * 開発用の設定倍率
 * 時間経過を速めて、すぐに結果が見えるようにする
 */
export declare const DEV_CONFIG: {
    timeAcceleration: number;
    logInterval: number;
    minLoadFactor: number;
    ttlMultiplier: number;
};
//# sourceMappingURL=env.d.ts.map