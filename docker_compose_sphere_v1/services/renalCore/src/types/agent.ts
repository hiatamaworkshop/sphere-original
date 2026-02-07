/**
 * Sphere Project - Agent Types (Phase 4)
 *
 * [Principle] POD (Plain Old Data): No methods, no logic.
 * [Philosophy] Agents don't know the truth:
 *   - Perception is always incomplete and distorted
 *   - Evaluations are subjective and degrade over time
 *   - Actions depend on personality × state × chance
 */

// ============================================================
// Vector Types
// ============================================================

/** 3D position in cell-local coordinates */
export type Vector3 = [number, number, number];

/** Semantic embedding vector (1536-dim or configured) */
export type EmbeddingVector = number[];

// ============================================================
// Agent Core Types
// ============================================================

/**
 * Agent behavior archetype
 * Each type has different tendencies but can drift based on state
 */
export type AgentPersonalityType =
  | "follower"    // Follows high-rated nodes (efficient, safe, not creative)
  | "pioneer"     // Explores unrated nodes (discovers new, may be inefficient)
  | "critic"      // Examines controversial nodes (quality assurance, slow)
  | "trust_based" // Follows trusted agents (social learning, echo chamber risk)
  | "random";     // No particular tendency (fallback/exhausted state)

/**
 * Agent personality configuration (immutable)
 */
export interface AgentPersonality {
  type: AgentPersonalityType;
  curiosity: number;         // 0.0~1.0 (high = prefers unknown)
  patience: number;          // 0.0~1.0 (high = tolerates congestion)
  socialAwareness: number;   // 0.0~1.0 (high = yields to others)
  explorationRadius: number; // Base perception range in cells
}

/**
 * Agent dynamic state (mutable, affects behavior)
 */
export interface AgentState {
  fatigue: number;           // 0.0~1.0 (high = tends toward random)
  boredom: number;           // 0.0~1.0 (high = tends toward pioneer)
  recentSameEvals: number;   // Count of similar evaluations (triggers boredom)
  energy: number;            // 0.0~1.0 (actions consume, rest recovers)
  lastActionTick: number;    // For staggering updates
}

/**
 * Agent action state
 */
export type AgentActionState =
  | "idle"          // Waiting for next action
  | "exploring"     // Moving through space
  | "investigating" // Deep-inspecting a node (Focus)
  | "resting"       // Recovering energy
  | "returning";    // Heading back to origin

/**
 * Main Agent entity
 */
export interface SphereAgent {
  // Identity
  id: string;
  name: string;
  createdAt: number;

  // Spatial position
  cellId: string;                    // Current cell (e.g., "1:2:0")
  position: Vector3;                 // Local position within cell
  prevPosition: Vector3;             // Previous position (for trajectory)

  // Semantic position (re-embedding based movement)
  vector: EmbeddingVector;           // Current semantic coordinates
  prevVector: EmbeddingVector;       // Previous (for Ghost pulse)

  // Internal state (affects re-embedding)
  internalState: string[];           // Memory stack (text, limited to N entries)
  maxInternalStateSize: number;      // Typically 10

  // Configuration
  personality: AgentPersonality;

  // Dynamic state
  state: AgentState;
  actionState: AgentActionState;

  // Current target
  currentTarget: string | null;      // Target node ID
  focusHoldTick: number;             // Ticks remaining in focus

  // Evaluation memory
  visitedNodes: string[];            // Recently visited (short-term)
  evaluations: AgentEvaluation[];    // Own evaluations (limited)
  trustedAgents: string[];           // Agent IDs this agent trusts
}

// ============================================================
// Perception Types
// ============================================================

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
  // Radar: low-precision, wide range, cached
  radar: {
    range: number;           // Cells
    updateInterval: number;  // Ticks between updates
    lastUpdate: number;      // Tick of last update
    data: RadarData[];       // Cached results
  };

  // Focus: high-precision, close range, per-tick
  focus: {
    range: number;           // Cells (typically 1)
    data: FocusData[];       // Current visible nodes
  };

  // Perception parameters (for noise/delay)
  delay: number;             // Ticks of perception delay
  noiseLevel: number;        // 0.0~0.3 typical
}

// ============================================================
// Evaluation Types
// ============================================================

/**
 * Agent's evaluation of a node (subjective)
 */
export interface AgentEvaluation {
  nodeId: string;
  agentId: string;
  timestamp: number;

  // Evaluation axes (all subjective)
  relevance: number;         // -1.0~1.0 (relevance to agent's interest)
  quality: number;           // -1.0~1.0 (perceived quality)
  novelty: number;           // 0.0~1.0 (newness)

