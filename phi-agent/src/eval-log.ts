// ============================================================
// EvalLog — Species memory persistence (JSONL)
// ============================================================
//
// One JSON line per session. Each line contains all evaluations
// from a single agent session, tagged with loadout name.
//
// File: phi-agent/data/eval-log.jsonl
//
// [Stigmergy]
//   Agent individuals don't have personal memory.
//   Species (loadout) accumulates collective evaluation history.
//   Next scholar reads what past scholars evaluated.
//   "Identity is not what you have — it's what you remember."
//
// [IO Gateway]
//   When DIGESTOR_URL is set, uses HTTP to communicate with
//   Digestor's IO Gateway instead of direct file I/O.
//   File mode is preserved as fallback for backward compatibility.

import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const LOG_FILE = join(DATA_DIR, "eval-log.jsonl");
const DIGESTOR_URL = process.env.DIGESTOR_URL; // e.g. "http://digestor:5000"

// ============================================================
// Types
// ============================================================

export interface EvalLogEntry {
  /** Loadout name (species identifier) */
  loadout: string;
  /** LLM model used (sensory organ) — optional for backward compat */
  model?: string;
  /** Search query */
  query: string;
  /** Session start timestamp */
  timestamp: number;
  /** Session duration in ms */
  duration: number;
  /** All evaluations from this session */
  evaluations: EvalLogRecord[];
  /** ActiveBus activity (optional — absent in older entries) */
  busEmits?: number;
  busRecvs?: number;
  /** Agent config hash for reproducibility (loadout+model+evalFocus) */
  configHash?: string;
}

export interface EvalLogRecord {
  nodeId: string;
  h: number;
  w: number;
  d: number;
  tags: string[];
  expression?: number[];
}

// ============================================================
// Write
// ============================================================

/**
 * Append a session's evaluations to the log.
 * HTTP mode (DIGESTOR_URL): POST to IO Gateway.
 * File mode (fallback): direct append to eval-log.jsonl.
 */
export async function appendEvalLog(entry: EvalLogEntry): Promise<void> {
  if (entry.evaluations.length === 0) return;  // nothing to log

  if (DIGESTOR_URL) {
    const res = await fetch(`${DIGESTOR_URL}/evaluations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      throw new Error(`IO Gateway POST failed: ${res.status} ${await res.text()}`);
    }
    return;
  }

  // File mode (legacy)
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(LOG_FILE, line, "utf-8");
}

// ============================================================
// Narrative Log — agent monologue persistence
// ============================================================

const NARRATIVE_FILE = join(DATA_DIR, "narrative-log.jsonl");

export interface NarrativeEntry {
  /** "return" (session-end narrative) or "stream" (real-time fragment) */
  type: "return" | "stream";
  /** Loadout name */
  loadout: string;
  /** LLM model used */
  model?: string;
  /** Search query */
  query: string;
  /** Assigned by server (or locally for file mode) */
  id?: string;
  /** Epoch ms */
  timestamp: number;
  /** Session duration in ms (return type only) */
  duration?: number;
  /** LLM-generated narrative text */
  narrative: string;
  /** Nodes encountered during session */
  encounters?: Array<{
    nodeId: string;
    tags: string[];
    summary: string;
    h: number;
    w: number;
    d: number;
    flags?: number;
  }>;
  /** Agent feelings at return time */
  feelings?: {
    satisfaction: number;
    frustration: number;
    stamina: number;
  };
  /** Deterministic broadcast posts (observation projection) */
  broadcast?: string[];
}

/**
 * Persist a narrative entry.
 * HTTP mode (DIGESTOR_URL): POST to IO Gateway.
 * File mode (fallback): direct append to narrative-log.jsonl.
 */
export async function appendNarrative(entry: NarrativeEntry): Promise<void> {
  if (!entry.narrative) return;

  if (DIGESTOR_URL) {
    const res = await fetch(`${DIGESTOR_URL}/narratives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      throw new Error(`IO Gateway POST /narratives failed: ${res.status} ${await res.text()}`);
    }
    return;
  }

  // File mode (legacy)
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!entry.id) entry.id = `${entry.timestamp}-${entry.loadout}`;
  appendFileSync(NARRATIVE_FILE, JSON.stringify(entry) + "\n", "utf-8");
}

// ============================================================
// Trail Log — exploration trajectory persistence
// ============================================================
//
// Trail = agent's souvenir from the Sphere.
// Sphere computes it (ActionLog), agent carries it out (vestibule),
// agent posts it to Digestor (same pattern as eval-log / narrative).

const TRAIL_FILE = join(DATA_DIR, "trail-log.jsonl");

export interface TrailEntry {
  /** Session identifier (from Sphere) */
  sessionId: string;
  /** Loadout name (attached by agent — Sphere doesn't know) */
  loadout: string;
  /** LLM model used */
  model?: string;
  /** Cross-session agent identifier */
  agentId?: string;
  /** Which sphere was dived into */
  sphereId?: string;
  /** Epoch ms (session start) */
  timestamp: number;
  /** Session duration in ms */
  duration: number;
  /** Initial query text */
  initialQuery?: string;
  /** Final embedding position */
  lastPosition?: number[];
  /** Raw action events (focus events contain positionSnapshot + h/w/d for waypoints) */
  events: Array<{
    type: string;
    timestamp: number;
    nodeId?: string;
    positionSnapshot?: number[];
    heat?: number;
    weight?: number;
    decay?: number;
  }>;
}

/**
 * Persist a trail entry (agent's exploration trajectory).
 * HTTP mode (DIGESTOR_URL): POST to IO Gateway.
 * File mode (fallback): direct append to trail-log.jsonl.
 */
