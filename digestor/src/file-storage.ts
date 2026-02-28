// ============================================================
// FileStorage — JSONL/JSON file-based storage (original backend)
// ============================================================

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Storage, StorageConfig, EvalLogEntry, NarrativeEntry, TrailEntry, GenerationData, EvalStats } from "./storage.js";

export class FileStorage implements Storage {
  readonly backend = "file";

  private evalLog: string;
  private narrativeLog: string;
  private trailLog: string;
  private profileOut: string;
  private genDir: string;

  constructor(config: StorageConfig) {
    this.evalLog = config.evalLog;
    this.narrativeLog = config.narrativeLog;
    this.trailLog = config.trailLog;
    this.profileOut = config.profileOut;
    this.genDir = config.genDir;
  }

  async init(): Promise<void> {
    // Ensure data directories exist
    for (const file of [this.evalLog, this.narrativeLog, this.trailLog]) {
      const dir = join(file, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.genDir)) mkdirSync(this.genDir, { recursive: true });
    console.log(`[storage:file] Initialized (data dir ready)`);
  }

  async close(): Promise<void> { /* no-op for files */ }

  // ---- Write operations ----

  async appendEvaluation(entry: EvalLogEntry): Promise<void> {
    appendFileSync(this.evalLog, JSON.stringify(entry) + "\n", "utf-8");
  }

  async appendNarrative(entry: NarrativeEntry): Promise<void> {
    appendFileSync(this.narrativeLog, JSON.stringify(entry) + "\n", "utf-8");
  }

  async appendTrail(entry: TrailEntry): Promise<void> {
    appendFileSync(this.trailLog, JSON.stringify(entry) + "\n", "utf-8");
  }

  // ---- Read operations (IO Gateway) ----

