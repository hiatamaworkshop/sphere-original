/**
 * Sphere Project - Packer
 *
 * [Role] Data Structuring
 * [Function] Convert TaggedNodeSeeds → SphereNodes (incarnation)
 * [Architecture] Split Reference (metadata) and Projection (payload)
 *
 * [Pipeline Position]
 *   Gatekeeper → Parser → Tagger → [Packer] → Bookkeeper
 *
 * [Input from Tagger]
 *   - vector: spatial coordinates (from Parser via summary)
 *   - classificationFlags: 16bit semantic flags (from Tagger via tags)
 *   - tier/rank: classification
 */
import { createHash } from "crypto";
import { DEV_CONFIG } from "../config/env.js";
/**
 * Generate content hash ID from summary text
 * [Principle 2] ID is content hash, not UUID - enables automatic deduplication
 *
 * Note: このIDはRefDBとProjDBの連携キーとして使用される
 *       SphereNode.kind:"relic"（不朽の原典ノード）とは別概念
 *
 * 16 hex chars = 64 bits = sufficient for billions of nodes
 */
function contentHash(content) {
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
export class Packer {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Pack tagged capsule into incarnated SphereNodes
     *
     * [Design] Input from Tagger contains:
     *   - vector: attached by Parser (topTier only)
     *   - classificationFlags: computed by Tagger (16bitTechnique)
     *
     * Normal/Ghost nodes have empty vectors
     *
     * @param tagged Tagged capsule from Tagger
     */
    async pack(tagged) {
        // [Log] 開始 - パッキング開始、入力データ構成
        console.log(`[Packer] >>> start top=${tagged.topTier.length} normal=${tagged.normal.length} ghost=${tagged.ghost.length}`);
        const nodes = [];
        // Process top tier (vectorized)
        for (const seed of tagged.topTier) {
            if (seed.vector.length === 0) {
                console.warn(`[Packer] Missing vector for top-tier node`);
                continue;
            }
            const node = this.buildNode(seed, seed.vector, "top");
            nodes.push(node);
        }
        // Process normal (no vector - use empty)
        for (const seed of tagged.normal) {
            const node = this.buildNode(seed, seed.vector, "normal");
            nodes.push(node);
        }
        // Process ghost (no vector - use empty)
        for (const seed of tagged.ghost) {
            const node = this.buildNode(seed, seed.vector, "ghost");
            nodes.push(node);
        }
        // [Log] 終了 - パッキング完了、SphereNode生成数
        const kindCounts = nodes.reduce((acc, n) => { acc[n.kind] = (acc[n.kind] || 0) + 1; return acc; }, {});
        console.log(`[Packer] <<< end nodes=${nodes.length} active=${kindCounts["active"] || 0} ghost=${kindCounts["ghost"] || 0}`);
        return { nodes };
    }
    /**
     * Build individual SphereNode from seed
     *
     * [Access Level Hierarchy]
     *   L1: tags - header (scanL1)
     *   L2: summary - brief summary (sense)
     *   L3: content - main content (focus)
     *   L4: sourceNodeId, links, ref_url - references (focus)
     *
     * [Flags] Combined from:
     *   - seed.flags: agent-provided
     *   - seed.classificationFlags: Tagger 16bitTechnique
     *   - tierFlags: config-based
     */
    buildNode(seed, vector, tier) {
        // Build payload with L1-L4 data
        const payload = {
            // L1: Header
            tags: seed.tags,
            // L2: Summary
            summary: seed.summary,
        };
        // L3: Content (main data)
        if (seed.content) {
            payload.content = seed.content;
        }
        // L4: References
        if (seed.sourceNodeId) {
            payload.sourceNodeId = seed.sourceNodeId;
        }
        if (seed.links && seed.links.length > 0) {
            payload.links = seed.links;
        }
        if (seed.ref_url) {
            payload.ref_url = seed.ref_url;
        }
        return {
            id: contentHash(seed.summary), // [Principle 2] Hash Link
            kind: tier === "ghost" ? "ghost" : "active",
            vector,
            payload,
            metrics: {
                w: this.getTierWeight(tier),
                d: this.config.packer.standardDecayCoefficient,
                h: this.config.packer.baseHeat, // All nodes start with same baseline (agent cannot set)
                ttl: this.getTierTTL(tier),
                flg: this.getTierFlags(tier, seed.flags, seed.classificationFlags),
                stayTime: this.config.packer.initialMetrics.stayTime,
            },
            timestamp: Date.now(),
        };
    }
    /**
     * Get tier-specific weight
     */
    getTierWeight(tier) {
        switch (tier) {
            case "top":
                return this.config.packer.tierWeights.top;
            case "normal":
                return this.config.packer.tierWeights.normal;
            case "ghost":
                return this.config.packer.tierWeights.ghost;
            default:
                return this.config.packer.tierWeights.normal;
        }
    }
    /**
     * Get tier-specific TTL (in seconds, adjusted for dev/prod)
     */
    getTierTTL(tier) {
        let baseTTL;
        switch (tier) {
            case "top":
                baseTTL = this.config.packer.tierTTLs.top;
                break;
            case "normal":
                baseTTL = this.config.packer.tierTTLs.normal;
                break;
            case "ghost":
                baseTTL = this.config.packer.tierTTLs.ghost;
                break;
            default:
                baseTTL = this.config.packer.tierTTLs.normal;
        }
        // Apply dev/prod multiplier
        return baseTTL * DEV_CONFIG.ttlMultiplier;
    }
    /**
     * Get tier-specific flags (merge with seed flags and classification flags)
     *
     * [Design] Flags are combined from three sources:
     *   1. seedFlags: Original flags from NodeSeed (agent-provided)
     *   2. classificationFlags: 16bit flags from Tagger (16bitTechnique)
     *   3. tierFlags: From unified nodeFlags config (preferred) or packer.tierFlags (deprecated)
     *
     * [Config Priority] nodeFlags.tierFlags > packer.tierFlags
     *
     * @param tier - Node tier (top/normal/ghost)
     * @param seedFlags - Original flags from NodeSeed
     * @param classificationFlags - 16bit flags from Tagger
     */
    getTierFlags(tier, seedFlags, classificationFlags) {
        // Start with seed flags
        let flags = seedFlags;
        // Merge classification flags from Tagger (16bitTechnique)
        flags |= classificationFlags;
        // Get tier flags from unified config (preferred) or legacy packer config
        const tierFlags = this.config.nodeFlags?.tierFlags ?? this.config.packer.tierFlags;
        // Add tier-specific flags from config
        switch (tier) {
            case "top":
                flags |= tierFlags.top;
                break;
            case "normal":
                flags |= tierFlags.normal;
                break;
            case "ghost":
                flags |= tierFlags.ghost;
                break;
        }
        return flags;
    }
}
//# sourceMappingURL=packer.js.map