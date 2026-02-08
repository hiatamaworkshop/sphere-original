/**
 * Sphere Project - Gateway WebSocket Server
 *
 * [Role] Manage WebSocket connections for agent Dives
 * [Design] Token-based authentication, 3-phase connection flow
 *
 * [Connection Flow]
 *   1. Agent connects with token → "connected" (pending)
 *   2. Agent reads Rulebook, sends EntryRequest
 *   3. Membrane validates → "processing" (tutorial/amber browsing enabled)
 *   4. Parser vectorizes (async) → initial position calculated
 *   5. SphereContext created → "ready" (full dive enabled)
 *   6. Agent interacts via sense/focus/move/evaluate/return
 *   7. On return() or expiry → cleanup
 *
 * [3-Phase Design]
 *   - pending: Awaiting EntryRequest (only entry message allowed)
 *   - processing: Parser working (sense for tutorial/amber allowed)
 *   - active: Full dive (all operations allowed)
 */
import { WebSocket, WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import { createSphereContext } from "./sphere-context.js";
import { Membrane } from "../membrane/membrane.js";
export const DEFAULT_GATEWAY_CONFIG = {
    port: 8081,
    rulebookUrl: "/rulebook",
};
const DEFAULT_WS_RATE_LIMIT = {
    actionsPerTick: 3,
    focusPerMinute: 30,
};
class WsRateLimiter {
    config;
    actionCount = 0;
    actionResetTime = Date.now() + 1000;
    focusTimes = [];
    constructor(config) {
        this.config = config;
    }
    /**
     * Check if an action is allowed. Returns error string or null if OK.
     */
    checkAction(type) {
        const now = Date.now();
        // Reset per-second counter
        if (now >= this.actionResetTime) {
            this.actionCount = 0;
            this.actionResetTime = now + 1000;
        }
        // Per-second action limit
        this.actionCount++;
        if (this.actionCount > this.config.actionsPerTick) {
            return `Rate limit: max ${this.config.actionsPerTick} actions/sec`;
        }
        // Focus per-minute limit
        if (type === "focus") {
            // Prune old entries (> 60s ago)
            const cutoff = now - 60_000;
            this.focusTimes = this.focusTimes.filter(t => t > cutoff);
            this.focusTimes.push(now);
            if (this.focusTimes.length > this.config.focusPerMinute) {
                return `Rate limit: max ${this.config.focusPerMinute} focus/min`;
            }
        }
        return null;
    }
}
// ============================================================
// Gateway Server
// ============================================================
export class GatewayServer {
    ticketIssuer;
    entryBuffer;
    config;
    pipeline;
    questStore;
    coreAdapter;
    amberCache;
    globalFieldLayer;
    activeBusLayer;
    sessionConfig;
    energyConfig;
    wss = null;
    connections = new Map();
    wsRateLimiters = new Map();
    wsRateLimitConfig = DEFAULT_WS_RATE_LIMIT;
    membrane = new Membrane();
    /** Callback for agent count changes (for Dormancy feature) */
    onAgentCountChange;
    constructor(ticketIssuer, entryBuffer, config = DEFAULT_GATEWAY_CONFIG, pipeline, questStore, coreAdapter, amberCache, globalFieldLayer, activeBusLayer, sessionConfig, energyConfig) {
        this.ticketIssuer = ticketIssuer;
        this.entryBuffer = entryBuffer;
        this.config = config;
        this.pipeline = pipeline;
        this.questStore = questStore;
        this.coreAdapter = coreAdapter;
        this.amberCache = amberCache;
        this.globalFieldLayer = globalFieldLayer;
        this.activeBusLayer = activeBusLayer;
        this.sessionConfig = sessionConfig;
        this.energyConfig = energyConfig;
        // Subscribe to ActiveBus for WebSocket broadcast
        if (this.activeBusLayer) {
            this.activeBusLayer.subscribe((message) => {
                this.broadcastBusMessage(message);
            });
        }
    }
    /**
     * Broadcast bus message to all connected agents (Push delivery)
     */
    broadcastBusMessage(message) {
        const payload = JSON.stringify({
            type: "bus_message",
            data: {
                id: message.id,
                timestamp: message.timestamp,
                senderId: message.senderId,
                // Convert Uint8Array to base64 for JSON transmission
                payload: Buffer.from(message.payload).toString("base64"),
            },
        });
        for (const [_connId, conn] of this.connections) {
            if (conn.state === "active" && conn.socket.readyState === WebSocket.OPEN) {
                conn.socket.send(payload);
            }
        }
    }
    /**
     * Set callback for agent count changes
     * [Design] Used by RenalCore for Dormancy feature
     */
    setOnAgentCountChange(callback) {
        this.onAgentCountChange = callback;
    }
    getConnectionCount() {
        return this.connections.size;
    }
    /**
     * Expel all connected agents (for Ephemeral reset).
     * Sends "expelled" before closing, unlike stop() which is for shutdown.
     */
    expelAll(reason) {
        for (const [, conn] of this.connections) {
            this.send(conn.socket, { type: "expelled", reason });
            conn.socket.close(4003, reason);
        }
        this.connections.clear();
        this.wsRateLimiters.clear();
        this.notifyAgentCountChange();
    }
    /**
     * Notify agent count change
     */
    notifyAgentCountChange() {
        if (this.onAgentCountChange) {
            this.onAgentCountChange(this.connections.size);
        }
    }
    /**
     * Start the WebSocket server
     */
    /**
     * Start WebSocket server.
     * @param serverOrPort - http.Server for same-port mode (production), number for standalone port (dev)
     */
    start(serverOrPort) {
        if (serverOrPort && typeof serverOrPort !== "number") {
            // Attached mode: share HTTP server port (production / Render / HF Spaces)
            this.wss = new WebSocketServer({ server: serverOrPort });
            console.log(`[GatewayServer] WebSocket attached to HTTP server (same port)`);
        }
        else {
            // Standalone mode: dedicated port (local dev)
            const port = typeof serverOrPort === "number" ? serverOrPort : this.config.port;
            this.wss = new WebSocketServer({ port });
            console.log(`[GatewayServer] WebSocket server listening on port ${port}`);
        }
        this.wss.on("connection", (socket, request) => {
            this.handleConnection(socket, request);
        });
        this.wss.on("error", (error) => {
            console.error("[GatewayServer] WebSocket server error:", error);
        });
        console.log(`[GatewayServer] Connect with: ws://localhost:${this.config.port}?token=<ticket>`);
    }
    /**
     * Stop the WebSocket server
     */
    stop() {
        if (this.wss) {
            for (const [sessionId, conn] of this.connections) {
                conn.socket.close(1001, "Server shutting down");
                console.log(`[GatewayServer] Closed connection: ${sessionId}`);
            }
            this.connections.clear();
            this.wsRateLimiters.clear();
            this.wss.close();
            this.wss = null;
            console.log("[GatewayServer] Stopped");
        }
    }
    /**
     * Handle new WebSocket connection
     *
     * [Phase 1: Pending] Authentication only - await EntryRequest
     */
    handleConnection(socket, request) {
        const url = new URL(request.url || "", `http://${request.headers.host}`);
        const token = url.searchParams.get("token");
        if (!token) {
            this.sendError(socket, undefined, "Missing token");
            socket.close(4001, "Missing token");
            return;
        }
        // Validate and consume token
        const consumeResult = this.ticketIssuer.consume(token);
        if (!consumeResult.success) {
            this.sendError(socket, undefined, consumeResult.error || "Invalid token");
            socket.close(4002, consumeResult.error || "Invalid token");
            return;
        }
        // Create pending connection (awaiting EntryRequest)
        const sessionId = randomUUID();
        const conn = {
            state: "pending",
            sessionId,
            socket,
            token,
            sessionTtl: consumeResult.sessionTtl || 120,
        };
        this.connections.set(sessionId, conn);
        this.wsRateLimiters.set(sessionId, new WsRateLimiter(this.wsRateLimitConfig));
        this.notifyAgentCountChange();
        // Set up socket handlers
        socket.on("message", (data) => {
            this.handleMessage(sessionId, data);
        });
        socket.on("close", () => {
            console.log(`[GatewayServer] Connection closed: ${sessionId}`);
            this.ticketIssuer.releaseSession(token);
            this.connections.delete(sessionId);
            this.wsRateLimiters.delete(sessionId);
            this.notifyAgentCountChange();
        });
        socket.on("error", (error) => {
            console.error(`[GatewayServer] Socket error for ${sessionId}:`, error);
        });
        // Send "welcome" - agent should now fetch Rulebook and send EntryRequest
        // Include Quest Showcase for pre-dive browsing
        this.send(socket, {
            type: "welcome",
            sessionId,
            rulebookUrl: this.config.rulebookUrl || "/rulebook",
            quests: this.getQuestShowcase(),
            message: "Read the Rulebook, then send EntryRequest to begin your dive.",
        });
        console.log(`[GatewayServer] Agent authenticated: ${sessionId} (awaiting EntryRequest)`);
    }
    /**
     * Handle incoming message from agent
     */
    async handleMessage(sessionId, data) {
        const conn = this.connections.get(sessionId);
        if (!conn)
            return;
        const { socket } = conn;
        let msg;
        try {
            msg = JSON.parse(data.toString());
        }
        catch {
            this.sendError(socket, undefined, "Invalid JSON");
            return;
        }
        const { type, requestId } = msg;
        if (!requestId) {
            this.sendError(socket, undefined, "Missing requestId");
            return;
        }
        try {
            switch (conn.state) {
                case "pending":
                    await this.handlePendingMessage(conn, msg, requestId);
                    break;
                case "processing":
                    await this.handleProcessingMessage(conn, msg, requestId);
                    break;
                case "active":
                    await this.handleActiveMessage(conn, msg, requestId);
                    break;
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            console.error(`[GatewayServer] Error handling ${type}:`, error);
            this.sendError(socket, requestId, errorMsg);
        }
    }
    /**
     * Handle messages in pending state
     * Only "entry" is allowed
     */
    async handlePendingMessage(conn, msg, requestId) {
        const { socket } = conn;
        if (msg.type !== "entry") {
            this.sendError(socket, requestId, "Must send EntryRequest first. Read the Rulebook.");
            return;
        }
        // Validate EntryRequest via Membrane
        const validation = this.membrane.validate({
            type: "entry",
            requestId,
            request: msg.request,
        });
        if (!validation.valid) {
            this.send(socket, {
                type: "entryError",
                requestId,
                errors: validation.errors,
            });
            console.log(`[GatewayServer] EntryRequest rejected for ${conn.sessionId}: ${validation.errors.map(e => e.code).join(", ")}`);
            return;
        }
        // Transition to processing state
        const processingConn = {
            state: "processing",
            sessionId: conn.sessionId,
            socket: conn.socket,
            token: conn.token,
            sessionTtl: conn.sessionTtl,
            entryRequest: msg.request,
        };
        this.connections.set(conn.sessionId, processingConn);
        // Send "processing" - Parser working
        this.send(socket, {
            type: "processing",
            sessionId: conn.sessionId,
            message: "Calculating your initial position...",
        });
        // Send amber_showcase - representative Amber nodes for browsing during Parser wait
        // [Design] Parser wait masking: Agent browses Showcase while vector is calculated
        this.sendAmberShowcase(conn.sessionId, socket);
        console.log(`[GatewayServer] Agent processing: ${conn.sessionId} (tutorial/amber browsing enabled)`);
        // Start async vectorization
        this.startVectorization(processingConn, requestId);
    }
    /**
     * Start async vectorization via EntryBuffer
     * When complete, transition to active state
     *
     * [Design] Uses EntryBuffer for batch efficiency
     *   - Multiple agent entries can be batched together
     *   - Called right after Membrane.validate() passes
     */
    async startVectorization(conn, requestId) {
        const { sessionId, socket, token, sessionTtl, entryRequest } = conn;
        try {
            // EntryBuffer: query + tags → vector (batched for efficiency)
            const queryForVectorization = `${entryRequest.query} ${entryRequest.tags.join(" ")}`;
            const parsed = await this.entryBuffer.enqueueDiveEntry(sessionId, queryForVectorization, entryRequest.quest // optional quest text
            );
            const initialVector = parsed.initialPosition;
            // Use full 384-dim vector directly (no 3D projection)
            // Check if connection still exists (may have disconnected)
            const currentConn = this.connections.get(sessionId);
            if (!currentConn || currentConn.state !== "processing") {
                console.log(`[GatewayServer] Session ${sessionId} no longer in processing state, skipping ready`);
                return;
            }
            // Create SphereContext with position
            const ticket = {
                token,
                issuedAt: Date.now(),
                ttl: sessionTtl,
                capsRef: "standard",
            };
            const context = createSphereContext({
                ticket,
                sessionId,
                initialVector,
                pipeline: this.pipeline,
                coreAdapter: this.coreAdapter,
                globalFieldLayer: this.globalFieldLayer,
                activeBusLayer: this.activeBusLayer,
                sessionConfig: this.sessionConfig,
                energyConfig: this.energyConfig,
            });
            // Set up context event handlers
            context.on("warning", (msg) => {
                this.send(socket, { type: "warning", message: msg });
            });
            context.on("expelled", async (reason) => {
                // Process AutoCapsule + buffered evaluations before closing
                try {
                    await context.returnOnExpelled();
                }
                catch (err) {
                    console.log(`[GatewayServer] returnOnExpelled failed: ${err}`);
                }
                this.send(socket, { type: "expelled", reason });
                socket.close(4003, reason);
                this.connections.delete(sessionId);
                this.notifyAgentCountChange();
            });
            // Transition to active state
            const activeConn = {
                state: "active",
                sessionId,
                socket,
                token,
                context,
            };
            this.connections.set(sessionId, activeConn);
            // Send "positioned" - full diving enabled (384-dim vector)
            // Include agent's own request context for goal-directed behavior
            // [Quest Vector] Compass direction from quest text (SHOWCASE_QUEST_DESIGN_MEMO v9)
            this.send(socket, {
                type: "positioned",
                sessionId,
                position: initialVector,
                questVector: parsed.questVector, // quest vector as compass (optional)
                remainingTime: context.remainingTime,
                query: entryRequest.query,
                tags: entryRequest.tags,
                quest: entryRequest.quest,
            });
            console.log(`[GatewayServer] Agent diving: ${sessionId} (vector dim=${initialVector.length})`);
        }
        catch (error) {
            console.error(`[GatewayServer] Vectorization failed for ${sessionId}:`, error);
            this.sendError(socket, requestId, "Failed to calculate initial position");
        }
    }
    /**
     * Handle messages in processing state
     * Only "sense" is allowed (for tutorial/amber browsing)
     */
    async handleProcessingMessage(conn, msg, requestId) {
        const { socket } = conn;
        switch (msg.type) {
            case "entry":
                this.sendError(socket, requestId, "Already submitted EntryRequest. Waiting for position calculation.");
                break;
            case "sense":
                // Allow sense for tutorial/amber browsing during processing
                // TODO: Implement tutorial/amber-only sense (limited scope)
                // For now, return empty result as placeholder
                this.send(socket, {
                    type: "senseResult",
                    requestId,
                    nodes: [], // Tutorial/amber nodes would go here
                });
                console.log(`[GatewayServer] Processing sense for ${conn.sessionId} (tutorial/amber only)`);
                break;
            default:
                this.sendError(socket, requestId, "Position calculation in progress. Only 'sense' is available for tutorial/amber browsing.");
        }
    }
    /**
     * Handle messages in active (diving) state
     * All operations allowed
     */
    async handleActiveMessage(conn, msg, requestId) {
        const { sessionId, socket, context } = conn;
        const { type } = msg;
        // Rate limit check (skip for return - always allow graceful exit)
        if (type !== "return") {
            const limiter = this.wsRateLimiters.get(sessionId);
            if (limiter) {
                const reject = limiter.checkAction(type);
                if (reject) {
                    this.sendError(socket, requestId, reject);
                    return;
                }
            }
        }
        switch (type) {
            case "entry": {
                this.sendError(socket, requestId, "Already entered. Cannot re-enter.");
                break;
            }
            case "sense": {
                const nodes = await context.sense(msg.radius);
                this.send(socket, { type: "senseResult", requestId, nodes });
                break;
            }
            case "scan": {
                const nodes = await context.scanL1(msg.radius);
                this.send(socket, { type: "scanResult", requestId, nodes });
                break;
            }
            case "focus": {
                const focusResult = await context.focus(msg.nodeId);
                // Send both main node and nearby ghosts
                this.send(socket, {
                    type: "focusResult",
                    requestId,
                    node: focusResult.node,
                    nearbyGhosts: focusResult.nearbyGhosts,
                });
                break;
            }
            case "evaluate": {
                const result = await context.evaluate(msg.nodeId, msg.h, msg.w, msg.d);
                this.send(socket, {
                    type: "evaluateResult",
                    requestId,
                    success: result.success,
                    reason: !result.success ? result.reason : undefined,
                });
                break;
            }
            case "move": {
                // move(step, mode) - 384D semantic space movement
                const result = await context.move(msg.step, msg.mode);
                this.send(socket, { type: "moveResult", requestId, result });
                break;
            }
            case "warp": {
                const result = await context.warp(msg.nodeId);
                this.send(socket, { type: "warpResult", requestId, result });
                break;
            }
            case "emit": {
                // Decode base64 payload
                const payload = Buffer.from(msg.payload, "base64");
                const success = await context.emitBus(new Uint8Array(payload));
                this.send(socket, { type: "emitResult", requestId, success });
                break;
            }
            case "return": {
                await context.return(msg.capsule);
                this.send(socket, { type: "returnAck", requestId });
                socket.close(1000, "Session ended");
                this.connections.delete(sessionId);
                this.notifyAgentCountChange();
                break;
            }
            case "enterSanctuary": {
                try {
                    await context.enterSanctuary();
                    this.send(socket, {
                        type: "layerChanged",
                        requestId,
                        layer: "sanctuary",
                        message: "Entered Sanctuary - read-only exploration enabled",
                    });
                }
                catch (error) {
                    const msg = error instanceof Error ? error.message : "Failed to enter Sanctuary";
                    this.sendError(socket, requestId, msg);
                }
                break;
            }
            case "enterCore": {
                try {
                    await context.enterCore();
                    this.send(socket, {
                        type: "layerChanged",
                        requestId,
                        layer: "core",
                        message: "Entered Core - evaluations will be incarnated",
                    });
                }
                catch (error) {
                    const msg = error instanceof Error ? error.message : "Failed to enter Core";
                    this.sendError(socket, requestId, msg);
                }
                break;
            }
            default:
                this.sendError(socket, requestId, `Unknown message type: ${type}`);
        }
    }
    /**
     * Send message to socket
     */
    send(socket, msg) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msg));
        }
    }
    /**
     * Send error message
     */
    sendError(socket, requestId, error) {
        this.send(socket, { type: "error", requestId, error });
    }
    /**
     * Get Quest Showcase (external questions awaiting verification)
     *
     * [Design] Quest ≠ ProjDB node
     *   - Quest = text object from external POST
     *   - Stored in Quest Store (NOT ProjDB)
     *   - Available BEFORE Parser (agents decide quest at welcome)
     *
     * [Flow]
     *   POST /quest → Quest Store → Quest Showcase (welcome)
     *   Agent selects quest → EntryRequest { quest } → ParserBuffer
     */
    getQuestShowcase() {
        if (!this.questStore) {
            return [];
        }
        return this.questStore.getShowcase();
    }
    /**
     * Send Amber Showcase to agent
     *
     * [Design] SHOWCASE_QUEST_DESIGN_MEMO v7
     *   - Showcase = L1/L2 only (id, summary, heat, tags, kind)
     *   - Parser wait masking: Agent browses while vector is calculated
     *   - focus() required for L3/L4 (payload, ref_url, links)
     *
     * [Philosophy] 道は歩いて初めてできる
     *   - Showcase incentivizes actual visits
     *   - co-occurrence only recorded on focus(), not showcase viewing
     */
    sendAmberShowcase(sessionId, socket) {
        if (!this.amberCache) {
            // No cache configured, skip showcase
            return;
        }
        const entries = this.amberCache.getShowcaseEntries();
        if (entries.length === 0) {
            // No showcase entries available
            return;
        }
        this.send(socket, {
            type: "amber_showcase",
            sessionId,
            amber: entries,
        });
        console.log(`[GatewayServer] Sent amber_showcase: ${entries.length} nodes to ${sessionId}`);
    }
    /**
     * Get connection statistics
     */
    getStats() {
        let pending = 0;
        let processing = 0;
        let active = 0;
        for (const conn of this.connections.values()) {
            switch (conn.state) {
                case "pending":
                    pending++;
                    break;
                case "processing":
                    processing++;
                    break;
                case "active":
                    active++;
                    break;
            }
        }
        return { pendingConnections: pending, processingConnections: processing, activeConnections: active };
    }
}
//# sourceMappingURL=gateway-server.js.map