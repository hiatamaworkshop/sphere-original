/**
 * Sphere Project - SphereAgent Class (Phase 4)
 *
 * [Philosophy] Movement = Internal state change → Re-embedding
 * - Agents don't "move" physically, they "re-project"
 * - Actions are non-deterministic (personality × state × chance)
 * - Three layers: Thinking / Projection / Renal
 */

import { randomUUID } from "node:crypto";
import type {
  SphereAgent,
  AgentPersonality,
  AgentPersonalityType,
  AgentState,
  AgentActionState,
  AgentAction,
  AgentEvaluation,
  AgentDiscovery,
  ExplorationReport,
  SubmissionCapsule,
  NodeSeed,
  GhostPulse,
  Vector3,
  EmbeddingVector,
  FocusData,
  RadarData,
  AgentConfig,
  AggregatedEvaluation,
  PerceivedHeat,
} from "../types/agent.js";
import {
  randomUnitVector,
  wobbleDirection,
  quantizeHeat,
  addNoise,
} from "./perception.js";

// ============================================================
// Agent Factory
// ============================================================

/**
 * Create a new SphereAgent
 */
export function createAgent(
  name: string,
  startCellId: string,
  startVector: EmbeddingVector,
  personalityType: AgentPersonalityType = "follower",
  config: AgentConfig
): SphereAgent {
  const personality = createPersonality(personalityType);

  return {
    id: randomUUID(),
    name,
    createdAt: Date.now(),

    cellId: startCellId,
    position: [0, 0, 0],
    prevPosition: [0, 0, 0],

    vector: [...startVector],
    prevVector: [...startVector],

    internalState: [],
    maxInternalStateSize: config.maxInternalStateSize,

    personality,

    state: {
      fatigue: 0,
      boredom: 0,
      recentSameEvals: 0,
      energy: 1.0,
      lastActionTick: 0,
    },
    actionState: "idle",

    currentTarget: null,
    focusHoldTick: 0,

    visitedNodes: [],
    evaluations: [],
    trustedAgents: [],
  };
}

/**
 * Create personality from type with random variation
 */
export function createPersonality(type: AgentPersonalityType): AgentPersonality {
  // Base values vary by type
  const baseValues: Record<AgentPersonalityType, Partial<AgentPersonality>> = {
    follower: { curiosity: 0.3, patience: 0.7, socialAwareness: 0.6 },
    pioneer: { curiosity: 0.8, patience: 0.4, socialAwareness: 0.3 },
    critic: { curiosity: 0.5, patience: 0.8, socialAwareness: 0.5 },
    trust_based: { curiosity: 0.4, patience: 0.6, socialAwareness: 0.8 },
    random: { curiosity: 0.5, patience: 0.5, socialAwareness: 0.5 },
  };

  const base = baseValues[type];

  // Add small random variation (±0.1)
  const vary = (v: number) => Math.max(0, Math.min(1, v + (Math.random() - 0.5) * 0.2));

  return {
    type,
    curiosity: vary(base.curiosity ?? 0.5),
    patience: vary(base.patience ?? 0.5),
    socialAwareness: vary(base.socialAwareness ?? 0.5),
    explorationRadius: 5,
  };
}

// ============================================================
// Decision Making
// ============================================================

/**
 * Determine effective behavior type based on state
 * "Same Follower behaves differently each day"
 */
export function getEffectiveType(agent: SphereAgent): AgentPersonalityType {
  const { personality, state } = agent;

  // Fatigue overrides: too tired → random
  if (state.fatigue > 0.7) {
    return "random";
  }

  // Boredom overrides: too bored → pioneer
  if (state.boredom > 0.6 || state.recentSameEvals > 5) {
    return "pioneer";
  }

  // Low energy → rest preference (handled elsewhere)

  return personality.type;
}

/**
 * Decide next action based on perception and state
 */
export function decideAction(
  agent: SphereAgent,
  radarData: RadarData[],
  focusData: FocusData[],
  config: AgentConfig
): AgentAction {
  // Check energy first
  if (agent.state.energy < 0.2) {
    return { type: "rest" };
  }

  // If currently focusing, continue
  if (agent.actionState === "investigating" && agent.focusHoldTick > 0) {
    return { type: "focus", target: agent.currentTarget ?? undefined };
  }

  const effectiveType = getEffectiveType(agent);

  switch (effectiveType) {
    case "follower":
      return decideFollowerAction(agent, radarData, focusData, config);
    case "pioneer":
      return decidePioneerAction(agent, radarData, focusData, config);
    case "critic":
      return decideCriticAction(agent, radarData, focusData, config);
    case "trust_based":
      return decideTrustBasedAction(agent, radarData, focusData, config);
    case "random":
    default:
      return decideRandomAction(agent);
  }
}

