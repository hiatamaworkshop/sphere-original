/**
 * Sphere Project - Gateway WebSocket Server
 *
 * [Role] Manage WebSocket connections for agent Dives
 * [Design] Token-based authentication, 3-phase connection flow
 *
 * [Connection Flow]
 *   1. Agent connects with token → "connected" (pending)
 *   2. Agent reads Rulebook, sends EntryRequest
 *   3. Membrane validates → SphereContext(relic vector) → "processing" (Tutorial active)
 *   4. Parser vectorizes (async) → reposition(queryVector) → "positioned"
 *   5. Agent transitions: enterSanctuary → enterCore
 *   6. Agent interacts via sense/focus/move/evaluate/return
 *   7. On return() or expiry → cleanup
 *
 * [2-Phase Design]
 *   - pending: Awaiting EntryRequest (only entry message allowed)
 *   - active: SphereContext exists, Tutorial layer (relic vector → query vector via reposition)
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
import type { SphereCoreAdapter } from "./sphere-core-adapter.js";
import type { UnifiedAmberCache } from "./amber-cache.js";
import type { GlobalFieldLayer } from "../field/index.js";
import type { ActiveBusLayer, BusMessage } from "../bus/index.js";
import type { PeripheryConfig } from "../types/config.js";

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
  | { type: "enterCore"; requestId: string }
  // Vestibule commands
  | { type: "submitCapsule"; requestId: string; capsule: ExperienceCapsule }
  | { type: "viewReceipt"; requestId: string }
  | { type: "viewTrail"; requestId: string }
  | { type: "viewDiscoveries"; requestId: string }
  | { type: "acknowledge"; requestId: string };

/**
 * Gateway → Agent messages
 *
 * [Message Names]
 *   - welcome: Initial greeting
 *   - processing: Parser working
 *   - amber_showcase: Amber nodes during Parser wait (L1/L2 only)
 *   - positioned: Ready for full dive with initial position
 *
 * [Amber Cache Design]
 *   - Unified cache: Single Map + showcaseIds Set
 *   - Showcase: L1/L2 only (id, summary, heat, tags, kind)
 *   - Dynamic: Internal cache for focus optimization (not exposed)
 */
type GatewayMessage =
  | { type: "welcome"; sessionId: string; sphereId: string; rulebookUrl: string; message: string }
  | { type: "processing"; sessionId: string; message: string }
  | { type: "amber_showcase"; sessionId: string; amber: AmberShowcaseEntry[] }
  | { type: "positioned"; sessionId: string; position: number[]; remainingTime: number; query: string; tags: string[] }
  | { type: "entryError"; requestId: string; errors: { code: string; message: string; field?: string }[] }
  | { type: "senseResult"; requestId: string; nodes: NearbyNode[]; energy?: number }
  | { type: "scanResult"; requestId: string; nodes: L1ScanResult[]; energy?: number }
  | { type: "focusResult"; requestId: string; node: NodeDetail; nearbyGhosts?: NodeDetail[]; energy?: number }
  | { type: "evaluateResult"; requestId: string; success: boolean; reason?: string; energy?: number }
  | { type: "moveResult"; requestId: string; result: MoveResult; energy?: number }
  | { type: "warpResult"; requestId: string; result: WarpResult; energy?: number }
  | { type: "emitResult"; requestId: string; success: boolean; energy?: number }
  | { type: "bus_message"; data: { id: string; timestamp: number; senderId: string; payload: string } }
  | { type: "layerChanged"; requestId: string; layer: string; message: string; energy?: number }
  | { type: "error"; requestId?: string; error: string; energy?: number }
  | { type: "warning"; message: string }
  | { type: "expelled"; reason: string }
  // Vestibule messages
  | { type: "vestibuleEntered"; requestId?: string; sessionId: string; sphereId: string; timestamp: number; auto: { evaluationsApplied: number; autoCapsuleSaved: boolean }; commands: { name: string; description: string }[]; farewell: string }
  | { type: "submitCapsuleResult"; requestId: string; success: boolean; nodeCount?: number; evaluationCount?: number; errors?: string[] }
  | { type: "receipt"; requestId: string; data: any }
  | { type: "trail"; requestId: string; data: any }
  | { type: "discoveries"; requestId: string; data: any }
  | { type: "farewell"; requestId: string };

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
 * Active connection: SphereContext created, diving enabled
 * [Entry Pipeline] Created immediately on entry with relic vector (Tutorial layer).
 * Query vector arrives async via reposition().
 */
