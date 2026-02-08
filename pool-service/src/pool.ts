// ============================================================
// Pool — FIFO intake queue with scoring pipeline
// ============================================================
//
// Scoring pipeline:
//   Membrane (sanitize + validate) → queue
//   → Scorer A (LLM thermometer, ~15s) → initial metrics
//   → coherence floor check (hard reject)
//   → Weapon scorers (sentinel/curator/scout, 0ms) → weighted average
//   → accept / reject → submit to Sphere

import type {
  PoolEntry,
  PoolVerdict,
  PoolConfig,
  ExperienceCapsule,
  ContributePayload,
  NodeSeed,
} from "./types.js";
import { ScorerA } from "./scorer-a.js";
import { runWeaponScorers } from "./weapon-scorers.js";
import { membrane } from "./membrane.js";

export class Pool {
  private queue: PoolEntry[] = [];
  private scorerA: ScorerA;
  private config: PoolConfig;
  private processing = false;

  constructor(config: PoolConfig) {
    this.config = config;
    this.scorerA = new ScorerA(config.ollamaUrl, config.ollamaModel);
  }

  /** Sanitize + validate, then add to queue. Returns errors if rejected by membrane. */
  ingest(raw: Record<string, unknown>): string[] {
    // Membrane: sanitize + validate + field aliasing before queueing
    const result = membrane(raw);
    if (!result.valid || !result.entry) {
      this.log(`Membrane rejected: ${result.errors.join("; ")}`);
      return result.errors;
    }

    const entry = result.entry;
    if (this.queue.length >= this.config.poolCapacity) {
      this.log(`Pool full (${this.config.poolCapacity}), dropping oldest`);
      this.queue.shift();
    }
    this.queue.push(entry);
    this.log(`Ingested: ${entry.title.slice(0, 60)} (queue: ${this.queue.length})`);
    return [];
  }

  /** Process next entry in queue */
  async processNext(): Promise<PoolVerdict | null> {
    if (this.queue.length === 0 || this.processing) return null;
    this.processing = true;

    const entry = this.queue.shift()!;
    try {
      // Scorer A: LLM thermometer
      const result = await this.scorerA.measure(entry);
      if (!result) {
        this.log(`Scorer A failed for: ${entry.title.slice(0, 40)}`);
        this.processing = false;
        return { entry, thermometer: { authority: 0, novelty: 0, coherence: 0, catalyst: 0 }, weaponScores: [], finalScore: 0, accepted: false, reason: "scorer_a_failed" };
      }

      const { scores, metrics } = result;

      // Coherence floor — hard reject
      if (scores.coherence < this.config.coherenceFloor) {
        this.log(`Rejected (coherence ${scores.coherence.toFixed(2)} < ${this.config.coherenceFloor}): ${entry.title.slice(0, 40)}`);
        this.processing = false;
        return { entry, thermometer: scores, weaponScores: [], finalScore: 0, accepted: false, reason: "coherence_floor" };
      }

      // Weapon scorers: w/d focused, heat de-emphasized (0ms total)
      const weaponResult = runWeaponScorers(metrics);
      this.log(`Weapons: ${weaponResult.scores.map(s => `${s.scorerName}=${s.score.toFixed(1)}(${s.verdict})`).join(", ")} → avg=${weaponResult.weightedAverage.toFixed(1)}`);

      const accepted = weaponResult.accepted;
      const verdict: PoolVerdict = {
        entry,
        thermometer: scores,
        weaponScores: weaponResult.scores,
        finalScore: weaponResult.weightedAverage,
        accepted,
        reason: accepted ? "weapon_passed" : "weapon_rejected",
      };

      this.log(`${accepted ? "ACCEPTED" : "REJECTED"} (weighted avg: ${weaponResult.weightedAverage.toFixed(1)}): ${entry.title.slice(0, 40)}`);

      // Submit to Sphere if accepted
      if (accepted) {
        await this.submitToSphere(entry, metrics.flags);
      }

      this.processing = false;
      return verdict;
    } catch (err) {
      this.processing = false;
      this.log(`Error processing entry: ${err}`);
      return null;
    }
  }

  /** Submit accepted entry to Sphere via contribute endpoint.
   *  Maps standard field names → Sphere NodeSeed format here. */
  private async submitToSphere(entry: PoolEntry, flags: number): Promise<boolean> {
    const seed: NodeSeed = {
      tags: entry.tags,
      summary: entry.title,       // standard → Sphere L2
      content: entry.body,        // standard → Sphere L3
      ref_url: entry.url,         // standard → Sphere L4
      flags,
    };

    const capsule: ExperienceCapsule = {
      schemaVersion: 4,
      topTier: [],
      normalNodes: [seed],
      ghostNodes: [],
      evaluations: [],
      timestamp: Date.now(),
    };

    // Contribute endpoint expects { source, capsule } wrapper
    const payload: ContributePayload = {
      source: "pool-service",
      capsule,
    };

    try {
      const res = await fetch(this.config.sphereUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        this.log(`Sphere submission failed: ${res.status} ${res.statusText}`);
        return false;
      }
      this.log(`Submitted to Sphere: ${entry.title.slice(0, 40)}`);
      return true;
    } catch (err) {
      this.log(`Sphere submission error: ${err}`);
      return false;
    }
  }

  get queueLength(): number { return this.queue.length; }
  get isProcessing(): boolean { return this.processing; }

  private log(msg: string): void {
    if (this.config.debug) {
      console.log(`[pool-service] ${msg}`);
    }
  }
}
