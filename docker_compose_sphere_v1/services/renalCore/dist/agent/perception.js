/**
 * Sphere Project - Agent Perception System (Phase 4)
 *
 * [Philosophy] "Agents don't know the truth"
 * - Quantization: Continuous values → discrete levels
 * - Noise: Always contains random error
 * - Delay: Sees past state, not current
 */
// ============================================================
// Perception Utilities
// ============================================================
/**
 * Add noise to a value
 * @param value Original value
 * @param noiseLevel Noise magnitude (0.0~0.3 typical)
 * @returns Value with noise
 */
export function addNoise(value, noiseLevel) {
    const noise = (Math.random() - 0.5) * 2 * noiseLevel;
    return value + noise;
}
/**
 * Quantize heat to discrete levels
 * Agents cannot see exact heat values
 */
export function quantizeHeat(heat, noiseLevel = 0.15) {
    const perceived = addNoise(heat, noiseLevel);
    if (perceived < 0.3)
        return "low";
    if (perceived < 0.7)
        return "mid";
    return "high";
}
/**
 * Quantize congestion (agent count / capacity)
 */
export function quantizeCongestion(ratio, noiseLevel = 0.1) {
    const perceived = addNoise(ratio, noiseLevel);
    if (perceived < 0.1)
        return "empty";
    if (perceived < 0.3)
        return "sparse";
    if (perceived < 0.6)
        return "moderate";
    if (perceived < 0.9)
        return "crowded";
    return "full";
}
/**
 * Calculate direction with wobble (gradient feels like "wind")
 * @param baseDirection Computed gradient direction
 * @param wobbleFactor How much randomness to add (0.0~1.0, default 0.3)
 */
export function wobbleDirection(baseDirection, wobbleFactor = 0.3) {
    const randomDir = [
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
    ];
    // Normalize random direction
    const randLen = Math.sqrt(randomDir[0] ** 2 + randomDir[1] ** 2 + randomDir[2] ** 2);
    if (randLen > 0) {
        randomDir[0] /= randLen;
        randomDir[1] /= randLen;
        randomDir[2] /= randLen;
    }
    // Lerp between base and random
    const result = [
        baseDirection[0] * (1 - wobbleFactor) + randomDir[0] * wobbleFactor,
        baseDirection[1] * (1 - wobbleFactor) + randomDir[1] * wobbleFactor,
        baseDirection[2] * (1 - wobbleFactor) + randomDir[2] * wobbleFactor,
    ];
    // Normalize result
    const len = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2);
    if (len > 0) {
        result[0] /= len;
        result[1] /= len;
        result[2] /= len;
    }
    return result;
}
/**
 * Random unit vector (for random walk)
 */
export function randomUnitVector() {
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    return [
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
    ];
}
// ============================================================
// Radar Perception (Low precision, wide range)
// ============================================================
/**
 * Generate radar data for a cell
 * Called every N ticks (not every tick)
 */
export function generateRadarData(cellId, cell, agentPosition, trustedAgentIds, config) {
    // Calculate distance (simple cell distance for now)
    const [ax, ay, az] = cellId.split(":").map(Number);
    const [cx, cy, cz] = cell.cellId.split(":").map(Number);
    const distance = Math.sqrt((ax - cx) ** 2 + (ay - cy) ** 2 + (az - cz) ** 2);
    // Noise increases with distance
    const distanceNoiseFactor = 1 + distance * 0.1;
    const noiseLevel = config.perceptionNoise * distanceNoiseFactor;
    // Check for trusted agents
    const hasTrustedAgent = Array.from(cell.agentIds).some(id => trustedAgentIds.has(id));
    // Congestion ratio
    const congestionRatio = cell.agentIds.size / cell.softCapacity;
    return {
        cellId: cell.cellId,
        distance,
        summary: {
            nodeCount: Math.round(addNoise(cell.nodeCount, noiseLevel * 10)), // More noise for counts
            perceivedHeat: quantizeHeat(cell.avgHeat, noiseLevel),
            congestion: quantizeCongestion(congestionRatio, noiseLevel),
            hasTrustedAgent,
        },
    };
}
/**
 * Update radar perception for an agent
 * Only called when updateInterval has passed
 */
