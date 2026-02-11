// ============================================================
// PromptBuilder — Translates Sphere observations into phi prompts
// ============================================================
//
// Sphere → phi direction:
//   sense results (nodes[]) → "Here are nearby nodes, which should I focus on?"
//   focus result (nodeDetail) → "Here is the full content, how should I evaluate it?"
//   post-evaluate → "Where should I move next?"

import type { NearbyNode, NodeDetail, WalkMode } from "./sphere-client.js";

// System prompt that establishes phi's role as a Sphere agent
const SYSTEM_PROMPT = `You are an autonomous agent exploring a knowledge Sphere — a living semantic space where information nodes metabolize, decay, and evolve based on attention.

Your capabilities:
- SENSE: Perceive nearby nodes (tags + summary + heat/weight metrics)
- FOCUS: Inspect a node's full content (L3/L4 access)
- EVALUATE: Rate a node's value (h, w, d scores)
- MOVE: Navigate the space (modes: random, hot, fresh, deep, explore)

Your goal: Find and evaluate knowledge relevant to your query. High-heat nodes are important and actively used. High-weight nodes are established and authoritative. Nodes naturally decay over time — your evaluations shape what survives.

Respond ONLY with valid JSON. No explanations, no markdown.`;

export class PromptBuilder {
  private query: string;

  constructor(query: string, _modelName: string = "") {
    this.query = query;
  }

  get systemPrompt(): string {
    return SYSTEM_PROMPT;
  }

  chooseFocusTarget(nodes: NearbyNode[]): string {
    const nodeList = nodes.map((n, i) => ({
      index: i,
      id: n.id,
      summary: n.summary.slice(0, 100),
      heat: n.heat,
      weight: n.weight,
      distance: n.distance,
    }));

    return `My query: "${this.query}"

Nearby nodes:
${JSON.stringify(nodeList, null, 2)}

Which node should I focus on to learn more? Consider relevance to my query, heat, and weight.
Respond: { "action": "focus", "index": <number>, "reason": "<brief>" }
If none are relevant: { "action": "move", "mode": "<walkmode>", "reason": "<brief>" }`;
  }

  evaluateNode(node: NodeDetail, evalFocus?: string): string {
    const tags = node.tags?.join(", ") ?? "(none)";
    const summary = node.summary ?? "(no summary)";
    const content = node.content?.slice(0, 500) ?? "(no content)";

    const perspective = evalFocus
      ? `\nPerspective: ${evalFocus}`
      : "";

    return `My query: "${this.query}"

I focused on this node:
- Tags: ${tags}
- Summary: ${summary}
- Content: ${content}
- Current heat: ${node.heat}, weight: ${node.weight}
- Kind: ${node.kind}
${perspective}
Rate this node (0-10 each):
{ "h": <heat/activity>, "w": <weight/authority>, "d": <decay/ephemeral>, "reason": "<brief>" }`;
  }

  /**
   * Per-dimension evaluation prompt — used in batch scoring mode.
   * Each dimension gets its own LLM call for focused, accurate scoring.
   */
  evaluateDimension(
    node: { tags: string[]; summary: string; content: string; heat: number; weight: number; kind: string },
    dimension: "heat" | "weight" | "longevity",
    _evalFocus?: string,
  ): string {
    const tags = node.tags?.join(", ") || "(none)";
    const content = node.content?.slice(0, 500) || "(no content)";

    const dimInfo: Record<string, { scale: string; key: string }> = {
      heat:      { scale: "motion/attention (0=dormant, 5=steady, 10=viral)", key: "h" },
      weight:    { scale: "density/authority (0=superficial, 5=moderate, 10=authoritative)", key: "w" },
      longevity: { scale: "relevance duration (0=ephemeral, 5=months, 10=timeless)", key: "longevity" },
    };

    const { scale, key } = dimInfo[dimension];

    return `My query: "${this.query}"

Node: ${tags} — ${node.summary}
Content: ${content}

Rate ${dimension.toUpperCase()} (0-10): ${scale}

{"${key}": <0-10>, "reason": "<brief>"}`;
  }

