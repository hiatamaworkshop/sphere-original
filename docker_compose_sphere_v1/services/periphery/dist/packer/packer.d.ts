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
import type { TaggedCapsule } from "../types/capsule.js";
import type { SphereNode } from "@sphere/renal-core";
import type { PeripheryConfig } from "../types/config.js";
export interface PackedNodes {
    nodes: SphereNode[];
}
export declare class Packer {
    private config;
    constructor(config: PeripheryConfig);
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
    pack(tagged: TaggedCapsule): Promise<PackedNodes>;
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
    private buildNode;
    /**
     * Get tier-specific weight
     */
    private getTierWeight;
    /**
     * Get tier-specific TTL (in seconds, adjusted for dev/prod)
     */
    private getTierTTL;
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
    private getTierFlags;
}
//# sourceMappingURL=packer.d.ts.map