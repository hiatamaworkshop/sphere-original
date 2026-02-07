/**
 * Sphere Project - Periphery Types
 * Experience Capsule & Node Seed Definitions
 *
 * [Principle] Data submitted by agents, validated by Gatekeeper
 *
 * ============================================================================
 * SCHEMA CONTRACT - IMMUTABLE WITHIN SPHERE
 * ============================================================================
 *
 * [Rule] Schema MUST NOT change within a running Sphere instance
 *   - Different Spheres MAY have different schemas (versioned)
 *   - Within a Sphere: schema is FIXED at deployment time
 *   - Breaking changes require new Sphere deployment
 *
 * [Version] CAPSULE_SCHEMA_VERSION tracks breaking changes
 *   - Increment on ANY structural change
 *   - Gatekeeper validates version match
 *
 * ============================================================================
 *
 * [Data Flow]
 *   ExperienceCapsule
 *     ├── NodeSeed[] (new discoveries)
 *     │     ├── tags → Tagger → vector → RefDB (spatial position)
 *     │     └── sourceNodeId? → RefDB (knowledge lineage, L3 metadata)
 *     │
 *     └── NodeEvaluation[] (opinions on existing nodes)
 *           └── nodeId + score → ProjDB (no vectorization needed)
 *
 * [DB Responsibilities]
 *   RefDB: Stores nodes with spatial coordinates (vector)
 *          Tracks knowledge lineage via sourceNodeId
 *   ProjDB: Stores evaluations/projections on existing nodes
 *           Uses existing node coordinates (lookup by nodeId)
 */
/**
 * Schema version for ExperienceCapsule
 *
 * [Contract] Increment on ANY breaking change:
 *   - Adding required fields
 *   - Removing fields
 *   - Changing field types
 *   - Changing field semantics
 *
 * [Usage] Gatekeeper validates: capsule.schemaVersion === CAPSULE_SCHEMA_VERSION
 *
 * [History]
 *   v1: Initial schema (score: 0-100)
 *   v2: Evaluation redesign (h, w, d: 0-10 each)
 *   v3: L3 reference structure (links[], ref_url added)
 *   v4: Access Level restructure (payload → content, L1-L4 hierarchy)
 */
export declare const CAPSULE_SCHEMA_VERSION = 4;
/**
 * Experience Capsule: Container for agent's contributions
 *
 * [Two Types of Contribution]
 *   1. NodeSeed: New discoveries (requires Tagger vectorization)
 *   2. NodeEvaluation: Opinions on existing nodes (no vectorization)
 *
 * [Schema Contract]
 *   - schemaVersion MUST match CAPSULE_SCHEMA_VERSION
 *   - Gatekeeper rejects mismatched versions
 *   - Ensures data consistency within Sphere
 *
 * IMPORTANT: No agentId, sessionId - Gatekeeper is STATELESS
 */
export interface ExperienceCapsule {
    schemaVersion: number;
    topTier: NodeSeed[];
    normalNodes: NodeSeed[];
    ghostNodes: NodeSeed[];
    evaluations: NodeEvaluation[];
    timestamp: number;
}
/**
 * Node Seed: Pre-incarnation node data (before vectorization)
 *
 * [Access Level Hierarchy]
 *   L1: tags (header) - scanL1() で見える
 *   L2: summary - sense() で見える
 *   L3: content (main data) - focus() で見える
 *   L4: sourceNodeId, links, ref_url - focus() で見える
 *
 * [Design] Discovery-centric structure:
 *   - tags: WHERE - spatial coordinates (vectorized)
 *   - summary: WHAT - headline of the discovery (sensed from afar)
 *   - content: DETAIL - main content of the discovery (read when focused)
 *   - sourceNodeId/links/ref_url: REFERENCE - related sources
 *
 * [Philosophy] Agent returns as a giver, not a seeker.
 *   The capsule contains discoveries, not questions.
 *
 * [RefDB Usage]
 *   - New node created with vector from summary
 *   - All L1-L4 fields stored in RefDB
 */
