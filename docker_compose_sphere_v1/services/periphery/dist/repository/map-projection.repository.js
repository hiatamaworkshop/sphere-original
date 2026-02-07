/**
 * Sphere Project - Map Projection Repository
 *
 * [Implementation] In-memory Map for development
 * [Production] Replace with RedisProjectionRepository
 *
 * [Warning] queryNearby() is O(n) in this implementation.
 * Production should use spatial indexing (HNSW, IVFFlat).
 */
/**
 * Cosine distance between two vectors (0 = identical, 2 = opposite)
 */
function cosineDistance(a, b) {
    if (a.length !== b.length || a.length === 0)
        return 2;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0)
        return 2;
    return 1 - dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
export class MapProjectionRepository {
    store;
    constructor(store = new Map()) {
        this.store = store;
    }
    async get(id) {
        return this.store.get(id) ?? null;
    }
    async set(id, node) {
        this.store.set(id, node);
    }
    async delete(id) {
        this.store.delete(id);
    }
    async exists(id) {
        return this.store.has(id);
    }
    async getAll() {
        return Array.from(this.store.values());
    }
    async count() {
        return this.store.size;
    }
    async batchSet(nodes) {
        for (const node of nodes) {
            this.store.set(node.id, node);
        }
    }
    async batchDelete(ids) {
        for (const id of ids) {
            this.store.delete(id);
        }
    }
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
    async queryNearby(vector, limit, maxDistance, sampleRatio = 1.0) {
        const results = [];
        const effectiveRatio = Math.min(1.0, Math.max(0.1, sampleRatio));
        for (const node of this.store.values()) {
            // Sampling: skip nodes probabilistically
            if (effectiveRatio < 1.0 && Math.random() > effectiveRatio)
                continue;
            if (!node.vector || node.vector.length === 0)
                continue;
            const distance = cosineDistance(vector, node.vector);
            if (distance <= maxDistance) {
                results.push({ node, distance });
            }
        }
        // Sort by distance, take top N
        results.sort((a, b) => a.distance - b.distance);
        return results.slice(0, limit);
    }
    /**
     * Get underlying Map (for RenalCore integration)
     * @deprecated Use repository methods instead
     */
    getInternalMap() {
        return this.store;
    }
}
//# sourceMappingURL=map-projection.repository.js.map