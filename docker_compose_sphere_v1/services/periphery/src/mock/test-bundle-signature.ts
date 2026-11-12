/**
 * Sanctuary bundle signature regression test (C2)
 *
 * Run: npm run test:bundle   (no server needed)
 */

import assert from "node:assert/strict";
import { BundleLoader, createSanctuaryBundle } from "../sanctuary/index.js";
import type { SanctuaryNode } from "../types/experience-layer.js";

const nodes: SanctuaryNode[] = [
  {
    id: "n1",
    kind: "relic",
    vector: [1, 0, 0],
    payload: { summary: "alpha", tags: ["a"] },
    frozenMetrics: { weight: 1, heat: 0.5 },
  },
  {
    id: "n2",
    kind: "amber",
    vector: [0, 1, 0],
    frozenMetrics: { weight: 2, heat: 0.1 },
  },
];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const loads = (b: unknown, key?: string) =>
  new BundleLoader(key).loadBundle(clone(b) as never);

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// Keep ambient env out of the unkeyed cases
delete process.env.SANCTUARY_BUNDLE_KEY;

const plain = createSanctuaryBundle({ sourceCore: "core-1", nodes, key: "" });
const keyed = createSanctuaryBundle({ sourceCore: "core-1", nodes, key: "k1" });

check("untampered bundle loads (sha256)", () => {
  assert.equal(loads(plain).valid, true);
});

check("untampered bundle loads (hmac)", () => {
  assert.equal(loads(keyed, "k1").valid, true);
});

check("non-empty garbage signature is rejected", () => {
  const b = clone(plain);
  b.signature = "x";
  assert.equal(loads(b).valid, false);
});

check("node content tampering is rejected (same nodeCount)", () => {
  const b = clone(plain);
  b.nodes[0].payload = { summary: "evil" };
  const r = loads(b);
  assert.equal(r.valid, false);
  assert.deepEqual(r.errors, ["Invalid bundle signature"]);
});

check("vector / metric tampering is rejected", () => {
  const b1 = clone(plain);
  b1.nodes[1].vector = [9, 9, 9];
  assert.equal(loads(b1).valid, false);
  const b2 = clone(plain);
  b2.nodes[1].frozenMetrics.weight = 999;
  assert.equal(loads(b2).valid, false);
});

check("frozenAt / sourceCore tampering is rejected", () => {
  const b1 = clone(plain);
  b1.frozenAt += 1;
  assert.equal(loads(b1).valid, false);
  const b2 = clone(plain);
  b2.sourceCore = "core-2";
  assert.equal(loads(b2).valid, false);
});

check("key order in nodes does not matter", () => {
  const b = clone(plain);
  b.nodes = b.nodes.map((n) =>
    Object.fromEntries(Object.entries(n).reverse()),
  ) as SanctuaryNode[];
  assert.equal(loads(b).valid, true);
});

check("hmac bundle rejects wrong key and missing key", () => {
  assert.equal(loads(keyed, "other").valid, false);
  assert.equal(loads(keyed, "").valid, false);
});

check("hmac bundle cannot be forged by recomputing sha256", () => {
  const forged = clone(plain); // sha256 signature, valid without a key
  assert.equal(loads(forged, "k1").valid, false);
});

check("key falls back to SANCTUARY_BUNDLE_KEY env", () => {
  process.env.SANCTUARY_BUNDLE_KEY = "k1";
  try {
    assert.equal(loads(keyed).valid, true);
    assert.equal(
      createSanctuaryBundle({ sourceCore: "core-1", nodes }).signature.length,
      64,
    );
  } finally {
    delete process.env.SANCTUARY_BUNDLE_KEY;
  }
});

console.log(`\n${passed} checks passed`);
