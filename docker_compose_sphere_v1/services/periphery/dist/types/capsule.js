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
export const CAPSULE_SCHEMA_VERSION = 4;
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Validate capsule schema version
 *
 * [Usage] Gatekeeper calls this on every incoming capsule
 *
 * @returns true if version matches, false otherwise
 */
export function validateCapsuleSchema(capsule) {
    return capsule.schemaVersion === CAPSULE_SCHEMA_VERSION;
}
/**
 * Get detailed schema error (for logging/debugging)
 */
export function getCapsuleSchemaError(capsule) {
    if (validateCapsuleSchema(capsule)) {
        return null;
    }
    return {
        expected: CAPSULE_SCHEMA_VERSION,
        received: capsule.schemaVersion,
        message: `Schema version mismatch: expected ${CAPSULE_SCHEMA_VERSION}, got ${capsule.schemaVersion}. ` +
            `This capsule was created for a different Sphere version.`,
    };
}
/**
 * Create empty capsule with correct schema version
 *
 * [Usage] Helper for creating new capsules
 */
export function createEmptyCapsule() {
    return {
        schemaVersion: CAPSULE_SCHEMA_VERSION,
        topTier: [],
        normalNodes: [],
        ghostNodes: [],
        evaluations: [],
        timestamp: Date.now(),
    };
}
//# sourceMappingURL=capsule.js.map