/**
 * Follower: Move toward high-rated nodes
 */
function decideFollowerAction(
  agent: SphereAgent,
  radarData: RadarData[],
  focusData: FocusData[],
  config: AgentConfig
): AgentAction {
  // Look for high-heat nodes in focus range
  const hotNodes = focusData
    .filter(f => f.perceivedHeat === "high")
    .filter(f => !agent.visitedNodes.includes(f.nodeId));

  if (hotNodes.length > 0) {
    // Consider congestion with patience
    const accessible = hotNodes.filter(n =>
      n.nearbyAgentCount < config.defaultSoftCapacity * agent.personality.patience
    );

    if (accessible.length > 0) {
      return { type: "focus", target: accessible[0].nodeId };
    }

    // Congested: yield if social awareness is high
    if (agent.personality.socialAwareness > 0.5) {
      return decideRandomAction(agent);
    }
  }

  // Check radar for promising cells
  const hotCells = radarData
    .filter(r => r.summary.perceivedHeat === "high")
    .filter(r => r.summary.congestion !== "full" && r.summary.congestion !== "crowded")
    .sort((a, b) => a.distance - b.distance);

  if (hotCells.length > 0) {
    return { type: "move", target: hotCells[0].cellId };
  }

  // Fallback: random move
  return decideRandomAction(agent);
}

/**
 * Pioneer: Seek unexplored or low-evaluation nodes
 */
function decidePioneerAction(
  agent: SphereAgent,
  radarData: RadarData[],
  focusData: FocusData[],
  config: AgentConfig
): AgentAction {
  // Look for unvisited nodes
  const unexplored = focusData
    .filter(f => !agent.visitedNodes.includes(f.nodeId))
    .filter(f => !f.aggregatedEvaluation || f.aggregatedEvaluation.evaluatorCount < 2);

  if (unexplored.length > 0) {
    return { type: "focus", target: unexplored[0].nodeId };
  }

  // Look for empty/sparse cells (frontier)
  const frontierCells = radarData
    .filter(r => r.summary.congestion === "empty" || r.summary.congestion === "sparse")
    .sort((a, b) => b.distance - a.distance); // Prefer far cells

  if (frontierCells.length > 0) {
    return { type: "move", target: frontierCells[0].cellId };
  }

  // Random direction toward frontier
  return {
    type: "move",
    direction: randomUnitVector(),
  };
}

/**
 * Critic: Examine nodes with divided opinions
 */
function decideCriticAction(
  agent: SphereAgent,
  radarData: RadarData[],
  focusData: FocusData[],
  config: AgentConfig
): AgentAction {
  // Look for nodes with high uncertainty (controversial)
  const controversial = focusData
    .filter(f => f.aggregatedEvaluation)
    .filter(f => f.aggregatedEvaluation!.uncertainty > 0.3)
    .filter(f => f.aggregatedEvaluation!.evaluatorCount >= 3)
    .sort((a, b) =>
      (b.aggregatedEvaluation?.uncertainty ?? 0) - (a.aggregatedEvaluation?.uncertainty ?? 0)
    );

  if (controversial.length > 0) {
    return { type: "focus", target: controversial[0].nodeId };
  }

  // Look for nodes with many evaluators but moderate heat
  const needsReview = focusData
    .filter(f => f.aggregatedEvaluation)
    .filter(f => f.aggregatedEvaluation!.evaluatorCount >= 5)
    .filter(f => !agent.visitedNodes.includes(f.nodeId));

  if (needsReview.length > 0) {
    return { type: "focus", target: needsReview[0].nodeId };
  }

  // Fallback to follower behavior
  return decideFollowerAction(agent, radarData, focusData, config);
}

/**
 * Trust-based: Follow trusted agents' evaluations
 */
