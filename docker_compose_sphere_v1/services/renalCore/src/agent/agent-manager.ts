/**
 * Sphere Project - AgentManager (Phase 4)
 *
 * [Responsibility]
 * - Agent lifecycle (spawn, despawn, tick)
 * - Staggered updates (not all agents update at once)
 * - Focus queue management
 * - Ghost pulse emission
 */

import type {
  SphereAgent,
  AgentPersonalityType,
  AgentAction,
  FocusBuffer,
  FocusEcho,
  ReceivedEcho,
  GhostPulse,
  ExplorationReport,
  SubmissionCapsule,
  IIncarnationPipeline,
  SpatialFieldV2,
  EmbeddingVector,
  AgentConfig,
  RadarData,
  FocusData,
  PerceivedHeat,
  PerceivedCongestion,
} from "../types/agent.js";
import { DEFAULT_AGENT_CONFIG } from "../types/agent.js";
import type { SphereNode } from "../types/sphere_node.js";
import {
  createAgent,
  decideAction,
  updateAgentState,
  updateInternalState,
  recordVisit,
  createEvaluation,
  createGhostPulse,
  createExplorationReport,
  createSubmissionCapsule,
} from "./agent.js";
import {
  createFocusBuffer,
  tryJoinFocusBuffer,
  leaveFocusBuffer,
  processFocusBufferTimeouts,
  computeSignalDegradation,
  createFocusEcho,
  processEchoesForAgent,
} from "./perception.js";

// ============================================================
// AgentManager
// ============================================================

export class AgentManager {
  private agents: Map<string, SphereAgent> = new Map();
  private focusBuffers: Map<string, FocusBuffer> = new Map();
  private echoBuffer: FocusEcho[] = [];
  private agentEchoQueues: Map<string, ReceivedEcho[]> = new Map();
  private ghostPulseBuffer: GhostPulse[] = [];
  private explorationReportBuffer: ExplorationReport[] = [];
  private submissionCapsuleBuffer: SubmissionCapsule[] = [];

  private currentTick: number = 0;
  private config: AgentConfig;

  // External dependencies (injected)
  private spatialFields: Map<string, SpatialFieldV2>;
  private projectionDB: Map<string, SphereNode>;

  // Optional: Direct incarnation pipeline (for internal agents)
  private incarnationPipeline?: IIncarnationPipeline;

  constructor(
    spatialFields: Map<string, SpatialFieldV2>,
    projectionDB: Map<string, SphereNode>,
    config: Partial<AgentConfig> = {},
    incarnationPipeline?: IIncarnationPipeline
  ) {
    this.spatialFields = spatialFields;
    this.projectionDB = projectionDB;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.incarnationPipeline = incarnationPipeline;
  }

  /**
   * Set incarnation pipeline (for late binding)
   */
  setIncarnationPipeline(pipeline: IIncarnationPipeline): void {
    this.incarnationPipeline = pipeline;
  }

  // ============================================================
  // Agent Lifecycle
  // ============================================================

  /**
   * Spawn a new agent
   */
  spawnAgent(
    name: string,
    startCellId: string,
    startVector: EmbeddingVector,
    personalityType: AgentPersonalityType = "follower"
  ): SphereAgent {
    const agent = createAgent(name, startCellId, startVector, personalityType, this.config);

    // Register in cell
    const cell = this.spatialFields.get(startCellId);
    if (cell) {
      cell.agentIds.add(agent.id);
      cell.lastAgentPresence = Date.now();
      if (cell.voxelState === "sleep") {
        cell.voxelState = "active";
      }
    }

    this.agents.set(agent.id, agent);
    console.log(`[AgentManager] Spawned agent: ${name} (${agent.id}) at ${startCellId}`);

    return agent;
  }

