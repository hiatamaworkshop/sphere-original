/**
 * Sphere Project - Agent Types (Phase 4)
 *
 * [Principle] POD (Plain Old Data): No methods, no logic.
 * [Philosophy] Agents don't know the truth:
 *   - Perception is always incomplete and distorted
 *   - Evaluations are subjective and degrade over time
 *   - Actions depend on personality × state × chance
 */
/**
 * Default agent configuration
 */
export const DEFAULT_AGENT_CONFIG = {
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
    focusMaxConcurrent: 3, // 3 agents can observe simultaneously
    focusCongestionCoeff: 0.15, // 15% signal loss per additional observer
    focusBufferHoldDuration: 10, // 10 ticks = 1 second hold
    // Focus Echo (gravity wave)
    echoEnabled: true,
    echoRange: 1, // Same cell only by default
    echoStrengthDecay: 0.5, // 50% loss per cell distance
    echoPhaseVariance: 0.3, // ±30% phase shift variance
    echoMinStrength: 0.2, // Discard if below 20%
    defaultSoftCapacity: 50,
    defaultHardCapacity: 100,
    fatigueRecoveryRate: 0.1,
    energyConsumptionRate: 0.05,
    boredomThreshold: 5,
    maxInternalStateSize: 10,
};
//# sourceMappingURL=agent.js.map