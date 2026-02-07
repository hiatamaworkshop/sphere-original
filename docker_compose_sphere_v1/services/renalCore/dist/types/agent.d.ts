/**
 * Sphere Project - Agent Types (Phase 4)
 *
 * [Principle] POD (Plain Old Data): No methods, no logic.
 * [Philosophy] Agents don't know the truth:
 *   - Perception is always incomplete and distorted
 *   - Evaluations are subjective and degrade over time
 *   - Actions depend on personality × state × chance
 */
/** 3D position in cell-local coordinates */
export type Vector3 = [number, number, number];
/** Semantic embedding vector (1536-dim or configured) */
export type EmbeddingVector = number[];
/**
 * Agent behavior archetype
 * Each type has different tendencies but can drift based on state
 */
export type AgentPersonalityType = "follower" | "pioneer" | "critic" | "trust_based" | "random";
/**
 * Agent personality configuration (immutable)
 */
export interface AgentPersonality {
    type: AgentPersonalityType;
    curiosity: number;
    patience: number;
    socialAwareness: number;
    explorationRadius: number;
}
/**
 * Agent dynamic state (mutable, affects behavior)
 */
export interface AgentState {
    fatigue: number;
    boredom: number;
    recentSameEvals: number;
    energy: number;
    lastActionTick: number;
}
/**
 * Agent action state
 */
export type AgentActionState = "idle" | "exploring" | "investigating" | "resting" | "returning";
/**
 * Main Agent entity
 */
export interface SphereAgent {
    id: string;
    name: string;
    createdAt: number;
    cellId: string;
    position: Vector3;
    prevPosition: Vector3;
    vector: EmbeddingVector;
    prevVector: EmbeddingVector;
    internalState: string[];
    maxInternalStateSize: number;
    personality: AgentPersonality;
    state: AgentState;
    actionState: AgentActionState;
    currentTarget: string | null;
    focusHoldTick: number;
    visitedNodes: string[];
    evaluations: AgentEvaluation[];
    trustedAgents: string[];
}
/**
 * Quantized heat perception (agents don't see exact values)
 */
export type PerceivedHeat = "low" | "mid" | "high";
/**
 * Quantized congestion perception
 */
export type PerceivedCongestion = "empty" | "sparse" | "moderate" | "crowded" | "full";
/**
 * Radar data (low-precision, cell-level summary)
 */
export interface RadarData {
    cellId: string;
    distance: number;
    summary: {
        nodeCount: number;
        perceivedHeat: PerceivedHeat;
        congestion: PerceivedCongestion;
        hasTrustedAgent: boolean;
    };
}
/**
 * Focus data (high-precision, node-level detail)
 */
export interface FocusData {
    nodeId: string;
    kind: string;
    perceivedHeat: PerceivedHeat;
    payload?: {
        summary?: string;
        tags?: string[];
    };
    aggregatedEvaluation?: AggregatedEvaluation;
    nearbyAgentCount: number;
}
/**
 * Agent perception state
 */
export interface AgentPerception {
    radar: {
        range: number;
        updateInterval: number;
        lastUpdate: number;
        data: RadarData[];
    };
    focus: {
        range: number;
        data: FocusData[];
    };
    delay: number;
    noiseLevel: number;
}
/**
 * Agent's evaluation of a node (subjective)
 */
export interface AgentEvaluation {
    nodeId: string;
    agentId: string;
    timestamp: number;
    relevance: number;
    quality: number;
    novelty: number;
    dwellTime: number;
    revisitCount: number;
    confidence: number;
}
/**
 * Aggregated evaluation (always degraded from individual evaluations)
 */
export interface AggregatedEvaluation {
    value: number;
    uncertainty: number;
    evaluatorCount: number;
    freshness: number;
    trend: "rising" | "stable" | "falling";
}
/**
 * Evaluation field attached to a node
 */
export interface EvaluationField {
    nodeId: string;
    aggregated: AggregatedEvaluation;
    trusted: AgentEvaluation[];
    activityHeat: number;
}
/**
 * Agent action result
 */
export type AgentActionType = "move" | "focus" | "evaluate" | "emit" | "rest" | "return";
export interface AgentAction {
    type: AgentActionType;
    target?: string;
    direction?: Vector3;
    payload?: unknown;
}
/**
 * Focus queue entry (legacy single-holder)
 */
export interface FocusQueueEntry {
    nodeId: string;
    currentHolder: string | null;
    holdStartTick: number;
    maxHoldDuration: number;
    waitingAgents: string[];
}
/**
 * Focus Buffer: Multiple agents can focus simultaneously, but with degradation
 *
 * Physics model: Focus = gravity well, multiple observers = interference
 * Signal degrades: effectiveSignal = baseSignal / (1 + α * (n - 1))
 */
