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

import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const LOG_FILE = join(DATA_DIR, "eval-log.jsonl");

// ============================================================
// Types
// ============================================================

export interface EvalLogEntry {
  /** Loadout name (species identifier) */
  loadout: string;
  /** Search query */
  query: string;
  /** Session start timestamp */
  timestamp: number;
  /** Session duration in ms */
  duration: number;
  /** All evaluations from this session */
  evaluations: EvalLogRecord[];
}

export interface EvalLogRecord {
  nodeId: string;
  h: number;
  w: number;
  d: number;
  tags: string[];
}

// ============================================================
// Write
// ============================================================

/**
 * Append a session's evaluations to the log file.
 * Creates data directory if needed.
 */
export function appendEvalLog(entry: EvalLogEntry): void {
  if (entry.evaluations.length === 0) return;  // nothing to log
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(LOG_FILE, line, "utf-8");
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

export function getSpeciesSummary(loadout: string): SpeciesSummary {
  const entries = readEvalLog(loadout);
  const summary: SpeciesSummary = {
    loadout,
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