  chooseNextMove(): string {
    return `My query: "${this.query}"

I just finished evaluating a node. Where should I move next?
- "hot": toward high-activity areas
- "fresh": toward recently created content
- "deep": toward established, high-weight content
- "explore": toward sparse, unvisited areas
- "random": drift freely

Respond: { "action": "move", "mode": "<walkmode>", "reason": "<brief>" }`;
  }
}

// ============================================================
// ActionParser — Extracts structured actions from phi responses
// ============================================================

export interface AgentAction {
  action: "focus" | "evaluate" | "move" | "skip";
  index?: number;
  h?: number;
  w?: number;
  d?: number;
  mode?: WalkMode;
  reason?: string;
}

export function parseAction(response: string): AgentAction {
  // Strip markdown code blocks (```json ... ```)
  let cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "");

  // Try to extract JSON from response (phi may add commentary)
  // Strategy 1: Find balanced braces (handles nested { } in reason field)
  let jsonStr = extractBalancedJson(cleaned);

  // Strategy 2: Fallback to simple regex (legacy)
  if (!jsonStr) {
    const jsonMatch = cleaned.match(/\{[^}]+\}/);
    jsonStr = jsonMatch?.[0] ?? null;
  }

  if (!jsonStr) {
    return { action: "skip", reason: "No JSON found in response" };
  }

  try {
    const parsed = JSON.parse(jsonStr) as AgentAction;

    // Normalize action aliases (lightweight models may use synonyms)
    const actionAliases: Record<string, AgentAction["action"]> = {
      rate: "evaluate", score: "evaluate", assess: "evaluate", judge: "evaluate",
      select: "focus", choose: "focus", inspect: "focus",
      walk: "move", go: "move", navigate: "move",
    };
    if (actionAliases[parsed.action]) {
      parsed.action = actionAliases[parsed.action];
    }

    // Fallback: JSON has no "action" key but contains score-like fields → infer evaluate
    // Handles: {"h":8,"w":7,"d":5}, {"heat":8,"weight":7}, {"longevity":8}, {"score":9,"reason":"..."}
    if (!parsed.action) {
      const raw = parsed as unknown as Record<string, unknown>;
      const h = raw.h ?? raw.heat ?? raw.score ?? raw.relevance;
      const w = raw.w ?? raw.weight ?? raw.authority;
      const d = raw.d ?? raw.decay;
      const longevity = raw.longevity;
      if (h !== undefined || w !== undefined) {
        parsed.action = "evaluate";
        parsed.h = typeof h === "number" ? h : undefined;
        parsed.w = typeof w === "number" ? w : undefined;
        // longevity → decay conversion (longevity: 0=ephemeral, 10=timeless → decay: 10=ephemeral, 0=timeless)
        if (typeof longevity === "number") {
          parsed.d = 10 - longevity;
        } else {
          parsed.d = typeof d === "number" ? d : undefined;
        }
        parsed.reason = (raw.reason as string) ?? "Inferred from keyless JSON";
      }
    }

    // Validate action type
    if (!["focus", "evaluate", "move", "skip"].includes(parsed.action)) {
      return { action: "skip", reason: `Unknown action: ${parsed.action}` };
    }

    // Clamp evaluation scores
    if (parsed.action === "evaluate") {
      parsed.h = clamp(parsed.h ?? 5, 0, 10);
      parsed.w = clamp(parsed.w ?? 5, 0, 10);
      parsed.d = clamp(parsed.d ?? 5, 0, 10);
    }

    // Validate walk mode
    if (parsed.action === "move") {
      const validModes: WalkMode[] = ["random", "hot", "fresh", "deep", "explore", "flow"];
      if (!parsed.mode || !validModes.includes(parsed.mode)) {
        parsed.mode = "random";
      }
    }

    return parsed;
  } catch {
    return { action: "skip", reason: "Failed to parse JSON" };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/**
 * Extract JSON with balanced braces from response
 * Handles nested { } in reason field: {"reason": "Text {with} braces"}
 */
function extractBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") depth++;
      if (char === "}") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}
