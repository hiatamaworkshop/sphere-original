/**
 * Sphere Project - Schema Loader
 *
 * [Role] Load JSON schema files and build SchemaRegistry
 * [Design] Synchronous loading at startup, cached in memory
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { SchemaDefinition, SchemaRegistry } from "./types.js";

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Schema file names to load
 */
const SCHEMA_FILES = [
  "capsule.schema.json",
  "node-seed.schema.json",
  "node-evaluation.schema.json",
] as const;

/**
 * Cached schema registry (singleton)
 */
let cachedRegistry: SchemaRegistry | null = null;

/**
 * Load a single schema file
 */
function loadSchemaFile(filename: string): SchemaDefinition {
  const filepath = join(__dirname, filename);
  const content = readFileSync(filepath, "utf-8");
  return JSON.parse(content) as SchemaDefinition;
}

/**
 * Load all schemas and build registry
 *
 * [Usage] Call once at startup, result is cached
 * @returns SchemaRegistry (Map<name, SchemaDefinition>)
 */
export function loadSchemas(): SchemaRegistry {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const registry: SchemaRegistry = new Map();

  for (const filename of SCHEMA_FILES) {
    try {
      const schema = loadSchemaFile(filename);
      registry.set(schema.name, schema);
      console.log(`[SchemaLoader] Loaded: ${schema.name}`);
    } catch (error) {
      console.error(`[SchemaLoader] Failed to load ${filename}:`, error);
      throw new Error(`Schema loading failed: ${filename}`);
    }
  }

  cachedRegistry = registry;
  console.log(`[SchemaLoader] Registry ready: ${registry.size} schemas`);

  return registry;
}

/**
 * Get cached registry (throws if not loaded)
 */
export function getSchemaRegistry(): SchemaRegistry {
  if (!cachedRegistry) {
    throw new Error("Schema registry not loaded. Call loadSchemas() first.");
  }
  return cachedRegistry;
}

/**
 * Get a specific schema by name
 */
export function getSchema(name: string): SchemaDefinition | undefined {
  return getSchemaRegistry().get(name);
}

/**
 * Get all schemas as plain object (for API response)
 */
export function getSchemasForAPI(): Record<string, SchemaDefinition> {
  const registry = getSchemaRegistry();
  const result: Record<string, SchemaDefinition> = {};

  for (const [name, schema] of registry) {
    result[name] = schema;
  }

  return result;
}

/**
 * Clear cached registry (for testing)
 */
export function clearSchemaCache(): void {
  cachedRegistry = null;
}