interface ActiveConnection {
  state: "active";
  sessionId: string;
  socket: WebSocket;
  token: string;
  context: SphereContextImpl;
}

type ConnectionState = PendingConnection | ActiveConnection;

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
  actionsPerTick: 10,
  focusPerMinute: 60,
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

/** Vestibule commands presented to agents on exit */
const VESTIBULE_COMMANDS = [
  { name: "submitCapsule", description: "Submit NodeSeeds for incarnation" },
  { name: "viewReceipt", description: "Metabolic impact of your evaluations" },
  { name: "viewTrail", description: "Your exploration trajectory" },
  { name: "viewDiscoveries", description: "Notable nodes encountered" },
  { name: "acknowledge", description: "Complete session and disconnect" },
];

export class GatewayServer {
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, ConnectionState>();
  private wsRateLimiters = new Map<string, WsRateLimiter>();
  private wsRateLimitConfig: WsRateLimitConfig = DEFAULT_WS_RATE_LIMIT;
  private vestibuleTtlTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private membrane = new Membrane();

  /** Callback for agent count changes (for Dormancy feature) */
  private onAgentCountChange?: (count: number) => void;

  /**
   * [2026-02-25] Callback for session end (trajectory export hook)
   * Fired at acknowledge with full trail data for external push (Facade locker, etc.)
   */
  private onSessionEnd?: (trail: ReturnType<SphereContextImpl["getTrail"]>) => void;

  constructor(
    private ticketIssuer: TicketIssuer,
    private entryBuffer: EntryBuffer,
    private config: GatewayServerConfig = DEFAULT_GATEWAY_CONFIG,
    private pipeline?: IIncarnationPipeline,
    private coreAdapter?: SphereCoreAdapter,
    private amberCache?: UnifiedAmberCache,
    private globalFieldLayer?: GlobalFieldLayer,
    private activeBusLayer?: ActiveBusLayer,
    private sessionConfig?: PeripheryConfig["session"],
    private energyConfig?: PeripheryConfig["energy"],
    private vestibuleConfig?: PeripheryConfig["vestibule"],
    private sphereId: string = "unknown"
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

  /**
   * [2026-02-25] Set callback for session end (trajectory export)
   * Called at acknowledge with the full trail data.
   * External services (Facade locker, trajectory archive) can subscribe here.
   */
  setOnSessionEnd(callback: (trail: ReturnType<SphereContextImpl["getTrail"]>) => void): void {
    this.onSessionEnd = callback;
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
    for (const timer of this.vestibuleTtlTimers.values()) clearTimeout(timer);
    this.vestibuleTtlTimers.clear();
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
      for (const timer of this.vestibuleTtlTimers.values()) clearTimeout(timer);
      this.vestibuleTtlTimers.clear();

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
      // Serverside vestibule: rescue evaluations on silent disconnect
      const currentConn = this.connections.get(sessionId);
      if (currentConn?.state === "active" && !currentConn.context.ended) {
        console.log(`[GatewayServer] Serverside vestibule for ${sessionId} (silent disconnect)`);
        currentConn.context.enterVestibule().catch(err => {
          console.error(`[GatewayServer] Serverside vestibule error:`, err);
        });
      }
      // Clear vestibule TTL timer if any
      const vtTimer = this.vestibuleTtlTimers.get(sessionId);
      if (vtTimer) {
        clearTimeout(vtTimer);
        this.vestibuleTtlTimers.delete(sessionId);
      }
      this.ticketIssuer.releaseSession(token);
      this.connections.delete(sessionId);
      this.wsRateLimiters.delete(sessionId);
      this.notifyAgentCountChange();
    });

