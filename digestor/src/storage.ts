// ============================================================
// Storage — Backend-agnostic persistence interface
// ============================================================
//
// Fork projects implement this interface to swap storage backend.
// Default: FileStorage (JSONL files) or DbStorage (Turso/libSQL).
//
// Select via STORAGE_BACKEND env var: "file" | "turso"

// ---- Shared types (used by both server.ts and digestor.ts) ----

export interface EvalLogEntry {
  loadout: string;
  model?: string;
  timestamp: number;
  configHash?: string;
  evaluations: Array<{
    nodeId: string;
    h: number;
    w: number;
    d: number;
    tags: string[];
    expression?: number[];
  }>;
}

export interface NarrativeEntry {
  id: string;
  type: string;    // 'return' | 'stream'
  loadout: string;
  model?: string;
  query?: string;
  timestamp: number;
  duration?: number;
  narrative?: string;
  encounters?: unknown[];
  feelings?: Record<string, unknown>;
  broadcast?: unknown[];
  [key: string]: unknown;
}

export interface TrailEntry {
  sessionId?: string;
  loadout: string;
  timestamp: number;
  events: unknown[];
  [key: string]: unknown;
}

export interface GenerationData {
  generation: number;
  timestamp: string;
  sphereHash: string | null;
  inputEvaluations: number;
  survivedEvaluations: number;
  hunger: number;
  halfLifeHours: number;
  sphereSnapshot?: Record<string, unknown>;
  species: Record<string, unknown>;
  global: Record<string, unknown>;
}

export interface EvalStats {
  sessions: number;
  evaluations: number;
  species: Array<{ name: string; evaluations: number }>;
}

// ---- Storage interface ----

export interface Storage {
  readonly backend: string;  // "file" | "turso" | custom

  // -- IO Gateway: Write --
  appendEvaluation(entry: EvalLogEntry): Promise<void>;
  appendNarrative(entry: NarrativeEntry): Promise<void>;
  appendTrail(entry: TrailEntry): Promise<void>;

  // -- IO Gateway: Read --
  listTrails(opts: { limit?: number; loadout?: string }): Promise<{ trails: unknown[]; total: number }>;
  getTrail(sessionId: string): Promise<unknown | null>;
  listNarratives(opts: { limit?: number; loadout?: string; type?: string }): Promise<{ narratives: unknown[]; total: number }>;
  getNarrative(id: string): Promise<unknown | null>;
  getSpeciesProfile(name: string): Promise<unknown | null>;
  getAllSpeciesProfiles(): Promise<string | null>;  // raw JSON string for passthrough
  listGenerations(): Promise<unknown[]>;
  getGeneration(id: number): Promise<unknown | null>;
  getStats(): Promise<EvalStats>;

  // -- Digestor: Read --
  readEvalLog(): Promise<EvalLogEntry[]>;
  readTrailLog(): Promise<TrailEntry[]>;
  nextGeneration(): Promise<number>;
  loadLatestGeneration(): Promise<GenerationData | null>;

  // -- Digestor: Write --
  writeProfile(profile: unknown): Promise<void>;
  saveGeneration(data: GenerationData): Promise<void>;
  truncateEvalLog(entries: EvalLogEntry[]): Promise<void>;

  // -- Lifecycle --
  init(): Promise<void>;   // schema migration, directory creation, etc.
  close(): Promise<void>;  // cleanup connections
}

// ---- Factory ----

export type StorageConfig = {
  dataDir: string;
  evalLog: string;
  narrativeLog: string;
  trailLog: string;
  profileOut: string;
  genDir: string;
  tursoUrl?: string;
  tursoToken?: string;
};

export async function createStorage(config: StorageConfig): Promise<Storage> {
  const backend = process.env.STORAGE_BACKEND ?? "file";

  if (backend === "turso") {
    if (!config.tursoUrl) {
      throw new Error("STORAGE_BACKEND=turso requires TURSO_URL");
    }
    const { DbStorage } = await import("./db-storage.js");
    const storage = new DbStorage(config.tursoUrl, config.tursoToken);
    await storage.init();
    return storage;
  }

  // Default: file
  const { FileStorage } = await import("./file-storage.js");
  const storage = new FileStorage(config);
  await storage.init();
  return storage;
}
