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
import type {
  SchemaRegistry,
  SchemaDefinition,
  ValidationError as SchemaValidationError,
} from "../schema/types.js";
import {
  validateAgainstSchema,
  validateConstraints,
  calculatePayloadBytes,
} from "../schema/validator.js";
import { loadSchemas } from "../schema/loader.js";

/**
 * Detailed validation result with specific violations
 * [Note] Interface preserved for backward compatibility
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  summary: {
    topTier: { count: number; max: number; ok: boolean };
    normal: { count: number; max: number; ok: boolean };
    ghost: { count: number; max: number; ok: boolean };
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

/**
 * Convert schema validation error to gatekeeper error
 * (Handle type differences: actual/limit can be string in schema errors)
 */
function toGatekeeperError(err: SchemaValidationError): ValidationError {
  return {
    code: err.code,
    message: err.message,
    field: err.field,
    actual: typeof err.actual === "number" ? err.actual : undefined,
    limit: typeof err.limit === "number" ? err.limit : undefined,
  };
}

export class Gatekeeper {
  private capsuleSchema: SchemaDefinition;
  private registry: SchemaRegistry;

  /**
   * Create Gatekeeper with schema registry
   *
   * @param registry - Loaded schema registry (from loadSchemas())
   *                   If not provided, schemas are loaded automatically
   */
  constructor(registry?: SchemaRegistry) {
    // Auto-load schemas if not provided (backward compatibility)
    this.registry = registry ?? loadSchemas();

    const capsuleSchema = this.registry.get("ExperienceCapsule");
    if (!capsuleSchema) {
      throw new Error("ExperienceCapsule schema not found in registry");
    }
    this.capsuleSchema = capsuleSchema;
  }

  /**
   * Validate capsule against Schema definitions (STATELESS)
   *
   * [Flow]
   *   1. Schema-driven field validation
   *   2. Empty capsule check (business rule)
   *   3. Composite constraints (total payload bytes)
   */
  public validate(capsule: ExperienceCapsule): ValidationResult {
    const errors: ValidationError[] = [];

    // Count checks (for summary and logging)
    const topTierCount = capsule.topTier?.length ?? 0;
    const normalCount = capsule.normalNodes?.length ?? 0;
    const ghostCount = capsule.ghostNodes?.length ?? 0;
    const totalNodes = topTierCount + normalCount + ghostCount;

    // [Log] 開始 - Capsule検証開始、入力データ構成
    console.log(
      `[Gatekeeper] >>> start top=${topTierCount} normal=${normalCount} ghost=${ghostCount} total=${totalNodes}`
    );

    // 1. Empty capsule check (business rule, not in schema)
    if (totalNodes === 0) {
      errors.push({
        code: "EMPTY_CAPSULE",
        message: "Capsule is empty (no nodes)",
      });
    }

    // 2. Schema-driven validation
    const schemaErrors = validateAgainstSchema(
      capsule,
      this.capsuleSchema,
      this.registry
    );
    errors.push(...schemaErrors.map(toGatekeeperError));

    // 3. Composite constraints (total payload bytes)
    const constraintErrors = validateConstraints(capsule, this.capsuleSchema);
    errors.push(...constraintErrors.map(toGatekeeperError));

    const valid = errors.length === 0;
    const totalPayloadBytes = calculatePayloadBytes(capsule);

    // Extract max values from schema for summary
    const topTierMax = this.capsuleSchema.fields.topTier?.max ?? 0;
    const normalMax = this.capsuleSchema.fields.normalNodes?.max ?? 0;
    const ghostMax = this.capsuleSchema.fields.ghostNodes?.max ?? 0;
    const maxPayloadBytes = this.capsuleSchema.constraints?.maxTotalPayloadBytes ?? 0;

    // [Log] 終了 - 検証結果、payload総バイト数
    if (valid) {
      console.log(
        `[Gatekeeper] <<< end PASS bytes=${totalPayloadBytes}`
      );
    } else {
      console.log(
        `[Gatekeeper] <<< end REJECT violations=${errors.length} codes=${errors.map((e) => e.code).join(",")}`
      );
    }

    return {
      valid,
      errors,
      summary: {
        topTier: { count: topTierCount, max: topTierMax, ok: topTierCount <= topTierMax },
        normal: { count: normalCount, max: normalMax, ok: normalCount <= normalMax },
        ghost: { count: ghostCount, max: ghostMax, ok: ghostCount <= ghostMax },
        totalPayloadBytes,
        maxPayloadBytes,
      },
    };
  }

  /**
   * Get current constraints (for agent reference)
   * [Note] Derived from schema for backward compatibility
   */
  public getConstraints() {
    return {
      maxTopTier: this.capsuleSchema.fields.topTier?.max ?? 0,
      maxNormal: this.capsuleSchema.fields.normalNodes?.max ?? 0,
      maxGhost: this.capsuleSchema.fields.ghostNodes?.max ?? 0,
      maxPayloadBytes: this.capsuleSchema.constraints?.maxTotalPayloadBytes ?? 0,
      maxSummaryLength: 500,  // From NodeSeed schema
      maxRefUrlLength: 256,   // From NodeSeed schema
      maxLinks: 5,            // From NodeSeed schema
    };
  }

  /**
   * Get the schema registry (for API exposure)
   */
  public getSchemaRegistry(): SchemaRegistry {
    return this.registry;
  }
}
