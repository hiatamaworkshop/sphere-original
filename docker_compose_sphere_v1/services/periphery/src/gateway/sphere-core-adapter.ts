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

import type { SphereNode } from "@sphere/renal-core";
import { NodeFlag } from "@sphere/renal-core";
import type { IProjectionRepository, IReferenceRepository } from "../repository/index.js";
// NOTE: Vector, NodeEvaluation are Gateway boundary vocabulary - architectural anchors
import type { NearbyNode, NodeDetail, FocusResult, L1ScanResult, Vector as _Vector } from "../types/gateway.js";
import type { NodeEvaluation as _NodeEvaluation } from "../types/capsule.js";
import type { Parser } from "../parser/parser.js";
import type { UnifiedAmberCache } from "./amber-cache.js";

// ============================================================
// Utility Functions
// ============================================================

/**
 * Cosine similarity between two vectors
 * Returns value in [-1, 1], where 1 = identical direction
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Cosine distance (0 = identical, 2 = opposite)
 */
function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

/**
 * Add perception noise to a value
 * [Philosophy] Agents don't know the truth
 */
function addNoise(value: number, noiseFactor: number = 0.1): number {
  const noise = (Math.random() - 0.5) * 2 * noiseFactor * value;
  return Math.max(0, value + noise);
}

// ============================================================
// Configuration
// ============================================================

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

const DEFAULT_CONFIG: SphereCoreAdapterConfig = {
  basePerceptionRadius: 0.5,  // cosine distance 0.5 = ~60 degrees
  noiseFactor: 0.1,           // 10% noise
  focusHeatBoost: 1.0,        // +1 heat per focus call
  maxSenseResults: 20,        // Max 20 nodes per sense
  amberCacheTtlMs: 60000,     // 1 minute cache for Amber nodes
  amberCacheMaxSize: 100,     // Max 100 Amber nodes in cache
  focusGhostRadiusBonus: 0.1,  // Extra radius on top of basePerceptionRadius for nearby ghost detection
  maxFocusGhosts: 5,          // Max ghost/fossil nodes per focus
};

// ============================================================
// SphereCore Adapter
// ============================================================

export class SphereCoreAdapter {
  private config: SphereCoreAdapterConfig;

  // Track focus state (sessionId -> {nodeId, startTime})
  private focusState: Map<string, { nodeId: string; startTime: number }> = new Map();

  // Amber node cache: Frozen nodes don't change, safe to cache
  // [Design] Amber (Frozen) nodes are metabolism-stopped, ideal for caching
  // [Design] When unifiedCache is provided, delegate to it; otherwise use internal cache
  private internalCache: Map<string, { node: SphereNode; cachedAt: number }> = new Map();
  private unifiedCache: UnifiedAmberCache | null = null;

  // Dynamic sampling: reduce per-agent load as agent count increases
  // [Design] sense/scanL1 are frequent operations, throttle by agent count
  private agentCount: number = 1;

  constructor(
    private projectionRepo: IProjectionRepository,
    private referenceRepo: IReferenceRepository,
    private parser: Parser,
    config: Partial<SphereCoreAdapterConfig> = {},
    unifiedCache?: UnifiedAmberCache
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.unifiedCache = unifiedCache ?? null;
  }

  /**
   * Set unified cache (for late binding)
   */
  setUnifiedCache(cache: UnifiedAmberCache): void {
    this.unifiedCache = cache;
  }

  /**
   * Set active agent count for dynamic sampling
   * [Design] More agents → smaller sample per agent → constant server load
   * Formula: effectiveLimit = baseLimit / sqrt(agentCount)
   */
  setAgentCount(count: number): void {
    this.agentCount = Math.max(1, count);
  }

