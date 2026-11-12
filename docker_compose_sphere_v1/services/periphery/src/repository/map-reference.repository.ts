/**
 * Sphere Project - Map Reference Repository
 *
 * [Implementation] In-memory Map for development
 * [Production] Replace with PostgresReferenceRepository
 */

import type { ReferenceRecord } from "@sphere/renal-core";
import type { IReferenceRepository } from "./interfaces.js";

export class MapReferenceRepository implements IReferenceRepository {
  constructor(private store: Map<string, ReferenceRecord> = new Map()) {}

  async get(id: string): Promise<ReferenceRecord | null> {
    return this.store.get(id) ?? null;
  }

  async exists(id: string): Promise<boolean> {
    return this.store.has(id);
  }

  async create(record: ReferenceRecord): Promise<void> {
    if (this.store.has(record.id)) {
      throw new Error(`ReferenceRecord already exists: ${record.id}`);
    }
    this.store.set(record.id, record);
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

    // Update to Amber with new snapshot and optional crystallization
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
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async getAll(): Promise<ReferenceRecord[]> {
    return Array.from(this.store.values());
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  /**
   * Synchronous in-memory store shared with RenalCore / server.
   *
   * [Design] The hot state is the Map itself; RenalCore ticks synchronously over it
   * (NodeStore: size + values()). Persistence is a separate write-through / snapshot
   * concern, not a swap of this store.
   */
  getStore(): Map<string, ReferenceRecord> {
    return this.store;
  }
}
