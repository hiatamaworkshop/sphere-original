/**
 * Sphere Project - Schema Type Definitions
 *
 * [Role] Define types for dynamic schema-driven validation
 * [Design] JSON-first: Schema defined in JSON, loaded at runtime
 *
 * Sphere Schema Format (sphere-schema-v1):
 * - Simpler than JSON Schema but expressive enough for Capsule validation
 * - Supports nested object arrays via "items" reference
 * - Supports composite constraints via "constraints" field
 */
/**
 * Field types supported by Sphere Schema
 */
export type FieldType = "string" | "number" | "boolean" | "string[]" | "array";
/**
 * Field Definition: Describes a single field in a schema
 *
 * [Design] Supports validation rules appropriate to each type:
 * - string: maxLength, pattern (regex)
 * - number: min, max
 * - array/string[]: minItems, maxItems, max (alias)
 */
export interface FieldDefinition {
    type: FieldType;
    required?: boolean;
    description?: string;
    maxLength?: number;
    pattern?: string;
    items?: string;
    minItems?: number;
    maxItems?: number;
    min?: number;
    max?: number;
}
/**
 * Schema Definition: Describes a complete object schema
 *
 * [Design]
 * - "fields" defines individual field rules
 * - "constraints" defines composite rules (e.g., total payload bytes)
 * - "version" is only for root schema (ExperienceCapsule)
 */
export interface SchemaDefinition {
    /** Schema format identifier */
    $schema?: string;
    /** Schema version (only for ExperienceCapsule) */
    version?: number;
    /** Schema name (used for reference resolution) */
    name: string;
    /** Human-readable description */
    description?: string;
    /** Field definitions */
    fields: Record<string, FieldDefinition>;
    /**
     * Composite constraints (cross-field rules)
     *
     * [Examples]
     * - maxTotalPayloadBytes: Total bytes across all nodes
     * - maxTotalNodes: Total count across all tiers
     */
    constraints?: Record<string, number>;
}
/**
 * Schema Registry: Map of schema name to definition
 *
 * [Usage] Gatekeeper receives this to resolve "items" references
 */
export type SchemaRegistry = Map<string, SchemaDefinition>;
/**
 * Validation Error: Detailed error information
 *
 * [Design] Compatible with existing Gatekeeper.ValidationError
 */
export interface ValidationError {
    code: string;
    message: string;
    field?: string;
    actual?: number | string;
    limit?: number | string;
}
/**
 * Schema constraint keys for ExperienceCapsule
 */
export declare const CAPSULE_CONSTRAINT_KEYS: {
    readonly maxTotalPayloadBytes: "maxTotalPayloadBytes";
};
//# sourceMappingURL=types.d.ts.map