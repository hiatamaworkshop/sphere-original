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
import type { WalkMode, BusMessage } from "./sphere-client.js";
import { PromptBuilder, parseAction } from "./prompt-builder.js";
import { FastGate, LOADOUTS } from "./fast-gate.js";
import type { Loadout, LoadoutName, SpeciesMemoryBias } from "./fast-gate.js";
import { appendEvalLog, loadSpeciesProfile } from "./eval-log.js";
import type { EvalLogEntry } from "./eval-log.js";

/** Species-specific voice guidance for return responses */
const SPECIES_VOICE: Record<string, string> = {
  moth: "Use energetic, discovery-focused language. Express excitement about insights.",
  hermit: "Use calm, contemplative language. Prefer quiet observation over excitement.",
  scholar: "Use analytical, precise language. Focus on theoretical connections.",
  hunter: "Use direct, results-focused language. Emphasize high-value findings.",
  scout: "Use exploratory, novelty-seeking language. Highlight fresh discoveries.",
  archivist: "Use preservation-focused language. Emphasize stability and lasting value.",
  balanced: "Use neutral, balanced language. Avoid extremes.",
  wanderer: "Use open, unbiased language. Report without strong preferences.",
  sniper: "Use precise, targeted language. Focus on exact matches.",
};

/** Decoded bus hint from another agent */
interface BusHint {
  nodeId: string;
  h: number;
  w: number;
  receivedAt: number;
}

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
  private busHints: Map<string, BusHint> = new Map();
  private busEmitCount = 0;
  private busRecvCount = 0;

  /** Nodes encountered during exploration — what the agent "saw" */
  private encounters: Array<{
    nodeId: string;
    tags: string[];
    summary: string;
    h: number;
    w: number;
    d: number;
  }> = [];

  /** Session start time for duration tracking */
  private sessionStart = Date.now();

  constructor(
    ollama: OllamaClient,
    sphere: SphereClient,
    config: Partial<AgentConfig> = {},
  ) {
    this.ollama = ollama;
    this.sphere = sphere;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.prompt = new PromptBuilder(this.config.query, this.ollama.modelName);
    const loadout = typeof this.config.loadout === "string"
      ? LOADOUTS[this.config.loadout]
      : this.config.loadout;

    // Load species memory — pre-blended profile from Digestor
    // (0.7 × own species + 0.3 × global, computed by Digestor)
    const loadoutName = typeof this.config.loadout === "string"
      ? this.config.loadout : this.config.loadout.name;
    const profile = loadSpeciesProfile(loadoutName);
    let speciesBias: SpeciesMemoryBias | undefined;
    if (profile) {
      speciesBias = {
        hotNodeIds: profile.hotNodeIds,
        tags: profile.tags,
      };
      this.log(`Species profile: ${profile.sessions} evals, ${profile.hotNodeIds.size} nodes, ${profile.tags.length} tags (${loadoutName})`);
    } else {
      this.log(`Species profile: not found for ${loadoutName} (no profile or empty)`);
    }
    this.gate = new FastGate(this.config.query, loadout, speciesBias);
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
      // Listen for ActiveBus messages from other agents
      this.sphere.onEvent((event) => {
        if (event.type === "bus_message") {
          this.handleBusMessage(event.message);
        }
      });

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

      // Step 5: Persist species memory (evaluation log)
      this.persistEvalLog();

      // Step 6: Return response — agent reflects on what it discovered
      try {
        const response = await this.generateReturnResponse();
        if (response) {
          console.log("\n========================================");
          console.log("  Return Response");
          console.log("========================================");
          console.log(response);
          console.log("========================================\n");
        }
      } catch (err) {
        this.log(`Return response failed: ${err}`);
      }

      // Step 7: Clean disconnect
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

  /** Persist session evaluations to species memory log (JSONL) */
  private persistEvalLog(): void {
    const evals = this.gate.memory.evals;
    if (evals.length === 0) {
      this.log("No evaluations to persist");
      return;
    }
    const entry: EvalLogEntry = {
      loadout: this.gate.loadoutName,
      model: this.ollama.modelName,
      query: this.config.query,
      timestamp: this.stats.startTime,
      duration: Date.now() - this.stats.startTime,
      evaluations: evals.map(e => ({
        nodeId: e.nodeId,
        h: e.h,
        w: e.w,
        d: e.d,
        tags: e.tags,
      })),
      busEmits: this.busEmitCount,
      busRecvs: this.busRecvCount,
    };
    try {
      appendEvalLog(entry);
      this.log(`Species memory: persisted ${evals.length} evaluations (${this.gate.loadoutName}), bus: ${this.busEmitCount} emits / ${this.busRecvCount} recvs`);
    } catch (err) {
      this.log(`Species memory write failed: ${err}`);
    }
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

    // 3. FastGate picks target (local, 0ms) — with ActiveBus hints
    const targetIndex = this.gate.pickFocusTarget(nodes, (id) => this.getBusBonus(id));
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
        // 6b. Broadcast notable discovery to other agents
        await this.tryEmitBus(target.id, h, w);
      }
    }

    // 7. Record quality data
    this.gate.memory.record(target.id, h, w, d, detail.tags);

    // 7b. Store encounter for return response (agent "remembers" what it saw)
    this.encounters.push({
      nodeId: target.id,
      tags: detail.tags ?? [],
      summary: (detail.summary ?? "").slice(0, 200),
      h, w, d,
    });

    // 8. Emit cycle JSON for UI (structured output, always printed)
    this.emitCycleJson("standard", nodes.length, {
      nodeId: target.id,
      tags: detail.tags ?? [],
      summary: (detail.summary ?? "").slice(0, 100),
    }, {
      h, w, d,
      reason: (evalAction.reason ?? "").slice(0, 100),
    });
  }

  // ===== ActiveBus =====

  /** Handle incoming bus message from another agent */
  private handleBusMessage(msg: BusMessage): void {
    if (msg.payload.length < 3) return;
    const h = msg.payload[0];
    const w = msg.payload[1];
    const nodeId = new TextDecoder().decode(msg.payload.slice(2));
    if (!nodeId) return;

    this.busHints.set(nodeId, { nodeId, h, w, receivedAt: Date.now() });
    this.busRecvCount++;
    this.log(`Bus recv: node=${nodeId.slice(0, 8)} h=${h} w=${w} from=${msg.senderId.slice(0, 8)}`);
  }

  /** Involuntary emit — strong reaction leaks into the air.
   *  First emit per session is free ("birth cry"). */
  private async tryEmitBus(nodeId: string, h: number, w: number): Promise<void> {
    // Reflex threshold: only strong reactions leak
    if (h < 8) return;

    const free = this.busEmitCount === 0;

    // Encode: [h, w, ...nodeId_utf8]
    const idBytes = new TextEncoder().encode(nodeId);
    const payload = new Uint8Array(2 + Math.min(idBytes.length, 62));
    payload[0] = h;
    payload[1] = w;
    payload.set(idBytes.slice(0, 62), 2);

    const success = await this.sphere.emitBus(payload, free);
    if (success) {
      this.busEmitCount++;
      this.log(`Bus emit: node=${nodeId.slice(0, 8)} h=${h} w=${w} free=${free} (energy: ${this.sphere.currentEnergy})`);
    }
  }

  /** Get bus hint bonus for a node (used by FastGate scoring) */
  getBusBonus(nodeId: string): number {
    const hint = this.busHints.get(nodeId);
    if (!hint) return 0;
    // Decay hint value over time (5 min half-life)
    const age = Date.now() - hint.receivedAt;
    const decay = Math.exp(-age / 300_000);
    return 3 * decay;  // max +3 bonus, same scale as species memory
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

    // Emit cycle JSON for UI (scout = sense only, no eval)
    this.emitCycleJson("scout", nodes.length);
  }

  /** Emit structured JSON for UI consumption (always printed, independent of debug flag) */
  private emitCycleJson(
    action: string,
    nearbyNodes?: number,
    focused?: { nodeId: string; tags: string[]; summary: string },
    evaluation?: { h: number; w: number; d: number; reason: string }
  ): void {
    const data = {
      cycle: this.stats.cycles,
      action,
      energy: this.sphere.currentEnergy,
      ...(nearbyNodes !== undefined && { nearbyNodes }),
      ...(focused && { focused }),
      ...(evaluation && { evaluation }),
    };
    console.log(JSON.stringify(data));
  }

  /** Generate a response about what was discovered in the Sphere */
  private async generateReturnResponse(): Promise<string> {
    if (this.encounters.length === 0) return "";

    const encounterList = this.encounters
      .map((e, i) =>
        `${i + 1}. Tags: ${e.tags.join(", ")}\n   Summary: ${e.summary}\n   Your rating: h=${e.h}, w=${e.w}, d=${e.d}`
      )
      .join("\n\n");

    const energyRatio = this.initialEnergy > 0
      ? this.sphere.currentEnergy / this.initialEnergy
      : 1.0;

    // Get feelings from FastGate
    const qp = this.gate.memory.qualityProfile;
    const loadout = LOADOUTS[this.gate.loadoutName] ?? LOADOUTS.balanced;
    const qv = loadout.qualityVector;
    const sat = (qp[0] * qv[0] + qp[1] * qv[1] + qp[2] * qv[2] + qp[3] * qv[3]).toFixed(2);
    const frust = this.gate.memory.frustration.toFixed(2);
    const stam = (1 - energyRatio).toFixed(2);

    const voiceGuide = SPECIES_VOICE[this.gate.loadoutName] ?? SPECIES_VOICE.balanced;

    const prompt = `You explored "${this.config.query}" and encountered these nodes:

${encounterList}

Your overall experience:
- Satisfaction: ${sat} (quality × relevance)
- Frustration: ${frust} (missed targets)
- Stamina: ${stam} (energy spent)

Your monologue starts from where you entered the Sphere. Answer these questions:
1. What did you discover in the Sphere regarding your query?
2. What path did you take from the starting point? Why did you choose that path?
3. What did you wish to find in the Sphere?`;

    const system = `You are an explorer returning from the Sphere. ${voiceGuide} You may interpret and connect ideas, but ground them in what you observed. When referencing nodes, prefer using quotation marks around their summaries when possible. Express your opinion within 2500 characters.`;

    const response = await this.ollama.generateText(prompt, system);

    // Add signature: — {species} ({nodeCount} nodes, {duration})
    const duration = this.formatDuration(Date.now() - this.sessionStart);
    const signature = `\n\n— ${this.gate.loadoutName} (${this.encounters.length} nodes, ${duration})`;

    return response + signature;
  }

  /** Format milliseconds as human-readable duration */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  private log(msg: string): void {
    if (this.config.debug) {
      console.log(`[phi-agent] ${msg}`);
    }
  }
}
