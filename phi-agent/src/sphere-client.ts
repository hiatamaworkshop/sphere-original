// ============================================================
// SphereClient — WebSocket client for Sphere gateway
// ============================================================
//
// Protocol: HTTP POST /dive/request → ticket → WebSocket connect
// Flow: welcome → (rulebook fetch) → entry → processing → positioned → actions
//
// Energy tracking uses costs from the Rulebook (config-authoritative).

import WebSocket from "ws";
import type { MetricSemantics, HarvestPolicy } from "./fast-gate.js";

// ============================================================
// Types (mirroring gateway protocol)
// ============================================================

export type WalkMode = "random" | "hot" | "fresh" | "deep" | "explore" | "flow";

export interface NearbyNode {
  id: string;
  distance: number;
  summary: string;
  heat: number;
  weight: number;
  decay: number;
  timestamp: number;
  kind: string;
  flags: number;
  tags?: string[];
  immuneMod?: number;
}

export interface NodeDetail {
  id: string;
  tags: string[];
  summary: string;
  content: string;
  heat: number;
  weight: number;
  ttl: number;
  kind: string;
  sourceNodeId?: string;
  ref_url?: string;
}

export interface ScanNode {
  id: string;
  distance: number;
  tags: string[];
  kind: string;
  flags: number;
}

export interface SphereConfig {
  peripheryUrl: string;    // HTTP base URL (e.g. http://localhost:3001)
  wsUrl: string;           // WebSocket URL (e.g. ws://localhost:3001)
}

/** Energy cost table from Rulebook constraints */
export interface EnergyCosts {
  sense: number;
  scanL1: number;
  move: number;
  focus: number;
  warp: number;
  evaluate: number;
  emitBus?: number;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ============================================================
// Events emitted to the agent
// ============================================================

/** ActiveBus message received from another agent */
export interface BusMessage {
  id: string;
  timestamp: number;
  senderId: string;
  payload: Uint8Array;
}

/** Vestibule auto-process result returned by the server on return */
export interface VestibuleResult {
  sphereId: string;
  timestamp: number;
  auto: { evaluationsApplied: number; autoCapsuleSaved: boolean };
  commands: { name: string; description: string }[];
  farewell: string;
}

export type SphereEvent =
  | { type: "connected"; sessionId: string }
  | { type: "positioned"; position: number[] }
  | { type: "layerChanged"; layer: string }
  | { type: "warning"; message: string }
  | { type: "expelled"; reason: string }
  | { type: "error"; error: string }
  | { type: "bus_message"; message: BusMessage }
  | { type: "vestibuleEntered"; result: VestibuleResult }
  | { type: "closed" };

export type SphereEventHandler = (event: SphereEvent) => void;

// ============================================================
// Fallback costs (used only if rulebook fetch fails)
// ============================================================

const FALLBACK_COSTS: EnergyCosts = {
  sense: 3, scanL1: 1, move: 5, focus: 10, warp: 15, evaluate: 3, emitBus: 20,
};
const FALLBACK_INITIAL_ENERGY = 100;

// ============================================================
// Client
// ============================================================

const DEFAULT_CONFIG: SphereConfig = {
  peripheryUrl: process.env.SPHERE_URL || "http://localhost:3001",
  wsUrl: process.env.SPHERE_WS || "ws://localhost:8081",  // dev: separate port, production: same as HTTP
};

export class SphereClient {
  private config: SphereConfig;
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private sessionId = "";
  private energy = FALLBACK_INITIAL_ENERGY;
  private costs: EnergyCosts = { ...FALLBACK_COSTS };
  private eventHandler: SphereEventHandler | null = null;
  private lastRequestTime = 0;
  private readonly minRequestInterval = 350; // ms — gateway rate limit: 3 actions/sec
  private positionedResolve: (() => void) | null = null;
  private positionedPromise: Promise<void> | null = null;
  private _metricSemantics: MetricSemantics | undefined;
  private _harvestPolicy: HarvestPolicy | undefined;