export async function appendTrail(entry: TrailEntry): Promise<void> {
  if (!entry.events || entry.events.length === 0) return;

  if (DIGESTOR_URL) {
    const res = await fetch(`${DIGESTOR_URL}/trails`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      throw new Error(`IO Gateway POST /trails failed: ${res.status} ${await res.text()}`);
    }
    return;
  }

  // File mode (legacy)
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  appendFileSync(TRAIL_FILE, JSON.stringify(entry) + "\n", "utf-8");
}

// ============================================================
// Read — Species memory queries
// ============================================================

/**
 * Load all log entries, optionally filtered by loadout.
 */
export function readEvalLog(loadout?: string): EvalLogEntry[] {
  if (!existsSync(LOG_FILE)) return [];
  const raw = readFileSync(LOG_FILE, "utf-8");
  const entries: EvalLogEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as EvalLogEntry;
      if (!loadout || entry.loadout === loadout) {
        entries.push(entry);
      }
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

/**
 * Species memory summary: aggregate stats for a loadout.
 */
export interface SpeciesSummary {
  loadout: string;
  sessions: number;
  totalEvals: number;
  avgH: number;
  avgW: number;
  avgD: number;
  /** Most frequently evaluated node IDs (top 5) */
  hotNodes: Array<{ nodeId: string; count: number }>;
  /** Most common tags across evaluations */
  commonTags: Array<{ tag: string; count: number }>;
}

export function getSpeciesSummary(loadout?: string): SpeciesSummary {
  const entries = readEvalLog(loadout);
  const summary: SpeciesSummary = {
    loadout: loadout ?? "(all)",
    sessions: entries.length,
    totalEvals: 0,
    avgH: 0,
    avgW: 0,
    avgD: 0,
    hotNodes: [],
    commonTags: [],
  };

  if (entries.length === 0) return summary;

  let totalH = 0, totalW = 0, totalD = 0;
  const nodeCount = new Map<string, number>();
  const tagCount = new Map<string, number>();

  for (const entry of entries) {
    for (const ev of entry.evaluations) {
      summary.totalEvals++;
      totalH += ev.h;
      totalW += ev.w;
      totalD += ev.d;
      nodeCount.set(ev.nodeId, (nodeCount.get(ev.nodeId) ?? 0) + 1);
      for (const tag of ev.tags) {
        tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
      }
    }
  }

  if (summary.totalEvals > 0) {
    summary.avgH = totalH / summary.totalEvals;
    summary.avgW = totalW / summary.totalEvals;
    summary.avgD = totalD / summary.totalEvals;
  }

  // Top 5 hot nodes
  summary.hotNodes = [...nodeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nodeId, count]) => ({ nodeId, count }));

  // Top 10 common tags
  summary.commonTags = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  return summary;
}

// ============================================================
// Species Profile — Digestor output (replaces direct eval-log reads)
// ============================================================

const PROFILE_FILE = join(DATA_DIR, "species-profile.json");

interface ProfileNodeCount {
  nodeId: string;
  count: number;
}

interface ProfileWeightDelta {
  flagBias: Record<string, number>;
  returnWeights: [number, number, number, number];
  qualityVector: [number, number, number, number];
}

interface ProfileSpeciesEntry {
  evaluations: number;
  avgH: number;
  avgW: number;
  avgD: number;
  hotNodes: ProfileNodeCount[];
  commonTags: string[];
  weightDelta?: ProfileWeightDelta;
}

interface ProfileData {
  generated: string;
  totalEvaluations: number;
  survivedEvaluations: number;
  species: Record<string, ProfileSpeciesEntry>;
  global: ProfileSpeciesEntry;
}

export interface SpeciesProfileBias {
  hotNodeIds: Map<string, number>;
  tags: string[];
  sessions: number;
  /** Learned weight delta from Digestor (Phase 2) */
  weightDelta?: ProfileWeightDelta;
}

/**
 * Load species bias from Digestor.
 * HTTP mode (DIGESTOR_URL): GET from IO Gateway.
 * File mode (fallback): read species-profile.json directly.
 * Pre-blended (0.7 own + 0.3 global) by the Digestor.
 * Returns undefined if profile doesn't exist or loadout not found.
 */
export async function loadSpeciesProfile(loadout: string): Promise<SpeciesProfileBias | undefined> {
  if (DIGESTOR_URL) {
    try {
      const res = await fetch(`${DIGESTOR_URL}/species/${encodeURIComponent(loadout)}/profile`);
      if (!res.ok) return undefined;
      const entry = await res.json() as ProfileSpeciesEntry;
      if (!entry || entry.evaluations === 0) return undefined;
      const hotNodeIds = new Map<string, number>();
      for (const n of entry.hotNodes ?? []) {
        hotNodeIds.set(n.nodeId, n.count);
      }
      return { hotNodeIds, tags: entry.commonTags ?? [], sessions: entry.evaluations, weightDelta: entry.weightDelta };
    } catch {
      return undefined;
    }
  }

  // File mode (legacy)
  if (!existsSync(PROFILE_FILE)) return undefined;
  try {
    const raw = readFileSync(PROFILE_FILE, "utf-8");
    const profile: ProfileData = JSON.parse(raw);
    const entry = profile.species?.[loadout] ?? profile.global;
    if (!entry || entry.evaluations === 0) return undefined;

    const hotNodeIds = new Map<string, number>();
    for (const n of entry.hotNodes ?? []) {
      hotNodeIds.set(n.nodeId, n.count);
    }

    return {
      hotNodeIds,
      tags: entry.commonTags ?? [],
      sessions: entry.evaluations,
      weightDelta: entry.weightDelta,
    };
  } catch {
    return undefined;
  }
}
