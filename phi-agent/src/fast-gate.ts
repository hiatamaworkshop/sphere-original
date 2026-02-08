// ============================================================
// FastGate — Local decision layer (no phi calls)
// ============================================================
//
// Replaces phi for:
//   - focus target selection (16bit flag + metrics scoring)
//   - move direction (heuristic from eval result)
//   - return decision (satisfaction-based)
//
// phi is ONLY used for evaluate (content understanding).

import type { NearbyNode } from "./sphere-client.js";
import type { WalkMode } from "./sphere-client.js";

// ============================================================
// 16-bit NodeFlag (mirrors renalCore/src/core/types.ts)
// ============================================================

const Flag = {
  Authority:   0x0001,
  Freshness:   0x0002,
  Catalyst:    0x0004,
  Ephemeral:   0x0008,
  Sticky:      0x0010,
  Volatile:    0x0020,
  Hot:         0x0040,
  Frozen:      0x0080,
  Hub:         0x0100,
  Isolated:    0x0200,
  Compressed:  0x4000,
  Candidate:   0x8000,
} as const;

// ============================================================
// SessionMemory — tracks evaluations within a session
// ============================================================

interface EvalRecord {
  nodeId: string;
  h: number;
  w: number;
  d: number;
  tags: string[];
}

export class SessionMemory {
  readonly evals: EvalRecord[] = [];
  private _totalScore = 0;
  private _visitedNodeIds = new Set<string>();

  record(nodeId: string, h: number, w: number, d: number, tags: string[]): void {
    this.evals.push({ nodeId, h, w, d, tags });
    this._totalScore += h;
    this._visitedNodeIds.add(nodeId);
  }

  get totalScore(): number { return this._totalScore; }
  get cycleCount(): number { return this.evals.length; }
  wasVisited(nodeId: string): boolean { return this._visitedNodeIds.has(nodeId); }
}

// ============================================================
// FastGate
// ============================================================

export class FastGate {
  private queryTokens: string[];
  readonly memory = new SessionMemory();

  constructor(query: string) {
    this.queryTokens = query
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(t => t.length >= 2);
  }

  // --- Pick: choose focus target from sense results ---

  pickFocusTarget(nodes: NearbyNode[]): number {
    if (nodes.length === 0) return -1;

    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];

      // Skip: already visited
      if (this.memory.wasVisited(n.id)) continue;

      // Skip: dead nodes (Frozen or Fossil)
      if (n.flags & (Flag.Frozen | Flag.Compressed)) continue;

      let score = 0;

      // --- 16bit flag scoring ---
      if (n.flags & Flag.Hot)        score += 8;
      if (n.flags & Flag.Authority)  score += 5;
      if (n.flags & Flag.Hub)        score += 4;
      if (n.flags & Flag.Freshness)  score += 3;
      if (n.flags & Flag.Sticky)     score += 3;
      if (n.flags & Flag.Candidate)  score += 2;
      if (n.flags & Flag.Catalyst)   score += 2;
      if (n.flags & Flag.Ephemeral)  score -= 3;
      if (n.flags & Flag.Isolated)   score -= 2;
      if (n.flags & Flag.Volatile)   score -= 1;

      // --- Keyword relevance (summary + tags vs query) ---
      const text = (n.summary + " " + (n.tags ?? []).join(" ")).toLowerCase();
      for (const token of this.queryTokens) {
        if (text.includes(token)) score += 10;
      }

      // --- Metrics ---
      score += n.heat * 0.5;
      score += n.weight * 0.3;
      score -= n.distance * 2;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  // --- Move: heuristic based on eval result ---

  computeNextMove(evalH: number): WalkMode {
    if (evalH >= 7) return "deep";
    if (evalH >= 5) return "hot";
    return "explore";
  }

  // --- Return: satisfaction-based ---

  shouldReturn(minCycles: number = 3): boolean {
    const count = this.memory.cycleCount;
    if (count < minCycles) return false;

    const satisfaction = this.memory.totalScore / (count * 10);
    // 0.5→0%, 0.7→40%, 1.0→100%
    const returnProb = Math.max(0, (satisfaction - 0.5) * 2);
    return Math.random() < returnProb;
  }
}
