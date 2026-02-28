/**
 * Sphere Project - Agent Movement System
 *
 * [Design] Based on MOVE_DESIGN_MEMO.md
 * [Principle] Two-layer architecture:
 *   - Perception Layer: quantized (agent sees this)
 *   - Computation Layer: 384-dim precise (internal)
 *
 * [Movement Layers]
 *   Layer 1: toward signature - tracking scan result
 *   Layer 2: toNode - revisiting known node
 *
 * [Removed] drift/gravity system — was dead code (always received empty nodes array)
 */

import type { SphereNode } from "@sphere/renal-core";
import {
  cosineDistance,
  normalize,
  add,
  scale,
  subtract,
} from "../lib/vector.js";
import type {
  MoveIntent,
  ScanResult,
  ScanConfig,
  MoveConfig,
  SignatureEntry,
  MoveResultInternal,
  DistanceLevel,
  HeatLevel,
} from "../types/movement.js";
import { DEFAULT_MOVE_CONFIG, DEFAULT_SCAN_CONFIG } from "../types/movement.js";

// ============================================================
// Signature Registry
// ============================================================

/**
 * Signature Registry: manages temporary identifiers for movement
 *
 * [Lifecycle]
 *   - Created on scan()
 *   - Used in move({ toward: sig })
 *   - Expires after time or movement distance
 */
export class SignatureRegistry {
  private entries: Map<number, SignatureEntry> = new Map();
  private nextSignature = 1;
  private readonly maxAge: number;
  private readonly maxDistance: number;

  constructor(maxAgeMs = 30000, maxDistance = 0.5) {
    this.maxAge = maxAgeMs;
    this.maxDistance = maxDistance;
  }

  /**
   * Register a node and get temporary signature
   */
  register(
    nodeId: string,
    nodeVector: number[],
    agentVector: number[]
  ): number {
    const signature = this.nextSignature++;
    this.entries.set(signature, {
      signature,
      nodeId,
      vector: [...nodeVector],
      createdAt: Date.now(),
      agentVectorAtCreation: [...agentVector],
    });
    return signature;
  }

  /**
   * Resolve signature to node vector (if still valid)
   */
  resolve(signature: number, currentAgentVector: number[]): number[] | null {
    const entry = this.entries.get(signature);
    if (!entry) return null;

    // Check time expiry
    if (Date.now() - entry.createdAt > this.maxAge) {
      this.entries.delete(signature);
      return null;
    }

    // Check distance expiry (agent moved too far from where they saw it)
    const movedDistance = cosineDistance(
      currentAgentVector,
      entry.agentVectorAtCreation
    );
    if (movedDistance > this.maxDistance) {
      this.entries.delete(signature);
      return null;
    }

    return entry.vector;
  }

