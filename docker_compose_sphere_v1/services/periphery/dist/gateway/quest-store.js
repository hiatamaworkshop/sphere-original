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
const DEFAULT_QUEST_STORE_CONFIG = {
    maxSize: 100,
    showcaseSize: 10, // Show top 10 in welcome
};
// ============================================================
// Quest Store
// ============================================================
export class QuestStore {
    quests = new Map();
    config;
    idCounter = 0;
    constructor(config = {}) {
        this.config = { ...DEFAULT_QUEST_STORE_CONFIG, ...config };
    }
    /**
     * Submit a new quest
     *
     * [Input] Same structure as EntryRequest (query + tags)
     * [Output] Quest ID for tracking
     */
    submit(request, submitterId) {
        const now = Date.now();
        const id = `quest-${++this.idCounter}-${now}`;
        // FIFO eviction if full
        if (this.quests.size >= this.config.maxSize) {
            const oldestKey = this.quests.keys().next().value;
            if (oldestKey) {
                this.quests.delete(oldestKey);
            }
        }
        const entry = {
            id,
            request,
            submittedAt: now,
            submitterId,
        };
        this.quests.set(id, entry);
        console.log(`[QuestStore] Quest submitted: ${id} (query: "${request.query.slice(0, 50)}...")`);
        return id;
    }
    /**
     * Get quest showcase for welcome message
     *
     * Returns up to showcaseSize quests (newest first for visibility)
     */
    getShowcase() {
        const showcase = [];
        // Iterate in reverse order (newest first) for showcase
        const entries = Array.from(this.quests.values()).reverse();
        for (const entry of entries) {
            showcase.push({
                id: entry.id,
                question: entry.request.query,
                tags: entry.request.tags,
                submittedAt: entry.submittedAt,
            });
            if (showcase.length >= this.config.showcaseSize)
                break;
        }
        return showcase;
    }
    /**
     * Get quest by ID
     */
    get(id) {
        return this.quests.get(id) ?? null;
    }
    /**
     * Check if quest exists and is valid
     */
    exists(id) {
        return this.get(id) !== null;
    }
    /**
     * Get store statistics
     */
    getStats() {
        return {
            total: this.quests.size,
            showcaseSize: this.getShowcase().length,
        };
    }
}
//# sourceMappingURL=quest-store.js.map