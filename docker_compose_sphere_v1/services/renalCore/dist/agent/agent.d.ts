/**
 * Sphere Project - SphereAgent Class (Phase 4)
 *
 * [Philosophy] Movement = Internal state change → Re-embedding
 * - Agents don't "move" physically, they "re-project"
 * - Actions are non-deterministic (personality × state × chance)
 * - Three layers: Thinking / Projection / Renal
 */
import type { SphereAgent, AgentPersonality, AgentPersonalityType, AgentAction, AgentEvaluation, AgentDiscovery, ExplorationReport, SubmissionCapsule, GhostPulse, EmbeddingVector, FocusData, RadarData, AgentConfig, AggregatedEvaluation } from "../types/agent.js";
/**
 * Create a new SphereAgent
 */
export declare function createAgent(name: string, startCellId: string, startVector: EmbeddingVector, personalityType: AgentPersonalityType | undefined, config: AgentConfig): SphereAgent;
/**
 * Create personality from type with random variation
 */
export declare function createPersonality(type: AgentPersonalityType): AgentPersonality;
/**
 * Determine effective behavior type based on state
 * "Same Follower behaves differently each day"
 */
export declare function getEffectiveType(agent: SphereAgent): AgentPersonalityType;
/**
 * Decide next action based on perception and state
 */
export declare function decideAction(agent: SphereAgent, radarData: RadarData[], focusData: FocusData[], config: AgentConfig): AgentAction;
/**
 * Update agent state after action
 */
export declare function updateAgentState(agent: SphereAgent, action: AgentAction, success: boolean, config: AgentConfig): void;
/**
 * Update internal state with new information
 * This triggers potential re-embedding
 */
export declare function updateInternalState(agent: SphereAgent, newInfo: string): boolean;
/**
 * Record node visit
 */
export declare function recordVisit(agent: SphereAgent, nodeId: string, maxVisitedSize?: number): void;
/**
 * Create evaluation for a node
 */
export declare function createEvaluation(agent: SphereAgent, nodeId: string, focusData: FocusData, dwellTime: number): AgentEvaluation;
/**
 * Create discovery record
 */
export declare function createDiscovery(agent: SphereAgent, nodeId: string, focusData: FocusData): AgentDiscovery;
/**
 * Create exploration report (internal tracking)
 */
export declare function createExplorationReport(agent: SphereAgent, discoveries: AgentDiscovery[], totalTicks: number): ExplorationReport;
/**
 * Create submission capsule for Periphery
 *
 * [Design] Converts discoveries → NodeSeeds with tier classification
 * - Top 2 by significance → topTier (will be vectorized)
 * - Next 5 → normalNodes
 * - Remaining → ghostNodes (max 3)
 *
 * [Important] Tags are derived from evaluation, not summary content
 */
export declare function createSubmissionCapsule(discoveries: AgentDiscovery[], evaluations: AgentEvaluation[]): SubmissionCapsule;
/**
 * @deprecated Use createExplorationReport instead
 */
export declare const createExperienceCapsule: typeof createExplorationReport;
/**
 * Create ghost pulse for trajectory
 */
export declare function createGhostPulse(agent: SphereAgent, intent: GhostPulse["intent"]): GhostPulse;
/**
 * Evaluate destination with Sphere philosophy
 * "Numbers give direction, decision comes from inside"
 */
export declare function evaluateDestination(agent: SphereAgent, targetData: RadarData | FocusData, aggregatedEval: AggregatedEvaluation | undefined, config: AgentConfig): number;
//# sourceMappingURL=agent.d.ts.map