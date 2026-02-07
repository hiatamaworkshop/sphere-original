/**
 * Sphere Project - Map Spatial Field Repository
 *
 * [Implementation] In-memory Map for development
 */
import type { SpatialField } from "@sphere/renal-core";
import type { ISpatialFieldRepository } from "./interfaces.js";
export declare class MapSpatialFieldRepository implements ISpatialFieldRepository {
    private store;
    constructor(store?: Map<string, SpatialField>);
    get(cellId: string): Promise<SpatialField | null>;
    set(cellId: string, field: SpatialField): Promise<void>;
    getAll(): Promise<SpatialField[]>;
    count(): Promise<number>;
    /**
     * Get underlying Map (for RenalCore integration)
     * @deprecated Use repository methods instead
     */
    getInternalMap(): Map<string, SpatialField>;
}
//# sourceMappingURL=map-spatial.repository.d.ts.map