export interface NodeSeed {
    tags: string[];
    summary: string;
    content?: string;
    sourceNodeId?: string;
    links?: string[];
    ref_url?: string;
    flags: number;
}
/**
 * Node Evaluation: Score for existing node (no new content)
 *
 * [Design] Agent references existing node by ID
 *   - No tags/vector needed (coordinates exist in RefDB)
 *   - Agent evaluates h, w, d individually (0-10 scale)
 *   - Computation layer applies coefficients to ProjDB
 *
 * [2-Layer Evaluation Architecture]
 *   Agent layer: Intuitive 0-10 evaluation per metric
 *   Computation layer: Coefficients adjust actual impact
 *     - h: coefficient 1 (direct)
 *     - w: coefficient 1 (direct)
 *     - d: coefficient 0.01 (minimal - flags are primary)
 *   Neutral point: 5 (no change)
 *
 * [ProjDB Usage]
 *   - Lookup node by nodeId
 *   - Apply: metric += (input - 5) * coefficient
 *   - No Tagger processing required
 *
 * [Use Cases]
 *   - Agent visited node X, found it relevant/irrelevant
 *   - Agent wants to leave opinion without creating new content
 *   - Feedback loop for knowledge quality
 */
export interface NodeEvaluation {
    nodeId: string;
    h: number;
    w: number;
    d: number;
    context?: string;
}
/**
 * Parsed Node Seed: After Parser processing (before Tagger)
 *
 * [Design] Parser adds:
 *   - vector: summary vectorized (spatial coordinates)
 *
 * [Pipeline] ExperienceCapsule → Gatekeeper → Parser → ParsedNodeSeed
 */
export interface ParsedNodeSeed extends NodeSeed {
    vector: number[];
}
/**
 * Parsed Capsule: Result of Parser.parseCapsule()
 *
 * [Note] Intermediate step between Gatekeeper and Tagger
 */
export interface ParsedCapsule {
    topTier: ParsedNodeSeed[];
    normalNodes: ParsedNodeSeed[];
    ghostNodes: ParsedNodeSeed[];
    evaluations: NodeEvaluation[];
}
/**
 * Tagged Node Seed: After Tagger processing
 *
 * [Design] Tagger adds:
 *   - tier/rank: classification
 *   - classificationFlags: 16bit semantic flags (from tags)
 *
 * [Note] vector comes from Parser (summary → coordinates)
 * [Note] sourceNodeId is preserved for RefDB lineage tracking
 */
export interface TaggedNodeSeed extends ParsedNodeSeed {
    tier: "top" | "normal" | "ghost";
    rank: number;
    classificationFlags: number;
}
/**
 * Tagged Capsule: Result of Tagger.tagCapsule()
 *
 * [Note] evaluations are passed through unchanged (no Tagger processing)
 */
export interface TaggedCapsule {
    topTier: TaggedNodeSeed[];
    normal: TaggedNodeSeed[];
    ghost: TaggedNodeSeed[];
    evaluations: NodeEvaluation[];
}
/**
 * Packed Nodes: Result of Packer.pack()
 */
export interface PackedNodes {
    nodes: import("@sphere/renal-core").SphereNode[];
}
/**
 * Processed Evaluations: Result of evaluation processing
 *
 * [Design] Evaluations go directly to ProjDB
 *   - nodeId → lookup node
 *   - h, w, d → applied with coefficients
 */
export interface ProcessedEvaluations {
    evaluations: Array<{
        nodeId: string;
        h: number;
        w: number;
        d: number;
        context?: string;
    }>;
}
/**
 * Validate capsule schema version
 *
 * [Usage] Gatekeeper calls this on every incoming capsule
 *
 * @returns true if version matches, false otherwise
 */
export declare function validateCapsuleSchema(capsule: ExperienceCapsule): boolean;
/**
 * Schema validation error details
 */
export interface CapsuleSchemaError {
    expected: number;
    received: number;
    message: string;
}
/**
 * Get detailed schema error (for logging/debugging)
 */
export declare function getCapsuleSchemaError(capsule: ExperienceCapsule): CapsuleSchemaError | null;
/**
 * Create empty capsule with correct schema version
 *
 * [Usage] Helper for creating new capsules
 */
export declare function createEmptyCapsule(): ExperienceCapsule;
//# sourceMappingURL=capsule.d.ts.map