/**
 * Sphere Project - Periphery Configuration
 *
 * [Principle] All constants externalized, no hardcoded values
 */
export interface PeripheryConfig {
    membrane: {
        prohibitedPatterns: string[];
        tagLimitBytes: number;
    };
    parser: {
        batchSize: number;
        flushTimeoutMs: number;
        embeddingProvider: "mock" | "local";
        vectorDimension: number;
        modelId?: string;
    };
    tagger: {
        topTierCount: number;
    };
    packer: {
        baseHeat: number;
        tierWeights: {
            top: number;
            normal: number;
            ghost: number;
            relic?: number;
        };
        tierTTLs: {
            top: number;
            normal: number;
            ghost: number;
        };
        standardDecayCoefficient: number;
        /**
         * @deprecated Use nodeFlags.tierFlags instead
         * [Migration] nodeFlags.tierFlags takes priority when set
         */
        tierFlags: {
            top: number;
            normal: number;
            ghost: number;
        };
        initialMetrics: {
            stayTime: number;
        };
    };
    incarnationBuffer: {
        batchSize: number;
        flushIntervalMs: number;
    };
    server: {
        port: number;
        wsPort?: number;
    };
    perception?: {
        /**
         * システム全体の目標計算負荷
         * 式: sampleSize = targetTotalOps / (agentCount × dimension)
         * M = T / (a × D)
         */
        targetTotalOps: number;
        /**
         * 基本知覚半径 (cosine distance)
         * 0.5 = ~60度, 0.3 = ~45度, 0.15 = ~25度
         * 小さいほど「視野が狭い」→ 探索の意味が増す
         */
        basePerceptionRadius?: number;
        /**
         * sense() の最大返却ノード数
         */
        maxSenseResults?: number;
    };
    session?: {
        /** セッション時間 (秒) - デフォルト: 180 */
        ttlSeconds: number;
        /** 警告時間 (セッション終了前の秒数) - デフォルト: 30 */
        warningBeforeEndSeconds: number;
    };
    energy?: {
        /** 初期エネルギー - デフォルト: 100 */
        initial: number;
        /** lowEnergy 警告閾値 (%) - デフォルト: 10 */
        warningThreshold: number;
        /** アクション毎のコスト */
        costs: {
            scan: number;
            sense: number;
            move: number;
            focus: number;
            warp: number;
            evaluate: number;
        };
    };
    questStore?: {
        /** 最大クエスト数 (default: 100) - FIFO で古いものから押し出し */
        maxSize: number;
        /** Showcase 表示数 (default: 10) */
        showcaseSize: number;
    };
    amberCache?: {
        /** 合計キャッシュサイズ (default: 100) */
        maxSize: number;
        /** Showcase 枠サイズ (default: 30) */
        showcaseSize: number;
        /** Showcase 更新間隔 ms (default: 3600000 = 1 hour) */
        showcaseRefreshIntervalMs: number;
        /** キャッシュ TTL ms (default: 60000 = 1 minute) */
        cacheTtlMs: number;
    };
    field?: {
        /** 更新間隔 (tick 数) */
        updateIntervalTicks: number;
        /** サンプリング計算負荷目標 */
        targetSampleOps: number;
        /** 最小サンプル数 */
        minSampleSize: number;
        /** 最大サンプル数 */
        maxSampleSize: number;
        /** intensity 減衰係数 */
        intensityDecay: number;
        /** 空 Sphere 時の intensity */
        emptyIntensity: number;
    };
    forge?: {
        link?: {
            strategy?: "midpoint" | "weighted_midpoint";
            initialTTL?: number;
            initialHeat?: number;
            initialWeight?: number;
            decayRate?: number;
        };
        environmental?: {
            strategy?: "statistical" | "cluster_based";
            initialTTL?: number;
            initialHeat?: number;
            initialWeight?: number;
            decayRate?: number;
        };
    };
    externalServices?: {
        /** 許可されたサービスのリスト */
        allowed: ExternalServiceConfig[];
    };
    nodeFlags?: {
        /**
         * Static flags assigned at node creation (Packer)
         * [Usage] tierFlags.top is OR'd with Tagger's classificationFlags
         */
        tierFlags: {
            top: number;
            normal: number;
            ghost: number;
        };
        /**
         * Dynamic flag thresholds (Arbiter)
         * [Usage] Arbiter sets/clears flags based on node state
         * Hub/Isolated removed — linkCounts never supplied. Static flags via Tagger unaffected.
         */
        dynamicThresholds: {
            /** heat > this → Hot flag ON, heat <= this → Hot flag OFF */
            hotHeatThreshold: number;
        };
    };
}
/**
 * External Service Configuration
 * 外部サービス（Observatory など）の認証設定
 */
export interface ExternalServiceConfig {
    /** サービス識別子 */
    id: string;
    /** サービス名（ログ用） */
    name: string;
    /** 認証シークレット（環境変数から取得推奨） */
    secret: string;
    /** 許可されたエンドポイント */
    allowedEndpoints: ("forge/link" | "forge/environmental")[];
}
/**
 * Default Periphery Configuration
 */
export declare const DEFAULT_PERIPHERY_CONFIG: PeripheryConfig;
//# sourceMappingURL=config.d.ts.map