    socket.on("error", (error) => {
      console.error(`[GatewayServer] Socket error for ${sessionId}:`, error);
    });

    // Send "welcome" - agent should now fetch Rulebook and send EntryRequest
    this.send(socket, {
      type: "welcome",
      sessionId,
      sphereId: this.sphereId,
      rulebookUrl: this.config.rulebookUrl || "/rulebook",
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
        case "active":
          await this.handleActiveMessage(conn, msg, requestId);
          break;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[GatewayServer] Error handling ${type}:`, error);
      // [Design] 失敗時は返金が入っている可能性があるため残エネルギーを併せて返す。
      //          これが無いとエージェント側は返金を観測できない。
      const energy = conn.state === "active" ? conn.context.energy : undefined;
      this.sendError(socket, requestId, errorMsg, energy);
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

    // [Entry Pipeline] Get relic vector for Tutorial mock positioning
    // Tutorial starts immediately at a relic's location while query vectorization runs async
    const relicVector = this.coreAdapter
      ? await this.coreAdapter.getRelicVector()
      : new Array(384).fill(0);

    // Create SphereContext immediately with relic vector (Tutorial layer)
    const ticket = {
      token: conn.token,
      issuedAt: Date.now(),
      ttl: conn.sessionTtl,
      capsRef: "standard",
    };

    const context = createSphereContext({
      ticket,
      sessionId: conn.sessionId,
      initialVector: relicVector,
      pipeline: this.pipeline,
      coreAdapter: this.coreAdapter,
      globalFieldLayer: this.globalFieldLayer,
      activeBusLayer: this.activeBusLayer,
      sessionConfig: this.sessionConfig,
      energyConfig: this.energyConfig,
      // [2026-02-25] Cross-session metadata for trajectory analysis
      agentId: msg.request.agentId,
      initialQuery: msg.request.query,
      sphereId: this.sphereId,
    });

    // Set up context event handlers
    context.on("warning", (warningMsg) => {
      this.send(socket, { type: "warning", message: warningMsg });
    });

    context.on("expelled", async (reason) => {
      try {
        const autoResult = await context.returnOnExpelled();
        // Enter vestibule instead of immediate disconnect
        this.send(socket, {
          type: "vestibuleEntered",
          sessionId: conn.sessionId,
          sphereId: this.sphereId,
          timestamp: Date.now(),
          auto: autoResult,
          commands: VESTIBULE_COMMANDS,
          farewell: `Expelled: ${reason}. Your evaluations have been saved.`,
        });
        this.startVestibuleTtl(conn.sessionId, socket);
        console.log(`[GatewayServer] Expelled → Vestibule: ${conn.sessionId} (${reason})`);
      } catch (err) {
        console.error(`[GatewayServer] Expelled vestibule failed:`, err);
        this.send(socket, { type: "expelled", reason });
        socket.close(4003, reason);
        this.connections.delete(conn.sessionId);
        this.notifyAgentCountChange();
      }
    });

    // Transition to active state immediately (Tutorial layer)
    const activeConn: ActiveConnection = {
      state: "active",
      sessionId: conn.sessionId,
      socket: conn.socket,
      token: conn.token,
      context,
    };
    this.connections.set(conn.sessionId, activeConn);

    // Send "processing" — client knows Tutorial is ready
    this.send(socket, {
      type: "processing",
      sessionId: conn.sessionId,
      message: "Tutorial ready. Query vectorization in progress...",
    });

    // Send amber_showcase - representative Amber nodes for browsing during Parser wait
    // [Design] Parser wait masking: Agent browses Showcase while vector is calculated
    this.sendAmberShowcase(conn.sessionId, socket);

    console.log(`[GatewayServer] Agent in Tutorial: ${conn.sessionId} (relic vector, async vectorization started)`);

    // Start async vectorization — on completion, reposition + send positioned
    this.startVectorization(activeConn, requestId, msg.request);
  }

  /**
   * Start async vectorization via EntryBuffer
   * When complete, reposition agent and send "positioned"
   *
   * [Entry Pipeline] SphereContext already exists (relic vector).
   * This method runs async — agent can explore Tutorial while waiting.
   */
  private async startVectorization(
    conn: ActiveConnection,
    requestId: string,
    entryRequest: EntryRequest
  ): Promise<void> {
    const { sessionId, socket, context } = conn;

    try {
      // EntryBuffer: query + tags → vector (batched for efficiency)
      const queryForVectorization = `${entryRequest.query} ${entryRequest.tags.join(" ")}`;
      const parsed = await this.entryBuffer.enqueueDiveEntry(
        sessionId,
        queryForVectorization,
      );
      const queryVector = parsed.initialPosition;

      // Check if connection still exists (may have disconnected during vectorization)
      const currentConn = this.connections.get(sessionId);
      if (!currentConn || currentConn.state !== "active") {
        console.log(`[GatewayServer] Session ${sessionId} no longer active, skipping reposition`);
        return;
      }

      // Reposition agent from relic vector to real query vector
      context.reposition(queryVector);

      // Send "positioned" — query vector ready, Sanctuary transition enabled
      this.send(socket, {
        type: "positioned",
        sessionId,
        position: queryVector,
        remainingTime: context.remainingTime,
        query: entryRequest.query,
        tags: entryRequest.tags,
      });

      console.log(`[GatewayServer] Query vector ready: ${sessionId} (dim=${queryVector.length})`);

    } catch (error) {
      console.error(`[GatewayServer] Vectorization failed for ${sessionId}:`, error);
      this.sendError(socket, requestId, "Failed to calculate initial position");
    }
  }

  // [Entry Pipeline] handleProcessingMessage removed.
  // SphereContext is created immediately on entry (relic vector).
  // All messages are handled by handleActiveMessage (Tutorial layer filtering applies).

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

    // Rate limit check (skip for return/acknowledge - always allow graceful exit)
    if (type !== "return" && type !== "acknowledge") {
      const limiter = this.wsRateLimiters.get(sessionId);
      if (limiter) {
        const reject = limiter.checkAction(type);
        if (reject) {
          this.sendError(socket, requestId, reject);
          return;
        }
      }
    }

    // === Vestibule Gate ===
    // When in vestibule layer, only vestibule commands are available
    if (context.layer === "vestibule") {
      await this.handleVestibuleMessage(conn, msg, requestId);
      return;
    }

    // === Positioned Gate ===
    // Block exploration actions until query vectorization completes (positioned sent).
    // Layer transitions and exit are always allowed.
    if (!context.queryReady && type !== "entry" && type !== "return" && type !== "acknowledge"
        && type !== "enterSanctuary" && type !== "enterCore") {
      this.sendError(socket, requestId, "Vectorization in progress — wait for 'positioned' before exploring");
      return;
    }

    switch (type) {
      case "entry": {
        this.sendError(socket, requestId, "Already entered. Cannot re-enter.");
        break;
      }

      case "sense": {
        const nodes = await context.sense(msg.radius);
        this.send(socket, { type: "senseResult", requestId, nodes, energy: context.energy });
        break;
      }

      case "scan": {
        const nodes = await context.scanL1(msg.radius);
        this.send(socket, { type: "scanResult", requestId, nodes, energy: context.energy });
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
          energy: context.energy,
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
          energy: context.energy,
        });
        break;
      }

      case "move": {
        // move(step, mode) - 384D semantic space movement
        const result = await context.move(msg.step, msg.mode);
        this.send(socket, { type: "moveResult", requestId, result, energy: context.energy });
        break;
      }

      case "warp": {
        const result = await context.warp(msg.nodeId);
        this.send(socket, { type: "warpResult", requestId, result, energy: context.energy });
        break;
      }

      case "emit": {
        // Decode base64 payload
        const payload = Buffer.from(msg.payload, "base64");
        const success = await context.emitBus(new Uint8Array(payload));
        this.send(socket, { type: "emitResult", requestId, success, energy: context.energy });
        break;
      }

      case "return": {
        await context.return(msg.capsule);
        // enterVestibule was called inside context.return(), get result via getReceipt
        const receipt = context.getReceipt();
        this.send(socket, {
          type: "vestibuleEntered",
          requestId,
          sessionId,
          sphereId: this.sphereId,
          timestamp: Date.now(),
          auto: receipt.autoProcess,
          commands: VESTIBULE_COMMANDS,
          farewell: "Your evaluations have been applied. You may submit a capsule or acknowledge to disconnect.",
        });
        this.startVestibuleTtl(sessionId, socket);
        console.log(`[GatewayServer] Return → Vestibule: ${sessionId}`);
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
            energy: context.energy,
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
            energy: context.energy,
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
   * Handle messages in vestibule state
   * Only vestibule commands (submitCapsule, view*, acknowledge) are available
   */
  private async handleVestibuleMessage(
    conn: ActiveConnection,
    msg: AgentMessage,
    requestId: string
  ): Promise<void> {
    const { sessionId, socket, context } = conn;
    const { type } = msg;

    switch (type) {
      case "submitCapsule": {
        const result = await context.submitCapsule(msg.capsule);
        this.send(socket, {
          type: "submitCapsuleResult",
          requestId,
          success: result.success,
          nodeCount: result.nodeCount,
          evaluationCount: result.evaluationCount,
          errors: result.errors,
        });
        break;
      }

      case "viewReceipt": {
        const data = context.getReceipt();
        this.send(socket, { type: "receipt", requestId, data });
        break;
      }

      case "viewTrail": {
        const data = context.getTrail();
        this.send(socket, { type: "trail", requestId, data });
        break;
      }

      case "viewDiscoveries": {
        const data = context.getDiscoveries();
        this.send(socket, { type: "discoveries", requestId, data });
        break;
      }

      case "acknowledge": {
        // [2026-02-25] Fire session end hook before cleanup (trajectory export)
        if (this.onSessionEnd) {
          try {
            const trail = context.getTrail();
            this.onSessionEnd(trail);
          } catch (err) {
            console.error(`[GatewayServer] onSessionEnd hook error:`, err);
          }
        }
        // Clear vestibule TTL
        const vtTimer = this.vestibuleTtlTimers.get(sessionId);
        if (vtTimer) {
          clearTimeout(vtTimer);
          this.vestibuleTtlTimers.delete(sessionId);
        }
        this.send(socket, { type: "farewell", requestId });
        socket.close(1000, "Session ended");
        this.connections.delete(sessionId);
        this.wsRateLimiters.delete(sessionId);
        this.notifyAgentCountChange();
        console.log(`[GatewayServer] Acknowledged → disconnect: ${sessionId}`);
        break;
      }

      default:
        this.sendError(socket, requestId, `Only vestibule commands available (submitCapsule, viewReceipt, viewTrail, viewDiscoveries, acknowledge). Got: ${type}`);
    }
  }

  /**
   * Start Vestibule TTL timer
   * When TTL expires, force-disconnect the agent
   */
  private startVestibuleTtl(sessionId: string, socket: WebSocket): void {
    const ttlSeconds = this.vestibuleConfig?.ttlSeconds ?? 120;
    const ttlMs = ttlSeconds * 1000;

    const timer = setTimeout(() => {
      console.log(`[GatewayServer] Vestibule TTL expired: ${sessionId}`);
      this.send(socket, { type: "farewell", requestId: "system" });
      socket.close(1000, "Vestibule TTL expired");
      this.connections.delete(sessionId);
      this.wsRateLimiters.delete(sessionId);
      this.vestibuleTtlTimers.delete(sessionId);
      this.notifyAgentCountChange();
    }, ttlMs);

    this.vestibuleTtlTimers.set(sessionId, timer);
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
  private sendError(
    socket: WebSocket,
    requestId: string | undefined,
    error: string,
    energy?: number
  ): void {
    this.send(socket, { type: "error", requestId, error, energy });
  }

  /**
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
  getStats(): { pendingConnections: number; activeConnections: number } {
    let pending = 0;
    let active = 0;
    for (const conn of this.connections.values()) {
      switch (conn.state) {
        case "pending": pending++; break;
        case "active": active++; break;
      }
    }
    return { pendingConnections: pending, activeConnections: active };
  }
}