function decideTrustBasedAction(
  agent: SphereAgent,
  radarData: RadarData[],
  focusData: FocusData[],
  config: AgentConfig
): AgentAction {
  // Look for cells with trusted agents
  const trustedCells = radarData.filter(r => r.summary.hasTrustedAgent);

  if (trustedCells.length > 0) {
    const closest = trustedCells.sort((a, b) => a.distance - b.distance)[0];
    return { type: "move", target: closest.cellId };
  }

  // No trusted agents nearby: fall back to follower
  return decideFollowerAction(agent, radarData, focusData, config);
}

/**
 * Random: Pure random walk
 */
function decideRandomAction(agent: SphereAgent): AgentAction {
  return {
    type: "move",
    direction: randomUnitVector(),
  };
}

// ============================================================
// State Updates
// ============================================================

/**
 * Update agent state after action
 */
export function updateAgentState(
  agent: SphereAgent,
  action: AgentAction,
  success: boolean,
  config: AgentConfig
): void {
  // Energy consumption
  if (action.type !== "rest") {
    agent.state.energy = Math.max(0, agent.state.energy - config.energyConsumptionRate);
  }

  // Fatigue increases with actions, decreases with rest
  if (action.type === "rest") {
    agent.state.fatigue = Math.max(0, agent.state.fatigue - config.fatigueRecoveryRate);
    agent.state.energy = Math.min(1, agent.state.energy + config.fatigueRecoveryRate);
  } else {
    agent.state.fatigue = Math.min(1, agent.state.fatigue + 0.01);
  }

  // Boredom tracking
  if (action.type === "focus" || action.type === "evaluate") {
    // Check if evaluation is similar to recent ones
    // (simplified: just increment counter, reset on different action)
    agent.state.boredom = Math.min(1, agent.state.boredom + 0.02);
  } else if (action.type === "move") {
    // Moving reduces boredom
    agent.state.boredom = Math.max(0, agent.state.boredom - 0.05);
    agent.state.recentSameEvals = 0;
  }
}

/**
 * Update internal state with new information
 * This triggers potential re-embedding
 */
export function updateInternalState(
  agent: SphereAgent,
  newInfo: string
): boolean {
  agent.internalState.push(newInfo);

  // Trim to max size
  while (agent.internalState.length > agent.maxInternalStateSize) {
    agent.internalState.shift();
  }

  // Return true if this should trigger re-embedding
  // (simplified: random chance with "タメ")
  return Math.random() > 0.7;
}

/**
 * Record node visit
 */
export function recordVisit(
  agent: SphereAgent,
  nodeId: string,
  maxVisitedSize: number = 50
): void {
  if (!agent.visitedNodes.includes(nodeId)) {
    agent.visitedNodes.push(nodeId);

    // Trim to max size
    while (agent.visitedNodes.length > maxVisitedSize) {
      agent.visitedNodes.shift();
    }
  }
}

/**
 * Create evaluation for a node
 */
export function createEvaluation(
  agent: SphereAgent,
  nodeId: string,
  focusData: FocusData,
  dwellTime: number
): AgentEvaluation {
  // Relevance: based on semantic similarity (mock for now)
  const relevance = addNoise(0.5, 0.3); // Would use actual similarity

  // Quality: based on heat and content
  const qualityBase = focusData.perceivedHeat === "high" ? 0.7 :
                       focusData.perceivedHeat === "mid" ? 0.5 : 0.3;
  const quality = addNoise(qualityBase, 0.2);

  // Novelty: based on visit count
  const visitCount = agent.visitedNodes.filter(v => v === nodeId).length;
  const novelty = Math.max(0, 1 - visitCount * 0.2);

  // Confidence: based on dwell time
  const confidence = Math.min(1, dwellTime / 10);

  return {
    nodeId,
    agentId: agent.id,
    timestamp: Date.now(),
    relevance,
    quality,
    novelty,
    dwellTime,
    revisitCount: visitCount,
    confidence,
  };
}

/**
 * Create discovery record
 */
export function createDiscovery(
  agent: SphereAgent,
  nodeId: string,
  focusData: FocusData
): AgentDiscovery {
  // Significance: based on novelty and heat
  const novelty = agent.visitedNodes.includes(nodeId) ? 0.3 : 1.0;
  const heatFactor = focusData.perceivedHeat === "high" ? 1.0 :
                     focusData.perceivedHeat === "mid" ? 0.6 : 0.3;
  const significance = (novelty + heatFactor) / 2;

  return {
    nodeId,
    timestamp: Date.now(),
    significance,
    summary: focusData.payload?.summary ?? `Node ${nodeId}`,
  };
}