  /**
   * Get dynamic limit based on agent count
   * [Design] sqrt scaling: 4 agents → 50% limit, 9 agents → 33% limit
   */
  private getDynamicLimit(baseLimit: number): number {
    return Math.max(5, Math.floor(baseLimit / Math.sqrt(this.agentCount)));
  }

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
  private getSampleRatio(): number {
    return Math.max(0.2, 1 / Math.pow(this.agentCount, 0.25));
  }

  /**
   * Get unified cache (for showcase access)
   */
  getUnifiedCache(): UnifiedAmberCache | null {
    return this.unifiedCache;
  }

  // ============================================================
  // Amber Cache: Frozen nodes only
  // ============================================================

  /**
   * Check if node is Amber (frozen, cacheable)
   */
  private isAmber(node: SphereNode): boolean {
    return node.kind === "amber" && (node.metrics.flg & NodeFlag.Frozen) !== 0;
  }

  /**
   * Get node from cache if valid
   * [Design] Delegates to UnifiedAmberCache when available
   */
  private getCached(nodeId: string): SphereNode | null {
    // Use unified cache if available
    if (this.unifiedCache) {
      return this.unifiedCache.get(nodeId);
    }

    // Fallback to internal cache
    const cached = this.internalCache.get(nodeId);
    if (!cached) return null;

    // Check TTL
    if (Date.now() - cached.cachedAt > this.config.amberCacheTtlMs) {
      this.internalCache.delete(nodeId);
      return null;
    }

    return cached.node;
  }

  /**
   * Cache node if it's Amber (FIFO eviction when full)
   * [Design] Delegates to UnifiedAmberCache when available
   */
  private cacheIfAmber(node: SphereNode): void {
    if (!this.isAmber(node)) return;

    // Use unified cache if available
    if (this.unifiedCache) {
      this.unifiedCache.set(node);
      return;
    }

    // Fallback to internal cache
    // FIFO: Evict oldest entry if cache is full
    if (this.internalCache.size >= this.config.amberCacheMaxSize) {
      const oldestKey = this.internalCache.keys().next().value;
      if (oldestKey) {
        this.internalCache.delete(oldestKey);
      }
    }

    this.internalCache.set(node.id, { node, cachedAt: Date.now() });
  }

  /**
   * Invalidate cache entry (called on erosion, though external)
   */
  invalidateCache(nodeId: string): void {
    if (this.unifiedCache) {
      this.unifiedCache.invalidate(nodeId);
    } else {
      this.internalCache.delete(nodeId);
    }
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    if (this.unifiedCache) {
      this.unifiedCache.clear();
    } else {
      this.internalCache.clear();
    }
  }

  // ============================================================
  // Perception: sense() - L1 + L2 (focus の派生)
  // ============================================================

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
  async sense(agentVector: number[], radius: number = 1.0): Promise<NearbyNode[]> {
    const perceptionRadius = this.config.basePerceptionRadius * radius;

    // Dynamic limit based on agent count
    const dynamicLimit = this.getDynamicLimit(this.config.maxSenseResults);

    // Sample ratio for O(n) traversal reduction
    const sampleRatio = this.getSampleRatio();

    // Spatial query: Get candidates within extended radius
    // (wider radius allows heat-based visibility adjustment)
    // [Sampling] sampleRatio reduces traversal cost as agent count increases
    const candidates = await this.projectionRepo.queryNearby(
      agentVector,
      dynamicLimit * 2,  // Get extra candidates for filtering
      perceptionRadius * 2,             // Extended radius for hot nodes
      sampleRatio
    );

    const nearbyNodes: NearbyNode[] = [];

    for (const { node, distance } of candidates) {
      // [Access Level] sense() ⊃ scanL1(): environment のみ不可視
      // Relic = 上位ノード, Fossil = L1のみ (summary なし), Ghost = L2まで
      if (node.kind === "environment") {
        continue;
      }

      // Fossil: no heat-based visibility check (inert, always detectable if in range)
      // Living nodes: high heat extends perception range
      const isFossil = node.kind === "fossil";
      const heatFactor = isFossil ? 0.5 : Math.max(0.5, node.metrics.h / 1000);
      const visibilityRadius = perceptionRadius * heatFactor;

      if (distance <= visibilityRadius) {
        nearbyNodes.push({
          id: node.id,
          distance: addNoise(distance, this.config.noiseFactor),
          // [Access Level] Fossil = L1 only (no summary), others = L1+L2
          summary: isFossil ? "" : (node.payload?.summary ?? "(no summary)"),
          heat: addNoise(node.metrics.h, this.config.noiseFactor),
          weight: addNoise(node.metrics.w, this.config.noiseFactor),
          decay: node.metrics.d,  // d metric for WalkMode (fresh/deep calculation)
          timestamp: node.timestamp,  // For freshness calculation in WalkMode
          kind: node.kind,
          flags: node.metrics.flg,
          tags: node.payload?.tags,
        });
      }
    }

    // Sort by distance (closest first), limit results
    nearbyNodes.sort((a, b) => a.distance - b.distance);
    return nearbyNodes.slice(0, dynamicLimit);
  }

