/**
 * Sphere Project - Agent Perception System (Phase 4)
 *
 * [Philosophy] "Agents don't know the truth"
 * - Quantization: Continuous values → discrete levels
 * - Noise: Always contains random error
 * - Delay: Sees past state, not current
 */
import type { PerceivedHeat, PerceivedCongestion, RadarData, FocusData, AgentPerception, SphereAgent, SpatialFieldV2, AggregatedEvaluation, AgentConfig, Vector3, FocusBuffer, FocusEcho, ReceivedEcho } from "../types/agent.js";
import type { SphereNode } from "../types/sphere_node.js";
/**
 * Add noise to a value
 * @param value Original value
 * @param noiseLevel Noise magnitude (0.0~0.3 typical)
 * @returns Value with noise
 */
export declare function addNoise(value: number, noiseLevel: number): number;
/**
 * Quantize heat to discrete levels
 * Agents cannot see exact heat values
 */
export declare function quantizeHeat(heat: number, noiseLevel?: number): PerceivedHeat;
/**
 * Quantize congestion (agent count / capacity)
 */
export declare function quantizeCongestion(ratio: number, noiseLevel?: number): PerceivedCongestion;
/**
 * Calculate direction with wobble (gradient feels like "wind")
 * @param baseDirection Computed gradient direction
 * @param wobbleFactor How much randomness to add (0.0~1.0, default 0.3)
 */
export declare function wobbleDirection(baseDirection: Vector3, wobbleFactor?: number): Vector3;
/**
 * Random unit vector (for random walk)
 */
export declare function randomUnitVector(): Vector3;
/**
 * Generate radar data for a cell
 * Called every N ticks (not every tick)
 */
export declare function generateRadarData(cellId: string, cell: SpatialFieldV2, agentPosition: Vector3, trustedAgentIds: Set<string>, config: AgentConfig): RadarData;
/**
 * Update radar perception for an agent
 * Only called when updateInterval has passed
 */
export declare function updateRadarPerception(agent: SphereAgent, nearbyCells: SpatialFieldV2[], currentTick: number, config: AgentConfig): RadarData[];
/**
 * Generate focus data for a node
 * High precision but still has some noise
 */
export declare function generateFocusData(node: SphereNode, evaluationField: AggregatedEvaluation | undefined, nearbyAgentCount: number, config: AgentConfig): FocusData;
/**
 * Update focus perception for an agent
 * Called every tick for nearby nodes
 */
export declare function updateFocusPerception(agent: SphereAgent, nearbyNodes: SphereNode[], evaluationFields: Map<string, AggregatedEvaluation>, agentCountByNode: Map<string, number>, config: AgentConfig): FocusData[];
/**
 * Aggregate evaluations with mandatory degradation
 * "Aggregation never approaches truth"
 */
export declare function aggregateEvaluations(evaluations: {
    quality: number;
    timestamp: number;
}[], config: AgentConfig): AggregatedEvaluation;
/**
 * Decay aggregated evaluation over time
 * "Evaluations don't last forever"
 */
export declare function decayEvaluation(evaluation: AggregatedEvaluation, elapsedTicks: number, config: AgentConfig): AggregatedEvaluation;
/**
 * Create a new focus buffer for a node
 */
export declare function createFocusBuffer(nodeId: string, config: AgentConfig): FocusBuffer;
/**
 * Compute signal degradation based on concurrent observers
 *
 * Physics: effectiveSignal = baseSignal / (1 + α * (n - 1))
 * - n=1: full signal
 * - n=2: signal / (1 + α)
 * - n=3: signal / (1 + 2α)
 *
 * @param baseSignal Original signal strength (0.0~1.0)
 * @param observerCount Number of current observers
 * @param alpha Congestion coefficient (default: 0.15)
 * @returns Degraded signal strength
 */
export declare function computeSignalDegradation(baseSignal: number, observerCount: number, alpha?: number): number;
/**
 * Try to join a focus buffer
 * @returns { joined: true, position: 0 } if joined as observer
 * @returns { joined: false, position: N } if queued at position N
 */
export declare function tryJoinFocusBuffer(buffer: FocusBuffer, agentId: string, currentTick: number): {
    joined: boolean;
    position: number;
};
/**
 * Leave a focus buffer (voluntary or timeout)
 */
export declare function leaveFocusBuffer(buffer: FocusBuffer, agentId: string): void;
/**
 * Process focus buffer timeouts
 * @returns List of agents that were auto-released
 */
export declare function processFocusBufferTimeouts(buffer: FocusBuffer, currentTick: number): string[];
/**
 * Get degraded focus data based on buffer congestion
 */
export declare function getDegradedFocusData(baseFocusData: FocusData, buffer: FocusBuffer, config: AgentConfig): FocusData;
/**
 * Create a focus echo when an agent focuses on a node
 *
 * Echo carries only "atmosphere", not "meaning":
 * - nodeId, kind: what is being observed
 * - perceivedHeat: vague sense (already degraded)
 * - NO payload, NO evaluation, NO observer identity
 */
export declare function createFocusEcho(sourceCell: string, nodeId: string, kind: string, heat: number, timestamp: number, config: AgentConfig): FocusEcho;
/**
 * Propagate echo to a target cell
 *
 * Strength decays with distance:
 * - Same cell: 100%
 * - Adjacent cell: 50% (configurable)
 * - 2 cells away: 25%
 *
 * @returns Echo with reduced strength, or null if too weak
 */
export declare function propagateEcho(echo: FocusEcho, sourceCellId: string, targetCellId: string, config: AgentConfig): FocusEcho | null;
/**
 * Apply phase shift to an echo for a specific agent
 *
 * "Same echo, different interpretation per agent"
 * - Heat perception may shift
 * - Salience varies (how much it catches attention)
 *
 * @param echo The incoming echo
 * @param agentId Used as seed for deterministic-ish randomness
 * @param config Configuration
 * @returns Agent-specific received echo
 */
export declare function applyPhaseShift(echo: FocusEcho, agentId: string, curiosity: number, config: AgentConfig): ReceivedEcho;
/**
 * Process echoes for an agent
 * Filters by strength and applies phase shift
 */
export declare function processEchoesForAgent(echoes: FocusEcho[], agent: SphereAgent, config: AgentConfig): ReceivedEcho[];
/**
 * Create initial perception state for an agent
 */
export declare function createAgentPerception(config: AgentConfig): AgentPerception;
//# sourceMappingURL=perception.d.ts.map