  constructor(config: Partial<SphereConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** MetricSemantics from Sphere rulebook (available after preconnect) */
  get metricSemantics(): MetricSemantics | undefined {
    return this._metricSemantics;
  }

  /** HarvestPolicy from Sphere rulebook (available after preconnect) */
  get harvestPolicy(): HarvestPolicy | undefined {
    return this._harvestPolicy;
  }

  onEvent(handler: SphereEventHandler): void {
    this.eventHandler = handler;
  }

  private emit(event: SphereEvent): void {
    this.eventHandler?.(event);
  }

  // --- Pre-flight: fetch rulebook before WebSocket dive ---

  /**
   * Pre-flight: fetch rulebook via HTTP before WebSocket dive.
   * Extracts MetricSemantics and energy costs so FastGate can be
   * configured BEFORE entering the Sphere.
   */
  async preconnect(): Promise<void> {
    try {
      const res = await fetch(`${this.config.peripheryUrl}/rulebook`);
      if (!res.ok) throw new Error(`${res.status}`);
      const rb = (await res.json()) as any;

      // Extract energy config (same logic as fetchRulebook)
      const ec = rb.constraints?.energy;
      if (ec) {
        this.energy = ec.initial ?? FALLBACK_INITIAL_ENERGY;
        this.costs = {
          sense:    ec.costs?.sense    ?? FALLBACK_COSTS.sense,
          scanL1:   ec.costs?.scanL1   ?? FALLBACK_COSTS.scanL1,
          move:     ec.costs?.move     ?? FALLBACK_COSTS.move,
          focus:    ec.costs?.focus    ?? FALLBACK_COSTS.focus,
          warp:     ec.costs?.warp     ?? FALLBACK_COSTS.warp,
          evaluate: ec.costs?.evaluate ?? FALLBACK_COSTS.evaluate,
          emitBus:  ec.costs?.emitBus  ?? FALLBACK_COSTS.emitBus,
        };
      }

      // Extract MetricSemantics (domain-specific evaluation axis semantics)
      if (rb.metricSemantics) {
        this._metricSemantics = rb.metricSemantics as MetricSemantics;
        console.log(`[SphereClient] MetricSemantics: [${this._metricSemantics.names.join(",")}] hit=${this._metricSemantics.hitThreshold} miss=${this._metricSemantics.missThreshold}`);
      }

      // Extract HarvestPolicy (Sphere-configurable data carry-back rules)
      if (rb.harvestPolicy) {
        this._harvestPolicy = rb.harvestPolicy as HarvestPolicy;
        console.log(`[SphereClient] HarvestPolicy: carryContent=${this._harvestPolicy.carryContent} summaryMax=${this._harvestPolicy.summaryMaxLength}`);
      }

      console.log(`[SphereClient] Preconnect OK: energy=${this.energy}`);
    } catch (e) {
      console.warn(`[SphereClient] Preconnect failed (using defaults): ${e}`);
    }
  }

  // --- Connection lifecycle ---

  /**
   * Connect to Sphere. Resolves when Tutorial is ready (processing received).
   * Use waitForPositioned() to wait for query vector availability.
   */
  async connect(query: string, tags: string[]): Promise<void> {
    // Step 1: Get ticket
    const ticketRes = await fetch(`${this.config.peripheryUrl}/dive/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!ticketRes.ok) {
      throw new Error(`Ticket request failed: ${ticketRes.status}`);
    }
    const ticketData = (await ticketRes.json()) as { success: boolean; ticket: { token: string } };
    if (!ticketData.success) {
      throw new Error("Ticket request rejected");
    }

    // Set up positioned promise (resolved when query vector arrives)
    this.positionedPromise = new Promise((res) => { this.positionedResolve = res; });

    // Step 2: WebSocket connect
    const token = ticketData.ticket.token;
    this.ws = new WebSocket(`${this.config.wsUrl}?token=${token}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Connection timeout")), 15000);

      this.ws!.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      });

      this.ws!.on("open", () => {
        // Wait for 'welcome' message before sending entry
      });

      this.ws!.on("close", () => {
        this.emit({ type: "closed" });
      });

      this.ws!.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Override handleMessage temporarily to catch welcome + processing
      const originalHandler = this.handleMessage.bind(this);
      let welcomeReceived = false;

      this.handleMessage = (msg: any) => {
        if (msg.type === "welcome" && !welcomeReceived) {
          welcomeReceived = true;
          this.sessionId = msg.sessionId || "";
          this.emit({ type: "connected", sessionId: this.sessionId });

          // Fetch rulebook then send entry
          const rulebookUrl = msg.rulebookUrl || "/rulebook";
          this.fetchRulebook(rulebookUrl).then(() => {
            this.ws!.send(JSON.stringify({
              type: "entry",
              requestId: this.nextRequestId(),
              request: { query, tags },
            }));
          });
          return;
        }

        if (msg.type === "processing") {
          // [Entry Pipeline] Tutorial is ready — SphereContext exists with relic vector
          clearTimeout(timeout);
          this.handleMessage = originalHandler;
          resolve();
          return;
        }

        if (msg.type === "positioned") {
          // Query vector ready — resolve positioned promise
          this.emit({ type: "positioned", position: msg.position ?? [] });
          this.positionedResolve?.();
          this.positionedResolve = null;
          return;
        }

        // Fallthrough to normal handler
        originalHandler(msg);
      };
    });
  }

  /**
   * Wait for query vectorization to complete (positioned message).
   * Call after tutorialExplore() to ensure Sanctuary transition is possible.
   */
  async waitForPositioned(): Promise<void> {
    if (!this.positionedPromise) return;
    await this.positionedPromise;
    this.positionedPromise = null;
  }

  async enterSanctuary(): Promise<void> {
    const result = await this.sendRequest<{ energy?: number }>("enterSanctuary", {});
    this.syncEnergy(result.energy);
  }

  async enterCore(): Promise<void> {
    const result = await this.sendRequest<{ energy?: number }>("enterCore", {});
    this.syncEnergy(result.energy);
  }

  // --- Vestibule lifecycle ---
  // Protocol: return → vestibuleEntered → [commands] → acknowledge → farewell → close

  /** Send return → receive vestibuleEntered. Enters the Vestibule phase. */
  async enterVestibule(): Promise<VestibuleResult | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return null;

    try {
      const msg = await this.sendRequest<{
        type: "vestibuleEntered";
        sessionId: string;
        sphereId: string;
        timestamp: number;
        auto: { evaluationsApplied: number; autoCapsuleSaved: boolean };
        commands: { name: string; description: string }[];
        farewell: string;
      }>("return", {});

      const result: VestibuleResult = {
        sphereId: msg.sphereId,
        timestamp: msg.timestamp,
        auto: msg.auto,
        commands: msg.commands,
        farewell: msg.farewell,
      };
      this.emit({ type: "vestibuleEntered", result });
      return result;
    } catch {
      return null;
    }
  }

  /** View auto-applied evaluation receipt. */
  async viewReceipt(): Promise<any> {
    return (await this.sendRequest<{ data: any }>("viewReceipt", {})).data;
  }

  /** View exploration trajectory (action log). */
  async viewTrail(): Promise<any> {
    return (await this.sendRequest<{ data: any }>("viewTrail", {})).data;
  }

  /** View notable nodes visited, ranked by focus count. */
  async viewDiscoveries(): Promise<any> {
    return (await this.sendRequest<{ data: any }>("viewDiscoveries", {})).data;
  }

  /** Submit an ExperienceCapsule with NodeSeeds for incarnation (Vestibule command).
   *  Only available in vestibule. Requires Gatekeeper validation on server.
   *  Type defined inline (phi-agent does not depend on periphery types). */
  async submitCapsule(capsule: {
    schemaVersion: number;
    topTier: Array<{ tags: string[]; summary: string; content?: string; flags: number; sourceNodeId?: string; links?: string[]; ref_url?: string }>;
    normalNodes: Array<{ tags: string[]; summary: string; content?: string; flags: number; sourceNodeId?: string; links?: string[]; ref_url?: string }>;
    ghostNodes: Array<{ tags: string[]; summary: string; content?: string; flags: number; sourceNodeId?: string; links?: string[]; ref_url?: string }>;
    evaluations: Array<{ nodeId: string; h: number; w: number; d: number }>;
    timestamp: number;
  }): Promise<{ success: boolean; nodeCount: number; evaluationCount: number; errors?: string[] }> {
    return this.sendRequest("submitCapsule", { capsule });
  }

  /** Acknowledge and disconnect. Server sends farewell then closes. */
  async acknowledge(): Promise<void> {
    try {
      await this.sendRequest("acknowledge", {});
    } catch {
      // farewell may arrive as server-close rather than requestId response
    }
    this.ws = null;
  }

  /** Convenience: enterVestibule → acknowledge (no commands). For error/fallback paths. */
  async disconnect(): Promise<VestibuleResult | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.ws = null;
      return null;
    }
    try {
      const result = await this.enterVestibule();
      await this.acknowledge();
      return result;
    } catch {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
      return null;
    }
  }

  // --- Sphere operations ---

  async sense(radius: number = 1): Promise<NearbyNode[]> {
    const result = await this.sendRequest<{ nodes: NearbyNode[]; energy?: number }>("sense", { radius });
    this.syncEnergy(result.energy);
    return result.nodes || [];
  }

  async focus(nodeId: string): Promise<NodeDetail> {
    const result = await this.sendRequest<any>("focus", { nodeId });
    this.syncEnergy(result.energy);
    return result.node;
  }

  async evaluate(nodeId: string, h: number, w: number = 5, d: number = 5): Promise<boolean> {
    const result = await this.sendRequest<{ success: boolean; energy?: number }>("evaluate", { nodeId, h, w, d });
    this.syncEnergy(result.energy);
    return result.success;
  }

  async move(step: number = 0.3, mode: WalkMode = "random"): Promise<boolean> {
    const result = await this.sendRequest<{ result: { success: boolean }; energy?: number }>("move", { step, mode });
    this.syncEnergy(result.energy);
    return result.result?.success ?? false;
  }

  async scanL1(radius?: number): Promise<ScanNode[]> {
    const result = await this.sendRequest<{ nodes: ScanNode[]; energy?: number }>("scan", { radius });
    this.syncEnergy(result.energy);
    return result.nodes || [];
  }

  async warp(nodeId: string): Promise<boolean> {
    const result = await this.sendRequest<{ result: { success: boolean }; energy?: number }>("warp", { nodeId });
    this.syncEnergy(result.energy);
    return result.result?.success ?? false;
  }

  async emitBus(payload: Uint8Array, free = false): Promise<boolean> {
    if (!free && this.energy < (this.costs.emitBus ?? 20)) return false;
    const b64 = Buffer.from(payload).toString("base64");
    const result = await this.sendRequest<{ success: boolean; energy?: number }>("emit", { payload: b64 });
    this.syncEnergy(result.energy);
    return result.success ?? false;
  }

  get currentEnergy(): number {
    return this.energy;
  }

  get energyCosts(): Readonly<EnergyCosts> {
    return this.costs;
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // --- Rulebook ---

  private async fetchRulebook(path: string): Promise<void> {
    try {
      const res = await fetch(`${this.config.peripheryUrl}${path}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const rb = (await res.json()) as any;
      const ec = rb.constraints?.energy;
      if (ec) {
        this.energy = ec.initial ?? FALLBACK_INITIAL_ENERGY;
        this.costs = {
          sense:    ec.costs?.sense    ?? FALLBACK_COSTS.sense,
          scanL1:   ec.costs?.scanL1   ?? FALLBACK_COSTS.scanL1,
          move:     ec.costs?.move     ?? FALLBACK_COSTS.move,
          focus:    ec.costs?.focus    ?? FALLBACK_COSTS.focus,
          warp:     ec.costs?.warp     ?? FALLBACK_COSTS.warp,
          evaluate: ec.costs?.evaluate ?? FALLBACK_COSTS.evaluate,
          emitBus:  ec.costs?.emitBus  ?? FALLBACK_COSTS.emitBus,
        };
        console.log(`[SphereClient] Rulebook loaded: energy=${this.energy}, costs=${JSON.stringify(this.costs)}`);
      }
    } catch (e) {
      console.warn(`[SphereClient] Rulebook fetch failed (using fallback): ${e}`);
    }
  }

  // --- Internal ---

  /** Sync energy from server-authoritative response */
  private syncEnergy(serverEnergy: number | undefined): void {
    if (serverEnergy !== undefined) {
      this.energy = serverEnergy;
    }
  }

  private handleMessage(msg: any): void {
    if (msg.requestId && this.pending.has(msg.requestId)) {
      const p = this.pending.get(msg.requestId)!;
      clearTimeout(p.timer);
      this.pending.delete(msg.requestId);
      p.resolve(msg);
      return;
    }

    switch (msg.type) {
      case "positioned":
        // Query vector ready (async, arrives after connect resolves)
        this.emit({ type: "positioned", position: msg.position ?? [] });
        this.positionedResolve?.();
        this.positionedResolve = null;
        break;
      case "layerChanged":
        this.emit({ type: "layerChanged", layer: msg.layer });
        break;
      case "warning":
        this.emit({ type: "warning", message: msg.message || "low energy" });
        break;
      case "expelled":
        this.emit({ type: "expelled", reason: msg.reason || "unknown" });
        break;
      case "error":
        this.emit({ type: "error", error: msg.error || "unknown" });
        break;
      case "vestibuleEntered": {
        // Server-initiated vestibule (e.g. expelled → auto vestibule)
        const vr: VestibuleResult = {
          sphereId: msg.sphereId,
          timestamp: msg.timestamp,
          auto: msg.auto,
          commands: msg.commands,
          farewell: msg.farewell,
        };
        this.emit({ type: "vestibuleEntered", result: vr });
        break;
      }
      case "farewell":
        // Server signals session end — connection will close
        break;
      case "bus_message": {
        const d = msg.data;
        if (d) {
          const busMsg: BusMessage = {
            id: d.id,
            timestamp: d.timestamp,
            senderId: d.senderId,
            payload: new Uint8Array(Buffer.from(d.payload, "base64")),
          };
          this.emit({ type: "bus_message", message: busMsg });
        }
        break;
      }
    }
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await new Promise(r => setTimeout(r, this.minRequestInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private sendRequest<T>(type: string, payload: Record<string, unknown>): Promise<T> {
    return this.throttle().then(() => new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }

      const requestId = this.nextRequestId();
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Request timeout: ${type}`));
      }, 10000);

      this.pending.set(requestId, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ type, requestId, ...payload }));
    }));
  }

  private nextRequestId(): string {
    return `phi-${++this.requestCounter}-${Date.now()}`;
  }
}