export interface FocusBuffer {
    nodeId: string;
    activeAgents: Set<string>;
    waitingQueue: string[];
    maxConcurrent: number;
    congestionCoefficient: number;
    holdStartTicks: Map<string, number>;
    maxHoldDuration: number;
}
/**
 * Focus Echo: "Ripple" that propagates to nearby agents
 *
 * Physics model: Focus creates gravity wave, nearby agents sense "distortion"
 * Not the content, just the "presence" of attention
 *
 * Key principle: Echo transmits "atmosphere" not "meaning"
 * - nodeId: yes (what is being observed)
 * - kind: yes (what type of thing)
 * - heat: degraded (vague sense of importance)
 * - payload: NO (must observe yourself)
 * - who: NO (anonymous attention)
 */
export interface FocusEcho {
    sourceCell: string;
    timestamp: number;
    nodeId: string;
    kind: string;
    perceivedHeat: PerceivedHeat;
    strength: number;
    phaseShift: number;
}
/**
 * Agent's received echo (after phase shift applied)
 *
 * Same echo, different interpretation per agent
 */
export interface ReceivedEcho {
    echo: FocusEcho;
    receivedAt: number;
    shiftedHeat: PerceivedHeat;
    salience: number;
    interpretation?: "interesting" | "mundane" | "suspicious" | "unclear";
}
/**
 * Exploration Report: Internal tracking of agent's journey
 * (Not submitted to Periphery - for internal analytics only)
 */
export interface ExplorationReport {
    agentId: string;
    explorationPath: string[];
    discoveries: AgentDiscovery[];
    totalTicks: number;
    timestamp: number;
}
/**
 * Node Seed: Pre-incarnation node data
 * [Design] Two-axis evaluation:
 *   - tags: Direction (WHERE) - vectorized for spatial positioning
 *   - summary: Content - read when agent approaches
 */
export interface NodeSeed {
    tags: string[];
    summary: string;
    payload?: string;
    initialHeat: number;
    flags: number;
}
/**
 * Submission Capsule: What agent submits to Periphery
 * [Important] No agentId - Gatekeeper is STATELESS
 */
export interface SubmissionCapsule {
    topTier: NodeSeed[];
    normalNodes: NodeSeed[];
    ghostNodes: NodeSeed[];
    timestamp: number;
}
/**
 * Result of incarnation pipeline processing
 */
export interface IncarnationResult {
    success: boolean;
    nodeCount: number;
    errors?: {
        code: string;
        message: string;
    }[];
}
/**
 * Incarnation Pipeline Interface
 *
 * [Design] Abstraction for capsule → node conversion
 * [Usage]
 *   - Internal agents: Direct injection (no HTTP)
 *   - External agents: Via HTTP API
 *
 * [Implementation] Periphery provides IncarnationPipeline
 */
export interface IIncarnationPipeline {
    /**
     * Process a capsule through the incarnation pipeline
     * @param capsule Submission capsule from agent
     * @returns Result with node count or errors
     */
    ingest(capsule: SubmissionCapsule): Promise<IncarnationResult>;
}
/**
 * @deprecated Use ExplorationReport for internal tracking
 *             Use SubmissionCapsule for Periphery submission
 */
export type ExperienceCapsule = ExplorationReport;
/**
 * Discovery made by agent
 */
export interface AgentDiscovery {
    nodeId: string;
    timestamp: number;
    significance: number;
    summary: string;
}
/**
 * Ghost pulse (trajectory marker)
 */
export interface GhostPulse {
    agentId: string;
    fromVector: EmbeddingVector;
    toVector: EmbeddingVector;
    intent: "exploration" | "return" | "focus" | "flee";
    timestamp: number;
}
/**
 * Voxel state for Active Voxel optimization
 */
export type VoxelState = "sleep" | "active" | "hot";
/**
 * Extended SpatialField with agent support
 */
export interface SpatialFieldV2 {
    cellId: string;
    centerVector: EmbeddingVector;
    fertility: number;
    nodeCount: number;
    avgHeat: number;
    lastUpdate: number;
    voxelState: VoxelState;
    lastAgentPresence: number;
    agentIds: Set<string>;
    softCapacity: number;
    hardCapacity: number;
    ghostSummary: {
        totalHeat: number;
        count: number;
        dominantTags: string[];
    };
    evaluationSummary?: {
        avgQuality: number;
        evaluatorCount: number;
        congestion: number;
    };
}
/**
 * Agent system configuration
 */
export interface AgentConfig {
    agentTickInterval: number;
    radarUpdateInterval: number;
    defaultRadarRange: number;
    defaultFocusRange: number;
    perceptionDelay: number;
    perceptionNoise: number;
    evaluationDecayRate: number;
    aggregationLoss: number;
    defaultFocusDuration: number;
    focusMaxConcurrent: number;
    focusCongestionCoeff: number;
    focusBufferHoldDuration: number;
    echoEnabled: boolean;
    echoRange: number;
    echoStrengthDecay: number;
    echoPhaseVariance: number;
    echoMinStrength: number;
    defaultSoftCapacity: number;
    defaultHardCapacity: number;
    fatigueRecoveryRate: number;
    energyConsumptionRate: number;
    boredomThreshold: number;
    maxInternalStateSize: number;
}
/**
 * Default agent configuration
 */
export declare const DEFAULT_AGENT_CONFIG: AgentConfig;
//# sourceMappingURL=agent.d.ts.map