  async listTrails(opts: { limit?: number; loadout?: string }): Promise<{ trails: unknown[]; total: number }> {
    if (!existsSync(this.trailLog)) return { trails: [], total: 0 };
    const raw = readFileSync(this.trailLog, "utf-8");
    const all: unknown[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (opts.loadout && entry.loadout !== opts.loadout) continue;
        all.push(entry);
      } catch { /* skip */ }
    }
    all.reverse();
    const limit = opts.limit ?? 50;
    return { trails: all.slice(0, limit), total: all.length };
  }

  async getTrail(sessionId: string): Promise<unknown | null> {
    if (!existsSync(this.trailLog)) return null;
    const raw = readFileSync(this.trailLog, "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.sessionId === sessionId) return entry;
      } catch { /* skip */ }
    }
    return null;
  }

  async listNarratives(opts: { limit?: number; loadout?: string; type?: string }): Promise<{ narratives: unknown[]; total: number }> {
    if (!existsSync(this.narrativeLog)) return { narratives: [], total: 0 };
    const raw = readFileSync(this.narrativeLog, "utf-8");
    const all: unknown[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (opts.loadout && entry.loadout !== opts.loadout) continue;
        if (opts.type && entry.type !== opts.type) continue;
        all.push(entry);
      } catch { /* skip */ }
    }
    all.reverse();
    const limit = opts.limit ?? 50;
    return { narratives: all.slice(0, limit), total: all.length };
  }

  async getNarrative(id: string): Promise<unknown | null> {
    if (!existsSync(this.narrativeLog)) return null;
    const raw = readFileSync(this.narrativeLog, "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.id === id) return entry;
      } catch { /* skip */ }
    }
    return null;
  }

  async getSpeciesProfile(name: string): Promise<unknown | null> {
    if (!existsSync(this.profileOut)) return null;
    const profile = JSON.parse(readFileSync(this.profileOut, "utf-8"));
    return profile.species?.[name] ?? profile.global ?? null;
  }

  async getAllSpeciesProfiles(): Promise<string | null> {
    if (!existsSync(this.profileOut)) return null;
    return readFileSync(this.profileOut, "utf-8");
  }

  async listGenerations(): Promise<unknown[]> {
    if (!existsSync(this.genDir)) return [];
    const files = readdirSync(this.genDir)
      .filter(f => /^gen-\d+\.json$/.test(f))
      .sort()
      .reverse();
    return files.map(f => {
      try { return JSON.parse(readFileSync(join(this.genDir, f), "utf-8")); }
      catch { return null; }
    }).filter(Boolean);
  }

  async getGeneration(id: number): Promise<unknown | null> {
    const padded = String(id).padStart(3, "0");
    const file = join(this.genDir, `gen-${padded}.json`);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf-8"));
  }

  async getStats(): Promise<EvalStats> {
    if (!existsSync(this.evalLog)) return { sessions: 0, evaluations: 0, species: [] };
    const raw = readFileSync(this.evalLog, "utf-8");
    let sessions = 0;
    let evaluations = 0;
    const speciesCount = new Map<string, number>();
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        sessions++;
        const n = Array.isArray(entry.evaluations) ? entry.evaluations.length : 0;
        evaluations += n;
        speciesCount.set(entry.loadout, (speciesCount.get(entry.loadout) ?? 0) + n);
      } catch { /* skip */ }
    }
    const species = [...speciesCount.entries()]
      .map(([name, count]) => ({ name, evaluations: count }))
      .sort((a, b) => b.evaluations - a.evaluations);
    return { sessions, evaluations, species };
  }

  // ---- Digestor operations ----

  async readEvalLog(): Promise<EvalLogEntry[]> {
    if (!existsSync(this.evalLog)) return [];
    const raw = readFileSync(this.evalLog, "utf-8");
    const entries: EvalLogEntry[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try { entries.push(JSON.parse(line)); }
      catch { /* skip malformed */ }
    }
    return entries;
  }

  async readTrailLog(): Promise<TrailEntry[]> {
    if (!existsSync(this.trailLog)) return [];
    const raw = readFileSync(this.trailLog, "utf-8");
    const trails: TrailEntry[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try { trails.push(JSON.parse(line)); }
      catch { /* skip malformed */ }
    }
    return trails;
  }

  async nextGeneration(): Promise<number> {
    if (!existsSync(this.genDir)) return 1;
    const files = readdirSync(this.genDir).filter(f => /^gen-\d+\.json$/.test(f));
    if (files.length === 0) return 1;
    const nums = files.map(f => parseInt(f.match(/gen-(\d+)\.json/)![1], 10));
    return Math.max(...nums) + 1;
  }

  async loadLatestGeneration(): Promise<GenerationData | null> {
    if (!existsSync(this.genDir)) return null;
    const files = readdirSync(this.genDir).filter(f => /^gen-\d+\.json$/.test(f));
    if (files.length === 0) return null;
    const nums = files.map(f => parseInt(f.match(/gen-(\d+)\.json/)![1], 10));
    const latest = Math.max(...nums);
    const padded = String(latest).padStart(3, "0");
    try {
      return JSON.parse(readFileSync(join(this.genDir, `gen-${padded}.json`), "utf-8"));
    } catch {
      return null;
    }
  }

  async writeProfile(profile: unknown): Promise<void> {
    writeFileSync(this.profileOut, JSON.stringify(profile, null, 2), "utf-8");
  }

  async saveGeneration(data: GenerationData): Promise<void> {
    if (!existsSync(this.genDir)) mkdirSync(this.genDir, { recursive: true });
    const padded = String(data.generation).padStart(3, "0");
    writeFileSync(join(this.genDir, `gen-${padded}.json`), JSON.stringify(data, null, 2), "utf-8");
  }

  async truncateEvalLog(entries: EvalLogEntry[]): Promise<void> {
    const lines = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
    const tmpFile = this.evalLog + ".tmp";
    writeFileSync(tmpFile, lines, "utf-8");
    renameSync(tmpFile, this.evalLog);
  }
}
