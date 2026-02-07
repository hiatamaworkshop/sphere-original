/**
 * Sphere Project - Explore Agent (New 3-Phase Flow)
 *
 * [Role] Mock agent to test the 3-phase connection flow
 * [Flow]
 *   1. Request Ticket (POST /dive/request)
 *   2. Connect WebSocket with token
 *   3. Receive "welcome" → Fetch Rulebook → Send EntryRequest
 *   4. Receive "processing" → (Optional: sense for tutorial/amber)
 *   5. Receive "positioned" → Tutorial layer begins
 *   6. Explore in Tutorial layer (sense/focus/move)
 *   7. Return
 *
 * [Usage]
 *   npx tsx src/mock/explore-agent.ts
 *   npx tsx src/mock/explore-agent.ts --query "量子力学について"
 *   npx tsx src/mock/explore-agent.ts --radius 1 --fast
 *   npx tsx src/mock/explore-agent.ts --slow          # 人間観測用
 *   npx tsx src/mock/explore-agent.ts --delay 500    # 500ms間隔
 *
 * [Options]
 *   --query <string>   Search query (default: "explore sphere knowledge")
 *   --tags <csv>       Comma-separated tags (default: "explore,test")
 *   --radius <number>  Sense radius (default: 2, smaller = faster)
 *   --fast             Skip Sanctuary layer for quick test
 *   --slow             Human observation mode (1000ms delay)
 *   --delay <ms>       Custom delay between operations
 */

import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// Mock Data
// ============================================================

interface MockEntry {
  title: string;
  content: string;
  tags: string[];
  importance: number;
}

function loadMockData(): MockEntry[] {
  try {
    const jsonPath = path.join(__dirname, "mock_data.json");
    const raw = fs.readFileSync(jsonPath, "utf-8");
    return JSON.parse(raw) as MockEntry[];
  } catch {
    console.warn("[MockData] Failed to load mock_data.json, using default");
    return [];
  }
}

function getRandomMockEntry(): { query: string; tags: string[] } | null {
  const data = loadMockData();
  if (data.length === 0) return null;
  const entry = data[Math.floor(Math.random() * data.length)];
  return {
    query: entry.title,
    tags: entry.tags,
  };
}

// ============================================================
// Configuration
// ============================================================

const DEFAULT_HTTP_URL = "http://localhost:3001";
const DEFAULT_WS_URL = "ws://localhost:8081";

// ============================================================
// Types (matching gateway messages)
// ============================================================

// Vector is now 384-dim array (number[]), not {x, y, z}
// Old 3D projection is deprecated

interface QuestSummary {
  id: string;
  question: string;
  tags: string[];
  submittedAt: number;
}

interface NearbyNode {
  id: string;
  distance: number;
  summary: string;    // From ProjDB via sense()
  heat: number;
  weight: number;
  timestamp: number;  // For freshness calculation in WalkMode
  kind: string;
  flags: number;
  tags?: string[];    // Direction tags (for filtering)
}

interface NodeDetail extends NearbyNode {
  payload?: string;
  tags: string[];     // Full tags from focus()
  ref_url?: string;   // From RefDB via focus()
}

interface FocusResult {
  node: NodeDetail;
  nearbyGhosts?: NodeDetail[];  // Ghost/Fossil nodes included for free
}

interface MoveResult {
  success: boolean;
  position: number[];  // 384-dim embedding vector
  blocked?: string;
}

interface WarpResult {
  success: boolean;
  arrivedAt?: string;
  error?: "not_visible" | "not_found" | "rate_limited" | "no_vector";
}


type WalkMode = "random" | "hot" | "fresh" | "deep" | "explore";

interface EntryRequest {
  query: string;
  tags: string[];
  quest?: string;
}

interface RulebookConstraints {
  capsule: {
    maxTopTier: number;
    maxNormal: number;
    maxGhost: number;
    maxPayloadBytes: number;
    maxSummaryLength: number;
  };
  energy: {
    initial: number;
    warningThreshold: number;
    costs: {
      sense: number;
      move: number;
      focus: number;
      warp: number;
      evaluate: number;
    };
  };
  session: {
    maxDurationSeconds: number;
    warningBeforeExpiry: number;
  };
}

// Gateway → Agent messages
type GatewayMessage =
  | { type: "welcome"; sessionId: string; rulebookUrl: string; quests: QuestSummary[]; message: string }
  | { type: "processing"; sessionId: string; message: string }
  | { type: "positioned"; sessionId: string; position: number[]; remainingTime: number; query: string; tags: string[]; quest?: string }
  | { type: "entryError"; requestId: string; errors: { code: string; message: string; field?: string }[] }
  | { type: "senseResult"; requestId: string; nodes: NearbyNode[] }
  | { type: "scanResult"; requestId: string; nodes: any[] }
  | { type: "focusResult"; requestId: string; node: NodeDetail; nearbyGhosts?: NodeDetail[] }
  | { type: "evaluateResult"; requestId: string; success: boolean; reason?: string }
  | { type: "moveResult"; requestId: string; result: MoveResult }
  | { type: "warpResult"; requestId: string; result: WarpResult }
  | { type: "returnAck"; requestId: string }
  | { type: "layerChanged"; requestId: string; layer: string; message: string }
  | { type: "error"; requestId?: string; error: string }
  | { type: "warning"; message: string }
  | { type: "expelled"; reason: string };

// ============================================================
// Explore Agent
// ============================================================

export class ExploreAgent {
  private ws: WebSocket | null = null;
  private sessionId: string = "";
  private position: number[] = [];  // 384-dim embedding vector
  private remainingTime: number = 0;
  private currentLayer: string = "tutorial";