  /**
   * Despawn an agent
   *
   * [Flow]
   * 1. Create exploration report (internal analytics)
   * 2. Create submission capsule
   * 3. If incarnation pipeline is injected: ingest directly
   *    Otherwise: buffer for external submission
   *
   * @returns Object containing report, capsule, and ingestion result
   */
  async despawnAgent(agentId: string): Promise<{
    report: ExplorationReport;
    capsule: SubmissionCapsule;
    ingested: boolean;
  } | null> {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    // Unregister from cell
    const cell = this.spatialFields.get(agent.cellId);
    if (cell) {
      cell.agentIds.delete(agentId);
    }

    // Release any focus holds
    this.releaseFocus(agentId);

    // Create exploration report (internal tracking)
    const report = createExplorationReport(agent, [], this.currentTick);
    this.explorationReportBuffer.push(report);

    // Create submission capsule (for Periphery)
    // Uses discoveries from visited nodes + evaluations
    const discoveries = agent.visitedNodes.map(nodeId => {
      const node = this.projectionDB.get(nodeId);
      return {
        nodeId,
        timestamp: Date.now(),
        significance: node ? node.metrics.h / 100 : 0.5,
        summary: node?.payload?.summary ?? `Node ${nodeId}`,
      };
    });
    const capsule = createSubmissionCapsule(discoveries, agent.evaluations);

    // Ingest directly if pipeline is available
    let ingested = false;
    if (this.incarnationPipeline) {
      const result = await this.incarnationPipeline.ingest(capsule);
      ingested = result.success;
      if (result.success) {
        console.log(`[AgentManager] ✅ Direct incarnation: ${result.nodeCount} nodes`);
      } else {
        console.warn(`[AgentManager] ⚠️ Incarnation failed:`, result.errors);
        // Buffer for retry or external handling
        this.submissionCapsuleBuffer.push(capsule);
      }
    } else {
      // No pipeline: buffer for external submission
      this.submissionCapsuleBuffer.push(capsule);
    }

    this.agents.delete(agentId);
    console.log(`[AgentManager] Despawned agent: ${agent.name} (${agentId})`);
    console.log(`  → Report: ${report.explorationPath.length} nodes visited`);
    console.log(`  → Capsule: ${capsule.topTier.length} top, ${capsule.normalNodes.length} normal, ${capsule.ghostNodes.length} ghost`);
    console.log(`  → Ingested: ${ingested ? "direct" : "buffered"}`);

    return { report, capsule, ingested };
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): SphereAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): SphereAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents in a cell
   */
  getAgentsInCell(cellId: string): SphereAgent[] {
    return Array.from(this.agents.values()).filter(a => a.cellId === cellId);
  }

  // ============================================================
  // Tick Processing
  // ============================================================

  /**
   * Process one tick for all agents
   * Uses staggered updates to distribute load
   */
  tick(): void {
    this.currentTick++;

    // Process agents in staggered fashion
    for (const agent of this.agents.values()) {
      // Stagger: only update if tick matches agent's schedule
      if (this.shouldUpdateAgent(agent)) {
        this.processAgentTick(agent);
      }
    }

    // Process focus buffers (timeouts, queue promotion)
    this.processFocusBuffers();

    // Distribute echoes to nearby agents
    this.processEchoes();

    // Decay evaluations periodically
    if (this.currentTick % 100 === 0) {
      this.decayAllEvaluations();
    }
  }

  /**
   * Check if agent should update this tick (staggering)
   */
  private shouldUpdateAgent(agent: SphereAgent): boolean {
    // Simple hash-based staggering
    const hash = this.simpleHash(agent.id);
    return (this.currentTick + hash) % this.config.agentTickInterval === 0;
  }

  /**
   * Simple string hash for staggering
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 10;
  }

  /**
   * Process single agent tick
   */
  private processAgentTick(agent: SphereAgent): void {
    // Update perception
    this.updateAgentPerception(agent);

    // Get perception data
    const perception = this.getAgentPerception(agent);

    // Decide action
    const action = decideAction(agent, perception.radar, perception.focus, this.config);

    // Execute action
    const success = this.executeAction(agent, action);

    // Update state
    updateAgentState(agent, action, success, this.config);
    agent.state.lastActionTick = this.currentTick;
  }

  /**
   * Update agent's perception
   */
  private updateAgentPerception(agent: SphereAgent): void {
    // Radar update (periodic)
    const shouldUpdateRadar =
      (this.currentTick - agent.state.lastActionTick) % this.config.radarUpdateInterval === 0;

    if (shouldUpdateRadar) {
      const nearbyCells = this.getNearbyCells(agent.cellId, this.config.defaultRadarRange);
      // Store radar data on agent (simplified - would use AgentPerception object)
    }
  }

  /**
   * Get agent's current perception
   */
  private getAgentPerception(agent: SphereAgent): {
    radar: RadarData[];
    focus: FocusData[];
  } {
    // Get nearby cells for radar
    const nearbyCells = this.getNearbyCells(agent.cellId, this.config.defaultRadarRange);
    const trustedSet = new Set(agent.trustedAgents);

    const radar: RadarData[] = nearbyCells.map(cell => {
      const [ax, ay, az] = agent.cellId.split(":").map(Number);
      const [cx, cy, cz] = cell.cellId.split(":").map(Number);
      const distance = Math.sqrt((ax - cx) ** 2 + (ay - cy) ** 2 + (az - cz) ** 2);

      const congestionRatio = cell.agentIds.size / cell.softCapacity;
      const perceivedCongestion: PerceivedCongestion =
        congestionRatio > 0.9 ? "full" :
        congestionRatio > 0.6 ? "crowded" :
        congestionRatio > 0.3 ? "moderate" :
        congestionRatio > 0.1 ? "sparse" : "empty";

      const perceivedHeat: PerceivedHeat =
        cell.avgHeat > 0.7 ? "high" :
        cell.avgHeat > 0.3 ? "mid" : "low";

      return {
        cellId: cell.cellId,
        distance,
        summary: {
          nodeCount: cell.nodeCount,
          perceivedHeat,
          congestion: perceivedCongestion,
          hasTrustedAgent: Array.from(cell.agentIds).some(id => trustedSet.has(id)),
        },
      };
    });

    // Get nearby nodes for focus
    const focusNodes = this.getNodesInCell(agent.cellId);
    const focus: FocusData[] = focusNodes.map(node => {
      const perceivedHeat: PerceivedHeat =
        node.metrics.h > 0.7 ? "high" :
        node.metrics.h > 0.3 ? "mid" : "low";

      return {
        nodeId: node.id,
        kind: node.kind,
        perceivedHeat,
        nearbyAgentCount: this.getAgentsInCell(agent.cellId).length,
        payload: node.payload ? {
          summary: node.payload.summary,
          tags: node.payload.tags,
        } : undefined,
      };
    });

    return { radar, focus };
  }

  /**
   * Execute an action
   */
  private executeAction(agent: SphereAgent, action: AgentAction): boolean {
    switch (action.type) {
      case "move":
        return this.executeMove(agent, action);
      case "focus":
        return this.executeFocus(agent, action);
      case "rest":
        return this.executeRest(agent);
      case "evaluate":
        return this.executeEvaluate(agent, action);
      default:
        return false;
    }
  }

  /**
   * Execute move action
   */
  private executeMove(agent: SphereAgent, action: AgentAction): boolean {
    if (action.target) {
      // Move to target cell
      return this.moveAgentToCell(agent, action.target);
    }

    if (action.direction) {
      // Move in direction
      const [dx, dy, dz] = action.direction;
      const [cx, cy, cz] = agent.cellId.split(":").map(Number);

      // Simple: move one cell in dominant direction
      const newCellId = `${cx + Math.sign(dx)}:${cy + Math.sign(dy)}:${cz + Math.sign(dz)}`;
      return this.moveAgentToCell(agent, newCellId);
    }

    return false;
  }

  /**
   * Move agent to a cell
   */
  private moveAgentToCell(agent: SphereAgent, targetCellId: string): boolean {
    // Check if target cell exists or create it
    let targetCell = this.spatialFields.get(targetCellId);
    if (!targetCell) {
      targetCell = this.createCell(targetCellId);
    }

    // Check capacity
    if (targetCell.agentIds.size >= targetCell.hardCapacity) {
      return false; // Cell full
    }

    // Soft capacity: probabilistic rejection
    if (targetCell.agentIds.size >= targetCell.softCapacity) {
      const overflowRatio = targetCell.agentIds.size / targetCell.hardCapacity;
      if (Math.random() < overflowRatio) {
        return false; // Rejected due to congestion
      }
    }

    // Remove from old cell
    const oldCell = this.spatialFields.get(agent.cellId);
    if (oldCell) {
      oldCell.agentIds.delete(agent.id);
    }

    // Add to new cell
    targetCell.agentIds.add(agent.id);
    targetCell.lastAgentPresence = Date.now();
    targetCell.voxelState = "active";

    // Update agent
    agent.prevPosition = [...agent.position];
    agent.cellId = targetCellId;
    agent.position = [0, 0, 0]; // Reset to cell center

    // Emit ghost pulse
    const pulse = createGhostPulse(agent, "exploration");
    this.ghostPulseBuffer.push(pulse);

    return true;
  }

  /**
   * Execute focus action
   */
  private executeFocus(agent: SphereAgent, action: AgentAction): boolean {
    if (!action.target) return false;

    // Try to acquire focus
    const result = this.requestFocus(agent.id, action.target);

    if (result.granted) {
      agent.actionState = "investigating";
      agent.currentTarget = action.target;
      agent.focusHoldTick = this.config.defaultFocusDuration;

      // Record visit
      recordVisit(agent, action.target);

      // Update internal state with node info
      const node = this.projectionDB.get(action.target);
      if (node?.payload?.summary) {
        const shouldReembed = updateInternalState(agent, node.payload.summary);
        if (shouldReembed) {
          // Would trigger re-embedding here
          console.log(`[Agent ${agent.name}] Internal state updated, would re-embed`);
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Execute rest action
   */
  private executeRest(agent: SphereAgent): boolean {
    agent.actionState = "resting";
    return true;
  }

  /**
   * Execute evaluate action
   */
  private executeEvaluate(agent: SphereAgent, action: AgentAction): boolean {
    if (!action.target) return false;

    // Find focus data for the target
    const node = this.projectionDB.get(action.target);
    if (!node) return false;

    const focusData = {
      nodeId: node.id,
      kind: node.kind,
      perceivedHeat: node.metrics.h > 0.7 ? "high" as const :
                     node.metrics.h > 0.3 ? "mid" as const : "low" as const,
      nearbyAgentCount: this.getAgentsInCell(agent.cellId).length,
      payload: node.payload,
    };

    const evaluation = createEvaluation(agent, action.target, focusData, agent.focusHoldTick);
    agent.evaluations.push(evaluation);

    // Trim evaluations
    if (agent.evaluations.length > 50) {
      agent.evaluations.shift();
    }

    // Track same evaluations for boredom
    agent.state.recentSameEvals++;

    return true;
  }

  // ============================================================
  // Focus Buffer Management (Gravity Well Model)
  // ============================================================

  /**
   * Request focus on a node (buffer allows multiple concurrent observers)
   *
   * Physics model:
   * - Multiple agents can focus simultaneously (up to maxConcurrent)
   * - Signal degrades with more observers: effectiveSignal = baseSignal / (1 + α * (n - 1))
   * - Overflow agents enter a queue
   */
  requestFocus(agentId: string, nodeId: string): {
    granted: boolean;
    position: number;
    observerCount: number;
    signalDegradation: number;
  } {
    let buffer = this.focusBuffers.get(nodeId);

    if (!buffer) {
      // First access: create buffer
      buffer = createFocusBuffer(nodeId, this.config);
      this.focusBuffers.set(nodeId, buffer);
    }

    const result = tryJoinFocusBuffer(buffer, agentId, this.currentTick);

    if (result.joined) {
      // Generate echo for nearby agents
      this.emitFocusEcho(agentId, nodeId);
    }

    // Calculate signal degradation
    const observerCount = buffer.activeAgents.size;
    const signalDegradation = computeSignalDegradation(
      1.0,
      observerCount,
      this.config.focusCongestionCoeff
    );

    return {
      granted: result.joined,
      position: result.position,
      observerCount,
      signalDegradation,
    };
  }

  /**
   * Release focus hold
   */
  releaseFocus(agentId: string): void {
    for (const buffer of this.focusBuffers.values()) {
      leaveFocusBuffer(buffer, agentId);
    }
  }

  /**
   * Emit a focus echo to nearby agents
   */
  private emitFocusEcho(agentId: string, nodeId: string): void {
    if (!this.config.echoEnabled) return;

    const agent = this.agents.get(agentId);
    const node = this.projectionDB.get(nodeId);
    if (!agent || !node) return;

    const echo = createFocusEcho(
      agent.cellId,
      nodeId,
      node.kind,
      node.metrics.h,
      Date.now(),
      this.config
    );

    this.echoBuffer.push(echo);
  }

  /**
   * Process focus buffers (auto-release on timeout)
   */
  private processFocusBuffers(): void {
    for (const buffer of this.focusBuffers.values()) {
      const released = processFocusBufferTimeouts(buffer, this.currentTick);

      // Update released agents' state
      for (const agentId of released) {
        const agent = this.agents.get(agentId);
        if (agent) {
          agent.actionState = "idle";
          agent.currentTarget = null;
          agent.focusHoldTick = 0;
        }
      }
    }

    // Also decrement focus hold ticks on agents
    for (const agent of this.agents.values()) {
      if (agent.focusHoldTick > 0) {
        agent.focusHoldTick--;
        if (agent.focusHoldTick === 0) {
          agent.actionState = "idle";
          agent.currentTarget = null;
        }
      }
    }
  }

  /**
   * Distribute echoes to nearby agents
   */
  private processEchoes(): void {
    if (!this.config.echoEnabled || this.echoBuffer.length === 0) return;

    // Process echoes for each agent
    for (const agent of this.agents.values()) {
      const receivedEchoes = processEchoesForAgent(
        this.echoBuffer,
        agent,
        this.config
      );

      // Store in agent's echo queue
      let queue = this.agentEchoQueues.get(agent.id);
      if (!queue) {
        queue = [];
        this.agentEchoQueues.set(agent.id, queue);
      }

      queue.push(...receivedEchoes);

      // Limit queue size
      if (queue.length > 20) {
        queue.splice(0, queue.length - 20);
      }
    }

    // Clear echo buffer
    this.echoBuffer = [];
  }

  /**
   * Get pending echoes for an agent
   */
  getAgentEchoes(agentId: string): ReceivedEcho[] {
    return this.agentEchoQueues.get(agentId) ?? [];
  }

  /**
   * Clear agent's echo queue
   */
  flushAgentEchoes(agentId: string): ReceivedEcho[] {
    const echoes = this.agentEchoQueues.get(agentId) ?? [];
    this.agentEchoQueues.set(agentId, []);
    return echoes;
  }

  // ============================================================
  // Spatial Helpers
  // ============================================================

  /**
   * Get nearby cells
   */
  private getNearbyCells(centerCellId: string, range: number): SpatialFieldV2[] {
    const [cx, cy, cz] = centerCellId.split(":").map(Number);
    const cells: SpatialFieldV2[] = [];

    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        for (let dz = -range; dz <= range; dz++) {
          const cellId = `${cx + dx}:${cy + dy}:${cz + dz}`;
          const cell = this.spatialFields.get(cellId);
          if (cell) {
            cells.push(cell);
          }
        }
      }
    }

    return cells;
  }

  /**
   * Get nodes in a cell
   */
  private getNodesInCell(_cellId: string): SphereNode[] {
    // Simplified: would use spatial index to filter by _cellId
    // For now, return sample of all nodes (would be optimized with spatial indexing)
    return Array.from(this.projectionDB.values()).slice(0, 20);
  }

  /**
   * Create a new cell
   */
  private createCell(cellId: string): SpatialFieldV2 {
    const cell: SpatialFieldV2 = {
      cellId,
      centerVector: [],
      flux: 0.5,
      nodeCount: 0,
      avgHeat: 0,
      lastUpdate: Date.now(),
      voxelState: "sleep",
      lastAgentPresence: 0,
      agentIds: new Set(),
      softCapacity: this.config.defaultSoftCapacity,
      hardCapacity: this.config.defaultHardCapacity,
      ghostSummary: {
        totalHeat: 0,
        count: 0,
        dominantTags: [],
      },
    };

    this.spatialFields.set(cellId, cell);
    return cell;
  }

  // ============================================================
  // Evaluation Management
  // ============================================================

  /**
   * Decay all evaluations over time
   */
  private decayAllEvaluations(): void {
    for (const agent of this.agents.values()) {
      // Remove old evaluations
      const cutoff = Date.now() - 3600000; // 1 hour
      agent.evaluations = agent.evaluations.filter(e => e.timestamp > cutoff);
    }
  }

  // ============================================================
  // Output Buffers
  // ============================================================

  /**
   * Flush ghost pulse buffer
   */
  flushGhostPulses(): GhostPulse[] {
    const pulses = [...this.ghostPulseBuffer];
    this.ghostPulseBuffer = [];
    return pulses;
  }

  /**
   * Flush exploration report buffer (internal analytics)
   */
  flushExplorationReports(): ExplorationReport[] {
    const reports = [...this.explorationReportBuffer];
    this.explorationReportBuffer = [];
    return reports;
  }

  /**
   * Flush submission capsule buffer (for Periphery submission)
   */
  flushSubmissionCapsules(): SubmissionCapsule[] {
    const capsules = [...this.submissionCapsuleBuffer];
    this.submissionCapsuleBuffer = [];
    return capsules;
  }

  // ============================================================
  // Stats
  // ============================================================

  /**
   * Get agent statistics
   */
  getStats(): {
    totalAgents: number;
    byType: Record<string, number>;
    avgFatigue: number;
    avgEnergy: number;
    activeFocusBuffers: number;
    totalActiveObservers: number;
    pendingEchoes: number;
  } {
    const agents = Array.from(this.agents.values());
    const byType: Record<string, number> = {};

    for (const agent of agents) {
      const type = agent.personality.type;
      byType[type] = (byType[type] ?? 0) + 1;
    }

    const avgFatigue = agents.length > 0
      ? agents.reduce((sum, a) => sum + a.state.fatigue, 0) / agents.length
      : 0;

    const avgEnergy = agents.length > 0
      ? agents.reduce((sum, a) => sum + a.state.energy, 0) / agents.length
      : 0;

    // Focus buffer stats
    const activeFocusBuffers = Array.from(this.focusBuffers.values())
      .filter(b => b.activeAgents.size > 0).length;

    const totalActiveObservers = Array.from(this.focusBuffers.values())
      .reduce((sum, b) => sum + b.activeAgents.size, 0);

    const pendingEchoes = this.echoBuffer.length;

    return {
      totalAgents: agents.length,
      byType,
      avgFatigue,
      avgEnergy,
      activeFocusBuffers,
      totalActiveObservers,
      pendingEchoes,
    };
  }
}
