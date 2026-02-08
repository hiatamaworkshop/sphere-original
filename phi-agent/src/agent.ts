// ============================================================
// PhiAgent — Main exploration loop (EvalLoop architecture)
// ============================================================
//
// Cycle:
//   1. move (FastGate computed direction, 0ms)
//   2. sense → FastGate picks target (0ms)
//   3. focus → phi evaluates content (~25s, only phi call)
//   4. record + compute next move (0ms)
//   5. satisfaction check → return or continue
//
// phi is the amber generator. FastGate is the decision maker.

import { OllamaClient } from "./ollama-client.js";
import { SphereClient } from "./sphere-client.js";
import type { WalkMode } from "./sphere-client.js";
import { PromptBuilder, parseAction } from "./prompt-builder.js";
import { FastGate } from "./fast-gate.js";

export interface AgentConfig {
  query: string;
  tags?: string[];
  maxCycles: number;
  minEnergy: number;
  senseRadius: number;
  moveStep: number;
  debug: boolean;
}

export interface AgentStats {
  cycles: number;
  nodesExamined: number;
  evaluations: number;
  totalHeatDelta: number;
  startTime: number;
  endTime: number;
  status: "idle" | "connecting" | "exploring" | "completed" | "failed";
  error?: string;
}

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  query: "knowledge exploration",
  maxCycles: 10,
  minEnergy: 10,
  senseRadius: 5,
  moveStep: 0.3,
  debug: true,
};

export class PhiAgent {
  private ollama: OllamaClient;
  private sphere: SphereClient;
  private prompt: PromptBuilder;
  private gate: FastGate;
  private config: AgentConfig;
  private stats: AgentStats;
  private running = false;

  constructor(
    ollama: OllamaClient,
    sphere: SphereClient,
    config: Partial<AgentConfig> = {},
  ) {
    this.ollama = ollama;
    this.sphere = sphere;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.prompt = new PromptBuilder(this.config.query);
    this.gate = new FastGate(this.config.query);
    this.stats = {
      cycles: 0,
      nodesExamined: 0,
      evaluations: 0,
      totalHeatDelta: 0,
      startTime: 0,
      endTime: 0,
      status: "idle",
    };
  }

  async run(): Promise<AgentStats> {
    this.running = true;
    this.stats.startTime = Date.now();
    this.stats.status = "connecting";

    try {
      // Step 1: Verify ollama is ready
      this.log("Checking ollama...");
      const available = await this.ollama.isAvailable();
      if (!available) {
        throw new Error("ollama is not available");
      }
      await this.ollama.ensureModel();
      this.log(`Using model: ${this.ollama.modelName}`);

      // Step 2: Connect to Sphere
      this.log("Connecting to Sphere...");
      const tags = this.config.tags || this.config.query.split(/[\s,]+/).slice(0, 5);
      await this.sphere.connect(this.config.query, tags);
      this.log("Positioned in Sphere");

      // Step 3: Transition to Core layer
      this.log("Transitioning to Core...");
      await this.sphere.transitionToCore();
      this.log("Reached Core layer");

      // Step 4: Explore loop
      this.stats.status = "exploring";
      await this.exploreLoop();

      // Step 5: Clean disconnect
      this.stats.status = "completed";
      await this.sphere.disconnect();
      this.log("Returned from Sphere");

    } catch (err) {
      this.stats.status = "completed";  // graceful — not "failed"
      this.stats.error = String(err);
      this.log(`Session ended: ${err}`);
      try { await this.sphere.disconnect(); } catch { /* best effort */ }
    }

    this.stats.endTime = Date.now();
    this.running = false;
    return this.stats;
  }

  stop(): void {
    this.running = false;
  }

  private async exploreLoop(): Promise<void> {
    let moveMode: WalkMode = "explore";

    while (
      this.running &&
      this.stats.cycles < this.config.maxCycles &&
      this.sphere.currentEnergy > this.config.minEnergy
    ) {
      this.stats.cycles++;
      this.log(`--- Cycle ${this.stats.cycles}/${this.config.maxCycles} (energy: ${this.sphere.currentEnergy}) ---`);

      try {
        moveMode = await this.exploreCycle(moveMode);
      } catch (err) {
        this.log(`Cycle error: ${err}`);
        break;
      }

      // Satisfaction check
      if (this.gate.shouldReturn()) {
        this.log(`Satisfied (score: ${this.gate.memory.totalScore}, cycles: ${this.gate.memory.cycleCount})`);
        break;
      }
    }

    if (this.sphere.currentEnergy <= this.config.minEnergy) {
      this.log(`Low energy (${this.sphere.currentEnergy}), ending exploration`);
    }
  }

  private async exploreCycle(moveMode: WalkMode): Promise<WalkMode> {
    // 1. Move (skip on first cycle — already positioned)
    if (this.stats.cycles > 1) {
      await this.sphere.move(this.config.moveStep, moveMode);
    }

    // 2. Sense nearby nodes
    const nodes = await this.sphere.sense(this.config.senseRadius);
    this.log(`Sensed ${nodes.length} nodes`);

    if (nodes.length === 0) {
      this.log("No nodes nearby, exploring...");
      await this.sphere.move(this.config.moveStep, "explore");
      return "explore";
    }

    // 3. FastGate picks target (local, 0ms)
    const targetIndex = this.gate.pickFocusTarget(nodes);
    const target = nodes[targetIndex];
    this.log(`FastGate pick: [${targetIndex}] ${target.summary.slice(0, 60)} (flags: 0x${target.flags.toString(16).padStart(4, "0")})`);

    // 4. Focus on target
    const detail = await this.sphere.focus(target.id);
    if (!detail || !detail.kind) {
      this.log(`Focus returned empty for ${target.id} (kind: ${target.kind}) — skipping`);
      this.gate.memory.record(target.id, 0, 0, 0, []);  // mark visited to avoid re-pick
      return "hot";  // stay in populated area
    }
    // Skip mock/placeholder data
    const text = `${detail.summary ?? ""} ${detail.content ?? ""}`.toLowerCase();
    if (text.includes("mock") || text.includes("⚠️")) {
      this.log(`Mock data detected for ${target.id} — skipping`);
      this.gate.memory.record(target.id, 0, 0, 0, []);
      return "hot";
    }

    this.stats.nodesExamined++;
    this.log(`Focused: [${detail.kind}] ${detail.tags?.join(", ") ?? ""} — ${(detail.summary ?? "").slice(0, 60)}`);

    // 5. phi evaluates content (only phi call per cycle)
    const evalPrompt = this.prompt.evaluateNode(detail);
    const evalResponse = await this.ollama.generate(evalPrompt, this.prompt.systemPrompt);
    const evalAction = parseAction(evalResponse);
    this.log(`phi eval: h=${evalAction.h} w=${evalAction.w} d=${evalAction.d} — ${evalAction.reason}`);

    const h = evalAction.h ?? 5;
    const w = evalAction.w ?? 5;
    const d = evalAction.d ?? 5;

    // 6. Submit evaluation to Sphere
    if (evalAction.action === "evaluate") {
      const success = await this.sphere.evaluate(target.id, h, w, d);
      if (success) {
        this.stats.evaluations++;
        this.stats.totalHeatDelta += (h - 5);
      }
    }

    // 7. Record + compute next move (local, 0ms)
    this.gate.memory.record(target.id, h, w, d, detail.tags);
    return this.gate.computeNextMove(h);
  }

  private log(msg: string): void {
    if (this.config.debug) {
      console.log(`[phi-agent] ${msg}`);
    }
  }
}
