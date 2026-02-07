/**
 * Sphere Project - Gatekeeper
 *
 * [Role] Capsule Validator for Agent Return
 * [Scope] STATELESS - Validates capsules based on Schema definitions
 * [Source of Truth] schema/*.schema.json
 *
 * Validates:
 * - Schema structure (via schema-driven validation)
 * - Node counts (topTier, normal, ghost)
 * - Payload size (composite constraint)
 * - Field constraints (maxLength, pattern, etc.)
 */
import type { ExperienceCapsule } from "../types/capsule.js";
import type { SchemaRegistry } from "../schema/types.js";
/**
 * Detailed validation result with specific violations
 * [Note] Interface preserved for backward compatibility
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    summary: {
        topTier: {
            count: number;
            max: number;
            ok: boolean;
        };
        normal: {
            count: number;
            max: number;
            ok: boolean;
        };
        ghost: {
            count: number;
            max: number;
            ok: boolean;
        };
        totalPayloadBytes: number;
        maxPayloadBytes: number;
    };
}
export interface ValidationError {
    code: string;
    message: string;
    field?: string;
    actual?: number;
    limit?: number;
}
export declare class Gatekeeper {
    private capsuleSchema;
    private registry;
    /**
     * Create Gatekeeper with schema registry
     *
     * @param registry - Loaded schema registry (from loadSchemas())
     *                   If not provided, schemas are loaded automatically
     */
    constructor(registry?: SchemaRegistry);
    /**
     * Validate capsule against Schema definitions (STATELESS)
     *
     * [Flow]
     *   1. Schema-driven field validation
     *   2. Empty capsule check (business rule)
     *   3. Composite constraints (total payload bytes)
     */
    validate(capsule: ExperienceCapsule): ValidationResult;
    /**
     * Get current constraints (for agent reference)
     * [Note] Derived from schema for backward compatibility
     */
    getConstraints(): {
        maxTopTier: number;
        maxNormal: number;
        maxGhost: number;
        maxPayloadBytes: number;
        maxSummaryLength: number;
        maxRefUrlLength: number;
        maxLinks: number;
    };
    /**
     * Get the schema registry (for API exposure)
     */
    getSchemaRegistry(): SchemaRegistry;
}
//# sourceMappingURL=gatekeeper.d.ts.map