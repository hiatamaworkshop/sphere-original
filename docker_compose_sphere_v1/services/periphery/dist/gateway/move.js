/**
 * Sphere Project - Agent Movement System
 *
 * [Design] Based on MOVE_DESIGN_MEMO.md
 * [Principle] Two-layer architecture:
 *   - Perception Layer: quantized (agent sees this)
 *   - Computation Layer: 384-dim precise (internal)
 *
 * [Movement Layers]
 *   Layer 0: drift - exploration, follow heat gradient
 *   Layer 1: toward signature - tracking scan result
 *   Layer 2: toNode - revisiting known node
 */
import { cosineDistance, normalize, add, scale, weightedSum, randomUnitVector, subtract, } from "../lib/vector.js";
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
    entries = new Map();
    nextSignature = 1;
    maxAge;
    maxDistance;
    constructor(maxAgeMs = 30000, maxDistance = 0.5) {
        this.maxAge = maxAgeMs;
        this.maxDistance = maxDistance;
    }
    /**
     * Register a node and get temporary signature
     */
    register(nodeId, nodeVector, agentVector) {
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
    resolve(signature, currentAgentVector) {
        const entry = this.entries.get(signature);
        if (!entry)
            return null;
        // Check time expiry
        if (Date.now() - entry.createdAt > this.maxAge) {
            this.entries.delete(signature);
            return null;
        }
        // Check distance expiry (agent moved too far from where they saw it)
        const movedDistance = cosineDistance(currentAgentVector, entry.agentVectorAtCreation);
        if (movedDistance > this.maxDistance) {
            this.entries.delete(signature);
            return null;
        }
        return entry.vector;
    }
    /**
     * Clear expired entries
     */
    cleanup(currentAgentVector) {
        const now = Date.now();
        for (const [sig, entry] of this.entries) {
            const aged = now - entry.createdAt > this.maxAge;
            const moved = cosineDistance(currentAgentVector, entry.agentVectorAtCreation) >
                this.maxDistance;
            if (aged || moved) {
                this.entries.delete(sig);
            }
        }
    }
    /**
     * Clear all entries
     */
    clear() {
        this.entries.clear();
    }
}
// ============================================================
// Quantization Functions
// ============================================================
/**
 * Quantize cosine distance to perception level
 */
function quantizeDistance(distance, config = DEFAULT_MOVE_CONFIG) {
    if (distance <= config.distanceThresholds.near)
        return "near";
    if (distance <= config.distanceThresholds.mid)
        return "mid";
    return "far";
}
/**
 * Quantize heat value to perception level
 */
