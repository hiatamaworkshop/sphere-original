// ============================================================
// DbStorage — Turso/libSQL storage backend
// ============================================================
//
// Schema follows DB_PERSISTENCE_DESIGN.md
// All vector data (expression, centroid, position) stored as JSON arrays
// (Sphere does its own spatial math — DB is just persistence)

import { createClient, type Client, type InValue } from "@libsql/client";
import type { Storage, EvalLogEntry, NarrativeEntry, TrailEntry, GenerationData, EvalStats } from "./storage.js";

export class DbStorage implements Storage {
  readonly backend = "turso";
  private db: Client;

  constructor(url: string, authToken?: string) {
    this.db = createClient({
      url,
      ...(authToken && { authToken }),
    });
  }

  // ---- Schema migration ----

  async init(): Promise<void> {
    await this.db.executeMultiple(`
      CREATE TABLE IF NOT EXISTS eval_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loadout TEXT NOT NULL,
        model TEXT,
        timestamp INTEGER NOT NULL,
        config_hash TEXT,
        raw_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_eval_loadout ON eval_sessions(loadout);
      CREATE INDEX IF NOT EXISTS idx_eval_ts ON eval_sessions(timestamp);

      CREATE TABLE IF NOT EXISTS evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES eval_sessions(id),
        node_id TEXT NOT NULL,
        h REAL NOT NULL,
        w REAL NOT NULL,
        d REAL NOT NULL,
        tags TEXT,
        expression TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_eval_node ON evaluations(node_id);

      CREATE TABLE IF NOT EXISTS narratives (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        loadout TEXT NOT NULL,
        model TEXT,
        query TEXT,
        timestamp INTEGER NOT NULL,
        duration INTEGER,
        raw_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_narr_loadout ON narratives(loadout);
      CREATE INDEX IF NOT EXISTS idx_narr_ts ON narratives(timestamp);

      CREATE TABLE IF NOT EXISTS trails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        loadout TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        raw_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trail_loadout ON trails(loadout);
      CREATE INDEX IF NOT EXISTS idx_trail_session ON trails(session_id);
      CREATE INDEX IF NOT EXISTS idx_trail_ts ON trails(timestamp);

      CREATE TABLE IF NOT EXISTS species_profiles (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        raw_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS generations (
        generation INTEGER PRIMARY KEY,
        timestamp TEXT NOT NULL,
        sphere_hash TEXT,
        raw_json TEXT NOT NULL
      );
    `);

    console.log(`[storage:turso] Schema initialized`);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // ---- Write operations ----

  async appendEvaluation(entry: EvalLogEntry): Promise<void> {
    const tx = await this.db.transaction("write");
    try {
      const result = await tx.execute({
        sql: "INSERT INTO eval_sessions (loadout, model, timestamp, config_hash, raw_json) VALUES (?, ?, ?, ?, ?)",
        args: [entry.loadout, entry.model ?? null, entry.timestamp, entry.configHash ?? null, JSON.stringify(entry)],
      });
      const sessionId = Number(result.lastInsertRowid ?? 0);
      for (const ev of entry.evaluations) {
        await tx.execute({
          sql: "INSERT INTO evaluations (session_id, node_id, h, w, d, tags, expression) VALUES (?, ?, ?, ?, ?, ?, ?)",
          args: [
            sessionId,
            ev.nodeId,
            ev.h, ev.w, ev.d,
            JSON.stringify(ev.tags),
            ev.expression ? JSON.stringify(ev.expression) : null,
          ],
        });
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async appendNarrative(entry: NarrativeEntry): Promise<void> {
    await this.db.execute({
      sql: "INSERT OR REPLACE INTO narratives (id, type, loadout, model, query, timestamp, duration, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        entry.id,
        entry.type,
        entry.loadout,
        entry.model ?? null,
        entry.query ?? null,
        entry.timestamp,
        entry.duration ?? null,
        JSON.stringify(entry),
      ],
    });
  }

  async appendTrail(entry: TrailEntry): Promise<void> {
    await this.db.execute({
      sql: "INSERT INTO trails (session_id, loadout, timestamp, raw_json) VALUES (?, ?, ?, ?)",
      args: [
        entry.sessionId ?? null,
        entry.loadout,
        entry.timestamp,
        JSON.stringify(entry),
      ],
    });
  }

  // ---- Read operations (IO Gateway) ----

  async listTrails(opts: { limit?: number; loadout?: string }): Promise<{ trails: unknown[]; total: number }> {
    const limit = opts.limit ?? 50;
    let countSql = "SELECT COUNT(*) as cnt FROM trails";
    let listSql = "SELECT raw_json FROM trails";
    const args: unknown[] = [];

    if (opts.loadout) {
      countSql += " WHERE loadout = ?";
      listSql += " WHERE loadout = ?";
      args.push(opts.loadout);
    }
    listSql += " ORDER BY timestamp DESC LIMIT ?";

    const countResult = await this.db.execute({ sql: countSql, args: opts.loadout ? [opts.loadout] : [] });
    const total = Number(countResult.rows[0]?.cnt ?? 0);

    const listResult = await this.db.execute({ sql: listSql, args: [...(opts.loadout ? [opts.loadout] : []), limit] });
    const trails = listResult.rows.map(r => JSON.parse(r.raw_json as string));
    return { trails, total };
  }

  async getTrail(sessionId: string): Promise<unknown | null> {
    const result = await this.db.execute({
      sql: "SELECT raw_json FROM trails WHERE session_id = ? LIMIT 1",
      args: [sessionId],
    });
    if (result.rows.length === 0) return null;
    return JSON.parse(result.rows[0].raw_json as string);
  }

  async listNarratives(opts: { limit?: number; loadout?: string; type?: string }): Promise<{ narratives: unknown[]; total: number }> {
    const limit = opts.limit ?? 50;
    const conditions: string[] = [];
    const args: InValue[] = [];

    if (opts.loadout) { conditions.push("loadout = ?"); args.push(opts.loadout); }
    if (opts.type) { conditions.push("type = ?"); args.push(opts.type); }

    const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

    const countResult = await this.db.execute({ sql: `SELECT COUNT(*) as cnt FROM narratives${where}`, args });
    const total = Number(countResult.rows[0]?.cnt ?? 0);

    const listResult = await this.db.execute({
      sql: `SELECT raw_json FROM narratives${where} ORDER BY timestamp DESC LIMIT ?`,
      args: [...args, limit] as InValue[],
    });
    const narratives = listResult.rows.map(r => JSON.parse(r.raw_json as string));
    return { narratives, total };
  }

  async getNarrative(id: string): Promise<unknown | null> {
    const result = await this.db.execute({
      sql: "SELECT raw_json FROM narratives WHERE id = ? LIMIT 1",
      args: [id],
    });
    if (result.rows.length === 0) return null;
    return JSON.parse(result.rows[0].raw_json as string);
  }

  async getSpeciesProfile(name: string): Promise<unknown | null> {
    const result = await this.db.execute("SELECT raw_json FROM species_profiles WHERE id = 1");
    if (result.rows.length === 0) return null;
    const profile = JSON.parse(result.rows[0].raw_json as string);
    return profile.species?.[name] ?? profile.global ?? null;
  }

  async getAllSpeciesProfiles(): Promise<string | null> {
    const result = await this.db.execute("SELECT raw_json FROM species_profiles WHERE id = 1");
    if (result.rows.length === 0) return null;
    return result.rows[0].raw_json as string;
  }

  async listGenerations(): Promise<unknown[]> {
    const result = await this.db.execute("SELECT raw_json FROM generations ORDER BY generation DESC");
    return result.rows.map(r => JSON.parse(r.raw_json as string));
  }

  async getGeneration(id: number): Promise<unknown | null> {
    const result = await this.db.execute({
      sql: "SELECT raw_json FROM generations WHERE generation = ?",
      args: [id],
    });
    if (result.rows.length === 0) return null;
    return JSON.parse(result.rows[0].raw_json as string);
  }

  async getStats(): Promise<EvalStats> {
    const sessionResult = await this.db.execute("SELECT COUNT(*) as cnt FROM eval_sessions");
    const sessions = Number(sessionResult.rows[0]?.cnt ?? 0);

    const evalResult = await this.db.execute("SELECT COUNT(*) as cnt FROM evaluations");
    const evaluations = Number(evalResult.rows[0]?.cnt ?? 0);

    const speciesResult = await this.db.execute(
      "SELECT es.loadout, COUNT(*) as cnt FROM evaluations e JOIN eval_sessions es ON e.session_id = es.id GROUP BY es.loadout ORDER BY cnt DESC"
    );
    const species = speciesResult.rows.map(r => ({
      name: r.loadout as string,
      evaluations: Number(r.cnt),
    }));

    return { sessions, evaluations, species };
  }

  // ---- Digestor operations ----

  async readEvalLog(): Promise<EvalLogEntry[]> {
    const result = await this.db.execute("SELECT raw_json FROM eval_sessions ORDER BY timestamp ASC");
    return result.rows.map(r => JSON.parse(r.raw_json as string));
  }

  async readTrailLog(): Promise<TrailEntry[]> {
    const result = await this.db.execute("SELECT raw_json FROM trails ORDER BY timestamp ASC");
    return result.rows.map(r => JSON.parse(r.raw_json as string));
  }

  async nextGeneration(): Promise<number> {
    const result = await this.db.execute("SELECT MAX(generation) as max_gen FROM generations");
    const maxGen = result.rows[0]?.max_gen;
    return maxGen ? Number(maxGen) + 1 : 1;
  }

  async loadLatestGeneration(): Promise<GenerationData | null> {
    const result = await this.db.execute("SELECT raw_json FROM generations ORDER BY generation DESC LIMIT 1");
    if (result.rows.length === 0) return null;
    return JSON.parse(result.rows[0].raw_json as string);
  }

  async writeProfile(profile: unknown): Promise<void> {
    await this.db.execute({
      sql: "INSERT OR REPLACE INTO species_profiles (id, raw_json, updated_at) VALUES (1, ?, ?)",
      args: [JSON.stringify(profile), new Date().toISOString()],
    });
  }

  async saveGeneration(data: GenerationData): Promise<void> {
    await this.db.execute({
      sql: "INSERT OR REPLACE INTO generations (generation, timestamp, sphere_hash, raw_json) VALUES (?, ?, ?, ?)",
      args: [data.generation, data.timestamp, data.sphereHash, JSON.stringify(data)],
    });
  }

  async truncateEvalLog(entries: EvalLogEntry[]): Promise<void> {
    const tx = await this.db.transaction("write");
    try {
      // Clear existing data
      await tx.execute("DELETE FROM evaluations");
      await tx.execute("DELETE FROM eval_sessions");

      // Re-insert survived entries
      for (const entry of entries) {
        const result = await tx.execute({
          sql: "INSERT INTO eval_sessions (loadout, model, timestamp, config_hash, raw_json) VALUES (?, ?, ?, ?, ?)",
          args: [entry.loadout, entry.model ?? null, entry.timestamp, entry.configHash ?? null, JSON.stringify(entry)],
        });
        const sessionId = Number(result.lastInsertRowid ?? 0);
        for (const ev of entry.evaluations) {
          await tx.execute({
            sql: "INSERT INTO evaluations (session_id, node_id, h, w, d, tags, expression) VALUES (?, ?, ?, ?, ?, ?, ?)",
            args: [sessionId, ev.nodeId, ev.h, ev.w, ev.d, JSON.stringify(ev.tags), ev.expression ? JSON.stringify(ev.expression) : null],
          });
        }
      }
      await tx.commit();
      console.log(`[storage:turso] eval_sessions truncated → ${entries.length} sessions re-inserted`);
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }
}
