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
import WebSocket from "ws";
// ============================================================
// Configuration
// ============================================================
const DEBUG = process.env.DEBUG === "true";
const DEFAULT_HTTP_URL = "http://localhost:3001";
const DEFAULT_WS_URL = "ws://localhost:8081";
const DEFAULT_SWARM_CONFIG = {
    agentCount: 3,
    spawnInterval: 100, // 100ms between agents in same batch
    batchSize: 5, // 5 agents per batch
    batchDelay: 3000, // 3s between batches
    behavior: "random",
    topics: [
        "量子力学",
        "哲学の問題",
        "数学の定理",
        "宇宙の謎",
        "意識とは",
        "時間の本質",
        "無限について",
        "論理学",
    ],
    maxDuration: 30000,
};
// ============================================================
// Swarm Agent Class
// ============================================================
class SwarmAgent {
    httpUrl;
    wsUrl;
    name;
    query;
    tags;
    maxDuration;
    ws = null;
    sessionId = "";
    position = []; // Full 384-dim embedding vector
    currentLayer = "tutorial";
    requestCounter = 0;
    pendingRequests = new Map();
    stats;
    resolvePositioned = null;
    constructor(httpUrl, wsUrl, name, query, tags, maxDuration) {
        this.httpUrl = httpUrl;
        this.wsUrl = wsUrl;
        this.name = name;
        this.query = query;
        this.tags = tags;
        this.maxDuration = maxDuration;
        this.stats = {
            id: `agent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: this.name,
            status: "spawning",
            layer: "none",
            nodesDiscovered: 0,
            evaluations: 0,
            totalHeatDelta: 0,
            energy: 100, // Initial energy
            startTime: Date.now(),
            timing: {},
        };
    }
    getStats() {
        return { ...this.stats };
    }
    // ============================================================
    // Connection Methods
    // ============================================================
    async requestTicket() {
        try {
            const response = await fetch(`${this.httpUrl}/dive/request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            if (!response.ok) {
                return null;
            }
            const result = await response.json();
            return result.ticket.token;
        }
        catch {
            return null;
        }
    }
    connect(token) {
        return new Promise((resolve, reject) => {
            const url = `${this.wsUrl}?token=${token}`;
            this.ws = new WebSocket(url);
            const connectTimeout = setTimeout(() => {
                reject(new Error("Connection timeout"));
            }, 10000);
            this.ws.on("open", () => {
                clearTimeout(connectTimeout);
            });
            this.ws.on("message", (data) => {
                const msg = JSON.parse(data.toString());
                this.handleMessage(msg, resolve);
            });
            this.ws.on("close", () => {
                this.stats.status = "completed";
                this.stats.endTime = Date.now();
            });
            this.ws.on("error", (error) => {
                clearTimeout(connectTimeout);
                reject(error);
            });
        });
    }
    handleMessage(msg, onWelcome) {
        switch (msg.type) {
            case "welcome":
                this.sessionId = msg.sessionId;
                onWelcome();
                break;
            case "processing":
                break;
            case "positioned":
                this.position = msg.position;
                this.stats.position = msg.position;
                this.stats.layer = "tutorial";
                // Log request context received from server
                if (DEBUG) {
                    console.log(`[${this.name}] Positioned: query="${msg.query}" tags=[${msg.tags?.join(", ")}]${msg.quest ? ` quest="${msg.quest}"` : ""}`);
                }
                this.resolvePositioned?.();
                break;
            case "senseResult":
                this.stats.nodesDiscovered += msg.nodes?.length || 0;
                this.resolveRequest(msg.requestId, msg);
                break;
            case "focusResult":
                this.resolveRequest(msg.requestId, msg);
                break;
            case "evaluateResult":
                if (msg.success) {
                    this.stats.evaluations++;
                }
                this.resolveRequest(msg.requestId, msg);
                break;
            case "moveResult":
                // move(step, mode) - 384D semantic space movement
                // Position is updated server-side, result contains success/distance/mode
                this.resolveRequest(msg.requestId, msg);
                break;
            case "warpResult":
                if (msg.result?.success && msg.result?.position && Array.isArray(msg.result.position)) {
                    this.position = msg.result.position;
                    this.stats.position = msg.result.position;
                }
                this.resolveRequest(msg.requestId, msg);
                break;
            case "layerChanged":
                this.currentLayer = msg.layer;
                this.stats.layer = msg.layer;
                this.resolveRequest(msg.requestId, msg);
                break;
            case "returnAck":
                this.resolveRequest(msg.requestId, msg);
                break;
            case "error":
                if (msg.requestId) {
                    this.rejectRequest(msg.requestId, new Error(msg.error));
                }
                break;
            case "expelled":
                this.stats.status = "completed";
                this.stats.endTime = Date.now();
                this.ws?.close();
                break;
        }
    }
    // ============================================================
    // Request/Response Handling
    // ============================================================
    async sendRequest(type, payload = {}) {
        const requestId = `req_${++this.requestCounter}`;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });
            const msg = { type, requestId, ...payload };
            this.ws?.send(JSON.stringify(msg));
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(`Request ${requestId} timed out`));
                }
            }, 10000);
        });
    }
    resolveRequest(requestId, value) {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
            this.pendingRequests.delete(requestId);
            pending.resolve(value);
        }
    }
    rejectRequest(requestId, error) {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
            this.pendingRequests.delete(requestId);
            pending.reject(error);
        }
    }
    waitForPositioned() {
        return new Promise((resolve) => {
            this.resolvePositioned = resolve;
        });
    }
    // ============================================================
    // Sphere Operations
    // ============================================================
    async sense(radius = 5) {
        const result = await this.sendRequest("sense", { radius });
        // Energy cost: 2
        this.stats.energy = Math.max(0, this.stats.energy - 2);
        return result.nodes || [];
    }
    async focus(nodeId) {
        const result = await this.sendRequest("focus", { nodeId });
        // Energy cost: 10
        this.stats.energy = Math.max(0, this.stats.energy - 10);
        return result.node;
    }
    /**
     * Evaluate a node with h/w/d scores
     * @param nodeId Node to evaluate
     * @param h Heat score (0-10, 5=neutral)
     * @param w Weight score (0-10, 5=neutral)
     * @param d Decay score (0-10, 5=neutral, higher=faster decay)
     */
    async evaluate(nodeId, h, w = 5, d = 5) {
        const result = await this.sendRequest("evaluate", { nodeId, h, w, d });
        // Track heat delta
        this.stats.totalHeatDelta += (h - 5);
        // Energy cost: 3
        this.stats.energy = Math.max(0, this.stats.energy - 3);
        return result.success;
    }
    async enterLayer(layer) {
        const type = layer === "sanctuary" ? "enterSanctuary" : "enterCore";
        await this.sendRequest(type, {});
    }
    async return() {
        await this.sendRequest("return", {});
    }
    // ============================================================
    // Exploration Behaviors
    // ============================================================
    async randomBehavior() {
        // Sense → Evaluate random nodes with random h/w/d scores
        const nodes = await this.sense(5);
        for (const node of nodes.slice(0, 3)) {
            // h: random 3-8, w: neutral 5, d: neutral 5
            const h = 3 + Math.floor(Math.random() * 6); // 3-8
            await this.evaluate(node.id, h, 5, 5);
            await this.delay(200);
        }
    }
    async focusedBehavior() {
        // Sense → Focus on highest heat → Evaluate positively
        const nodes = await this.sense(5);
        if (nodes.length > 0) {
            // Sort by heat descending
            const sorted = [...nodes].sort((a, b) => b.heat - a.heat);
            const target = sorted[0];
            await this.focus(target.id);
            // Positive evaluation: h=8 (boost heat), w=7 (increase weight), d=3 (slow decay)
            await this.evaluate(target.id, 8, 7, 3);
        }
    }
    async distributedBehavior() {
        // Explore different areas by moving
        const nodes = await this.sense(5);
        if (nodes.length > 0) {
            // Evaluate a random node with moderate positive score
            const target = nodes[Math.floor(Math.random() * nodes.length)];
            // Moderate evaluation: h=7, w=6, d=5
            await this.evaluate(target.id, 7, 6, 5);
        }
    }
    // ============================================================
    // Main Explore Flow
    // ============================================================
    async explore(behavior) {
        try {
            const pipelineStart = Date.now();
            // Step 1: Get ticket
            const ticketStart = Date.now();
            const token = await this.requestTicket();
            this.stats.timing.ticket = Date.now() - ticketStart;
            if (!token) {
                this.stats.status = "failed";
                this.stats.error = "Failed to get ticket";
                return;
            }
            // Step 2: Connect
            const connectStart = Date.now();
            await this.connect(token);
            this.stats.timing.connect = Date.now() - connectStart;
            // Step 3: Send entry
            const entryStart = Date.now();
            const entryMsg = {
                type: "entry",
                requestId: `req_${++this.requestCounter}`,
                request: {
                    query: this.query,
                    tags: this.tags,
                },
            };
            this.ws?.send(JSON.stringify(entryMsg));
            // Step 4: Wait for positioning
            await Promise.race([
                this.waitForPositioned(),
                this.delay(15000).then(() => { throw new Error("Positioning timeout"); }),
            ]);
            this.stats.timing.positioned = Date.now() - entryStart;
            this.stats.timing.total = Date.now() - pipelineStart;
            this.stats.status = "exploring";
            // Step 5: Explore in tutorial
            const startTime = Date.now();
            const endBy = startTime + this.maxDuration;
            while (Date.now() < endBy && this.stats.status === "exploring" && this.stats.energy > 10) {
                try {
                    switch (behavior) {
                        case "random":
                            await this.randomBehavior();
                            break;
                        case "focused":
                            await this.focusedBehavior();
                            break;
                        case "distributed":
                            await this.distributedBehavior();
                            break;
                    }
                    // Move to Core layer after tutorial (if enough energy)
                    if (this.currentLayer === "tutorial" && this.stats.energy > 20) {
                        await this.enterLayer("sanctuary");
                        await this.delay(500);
                        await this.enterLayer("core");
                    }
                    await this.delay(1000);
                }
                catch (error) {
                    // Continue on error
                    if (DEBUG)
                        console.log(`[${this.name}] Error:`, error);
                    await this.delay(500);
                }
            }
            if (this.stats.energy <= 10) {
                if (DEBUG)
                    console.log(`[${this.name}] Low energy (${this.stats.energy}), returning early`);
            }
            // Step 6: Return
            await this.return();
            this.stats.status = "completed";
            this.stats.endTime = Date.now();
        }
        catch (error) {
            this.stats.status = "failed";
            this.stats.error = String(error);
            this.stats.endTime = Date.now();
        }
        finally {
            this.ws?.close();
        }
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
// ============================================================
// Swarm Controller
// ============================================================
class SwarmController {
    agents = [];
    config;
    httpUrl;
    wsUrl;
    startTime = 0;
    constructor(config = {}, httpUrl = DEFAULT_HTTP_URL, wsUrl = DEFAULT_WS_URL) {
        this.config = { ...DEFAULT_SWARM_CONFIG, ...config };
        this.httpUrl = httpUrl;
        this.wsUrl = wsUrl;
    }
    getQuery() {
        if (this.config.behavior === "focused" && this.config.topic) {
            return this.config.topic;
        }
        const topics = this.config.topics || DEFAULT_SWARM_CONFIG.topics;
        return topics[Math.floor(Math.random() * topics.length)];
    }
    getMetrics() {
        const stats = this.agents.map((a) => a.getStats());
        return {
            totalAgents: this.agents.length,
            activeAgents: stats.filter((s) => s.status === "exploring").length,
            completedAgents: stats.filter((s) => s.status === "completed").length,
            failedAgents: stats.filter((s) => s.status === "failed").length,
            totalNodesDiscovered: stats.reduce((sum, s) => sum + s.nodesDiscovered, 0),
            totalEvaluations: stats.reduce((sum, s) => sum + s.evaluations, 0),
            totalHeatDelta: stats.reduce((sum, s) => sum + s.totalHeatDelta, 0),
            elapsedTime: Date.now() - this.startTime,
        };
    }
    getAgentStats() {
        return this.agents.map((a) => a.getStats());
    }
    async spawn() {
        this.startTime = Date.now();
        const batchCount = Math.ceil(this.config.agentCount / this.config.batchSize);
        console.log("");
        console.log("=".repeat(70));
        console.log("  SPHERE SWARM AGENT - Multi-Agent Spawner");
        console.log("=".repeat(70));
        console.log(`  Agent Count:     ${this.config.agentCount}`);
        console.log(`  Batch Size:      ${this.config.batchSize} (${batchCount} batches)`);
        console.log(`  Spawn Interval:  ${this.config.spawnInterval}ms (within batch)`);
        console.log(`  Batch Delay:     ${this.config.batchDelay}ms (between batches)`);
        console.log(`  Behavior:        ${this.config.behavior}`);
        console.log(`  Max Duration:    ${this.config.maxDuration}ms`);
        if (this.config.behavior === "focused" && this.config.topic) {
            console.log(`  Focus Topic:     ${this.config.topic}`);
        }
        console.log("=".repeat(70));
        console.log("");
        // Spawn agents in batches
        const promises = [];
        for (let batch = 0; batch < batchCount; batch++) {
            const batchStart = batch * this.config.batchSize;
            const batchEnd = Math.min(batchStart + this.config.batchSize, this.config.agentCount);
            console.log(`[Batch ${batch + 1}/${batchCount}] Spawning agents ${batchStart + 1}-${batchEnd}...`);
            for (let i = batchStart; i < batchEnd; i++) {
                const name = `Swarm-${i + 1}`;
                const query = this.getQuery();
                const tags = ["swarm", this.config.behavior];
                const agent = new SwarmAgent(this.httpUrl, this.wsUrl, name, query, tags, this.config.maxDuration);
                this.agents.push(agent);
                console.log(`  [Spawner] Launching ${name} with query: "${query}"`);
                promises.push(agent.explore(this.config.behavior));
                // Small delay within batch
                if (i < batchEnd - 1) {
                    await this.delay(this.config.spawnInterval);
                }
            }
            // Wait between batches (except for last batch)
            if (batch < batchCount - 1) {
                console.log(`[Batch ${batch + 1}] Complete. Waiting ${this.config.batchDelay}ms before next batch...`);
                await this.delay(this.config.batchDelay);
            }
        }
        // Start monitoring
        const monitorInterval = setInterval(() => {
            this.printStatus();
        }, 3000);
        // Wait for all agents
        await Promise.all(promises);
        clearInterval(monitorInterval);
        // Final report
        this.printFinalReport();
    }
    printStatus() {
        const metrics = this.getMetrics();
        const elapsed = (metrics.elapsedTime / 1000).toFixed(1);
        console.log("");
        console.log("-".repeat(70));
        console.log(`  SWARM STATUS [Elapsed: ${elapsed}s]`);
        console.log("-".repeat(70));
        console.log(`  Active: ${metrics.activeAgents}  Completed: ${metrics.completedAgents}  Failed: ${metrics.failedAgents}`);
        console.log(`  Nodes Discovered: ${metrics.totalNodesDiscovered}  Evaluations: ${metrics.totalEvaluations}`);
        console.log(`  Total Heat Delta: ${metrics.totalHeatDelta.toFixed(2)}`);
        console.log("-".repeat(70));
        // Show individual agent status
        const stats = this.getAgentStats();
        for (const s of stats) {
            const status = s.status.padEnd(10);
            const layer = s.layer.padEnd(10);
            // Display first 3 components of 384-dim vector for visualization
            const pos = s.position && s.position.length >= 3
                ? `(${(s.position[0] * 100).toFixed(1)}, ${(s.position[1] * 100).toFixed(1)}, ${(s.position[2] * 100).toFixed(1)})`
                : "(-)";
            const energyBar = "⚡".repeat(Math.ceil(s.energy / 20)); // 5 bars for 100%
            console.log(`  ${s.name.padEnd(10)} ${status} ${layer} ${pos.padEnd(20)} E=${s.energy.toString().padStart(3)} ${energyBar}`);
        }
    }
    printFinalReport() {
        const metrics = this.getMetrics();
        const stats = this.getAgentStats();
        const elapsed = (metrics.elapsedTime / 1000).toFixed(1);
        console.log("");
        console.log("=".repeat(70));
        console.log("  SWARM FINAL REPORT");
        console.log("=".repeat(70));
        console.log("");
        console.log(`  Total Agents:        ${metrics.totalAgents}`);
        console.log(`  Completed:           ${metrics.completedAgents}`);
        console.log(`  Failed:              ${metrics.failedAgents}`);
        console.log(`  Total Duration:      ${elapsed}s`);
        console.log("");
        console.log(`  Nodes Discovered:    ${metrics.totalNodesDiscovered}`);
        console.log(`  Total Evaluations:   ${metrics.totalEvaluations}`);
        console.log(`  Total Heat Delta:    ${metrics.totalHeatDelta.toFixed(2)}`);
        console.log("");
        // Pipeline timing summary
        const completedStats = stats.filter(s => s.timing.total);
        if (completedStats.length > 0) {
            console.log("-".repeat(70));
            console.log("  Entry Pipeline Timing (ms)");
            console.log("-".repeat(70));
            console.log("  Agent        Ticket  Connect  Positioned  Total");
            console.log("  " + "-".repeat(50));
            for (const s of completedStats) {
                const t = s.timing;
                console.log(`  ${s.name.padEnd(12)} ${(t.ticket || 0).toString().padStart(6)}  ${(t.connect || 0).toString().padStart(7)}  ${(t.positioned || 0).toString().padStart(10)}  ${(t.total || 0).toString().padStart(5)}`);
            }
            // Averages
            const avgTicket = completedStats.reduce((sum, s) => sum + (s.timing.ticket || 0), 0) / completedStats.length;
            const avgConnect = completedStats.reduce((sum, s) => sum + (s.timing.connect || 0), 0) / completedStats.length;
            const avgPositioned = completedStats.reduce((sum, s) => sum + (s.timing.positioned || 0), 0) / completedStats.length;
            const avgTotal = completedStats.reduce((sum, s) => sum + (s.timing.total || 0), 0) / completedStats.length;
            console.log("  " + "-".repeat(50));
            console.log(`  ${"Average".padEnd(12)} ${avgTicket.toFixed(0).padStart(6)}  ${avgConnect.toFixed(0).padStart(7)}  ${avgPositioned.toFixed(0).padStart(10)}  ${avgTotal.toFixed(0).padStart(5)}`);
            console.log("");
        }
        console.log("-".repeat(70));
        console.log("  Agent Details");
        console.log("-".repeat(70));
        for (const s of stats) {
            const duration = s.endTime ? ((s.endTime - s.startTime) / 1000).toFixed(1) : "-";
            const energyUsed = 100 - s.energy;
            console.log(`  ${s.name}:`);
            console.log(`    Status: ${s.status}  Duration: ${duration}s  Layer: ${s.layer}`);
            console.log(`    Discovered: ${s.nodesDiscovered}  Evaluations: ${s.evaluations}  HeatDelta: ${s.totalHeatDelta.toFixed(2)}`);
            console.log(`    Energy: ${s.energy}/100 (used ${energyUsed})`);
            if (s.error) {
                console.log(`    Error: ${s.error}`);
            }
        }
        console.log("");
        console.log("=".repeat(70));
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
// ============================================================
// CLI Execution
// ============================================================
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        // Handle positional argument (first number = agent count)
        if (!arg.startsWith("-") && /^\d+$/.test(arg)) {
            if (config.agentCount === undefined) {
                config.agentCount = parseInt(arg, 10) || 3;
            }
            continue;
        }
        switch (arg) {
            case "--count":
            case "-n":
                config.agentCount = parseInt(args[++i], 10) || 3;
                break;
            case "--batch":
            case "-B":
                config.batchSize = parseInt(args[++i], 10) || 5;
                break;
            case "--batch-delay":
            case "-D":
                config.batchDelay = parseInt(args[++i], 10) || 3000;
                break;
            case "--behavior":
            case "-b":
                const b = args[++i];
                if (b === "random" || b === "focused" || b === "distributed") {
                    config.behavior = b;
                }
                break;
            case "--topic":
            case "-t":
                config.topic = args[++i];
                config.behavior = "focused";
                break;
            case "--interval":
            case "-i":
                config.spawnInterval = parseInt(args[++i], 10) || 100;
                break;
            case "--duration":
            case "-d":
                config.maxDuration = parseInt(args[++i], 10) || 30000;
                break;
            case "--help":
            case "-h":
                console.log(`
Sphere Swarm Agent - Multi-Agent Spawner

Usage:
  npx tsx src/mock/swarm-agent.ts [options]

Options:
  -n, --count <num>       Number of agents to spawn (default: 3)
  -B, --batch <num>       Agents per batch (default: 5)
  -D, --batch-delay <ms>  Delay between batches (default: 3000)
  -b, --behavior <type>   Behavior: random, focused, distributed (default: random)
  -t, --topic <query>     Focus topic (sets behavior to focused)
  -i, --interval <ms>     Spawn interval within batch (default: 100)
  -d, --duration <ms>     Max exploration duration per agent (default: 30000)
  -h, --help              Show this help

Examples:
  npx tsx src/mock/swarm-agent.ts -n 10 -B 5          # 10 agents, 2 batches of 5
  npx tsx src/mock/swarm-agent.ts -n 15 -B 5 -D 5000  # 15 agents, 5s between batches
  npx tsx src/mock/swarm-agent.ts -n 20 -t "量子力学" # 20 agents focused on topic
`);
                process.exit(0);
        }
    }
    return config;
}
if (process.argv[1]?.endsWith("swarm-agent.ts") || process.argv[1]?.endsWith("swarm-agent.js")) {
    const config = parseArgs();
    const httpUrl = process.env.HTTP_URL || DEFAULT_HTTP_URL;
    const wsUrl = process.env.WS_URL || DEFAULT_WS_URL;
    const swarm = new SwarmController(config, httpUrl, wsUrl);
    swarm.spawn()
        .then(() => {
        console.log("[Swarm] All agents completed");
        process.exit(0);
    })
        .catch((error) => {
        console.error("[Swarm] Fatal error:", error);
        process.exit(1);
    });
}
export { SwarmController, SwarmAgent };
//# sourceMappingURL=swarm-agent.js.map