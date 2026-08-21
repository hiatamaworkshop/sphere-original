/**
 * Sphere Project - Turso Reference Repository
 *
 * [Pattern] Write-Through: In-memory Map (RenalCore互換) + Turso (永続化)
 *
 * Design:
 *   - Runtime reads: Map (fast, O(1))
 *   - Runtime writes: Map + Turso (同期書き込み)
 *   - Startup: Turso → Map (復元)
 *
 * [Principle] スフィアエンジンはインメモリのまま。
 * DB はバックアップ・リストア・永続化の役割のみ。
 *
 * [Fork] フォークプロジェクトは IReferenceRepository を実装して差し替え可能。
 */

import { createClient, type Client } from "@libsql/client";
import type { ReferenceRecord } from "@sphere/renal-core";
import type { IReferenceRepository } from "./interfaces.js";

export class TursoReferenceRepository implements IReferenceRepository {
  private store: Map<string, ReferenceRecord> = new Map();
  private db: Client;
  private ready = false;

  constructor(url: string, authToken?: string) {
    this.db = createClient({
      url,
      ...(authToken && { authToken }),
    });
  }

  /** Schema + restore from Turso → Map */
  async init(): Promise<void> {
    // Create table
    await this.db.executeMultiple(`
      CREATE TABLE IF NOT EXISTS reference_records (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        raw_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ref_kind ON reference_records(kind);
      CREATE INDEX IF NOT EXISTS idx_ref_ts ON reference_records(timestamp);
    `);

    // Restore into memory
    const result = await this.db.execute("SELECT raw_json FROM reference_records");
    for (const row of result.rows) {
      const record = JSON.parse(row.raw_json as string) as ReferenceRecord;
      this.store.set(record.id, record);
    }

    this.ready = true;
    console.log(`[refdb:turso] Initialized — ${this.store.size} records restored`);
  }

  // ---- Read operations (from Map — fast) ----

  async get(id: string): Promise<ReferenceRecord | null> {
    return this.store.get(id) ?? null;
  }

  async exists(id: string): Promise<boolean> {
    return this.store.has(id);
  }

  async getAll(): Promise<ReferenceRecord[]> {
    return Array.from(this.store.values());
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  // ---- Write operations (Map + Turso) ----

  async create(record: ReferenceRecord): Promise<void> {
    if (this.store.has(record.id)) {
      throw new Error(`ReferenceRecord already exists: ${record.id}`);
    }
    // Map (immediate)
    this.store.set(record.id, record);
    // Turso (persistent)
    await this.db.execute({
      sql: `INSERT INTO reference_records (id, timestamp, kind, payload, snapshot, raw_json)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        record.id,
        record.timestamp,
        record.kind,
        JSON.stringify(record.payload),
        JSON.stringify(record.snapshot),
        JSON.stringify(record),
      ],
    });
  }

  async markAsAmber(
    id: string,
    snapshot: ReferenceRecord["snapshot"],
    crystallization?: ReferenceRecord["payload"]["crystallization"]
  ): Promise<void> {
    const record = this.store.get(id);
    if (!record) {
      throw new Error(`ReferenceRecord not found: ${id}`);
    }
    // Update in Map
    const updated: ReferenceRecord = {
      ...record,
      kind: "amber",
      snapshot,
      payload: {
        ...record.payload,
        ...(crystallization && { crystallization }),
      },
    };
    this.store.set(id, updated);
    // Update in Turso
    await this.db.execute({
      sql: `UPDATE reference_records
            SET kind = 'amber', snapshot = ?, payload = ?, raw_json = ?
            WHERE id = ?`,
      args: [
        JSON.stringify(updated.snapshot),
        JSON.stringify(updated.payload),
        JSON.stringify(updated),
        id,
      ],
    });
  }

  async delete(id: string): Promise<void> {
    // Map
    this.store.delete(id);
    // Turso
    await this.db.execute({
      sql: "DELETE FROM reference_records WHERE id = ?",
      args: [id],
    });
  }

  // ---- RenalCore 互換 ----

  /**
   * Get underlying Map (for RenalCore integration)
   * @deprecated Use repository methods instead
   */
  getInternalMap(): Map<string, ReferenceRecord> {
    return this.store;
  }

  /** Close Turso connection */
  close(): void {
    this.db.close();
  }
}
