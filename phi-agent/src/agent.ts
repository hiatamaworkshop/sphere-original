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
import { FastGate, LOADOUTS } from "./fast-gate.js";
import type { Loadout, LoadoutName } from "./fast-gate.js";

export interface AgentConfig {
  query: string;
  tags?: string[];
  loadout: LoadoutName | Loadout;
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
  loadout: "balanced",
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
  private initialEnergy = 100;

  constructor(
    ollama: OllamaClient,
    sphere: SphereClient,
    config: Partial<AgentConfig> = {},
  ) {
    this.ollama = ollama;
    this.sphere = sphere;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.prompt = new PromptBuilder(this.config.query);
    const loadout = typeof this.config.loadout === "string"
      ? LOADOUTS[this.config.loadout]
      : this.config.loadout;
    this.gate = new FastGate(this.config.query, loadout);
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
      this.initialEnergy = this.sphere.currentEnergy;
      this.log(`Positioned in Sphere (energy: ${this.initialEnergy}, loadout: ${this.gate.loadoutName})`);

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
    while (
      this.running &&
      this.stats.cycles < this.config.maxCycles &&
      this.sphere.currentEnergy > this.config.minEnergy
    ) {
      this.stats.cycles++;

      // Feelings-driven action selection
      const energyRatio = this.initialEnergy > 0
        ? this.sphere.currentEnergy / this.initialEnergy
        : 1.0;
      const action = this.stats.cycles <= 1
        ? { type: "standard", moveStep: 0, moveMode: this.gate.walkPreference }  // first cycle: no move
        : this.gate.chooseAction(energyRatio);

      this.log(`--- Cycle ${this.stats.cycles}/${this.config.maxCycles} (energy: ${this.sphere.currentEnergy}) [${action.type}] ---`);

      try {
        switch (action.type) {
          case "scout":
            await this.scoutCycle(action.moveStep, action.moveMode);
            break;
          case "camp":
            await this.standardCycle(0, action.moveMode);  // moveStep=0: no move
            break;
          case "leap":
            await this.standardCycle(action.moveStep, action.moveMode);
            break;
          default:
            await this.standardCycle(action.moveStep, action.moveMode);
            break;
        }
      } catch (err) {
        this.log(`Cycle error: ${err}`);
        break;
      }

      // Feelings check (4D feelings × personality vector)
      const postRatio = this.initialEnergy > 0
        ? this.sphere.currentEnergy / this.initialEnergy
        : 1.0;
      this.log(`Feelings: ${this.gate.feelingsDebug(postRatio)}`);
      this.log(`DeltaProfile: ${this.gate.memory.deltaDebug()}`);
      if (this.gate.shouldReturn(postRatio)) {
        this.log(`Satisfied — returning`);
        break;
      }
    }

    if (this.sphere.currentEnergy <= this.config.minEnergy) {
      this.log(`Low energy (${this.sphere.currentEnergy}), ending exploration`);
    }
  }

  /** Check if enough energy remains for an action */
  private canAfford(action: "sense" | "move" | "focus" | "evaluate"): boolean {
    return this.sphere.currentEnergy >= this.sphere.energyCosts[action];
  }

  /** Standard cycle: move → sense → pick → focus → eval → record */
  private async standardCycle(moveStep: number, moveMode: WalkMode): Promise<void> {
    // 1. Move (skip if moveStep=0, e.g. camp or first cycle)
    if (moveStep > 0) {
      if (!this.canAfford("move")) {
        this.log(`Energy too low for move (${this.sphere.currentEnergy} < ${this.sphere.energyCosts.move})`);
        return;
      }
      await this.sphere.move(moveStep, moveMode);
    }

    // 2. Sense nearby nodes
    if (!this.canAfford("sense")) {
      this.log(`Energy too low for sense (${this.sphere.currentEnergy} < ${this.sphere.energyCosts.sense})`);
      return;
    }
    const nodes = await this.sphere.sense(this.config.senseRadius);
    this.log(`Sensed ${nodes.length} nodes`);

    if (nodes.length === 0) {
      this.log("No nodes nearby, exploring...");
      if (this.canAfford("move")) {
        await this.sphere.move(this.config.moveStep, "explore");
      }
      return;
    }

    // 3. FastGate picks target (local, 0ms)
    const targetIndex = this.gate.pickFocusTarget(nodes);
    const target = nodes[targetIndex];
    this.log(`FastGate pick: [${targetIndex}] ${target.summary.slice(0, 60)} (flags: 0x${target.flags.toString(16).padStart(4, "0")})`);

    // 4. Focus on target (most expensive action: 10 energy)
    if (!this.canAfford("focus")) {
      this.log(`Energy too low for focus (${this.sphere.currentEnergy} < ${this.sphere.energyCosts.focus}) — skipping`);
      return;
    }
    const detail = await this.sphere.focus(target.id);
    if (!detail || !detail.kind) {
      this.log(`Focus returned empty for ${target.id} (kind: ${target.kind}) — skipping`);
      this.gate.memory.markVisited(target.id);
      return;
    }
    // Skip mock/placeholder data
    const text = `${detail.summary ?? ""} ${detail.content ?? ""}`.toLowerCase();
    if (text.includes("mock") || text.includes("⚠️")) {
      this.log(`Mock data detected for ${target.id} — skipping`);
      this.gate.memory.markVisited(target.id);
      return;
    }

    this.stats.nodesExamined++;
    this.log(`Focused: [${detail.kind}] ${detail.tags?.join(", ") ?? ""} — ${(detail.summary ?? "").slice(0, 60)}`);

    // 5. phi evaluates content (only phi call per cycle)
    const evalPrompt = this.prompt.evaluateNode(detail, this.gate.evalFocus);
    const evalResponse = await this.ollama.generate(evalPrompt, this.prompt.systemPrompt);
    const evalAction = parseAction(evalResponse);
    this.log(`phi eval: h=${evalAction.h} w=${evalAction.w} d=${evalAction.d} — ${evalAction.reason}`);

    // Parse failure → mark visited only (don't contaminate quality profile)
    if (evalAction.action !== "evaluate") {
      this.gate.memory.markVisited(target.id);
      return;
    }

    const h = evalAction.h ?? 5;
    const w = evalAction.w ?? 5;
    const d = evalAction.d ?? 5;

    // 6. Submit evaluation to Sphere
    if (this.canAfford("evaluate")) {
      const success = await this.sphere.evaluate(target.id, h, w, d);
      if (success) {
        this.stats.evaluations++;
        this.stats.totalHeatDelta += (h - 5);
      }
    }

    // 7. Record quality data
    this.gate.memory.record(target.id, h, w, d, detail.tags);
  }

  /** Scout cycle: move → sense only (no focus, no eval, saves energy) */
  private async scoutCycle(moveStep: number, moveMode: WalkMode): Promise<void> {
    if (moveStep > 0) {
      if (!this.canAfford("move")) {
        this.log(`Energy too low for move (${this.sphere.currentEnergy} < ${this.sphere.energyCosts.move})`);
        return;
      }
      await this.sphere.move(moveStep, moveMode);
    }
    if (!this.canAfford("sense")) {
      this.log(`Energy too low for sense (${this.sphere.currentEnergy} < ${this.sphere.energyCosts.sense})`);
      return;
    }
    const nodes = await this.sphere.sense(this.config.senseRadius);
    this.log(`Scout: sensed ${nodes.length} nodes (no focus, saving energy)`);
  }

  private log(msg: string): void {
    if (this.config.debug) {
      console.log(`[phi-agent] ${msg}`);
    }
  }
}
