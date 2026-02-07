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
import type { MoveIntent, ScanResult, ScanConfig, MoveConfig, MoveResultInternal, DistanceLevel, HeatLevel, DriftMode } from "../types/movement.js";
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
 * Quantize cosine distance to perception level
 */
export declare function quantizeDistance(distance: number, config?: MoveConfig): DistanceLevel;
/**
 * Quantize heat value to perception level
 */
export declare function quantizeHeat(heat: number, config?: MoveConfig): HeatLevel;
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
export declare function scan(agentVector: number[], nodes: SphereNode[], signatureRegistry: SignatureRegistry, config?: ScanConfig, moveConfig?: MoveConfig): ScanResult[];
/**
 * Calculate drift direction based on mode
 *
 * [Modes]
 *   wander: random + slight gravity
 *   follow: gravity dominant
 *   orbit: perpendicular to gravity (not fully implemented)
 */
export declare function calculateDrift(agentVector: number[], mode: DriftMode, nodes: SphereNode[], velocity: number[], config?: MoveConfig): number[];
/**
 * Execute movement based on intent
 *
 * [Design] moveBatch: steps > 1 executes as single calculation
 * [Principle] 384-dim resolution happens once, not per step
 */
export declare function executeMove(agentVector: number[], velocity: number[], intent: MoveIntent, nodes: SphereNode[], signatureRegistry: SignatureRegistry, config?: MoveConfig): MoveResultInternal;
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