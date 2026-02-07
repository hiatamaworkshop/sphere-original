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
const DEFAULT_CONFIG = {
    maxSize: 100,
    showcaseSize: 30,
    showcaseRefreshIntervalMs: 3600000,
    cacheTtlMs: 60000,
};
// ============================================================
// Unified Amber Cache
// ============================================================
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
export class UnifiedAmberCache {
    entries = new Map();
    showcaseIds = new Set();
    config;
    refreshTimer = null;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    // ============================================================
    // Showcase API (Public)
    // ============================================================
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
    async refreshShowcase(_referenceRepo, projectionDB) {
        // Query all Amber nodes from RefDB
        const amberNodes = [];
        // Iterate over ProjDB to find current Amber nodes
        // (RefDB stores snapshots, but we need current heat values)
        projectionDB.forEach((node) => {
            if (this.isAmber(node)) {
                amberNodes.push(node);
            }
        });
        // Sort by heat descending
        amberNodes.sort((a, b) => b.metrics.h - a.metrics.h);
        // Take top showcaseSize nodes
        const showcaseNodes = amberNodes.slice(0, this.config.showcaseSize);
        // Update showcase IDs
        const newShowcaseIds = new Set();
        for (const node of showcaseNodes) {
            newShowcaseIds.add(node.id);
            // Add to cache
            this.entries.set(node.id, { node, cachedAt: Date.now() });
        }
        // Remove old showcase IDs that are no longer in showcase
        for (const oldId of this.showcaseIds) {
            if (!newShowcaseIds.has(oldId)) {
                // Keep in cache but remove showcase protection
                // (will be evicted via FIFO if needed)
            }
        }
        this.showcaseIds = newShowcaseIds;
        console.log(`[AmberCache] Showcase refreshed: ${showcaseNodes.length} nodes`);
    }
    /**
     * Get showcase entries (L1/L2 only)
     *
     * [Information Levels]
     *   L1: id, kind, heat
     *   L2: summary, tags
     *
     * @returns Showcase entries for amber_showcase message
     */
    getShowcaseEntries() {
        const entries = [];
        this.showcaseIds.forEach((nodeId) => {
            const cached = this.entries.get(nodeId);
            if (cached) {
                entries.push(this.toShowcaseEntry(cached.node));
            }
        });
        // Sort by heat descending
        entries.sort((a, b) => b.heat - a.heat);
        return entries;
    }
    /**
     * Start automatic showcase refresh
     *
     * @param referenceRepo Reference repository
     * @param projectionDB Projection database
     */
    startAutoRefresh(referenceRepo, projectionDB) {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        // Initial refresh
        this.refreshShowcase(referenceRepo, projectionDB);
        // Set up periodic refresh
        this.refreshTimer = setInterval(() => {
            this.refreshShowcase(referenceRepo, projectionDB);
        }, this.config.showcaseRefreshIntervalMs);
        console.log(`[AmberCache] Auto-refresh started (interval: ${this.config.showcaseRefreshIntervalMs}ms)`);
    }
    /**
     * Stop automatic showcase refresh
     */
    stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
            console.log("[AmberCache] Auto-refresh stopped");
        }
    }
    // ============================================================
    // Dynamic API (Internal)
    // ============================================================
    /**
     * Get node from cache
     *
     * @param nodeId Node ID
     * @returns Cached node or null
     */
    get(nodeId) {
        const cached = this.entries.get(nodeId);
        if (!cached)
            return null;
        // Check TTL (unless it's a showcase node)
        if (!this.showcaseIds.has(nodeId)) {
            if (Date.now() - cached.cachedAt > this.config.cacheTtlMs) {
                this.entries.delete(nodeId);
                return null;
            }
        }
        return cached.node;
    }
    /**
     * Add node to cache (for focus optimization)
     *
     * [Design] Only cache Amber nodes (frozen, safe to cache)
     * [Eviction] FIFO for non-showcase entries when full
     *
     * @param node SphereNode to cache
     */
    set(node) {
        // Only cache Amber nodes
        if (!this.isAmber(node))
            return;
        // Already in cache? Update entry
        if (this.entries.has(node.id)) {
            this.entries.set(node.id, { node, cachedAt: Date.now() });
            return;
        }
        // Check capacity
        if (this.entries.size >= this.config.maxSize) {
            this.evictOldest();
        }
        // Add to cache
        this.entries.set(node.id, { node, cachedAt: Date.now() });
    }
    /**
     * Check if node is in cache
     *
     * @param nodeId Node ID
     * @returns True if cached
     */
    has(nodeId) {
        return this.entries.has(nodeId);
    }
    /**
     * Check if node is in showcase
     *
     * @param nodeId Node ID
     * @returns True if in showcase
     */
    isShowcase(nodeId) {
        return this.showcaseIds.has(nodeId);
    }
    /**
     * Invalidate cache entry
     *
     * @param nodeId Node ID to invalidate
     */
    invalidate(nodeId) {
        this.entries.delete(nodeId);
        this.showcaseIds.delete(nodeId);
    }
    /**
     * Clear all cache entries
     */
    clear() {
        this.entries.clear();
        this.showcaseIds.clear();
    }
    /**
     * Get cache statistics
     */
    getStats() {
        const showcase = this.showcaseIds.size;
        const total = this.entries.size;
        return {
            total,
            showcase,
            dynamic: total - showcase,
        };
    }
    // ============================================================
    // Private Helpers
    // ============================================================
    /**
     * Check if node is Amber (frozen, cacheable)
     */
    isAmber(node) {
        // Amber = kind is "amber" AND has Frozen flag
        // NodeFlag.Frozen = 0x0080
        const FROZEN_FLAG = 0x0080;
        return node.kind === "amber" && (node.metrics.flg & FROZEN_FLAG) !== 0;
    }
    /**
     * Convert SphereNode to AmberShowcaseEntry (L1/L2)
     */
    toShowcaseEntry(node) {
        return {
            id: node.id,
            summary: node.payload?.summary ?? "(no summary)",
            kind: node.kind,
            heat: node.metrics.h,
            tags: node.payload?.tags ?? [],
        };
    }
    /**
     * Evict oldest non-showcase entry (FIFO)
     */
    evictOldest() {
        // Find oldest non-showcase entry
        let oldestKey = null;
        let oldestTime = Infinity;
        this.entries.forEach((entry, key) => {
            // Skip showcase entries
            if (this.showcaseIds.has(key))
                return;
            if (entry.cachedAt < oldestTime) {
                oldestTime = entry.cachedAt;
                oldestKey = key;
            }
        });
        if (oldestKey) {
            this.entries.delete(oldestKey);
        }
    }
}
// ============================================================
// Factory Function
// ============================================================
/**
 * Create UnifiedAmberCache instance
 */
export function createAmberCache(config = {}) {
    return new UnifiedAmberCache(config);
}
//# sourceMappingURL=amber-cache.js.map