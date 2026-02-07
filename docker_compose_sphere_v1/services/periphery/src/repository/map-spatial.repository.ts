/**
 * Sphere Project - Map Spatial Field Repository
 *
 * [Implementation] In-memory Map for development
 */

import type { SpatialField } from "@sphere/renal-core";
import type { ISpatialFieldRepository } from "./interfaces.js";

export class MapSpatialFieldRepository implements ISpatialFieldRepository {
  constructor(private store: Map<string, SpatialField> = new Map()) {}

  async get(cellId: string): Promise<SpatialField | null> {
    return this.store.get(cellId) ?? null;
  }

  async set(cellId: string, field: SpatialField): Promise<void> {
    this.store.set(cellId, field);
  }

  async getAll(): Promise<SpatialField[]> {
    return Array.from(this.store.values());
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  /**
   * Get underlying Map (for RenalCore integration)
   * @deprecated Use repository methods instead
   */
  getInternalMap(): Map<string, SpatialField> {
    return this.store;
  }
}