  // ============================================================
  // Lightweight Scan: scanL1() - L1 only (sense の派生)
  // ============================================================

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
  async scanL1(agentVector: number[], radius: number = 2.0): Promise<L1ScanResult[]> {
    const perceptionRadius = this.config.basePerceptionRadius * radius;

    // Dynamic limit based on agent count (scanL1 gets more results than sense)
    const dynamicLimit = this.getDynamicLimit(this.config.maxSenseResults * 2);

    // Sample ratio for O(n) traversal reduction
    const sampleRatio = this.getSampleRatio();

    // Spatial query: Get candidates
    // [Design] Wider radius than sense() for lightweight broad scan
    // [Sampling] sampleRatio reduces traversal cost as agent count increases
    const candidates = await this.projectionRepo.queryNearby(
      agentVector,
      dynamicLimit * 2,  // More candidates for filtering
      perceptionRadius * 2,
      sampleRatio
    );

    const results: L1ScanResult[] = [];

    for (const { node, distance } of candidates) {
      // [Design] L1 only - no heat-based visibility, include Fossil and Relic
      // Relic = 上位ノード (検出可), environment/plankton = 不可視
      if (node.kind === "environment") {
        continue;
      }

      if (distance <= perceptionRadius) {
        results.push({
          id: node.id,
          distance,  // No noise for L1 scan (precise distance for filtering)
          tags: node.payload?.tags ?? [],
          kind: node.kind,
          flags: node.metrics.flg,
        });
      }
    }

    // Sort by distance (closest first)
    results.sort((a, b) => a.distance - b.distance);
    return results.slice(0, dynamicLimit);
  }

