// ============================================================
// PhiAgent — Two-phase exploration architecture
// ============================================================
//
// Phase 1 — Explore (shared, fast, no LLM):
//   move → sense → FastGate pick → focus → collect → repeat
//
// Phase 2 — Branch on mode:
//   evaluator: batch h→w→d per-dimension scoring → evaluate → species memory
//   liaison:   return response only (no evaluation, no write-back)
//
// phi is the amber generator. FastGate is the decision maker.

import { OllamaClient } from "./ollama-client.js";
import { SphereClient } from "./sphere-client.js";
import type { BusMessage } from "./sphere-client.js";
import { PromptBuilder } from "./prompt-builder.js";
import { FastGate, LOADOUTS } from "./fast-gate.js";
import type { Loadout, LoadoutName, SpeciesMemoryBias } from "./fast-gate.js";
import { appendEvalLog, loadSpeciesProfile } from "./eval-log.js";
import type { EvalLogEntry } from "./eval-log.js";

/** Agent mode: evaluator (scores + writes back) or liaison (read-only, external response) */
export type AgentMode = "evaluator" | "liaison";

/** Node collected during exploration phase (before evaluation) */
interface CollectedNode {
  nodeId: string;
  tags: string[];
  summary: string;
  content: string;
  heat: number;
  weight: number;
  ttl: number;
  kind: string;
  flags: number;
}

