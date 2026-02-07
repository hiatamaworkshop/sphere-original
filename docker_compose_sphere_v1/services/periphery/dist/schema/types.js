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
 * Schema constraint keys for ExperienceCapsule
 */
export const CAPSULE_CONSTRAINT_KEYS = {
    maxTotalPayloadBytes: "maxTotalPayloadBytes",
};
//# sourceMappingURL=types.js.map