  // Agent's request context (received from positioned message)
  private query: string = "";         // Agent's own search intent
  private tags: string[] = [];        // Agent's interest areas
  private quest?: string;             // External quest (optional)
  private requestCounter: number = 0;
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();

  // Phase tracking
  private phase: "disconnected" | "pending" | "processing" | "active" = "disconnected";

  // Rulebook
  private rulebook: RulebookConstraints | null = null;

  // Collected data (accumulated during dive)
  private discoveries: NodeDetail[] = [];
  private sensedNodes: NearbyNode[] = [];           // Nodes discovered via sense()
  private focusedNodes: NodeDetail[] = [];          // Nodes inspected via focus()

  // Event log
  private eventLog: { timestamp: number; event: string; detail: string }[] = [];

  // ============================================================
  // Event Logging
  // ============================================================

  private logEvent(event: string, detail: string = ""): void {
    const timestamp = Date.now();
    this.eventLog.push({ timestamp, event, detail });
    const time = new Date(timestamp).toISOString().substring(11, 23);
    console.log(`[EVENT ${time}] ${event}${detail ? ` - ${detail}` : ""}`);
  }

  // ============================================================
  // Inventory Logging (Data State Tracking)
  // ============================================================

  private logInventory(phase: string): void {
    console.log("");
    console.log(`╔${"═".repeat(68)}╗`);
    console.log(`║  📦 AGENT INVENTORY [${phase}]`.padEnd(69) + "║");
    console.log(`╠${"═".repeat(68)}╣`);

    // Position
    const pos = this.position;
    const posStr = pos.length >= 3
      ? `(${(pos[0] * 100).toFixed(1)}, ${(pos[1] * 100).toFixed(1)}, ${(pos[2] * 100).toFixed(1)})`
      : "(not set)";
    console.log(`║  Position: ${posStr} (${pos.length}-dim)`.padEnd(69) + "║");
    console.log(`║  Layer: ${this.currentLayer}  |  Time: ${this.remainingTime}s`.padEnd(69) + "║");

    console.log(`╠${"═".repeat(68)}╣`);
    // Request Context (for goal-directed behavior)
    console.log(`║  🎯 REQUEST CONTEXT`.padEnd(69) + "║");
    const queryDisplay = this.query.length > 50 ? this.query.substring(0, 47) + "..." : this.query;
    console.log(`║    Query: "${queryDisplay}"`.padEnd(69) + "║");
    console.log(`║    Tags: [${this.tags.join(", ")}]`.padEnd(69) + "║");
    if (this.quest) {
      const questDisplay = this.quest.length > 45 ? this.quest.substring(0, 42) + "..." : this.quest;
      console.log(`║    Quest: "${questDisplay}"`.padEnd(69) + "║");
    }

    console.log(`╠${"═".repeat(68)}╣`);

    // Sensed nodes summary
    console.log(`║  🔍 Sensed Nodes: ${this.sensedNodes.length}`.padEnd(69) + "║");
    if (this.sensedNodes.length > 0) {
      const byKind = new Map<string, number>();
      for (const n of this.sensedNodes) {
        byKind.set(n.kind, (byKind.get(n.kind) || 0) + 1);
      }
      const kindStr = Array.from(byKind.entries()).map(([k, v]) => `${k}:${v}`).join(", ");
      console.log(`║    → ${kindStr}`.padEnd(69) + "║");
    }

    // Focused nodes
    console.log(`║  🎯 Focused Nodes: ${this.focusedNodes.length}`.padEnd(69) + "║");
    for (const node of this.focusedNodes.slice(-3)) {  // Show last 3
      const summary = node.payload?.substring(0, 40) || "(no payload)";
      console.log(`║    → [${node.kind}] ${node.id.substring(0, 8)}... "${summary}..."`.padEnd(69) + "║");
    }
    if (this.focusedNodes.length > 3) {
      console.log(`║    ... and ${this.focusedNodes.length - 3} more`.padEnd(69) + "║");
    }

    console.log(`╚${"═".repeat(68)}╝`);
    console.log("");
  }

  // Configurable options
  private senseRadius: number = 2;
  private fastMode: boolean = false;
  private delayMs: number = 0;

  constructor(
    private httpUrl: string = DEFAULT_HTTP_URL,
    private wsUrl: string = DEFAULT_WS_URL,
    private name: string = "ExploreAgent",
    initialQuery: string = "explore sphere",
    initialTags: string[] = ["explore", "test"],
    options?: { radius?: number; fast?: boolean; delay?: number }
  ) {
    // Set initial query/tags (will be updated from positioned message)
    this.query = initialQuery;
    this.tags = initialTags;
    this.senseRadius = options?.radius ?? 2;
    this.fastMode = options?.fast ?? false;
    this.delayMs = options?.delay ?? 0;
  }

  /**
   * Sleep for human observation
   */
  private async pause(label?: string): Promise<void> {
    if (this.delayMs > 0) {
      if (label) process.stdout.write(`  ... ${label}`);
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
      if (label) process.stdout.write("\r" + " ".repeat(40) + "\r");
    }
  }

