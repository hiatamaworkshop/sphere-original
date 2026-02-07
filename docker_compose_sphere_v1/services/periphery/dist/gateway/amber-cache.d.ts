/**
 * Sphere Project - Unified Amber Cache
 *
 * [Role] Single cache for Showcase + Dynamic Amber nodes
 *
 * [Design] Based on SHOWCASE_QUEST_DESIGN_MEMO.md v7
 *   - Showcase nodes: Protected from eviction, publicly visible (L1/L2)
 *   - Dynamic nodes: FIFO eviction, internal cache only
 *
 * [Philosophy] 道は歩いて初めてできる
 *   - Showcase shows L1/L2 to incentivize visits
 *   - focus() provides L3/L4 and records co-occurrence
 */
import type { SphereNode } from "@sphere/renal-core";
import type { AmberShowcaseEntry } from "../types/gateway.js";
import type { IReferenceRepository } from "../repository/index.js";
export interface AmberCacheConfig {
    /** Total cache size (default: 100) */
    maxSize: number;
    /** Showcase slot size (default: 30) */
    showcaseSize: number;
    /** Showcase refresh interval ms (default: 3600000 = 1 hour) */
    showcaseRefreshIntervalMs: number;
    /** Cache entry TTL ms (default: 60000 = 1 minute) */
    cacheTtlMs: number;
}
/**
 * UnifiedAmberCache: Single cache for Showcase and Dynamic Amber nodes
 *
 * [Design]
 *   - entries: Map<nodeId, CacheEntry> - All cached nodes
 *   - showcaseIds: Set<nodeId> - Protected from eviction
 *
 * [API]
 *   - Showcase API (public): refreshShowcase(), getShowcaseEntries()
 *   - Dynamic API (internal): get(), set()
 *
 * [Eviction]
 *   - FIFO for non-showcase entries
 *   - Showcase entries are protected
 */
export declare class UnifiedAmberCache {
    private entries;
    private showcaseIds;
    private config;
    private refreshTimer;
    constructor(config?: Partial<AmberCacheConfig>);
    /**
     * Refresh showcase nodes from reference repository
     *
     * [Algorithm]
     *   1. Query RefDB for Amber nodes (kind=amber, Frozen flag)
     *   2. Sort by heat descending
     *   3. Take top showcaseSize nodes
     *   4. Update entries and showcaseIds
     *
     * @param referenceRepo Reference repository (RefDB)
     * @param projectionDB Projection database (ProjDB) for current metrics
     */
    refreshShowcase(_referenceRepo: IReferenceRepository, projectionDB: Map<string, SphereNode>): Promise<void>;
    /**
     * Get showcase entries (L1/L2 only)
     *
     * [Information Levels]
     *   L1: id, kind, heat
     *   L2: summary, tags
     *
     * @returns Showcase entries for amber_showcase message
     */
    getShowcaseEntries(): AmberShowcaseEntry[];
    /**
     * Start automatic showcase refresh
     *
     * @param referenceRepo Reference repository
     * @param projectionDB Projection database
     */
    startAutoRefresh(referenceRepo: IReferenceRepository, projectionDB: Map<string, SphereNode>): void;
    /**
     * Stop automatic showcase refresh
     */
    stopAutoRefresh(): void;
    /**
     * Get node from cache
     *
     * @param nodeId Node ID
     * @returns Cached node or null
     */
    get(nodeId: string): SphereNode | null;
    /**
     * Add node to cache (for focus optimization)
     *
     * [Design] Only cache Amber nodes (frozen, safe to cache)
     * [Eviction] FIFO for non-showcase entries when full
     *
     * @param node SphereNode to cache
     */
    set(node: SphereNode): void;
    /**
     * Check if node is in cache
     *
     * @param nodeId Node ID
     * @returns True if cached
     */
    has(nodeId: string): boolean;
    /**
     * Check if node is in showcase
     *
     * @param nodeId Node ID
     * @returns True if in showcase
     */
    isShowcase(nodeId: string): boolean;
    /**
     * Invalidate cache entry
     *
     * @param nodeId Node ID to invalidate
     */
    invalidate(nodeId: string): void;
    /**
     * Clear all cache entries
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): {
        total: number;
        showcase: number;
        dynamic: number;
    };
    /**
     * Check if node is Amber (frozen, cacheable)
     */
    private isAmber;
    /**
     * Convert SphereNode to AmberShowcaseEntry (L1/L2)
     */
    private toShowcaseEntry;
    /**
     * Evict oldest non-showcase entry (FIFO)
     */
    private evictOldest;
}
/**
 * Create UnifiedAmberCache instance
 */
export declare function createAmberCache(config?: Partial<AmberCacheConfig>): UnifiedAmberCache;
//# sourceMappingURL=amber-cache.d.ts.map