  /**
   * Clear expired entries
   */
  cleanup(currentAgentVector: number[]): void {
    const now = Date.now();
    for (const [sig, entry] of this.entries) {
      const aged = now - entry.createdAt > this.maxAge;
      const moved =
        cosineDistance(currentAgentVector, entry.agentVectorAtCreation) >
        this.maxDistance;
      if (aged || moved) {
        this.entries.delete(sig);
      }
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
  }
}

// ============================================================
// Quantization Functions
// ============================================================

/**
 * Quantize cosine distance to perception level
 */
function quantizeDistance(
  distance: number,
  config: MoveConfig = DEFAULT_MOVE_CONFIG
): DistanceLevel {
  if (distance <= config.distanceThresholds.near) return "near";
  if (distance <= config.distanceThresholds.mid) return "mid";
  return "far";
}

/**
 * Quantize heat value to perception level
 */
function quantizeHeat(
  heat: number,
  config: MoveConfig = DEFAULT_MOVE_CONFIG
): HeatLevel {
  if (heat <= config.heatThresholds.low) return "low";
  if (heat <= config.heatThresholds.mid) return "mid";
  return "high";
}

// ============================================================
// Scan Implementation
// ============================================================

/**
 * Scan nearby nodes and return quantized results (movement system internal)
 *
 * [Note] Gateway の "scan" メッセージは知覚層 scanL1() を使用する。
 *        この関数は移動システム内部用で、量子化された ScanResult (distance/heat/signature) を返す。
 *        現在 Gateway からは呼ばれないが、signature ベース移動の基盤として残置。
 *
 * [Design] Uniform range (baseRange only). Heat-based visibility was removed —
 *          detection bias belongs in agent layer (modeWeights / Weapon).
 * [Design] Low-presence nodes are invisible (minPresence filter: h + w)
 * [Design] Results are capped (maxResults)
 */
function scan(
  agentVector: number[],
  nodes: SphereNode[],
  signatureRegistry: SignatureRegistry,
  config: ScanConfig = DEFAULT_SCAN_CONFIG,
  moveConfig: MoveConfig = DEFAULT_MOVE_CONFIG
): ScanResult[] {
  const candidates: Array<{ node: SphereNode; dist: number }> = [];

  for (const node of nodes) {
    // Skip nodes without vector
    if (!node.vector || node.vector.length === 0) continue;

    // Skip low-presence nodes (h + w below threshold)
    if ((node.metrics.h + node.metrics.w) < config.minPresence) continue;

    const dist = cosineDistance(agentVector, node.vector);

    if (dist <= config.baseRange) {
      candidates.push({ node, dist });
    }
  }

  // Sort by distance, take top maxResults
  candidates.sort((a, b) => a.dist - b.dist);
  const results = candidates.slice(0, config.maxResults);

  // Convert to ScanResult with signature
  return results.map(({ node, dist }) => {
    const signature = signatureRegistry.register(
      node.id,
      node.vector,
      agentVector
    );

    return {
      distance: quantizeDistance(dist, moveConfig),
      heat: quantizeHeat(node.metrics.h, moveConfig),
      kind: node.kind,
      signature,
    };
  });
}

// ============================================================
// Move Execution
// ============================================================

/**
 * Execute movement based on intent
 *
 * [Design] moveBatch: steps > 1 executes as single calculation
 * [Principle] 384-dim resolution happens once, not per step
 */
function executeMove(
  agentVector: number[],
  velocity: number[],
  intent: MoveIntent,
  nodes: SphereNode[],
  signatureRegistry: SignatureRegistry,
  config: MoveConfig = DEFAULT_MOVE_CONFIG
): MoveResultInternal {
  const steps = getSteps(intent);
  let direction: number[];

  // Resolve direction based on intent type
  if ("toward" in intent) {
    const targetVector = signatureRegistry.resolve(intent.toward, agentVector);
    if (!targetVector) {
      return {
        success: false,
        newVector: agentVector,
        stepsExecuted: 0,
        blocked: "expired",
      };
    }
    direction = normalize(subtract(targetVector, agentVector));
  } else if ("toNode" in intent) {
    // toNode requires looking up node by ID
    const targetNode = nodes.find((n) => n.id === intent.toNode);
    if (!targetNode || !targetNode.vector) {
      return {
        success: false,
        newVector: agentVector,
        stepsExecuted: 0,
        blocked: "expired",
      };
    }
    direction = normalize(subtract(targetNode.vector, agentVector));
  } else {
    // Unknown intent type
    return {
      success: false,
      newVector: agentVector,
      stepsExecuted: 0,
    };
  }

  // Calculate total step size (batch optimization)
  const totalStep = steps * config.physics.stepSize;

  // Apply movement and normalize
  const newVector = normalize(add(agentVector, scale(direction, totalStep)));

  return {
    success: true,
    newVector,
    stepsExecuted: steps,
  };
}

/**
 * Extract steps from intent
 */
function getSteps(intent: MoveIntent): number {
  if ("toward" in intent) return intent.steps ?? 1;
  if ("toNode" in intent) return intent.steps ?? 1;
  return 1;
}

// ============================================================
// Agent Movement State
// ============================================================

/**
 * Agent movement state holder
 *
 * Tracks current vector, velocity, and signature registry
 */
export class AgentMovementState {
  private _vector: number[];
  private _velocity: number[];
  private _signatureRegistry: SignatureRegistry;
  private _config: MoveConfig;

  constructor(
    initialVector: number[],
    config: MoveConfig = DEFAULT_MOVE_CONFIG
  ) {
    this._vector = [...initialVector];
    this._velocity = new Array(initialVector.length).fill(0);
    this._signatureRegistry = new SignatureRegistry();
    this._config = config;
  }

  get vector(): number[] {
    return [...this._vector];
  }

  get velocity(): number[] {
    return [...this._velocity];
  }

  get signatureRegistry(): SignatureRegistry {
    return this._signatureRegistry;
  }

  get config(): MoveConfig {
    return this._config;
  }

  /**
   * Perform scan and return quantized results
   */
  scan(nodes: SphereNode[]): ScanResult[] {
    return scan(
      this._vector,
      nodes,
      this._signatureRegistry,
      this._config.scan,
      this._config
    );
  }

  /**
   * Execute movement and update state
   */
  move(intent: MoveIntent, nodes: SphereNode[]): MoveResultInternal {
    const result = executeMove(
      this._vector,
      this._velocity,
      intent,
      nodes,
      this._signatureRegistry,
      this._config
    );

    if (result.success) {
      // Update velocity (direction of movement)
      this._velocity = normalize(subtract(result.newVector, this._vector));
      // Update position
      this._vector = result.newVector;
      // Cleanup expired signatures
      this._signatureRegistry.cleanup(this._vector);
    }

    return result;
  }

  /**
   * Update config (e.g., when embedding model changes)
   */
  updateConfig(config: Partial<MoveConfig>): void {
    this._config = { ...this._config, ...config };
  }
}