  /**
   * Measure operation time
   */
  private async timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const elapsed = (performance.now() - start).toFixed(1);
    console.log(`  ⏱ ${label}: ${elapsed}ms`);
    await this.pause();
    return result;
  }

  // ============================================================
  // Phase 1: Request Ticket
  // ============================================================

  private async requestTicket(): Promise<string | null> {
    try {
      const response = await fetch(`${this.httpUrl}/dive/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        console.error(`[${this.name}] Ticket request failed:`, error.error);
        return null;
      }

      const result = await response.json() as { ticket: { token: string } };
      this.logEvent("TICKET_OBTAINED", `token=${result.ticket.token.substring(0, 8)}...`);
      return result.ticket.token;
    } catch (error) {
      console.error(`[${this.name}] Connection error:`, error);
      this.logEvent("TICKET_FAILED", String(error));
      return null;
    }
  }

  // ============================================================
  // Phase 2: Fetch Rulebook
  // ============================================================

  private async fetchRulebook(): Promise<boolean> {
    try {
      const response = await fetch(`${this.httpUrl}/rulebook`);
      if (!response.ok) {
        console.error(`[${this.name}] Rulebook fetch failed: ${response.status}`);
        return false;
      }

      const rulebook = await response.json() as { version: string; constraints: RulebookConstraints };
      this.rulebook = rulebook.constraints;
      this.logEvent("RULEBOOK_FETCHED", `version=${rulebook.version}`);
      return true;
    } catch (error) {
      console.error(`[${this.name}] Rulebook fetch error:`, error);
      this.logEvent("RULEBOOK_FAILED", String(error));
      return false;
    }
  }

  // ============================================================
  // Phase 3: WebSocket Connection
  // ============================================================

  private connect(token: string): Promise<{ sessionId: string; rulebookUrl: string; quests: QuestSummary[] }> {
    return new Promise((resolve, reject) => {
      const url = `${this.wsUrl}?token=${token}`;
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        console.log(`[${this.name}] WebSocket connected`);
        this.logEvent("WEBSOCKET_CONNECTED", this.wsUrl);
      });

      this.ws.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as GatewayMessage;
        this.handleMessage(msg, resolve, reject);
      });

      this.ws.on("close", (code, reason) => {
        console.log(`[${this.name}] Connection closed: ${code} ${reason}`);
        this.phase = "disconnected";
      });

      this.ws.on("error", (error) => {
        console.error(`[${this.name}] WebSocket error:`, error);
        reject(error);
      });
    });
  }

  // ============================================================
  // Message Handling
  // ============================================================

  private handleMessage(
    msg: GatewayMessage,
    onWelcome: (data: { sessionId: string; rulebookUrl: string; quests: QuestSummary[] }) => void,
    _onError: (error: Error) => void  // reserved for future error handling
  ): void {
    switch (msg.type) {
      case "welcome":
        this.sessionId = msg.sessionId;
        this.phase = "pending";
        this.logEvent("SESSION_STARTED", `session=${msg.sessionId.substring(0, 8)}... quests=${msg.quests.length}`);
        console.log(`[${this.name}] Welcome received: ${msg.message}`);
        console.log(`[${this.name}]   Session: ${msg.sessionId}`);
        console.log(`[${this.name}]   Quests available: ${msg.quests.length}`);
        onWelcome({
          sessionId: msg.sessionId,
          rulebookUrl: msg.rulebookUrl,
          quests: msg.quests,
        });
        break;

      case "processing":
        this.phase = "processing";
        this.logEvent("ENTRY_PROCESSING", msg.message);
        console.log(`[${this.name}] Processing: ${msg.message}`);
        break;

      case "positioned":
        this.phase = "active";
        this.position = msg.position;
        this.remainingTime = msg.remainingTime;
        // Store request context for goal-directed behavior
        this.query = msg.query;
        this.tags = msg.tags;
        this.quest = msg.quest;
        // Display first 3 components scaled by 100 for readability
        const p = msg.position;
        const posStr = p.length >= 3
          ? `(${(p[0] * 100).toFixed(1)}, ${(p[1] * 100).toFixed(1)}, ${(p[2] * 100).toFixed(1)})`
          : `(dim=${p.length})`;
        this.logEvent("VECTOR_ASSIGNED", `pos=${posStr} dim=${p.length}`);
        this.logEvent("CONTEXT_SET", `query="${this.query}" tags=[${this.tags.join(", ")}]${this.quest ? ` quest="${this.quest}"` : ""}`);
        this.logEvent("TUTORIAL_STARTED", `remainingTime=${msg.remainingTime}s`);
        console.log(`[${this.name}] Positioned!`);
        console.log(`[${this.name}]   Position: ${posStr} (${p.length}-dim vector)`);
        console.log(`[${this.name}]   Query: "${this.query}"`);
        console.log(`[${this.name}]   Tags: [${this.tags.join(", ")}]`);
        if (this.quest) {
          console.log(`[${this.name}]   Quest: "${this.quest}"`);
        }
        console.log(`[${this.name}]   Remaining time: ${msg.remainingTime}s`);
        // Resolve the waitForPositioned promise
        this.resolvePositioned?.();
        break;

      case "entryError":
        console.error(`[${this.name}] Entry rejected:`, msg.errors);
        break;

      case "senseResult":
        this.logEvent("SENSE_RESULT", `nodes=${(msg as { nodes: NearbyNode[] }).nodes.length}`);
        this.resolveRequest(msg.requestId, msg);
        break;

      case "scanResult":
        this.logEvent("SCAN_RESULT", `nodes=${(msg as { nodes: any[] }).nodes.length}`);
        this.resolveRequest(msg.requestId, msg);
        break;

      case "focusResult":
        this.logEvent("FOCUS_RESULT", `node=${(msg as { node: NodeDetail }).node.id.substring(0, 8)}... kind=${(msg as { node: NodeDetail }).node.kind}`);
        this.resolveRequest(msg.requestId, msg);
        break;

      case "evaluateResult":
        this.logEvent("EVALUATE_RESULT", `success=${(msg as { success: boolean }).success}`);
        this.resolveRequest(msg.requestId, msg);
        break;

      case "moveResult":
        const moveRes = msg as { result: MoveResult };
        if (moveRes.result.success) {
          this.logEvent("MOVE_SUCCESS", "position updated");
        } else {
          this.logEvent("MOVE_FAILED", `blocked=${moveRes.result.blocked}`);
        }
        this.resolveRequest(msg.requestId, msg);
        break;

      case "warpResult":
        const warpRes = msg as { result: WarpResult };
        if (warpRes.result.success) {
          this.logEvent("WARP_SUCCESS", `arrivedAt=${warpRes.result.arrivedAt}`);
        } else {
          this.logEvent("WARP_FAILED", `error=${warpRes.result.error}`);
        }
        this.resolveRequest(msg.requestId, msg);
        break;

      case "returnAck":
        this.logEvent("RETURN_ACKNOWLEDGED", "離脱完了");
        this.resolveRequest(msg.requestId, msg);
        break;

      case "layerChanged":
        this.logEvent("LAYER_CHANGED", `${this.currentLayer} → ${(msg as { layer: string }).layer}`);
        this.resolveRequest(msg.requestId, msg);
        break;

      case "error":
        console.error(`[${this.name}] Error:`, msg.error);
        if (msg.requestId) {
          this.rejectRequest(msg.requestId, new Error(msg.error));
        }
        break;

      case "warning":
        console.warn(`[${this.name}] Warning:`, msg.message);
        break;

      case "expelled":
        this.logEvent("EXPELLED", msg.reason);
        console.log(`[${this.name}] Expelled:`, msg.reason);
        this.ws?.close();
        break;
    }
  }

  // Positioned promise handling
  private resolvePositioned: (() => void) | null = null;

  private waitForPositioned(): Promise<void> {
    if (this.phase === "active") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.resolvePositioned = resolve;
    });
  }

  // ============================================================
  // Request/Response Handling
  // ============================================================

  private async sendRequest<T>(type: string, payload: object = {}): Promise<T> {
    const requestId = `req_${++this.requestCounter}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      const msg = { type, requestId, ...payload };
      this.ws?.send(JSON.stringify(msg));

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request ${requestId} timed out`));
        }
      }, 10000);
    });
  }

  private resolveRequest(requestId: string, value: any): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      this.pendingRequests.delete(requestId);
      pending.resolve(value);
    }
  }

  private rejectRequest(requestId: string, error: Error): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      this.pendingRequests.delete(requestId);
      pending.reject(error);
    }
  }

  // ============================================================
  // SphereContext Operations
  // ============================================================

  async sense(radius?: number): Promise<NearbyNode[]> {
    const result = await this.sendRequest<{ type: "senseResult"; nodes: NearbyNode[] }>(
      "sense",
      radius ? { radius } : {}
    );
    // Track discovered nodes (avoid duplicates)
    for (const node of result.nodes) {
      if (!this.sensedNodes.some(n => n.id === node.id)) {
        this.sensedNodes.push(node);
      }
    }
    return result.nodes;
  }

  async focus(nodeId: string): Promise<NodeDetail> {
    const result = await this.sendRequest<{ type: "focusResult"; node: NodeDetail; nearbyGhosts?: NodeDetail[] }>(
      "focus",
      { nodeId }
    );
    // Track focused nodes (avoid duplicates)
    if (!this.focusedNodes.some(n => n.id === result.node.id)) {
      this.focusedNodes.push(result.node);
    }
    // Log nearby ghosts if any
    if (result.nearbyGhosts && result.nearbyGhosts.length > 0) {
      console.log(`[${this.name}] 👻 Found ${result.nearbyGhosts.length} nearby ghost/fossil nodes (included for free)`);
    }
    return result.node;
  }

  /**
   * Evaluate a node with h/w/d scores
   * @param nodeId Node to evaluate
   * @param h Heat score (0-10, 5=neutral)
   * @param w Weight score (0-10, 5=neutral)
   * @param d Decay score (0-10, 5=neutral, higher=faster decay)
   */
  async evaluate(nodeId: string, h: number, w: number = 5, d: number = 5): Promise<{ success: boolean; reason?: string }> {
    const result = await this.sendRequest<{ type: "evaluateResult"; success: boolean; reason?: string }>(
      "evaluate",
      { nodeId, h, w, d }
    );
    return { success: result.success, reason: (result as any).reason };
  }

  /**
   * Scan nearby nodes (L1 only - lightweight)
   */
  async scan(): Promise<any[]> {
    const result = await this.sendRequest<{ type: "scanResult"; nodes: any[] }>(
      "scan",
      {}
    );
    return result.nodes || [];
  }

  /**
   * Move in 384D semantic space
   * @param step Step size (0.0-1.0, default 0.3)
   * @param mode Walk mode: random, hot, fresh, deep, explore
   */
  async move(step: number = 0.3, mode?: WalkMode): Promise<MoveResult> {
    const result = await this.sendRequest<{ type: "moveResult"; result: MoveResult }>(
      "move",
      { step, mode }
    );
    return result.result;
  }

  async warp(nodeId: string): Promise<WarpResult> {
    const result = await this.sendRequest<{ type: "warpResult"; result: WarpResult }>(
      "warp",
      { nodeId }
    );
    return result.result;
  }

  async return(): Promise<void> {
    await this.sendRequest<{ type: "returnAck" }>("return", {});
  }

  async enterSanctuary(): Promise<string> {
    const result = await this.sendRequest<{ type: "layerChanged"; layer: string; message: string }>(
      "enterSanctuary",
      {}
    );
    this.currentLayer = result.layer;
    return result.message;
  }

  async enterCore(): Promise<string> {
    const result = await this.sendRequest<{ type: "layerChanged"; layer: string; message: string }>(
      "enterCore",
      {}
    );
    this.currentLayer = result.layer;
    return result.message;
  }

  // ============================================================
  // Main Explore Flow
  // ============================================================

  async explore(): Promise<void> {
    console.log("");
    console.log("=".repeat(70));
    console.log("  SPHERE EXPLORE AGENT (3-Phase Flow)");
    console.log("=".repeat(70));
    console.log(`  Name:   ${this.name}`);
    console.log(`  HTTP:   ${this.httpUrl}`);
    console.log(`  WS:     ${this.wsUrl}`);
    console.log(`  Query:  "${this.query}"`);
    console.log(`  Tags:   [${this.tags.join(", ")}]`);
    console.log(`  Radius: ${this.senseRadius}  Fast: ${this.fastMode}  Delay: ${this.delayMs}ms`);
    console.log("=".repeat(70));
    console.log("");

    // ===== Step 1: Request Ticket =====
    console.log("[Step 1] Requesting Dive Ticket...");
    const token = await this.requestTicket();
    if (!token) {
      console.log("[Step 1] Failed to obtain ticket. Aborting.");
      return;
    }
    console.log(`[Step 1] Ticket obtained: ${token.substring(0, 16)}...`);
    console.log("");

    // ===== Step 2: Fetch Rulebook =====
    console.log("[Step 2] Fetching Rulebook...");
    const rulebookOk = await this.fetchRulebook();
    if (!rulebookOk || !this.rulebook) {
      console.log("[Step 2] Failed to fetch Rulebook. Aborting.");
      return;
    }
    console.log("[Step 2] Rulebook received:");
    console.log(`  Capsule: max ${this.rulebook.capsule.maxTopTier} top, ${this.rulebook.capsule.maxNormal} normal, ${this.rulebook.capsule.maxGhost} ghost`);
    console.log(`  Energy: initial=${this.rulebook.energy.initial} focus_cost=${this.rulebook.energy.costs.focus}`);
    console.log(`  Session: ${this.rulebook.session.maxDurationSeconds}s max`);
    console.log("");

    // ===== Step 3: Connect WebSocket =====
    console.log("[Step 3] Connecting to Gateway...");
    const welcome = await this.connect(token);
    console.log(`[Step 3] Connected! Session: ${welcome.sessionId}`);
    if (welcome.quests.length > 0) {
      console.log(`[Step 3] Available Quests:`);
      welcome.quests.slice(0, 3).forEach((q, i) => {
        console.log(`    ${i + 1}. ${q.question} [${q.tags.join(", ")}]`);
      });
    }
    console.log("");

    // ===== Step 4: Send EntryRequest =====
    console.log("[Step 4] Sending EntryRequest...");
    const entryRequest: EntryRequest = {
      query: this.query,
      tags: this.tags,
    };
    // Entry doesn't return a response - it triggers processing/positioned flow
    const entryMsg = {
      type: "entry",
      requestId: `req_${++this.requestCounter}`,
      request: entryRequest,
    };
    this.ws?.send(JSON.stringify(entryMsg));
    this.logEvent("ENTRY_REQUESTED", `query="${this.query}" tags=[${this.tags.join(", ")}]`);
    console.log("[Step 4] EntryRequest sent, waiting for positioning...");
    console.log("");

    // ===== Step 5: Wait for Positioned =====
    console.log("[Step 5] Waiting for positioned message...");
    await this.waitForPositioned();
    const pos = this.position;
    const posDisplay = pos.length >= 3
      ? `(${(pos[0] * 100).toFixed(1)}, ${(pos[1] * 100).toFixed(1)}, ${(pos[2] * 100).toFixed(1)})`
      : `(dim=${pos.length})`;
    console.log(`[Step 5] Now in Tutorial layer! Position: ${posDisplay} (${pos.length}-dim vector)`);

    // 📦 Initial inventory state
    this.logInventory("INITIAL - Just Positioned");
    console.log("");

    // ===== Tutorial Layer: Explore =====
    console.log("-".repeat(70));
    console.log(`  TUTORIAL LAYER - Exploration (radius=${this.senseRadius}, fast=${this.fastMode})`);
    console.log("-".repeat(70));
    console.log("");

    try {
      // Sense nearby nodes
      console.log(`[Tutorial] Sensing surroundings (radius=${this.senseRadius})...`);
      const nearby = await this.timed("sense", () => this.sense(this.senseRadius));
      console.log(`[Tutorial] Found ${nearby.length} nearby nodes`);

      if (nearby.length > 0) {
        console.log("");
        nearby.slice(0, 3).forEach((node, i) => {
          const heatBar = "█".repeat(Math.min(10, Math.floor(node.heat / 10)));
          const tagsStr = node.tags?.slice(0, 3).join(", ") || "(no tags)";
          // [Design] sense() now returns summary + tags from ProjDB
          console.log(`  ${i + 1}. [${node.kind.padEnd(8)}] ${heatBar.padEnd(10, "░")} ${node.summary.slice(0, 30)}...`);
          console.log(`     Tags: ${tagsStr}`);
        });
        console.log("");

        // Focus on first node
        const target = nearby[0];
        console.log(`[Tutorial] Focusing on node: ${target.id.substring(0, 8)}...`);
        const detail = await this.timed("focus", () => this.focus(target.id));
        this.discoveries.push(detail);

        console.log(`[Tutorial] Node details:`);
        console.log(`  Kind: ${detail.kind}`);
        console.log(`  Heat: ${detail.heat.toFixed(2)}`);
        console.log(`  Tags: ${detail.tags?.join(", ") || "(none)"}`);
        console.log(`  Summary: ${detail.summary}`);
        if (detail.payload) {
          console.log(`  Payload: ${detail.payload.substring(0, 100)}...`);
        }
        console.log("");

        // Try evaluate (should be discarded in Tutorial layer)
        console.log(`[Tutorial] Evaluating node (will be discarded in Tutorial)...`);
        console.log(`[Tutorial]   h=8 (positive heat), w=6, d=4 (slow decay)`);
        const evalResult = await this.timed("evaluate", () => this.evaluate(target.id, 8, 6, 4));
        console.log(`[Tutorial] Evaluate result: success=${evalResult.success} reason=${evalResult.reason || "none"}`);

        // === SCAN TEST ===
        console.log("");
        console.log(`[Tutorial] 📡 SCAN TEST: Lightweight L1 scan...`);
        try {
          const scanNodes = await this.timed("scan", () => this.scan());
          console.log(`[Tutorial]   Scanned ${scanNodes.length} nodes (L1 only - tags, no summary)`);
          if (scanNodes.length > 0) {
            const sample = scanNodes[0];
            console.log(`[Tutorial]   Sample: id=${sample.id?.substring(0, 8)}... kind=${sample.kind} h=${sample.heat?.toFixed(0)}`);
          }
        } catch (e) {
          console.log(`[Tutorial]   Scan error: ${e}`);
        }

        // ===== Movement Model Summary =====
        console.log("");
        console.log(`[Tutorial] 📐 MOVEMENT MODEL:`);
        console.log(`[Tutorial]   - move(dx,dy,dz): DEPRECATED - only affects 3D projection`);
        console.log(`[Tutorial]   - move(step,mode): PRIMARY - moves in 384D semantic space`);
        console.log(`[Tutorial]   - warp():         DIRECT - teleport to known node`);
        console.log("");

        // ===== Warp Test: Verify warp() DOES affect sense() =====
        console.log(`[Tutorial] 🚀 WARP TEST: Does warp() change what we sense?`);

        // First sense to get current nodes
        console.log(`[Tutorial]   Sensing before warp...`);
        const beforeWarpNodes = await this.timed("sense", () => this.sense(this.senseRadius));
        console.log(`[Tutorial]   Before warp - sensed ${beforeWarpNodes.length} nodes`);
        const beforeWarpSet = new Set(beforeWarpNodes.map(n => n.id));
        const beforeWarpIds = beforeWarpNodes.slice(0, 3).map(n => n.id.substring(0, 8)).join(", ");
        console.log(`[Tutorial]   Node IDs: ${beforeWarpIds}`);

        if (beforeWarpNodes.length > 0) {
          // Pick a node to warp to
          const warpTarget = beforeWarpNodes[0];
          console.log(`[Tutorial]   Warping to node: ${warpTarget.id.substring(0, 8)}...`);
          const warpResult = await this.timed("warp", () => this.warp(warpTarget.id));

          if (warpResult.success) {
            console.log(`[Tutorial]   ✅ Warp succeeded! arrivedAt=${warpResult.arrivedAt?.substring(0, 8)}...`);

            // Sense again after warp
            console.log(`[Tutorial]   Sensing after warp...`);
            const afterWarpNodes = await this.timed("sense", () => this.sense(this.senseRadius));
            console.log(`[Tutorial]   After warp - sensed ${afterWarpNodes.length} nodes`);
            const afterWarpSet = new Set(afterWarpNodes.map(n => n.id));
            const afterWarpIds = afterWarpNodes.slice(0, 3).map(n => n.id.substring(0, 8)).join(", ");
            console.log(`[Tutorial]   Node IDs: ${afterWarpIds}`);

            // Compare
            const warpSameSet = beforeWarpSet.size === afterWarpSet.size &&
                                [...beforeWarpSet].every(id => afterWarpSet.has(id));
            if (warpSameSet) {
              console.log(`[Tutorial]   ⚠️ SAME NODE SET after warp - unexpected!`);
            } else {
              console.log(`[Tutorial]   ✅ DIFFERENT NODE SET - warp() affects sense() (real movement!)`);
              console.log(`[Tutorial]      384D _embeddingVector updated to target node's position`);
            }
          } else {
            console.log(`[Tutorial]   ❌ Warp failed: ${warpResult.error}`);
          }
        } else {
          console.log(`[Tutorial]   ⚠️ No nodes to warp to`);
        }
        console.log("");

        // ===== Move Test: Verify move() affects sense() =====
        console.log(`[Tutorial] 🎲 MOVE TEST: Does move() change what we sense?`);

        // First sense to get current nodes
        console.log(`[Tutorial]   Sensing before move...`);
        const beforeWalkNodes = await this.timed("sense", () => this.sense(this.senseRadius));
        console.log(`[Tutorial]   Before walk - sensed ${beforeWalkNodes.length} nodes`);
        const beforeWalkSet = new Set(beforeWalkNodes.map(n => n.id));
        const beforeWalkIds = beforeWalkNodes.slice(0, 3).map(n => n.id.substring(0, 8)).join(", ");
        console.log(`[Tutorial]   Node IDs: ${beforeWalkIds}`);

        // Move
        console.log(`[Tutorial]   move(step=0.5)...`);
        const walkResult = await this.timed("move", () => this.move(0.5));

        if (walkResult.success) {
          console.log(`[Tutorial]   ✅ Move succeeded!`);

          // Sense again after walk
          console.log(`[Tutorial]   Sensing after move...`);
          const afterWalkNodes = await this.timed("sense", () => this.sense(this.senseRadius));
          console.log(`[Tutorial]   After walk - sensed ${afterWalkNodes.length} nodes`);
          const afterWalkSet = new Set(afterWalkNodes.map(n => n.id));
          const afterWalkIds = afterWalkNodes.slice(0, 3).map(n => n.id.substring(0, 8)).join(", ");
          console.log(`[Tutorial]   Node IDs: ${afterWalkIds}`);

          // Compare
          const walkSameSet = beforeWalkSet.size === afterWalkSet.size &&
                              [...beforeWalkSet].every(id => afterWalkSet.has(id));
          if (walkSameSet) {
            console.log(`[Tutorial]   ⚠️ SAME NODE SET after move - may happen if step is small`);
          } else {
            console.log(`[Tutorial]   ✅ DIFFERENT NODE SET - move() affects sense() (real movement!)`);
            console.log(`[Tutorial]      384D _embeddingVector updated`);
          }
        } else {
          console.log(`[Tutorial]   ❌ Move failed: ${walkResult.blocked}`);
        }
        console.log("");

        // ===== WalkMode Test: Test gradient-based movement =====
        console.log(`[Tutorial] 🧭 WALKMODE TEST: Does gradient-based movement work?`);

        // First sense to get visible nodes (required for gradient modes)
        console.log(`[Tutorial]   Sensing to populate visible nodes...`);
        const walkModeNodes = await this.timed("sense", () => this.sense(this.senseRadius));
        console.log(`[Tutorial]   Sensed ${walkModeNodes.length} nodes for gradient calculation`);

        if (walkModeNodes.length > 0) {
          // Test "hot" mode (toward high-heat nodes)
          console.log(`[Tutorial]   Testing move(0.3, "hot")...`);
          const hotResult = await this.timed("move", () => this.move(0.3, "hot"));
          if (hotResult.success) {
            console.log(`[Tutorial]   ✅ HOT mode succeeded!`);
          } else {
            console.log(`[Tutorial]   ❌ HOT mode failed: ${hotResult.blocked}`);
          }

          // Sense again for next test
          await this.sense(this.senseRadius);

          // Test "explore" mode (away from known nodes)
          console.log(`[Tutorial]   Testing move(0.3, "explore")...`);
          const exploreResult = await this.timed("move", () => this.move(0.3, "explore"));
          if (exploreResult.success) {
            console.log(`[Tutorial]   ✅ EXPLORE mode succeeded!`);
          } else {
            console.log(`[Tutorial]   ❌ EXPLORE mode failed: ${exploreResult.blocked}`);
          }

          // Test without sense (should fail for gradient modes)
          console.log(`[Tutorial]   Testing move("hot") WITHOUT sense...`);
          // Note: _visibleNodes was cleared after last move
          const noSenseResult = await this.timed("move", () => this.move(0.3, "hot"));
          if (!noSenseResult.success) {
            console.log(`[Tutorial]   ✅ Correctly blocked: ${noSenseResult.blocked} (gradient mode requires sense)`);
          } else {
            console.log(`[Tutorial]   ⚠️ Unexpected success without sense`);
          }
        } else {
          console.log(`[Tutorial]   ⚠️ No nodes for gradient test`);
        }
        console.log("");

        // 📦 After Tutorial exploration
        this.logInventory("TUTORIAL COMPLETE");
        console.log("");
      }

      // Fast mode: Tutorial only, skip layer transitions
      if (this.fastMode) {
        console.log("[Fast] Skipping Sanctuary/Core layers - Tutorial only mode");
        console.log("");
      } else {
        // ===== Transition to Sanctuary =====
        console.log("-".repeat(70));
        console.log("  SANCTUARY LAYER - Read-only Exploration");
        console.log("-".repeat(70));
        console.log("");

        console.log("[Transition] Entering Sanctuary layer...");
        const sanctuaryMsg = await this.timed("enterSanctuary", () => this.enterSanctuary());
        console.log(`[Sanctuary] ${sanctuaryMsg}`);
        console.log(`[Sanctuary] Current layer: ${this.currentLayer}`);
        console.log("");

        // Sense in Sanctuary
        console.log(`[Sanctuary] Sensing surroundings (radius=${this.senseRadius})...`);
        const sanctuaryNodes = await this.timed("sense", () => this.sense(this.senseRadius));
        console.log(`[Sanctuary] Found ${sanctuaryNodes.length} nodes`);

        if (sanctuaryNodes.length > 0) {
          // Try evaluate in Sanctuary (should be buffered)
          console.log(`[Sanctuary] Evaluating node (will be buffered for Core)...`);
          console.log(`[Sanctuary]   h=7 (positive), w=5 (neutral), d=5 (neutral)`);
          const sanctuaryEval = await this.timed("evaluate", () => this.evaluate(sanctuaryNodes[0].id, 7, 5, 5));
          console.log(`[Sanctuary] Evaluate result: success=${sanctuaryEval.success} reason=${sanctuaryEval.reason || "buffered"}`);
        }
        console.log("");

        // ===== Transition to Core =====
        console.log("-".repeat(70));
        console.log("  CORE LAYER - Live World");
        console.log("-".repeat(70));
        console.log("");

        console.log("[Transition] Entering Core layer...");
        const coreMsg = await this.timed("enterCore", () => this.enterCore());
        console.log(`[Core] ${coreMsg}`);
        console.log(`[Core] Current layer: ${this.currentLayer}`);
        console.log("");

        // Sense in Core
        console.log(`[Core] Sensing surroundings (radius=${this.senseRadius})...`);
        const coreNodes = await this.timed("sense", () => this.sense(this.senseRadius));
        console.log(`[Core] Found ${coreNodes.length} nodes`);

        if (coreNodes.length > 0) {
          // Evaluate in Core (will be applied to ProjDB on return)
          console.log(`[Core] Evaluating node (will be applied on return!)...`);
          console.log(`[Core]   h=9 (very positive), w=7 (increase weight), d=3 (slow decay)`);
          const coreEval = await this.timed("evaluate", () => this.evaluate(coreNodes[0].id, 9, 7, 3));
          console.log(`[Core] Evaluate result: success=${coreEval.success} reason=${coreEval.reason || "buffered"}`);

          // Try negative evaluation on second node (if exists)
          if (coreNodes.length > 1) {
            console.log(`[Core] Negative evaluation on second node...`);
            console.log(`[Core]   h=2 (negative), w=3 (decrease weight), d=8 (faster decay)`);
            const negEval = await this.timed("evaluate", () => this.evaluate(coreNodes[1].id, 2, 3, 8));
            console.log(`[Core] Negative eval result: success=${negEval.success} reason=${negEval.reason || "buffered"}`);
          }

          // Try duplicate evaluation (should fail with already_evaluated)
          console.log(`[Core] Attempting duplicate evaluation (should fail)...`);
          const dupEval = await this.timed("evaluate", () => this.evaluate(coreNodes[0].id, 5, 5, 5));
          console.log(`[Core] Duplicate eval result: success=${dupEval.success} reason=${dupEval.reason}`);
        }

        // 📦 After Core exploration
        this.logInventory("CORE EXPLORATION COMPLETE");
        console.log("");
      }

    } catch (error) {
      console.error("[Explore] Error during exploration:", error);
    }

    // 📦 Final inventory before return
    this.logInventory("FINAL - Before Return");

    // ===== Return =====
    console.log("-".repeat(70));
    console.log("");
    console.log("[Return] Returning from Sphere...");
    this.logEvent("RETURN_INITIATED", `layer=${this.currentLayer}`);
    await this.return();

    this.logEvent("SESSION_ENDED", `discoveries=${this.discoveries.length}`);

    console.log("");
    console.log("=".repeat(70));
    console.log("  EXPLORE COMPLETE");
    console.log("=".repeat(70));
    console.log(`  Session: ${this.sessionId}`);
    console.log(`  Nodes discovered: ${this.discoveries.length}`);
    console.log(`  Final layer: ${this.currentLayer}`);
    console.log(`  Phase: ${this.phase}`);
    console.log("=".repeat(70));
    console.log("");

    // Event log summary
    console.log("-".repeat(70));
    console.log("  EVENT LOG SUMMARY");
    console.log("-".repeat(70));
    const startTime = this.eventLog[0]?.timestamp || Date.now();
    for (const entry of this.eventLog) {
      const elapsed = ((entry.timestamp - startTime) / 1000).toFixed(2);
      console.log(`  [+${elapsed.padStart(6)}s] ${entry.event.padEnd(20)} ${entry.detail}`);
    }
    console.log("-".repeat(70));
    console.log("");
  }
}

