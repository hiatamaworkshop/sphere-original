// ============================================================
// Scorer A — LLM Thermometer
// ============================================================
//
// Fixed prompt → 4 scores (JSON). No judgment, no personality.
// LLM is a measurement device: returns {authority, novelty, coherence, catalyst}.
// Threshold decision is dot(scores, intakeWeights) — done externally.

import type { PoolEntry, ThermometerScores, InitialMetrics } from "./types.js";
import { assignFlags } from "./tagger.js";

const THERMOMETER_PROMPT = `You are a content measurement tool. Analyze the following content and return EXACTLY a JSON object with 4 scores, each between 0.0 and 1.0:

- authority: How authoritative is this? (domain expertise, citations, established knowledge)
- novelty: How novel is this? (new information, not redundant)
- coherence: How internally consistent and well-formed is this?
- catalyst: How likely is this to spark connections or further exploration?

Content to measure:
---
Tags: {tags}
Summary: {summary}
Content: {content}
---

Return ONLY a JSON object, no explanation:
{"authority":0.0,"novelty":0.0,"coherence":0.0,"catalyst":0.0}`;

export class ScorerA {
  constructor(
    private ollamaUrl: string,
    private model: string,
  ) {}

  /** Build the fixed measurement prompt */
  buildPrompt(entry: PoolEntry): string {
    return THERMOMETER_PROMPT
      .replace("{tags}", entry.tags.join(", "))
      .replace("{summary}", entry.summary)
      .replace("{content}", entry.content.slice(0, 2000));
  }

  /** Parse LLM response into ThermometerScores */
  parseScores(response: string): ThermometerScores | null {
    // Strip markdown fences
    const cleaned = response.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

    // Extract JSON object with balanced braces
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;

    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1));
      const clamp = (v: unknown): number => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
      };
      return {
        authority: clamp(obj.authority),
        novelty: clamp(obj.novelty),
        coherence: clamp(obj.coherence),
        catalyst: clamp(obj.catalyst),
      };
    } catch {
      return null;
    }
  }

  /** Convert thermometer scores + flags → initial Sphere metrics */
  deriveMetrics(scores: ThermometerScores, flags: number): InitialMetrics {
    // authority + catalyst → heat (how much attention it deserves)
    const heat = Math.round(50 + (scores.authority + scores.catalyst) * 25);
    // authority + novelty → weight (how substantial it is)
    const weight = Math.round(50 + (scores.authority + scores.novelty) * 25);
    // coherence → inverse decay (well-formed content decays slower)
    const decay = Math.round(50 * (1 - scores.coherence));

    // Score-to-flag bridge: augment tagger flags with LLM scores
    let augmentedFlags = flags;
    if (scores.authority > 0.6) augmentedFlags |= 0x0001;  // Authority
    if (scores.catalyst > 0.5)  augmentedFlags |= 0x0002;  // Catalyst
    if (scores.novelty > 0.5)   augmentedFlags |= 0x0004;  // Freshness

    return { heat, weight, decay, flags: augmentedFlags };
  }

  /** Call ollama and return scores (placeholder — actual HTTP call to be wired) */
  async measure(entry: PoolEntry): Promise<{ scores: ThermometerScores; metrics: InitialMetrics } | null> {
    const prompt = this.buildPrompt(entry);
    const response = await this.callOllama(prompt);
    if (!response) return null;

    const scores = this.parseScores(response);
    if (!scores) return null;

    const flags = assignFlags(entry.tags);
    const metrics = this.deriveMetrics(scores, flags);
    return { scores, metrics };
  }

  /** Raw ollama HTTP call */
  private async callOllama(prompt: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: { num_predict: 64, temperature: 0.1 },
        }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { response?: string };
      return data.response ?? null;
    } catch {
      return null;
    }
  }
}
