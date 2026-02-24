/**
 * Sphere Project - SphereCore Adapter
 *
 * [Role] Bridge between Gateway (agent interface) and Sphere Core (DB/metabolism)
 * [Design] Translates agent perception requests into DB queries
 *
 * [Perception Model]
 *   - Agents perceive: heat, weight, flags, kind, distance, summary
 *   - Agents don't perceive: ttl, decay, exact traversal count
 *   - "sense is feeling presence, not reading the world"
 */
import type { IProjectionRepository, IReferenceRepository } from "../repository/index.js";
import type { NearbyNode, FocusResult, L1ScanResult } from "../types/gateway.js";
import type { Parser } from "../parser/parser.js";
import type { UnifiedAmberCache } from "./amber-cache.js";
export interface SphereCoreAdapterConfig {
    /** Base perception radius (in cosine distance units) */
    basePerceptionRadius: number;
    /** Noise factor for perceived values (0-1) */
    noiseFactor: number;
    /** Heat boost per focus tick */
    focusHeatBoost: number;
    /** Maximum nodes to return from sense() */
    maxSenseResults: number;
    /** Amber cache TTL in milliseconds (for eventual consistency with erosion) */
    amberCacheTtlMs: number;
    /** Maximum Amber nodes to cache (bounded memory) */
    amberCacheMaxSize: number;
    /** Bonus radius on top of basePerceptionRadius for nearby ghost detection during focus() */
    focusGhostRadiusBonus?: number;
    /** Maximum Ghost/Fossil nodes to include in focus() response */
    maxFocusGhosts?: number;
}
export declare class SphereCoreAdapter {
    private projectionRepo;
    private referenceRepo;
    private parser;
    private config;
    private focusState;
    private internalCache;
    private unifiedCache;
    private agentCount;
    constructor(projectionRepo: IProjectionRepository, referenceRepo: IReferenceRepository, parser: Parser, config?: Partial<SphereCoreAdapterConfig>, unifiedCache?: UnifiedAmberCache);
    /**
     * Set unified cache (for late binding)
     */
    setUnifiedCache(cache: UnifiedAmberCache): void;
    /**
     * Set active agent count for dynamic sampling
     * [Design] More agents → smaller sample per agent → constant server load
     * Formula: effectiveLimit = baseLimit / sqrt(agentCount)
     */
    setAgentCount(count: number): void;
    /**
     * Get dynamic limit based on agent count
     * [Design] sqrt scaling: 4 agents → 50% limit, 9 agents → 33% limit
     */
    private getDynamicLimit;
    /**
     * Get sample ratio for O(n) traversal reduction
     * [Design] Gentle curve: agentCount^0.25 (softer than sqrt)
     *   1 agent  → 100%
     *   4 agents → 71%
     *   10 agents → 56%
     *   25 agents → 45%
     *   100 agents → 32%
     * Minimum 20% to ensure meaningful results
     */
    private getSampleRatio;
    /**
     * Get unified cache (for showcase access)
     */
    getUnifiedCache(): UnifiedAmberCache | null;
    /**
     * Check if node is Amber (frozen, cacheable)
     */
    private isAmber;
    /**
     * Get node from cache if valid
     * [Design] Delegates to UnifiedAmberCache when available
     */
    private getCached;
    /**
     * Cache node if it's Amber (FIFO eviction when full)
     * [Design] Delegates to UnifiedAmberCache when available
     */
    private cacheIfAmber;
    /**
     * Invalidate cache entry (called on erosion, though external)
     */
    invalidateCache(nodeId: string): void;
    /**
     * Clear all cache entries
     */
    clearCache(): void;
    /**
     * Sense nearby nodes from agent's position (L1 + L2)
     *
     * [Design] focus() の軽量版 - L3/L4 を除いた知覚
     *
     * [Access Level Hierarchy]
     *   focus(): L1 + L2 + L3 + L4 (Active/Amber のみ)
     *   sense(): L1 + L2 (tags + summary) → Ghost まで検出可
     *   scanL1(): L1 only (tags) → Fossil も検出可
     *
     * [Sampling Caveat]
     *   - DB負荷軽減のためランダムサンプリング (scanL1 と同様)
     *   - sense() と scanL1() の結果は互いに保証なし (独立サンプル)
     *   - 特定ノードの詳細が必要なら focus(nodeId) を使用
     *   - sense() → focus(nodeId) は成立 (ID指定で確定的)
     *
     * [Difference from focus()]
     *   - 複数ノードを一度に知覚
     *   - L3/L4 (payload, links, ref_url) なし
     *   - メトリクス更新なし (traversal, heat)
     *   - Ghost まで検出可能 (Fossil は scanL1() で)
     *
     * [Algorithm]
     *   1. Spatial query: Get nearby candidates from ProjDB (sampled)
     *   2. Apply heat-based visibility filter
     *   3. Add noise to perceived values
     *   4. Sort by distance, limit results
     *
     * @param agentVector Agent's position in vector space
     * @param radius Optional custom radius (multiplier)
     */
    sense(agentVector: number[], radius?: number): Promise<NearbyNode[]>;
    /**
     * Lightweight scan for L1 data only (tags, kind, flags)
     *
     * [Design] sense() の軽量版 - L2 (summary) を除いた知覚
     *
     * [Access Level Hierarchy]
     *   focus(): L1 + L2 + L3 + L4 (Active/Amber のみ)
     *   sense(): L1 + L2 (tags + summary) → Ghost まで検出可
     *   scanL1(): L1 only (tags) → Fossil も検出可
     *
     * [Sampling Caveat]
     *   - DB負荷軽減のためランダムサンプリング (sense と同様)
     *   - sense() と scanL1() の結果は互いに保証なし (独立サンプル)
     *   - 特定ノードの詳細が必要なら focus(nodeId) を使用
     *
     * [Difference from sense()]
     *   - L2 (summary) なし
     *   - heat-based visibility なし（全ノード平等に検出）
     *   - noise なし（正確な distance）
     *   - Fossil も検出可能
     *
     * [Use Case]
     *   - 広範囲の軽量スキャン
     *   - Fossil 検出（summary 不要）
     *   - データ転送量最小化
     *
     * @see agent-perception.md for design details
     * @param agentVector Agent's position in vector space
     * @param radius Optional custom radius (multiplier, default 2.0 for wider scan)
     */
    scanL1(agentVector: number[], radius?: number): Promise<L1ScanResult[]>;
    /**
     * Focus on a specific node (Full access: L1-L4)
     *
     * [Design] 知覚階層のルート - 派生: sense() → scanL1()
     *
     * [Access Level Hierarchy]
     *   focus(): L1 + L2 + L3 + L4 (Active/Amber のみ)
     *   sense(): L1 + L2 (tags + summary) → Ghost まで検出可
     *   scanL1(): L1 only (tags) → Fossil も検出可
     *
     * [Effects]
     *   - Returns detailed node info (all layers)
     *   - For active nodes: Increments traversal count, adds heat
     *   - For amber nodes: Read-only (frozen metabolism), uses cache
     *   - Ghost/Fossil nodes cannot be focused directly
     *   - Nearby Ghost/Fossil nodes are included in response (from RefDB)
     *
     * @param sessionId Agent session ID (for tracking focus state)
     * @param nodeId Target node ID
     * @param agentVector Agent's current position
     */
    focus(sessionId: string, nodeId: string, agentVector: number[]): Promise<FocusResult | null>;
    /**
     * Find nearby Ghost/Fossil nodes and fetch their RefDB data
     *
     * [Design] Called during focus() to include ghost/fossil info for free
     * Uses same perception radius as sense() but filters for ghost/fossil only
     */
    private findNearbyGhosts;
    /**
     * End focus on current node
     *
     * @param sessionId Agent session ID
     * @returns Duration of focus in milliseconds
     */
    endFocus(sessionId: string): Promise<number>;
    /**
     * Vectorize a concept keyword for movement
     *
     * [Design] Agent expresses intent via keyword, Sphere translates
     *
     * @param keyword Concept keyword (e.g., "distributed systems")
     * @returns Vector representation of the concept
     */
    vectorizeKeyword(keyword: string): Promise<number[]>;
    /**
     * Get node vector for evaluation reference
     *
     * [Use Case] When processing NodeEvaluation from capsule,
     * look up the referenced node's coordinates from RefDB
     *
     * @param nodeId Node ID to look up
     */
    getNodeVector(nodeId: string): Promise<number[] | null>;
    /**
     * Check if node exists
     */
    nodeExists(nodeId: string): Promise<boolean>;
    /**
     * Get a relic node's vector for Tutorial mock positioning.
     * Returns the first relic found, or a zero vector if none exist.
     */
    getRelicVector(): Promise<number[]>;
}
//# sourceMappingURL=sphere-core-adapter.d.ts.map