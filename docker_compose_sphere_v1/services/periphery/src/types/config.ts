/**
 * Sphere Project - Periphery Configuration
 *
 * [Principle] All constants externalized, no hardcoded values
 */

export interface PeripheryConfig {
  // === Membrane ===
  membrane: {
    prohibitedPatterns: string[];  // Patterns to filter
    tagLimitBytes: number;         // Max tag size in bytes
  };

  // === Parser ===
  parser: {
    batchSize: number;             // Batch size for embedding
    flushTimeoutMs: number;        // Timeout for batching in ms
    embeddingProvider: "mock" | "local";  // Provider type (API prohibited)
    vectorDimension: number;       // Vector dimension (default: 384)
    modelId?: string;              // Model ID for local provider (optional)
  };

  // === Gatekeeper (DEPRECATED) ===
  // NOTE: Gatekeeper now uses Rulebook constraints directly
  // See: services/periphery/src/rulebook/index.ts
  gatekeeper: {
    maxNodesPerCapsule: number;    // DEPRECATED - use Rulebook
    maxTopTierPerCapsule: number;  // DEPRECATED - use Rulebook
    maxGhostRatio: number;         // DEPRECATED - use Rulebook
    maxSummaryLength: number;      // DEPRECATED - use Rulebook
  };

  // === Tagger ===
  tagger: {
    topTierCount: number;          // Number of nodes to mark as top-tier
  };

  // === Packer ===
  packer: {
    baseHeat: number;              // Base heat for all new nodes (agent cannot set)
    tierWeights: {
      top: number;                 // Top-tier weight
      normal: number;              // Normal-tier weight
      ghost: number;               // Ghost-tier weight
    };
    tierTTLs: {
      top: number;                 // Top-tier TTL in seconds
      normal: number;              // Normal-tier TTL in seconds
      ghost: number;               // Ghost-tier TTL in seconds
    };
    standardDecayCoefficient: number;  // Standard decay rate
    /**
     * @deprecated Use nodeFlags.tierFlags instead
     * [Migration] nodeFlags.tierFlags takes priority when set
     */
    tierFlags: {
      top: number;                 // Flags for top-tier
      normal: number;              // Flags for normal-tier
      ghost: number;               // Flags for ghost-tier
    };
    initialMetrics: {
      traversal: number;           // Initial traversal count
      stayTime: number;            // Initial stay time
    };
  };

  // === Incarnation Buffer ===
  incarnationBuffer: {
    batchSize: number;             // Batch size for ingestion
    flushIntervalMs: number;       // Flush interval in ms
  };

  // === Server ===
  server: {
    port: number;                  // HTTP server port
    wsPort?: number;               // WebSocket server port (optional, default: 8081)
  };

  // === Perception (知覚の物理法則) ===
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

  // === Session (Agent Dive Session) ===
  session?: {
    /** セッション時間 (秒) - デフォルト: 180 */
    ttlSeconds: number;
    /** 警告時間 (セッション終了前の秒数) - デフォルト: 30 */
    warningBeforeEndSeconds: number;
  };

  // === Energy (Agent Action Budget) ===
  energy?: {
    /** 初期エネルギー - デフォルト: 100 */
    initial: number;
    /** lowEnergy 警告閾値 (%) - デフォルト: 10 */
    warningThreshold: number;
    /** アクション毎のコスト */
    costs: {
      scan: number;      // デフォルト: 1
      sense: number;     // デフォルト: 3
      move: number;      // デフォルト: 5
      focus: number;     // デフォルト: 10
      warp: number;      // デフォルト: 15
      evaluate: number;  // デフォルト: 3
    };
  };

  // === Quest Store (FIFO, no TTL) ===
  questStore?: {
    /** 最大クエスト数 (default: 100) - FIFO で古いものから押し出し */
    maxSize: number;
    /** Showcase 表示数 (default: 10) */
    showcaseSize: number;
  };

  // === Amber Cache (Unified Showcase + Dynamic) ===
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

  // === Field (Global Ambient Field) ===
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

  // === NodeForge (Internal Node Generation, 整数スケール) ===
  forge?: {
    link?: {
      strategy?: "midpoint" | "weighted_midpoint";
      initialTTL?: number;
      initialHeat?: number;    // 整数: 50
      initialWeight?: number;  // 整数: 100
      decayRate?: number;      // 整数: 1000
    };
    environmental?: {
      strategy?: "statistical" | "cluster_based";
      initialTTL?: number;
      initialHeat?: number;    // 整数: 50
      initialWeight?: number;  // 整数: 400
      decayRate?: number;      // 整数: 1500
    };
  };

  // === External Services (Observatory, etc.) ===
  externalServices?: {
    /** 許可されたサービスのリスト */
    allowed: ExternalServiceConfig[];
  };

