/**
 * Sphere Project - Periphery Configuration
 *
 * [Principle] All constants externalized, no hardcoded values
 */
/**
 * Default Periphery Configuration
 */
export const DEFAULT_PERIPHERY_CONFIG = {
    membrane: {
        prohibitedPatterns: ["<script>", "javascript:", "http://", "https://"],
        tagLimitBytes: 64,
    },
    parser: {
        batchSize: 8,
        flushTimeoutMs: 5000,
        embeddingProvider: "mock",
        vectorDimension: 384, // all-MiniLM-L6-v2 default
        modelId: "Xenova/all-MiniLM-L6-v2",
    },
    gatekeeper: {
        maxNodesPerCapsule: 50,
        maxTopTierPerCapsule: 5,
        maxGhostRatio: 0.4,
        maxSummaryLength: 512,
    },
    tagger: {
        topTierCount: 3,
    },
    packer: {
        // Integer scale: h/w threshold 1000, d baseline 1000
        baseHeat: 750, // All nodes start with same baseline heat
        tierWeights: {
            top: 800,
            normal: 500,
            ghost: 200,
        },
        tierTTLs: {
            top: 172800, // 2 days
            normal: 86400, // 1 day
            ghost: 3600, // 1 hour
        },
        standardDecayCoefficient: 1000, // d baseline
        // @deprecated - Use nodeFlags.tierFlags instead (below)
        tierFlags: {
            top: 0x0002, // TemporalLong (top-tier persists longer)
            normal: 0x0000,
            ghost: 0x0000,
        },
        initialMetrics: {
            stayTime: 0,
        },
    },
    incarnationBuffer: {
        batchSize: 32, // ~5エージェント分のノード (5 × 6 = 30 nodes)
        flushIntervalMs: 5000, // 5秒待機でバッチ蓄積 → スループット優先
    },
    server: {
        port: 3001,
        wsPort: 8081,
    },
    perception: {
        targetTotalOps: 100_000, // M = T / (a × D)
        basePerceptionRadius: 1.5, // cosine distance: heat decay 後も十分な知覚範囲
        maxSenseResults: 15, // 控えめに
    },
    session: {
        ttlSeconds: 180, // 3分間のダイブセッション
        warningBeforeEndSeconds: 30, // 終了30秒前に警告
    },
    energy: {
        initial: 100,
        warningThreshold: 10, // 10% で lowEnergy 警告
        costs: {
            scan: 1,
            sense: 3,
            move: 5,
            focus: 10,
            warp: 15,
            evaluate: 3,
        },
    },
    questStore: {
        maxSize: 100,
        showcaseSize: 10,
    },
    amberCache: {
        maxSize: 100,
        showcaseSize: 30,
        showcaseRefreshIntervalMs: 3600000, // 1 hour
        cacheTtlMs: 60000, // 1 minute
    },
    field: {
        updateIntervalTicks: 10,
        targetSampleOps: 50000,
        minSampleSize: 10,
        maxSampleSize: 500,
        intensityDecay: 0.1,
        emptyIntensity: 0,
    },
    forge: {
        // Integer scale: h/w threshold 1000, d baseline 1000
        link: {
            strategy: "midpoint",
            initialTTL: 1000,
            initialHeat: 50,
            initialWeight: 100,
            decayRate: 1000,
        },
        environmental: {
            strategy: "statistical",
            initialTTL: 500,
            initialHeat: 50,
            initialWeight: 400,
            decayRate: 1500,
        },
    },
    externalServices: {
        allowed: [
            // Observatory service - environmental node generation
            {
                id: "observatory",
                name: "Pulse Observatory",
                secret: process.env.OBSERVATORY_SECRET || "observatory-secret-key",
                allowedEndpoints: ["forge/link", "forge/environmental"],
            },
        ],
    },
    // =========================================================================
    // 16-bit NodeFlags - SINGLE SOURCE OF TRUTH
    // =========================================================================
    nodeFlags: {
        // Static flags assigned at node creation (by Packer)
        tierFlags: {
            top: 0x0002, // TemporalLong - top tier nodes persist longer
            normal: 0x0000, // No special flags
            ghost: 0x0000, // No special flags (Ephemeral could be added)
        },
        // Dynamic flag thresholds (by Arbiter)
        dynamicThresholds: {
            hotHeatThreshold: 150, // heat > 150 → Hot flag
        },
    },
};
//# sourceMappingURL=config.js.map