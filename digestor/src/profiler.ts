// ============================================================
// Profiler — species aggregation + environmental blend
// ============================================================
//
// Step 2 of Digestor: aggregate survived evaluations per species.
// Each species entry is pre-blended: 0.7 × own + 0.3 × global.
// phi-agent reads the profile and uses it directly (no re-blending).

import type { ScoredEval } from "./scoring.js";

// ---- Types ----

export interface NodeCount {
  nodeId: string;
  count: number;
}

export interface SpeciesEntry {
  evaluations: number;
  avgH: number;
  avgW: number;
  avgD: number;
  hotNodes: NodeCount[];
  commonTags: string[];
}

export interface SpeciesProfile {
  generated: string;
  totalEvaluations: number;
  survivedEvaluations: number;
  species: Record<string, SpeciesEntry>;
  global: SpeciesEntry;
}

// ---- Blend constants ----

const SELF_W = 0.7;
const ENV_W = 0.3;

// ---- Aggregation ----

function aggregateGroup(evals: ScoredEval[]): SpeciesEntry {
  if (evals.length === 0) {
    return { evaluations: 0, avgH: 0, avgW: 0, avgD: 0, hotNodes: [], commonTags: [] };
  }

  let totalH = 0, totalW = 0, totalD = 0;
  const nodeCount = new Map<string, number>();
  const tagCount = new Map<string, number>();

  for (const e of evals) {
    totalH += e.h;
    totalW += e.w;
    totalD += e.d;
    nodeCount.set(e.nodeId, (nodeCount.get(e.nodeId) ?? 0) + 1);
    for (const tag of e.tags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }

  const n = evals.length;

  const hotNodes = [...nodeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nodeId, count]) => ({ nodeId, count }));

  const commonTags = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag]) => tag);

  return {
    evaluations: n,
    avgH: totalH / n,
    avgW: totalW / n,
    avgD: totalD / n,
    hotNodes,
    commonTags,
  };
}

// ---- Environmental blend ----

function blendEntry(species: SpeciesEntry, global: SpeciesEntry): SpeciesEntry {
  // Blend hotNodes: merge visit counts with weighted ratio
  const blendedNodes = new Map<string, number>();
  for (const n of species.hotNodes) {
    blendedNodes.set(n.nodeId, (blendedNodes.get(n.nodeId) ?? 0) + n.count * SELF_W);
  }
  for (const n of global.hotNodes) {
    blendedNodes.set(n.nodeId, (blendedNodes.get(n.nodeId) ?? 0) + n.count * ENV_W);
  }

  // Blend tags: merge with weighted ratio
  const blendedTagMap = new Map<string, number>();
  for (const tag of species.commonTags) {
    blendedTagMap.set(tag, (blendedTagMap.get(tag) ?? 0) + SELF_W);
  }
  for (const tag of global.commonTags) {
    blendedTagMap.set(tag, (blendedTagMap.get(tag) ?? 0) + ENV_W);
  }

  const hotNodes = [...blendedNodes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nodeId, count]) => ({ nodeId, count }));

  const commonTags = [...blendedTagMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag]) => tag);

  return {
    evaluations: species.evaluations,
    avgH: species.avgH * SELF_W + global.avgH * ENV_W,
    avgW: species.avgW * SELF_W + global.avgW * ENV_W,
    avgD: species.avgD * SELF_W + global.avgD * ENV_W,
    hotNodes,
    commonTags,
  };
}

// ---- Profile builder ----

export function buildProfile(survived: ScoredEval[], totalEvaluations: number): SpeciesProfile {
  // Group by loadout
  const groups = new Map<string, ScoredEval[]>();
  for (const e of survived) {
    const group = groups.get(e.loadout) ?? [];
    group.push(e);
    groups.set(e.loadout, group);
  }

  // Global aggregation (all species combined)
  const global = aggregateGroup(survived);

  // Per-species aggregation with environmental blend
  const species: Record<string, SpeciesEntry> = {};
  for (const [loadout, evals] of groups) {
    const raw = aggregateGroup(evals);
    species[loadout] = blendEntry(raw, global);
  }

  return {
    generated: new Date().toISOString(),
    totalEvaluations,
    survivedEvaluations: survived.length,
    species,
    global,
  };
}