export function updateRadarPerception(agent, nearbyCells, currentTick, config) {
    const trustedSet = new Set(agent.trustedAgents);
    return nearbyCells
        .filter(cell => {
        // Filter by range
        const [ax, ay, az] = agent.cellId.split(":").map(Number);
        const [cx, cy, cz] = cell.cellId.split(":").map(Number);
        const dist = Math.max(Math.abs(ax - cx), Math.abs(ay - cy), Math.abs(az - cz));
        return dist <= agent.personality.explorationRadius;
    })
        .map(cell => generateRadarData(agent.cellId, cell, agent.position, trustedSet, config));
}
// ============================================================
// Focus Perception (High precision, close range)
// ============================================================
/**
 * Generate focus data for a node
 * High precision but still has some noise
 */
export function generateFocusData(node, evaluationField, nearbyAgentCount, config) {
    // Focus has less noise than radar
    const noiseLevel = config.perceptionNoise * 0.5;
    return {
        nodeId: node.id,
        kind: node.kind,
        perceivedHeat: quantizeHeat(node.metrics.h, noiseLevel),
        payload: node.payload ? {
            summary: node.payload.summary,
            tags: node.payload.tags,
        } : undefined,
        aggregatedEvaluation: evaluationField,
        nearbyAgentCount,
    };
}
/**
 * Update focus perception for an agent
 * Called every tick for nearby nodes
 */
export function updateFocusPerception(agent, nearbyNodes, evaluationFields, agentCountByNode, config) {
    return nearbyNodes.map(node => generateFocusData(node, evaluationFields.get(node.id), agentCountByNode.get(node.id) ?? 0, config));
}
// ============================================================
// Evaluation Aggregation
// ============================================================
/**
 * Aggregate evaluations with mandatory degradation
 * "Aggregation never approaches truth"
 */
export function aggregateEvaluations(evaluations, config) {
    if (evaluations.length === 0) {
        return {
            value: 0,
            uncertainty: 1.0,
            evaluatorCount: 0,
            freshness: 0,
            trend: "stable",
        };
    }
    // Calculate raw average
    const sum = evaluations.reduce((acc, e) => acc + e.quality, 0);
    const rawAvg = sum / evaluations.length;
    // Calculate standard deviation
    const variance = evaluations.reduce((acc, e) => acc + (e.quality - rawAvg) ** 2, 0) / evaluations.length;
    const stddev = Math.sqrt(variance);
    // Apply aggregation loss (truth is never reached)
    const degradedValue = rawAvg * (1 - config.aggregationLoss);
    // Find most recent timestamp
    const freshness = Math.max(...evaluations.map(e => e.timestamp));
    // Determine trend (simplified: based on recent vs older)
    const midpoint = Math.floor(evaluations.length / 2);
    if (evaluations.length >= 4) {
        const recentAvg = evaluations.slice(0, midpoint).reduce((a, e) => a + e.quality, 0) / midpoint;
        const olderAvg = evaluations.slice(midpoint).reduce((a, e) => a + e.quality, 0) / (evaluations.length - midpoint);
        const diff = recentAvg - olderAvg;
        if (diff > 0.1)
            return {
                value: degradedValue,
                uncertainty: stddev,
                evaluatorCount: evaluations.length,
                freshness,
                trend: "rising",
            };
        if (diff < -0.1)
            return {
                value: degradedValue,
                uncertainty: stddev,
                evaluatorCount: evaluations.length,
                freshness,
                trend: "falling",
            };
    }
    return {
        value: degradedValue,
        uncertainty: stddev,
        evaluatorCount: evaluations.length,
        freshness,
        trend: "stable",
    };
}
/**
 * Decay aggregated evaluation over time
 * "Evaluations don't last forever"
 */
