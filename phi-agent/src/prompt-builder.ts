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
- EVALUATE: Rate a node's relevance (heat 0-10, weight 0-10, decay 0-10)
- MOVE: Navigate the space (modes: random, hot, fresh, deep, explore)

Your goal: Find and evaluate knowledge relevant to your query. High-heat nodes are important and actively used. High-weight nodes are established and authoritative. Nodes naturally decay over time — your evaluations shape what survives.

Respond ONLY with valid JSON. No explanations, no markdown.`;

export class PromptBuilder {
  private query: string;

  constructor(query: string) {
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

  evaluateNode(node: NodeDetail): string {
    return `My query: "${this.query}"

I focused on this node:
- Tags: ${node.tags.join(", ")}
- Summary: ${node.summary}
- Content: ${node.content.slice(0, 500)}
- Current heat: ${node.heat}, weight: ${node.weight}
- Kind: ${node.kind}

Rate this node's value:
- h (heat 0-10): How actively useful is this? 5=neutral, 8+=very relevant, 2-=irrelevant
- w (weight 0-10): How authoritative/established? 5=neutral
- d (decay 0-10): How fast should it age? 5=normal, 3=preserve, 8=let it fade

Respond: { "action": "evaluate", "h": <number>, "w": <number>, "d": <number>, "reason": "<brief>" }`;
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
  // Try to extract JSON from response (phi may add commentary)
  const jsonMatch = response.match(/\{[^}]+\}/);
  if (!jsonMatch) {
    return { action: "skip", reason: "No JSON found in response" };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as AgentAction;

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
