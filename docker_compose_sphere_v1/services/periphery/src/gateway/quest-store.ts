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

// ============================================================
// Configuration
// ============================================================

export interface QuestStoreConfig {
  /** Maximum quests to store (FIFO eviction when full) */
  maxSize: number;
  /** Maximum quests to show in showcase */
  showcaseSize: number;
}

const DEFAULT_QUEST_STORE_CONFIG: QuestStoreConfig = {
  maxSize: 100,
  showcaseSize: 10,   // Show top 10 in welcome
};

// ============================================================
// Quest Entry (internal storage)
// ============================================================

interface QuestEntry {
  id: string;
  /** Same structure as EntryRequest (query + tags) */
  request: Pick<EntryRequest, "query" | "tags">;
  /** Submission timestamp */
  submittedAt: number;
  /** Submitter identifier (optional) */
  submitterId?: string;
}

// ============================================================
// Quest Summary (for showcase)
// ============================================================

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

// ============================================================
// Quest Store
// ============================================================

export class QuestStore {
  private quests: Map<string, QuestEntry> = new Map();
  private readonly config: QuestStoreConfig;
  private idCounter = 0;

  constructor(config: Partial<QuestStoreConfig> = {}) {
    this.config = { ...DEFAULT_QUEST_STORE_CONFIG, ...config };
  }

  /**
   * Submit a new quest
   *
   * [Input] Same structure as EntryRequest (query + tags)
   * [Output] Quest ID for tracking
   */
  submit(
    request: Pick<EntryRequest, "query" | "tags">,
    submitterId?: string
  ): string {
    const now = Date.now();
    const id = `quest-${++this.idCounter}-${now}`;

    // FIFO eviction if full
    if (this.quests.size >= this.config.maxSize) {
      const oldestKey = this.quests.keys().next().value;
      if (oldestKey) {
        this.quests.delete(oldestKey);
      }
    }

    const entry: QuestEntry = {
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
  getShowcase(): QuestSummary[] {
    const showcase: QuestSummary[] = [];

    // Iterate in reverse order (newest first) for showcase
    const entries = Array.from(this.quests.values()).reverse();

    for (const entry of entries) {
      showcase.push({
        id: entry.id,
        question: entry.request.query,
        tags: entry.request.tags,
        submittedAt: entry.submittedAt,
      });

      if (showcase.length >= this.config.showcaseSize) break;
    }

    return showcase;
  }

  /**
   * Get quest by ID
   */
  get(id: string): QuestEntry | null {
    return this.quests.get(id) ?? null;
  }

  /**
   * Check if quest exists and is valid
   */
  exists(id: string): boolean {
    return this.get(id) !== null;
  }

  /**
   * Get store statistics
   */
  getStats(): { total: number; showcaseSize: number } {
    return {
      total: this.quests.size,
      showcaseSize: this.getShowcase().length,
    };
  }
}
