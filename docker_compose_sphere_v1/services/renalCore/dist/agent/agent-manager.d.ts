/**
 * Sphere Project - AgentManager (Phase 4)
 *
 * [Responsibility]
 * - Agent lifecycle (spawn, despawn, tick)
 * - Staggered updates (not all agents update at once)
 * - Focus queue management
 * - Ghost pulse emission
 */
import type { SphereAgent, AgentPersonalityType, ReceivedEcho, GhostPulse, ExplorationReport, SubmissionCapsule, IIncarnationPipeline, SpatialFieldV2, EmbeddingVector, AgentConfig } from "../types/agent.js";
import type { SphereNode } from "../types/sphere_node.js";
export declare class AgentManager {
    private agents;
    private focusBuffers;
    private echoBuffer;
    private agentEchoQueues;
    private ghostPulseBuffer;
    private explorationReportBuffer;
    private submissionCapsuleBuffer;
    private currentTick;
    private config;
    private spatialFields;
    private projectionDB;
    private incarnationPipeline?;
    constructor(spatialFields: Map<string, SpatialFieldV2>, projectionDB: Map<string, SphereNode>, config?: Partial<AgentConfig>, incarnationPipeline?: IIncarnationPipeline);
    /**
     * Set incarnation pipeline (for late binding)
     */
    setIncarnationPipeline(pipeline: IIncarnationPipeline): void;
    /**
     * Spawn a new agent
     */
    spawnAgent(name: string, startCellId: string, startVector: EmbeddingVector, personalityType?: AgentPersonalityType): SphereAgent;
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
    despawnAgent(agentId: string): Promise<{
        report: ExplorationReport;
        capsule: SubmissionCapsule;
        ingested: boolean;
    } | null>;
    /**
     * Get agent by ID
     */
    getAgent(agentId: string): SphereAgent | undefined;
    /**
     * Get all agents
     */
    getAllAgents(): SphereAgent[];
    /**
     * Get agents in a cell
     */
    getAgentsInCell(cellId: string): SphereAgent[];
    /**
     * Process one tick for all agents
     * Uses staggered updates to distribute load
     */
    tick(): void;
    /**
     * Check if agent should update this tick (staggering)
     */
    private shouldUpdateAgent;
    /**
     * Simple string hash for staggering
     */
    private simpleHash;
    /**
     * Process single agent tick
     */
    private processAgentTick;
    /**
     * Update agent's perception
     */
    private updateAgentPerception;
    /**
     * Get agent's current perception
     */
    private getAgentPerception;
    /**
     * Execute an action
     */
    private executeAction;
    /**
     * Execute move action
     */
    private executeMove;
    /**
     * Move agent to a cell
     */
    private moveAgentToCell;
    /**
     * Execute focus action
     */
    private executeFocus;
    /**
     * Execute rest action
     */
    private executeRest;
    /**
     * Execute evaluate action
     */
    private executeEvaluate;
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
    };
    /**
     * Release focus hold
     */
    releaseFocus(agentId: string): void;
    /**
     * Emit a focus echo to nearby agents
     */
    private emitFocusEcho;
    /**
     * Process focus buffers (auto-release on timeout)
     */
    private processFocusBuffers;
    /**
     * Distribute echoes to nearby agents
     */
    private processEchoes;
    /**
     * Get pending echoes for an agent
     */
    getAgentEchoes(agentId: string): ReceivedEcho[];
    /**
     * Clear agent's echo queue
     */
    flushAgentEchoes(agentId: string): ReceivedEcho[];
    /**
     * Get nearby cells
     */
    private getNearbyCells;
    /**
     * Get nodes in a cell
     */
    private getNodesInCell;
    /**
     * Create a new cell
     */
    private createCell;
    /**
     * Decay all evaluations over time
     */
    private decayAllEvaluations;
    /**
     * Flush ghost pulse buffer
     */
    flushGhostPulses(): GhostPulse[];
    /**
     * Flush exploration report buffer (internal analytics)
     */
    flushExplorationReports(): ExplorationReport[];
    /**
     * Flush submission capsule buffer (for Periphery submission)
     */
    flushSubmissionCapsules(): SubmissionCapsule[];
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
    };
}
//# sourceMappingURL=agent-manager.d.ts.map