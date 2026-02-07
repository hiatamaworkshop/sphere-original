/**
 * Sphere Project - Schema Loader
 *
 * [Role] Load JSON schema files and build SchemaRegistry
 * [Design] Synchronous loading at startup, cached in memory
 */
import type { SchemaDefinition, SchemaRegistry } from "./types.js";
/**
 * Load all schemas and build registry
 *
 * [Usage] Call once at startup, result is cached
 * @returns SchemaRegistry (Map<name, SchemaDefinition>)
 */
export declare function loadSchemas(): SchemaRegistry;
/**
 * Get cached registry (throws if not loaded)
 */
export declare function getSchemaRegistry(): SchemaRegistry;
/**
 * Get a specific schema by name
 */
export declare function getSchema(name: string): SchemaDefinition | undefined;
/**
 * Get all schemas as plain object (for API response)
 */
export declare function getSchemasForAPI(): Record<string, SchemaDefinition>;
/**
 * Clear cached registry (for testing)
 */
export declare function clearSchemaCache(): void;
//# sourceMappingURL=loader.d.ts.map