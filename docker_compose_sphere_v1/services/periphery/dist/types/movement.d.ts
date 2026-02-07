/**
 * Sphere Project - Agent Movement Types
 *
 * [Design] Based on MOVE_DESIGN_MEMO.md
 * [Principle] Two-layer architecture:
 *   - Perception Layer: quantized, noisy (agent sees this)
 *   - Computation Layer: 384-dim precise (internal)
 */
import type { NodeKind } from "@sphere/renal-core";
/**
 * Drift mode determines how agent moves when exploring
 */
export type DriftMode = "wander" | "follow" | "orbit";
/**
 * Move Intent: Agent's movement intention
 *
 * [Layer Costs]
 *   Layer 0: drift - lowest cost, exploration
 *   Layer 1: toward signature - low cost, tracking
 *   Layer 2: toNode - medium cost, revisiting known node
 */
export type MoveIntent = {
    drift: DriftMode;
    steps?: number;
} | {
    toward: number;
    steps?: number;
} | {
    toNode: string;
    steps?: number;
};
/**
 * Quantized distance perception
 */
export type DistanceLevel = "near" | "mid" | "far";
/**
 * Quantized heat perception
 */
export type HeatLevel = "low" | "mid" | "high";
/**
 * Confidence level for perception (future use)
 */
export type ConfidenceLevel = "weak" | "normal" | "strong";
/**
 * Scan Result: What agent perceives from scan()
 *
 * [Principle] No direction - 384-dim space has no intuitive direction
 * [Principle] Quantized - agent cannot perceive precise values
 * [Key] signature is temporary identifier, NOT node ID
 */
export interface ScanResult {
    /** Quantized distance */
    distance: DistanceLevel;
    /** Quantized heat level */
    heat: HeatLevel;
    /** Node classification */
    kind: NodeKind;
    /** Temporary identifier for move({ toward: sig }) */
    signature: number;
    /** Confidence level (future: based on distance/noise) */
    confidence?: ConfidenceLevel;
}
/**
 * Heat boost configuration
 * Hot nodes are visible from further away
 */
export interface HeatBoostConfig {
    low: number;
    mid: number;
    high: number;
}
/**
 * Scan Configuration
 *
 * [Design] Heat extends visibility range
 * [Design] maxResults limits computation cost
 */
export interface ScanConfig {
    /** Base scan range (cosine distance) */
    baseRange: number;
    /** Range extension based on heat level */
    heatBoost: HeatBoostConfig;
    /** Maximum results (computation cost limit) */
    maxResults: number;
    /** Minimum heat to be visible */
    minHeat: number;
}
/**
 * Default scan configuration
 */
export declare const DEFAULT_SCAN_CONFIG: ScanConfig;
/**
 * Distance thresholds for quantization
 * [Note] Values may need adjustment per embedding model
 */
export interface DistanceThresholds {
    near: number;
    mid: number;
}
/**
 * Heat thresholds for quantization
 */
export interface HeatThresholds {
    low: number;
    mid: number;
}
/**
 * Physics parameters for movement
 */
export interface PhysicsConfig {
    /** Weight of previous velocity (inertia) */
    inertiaWeight: number;
    /** Weight of random noise in drift */
    noiseWeight: number;
    /** Base step size per move */
    stepSize: number;
}
/**
 * Move Configuration
 *
 * [Principle] Dimension-independent: vectorDimension from embeddingProvider
 * [Principle] Thresholds configurable per embedding model
 */
export interface MoveConfig {
    /** Vector dimension (from embedding provider) */
    vectorDimension: number;
    /** Distance quantization thresholds */
    distanceThresholds: DistanceThresholds;
    /** Heat quantization thresholds */
    heatThresholds: HeatThresholds;
    /** Physics parameters */
    physics: PhysicsConfig;
    /** Scan configuration */
    scan: ScanConfig;
}
/**
 * Default move configuration (for all-MiniLM-L6-v2, 384-dim)
 */
export declare const DEFAULT_MOVE_CONFIG: MoveConfig;
/**
 * Block reason for failed movement
 */
export type BlockReason = "congestion" | "boundary" | "decayZone" | "permission" | "expired";
/**
 * Move Result (internal, full precision)
 */
export interface MoveResultInternal {
    success: boolean;
    newVector: number[];
    stepsExecuted: number;
    blocked?: BlockReason;
}
/**
 * Signature entry: maps temporary signature to node info
 *
 * [Lifetime] Signatures decay over time and movement distance
 */
export interface SignatureEntry {
    signature: number;
    nodeId: string;
    vector: number[];
    createdAt: number;
    agentVectorAtCreation: number[];
}
//# sourceMappingURL=movement.d.ts.map