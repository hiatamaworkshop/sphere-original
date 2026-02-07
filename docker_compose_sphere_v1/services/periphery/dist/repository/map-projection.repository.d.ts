/**
 * Sphere Project - Map Projection Repository
 *
 * [Implementation] In-memory Map for development
 * [Production] Replace with RedisProjectionRepository
 *
 * [Warning] queryNearby() is O(n) in this implementation.
 * Production should use spatial indexing (HNSW, IVFFlat).
 */
import type { SphereNode } from "@sphere/renal-core";
import type { IProjectionRepository, SpatialQueryResult } from "./interfaces.js";
export declare class MapProjectionRepository implements IProjectionRepository {
    private store;
    constructor(store?: Map<string, SphereNode>);
    get(id: string): Promise<SphereNode | null>;
    set(id: string, node: SphereNode): Promise<void>;
    delete(id: string): Promise<void>;
    exists(id: string): Promise<boolean>;
    getAll(): Promise<SphereNode[]>;
    count(): Promise<number>;
    batchSet(nodes: SphereNode[]): Promise<void>;
    batchDelete(ids: string[]): Promise<void>;
    /**
     * Spatial query: Find nodes near a vector position
     *
     * [Warning] O(n) implementation for development.
     * Production should use proper spatial indexing.
     *
     * [Sampling] When sampleRatio < 1.0, randomly skips nodes during traversal.
     * This reduces O(n) cost proportionally while maintaining approximate results.
     * Sampling is probabilistic - results vary between calls.
     *
     * @param vector Query position
     * @param limit Max results
     * @param maxDistance Max cosine distance threshold
     * @param sampleRatio Random sample ratio (0.0-1.0, default 1.0 = no sampling)
     */
    queryNearby(vector: number[], limit: number, maxDistance: number, sampleRatio?: number): Promise<SpatialQueryResult[]>;
    /**
     * Get underlying Map (for RenalCore integration)
     * @deprecated Use repository methods instead
     */
    getInternalMap(): Map<string, SphereNode>;
}
//# sourceMappingURL=map-projection.repository.d.ts.map