/**
 * Create exploration report (internal tracking)
 */
export function createExplorationReport(
  agent: SphereAgent,
  discoveries: AgentDiscovery[],
  totalTicks: number
): ExplorationReport {
  return {
    agentId: agent.id,
    explorationPath: [...agent.visitedNodes],
    discoveries,
    totalTicks,
    timestamp: Date.now(),
  };
}

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
export function createSubmissionCapsule(
  discoveries: AgentDiscovery[],
  evaluations: AgentEvaluation[]
): SubmissionCapsule {
  // Sort discoveries by significance
  const sorted = [...discoveries].sort((a, b) => b.significance - a.significance);

  // Build evaluation lookup
  const evalMap = new Map(evaluations.map(e => [e.nodeId, e]));

  // Convert to NodeSeeds
  const toNodeSeed = (discovery: AgentDiscovery): NodeSeed => {
    const evaluation = evalMap.get(discovery.nodeId);

    // Generate tags from discovery context
    // [Design] Tags represent "what this is about" for spatial positioning
    const tags: string[] = [];
    if (discovery.significance > 0.7) tags.push("important");
    if (evaluation?.novelty && evaluation.novelty > 0.5) tags.push("novel");
    if (evaluation?.quality && evaluation.quality > 0.5) tags.push("quality");

    // Calculate heat from significance and evaluation
    const heatBase = discovery.significance * 50;
    const evalBonus = evaluation ? evaluation.quality * 25 + evaluation.confidence * 25 : 0;
    const initialHeat = Math.min(100, Math.round(heatBase + evalBonus));

    return {
      tags,
      summary: discovery.summary,
      initialHeat,
      flags: 0,  // Default flags
    };
  };

  // Classify into tiers
  const topTier = sorted.slice(0, 2).map(toNodeSeed);
  const normalNodes = sorted.slice(2, 7).map(toNodeSeed);
  const ghostNodes = sorted.slice(7, 10).map(toNodeSeed);

  return {
    topTier,
    normalNodes,
    ghostNodes,
    timestamp: Date.now(),
  };
}

/**
 * @deprecated Use createExplorationReport instead
 */
export const createExperienceCapsule = createExplorationReport;

/**
 * Create ghost pulse for trajectory
 */
export function createGhostPulse(
  agent: SphereAgent,
  intent: GhostPulse["intent"]
): GhostPulse {
  return {
    agentId: agent.id,
    fromVector: [...agent.prevVector],
    toVector: [...agent.vector],
    intent,
    timestamp: Date.now(),
  };
}

// ============================================================
// Destination Evaluation
// ============================================================

/**
 * Evaluate destination with Sphere philosophy
 * "Numbers give direction, decision comes from inside"
 */
export function evaluateDestination(
  agent: SphereAgent,
  targetData: RadarData | FocusData,
  aggregatedEval: AggregatedEvaluation | undefined,
  config: AgentConfig
): number {
  let score = 0.5; // Base score

  // Heat attraction (slight boost, not decisive)
  const heat = "summary" in targetData
    ? targetData.summary.perceivedHeat
    : targetData.perceivedHeat;

  if (heat === "high") score *= 1.1;
  else if (heat === "low") score *= 0.9;

  // Evaluation influence (not decisive)
  if (aggregatedEval && aggregatedEval.value > 0.7) {
    score *= 1.1; // Only 10% boost
  }

  // Uncertainty sparks curiosity
  if (aggregatedEval && aggregatedEval.uncertainty > 0.3) {
    if (agent.personality.curiosity > 0.5) {
      score *= 1.2;
    }
  }

  // Congestion penalty
  const congestion = "summary" in targetData ? targetData.summary.congestion : "moderate";
  const congestionPenalty =
    congestion === "full" ? 0.3 :
    congestion === "crowded" ? 0.5 :
    congestion === "moderate" ? 0.8 : 1.0;

  score *= (1 - (1 - congestionPenalty) * (1 - agent.personality.patience));

  // Social yielding
  if ((congestion === "crowded" || congestion === "full") &&
      agent.personality.socialAwareness > 0.5) {
    score *= 0.5;
  }

  // State modifiers
  score *= (1 - agent.state.fatigue * 0.5);

  return score;
}
