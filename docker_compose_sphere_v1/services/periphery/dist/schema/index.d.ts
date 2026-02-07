/**
 * Sphere Project - Schema Module
 *
 * [Role] Dynamic schema-driven validation for ExperienceCapsule
 * [Design] JSON-first: Schema defined in JSON, loaded at runtime
 *
 * [Usage]
 *   import { loadSchemas, validateAgainstSchema, getSchemasForAPI } from "./schema/index.js";
 *
 *   // At startup
 *   const registry = loadSchemas();
 *
 *   // For validation
 *   const errors = validateAgainstSchema(capsule, registry.get("ExperienceCapsule")!, registry);
 *
 *   // For API
 *   app.get("/schema", (req, res) => res.json(getSchemasForAPI()));
 */
export type { FieldType, FieldDefinition, SchemaDefinition, SchemaRegistry, ValidationError, } from "./types.js";
export { CAPSULE_CONSTRAINT_KEYS } from "./types.js";
export { loadSchemas, getSchemaRegistry, getSchema, getSchemasForAPI, clearSchemaCache, } from "./loader.js";
export { validateAgainstSchema, calculatePayloadBytes, validateConstraints, } from "./validator.js";
//# sourceMappingURL=index.d.ts.map