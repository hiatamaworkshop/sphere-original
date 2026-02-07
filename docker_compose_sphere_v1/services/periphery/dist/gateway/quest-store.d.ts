/**
 * Sphere Project - Quest Store
 *
 * [Role] In-memory storage for external quest submissions
 * [Design] Quest uses same structure as EntryRequest (query + tags)
 *
 * [Philosophy]
 *   Quest ≠ SphereNode
 *   Quest = text object from external world
 *   Quest = guide to nodes, not a node itself
 *
 *   No intentional deletion - quests remain for multiple agents
 *   Multiple agents can accept the same quest and leave evaluations
 *   FIFO eviction only when storage is full
 *
 * [Flow]
 *   POST /quest → Quest Store → welcome.quests
 *   Agent selects quest → EntryRequest { quest }
 *   → ParserBuffer vectorizes quest
 *   → questVector guides Agent
 */
import type { EntryRequest } from "../types/gateway.js";
export interface QuestStoreConfig {
    /** Maximum quests to store (FIFO eviction when full) */
    maxSize: number;
    /** Maximum quests to show in showcase */
    showcaseSize: number;
}
interface QuestEntry {
    id: string;
    /** Same structure as EntryRequest (query + tags) */
    request: Pick<EntryRequest, "query" | "tags">;
    /** Submission timestamp */
    submittedAt: number;
    /** Submitter identifier (optional) */
    submitterId?: string;
}
/**
 * Quest Summary: Sent to agents in welcome message
 */
export interface QuestSummary {
    id: string;
    /** Quest text (= request.query) */
    question: string;
    /** Topic tags (= request.tags) */
    tags: string[];
    /** Submission timestamp */
    submittedAt: number;
}
export declare class QuestStore {
    private quests;
    private readonly config;
    private idCounter;
    constructor(config?: Partial<QuestStoreConfig>);
    /**
     * Submit a new quest
     *
     * [Input] Same structure as EntryRequest (query + tags)
     * [Output] Quest ID for tracking
     */
    submit(request: Pick<EntryRequest, "query" | "tags">, submitterId?: string): string;
    /**
     * Get quest showcase for welcome message
     *
     * Returns up to showcaseSize quests (newest first for visibility)
     */
    getShowcase(): QuestSummary[];
    /**
     * Get quest by ID
     */
    get(id: string): QuestEntry | null;
    /**
     * Check if quest exists and is valid
     */
    exists(id: string): boolean;
    /**
     * Get store statistics
     */
    getStats(): {
        total: number;
        showcaseSize: number;
    };
}
export {};
//# sourceMappingURL=quest-store.d.ts.map