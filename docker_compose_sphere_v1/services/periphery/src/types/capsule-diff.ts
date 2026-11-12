/**
 * Sphere Project - Capsule Divergence (AutoCapsule vs proposed capsule)
 *
 * [Role] Compare what the server saw (AutoCapsule + recorded evaluations)
 *        with what the agent claims in a submitted ExperienceCapsule.
 * [Principle] 真実はサーバーにある — the agent's capsule is a claim, the log is the truth.
 * [Scope] Per session only. No agent identity, nothing persisted.
 *
 * Pure functions: no I/O, no clock, no config. The capsule is untrusted wire data
 * (Gatekeeper has not seen it yet), so every field is read defensively.
 */

import type { AutoCapsule } from "./auto-capsule.js";
import type { ExperienceCapsule, NodeEvaluation, NodeSeed } from "./capsule.js";

export interface CapsuleDivergence {
  seeds: {
    /** Seeds in topTier + normalNodes + ghostNodes */
    total: number;
    /** Seeds that name a sourceNodeId (derivation origin) */
    withSource: number;
    /** ...of which the agent never focused during the session */
    unvisitedSource: number;
  };
  evaluations: {
    /** Evaluations in the proposed capsule */
    claimed: number;
    /** Evaluations the server recorded in the session */
    recorded: number;
    /** Claimed, and identical (h, w, d) to the server's record */
    matched: number;
    /** Claimed for a node the server recorded, with different h/w/d */
    altered: number;
    /** Claimed for a node the server has no evaluation record of */
    unwitnessed: number;
  };
  /**
   * 0..1. Share of checkable claims that agree with the server
   * (matched evaluations + seeds whose source was visited). 1 when nothing is checkable.
   */
  consistency: number;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function sourceOf(seed: unknown): string | undefined {
  const s = (seed as NodeSeed | null | undefined)?.sourceNodeId;
  return typeof s === "string" && s !== "" ? s : undefined;
}

function seedsOf(proposed: ExperienceCapsule): NodeSeed[] {
  return [
    ...asArray<NodeSeed>(proposed.topTier),
    ...asArray<NodeSeed>(proposed.normalNodes),
    ...asArray<NodeSeed>(proposed.ghostNodes),
  ];
}

function visitedIds(auto: AutoCapsule): Set<string> {
  return new Set(auto.visits.map((v) => v.nodeId));
}

/**
 * Compare server truth with the agent's proposed capsule.
 *
 * @param auto     AutoCapsule built from the action log
 * @param recorded Evaluations the server recorded in the session buffer
 * @param proposed Capsule the agent submitted
 */
export function compareCapsules(
  auto: AutoCapsule,
  recorded: readonly NodeEvaluation[],
  proposed: ExperienceCapsule,
): CapsuleDivergence {
  const visited = visitedIds(auto);
  const truth = new Map(recorded.map((e) => [e.nodeId, e]));

  const seeds = seedsOf(proposed);
  let withSource = 0;
  let unvisitedSource = 0;
  for (const seed of seeds) {
    const src = sourceOf(seed);
    if (src === undefined) continue;
    withSource++;
    if (!visited.has(src)) unvisitedSource++;
  }

  const claimed = asArray<NodeEvaluation>(proposed.evaluations);
  let matched = 0;
  let altered = 0;
  let unwitnessed = 0;
  for (const ev of claimed) {
    const t = ev && typeof ev.nodeId === "string" ? truth.get(ev.nodeId) : undefined;
    if (!t) unwitnessed++;
    else if (t.h === ev.h && t.w === ev.w && t.d === ev.d) matched++;
    else altered++;
  }

  const checkable = withSource + claimed.length;
  const agreeing = withSource - unvisitedSource + matched;

  return {
    seeds: { total: seeds.length, withSource, unvisitedSource },
    evaluations: { claimed: claimed.length, recorded: recorded.length, matched, altered, unwitnessed },
    consistency: checkable === 0 ? 1 : agreeing / checkable,
  };
}

export interface DemotionResult {
  capsule: ExperienceCapsule;
  /** Seeds moved to ghostNodes */
  demoted: number;
  /** Seeds that did not fit in ghostNodes and were left out */
  dropped: number;
}

/**
 * Move seeds that claim an unvisited sourceNodeId to the ghost tier.
 *
 * A seed claiming derivation from a node the agent never focused has a lineage the
 * server cannot confirm, so it enters as a volatile ghost, not as a top/normal node.
 * Seeds without sourceNodeId, or with a visited one, are untouched.
 *
 * @param ghostCapacity ghostNodes limit (from the capsule schema). Seeds beyond it
 *                      are dropped, so demotion never turns into a Gatekeeper rejection
 *                      of the whole capsule. Omit for no limit.
 */
export function demoteUnvisitedSeeds(
  auto: AutoCapsule,
  proposed: ExperienceCapsule,
  ghostCapacity?: number,
): DemotionResult {
  const visited = visitedIds(auto);
  const unconfirmed = (s: NodeSeed): boolean => {
    const src = sourceOf(s);
    return src !== undefined && !visited.has(src);
  };

  const top = asArray<NodeSeed>(proposed.topTier);
  const normal = asArray<NodeSeed>(proposed.normalNodes);
  const ghost = asArray<NodeSeed>(proposed.ghostNodes);

  const moving = [...top, ...normal].filter(unconfirmed);
  if (moving.length === 0) return { capsule: proposed, demoted: 0, dropped: 0 };

  // Ghosts that were already unconfirmed stay where they are (already lowest tier).
  const room = ghostCapacity === undefined ? Infinity : Math.max(0, ghostCapacity - ghost.length);
  const accepted = moving.slice(0, room);

  return {
    capsule: {
      ...proposed,
      topTier: top.filter((s) => !unconfirmed(s)),
      normalNodes: normal.filter((s) => !unconfirmed(s)),
      ghostNodes: [...ghost, ...accepted],
    },
    demoted: accepted.length,
    dropped: moving.length - accepted.length,
  };
}
