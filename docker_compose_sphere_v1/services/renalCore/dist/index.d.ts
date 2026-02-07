/**
 * Sphere RenalCore - Entry Point
 *
 * Phase 1: 純粋なデータ構造
 * Phase 2+: ビジネスロジック
 */
export { NodeFlag } from "./core/types.js";
export type { ReferenceRecord, SpatialField, CrystallizationRecord, CrystallizationData, } from "./core/types.js";
export type { SphereNode, NodeKind, AmberRecord, SpectralLink, Constellation, StableConfig, RenalCoreConfig, RenalCoreFlagsConfig, PulsePacket, PulseSignal, PulseConfig, PulseStatistics, } from "./types/index.js";
export { PulseFlag } from "./types/index.js";
export { hasFlag, decayHeat, computeEffectiveDecayRate, computeEffectiveHeat, computeEffectiveTTLDecay, computeEffectiveWeight, computeEffectiveWeightDecay, } from "./lib/bit_math.js";
export { computePhysicsModifiers } from "./lib/physics.js";
export type { FlagPhysicsModifiers } from "./lib/physics.js";
export { RenalCore } from "./renalcore.js";
export type { RenalCoreConfig as RenalCoreClassConfig } from "./renalcore.js";
export type { Vector3, EmbeddingVector, AgentPersonalityType, AgentPersonality, AgentState, AgentActionState, SphereAgent, PerceivedHeat, PerceivedCongestion, RadarData, FocusData, AgentPerception, AgentEvaluation, AggregatedEvaluation, EvaluationField, AgentActionType, AgentAction, FocusQueueEntry, FocusBuffer, FocusEcho, ReceivedEcho, ExperienceCapsule, ExplorationReport, AgentDiscovery, GhostPulse, VoxelState, SpatialFieldV2, AgentConfig, NodeSeed, SubmissionCapsule, IncarnationResult, IIncarnationPipeline, } from "./types/index.js";
export { DEFAULT_AGENT_CONFIG } from "./types/index.js";
export { AgentManager } from "./agent/agent-manager.js";
export type { SphereContext, PulseEvent } from "./agent/sphere-context.js";
export { createSphereContext, runAgentStep } from "./agent/sphere-context.js";
export { createAgent, createPersonality, getEffectiveType, decideAction, updateAgentState, createGhostPulse, evaluateDestination, } from "./agent/agent.js";
export { addNoise, quantizeHeat, quantizeCongestion, wobbleDirection, randomUnitVector, aggregateEvaluations, decayEvaluation, createFocusBuffer, computeSignalDegradation, tryJoinFocusBuffer, leaveFocusBuffer, processFocusBufferTimeouts, getDegradedFocusData, createFocusEcho, propagateEcho, applyPhaseShift, processEchoesForAgent, } from "./agent/perception.js";
//# sourceMappingURL=index.d.ts.map