  // Implicit evaluation (from behavior)
  dwellTime: number;         // Ticks spent at node
  revisitCount: number;      // Times revisited

  // Confidence (agent's own certainty)
  confidence: number;        // 0.0~1.0
}

/**
 * Aggregated evaluation (always degraded from individual evaluations)
 */
export interface AggregatedEvaluation {
  value: number;             // 0.0~1.0 (degraded average)
  uncertainty: number;       // Standard deviation
  evaluatorCount: number;    // Number of evaluators
  freshness: number;         // Timestamp of most recent
  trend: "rising" | "stable" | "falling";
}

/**
 * Evaluation field attached to a node
 */
export interface EvaluationField {
  nodeId: string;
  aggregated: AggregatedEvaluation;
  trusted: AgentEvaluation[];  // Evaluations from trusted agents
  activityHeat: number;        // Recent evaluation activity
}

// ============================================================
// Action Types
// ============================================================

/**
 * Agent action result
 */
export type AgentActionType =
  | "move"        // Move toward direction
  | "focus"       // Deep-inspect a node
  | "evaluate"    // Leave an evaluation
  | "emit"        // Send a pulse to active bus
  | "rest"        // Recover energy
  | "return";     // Return with capsule

export interface AgentAction {
  type: AgentActionType;
  target?: string;           // Node ID or cell ID
  direction?: Vector3;       // Movement direction
  payload?: unknown;         // Action-specific data
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

// ============================================================
// Focus Buffer & Echo Types (Gravity Well Model)
// ============================================================

/**
 * Focus Buffer: Multiple agents can focus simultaneously, but with degradation
 *
 * Physics model: Focus = gravity well, multiple observers = interference
 * Signal degrades: effectiveSignal = baseSignal / (1 + α * (n - 1))
 */
export interface FocusBuffer {
  nodeId: string;
  activeAgents: Set<string>;     // Currently focusing (max: maxConcurrent)
  waitingQueue: string[];        // Waiting agents (FIFO)
  maxConcurrent: number;         // Max simultaneous focus (default: 3)
  congestionCoefficient: number; // α in degradation formula (default: 0.15)
  holdStartTicks: Map<string, number>; // agentId -> start tick
  maxHoldDuration: number;       // Auto-release after N ticks
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
  // Source (anonymized)
  sourceCell: string;            // Cell where focus originated
  timestamp: number;

  // Target node (partial info only)
  nodeId: string;
  kind: string;
  perceivedHeat: PerceivedHeat;  // Already degraded from source

  // Echo metadata
  strength: number;              // 0.0~1.0 (decays with distance)
  phaseShift: number;            // 0.0~1.0 (randomized per recipient)
}

/**
 * Agent's received echo (after phase shift applied)
 *
 * Same echo, different interpretation per agent
 */
export interface ReceivedEcho {
  echo: FocusEcho;
  receivedAt: number;

  // Phase-shifted perception (different per agent)
  shiftedHeat: PerceivedHeat;    // May differ from echo.perceivedHeat
  salience: number;              // 0.0~1.0 (how much it "catches attention")

  // Agent's interpretation (optional, for curious agents)
  interpretation?: "interesting" | "mundane" | "suspicious" | "unclear";
}

// ============================================================
// SphereContext API Types
// ============================================================

/**
 * Exploration Report: Internal tracking of agent's journey
 * (Not submitted to Periphery - for internal analytics only)
 */
export interface ExplorationReport {
  agentId: string;
  explorationPath: string[];  // Node IDs visited
  discoveries: AgentDiscovery[];
  totalTicks: number;
  timestamp: number;
}

// ============================================================
// Submission Types (Periphery-compatible)
// ============================================================

/**
 * Node Seed: Pre-incarnation node data
 * [Design] Two-axis evaluation:
 *   - tags: Direction (WHERE) - vectorized for spatial positioning
 *   - summary: Content - read when agent approaches
 */
export interface NodeSeed {
  tags: string[];        // Evaluation tags → vectorized (140 bytes max)
  summary: string;       // Content → stored in payload
  payload?: string;      // Optional extended content
  initialHeat: number;   // Starting heat (0-100)
  flags: number;         // 16-bit NodeFlag
}

/**
 * Submission Capsule: What agent submits to Periphery
 * [Important] No agentId - Gatekeeper is STATELESS
 */
export interface SubmissionCapsule {
  topTier: NodeSeed[];      // Top 2 high-value nodes (vectorized)
  normalNodes: NodeSeed[];  // Up to 5 medium-value nodes
  ghostNodes: NodeSeed[];   // Up to 3 low-value, volatile nodes
  timestamp: number;
}

// ============================================================
// Incarnation Pipeline Interface
// ============================================================

/**
 * Result of incarnation pipeline processing
 */
export interface IncarnationResult {
  success: boolean;
  nodeCount: number;
  errors?: { code: string; message: string }[];
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
  significance: number;       // 0.0~1.0
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

// ============================================================
// Spatial Extension Types
// ============================================================

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