  // ============================================================
  // Focus: focus() - L1 + L2 + L3 + L4 (知覚階層のルート)
  // ============================================================

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
  async focus(
    sessionId: string,
    nodeId: string,
    agentVector: number[]
  ): Promise<FocusResult | null> {
    // Try Amber cache first
    let node = this.getCached(nodeId);
    // reserved for future telemetry
    let fromCache = false;

    if (node) {
      fromCache = true;
    } else {
      node = await this.projectionRepo.get(nodeId);
      if (!node) return null;

      // Cache if Amber for future requests
      this.cacheIfAmber(node);
    }

    // [Design] Ghost/Fossil cannot be focused directly
    // Use focus on Active node to get nearby Ghost/Fossil info
    if (node.kind === "ghost" || node.kind === "fossil") {
      console.log(`[SphereCore] focus_rejected: ${node.kind} cannot be focused directly`);
      return null;
    }

    // Track focus state
    this.focusState.set(sessionId, { nodeId, startTime: Date.now() });

    // Update metrics only for non-frozen nodes
    // Amber nodes are frozen - no metabolism updates
    if (!this.isAmber(node)) {
      node.metrics.h += this.config.focusHeatBoost;
      await this.projectionRepo.set(nodeId, node);
    }

    // Calculate distance
    const distance = node.vector?.length
      ? cosineDistance(agentVector, node.vector)
      : 0;

    // === Fetch L3+L4 from RefDB ===
    // [Design] ProjDB has L1+L2 only; RefDB has L3 (content) + L4 (references)
    const refRecord = await this.referenceRepo.get(nodeId);
    const refPayload = refRecord?.payload;

    // Build L4 links array from RefDB
    const links = (refPayload?.links && Array.isArray(refPayload.links))
      ? refPayload.links
      : undefined;

    const mainNode: NodeDetail = {
      id: node.id,
      distance: addNoise(distance, this.config.noiseFactor),
      // L1+L2 from ProjDB (fast access)
      tags: node.payload?.tags ?? [],
      summary: node.payload?.summary ?? "(no summary)",
      heat: addNoise(node.metrics.h, this.config.noiseFactor),
      weight: addNoise(node.metrics.w, this.config.noiseFactor),
      decay: node.metrics.d,  // d metric for WalkMode
      timestamp: node.timestamp,
      kind: node.kind,
      flags: node.metrics.flg,
      // L3: Content from RefDB
      content: refPayload?.content,
      // L4: References from RefDB
      sourceNodeId: refPayload?.sourceNodeId,
      ref_url: refPayload?.ref_url,
      links,
    };

    // === Find nearby Ghost/Fossil nodes ===
    // [Design] Focus cost already paid, include nearby ghosts for free
    const nearbyGhosts = await this.findNearbyGhosts(agentVector, nodeId);

    return {
      node: mainNode,
      nearbyGhosts: nearbyGhosts.length > 0 ? nearbyGhosts : undefined,
    };
  }

  /**
   * Find nearby Ghost/Fossil nodes and fetch their RefDB data
   *
   * [Design] Called during focus() to include ghost/fossil info for free
   * Uses same perception radius as sense() but filters for ghost/fossil only
   */
  private async findNearbyGhosts(
    agentVector: number[],
    excludeNodeId: string
  ): Promise<NodeDetail[]> {
    const perceptionRadius = this.config.basePerceptionRadius + (this.config.focusGhostRadiusBonus ?? 0.1);
    const maxGhosts = this.config.maxFocusGhosts ?? 5;
    const allNodes = await this.projectionRepo.getAll();
    const ghostNodes: { node: SphereNode; distance: number }[] = [];

    for (const node of allNodes) {
      // Only ghost/fossil
      if (node.kind !== "ghost" && node.kind !== "fossil") continue;
      // Exclude the focus target itself
      if (node.id === excludeNodeId) continue;

      const distance = node.vector?.length
        ? cosineDistance(agentVector, node.vector)
        : Infinity;

      if (distance <= perceptionRadius) {
        ghostNodes.push({ node, distance });
      }
    }

    // Sort by distance, limit results
    ghostNodes.sort((a, b) => a.distance - b.distance);
    const selected = ghostNodes.slice(0, maxGhosts);

    // Batch fetch RefDB records for ghosts
    // [Access Level] Ghost = L1+L2 (tags + summary), Fossil = L1 only (tags)
    const ghostDetails: NodeDetail[] = [];
    for (const { node, distance } of selected) {
      const refRecord = await this.referenceRepo.get(node.id);
      const refPayload = refRecord?.payload;
      const isFossil = node.kind === "fossil";

      ghostDetails.push({
        id: node.id,
        distance: addNoise(distance, this.config.noiseFactor),
        tags: refPayload?.tags ?? node.payload?.tags ?? [],
        // Ghost: L2 (summary) available, Fossil: L1 only (no summary)
        summary: isFossil ? "" : (refPayload?.summary ?? node.payload?.summary ?? ""),
        heat: addNoise(node.metrics.h, this.config.noiseFactor),
        weight: addNoise(node.metrics.w, this.config.noiseFactor),
        decay: node.metrics.d,
        timestamp: node.timestamp,
        kind: node.kind,
        flags: node.metrics.flg,
        // L3+L4: Not exposed in nearby list (only via focus on Active/Amber)
        content: undefined,
        sourceNodeId: undefined,
        ref_url: undefined,
        links: undefined,
      });
    }

    return ghostDetails;
  }

