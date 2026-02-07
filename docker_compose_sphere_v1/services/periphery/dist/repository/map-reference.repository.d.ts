/**
 * Sphere Project - Map Reference Repository
 *
 * [Implementation] In-memory Map for development
 * [Production] Replace with PostgresReferenceRepository
 */
import type { ReferenceRecord } from "@sphere/renal-core";
import type { IReferenceRepository } from "./interfaces.js";
export declare class MapReferenceRepository implements IReferenceRepository {
    private store;
    constructor(store?: Map<string, ReferenceRecord>);
    get(id: string): Promise<ReferenceRecord | null>;
    exists(id: string): Promise<boolean>;
    create(record: ReferenceRecord): Promise<void>;
    markAsAmber(id: string, snapshot: ReferenceRecord["snapshot"], crystallization?: ReferenceRecord["payload"]["crystallization"]): Promise<void>;
    delete(id: string): Promise<void>;
    getAll(): Promise<ReferenceRecord[]>;
    count(): Promise<number>;
    /**
     * Get underlying Map (for RenalCore integration)
     * @deprecated Use repository methods instead
     */
    getInternalMap(): Map<string, ReferenceRecord>;
}
//# sourceMappingURL=map-reference.repository.d.ts.map