function quantizeHeat(heat, config = DEFAULT_MOVE_CONFIG) {
    if (heat <= config.heatThresholds.low)
        return "low";
    if (heat <= config.heatThresholds.mid)
        return "mid";
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
 * [Design] Hot nodes are visible from further away (heatBoost)
 * [Design] Cold nodes are invisible (minHeat filter)
 * [Design] Results are capped (maxResults)
 */
function scan(agentVector, nodes, signatureRegistry, config = DEFAULT_SCAN_CONFIG, moveConfig = DEFAULT_MOVE_CONFIG) {
    const candidates = [];
    for (const node of nodes) {
        // Skip nodes without vector
        if (!node.vector || node.vector.length === 0)
            continue;
        // Skip cold nodes
        if (node.metrics.h < config.minHeat)
            continue;
        const dist = cosineDistance(agentVector, node.vector);
        // Heat boosts visibility range
        const heatLevel = quantizeHeat(node.metrics.h, moveConfig);
        const effectiveRange = config.baseRange + config.heatBoost[heatLevel];
        if (dist <= effectiveRange) {
            candidates.push({ node, dist });
        }
    }
    // Sort by distance, take top maxResults
    candidates.sort((a, b) => a.dist - b.dist);
    const results = candidates.slice(0, config.maxResults);
    // Convert to ScanResult with signature
    return results.map(({ node, dist }) => {
        const signature = signatureRegistry.register(node.id, node.vector, agentVector);
        return {
            distance: quantizeDistance(dist, moveConfig),
            heat: quantizeHeat(node.metrics.h, moveConfig),
            kind: node.kind,
            signature,
        };
    });
}
// ============================================================
// Drift Calculation
// ============================================================
/**
 * Calculate gravity vector from nearby nodes
 *
 * [Formula] attraction = (heat / distance²) × weight
 * [Design] Aggregates all nearby attractions into single direction
 */
function calculateGravity(agentVector, nodes, config) {
    const dim = agentVector.length;
    const gravity = new Array(dim).fill(0);
    for (const node of nodes) {
        if (!node.vector || node.vector.length !== dim)
            continue;
        if (node.metrics.h < config.scan.minHeat)
            continue;
        const dist = cosineDistance(agentVector, node.vector);
        if (dist < 0.001)
            continue; // Skip self or very close
        // Direction toward node (in 384-dim space)
        const direction = normalize(subtract(node.vector, agentVector));
        // Attraction strength: heat / distance² × weight
        const attraction = (node.metrics.h / (dist * dist)) * node.metrics.w;
        // Add to gravity
        for (let i = 0; i < dim; i++) {
            gravity[i] += direction[i] * attraction;
        }
    }
    return gravity;
}
/**
 * Calculate drift direction based on mode
 *
 * [Modes]
 *   wander: random + slight gravity
 *   follow: gravity dominant
 *   orbit: perpendicular to gravity (not fully implemented)
 */
function calculateDrift(agentVector, mode, nodes, velocity, config = DEFAULT_MOVE_CONFIG) {
    const dim = agentVector.length;
    const gravity = calculateGravity(agentVector, nodes, config);
    const noise = randomUnitVector(dim);
    let direction;
    switch (mode) {
        case "wander":
            // Noise dominant, slight gravity, some inertia
            direction = weightedSum([noise, normalize(gravity), velocity], [0.6, 0.2, config.physics.inertiaWeight]);
            break;
        case "follow":
            // Gravity dominant, slight noise, strong inertia
            direction = weightedSum([normalize(gravity), noise, velocity], [0.6, config.physics.noiseWeight, config.physics.inertiaWeight]);
            break;
        case "orbit":
            // Perpendicular to gravity (simplified: just use gravity + noise)
            // Full implementation would calculate cross product in high-dim
            direction = weightedSum([noise, normalize(gravity), velocity], [0.4, 0.3, config.physics.inertiaWeight]);
            break;
        default:
            direction = noise;
    }
    return normalize(direction);
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
function executeMove(agentVector, velocity, intent, nodes, signatureRegistry, config = DEFAULT_MOVE_CONFIG) {
    const steps = getSteps(intent);
    let direction;
    // Resolve direction based on intent type
    if ("drift" in intent) {
        direction = calculateDrift(agentVector, intent.drift, nodes, velocity, config);
    }
    else if ("toward" in intent) {
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
    }
    else if ("toNode" in intent) {
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
    }
    else {
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
function getSteps(intent) {
    if ("drift" in intent)
        return intent.steps ?? 1;
    if ("toward" in intent)
        return intent.steps ?? 1;
    if ("toNode" in intent)
        return intent.steps ?? 1;
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
    _vector;
    _velocity;
    _signatureRegistry;
    _config;
    constructor(initialVector, config = DEFAULT_MOVE_CONFIG) {
        this._vector = [...initialVector];
        this._velocity = new Array(initialVector.length).fill(0);
        this._signatureRegistry = new SignatureRegistry();
        this._config = config;
    }
    get vector() {
        return [...this._vector];
    }
    get velocity() {
        return [...this._velocity];
    }
    get signatureRegistry() {
        return this._signatureRegistry;
    }
    get config() {
        return this._config;
    }
    /**
     * Perform scan and return quantized results
     */
    scan(nodes) {
        return scan(this._vector, nodes, this._signatureRegistry, this._config.scan, this._config);
    }
    /**
     * Execute movement and update state
     */
    move(intent, nodes) {
        const result = executeMove(this._vector, this._velocity, intent, nodes, this._signatureRegistry, this._config);
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
    updateConfig(config) {
        this._config = { ...this._config, ...config };
    }
}
//# sourceMappingURL=move.js.map