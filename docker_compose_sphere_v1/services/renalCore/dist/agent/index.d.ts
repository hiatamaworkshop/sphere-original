/**
 * Sphere Project - Agent Module Exports (Phase 4)
 */
export type { Vector3, EmbeddingVector, AgentPersonalityType, AgentPersonality, AgentState, AgentActionState, SphereAgent, PerceivedHeat, PerceivedCongestion, RadarData, FocusData, AgentPerception, AgentEvaluation, AggregatedEvaluation, EvaluationField, AgentActionType, AgentAction, FocusQueueEntry, ExperienceCapsule, AgentDiscovery, GhostPulse, VoxelState, SpatialFieldV2, AgentConfig, } from "../types/agent.js";
export { DEFAULT_AGENT_CONFIG } from "../types/agent.js";
export { createAgent, createPersonality, getEffectiveType, decideAction, updateAgentState, updateInternalState, recordVisit, createEvaluation, createDiscovery, createExperienceCapsule, createGhostPulse, evaluateDestination, } from "./agent.js";
export { addNoise, quantizeHeat, quantizeCongestion, wobbleDirection, randomUnitVector, generateRadarData, updateRadarPerception, generateFocusData, updateFocusPerception, aggregateEvaluations, decayEvaluation, createAgentPerception, createFocusBuffer, computeSignalDegradation, tryJoinFocusBuffer, leaveFocusBuffer, processFocusBufferTimeouts, getDegradedFocusData, createFocusEcho, propagateEcho, applyPhaseShift, processEchoesForAgent, } from "./perception.js";
export { AgentManager } from "./agent-manager.js";
export type { SphereContext, PulseEvent } from "./sphere-context.js";
export { createSphereContext, runAgentStep } from "./sphere-context.js";
//# sourceMappingURL=index.d.ts.map