/**
 * Sphere Project - Repository Interfaces
 *
 * [Pattern] Repository Pattern for DB abstraction
 * [Principle] Loose coupling - Bookkeeper depends on interfaces, not implementations
 *
 * Implementations:
 * - MapXxxRepository: In-memory (development)
 * - RedisProjectionRepository: Redis (production ProjDB)
 * - PostgresReferenceRepository: PostgreSQL + pgvector (production RefDB)
 */
import type { SphereNode, ReferenceRecord, SpatialField } from "@sphere/renal-core";
/**
 * Reference Repository Interface (RefDB = "Soul" / "History Book")
 *
 * [Principle 1] Single Source of Truth
 * [Principle 5] Immutable except on Amber ascension
 */
export interface IReferenceRepository {
    /**
     * Get a reference record by ID
     */
    get(id: string): Promise<ReferenceRecord | null>;
    /**
     * Check if a record exists (for deduplication)
     */
    exists(id: string): Promise<boolean>;
    /**
     * Create a new reference record (initial incarnation)
     * @throws if record already exists
     */
    create(record: ReferenceRecord): Promise<void>;
    /**
     * Update record on Amber ascension only
     * [Principle 5] Only called when node ascends to Amber
     */
    markAsAmber(id: string, snapshot: ReferenceRecord["snapshot"], crystallization?: ReferenceRecord["payload"]["crystallization"]): Promise<void>;
    /**
     * Delete a reference record (crystallization absorption)
     * [Design] Called when nodes are absorbed during amber crystallization
     */
    delete(id: string): Promise<void>;
    /**
     * Get all records (for recovery/debugging)
     */
    getAll(): Promise<ReferenceRecord[]>;
    /**
     * Get record count
     */
    count(): Promise<number>;
}
/**
 * Spatial query result
 */
export interface SpatialQueryResult {
    node: SphereNode;
    distance: number;
}
/**
 * Projection Repository Interface (ProjDB = "Body" / "Current City")
 *
 * [Principle 5] Mutable - heat, metrics updated by metabolism
 */
export interface IProjectionRepository {
    /**
     * Get a node by ID
     */
    get(id: string): Promise<SphereNode | null>;
    /**
     * Set/update a node (projection or metabolism update)
     */
    set(id: string, node: SphereNode): Promise<void>;
    /**
     * Delete a node (evaporation)
     */
    delete(id: string): Promise<void>;
    /**
     * Check if node exists
     */
    exists(id: string): Promise<boolean>;
    /**
     * Get all nodes (for metabolism tick ONLY - NOT for agent queries)
     *
     * [Warning] This is O(n) and should NEVER be used for agent perception.
     * Use queryNearby() for spatial queries.
     */
    getAll(): Promise<SphereNode[]>;
    /**
     * Spatial query: Find nodes near a vector position
     *
     * [Design] This is the PRIMARY method for agent perception.
     * Implementations should use spatial indexing (HNSW, IVFFlat, etc.)
     *
     * [Sampling] sampleRatio reduces O(n) traversal cost by randomly skipping nodes.
     * Used for sense/scanL1 to balance load as agent count increases.
     * Formula: sampleRatio = 1 / agentCount^0.25 (gentle curve)
     *
     * @param vector Query position in embedding space
     * @param limit Maximum number of results
     * @param maxDistance Maximum cosine distance (0 = identical, 2 = opposite)
     * @param sampleRatio Random sample ratio (0.0-1.0, default 1.0 = no sampling)
     */
    queryNearby(vector: number[], limit: number, maxDistance: number, sampleRatio?: number): Promise<SpatialQueryResult[]>;
    /**
     * Get node count
     */
    count(): Promise<number>;
    /**
     * Batch update nodes (for metabolism efficiency)
     */
    batchSet(nodes: SphereNode[]): Promise<void>;
    /**
     * Batch delete nodes (for evaporation)
     */
    batchDelete(ids: string[]): Promise<void>;
}
/**
 * Spatial Field Repository Interface
 *
 * Manages fertility and plankton distribution
 */
export interface ISpatialFieldRepository {
    /**
     * Get spatial field by cell ID
     */
    get(cellId: string): Promise<SpatialField | null>;
    /**
     * Update spatial field
     */
    set(cellId: string, field: SpatialField): Promise<void>;
    /**
     * Get all spatial fields
     */
    getAll(): Promise<SpatialField[]>;
    /**
     * Get field count
     */
    count(): Promise<number>;
}
//# sourceMappingURL=interfaces.d.ts.map