/**
 * Sphere Project - Map Spatial Field Repository
 *
 * [Implementation] In-memory Map for development
 */
export class MapSpatialFieldRepository {
    store;
    constructor(store = new Map()) {
        this.store = store;
    }
    async get(cellId) {
        return this.store.get(cellId) ?? null;
    }
    async set(cellId, field) {
        this.store.set(cellId, field);
    }
    async getAll() {
        return Array.from(this.store.values());
    }
    async count() {
        return this.store.size;
    }
    /**
     * Get underlying Map (for RenalCore integration)
     * @deprecated Use repository methods instead
     */
    getInternalMap() {
        return this.store;
    }
}
//# sourceMappingURL=map-spatial.repository.js.map