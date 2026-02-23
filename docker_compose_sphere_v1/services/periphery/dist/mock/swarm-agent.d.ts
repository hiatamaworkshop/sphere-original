/**
 * Sphere Project - Swarm Agent (Multi-Agent Spawner)
 *
 * [Role] Spawn multiple agents concurrently and monitor their collective behavior
 * [Philosophy]
 *   - Each agent operates independently
 *   - Agents cannot see each other directly
 *   - Their actions leave "traces" in the environment (heat changes)
 *   - Observer watches aggregate effects on projectionDB
 *
 * [Usage]
 *   npx tsx src/mock/swarm-agent.ts
 *   npx tsx src/mock/swarm-agent.ts --count 5 --behavior random
 *   npx tsx src/mock/swarm-agent.ts --count 10 --behavior focused --topic "量子力学"
 */
interface SwarmConfig {
    agentCount: number;
    spawnInterval: number;
    batchSize: number;
    batchDelay: number;
    behavior: "random" | "focused" | "distributed" | "boost";
    topic?: string;
    topics?: string[];
    maxDuration: number;
}
interface AgentStats {
    id: string;
    name: string;
    status: "spawning" | "exploring" | "completed" | "failed";
    position?: number[];
    layer: string;
    nodesDiscovered: number;
    evaluations: number;
    totalHeatDelta: number;
    energy: number;
    startTime: number;
    endTime?: number;
    error?: string;
    timing: {
        ticket?: number;
        connect?: number;
        positioned?: number;
        total?: number;
    };
}
interface SwarmMetrics {
    totalAgents: number;
    activeAgents: number;
    completedAgents: number;
    failedAgents: number;
    totalNodesDiscovered: number;
    totalEvaluations: number;
    totalHeatDelta: number;
    elapsedTime: number;
}
declare class SwarmAgent {
    private httpUrl;
    private wsUrl;
    private name;
    private query;
    private tags;
    private maxDuration;
    private ws;
    private sessionId;
    private position;
    private currentLayer;
    private requestCounter;
    private pendingRequests;
    private stats;
    private resolvePositioned;
    constructor(httpUrl: string, wsUrl: string, name: string, query: string, tags: string[], maxDuration: number);
    getStats(): AgentStats;
    private requestTicket;
    private connect;
    private handleMessage;
    private sendRequest;
    private resolveRequest;
    private rejectRequest;
    private waitForPositioned;
    private sense;
    private focus;
    /**
     * Evaluate a node with h/w/d scores
     * @param nodeId Node to evaluate
     * @param h Heat score (0-10, 5=neutral)
     * @param w Weight score (0-10, 5=neutral)
     * @param d Decay score (0-10, 5=neutral, higher=faster decay)
     */
    private evaluate;
    private move;
    private enterLayer;
    private return;
    private randomBehavior;
    private focusedBehavior;
    private distributedBehavior;
    /**
     * Boost behavior: Evaluate ALL nearby nodes with maximum scores.
     * Designed to push nodes toward amber candidacy for metabolic observation.
     * sense → focus+evaluate each node → move to fresh area → repeat
     */
    private boostBehavior;
    explore(behavior: "random" | "focused" | "distributed" | "boost"): Promise<void>;
    private delay;
}
declare class SwarmController {
    private agents;
    private config;
    private httpUrl;
    private wsUrl;
    private startTime;
    constructor(config?: Partial<SwarmConfig>, httpUrl?: string, wsUrl?: string);
    private getQuery;
    getMetrics(): SwarmMetrics;
    getAgentStats(): AgentStats[];
    spawn(): Promise<void>;
    private printStatus;
    private printFinalReport;
    private delay;
}
export { SwarmController, SwarmAgent, SwarmConfig, SwarmMetrics, AgentStats };
//# sourceMappingURL=swarm-agent.d.ts.map