export function decayEvaluation(evaluation, elapsedTicks, config) {
    const decayFactor = Math.pow(config.evaluationDecayRate, elapsedTicks);
    return {
        ...evaluation,
        value: evaluation.value * decayFactor,
        uncertainty: Math.min(1.0, evaluation.uncertainty + 0.01 * elapsedTicks),
    };
}
// ============================================================
// Focus Buffer (Gravity Well Model)
// ============================================================
/**
 * Create a new focus buffer for a node
 */
export function createFocusBuffer(nodeId, config) {
    return {
        nodeId,
        activeAgents: new Set(),
        waitingQueue: [],
        maxConcurrent: config.focusMaxConcurrent,
        congestionCoefficient: config.focusCongestionCoeff,
        holdStartTicks: new Map(),
        maxHoldDuration: config.focusBufferHoldDuration,
    };
}
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
export function computeSignalDegradation(baseSignal, observerCount, alpha = 0.15) {
    if (observerCount <= 0)
        return baseSignal;
    return baseSignal / (1 + alpha * (observerCount - 1));
}
/**
 * Try to join a focus buffer
 * @returns { joined: true, position: 0 } if joined as observer
 * @returns { joined: false, position: N } if queued at position N
 */
export function tryJoinFocusBuffer(buffer, agentId, currentTick) {
    // Already active?
    if (buffer.activeAgents.has(agentId)) {
        return { joined: true, position: 0 };
    }
    // Already in queue?
    const queuePos = buffer.waitingQueue.indexOf(agentId);
    if (queuePos >= 0) {
        return { joined: false, position: queuePos + 1 };
    }
    // Room available?
    if (buffer.activeAgents.size < buffer.maxConcurrent) {
        buffer.activeAgents.add(agentId);
        buffer.holdStartTicks.set(agentId, currentTick);
        return { joined: true, position: 0 };
    }
    // Add to queue
    buffer.waitingQueue.push(agentId);
    return { joined: false, position: buffer.waitingQueue.length };
}
/**
 * Leave a focus buffer (voluntary or timeout)
 */
export function leaveFocusBuffer(buffer, agentId) {
    buffer.activeAgents.delete(agentId);
    buffer.holdStartTicks.delete(agentId);
    // Remove from queue if waiting
    const queueIdx = buffer.waitingQueue.indexOf(agentId);
    if (queueIdx >= 0) {
        buffer.waitingQueue.splice(queueIdx, 1);
    }
    // Promote from queue
    if (buffer.waitingQueue.length > 0 && buffer.activeAgents.size < buffer.maxConcurrent) {
        const nextAgent = buffer.waitingQueue.shift();
        buffer.activeAgents.add(nextAgent);
        // Note: holdStartTicks should be set by caller with current tick
    }
}
/**
 * Process focus buffer timeouts
 * @returns List of agents that were auto-released
 */
export function processFocusBufferTimeouts(buffer, currentTick) {
    const released = [];
    for (const [agentId, startTick] of buffer.holdStartTicks) {
        if (currentTick - startTick >= buffer.maxHoldDuration) {
            released.push(agentId);
        }
    }
    for (const agentId of released) {
        leaveFocusBuffer(buffer, agentId);
    }
    return released;
}
/**
 * Get degraded focus data based on buffer congestion
 */
export function getDegradedFocusData(baseFocusData, buffer, config) {
    const observerCount = buffer.activeAgents.size;
    // Compute noise increase due to congestion
    const congestionNoise = config.perceptionNoise * (1 + observerCount * 0.1);
    // Re-quantize heat with increased noise
    const baseHeatValue = baseFocusData.perceivedHeat === "high" ? 0.8 :
        baseFocusData.perceivedHeat === "mid" ? 0.5 : 0.2;
    return {
        ...baseFocusData,
        perceivedHeat: quantizeHeat(baseHeatValue, congestionNoise),
        nearbyAgentCount: observerCount,
    };
}
// ============================================================
// Focus Echo (Gravity Wave Propagation)
// ============================================================
/**
 * Create a focus echo when an agent focuses on a node
 *
 * Echo carries only "atmosphere", not "meaning":
 * - nodeId, kind: what is being observed
 * - perceivedHeat: vague sense (already degraded)
 * - NO payload, NO evaluation, NO observer identity
 */
