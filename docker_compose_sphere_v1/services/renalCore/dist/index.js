/**
 * Sphere RenalCore - Entry Point
 *
 * Phase 1: 純粋なデータ構造
 * Phase 2+: ビジネスロジック
 */
// === Core Types ===
export { NodeFlag } from "./core/types.js";
export { PulseFlag } from "./types/index.js";
// === Phase 2+: 純粋関数のエクスポート ===
export { hasFlag, decayHeat, computeEffectiveDecayRate, computeEffectiveHeat, computeEffectiveTTLDecay, computeEffectiveWeight, computeEffectiveWeightDecay, } from "./lib/bit_math.js";
export { computePhysicsModifiers } from "./lib/physics.js";
// === Phase 2+: RenalCore のエクスポート ===
export { RenalCore } from "./renalcore.js";
export { DEFAULT_AGENT_CONFIG } from "./types/index.js";
// Agent Module
export { AgentManager } from "./agent/agent-manager.js";
export { createSphereContext, runAgentStep } from "./agent/sphere-context.js";
export { createAgent, createPersonality, getEffectiveType, decideAction, updateAgentState, createGhostPulse, evaluateDestination, } from "./agent/agent.js";
export { addNoise, quantizeHeat, quantizeCongestion, wobbleDirection, randomUnitVector, aggregateEvaluations, decayEvaluation, 
// Focus Buffer (gravity well)
createFocusBuffer, computeSignalDegradation, tryJoinFocusBuffer, leaveFocusBuffer, processFocusBufferTimeouts, getDegradedFocusData, 
// Focus Echo (gravity wave)
createFocusEcho, propagateEcho, applyPhaseShift, processEchoesForAgent, } from "./agent/perception.js";
//# sourceMappingURL=index.js.map