  // Existing fields
  fertility: number;
  nodeCount: number;
  avgHeat: number;
  lastUpdate: number;

  // Agent support
  voxelState: VoxelState;
  lastAgentPresence: number;
  agentIds: Set<string>;

  // Capacity management
  softCapacity: number;      // Recommended max (e.g., 50)
  hardCapacity: number;      // Absolute max (e.g., 100)

  // Ghost summary (for sleep optimization)
  ghostSummary: {
    totalHeat: number;
    count: number;
    dominantTags: string[];
  };

  // Evaluation summary
  evaluationSummary?: {
    avgQuality: number;
    evaluatorCount: number;
    congestion: number;
  };
}

// ============================================================
// Configuration Types
// ============================================================

/**
 * Agent system configuration
 */
export interface AgentConfig {
  // Tick intervals (in base ticks, typically 100ms)
  agentTickInterval: number;     // Agent update (default: 1 = 100ms)
  radarUpdateInterval: number;   // Radar refresh (default: 10 = 1s)

  // Perception
  defaultRadarRange: number;     // Cells (default: 5)
  defaultFocusRange: number;     // Cells (default: 1)
  perceptionDelay: number;       // Ticks (default: 2)
  perceptionNoise: number;       // 0.0~0.3 (default: 0.15)

  // Evaluation
  evaluationDecayRate: number;   // Per tick (default: 0.95)
  aggregationLoss: number;       // 0.0~1.0 (default: 0.2 = 20% lost)

  // Focus (legacy single-holder)
  defaultFocusDuration: number;  // Ticks (default: 5)

  // Focus Buffer (gravity well model)
  focusMaxConcurrent: number;    // Max simultaneous observers (default: 3)
  focusCongestionCoeff: number;  // α in signal degradation (default: 0.15)
  focusBufferHoldDuration: number; // Auto-release ticks (default: 10)

  // Focus Echo (gravity wave propagation)
  echoEnabled: boolean;          // Enable echo system (default: true)
  echoRange: number;             // Cells for echo propagation (default: 1 = same cell)
  echoStrengthDecay: number;     // Strength loss per cell (default: 0.5)
  echoPhaseVariance: number;     // Phase shift variance (default: 0.3)
  echoMinStrength: number;       // Below this, echo is discarded (default: 0.2)

  // Capacity
  defaultSoftCapacity: number;   // Agents per cell (default: 50)
  defaultHardCapacity: number;   // Absolute max (default: 100)

  // State
  fatigueRecoveryRate: number;   // Per rest tick (default: 0.1)
  energyConsumptionRate: number; // Per action (default: 0.05)
  boredomThreshold: number;      // recentSameEvals before bored (default: 5)

  // Internal state
  maxInternalStateSize: number;  // Memory stack size (default: 10)
}

/**
 * Default agent configuration
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  agentTickInterval: 1,
  radarUpdateInterval: 10,
  defaultRadarRange: 5,
  defaultFocusRange: 1,
  perceptionDelay: 2,
  perceptionNoise: 0.15,
  evaluationDecayRate: 0.95,
  aggregationLoss: 0.2,
  defaultFocusDuration: 5,

  // Focus Buffer (gravity well)
  focusMaxConcurrent: 3,         // 3 agents can observe simultaneously
  focusCongestionCoeff: 0.15,    // 15% signal loss per additional observer
  focusBufferHoldDuration: 10,   // 10 ticks = 1 second hold

  // Focus Echo (gravity wave)
  echoEnabled: true,
  echoRange: 1,                  // Same cell only by default
  echoStrengthDecay: 0.5,        // 50% loss per cell distance
  echoPhaseVariance: 0.3,        // ±30% phase shift variance
  echoMinStrength: 0.2,          // Discard if below 20%

  defaultSoftCapacity: 50,
  defaultHardCapacity: 100,
  fatigueRecoveryRate: 0.1,
  energyConsumptionRate: 0.05,
  boredomThreshold: 5,
  maxInternalStateSize: 10,
};