export function createFocusEcho(sourceCell, nodeId, kind, heat, timestamp, config) {
    return {
        sourceCell,
        timestamp,
        nodeId,
        kind,
        // Heat is already degraded for echo
        perceivedHeat: quantizeHeat(heat, config.perceptionNoise * 1.5),
        strength: 1.0,
        phaseShift: 0, // Will be randomized per recipient
    };
}
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
export function propagateEcho(echo, sourceCellId, targetCellId, config) {
    // Calculate cell distance
    const [sx, sy, sz] = sourceCellId.split(":").map(Number);
    const [tx, ty, tz] = targetCellId.split(":").map(Number);
    const distance = Math.max(Math.abs(sx - tx), Math.abs(sy - ty), Math.abs(sz - tz));
    // Beyond echo range?
    if (distance > config.echoRange) {
        return null;
    }
    // Calculate decayed strength
    const decayedStrength = echo.strength * Math.pow(config.echoStrengthDecay, distance);
    // Too weak?
    if (decayedStrength < config.echoMinStrength) {
        return null;
    }
    return {
        ...echo,
        strength: decayedStrength,
    };
}
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
export function applyPhaseShift(echo, agentId, curiosity, config) {
    // Generate agent-specific phase shift
    // Simple hash-based pseudo-random
    const hash = simpleStringHash(agentId + echo.nodeId + echo.timestamp);
    const phaseShift = ((hash % 1000) / 1000 - 0.5) * 2 * config.echoPhaseVariance;
    // Shift heat perception
    const baseHeatValue = echo.perceivedHeat === "high" ? 0.8 :
        echo.perceivedHeat === "mid" ? 0.5 : 0.2;
    const shiftedHeatValue = Math.max(0, Math.min(1, baseHeatValue + phaseShift));
    const shiftedHeat = quantizeHeat(shiftedHeatValue, 0); // No additional noise, just shift
    // Calculate salience (how much it catches attention)
    // Curious agents notice more
    const baseSalience = echo.strength * 0.5;
    const curiosityBonus = curiosity * 0.3;
    const salience = Math.min(1, baseSalience + curiosityBonus + Math.abs(phaseShift) * 0.2);
    // Determine interpretation based on salience and phase
    let interpretation;
    if (salience > 0.7) {
        interpretation = phaseShift > 0 ? "interesting" : "suspicious";
    }
    else if (salience > 0.4) {
        interpretation = "unclear";
    }
    else {
        interpretation = "mundane";
    }
    return {
        echo,
        receivedAt: Date.now(),
        shiftedHeat,
        salience,
        interpretation,
    };
}
/**
 * Simple string hash for deterministic pseudo-randomness
 */
function simpleStringHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}
/**
 * Process echoes for an agent
 * Filters by strength and applies phase shift
 */
export function processEchoesForAgent(echoes, agent, config) {
    return echoes
        .map(echo => propagateEcho(echo, echo.sourceCell, agent.cellId, config))
        .filter((echo) => echo !== null)
        .map(echo => applyPhaseShift(echo, agent.id, agent.personality.curiosity, config));
}
// ============================================================
// Perception Factory
// ============================================================
/**
 * Create initial perception state for an agent
 */
export function createAgentPerception(config) {
    return {
        radar: {
            range: config.defaultRadarRange,
            updateInterval: config.radarUpdateInterval,
            lastUpdate: 0,
            data: [],
        },
        focus: {
            range: config.defaultFocusRange,
            data: [],
        },
        delay: config.perceptionDelay,
        noiseLevel: config.perceptionNoise,
    };
}
//# sourceMappingURL=perception.js.map