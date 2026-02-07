/**
 * Sphere Project - Schema Validator
 *
 * [Role] Dynamic validation based on JSON schema definitions
 * [Design] Stateless, pure function validation
 */
import type { SchemaDefinition, SchemaRegistry, ValidationError } from "./types.js";
/**
 * Validate data against a schema definition
 *
 * @param data - Data to validate
 * @param schema - Schema definition
 * @param registry - All schemas (for resolving "items" references)
 * @param fieldPrefix - Field path prefix (for nested validation)
 * @returns Array of validation errors (empty = valid)
 */
export declare function validateAgainstSchema(data: unknown, schema: SchemaDefinition, registry: SchemaRegistry, fieldPrefix?: string): ValidationError[];
/**
 * Calculate total payload bytes for a capsule
 * (Composite constraint validation)
 */
export declare function calculatePayloadBytes(capsule: unknown): number;
/**
 * Validate composite constraints (cross-field rules)
 */
export declare function validateConstraints(capsule: unknown, schema: SchemaDefinition): ValidationError[];
//# sourceMappingURL=validator.d.ts.map