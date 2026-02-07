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

import { WebSocket, WebSocketServer, RawData } from "ws";
import type { IncomingMessage, Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import { TicketIssuer } from "./ticket-issuer.js";
import { createSphereContext, SphereContextImpl } from "./sphere-context.js";
import { Membrane } from "../membrane/membrane.js";
import type { EntryBuffer } from "../parser/buffer.js";
import type { IIncarnationPipeline } from "../incarnation/pipeline.js";
import type { NearbyNode, NodeDetail, MoveResult, WarpResult, WalkMode, EntryRequest, AmberShowcaseEntry, ScanResult, L1ScanResult } from "../types/gateway.js";
import type { ExperienceCapsule } from "../types/capsule.js";
import type { QuestStore } from "./quest-store.js";
import type { SphereCoreAdapter } from "./sphere-core-adapter.js";
import type { UnifiedAmberCache } from "./amber-cache.js";
import type { GlobalFieldLayer } from "../field/index.js";
import type { ActiveBusLayer, BusMessage } from "../bus/index.js";

// ============================================================
// Configuration
// ============================================================

export interface GatewayServerConfig {
  port: number;
  /** URL for agents to fetch Rulebook */
  rulebookUrl?: string;
}

export const DEFAULT_GATEWAY_CONFIG: GatewayServerConfig = {
  port: 8081,
  rulebookUrl: "/rulebook",
};

// ============================================================
// Showcase Types (Quest/Amber for pre-dive browsing)
// ============================================================

/**
 * Quest Summary: External question awaiting verification
 * Re-exported from QuestStore with additional fields for welcome message
 */
interface QuestSummary {
  id: string;
  question: string;
  tags: string[];
  submittedAt: number;
}

// ============================================================
// Message Types (Agent ↔ Gateway)
// ============================================================

/**
 * Agent → Gateway messages
 */
type AgentMessage =
  | { type: "entry"; requestId: string; request: EntryRequest }
  | { type: "sense"; requestId: string; radius?: number }
  | { type: "focus"; requestId: string; nodeId: string }
  | { type: "evaluate"; requestId: string; nodeId: string; h: number; w: number; d: number }
  | { type: "move"; requestId: string; step?: number; mode?: WalkMode }
  | { type: "warp"; requestId: string; nodeId: string }
  | { type: "scan"; requestId: string; radius?: number }
  | { type: "emit"; requestId: string; payload: string }  // base64 encoded
  | { type: "return"; requestId: string; capsule?: ExperienceCapsule }
  | { type: "enterSanctuary"; requestId: string }
  | { type: "enterCore"; requestId: string };

/**
 * Gateway → Agent messages
 *
 * [Message Names - SHOWCASE_QUEST_DESIGN_MEMO alignment]
 *   - welcome: Initial greeting with Quest Showcase
 *   - processing: Parser working
 *   - amber_showcase: Amber nodes during Parser wait (L1/L2 only)
 *   - positioned: Ready for full dive with initial position
 *
 * [Amber Cache Design - SHOWCASE_QUEST_DESIGN_MEMO v7]
 *   - Unified cache: Single Map + showcaseIds Set
 *   - Showcase: L1/L2 only (id, summary, heat, tags, kind)
 *   - Dynamic: Internal cache for focus optimization (not exposed)
 */
type GatewayMessage =
  | { type: "welcome"; sessionId: string; rulebookUrl: string; quests: QuestSummary[]; message: string }
  | { type: "processing"; sessionId: string; message: string }
  | { type: "amber_showcase"; sessionId: string; amber: AmberShowcaseEntry[] }
  | { type: "positioned"; sessionId: string; position: number[]; questVector?: number[]; remainingTime: number; query: string; tags: string[]; quest?: string }
  | { type: "entryError"; requestId: string; errors: { code: string; message: string; field?: string }[] }
  | { type: "senseResult"; requestId: string; nodes: NearbyNode[] }
  | { type: "scanResult"; requestId: string; nodes: L1ScanResult[] }
  | { type: "focusResult"; requestId: string; node: NodeDetail; nearbyGhosts?: NodeDetail[] }
  | { type: "evaluateResult"; requestId: string; success: boolean; reason?: string }
  | { type: "moveResult"; requestId: string; result: MoveResult }
  | { type: "warpResult"; requestId: string; result: WarpResult }
  | { type: "emitResult"; requestId: string; success: boolean }
  | { type: "bus_message"; data: { id: string; timestamp: number; senderId: string; payload: string } }
  | { type: "returnAck"; requestId: string }
  | { type: "layerChanged"; requestId: string; layer: string; message: string }
  | { type: "error"; requestId?: string; error: string }
  | { type: "warning"; message: string }
  | { type: "expelled"; reason: string };

// ============================================================
// Connection State (3-phase)
// ============================================================

/**
 * Pending connection: Authenticated but awaiting EntryRequest
 */
interface PendingConnection {
  state: "pending";
  sessionId: string;
  socket: WebSocket;
  token: string;
  sessionTtl: number;
}

/**
 * Processing connection: EntryRequest received, Parser working
 * Agent can browse tutorial/amber during this phase
 */
interface ProcessingConnection {
  state: "processing";
  sessionId: string;
  socket: WebSocket;
  token: string;
  sessionTtl: number;
  entryRequest: EntryRequest;
}

/**
 * Active connection: SphereContext created, full diving enabled
 */
interface ActiveConnection {
  state: "active";
  sessionId: string;
  socket: WebSocket;
  token: string;
  context: SphereContextImpl;
}

type ConnectionState = PendingConnection | ProcessingConnection | ActiveConnection;

// ============================================================
// WebSocket Message Rate Limiter (per connection)
// ============================================================

interface WsRateLimitConfig {
  /** Max actions per tick (1 second) */
  actionsPerTick: number;
  /** Max focus calls per minute */
  focusPerMinute: number;
}

const DEFAULT_WS_RATE_LIMIT: WsRateLimitConfig = {
  actionsPerTick: 3,
  focusPerMinute: 30,
};

class WsRateLimiter {
  private actionCount = 0;
  private actionResetTime = Date.now() + 1000;
  private focusTimes: number[] = [];

  constructor(private config: WsRateLimitConfig) {}

  /**
   * Check if an action is allowed. Returns error string or null if OK.
   */
  checkAction(type: string): string | null {
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
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, ConnectionState>();
  private wsRateLimiters = new Map<string, WsRateLimiter>();
  private wsRateLimitConfig: WsRateLimitConfig = DEFAULT_WS_RATE_LIMIT;
  private membrane = new Membrane();

  /** Callback for agent count changes (for Dormancy feature) */
  private onAgentCountChange?: (count: number) => void;

  constructor(
    private ticketIssuer: TicketIssuer,
    private entryBuffer: EntryBuffer,
    private config: GatewayServerConfig = DEFAULT_GATEWAY_CONFIG,
    private pipeline?: IIncarnationPipeline,
    private questStore?: QuestStore,
    private coreAdapter?: SphereCoreAdapter,
    private amberCache?: UnifiedAmberCache,
    private globalFieldLayer?: GlobalFieldLayer,
    private activeBusLayer?: ActiveBusLayer
  ) {
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
  private broadcastBusMessage(message: BusMessage): void {
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
  setOnAgentCountChange(callback: (count: number) => void): void {
    this.onAgentCountChange = callback;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Expel all connected agents (for Ephemeral reset).
   * Sends "expelled" before closing, unlike stop() which is for shutdown.
   */
  expelAll(reason: string): void {
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
  private notifyAgentCountChange(): void {
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
  start(serverOrPort?: HttpServer | number): void {
    if (serverOrPort && typeof serverOrPort !== "number") {
      // Attached mode: share HTTP server port (production / Render / HF Spaces)
      this.wss = new WebSocketServer({ server: serverOrPort });
      console.log(`[GatewayServer] WebSocket attached to HTTP server (same port)`);
    } else {
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
  stop(): void {
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
  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
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
    const conn: PendingConnection = {
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
  private async handleMessage(sessionId: string, data: RawData): Promise<void> {
    const conn = this.connections.get(sessionId);
    if (!conn) return;

    const { socket } = conn;

    let msg: AgentMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[GatewayServer] Error handling ${type}:`, error);
      this.sendError(socket, requestId, errorMsg);
    }
  }

  /**
   * Handle messages in pending state
   * Only "entry" is allowed
   */
  private async handlePendingMessage(
    conn: PendingConnection,
    msg: AgentMessage,
    requestId: string
  ): Promise<void> {
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
    const processingConn: ProcessingConnection = {
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
  private async startVectorization(
    conn: ProcessingConnection,
    requestId: string
  ): Promise<void> {
    const { sessionId, socket, token, sessionTtl, entryRequest } = conn;

    try {
      // EntryBuffer: query + tags → vector (batched for efficiency)
      const queryForVectorization = `${entryRequest.query} ${entryRequest.tags.join(" ")}`;
      const parsed = await this.entryBuffer.enqueueDiveEntry(
        sessionId,
        queryForVectorization,
        entryRequest.quest  // optional quest text
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
      });

      // Set up context event handlers
      context.on("warning", (msg) => {
        this.send(socket, { type: "warning", message: msg });
      });

      context.on("expelled", (reason) => {
        this.send(socket, { type: "expelled", reason });
        socket.close(4003, reason);
        this.connections.delete(sessionId);
        this.notifyAgentCountChange();
      });

      // Transition to active state
      const activeConn: ActiveConnection = {
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
        questVector: parsed.questVector,  // quest vector as compass (optional)
        remainingTime: context.remainingTime,
        query: entryRequest.query,
        tags: entryRequest.tags,
        quest: entryRequest.quest,
      });

      console.log(`[GatewayServer] Agent diving: ${sessionId} (vector dim=${initialVector.length})`);

    } catch (error) {
      console.error(`[GatewayServer] Vectorization failed for ${sessionId}:`, error);
      this.sendError(socket, requestId, "Failed to calculate initial position");
    }
  }

  /**
   * Handle messages in processing state
   * Only "sense" is allowed (for tutorial/amber browsing)
   */
  private async handleProcessingMessage(
    conn: ProcessingConnection,
    msg: AgentMessage,
    requestId: string
  ): Promise<void> {
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
  private async handleActiveMessage(
    conn: ActiveConnection,
    msg: AgentMessage,
    requestId: string
  ): Promise<void> {
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
        } catch (error) {
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
        } catch (error) {
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
  private send(socket: WebSocket, msg: GatewayMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  /**
   * Send error message
   */
  private sendError(socket: WebSocket, requestId: string | undefined, error: string): void {
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
  private getQuestShowcase(): QuestSummary[] {
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
  private sendAmberShowcase(sessionId: string, socket: WebSocket): void {
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
  getStats(): { pendingConnections: number; processingConnections: number; activeConnections: number } {
    let pending = 0;
    let processing = 0;
    let active = 0;
    for (const conn of this.connections.values()) {
      switch (conn.state) {
        case "pending": pending++; break;
        case "processing": processing++; break;
        case "active": active++; break;
      }
    }
    return { pendingConnections: pending, processingConnections: processing, activeConnections: active };
  }
}