// ============================================================
// CLI Execution
// ============================================================

interface ExploreOptions {
  query: string;
  tags: string[];
  radius: number;
  fast: boolean;
  delay: number;  // ms between operations (0 = no delay)
}

function parseArgs(): ExploreOptions {
  const args = process.argv.slice(2);
  let query = "";
  let tags: string[] = [];
  let radius = 2;  // Default: 2 (narrower than before)
  let fast = false;
  let delay = 0;   // Default: no delay
  let querySet = false;  // Track if query was set

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle positional argument (first non-flag string = query)
    if (!arg.startsWith("--") && !querySet) {
      query = arg;
      querySet = true;
      continue;
    }

    if (arg === "--query" && args[i + 1]) {
      query = args[i + 1];
      querySet = true;
      i++;
    } else if (arg === "--tags" && args[i + 1]) {
      tags = args[i + 1].split(",").map(t => t.trim());
      i++;
    } else if (arg === "--radius" && args[i + 1]) {
      radius = parseInt(args[i + 1], 10) || 2;
      i++;
    } else if (arg === "--fast") {
      fast = true;
    } else if (arg === "--delay" && args[i + 1]) {
      delay = parseInt(args[i + 1], 10) || 500;
      i++;
    } else if (arg === "--slow") {
      delay = 1000;  // 1秒間隔
    }
  }

  // If no query specified, pick from mock_data.json
  if (!querySet) {
    const mockEntry = getRandomMockEntry();
    if (mockEntry) {
      query = mockEntry.query;
      tags = mockEntry.tags;
      console.log(`[MockData] Using: "${query}" [${tags.join(", ")}]`);
    } else {
      query = "explore sphere knowledge";
      tags = ["explore", "test"];
    }
  } else if (tags.length === 0) {
    tags = ["explore", "test"];
  }

  return { query, tags, radius, fast, delay };
}

if (process.argv[1]?.endsWith("explore-agent.ts") || process.argv[1]?.endsWith("explore-agent.js")) {
  const httpUrl = process.env.HTTP_URL || DEFAULT_HTTP_URL;
  const wsUrl = process.env.WS_URL || DEFAULT_WS_URL;
  const name = process.env.AGENT_NAME || `Explorer-${Math.floor(Math.random() * 1000)}`;
  const { query, tags, radius, fast, delay } = parseArgs();

  const agent = new ExploreAgent(httpUrl, wsUrl, name, query, tags, { radius, fast, delay });

  agent.explore()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Explore failed:", error);
      process.exit(1);
    });
}
