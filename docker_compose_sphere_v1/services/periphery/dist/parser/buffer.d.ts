/**
 * Sphere Project - Entry Buffer (Atomic Entry + Dual Timeout)
 *
 * [Role] Batching mechanism for agent entry vectorization
 * [Principle] Atomic Entry - Never split an agent's request/quest pair
 *
 * [Usage] Called right after Membrane.validate() in GatewayServer
 *   - Membrane validation passes → immediately enqueue to EntryBuffer
 *   - EntryBuffer batches multiple agent entries for efficient embedding
 *
 * [Timeout Design] Dual timeout to balance efficiency and responsiveness
 *   - idleTimeout: Flush when no new entries for N ms (responsive)
 *   - maxWaitTime: Force flush after N ms from first entry (bounded delay)
 *
 * [Performance Estimates]
 *   - Local model (all-MiniLM-L6-v2): ~5ms per text
 *   - Batch of 16 texts: ~80ms embedding time
 *   - With idleTimeout=200ms, maxWaitTime=2000ms:
 *     → Typical latency: 200-280ms (idle + embedding)
 *     → Worst case: 2000-2080ms (max wait + embedding)
 *
 * [Guarantee]
 *   - Agent's texts are never separated across batches
 *   - Owner identity is preserved through the entire pipeline
 *   - Delay is bounded by maxWaitTime
 */
import type { Parser } from "./parser.js";
/**
 * Parsed result for a single dive entry
 */
export interface ParsedDiveEntry {
    agentId: string;
    request: string;
    quest?: string;
    initialPosition: number[];
    questVector?: number[];
}
/**
 * Buffer configuration
 */
export interface EntryBufferConfig {
    maxTextsPerBatch: number;
    entryIdleTimeoutMs: number;
    entryMaxWaitTimeMs: number;
}
export declare class EntryBuffer {
    private parser;
    private buffer;
    private readonly config;
    private idleTimer;
    private maxWaitTimer;
    private firstEntryTime;
    constructor(parser: Parser, config?: Partial<EntryBufferConfig>);
    /**
     * Enqueue a dive entry for processing (atomic unit)
     *
     * [Guarantee] request and quest are NEVER separated
     * [Guarantee] agentId is tracked through the entire process
     * [Guarantee] delay is bounded by maxWaitTime
     *
     * @param agentId - Owner agent identifier
     * @param request - Agent's request text
     * @param quest - Optional quest text
     */
    enqueueDiveEntry(agentId: string, request: string, quest?: string): Promise<ParsedDiveEntry>;
    /**
     * Count total texts in current buffer
     */
    private countTexts;
    /**
     * Start/restart idle timer
     * Fires when no new entries for idleTimeoutMs
     */
    private resetIdleTimer;
    /**
     * Start max wait timer (only once per batch cycle)
     * Fires when first entry has been waiting for entryMaxWaitTimeMs
     */
    private startMaxWaitTimer;
    /**
     * Clear all timers
     */
    private clearTimers;
    /**
     * Flush buffer: process all pending entries
     *
     * [Implementation]
     *   1. Flatten all texts into single array
     *   2. Track offset for each agent's texts
     *   3. Batch vectorize
     *   4. Distribute results back to correct agents
     */
    private flush;
    /**
     * Force flush (for graceful shutdown)
     */
    forceFlush(): Promise<void>;
    /**
     * Get current buffer stats
     */
    getStats(): {
        entries: number;
        texts: number;
        firstEntryAge: number | null;
    };
    /**
     * Vectorize a single text (no batching)
     *
     * [Usage] For explore queries where immediate response is needed
     * [Note] Does not use buffer - direct pass-through to Parser
     */
    vectorize(text: string): Promise<number[]>;
}
/**
 * Incarnation Buffer for IncarnationParser (topTier summary vectorization)
 *
 * [Role] Batch vectorization of topTier node summaries for spatial positioning
 *
 * [Design] Flow-first, moderate batching
 *   - NOT for maximum throughput (that would stall the pipeline)
 *   - Moderate batch size: ~30 summaries (5-6 agents worth of topTier)
 *   - Short timeouts: don't block pipeline for too long
 *   - Downstream DB (ProjDB/RefDB) also needs consideration
 *
 * [Key Insight] Fire & Forget from agent perspective
 *   - Agent has already left when incarnation runs
 *   - But pipeline must not stall: Packer/Bookkeeper are waiting
 *   - Balance: enough batching for efficiency, not so much that flow stops
 */
export interface IncarnationBufferConfig {
    batchSize: number;
    incarnIdleTimeoutMs: number;
    incarnMaxWaitTimeMs: number;
}
export declare class IncarnationBuffer {
    private parser;
    private buffer;
    private readonly config;
    private idleTimer;
    private maxWaitTimer;
    private firstEntryTime;
    constructor(parser: Parser, config?: Partial<IncarnationBufferConfig>);
    /**
     * Enqueue summary for vectorization
     * Returns promise that resolves with the vector
     */
    enqueue(summary: string): Promise<number[]>;
    /**
     * Enqueue multiple summaries at once (for batch capsule processing)
     * More efficient than individual enqueue calls
     */
    enqueueBatch(summaries: string[]): Promise<number[][]>;
    private resetIdleTimer;
    private startMaxWaitTimer;
    private clearTimers;
    private flush;
    forceFlush(): Promise<void>;
    /**
     * Get current buffer stats
     */
    getStats(): {
        count: number;
        firstEntryAge: number | null;
    };
}
//# sourceMappingURL=buffer.d.ts.map