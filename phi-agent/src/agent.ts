// ============================================================
// PhiAgent — Main exploration loop
// ============================================================
//
// Coupling service: bridges ollama (reasoning) ↔ Sphere (environment)
//
// Loop:
//   1. sense() → nearby nodes
//   2. phi decides: focus on which node? or move?
//   3. focus() → full content
//   4. phi decides: how to evaluate?
//   5. evaluate() → affect node metabolism
//   6. phi decides: where to move next?
//   7. move() → new position
//   8. repeat until energy depleted or max cycles

import { OllamaClient } from "./ollama-client.js";
import { SphereClient } from "./sphere-client.js";
import { PromptBuilder, parseAction } from "./prompt-builder.js";
import type { AgentAction } from "./prompt-builder.js";

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
      this.stats.status = "failed";
      this.stats.error = String(err);
      this.log(`Error: ${err}`);
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
      this.log(`--- Cycle ${this.stats.cycles}/${this.config.maxCycles} (energy: ${this.sphere.currentEnergy}) ---`);

      try {
        await this.exploreCycle();
      } catch (err) {
        this.log(`Cycle error: ${err}`);
        // Continue on error — resilience
      }
    }

    if (this.sphere.currentEnergy <= this.config.minEnergy) {
      this.log(`Low energy (${this.sphere.currentEnergy}), ending exploration`);
    }
  }

  private async exploreCycle(): Promise<void> {
    // 1. Sense nearby nodes
    const nodes = await this.sphere.sense(this.config.senseRadius);
    this.log(`Sensed ${nodes.length} nodes`);

    if (nodes.length === 0) {
      // No nodes nearby — ask phi where to move
      this.log("No nodes nearby, moving...");
      await this.sphere.move(this.config.moveStep, "explore");
      return;
    }

    // 2. Ask phi which node to focus on
    const focusPrompt = this.prompt.chooseFocusTarget(nodes);
    const focusResponse = await this.ollama.generate(focusPrompt, this.prompt.systemPrompt);
    const focusAction = parseAction(focusResponse);
    this.log(`phi decision: ${JSON.stringify(focusAction)}`);

    if (focusAction.action === "move") {
      // phi says move instead of focus
      await this.sphere.move(this.config.moveStep, focusAction.mode || "random");
      return;
    }

    if (focusAction.action !== "focus" || focusAction.index == null) {
      // Fallback: focus on closest node
      await this.focusAndEvaluate(nodes[0].id);
    } else {
      const targetIndex = Math.min(focusAction.index, nodes.length - 1);
      await this.focusAndEvaluate(nodes[targetIndex].id);
    }

    // 4. Ask phi where to move next
    const movePrompt = this.prompt.chooseNextMove();
    const moveResponse = await this.ollama.generate(movePrompt, this.prompt.systemPrompt);
    const moveAction = parseAction(moveResponse);
    this.log(`phi move: ${JSON.stringify(moveAction)}`);

    await this.sphere.move(this.config.moveStep, moveAction.mode || "random");
  }

  private async focusAndEvaluate(nodeId: string): Promise<void> {
    // 3a. Focus on the chosen node
    const detail = await this.sphere.focus(nodeId);
    this.stats.nodesExamined++;
    this.log(`Focused: [${detail.kind}] ${detail.tags.join(", ")} — ${detail.summary.slice(0, 60)}`);

    // 3b. Ask phi to evaluate
    const evalPrompt = this.prompt.evaluateNode(detail);
    const evalResponse = await this.ollama.generate(evalPrompt, this.prompt.systemPrompt);
    const evalAction = parseAction(evalResponse);
    this.log(`phi eval: h=${evalAction.h} w=${evalAction.w} d=${evalAction.d} — ${evalAction.reason}`);

    if (evalAction.action === "evaluate" && evalAction.h != null) {
      const success = await this.sphere.evaluate(nodeId, evalAction.h, evalAction.w ?? 5, evalAction.d ?? 5);
      if (success) {
        this.stats.evaluations++;
        this.stats.totalHeatDelta += (evalAction.h - 5);
      }
    }
  }

  private log(msg: string): void {
    if (this.config.debug) {
      console.log(`[phi-agent] ${msg}`);
    }
  }
}
