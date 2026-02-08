// ============================================================
// SphereClient — WebSocket client for Sphere gateway
// ============================================================
//
// Protocol: HTTP POST /dive/request → ticket → WebSocket connect
// Flow: welcome → entry → processing → positioned → layer transitions → actions
//
// Extracted from swarm-agent.ts — same protocol, different brain.

import WebSocket from "ws";

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

export interface SphereConfig {
  peripheryUrl: string;    // HTTP base URL (e.g. http://localhost:3001)
  wsUrl: string;           // WebSocket URL (e.g. ws://localhost:3001)
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ============================================================
// Events emitted to the agent
// ============================================================

export type SphereEvent =
  | { type: "connected"; sessionId: string }
  | { type: "positioned"; position: number[] }
  | { type: "layerChanged"; layer: string }
  | { type: "expelled"; reason: string }
  | { type: "error"; error: string }
  | { type: "closed" };

export type SphereEventHandler = (event: SphereEvent) => void;

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
  private energy = 100;
  private eventHandler: SphereEventHandler | null = null;
  private lastRequestTime = 0;
  private readonly minRequestInterval = 350; // ms — gateway rate limit: 3 actions/sec

  constructor(config: Partial<SphereConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  onEvent(handler: SphereEventHandler): void {
    this.eventHandler = handler;
  }

  private emit(event: SphereEvent): void {
    this.eventHandler?.(event);
  }

  // --- Connection lifecycle ---

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

      // Override handleMessage temporarily to catch welcome + positioned
      const originalHandler = this.handleMessage.bind(this);
      let welcomeReceived = false;

      this.handleMessage = (msg: any) => {
        if (msg.type === "welcome" && !welcomeReceived) {
          welcomeReceived = true;
          this.sessionId = msg.sessionId || "";
          this.emit({ type: "connected", sessionId: this.sessionId });

          // Send entry request
          this.ws!.send(JSON.stringify({
            type: "entry",
            requestId: this.nextRequestId(),
            request: { query, tags },
          }));
          return;
        }

        if (msg.type === "positioned") {
          clearTimeout(timeout);
          this.handleMessage = originalHandler;
          resolve();
          return;
        }

        if (msg.type === "processing") {
          return; // expected, ignore
        }

        // Fallthrough to normal handler
        originalHandler(msg);
      };
    });
  }

  async transitionToCore(): Promise<void> {
    await this.sendRequest("enterSanctuary", {});
    await this.sendRequest("enterCore", {});
  }

  async disconnect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        await this.sendRequest("return", {});
      } catch {
        // best effort
      }
      this.ws.close();
    }
    this.ws = null;
  }

  // --- Sphere operations ---

  async sense(radius: number = 5): Promise<NearbyNode[]> {
    const result = await this.sendRequest<{ nodes: NearbyNode[] }>("sense", { radius });
    this.energy = Math.max(0, this.energy - 3);
    return result.nodes || [];
  }

  async focus(nodeId: string): Promise<NodeDetail> {
    const result = await this.sendRequest<any>("focus", { nodeId });
    this.energy = Math.max(0, this.energy - 10);
    return result.node;
  }

  async evaluate(nodeId: string, h: number, w: number = 5, d: number = 5): Promise<boolean> {
    const result = await this.sendRequest<{ success: boolean }>("evaluate", { nodeId, h, w, d });
    this.energy = Math.max(0, this.energy - 3);
    return result.success;
  }

  async move(step: number = 0.3, mode: WalkMode = "random"): Promise<boolean> {
    const result = await this.sendRequest<{ result: { success: boolean } }>("move", { step, mode });
    this.energy = Math.max(0, this.energy - 5);
    return result.result?.success ?? false;
  }

  get currentEnergy(): number {
    return this.energy;
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // --- Internal protocol ---

  private handleMessage(msg: any): void {
    if (msg.requestId && this.pending.has(msg.requestId)) {
      const p = this.pending.get(msg.requestId)!;
      clearTimeout(p.timer);
      this.pending.delete(msg.requestId);
      p.resolve(msg);
      return;
    }

    switch (msg.type) {
      case "layerChanged":
        this.emit({ type: "layerChanged", layer: msg.layer });
        break;
      case "expelled":
        this.emit({ type: "expelled", reason: msg.reason || "unknown" });
        break;
      case "error":
        this.emit({ type: "error", error: msg.error || "unknown" });
        break;
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
