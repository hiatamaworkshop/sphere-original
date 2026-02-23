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
import type { SphereNode } from "@sphere/renal-core";
import type { MoveIntent, ScanResult, MoveConfig, MoveResultInternal } from "../types/movement.js";
/**
 * Signature Registry: manages temporary identifiers for movement
 *
 * [Lifecycle]
 *   - Created on scan()
 *   - Used in move({ toward: sig })
 *   - Expires after time or movement distance
 */
export declare class SignatureRegistry {
    private entries;
    private nextSignature;
    private readonly maxAge;
    private readonly maxDistance;
    constructor(maxAgeMs?: number, maxDistance?: number);
    /**
     * Register a node and get temporary signature
     */
    register(nodeId: string, nodeVector: number[], agentVector: number[]): number;
    /**
     * Resolve signature to node vector (if still valid)
     */
    resolve(signature: number, currentAgentVector: number[]): number[] | null;
    /**
     * Clear expired entries
     */
    cleanup(currentAgentVector: number[]): void;
    /**
     * Clear all entries
     */
    clear(): void;
}
/**
 * Agent movement state holder
 *
 * Tracks current vector, velocity, and signature registry
 */
export declare class AgentMovementState {
    private _vector;
    private _velocity;
    private _signatureRegistry;
    private _config;
    constructor(initialVector: number[], config?: MoveConfig);
    get vector(): number[];
    get velocity(): number[];
    get signatureRegistry(): SignatureRegistry;
    get config(): MoveConfig;
    /**
     * Perform scan and return quantized results
     */
    scan(nodes: SphereNode[]): ScanResult[];
    /**
     * Execute movement and update state
     */
    move(intent: MoveIntent, nodes: SphereNode[]): MoveResultInternal;
    /**
     * Update config (e.g., when embedding model changes)
     */
    updateConfig(config: Partial<MoveConfig>): void;
}
//# sourceMappingURL=move.d.ts.map