  // =========================================================================
  // 16-bit NodeFlags Configuration
  // =========================================================================
  // [Principle] All flag-related settings in one place
  // [Consumers] Tagger, Packer, Arbiter, Physics
  //
  // Flag values (from @sphere/renal-core NodeFlag enum):
  //   0x0001 = Authority   - Decay slows (×0.95)
  //   0x0002 = Freshness   - Heat boost (×1.2)
  //   0x0004 = Catalyst    - Promotes Link formation
  //   0x0008 = Ephemeral   - Decay accelerates (×1.5)
  //   0x0010 = Sticky      - TTL decay resists (×0.8)
  //   0x0020 = Volatile    - TTL decay accelerates (×1.3)
  //   0x0040 = Hot         - Dynamic: heat > threshold
  //   0x0080 = Frozen      - Metabolism suspended (Relic)
  //   0x0100 = Hub         - Dynamic: linkCount > threshold
  //   0x0200 = Isolated    - Dynamic: linkCount <= threshold
  //   0x0400 = Spectral    - Refined path (Ascension)
  //   0x0800 = Constellation - Amber cluster
  //   0x1000 = UserMarked  - Manual importance
  //   0x2000 = SystemCore  - Relic/immutable
  //   0x4000 = Compressed  - Fossilized
  //   0x8000 = Candidate   - Ascension cooling period
  // =========================================================================
  nodeFlags?: {
    /**
     * Static flags assigned at node creation (Packer)
     * [Usage] tierFlags.top is OR'd with Tagger's classificationFlags
     */
    tierFlags: {
      top: number;      // Default: 0x0002 (Freshness)
      normal: number;   // Default: 0x0000
      ghost: number;    // Default: 0x0000
    };

    /**
     * Dynamic flag thresholds (Arbiter)
     * [Usage] Arbiter sets/clears flags based on node state
     */
    dynamicThresholds: {
      /** heat > this → Hot flag ON, heat <= this → Hot flag OFF */
      hotHeatThreshold: number;       // Default: 80
      /** linkCount > this → Hub flag ON */
      hubLinkThreshold: number;       // Default: 5
      /** linkCount <= this → Isolated flag ON (mutually exclusive with Hub) */
      isolatedLinkThreshold: number;  // Default: 0
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
export const DEFAULT_PERIPHERY_CONFIG: PeripheryConfig = {
  membrane: {
    prohibitedPatterns: ["<script>", "javascript:", "http://", "https://"],
    tagLimitBytes: 64,
  },
  parser: {
    batchSize: 8,
    flushTimeoutMs: 5000,
    embeddingProvider: "mock",
    vectorDimension: 384,  // all-MiniLM-L6-v2 default
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
    baseHeat: 750,  // All nodes start with same baseline heat
    tierWeights: {
      top: 800,
      normal: 500,
      ghost: 200,
    },
    tierTTLs: {
      top: 172800,   // 2 days
      normal: 86400,  // 1 day
      ghost: 3600,    // 1 hour
    },
    standardDecayCoefficient: 1000,  // d baseline
    // @deprecated - Use nodeFlags.tierFlags instead (below)
    tierFlags: {
      top: 0x0002,    // Freshness flag
      normal: 0x0000,
      ghost: 0x0000,
    },
    initialMetrics: {
      traversal: 0,
      stayTime: 0,
    },
  },
  incarnationBuffer: {
    batchSize: 32,           // ~5エージェント分のノード (5 × 6 = 30 nodes)
    flushIntervalMs: 5000,   // 5秒待機でバッチ蓄積 → スループット優先
  },
  server: {
    port: 3001,
    wsPort: 8081,
  },
  perception: {
    targetTotalOps: 100_000,  // M = T / (a × D)
    basePerceptionRadius: 1.5,  // cosine distance: heat decay 後も十分な知覚範囲
    maxSenseResults: 15,        // 控えめに
  },
  session: {
    ttlSeconds: 180,              // 3分間のダイブセッション
    warningBeforeEndSeconds: 30,  // 終了30秒前に警告
  },
  energy: {
    initial: 100,
    warningThreshold: 10,  // 10% で lowEnergy 警告
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
    showcaseRefreshIntervalMs: 3600000,  // 1 hour
    cacheTtlMs: 60000,                   // 1 minute
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
      top: 0x0002,      // Freshness - top tier nodes get visibility boost
      normal: 0x0000,   // No special flags
      ghost: 0x0000,    // No special flags (Ephemeral could be added)
    },
    // Dynamic flag thresholds (by Arbiter)
    dynamicThresholds: {
      hotHeatThreshold: 80,       // heat > 80 → Hot flag
      hubLinkThreshold: 5,        // links > 5 → Hub flag
      isolatedLinkThreshold: 0,   // links == 0 → Isolated flag
    },
  },
};