  /**
   * End focus on current node
   *
   * @param sessionId Agent session ID
   * @returns Duration of focus in milliseconds
   */
  async endFocus(sessionId: string): Promise<number> {
    const state = this.focusState.get(sessionId);
    if (!state) return 0;

    const duration = Date.now() - state.startTime;

    // Update stayTime on the focused node
    const node = await this.projectionRepo.get(state.nodeId);
    if (node) {
      node.metrics.stayTime = (node.metrics.stayTime ?? 0) + duration;
      await this.projectionRepo.set(state.nodeId, node);
    }

    this.focusState.delete(sessionId);
    return duration;
  }

  // ============================================================
  // Evaluation: evaluate() - DEPRECATED
  // ============================================================

  /**
   * Record evaluation on an existing node
   *
   * @deprecated This method is no longer used in the 2-layer evaluation architecture.
   *
   * [New Design] Evaluations are:
   *   1. Accumulated in session buffer (sphere-context.ts)
   *   2. Included in ExperienceCapsule.evaluations at return time
   *   3. Processed by Bookkeeper.applyEvaluations() with coefficients
   *
   * [Why Deprecated]
   *   - Real-time ProjDB writes removed for unified evaluation path
   *   - Session accumulation → batch ProjDB reflection at return time
   *   - Bookkeeper handles 2-layer coefficient application (h×10, w×5, d×0.01)
   *
   * @param nodeId Target node ID
   * @param score Evaluation score (-1 to 1) - OLD FORMAT
   */
  async evaluate(nodeId: string, score: number): Promise<boolean> {
    console.warn(
      `[SphereCoreAdapter] evaluate() is DEPRECATED. ` +
      `Evaluations should be buffered in session and processed by Bookkeeper at return time.`
    );

    const node = await this.projectionRepo.get(nodeId);
    if (!node) return false;

    // Legacy behavior (kept for compatibility, not recommended)
    const heatDelta = score * 5;  // -5 to +5 range
    node.metrics.h = Math.max(0, Math.min(100, node.metrics.h + heatDelta));

    await this.projectionRepo.set(nodeId, node);
    return true;
  }

  // ============================================================
  // Movement: move()
  // ============================================================

  /**
   * Vectorize a concept keyword for movement
   *
   * [Design] Agent expresses intent via keyword, Sphere translates
   *
   * @param keyword Concept keyword (e.g., "distributed systems")
   * @returns Vector representation of the concept
   */
  async vectorizeKeyword(keyword: string): Promise<number[]> {
    return this.parser.vectorizeTags([keyword]);
  }

  // ============================================================
  // Node Lookup (for evaluations in capsule)
  // ============================================================

  /**
   * Get node vector for evaluation reference
   *
   * [Use Case] When processing NodeEvaluation from capsule,
   * look up the referenced node's coordinates from RefDB
   *
   * @param nodeId Node ID to look up
   */
  async getNodeVector(nodeId: string): Promise<number[] | null> {
    // First try RefDB (original coordinates)
    const refRecord = await this.referenceRepo.get(nodeId);
    if (refRecord?.snapshot?.vector) {
      return refRecord.snapshot.vector;
    }

    // Fallback to ProjDB
    const node = await this.projectionRepo.get(nodeId);
    return node?.vector ?? null;
  }

  /**
   * Check if node exists
   */
  async nodeExists(nodeId: string): Promise<boolean> {
    return this.projectionRepo.exists(nodeId);
  }
}
