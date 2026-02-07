/**
 * Sphere Project - Map Reference Repository
 *
 * [Implementation] In-memory Map for development
 * [Production] Replace with PostgresReferenceRepository
 */
export class MapReferenceRepository {
    store;
    constructor(store = new Map()) {
        this.store = store;
    }
    async get(id) {
        return this.store.get(id) ?? null;
    }
    async exists(id) {
        return this.store.has(id);
    }
    async create(record) {
        if (this.store.has(record.id)) {
            throw new Error(`ReferenceRecord already exists: ${record.id}`);
        }
        this.store.set(record.id, record);
    }
    async markAsAmber(id, snapshot, crystallization) {
        const record = this.store.get(id);
        if (!record) {
            throw new Error(`ReferenceRecord not found: ${id}`);
        }
        // Update to Amber with new snapshot and optional crystallization
        const updated = {
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
    async delete(id) {
        this.store.delete(id);
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
//# sourceMappingURL=map-reference.repository.js.map