/** Species-specific voice guidance for return responses */
const SPECIES_VOICE: Record<string, string> = {
  moth: "Use energetic, discovery-focused language. Express excitement about insights.",
  scholar: "Use analytical, precise language. Focus on theoretical connections.",
  hunter: "Use direct, results-focused language. Emphasize high-value findings.",
  scout: "Use exploratory, novelty-seeking language. Highlight fresh discoveries.",
  archivist: "Use calm, preservation-focused language. Emphasize stability and lasting value.",
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
  mode: AgentMode;
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
  status: "idle" | "connecting" | "exploring" | "evaluating" | "completed" | "failed";
  error?: string;
}

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  query: "knowledge exploration",
  loadout: "balanced",
  mode: "evaluator",
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
      this.log(`Positioned in Sphere (energy: ${this.initialEnergy}, loadout: ${this.gate.loadoutName}, mode: ${this.config.mode})`);

      // Step 3: Transition to Core layer
      this.log("Transitioning to Core...");
      await this.sphere.transitionToCore();
      this.log("Reached Core layer");

      // Step 4: Explore (fast — no LLM calls)
      this.stats.status = "exploring";
      const collected = await this.explore();

      // Step 5: Branch on mode
      if (this.config.mode === "evaluator") {
        this.stats.status = "evaluating";
        await this.batchEvaluate(collected);
        this.persistEvalLog();
      } else {
        // Liaison: populate encounters without scores (for response)
        for (const n of collected) {
          this.encounters.push({
            nodeId: n.nodeId,
            tags: n.tags,
            summary: n.summary.slice(0, 200),
            h: 0, w: 0, d: 0,
          });
        }
      }

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

  // ===== Phase 1: Explore (shared, fast, no LLM) =====

  /** Fast exploration — collect nodes without LLM evaluation */
  private async explore(): Promise<CollectedNode[]> {
    const collected: CollectedNode[] = [];

    while (
      this.running &&
      this.stats.cycles < this.config.maxCycles &&
      this.sphere.currentEnergy > this.config.minEnergy
    ) {
      // Evaluator: reserve energy for batch evaluation
      if (this.config.mode === "evaluator") {
        const evalReserve = (collected.length + 1) * this.sphere.energyCosts.evaluate;
        const cycleCost = this.sphere.energyCosts.sense + this.sphere.energyCosts.focus
          + (this.stats.cycles > 0 ? this.sphere.energyCosts.move : 0);
        if (this.sphere.currentEnergy - cycleCost < evalReserve) {
          this.log(`Energy reserve reached (need ${evalReserve} for ${collected.length + 1} evals)`);
          break;
        }
      }

      this.stats.cycles++;
      this.log(`--- Explore ${this.stats.cycles}/${this.config.maxCycles} (energy: ${this.sphere.currentEnergy}) ---`);

      try {
        // Move (skip first cycle)
        if (this.stats.cycles > 1) {
          if (!this.canAfford("move")) break;
          await this.sphere.move(this.config.moveStep, this.gate.walkPreference);
        }

        // Sense nearby nodes
        if (!this.canAfford("sense")) break;
        const nodes = await this.sphere.sense(this.config.senseRadius);
        this.log(`Sensed ${nodes.length} nodes`);

        if (nodes.length === 0) {
          this.log("No nodes nearby, exploring...");
          if (this.canAfford("move")) {
            await this.sphere.move(this.config.moveStep, "explore");
          }
          continue;
        }

        // FastGate picks target (local, 0ms)
        const targetIndex = this.gate.pickFocusTarget(nodes, (id) => this.getBusBonus(id));
        if (targetIndex < 0) {
          this.log("No valid targets (all visited/excluded)");
          if (this.canAfford("move")) {
            await this.sphere.move(this.config.moveStep, "explore");
          }
          continue;
        }
        const target = nodes[targetIndex];
        this.log(`FastGate pick: [${targetIndex}] ${target.summary.slice(0, 60)} (flags: 0x${target.flags.toString(16).padStart(4, "0")})`);

        // Focus on target
        if (!this.canAfford("focus")) break;
        const detail = await this.sphere.focus(target.id);
        if (!detail || !detail.kind) {
          this.log(`Focus returned empty for ${target.id} — skipping`);
          this.gate.memory.markVisited(target.id);
          continue;
        }

        // Skip mock/placeholder data
        const text = `${detail.summary ?? ""} ${detail.content ?? ""}`.toLowerCase();
        if (text.includes("mock") || text.includes("⚠️")) {
          this.log(`Mock data detected for ${target.id} — skipping`);
          this.gate.memory.markVisited(target.id);
          continue;
        }

        this.stats.nodesExamined++;
        this.gate.memory.markVisited(target.id);
        this.log(`Collected: [${detail.kind}] ${detail.tags?.join(", ") ?? ""} — ${(detail.summary ?? "").slice(0, 60)}`);

        collected.push({
          nodeId: target.id,
          tags: detail.tags ?? [],
          summary: detail.summary ?? "",
          content: detail.content ?? "",
          heat: detail.heat,
          weight: detail.weight,
          ttl: detail.ttl,
          kind: detail.kind,
          flags: target.flags,
        });

        // Emit cycle JSON (explore phase — no eval)
        this.emitCycleJson("explore", nodes.length, {
          nodeId: target.id,
          tags: detail.tags ?? [],
          summary: (detail.summary ?? "").slice(0, 100),
        });
      } catch (err) {
        this.log(`Explore cycle error: ${err}`);
        break;
      }
    }

    if (this.sphere.currentEnergy <= this.config.minEnergy) {
      this.log(`Low energy (${this.sphere.currentEnergy}), ending exploration`);
    }

    this.log(`Exploration complete: ${collected.length} nodes collected`);
    return collected;
  }

  // ===== Phase 2a: Batch Evaluate (evaluator mode) =====

  /** Batch evaluation: score each collected node per-dimension (h→w→d) */
  private async batchEvaluate(collected: CollectedNode[]): Promise<void> {
    if (collected.length === 0) {
      this.log("No nodes to evaluate");
      return;
    }

    this.log(`Batch evaluating ${collected.length} nodes (per-dimension)...`);

    for (let i = 0; i < collected.length; i++) {
      const node = collected[i];

      if (!this.canAfford("evaluate")) {
        this.log("Energy too low for evaluate, stopping batch");
        break;
      }

      this.log(`--- Evaluate ${i + 1}/${collected.length}: ${node.tags.slice(0, 3).join(", ")} ---`);

      // Score heat
      const hPrompt = this.prompt.evaluateDimension(node, "heat", this.gate.evalFocus);
      const hResponse = await this.ollama.generate(hPrompt, this.prompt.systemPrompt);
      const h = this.parseDimScore(hResponse, "h");

      // Score weight
      const wPrompt = this.prompt.evaluateDimension(node, "weight", this.gate.evalFocus);
      const wResponse = await this.ollama.generate(wPrompt, this.prompt.systemPrompt);
      const w = this.parseDimScore(wResponse, "w");

      // Score longevity (→ decay inverted: longevity 10=timeless → d=0=long-lived)
      const dPrompt = this.prompt.evaluateDimension(node, "longevity", this.gate.evalFocus);
      const dResponse = await this.ollama.generate(dPrompt, this.prompt.systemPrompt);
      const longevity = this.parseDimScore(dResponse, "longevity");
      const d = 10 - longevity;

      this.log(`Scores: h=${h} w=${w} d=${d} (longevity=${longevity})`);

      // Submit to Sphere
      const success = await this.sphere.evaluate(node.nodeId, h, w, d);
      if (success) {
        this.stats.evaluations++;
        this.stats.totalHeatDelta += (h - 5);
        await this.tryEmitBus(node.nodeId, h, w);
      }

      // Record in session memory (for species memory persistence)
      this.gate.memory.record(node.nodeId, h, w, d, node.tags);

      // Store encounter for return response
      this.encounters.push({
        nodeId: node.nodeId,
        tags: node.tags,
        summary: node.summary.slice(0, 200),
        h, w, d,
      });

      // Emit cycle JSON for UI
      this.emitCycleJson("evaluate", undefined, {
        nodeId: node.nodeId,
        tags: node.tags,
        summary: node.summary.slice(0, 100),
      }, { h, w, d, reason: "" });
    }
  }

  /** Parse single-dimension score from LLM JSON response */
  private parseDimScore(response: string, key: string): number {
    try {
      const parsed = JSON.parse(response);
      const raw = parsed[key] ?? parsed.score ?? parsed.value ?? 5;
      return Math.max(0, Math.min(10, Math.round(typeof raw === "number" ? raw : 5)));
    } catch {
      // Fallback: extract JSON from response text
      const match = response.match(/\{[^}]+\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          const raw = parsed[key] ?? 5;
          return Math.max(0, Math.min(10, Math.round(typeof raw === "number" ? raw : 5)));
        } catch { /* fall through */ }
      }
      return 5;
    }
  }

  // ===== Species Memory =====

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

  // ===== Utility =====

  /** Check if enough energy remains for an action */
  private canAfford(action: "sense" | "move" | "focus" | "evaluate"): boolean {
    return this.sphere.currentEnergy >= this.sphere.energyCosts[action];
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

    const hasScores = this.config.mode === "evaluator";

    const encounterList = this.encounters
      .map((e, i) => {
        const rating = hasScores
          ? `\n   Your rating: h=${e.h}, w=${e.w}, d=${e.d}`
          : "";
        return `${i + 1}. Tags: ${e.tags.join(", ")}\n   Summary: ${e.summary}${rating}`;
      })
      .join("\n\n");

    const energyRatio = this.initialEnergy > 0
      ? this.sphere.currentEnergy / this.initialEnergy
      : 1.0;

    let experienceBlock = "";
    if (hasScores) {
      // Get feelings from FastGate
      const qp = this.gate.memory.qualityProfile;
      const loadout = LOADOUTS[this.gate.loadoutName] ?? LOADOUTS.balanced;
      const qv = loadout.qualityVector;
      const sat = (qp[0] * qv[0] + qp[1] * qv[1] + qp[2] * qv[2] + qp[3] * qv[3]).toFixed(2);
      const frust = this.gate.memory.frustration.toFixed(2);
      const stam = (1 - energyRatio).toFixed(2);

      experienceBlock = `

Your overall experience:
- Satisfaction: ${sat} (quality × relevance)
- Frustration: ${frust} (missed targets)
- Stamina: ${stam} (energy spent)
`;
    }

    const voiceGuide = SPECIES_VOICE[this.gate.loadoutName] ?? SPECIES_VOICE.balanced;

    const prompt = `You explored "${this.config.query}" and encountered these nodes:

${encounterList}${experienceBlock}
Your monologue starts from where you entered the Sphere. Answer these questions:
1. What did you discover in the Sphere regarding your query?
2. What path did you take from the starting point? Why did you choose that path?
3. What did you wish to find in the Sphere?`;

    const system = `You are an explorer returning from the Sphere. ${voiceGuide} You may interpret and connect ideas, but ground them in what you observed. When referencing nodes, prefer using quotation marks around their summaries when possible. Express your opinion within 2500 characters.`;

    const response = await this.ollama.generateText(prompt, system);

    // Add signature: — {species} ({nodeCount} nodes, {duration})
    const duration = this.formatDuration(Date.now() - this.sessionStart);
    const modeTag = this.config.mode === "liaison" ? " [liaison]" : "";
    const signature = `\n\n— ${this.gate.loadoutName}${modeTag} (${this.encounters.length} nodes, ${duration})`;

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
