/**
 * Capsule divergence regression test (C1)
 *
 * Run: npm run test:capsule-diff   (no server needed)
 */

import assert from "node:assert/strict";
import { compareCapsules, demoteUnvisitedSeeds } from "../types/capsule-diff.js";
import type { AutoCapsule } from "../types/auto-capsule.js";
import type { ExperienceCapsule, NodeSeed } from "../types/capsule.js";

const auto: AutoCapsule = {
  sessionId: "s1",
  duration: 1000,
  visits: [
    { nodeId: "A", kind: "active", stayTime: 100, focusCount: 1, heatDelta: 0 },
    { nodeId: "B", kind: "amber", stayTime: 100, focusCount: 1, heatDelta: 0 },
  ],
  summaryMetrics: { totalFocus: 2, uniqueNodes: 2, totalStayTime: 200, maxHeatTouched: 1 },
};

const recorded = [
  { nodeId: "A", h: 7, w: 6, d: 5 },
  { nodeId: "B", h: 3, w: 5, d: 5 },
];

const seed = (summary: string, sourceNodeId?: string): NodeSeed => ({
  tags: ["t"],
  summary,
  flags: 0,
  ...(sourceNodeId !== undefined && { sourceNodeId }),
});

const capsule = (p: Partial<ExperienceCapsule>): ExperienceCapsule => ({
  schemaVersion: 4,
  topTier: [],
  normalNodes: [],
  ghostNodes: [],
  evaluations: [],
  timestamp: 1,
  ...p,
});

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

check("faithful capsule is fully consistent and untouched", () => {
  const c = capsule({
    topTier: [seed("a", "A")],
    normalNodes: [seed("b", "B"), seed("no-source")],
    evaluations: [{ nodeId: "A", h: 7, w: 6, d: 5 }],
  });
  const d = compareCapsules(auto, recorded, c);
  assert.deepEqual(d.seeds, { total: 3, withSource: 2, unvisitedSource: 0 });
  assert.deepEqual(d.evaluations, { claimed: 1, recorded: 2, matched: 1, altered: 0, unwitnessed: 0 });
  assert.equal(d.consistency, 1);
  const r = demoteUnvisitedSeeds(auto, c);
  assert.equal(r.capsule, c, "returns the same object when nothing moves");
  assert.equal(r.demoted, 0);
});

check("empty capsule is consistent (nothing checkable)", () => {
  assert.equal(compareCapsules(auto, recorded, capsule({})).consistency, 1);
});

check("evaluations: matched / altered / unwitnessed are told apart", () => {
  const d = compareCapsules(
    auto,
    recorded,
    capsule({
      evaluations: [
        { nodeId: "A", h: 7, w: 6, d: 5 }, // matched
        { nodeId: "B", h: 10, w: 5, d: 5 }, // altered
        { nodeId: "Z", h: 5, w: 5, d: 5 }, // never evaluated in session
      ],
    }),
  );
  assert.deepEqual(d.evaluations, { claimed: 3, recorded: 2, matched: 1, altered: 1, unwitnessed: 1 });
  assert.equal(d.consistency, 1 / 3);
});

check("seed with unvisited sourceNodeId lowers consistency", () => {
  const d = compareCapsules(auto, recorded, capsule({ topTier: [seed("x", "Z"), seed("y", "A")] }));
  assert.deepEqual(d.seeds, { total: 2, withSource: 2, unvisitedSource: 1 });
  assert.equal(d.consistency, 0.5);
});

check("unvisited seeds move to ghost; visited and source-less stay", () => {
  const c = capsule({
    topTier: [seed("top-bad", "Z"), seed("top-ok", "A")],
    normalNodes: [seed("norm-bad", "Y"), seed("norm-none")],
    ghostNodes: [seed("ghost-old")],
  });
  const r = demoteUnvisitedSeeds(auto, c);
  assert.deepEqual(r.capsule.topTier.map((s) => s.summary), ["top-ok"]);
  assert.deepEqual(r.capsule.normalNodes.map((s) => s.summary), ["norm-none"]);
  assert.deepEqual(r.capsule.ghostNodes.map((s) => s.summary), ["ghost-old", "top-bad", "norm-bad"]);
  assert.equal(r.demoted, 2);
  assert.equal(r.dropped, 0);
  assert.equal(c.topTier.length, 2, "input is not mutated");
});

check("ghost capacity: overflow is dropped, never exceeds the limit", () => {
  const c = capsule({
    topTier: [seed("a", "Z"), seed("b", "Z")],
    normalNodes: [seed("c", "Z")],
    ghostNodes: [seed("g1")],
  });
  const r = demoteUnvisitedSeeds(auto, c, 3);
  assert.equal(r.capsule.ghostNodes.length, 3);
  assert.equal(r.demoted, 2);
  assert.equal(r.dropped, 1);
});

check("ghost already full: unconfirmed seeds are dropped", () => {
  const c = capsule({ topTier: [seed("a", "Z")], ghostNodes: [seed("g1"), seed("g2")] });
  const r = demoteUnvisitedSeeds(auto, c, 2);
  assert.equal(r.capsule.ghostNodes.length, 2);
  assert.equal(r.capsule.topTier.length, 0);
  assert.equal(r.dropped, 1);
});

check("malformed wire data does not throw", () => {
  const bad = { schemaVersion: 4, timestamp: 1 } as unknown as ExperienceCapsule;
  assert.equal(compareCapsules(auto, recorded, bad).consistency, 1);
  assert.equal(demoteUnvisitedSeeds(auto, bad).demoted, 0);
  const bad2 = capsule({
    topTier: [null as unknown as NodeSeed],
    evaluations: [null as unknown as never, { nodeId: 1 as unknown as string, h: 5, w: 5, d: 5 }],
  });
  const d = compareCapsules(auto, recorded, bad2);
  assert.equal(d.evaluations.unwitnessed, 2);
});

console.log(`\n${passed} checks passed`);
