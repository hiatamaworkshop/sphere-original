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
const DEFAULT_ENTRY_BUFFER_CONFIG = {
    maxTextsPerBatch: 16,
    entryIdleTimeoutMs: 200, // 200ms idle - responsive
    entryMaxWaitTimeMs: 2000, // 2s max wait - bounded delay
};
export class EntryBuffer {
    parser;
    buffer = [];
    config;
    idleTimer = null;
    maxWaitTimer = null;
    firstEntryTime = null;
    constructor(parser, config = {}) {
        this.parser = parser;
        this.config = { ...DEFAULT_ENTRY_BUFFER_CONFIG, ...config };
    }
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
    async enqueueDiveEntry(agentId, request, quest) {
        return new Promise((resolve, reject) => {
            const now = Date.now();
            const entry = {
                agentId,
                request,
                quest,
                enqueuedAt: now,
                resolve,
                reject,
            };
            // Calculate how many texts this entry will add
            const entryTextCount = quest ? 2 : 1;
            const currentTextCount = this.countTexts();
            // If adding this entry would exceed batch size, flush first
            if (currentTextCount + entryTextCount > this.config.maxTextsPerBatch && this.buffer.length > 0) {
                this.flush();
            }
            // Track first entry time for maxWaitTime
            if (this.buffer.length === 0) {
                this.firstEntryTime = now;
                this.startMaxWaitTimer();
            }
            // Add entry to buffer
            this.buffer.push(entry);
            // Reset idle timer (any new activity extends idle period)
            this.resetIdleTimer();
            // Check if we should flush immediately (batch size reached)
            if (this.countTexts() >= this.config.maxTextsPerBatch) {
                this.flush();
            }
        });
    }
    /**
     * Count total texts in current buffer
     */
    countTexts() {
        return this.buffer.reduce((count, entry) => {
            return count + (entry.quest ? 2 : 1);
        }, 0);
    }
    /**
     * Start/restart idle timer
     * Fires when no new entries for idleTimeoutMs
     */
    resetIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        this.idleTimer = setTimeout(() => {
            console.log(`[Entry.Buffer] idle=${this.config.entryIdleTimeoutMs}ms - flushing`);
            this.flush();
        }, this.config.entryIdleTimeoutMs);
    }
    /**
     * Start max wait timer (only once per batch cycle)
     * Fires when first entry has been waiting for entryMaxWaitTimeMs
     */
    startMaxWaitTimer() {
        if (this.maxWaitTimer) {
            clearTimeout(this.maxWaitTimer);
        }
        this.maxWaitTimer = setTimeout(() => {
            console.log(`[Entry.Buffer] maxWait=${this.config.entryMaxWaitTimeMs}ms - force flushing`);
            this.flush();
        }, this.config.entryMaxWaitTimeMs);
    }
    /**
     * Clear all timers
     */
    clearTimers() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
        if (this.maxWaitTimer) {
            clearTimeout(this.maxWaitTimer);
            this.maxWaitTimer = null;
        }
        this.firstEntryTime = null;
    }
    /**
     * Flush buffer: process all pending entries
     *
     * [Implementation]
     *   1. Flatten all texts into single array
     *   2. Track offset for each agent's texts
     *   3. Batch vectorize
     *   4. Distribute results back to correct agents
     */
    async flush() {
        if (this.buffer.length === 0)
            return;
        // Clear all timers
        this.clearTimers();
        // Extract batch
        const batch = this.buffer.splice(0);
        // Calculate wait statistics
        const now = Date.now();
        const waitTimes = batch.map(e => now - e.enqueuedAt);
        const maxWait = Math.max(...waitTimes);
        const avgWait = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
        // Build text array and track offsets
        const texts = [];
        const offsets = [];
        for (const entry of batch) {
            const startIdx = texts.length;
            texts.push(entry.request);
            if (entry.quest) {
                texts.push(entry.quest);
            }
            offsets.push({ entry, startIdx, hasQuest: !!entry.quest });
        }
        console.log(`[Entry.Buffer] flush: ${batch.length} entries, ${texts.length} texts ` +
            `(wait: avg=${avgWait.toFixed(0)}ms max=${maxWait.toFixed(0)}ms)`);
        const embedStart = Date.now();
        try {
            // Batch vectorize all texts at once
            const vectors = await this.parser.vectorizeBatch(texts);
            const embedTime = Date.now() - embedStart;
            console.log(`[Entry.Buffer] embed=${embedTime}ms`);
            // Distribute results to each entry
            for (const { entry, startIdx, hasQuest } of offsets) {
                const result = {
                    agentId: entry.agentId,
                    request: entry.request,
                    quest: entry.quest,
                    initialPosition: vectors[startIdx],
                    questVector: hasQuest ? vectors[startIdx + 1] : undefined,
                };
                entry.resolve(result);
            }
        }
        catch (error) {
            console.error("[Entry.Buffer] Batch processing failed:", error);
            const fallbackDim = this.parser.getVectorDimension();
            const zeroVector = new Array(fallbackDim).fill(0);
            // Fallback: resolve with zero vectors (allows spawn at origin)
            for (const { entry, hasQuest } of offsets) {
                const result = {
                    agentId: entry.agentId,
                    request: entry.request,
                    quest: entry.quest,
                    initialPosition: [...zeroVector],
                    questVector: hasQuest ? [...zeroVector] : undefined,
                };
                entry.resolve(result);
            }
        }
    }
    /**
     * Force flush (for graceful shutdown)
     */
    async forceFlush() {
        await this.flush();
    }
    /**
     * Get current buffer stats
     */
    getStats() {
        return {
            entries: this.buffer.length,
            texts: this.countTexts(),
            firstEntryAge: this.firstEntryTime ? Date.now() - this.firstEntryTime : null,
        };
    }
    /**
     * Vectorize a single text (no batching)
     *
     * [Usage] For explore queries where immediate response is needed
     * [Note] Does not use buffer - direct pass-through to Parser
     */
    async vectorize(text) {
        return this.parser.vectorize(text);
    }
}
const DEFAULT_INCARNATION_BUFFER_CONFIG = {
    batchSize: 30, // ~5-6 agents worth of topTier
    incarnIdleTimeoutMs: 1000, // 1s idle - don't wait too long
    incarnMaxWaitTimeMs: 3000, // 3s max - keep pipeline flowing
};
export class IncarnationBuffer {
    parser;
    buffer = [];
    config;
    idleTimer = null;
    maxWaitTimer = null;
    firstEntryTime = null;
    constructor(parser, config = {}) {
        this.parser = parser;
        this.config = { ...DEFAULT_INCARNATION_BUFFER_CONFIG, ...config };
    }
    /**
     * Enqueue summary for vectorization
     * Returns promise that resolves with the vector
     */
    async enqueue(summary) {
        return new Promise((resolve, reject) => {
            const now = Date.now();
            // Track first entry time for maxWaitTime
            if (this.buffer.length === 0) {
                this.firstEntryTime = now;
                this.startMaxWaitTimer();
            }
            this.buffer.push({ summary, enqueuedAt: now, resolve, reject });
            // Reset idle timer
            this.resetIdleTimer();
            // Flush if batch is full
            if (this.buffer.length >= this.config.batchSize) {
                this.flush();
            }
        });
    }
    /**
     * Enqueue multiple summaries at once (for batch capsule processing)
     * More efficient than individual enqueue calls
     */
    async enqueueBatch(summaries) {
        if (summaries.length === 0)
            return [];
        const promises = summaries.map((summary) => this.enqueue(summary));
        return Promise.all(promises);
    }
    resetIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        this.idleTimer = setTimeout(() => {
            console.log(`[Incarn.Buffer] idle=${this.config.incarnIdleTimeoutMs}ms - flushing`);
            this.flush();
        }, this.config.incarnIdleTimeoutMs);
    }
    startMaxWaitTimer() {
        if (this.maxWaitTimer) {
            clearTimeout(this.maxWaitTimer);
        }
        this.maxWaitTimer = setTimeout(() => {
            console.log(`[Incarn.Buffer] maxWait=${this.config.incarnMaxWaitTimeMs}ms - force flushing`);
            this.flush();
        }, this.config.incarnMaxWaitTimeMs);
    }
    clearTimers() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
        if (this.maxWaitTimer) {
            clearTimeout(this.maxWaitTimer);
            this.maxWaitTimer = null;
        }
        this.firstEntryTime = null;
    }
    async flush() {
        if (this.buffer.length === 0)
            return;
        this.clearTimers();
        const batch = this.buffer.splice(0);
        // Calculate wait statistics
        const now = Date.now();
        const waitTimes = batch.map((r) => now - r.enqueuedAt);
        const maxWait = Math.max(...waitTimes);
        const avgWait = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
        console.log(`[IncarnationBuffer] Flushing: ${batch.length} summaries ` +
            `(wait: avg=${avgWait.toFixed(0)}ms, max=${maxWait.toFixed(0)}ms)`);
        const embedStart = Date.now();
        try {
            const vectors = await this.parser.vectorizeBatch(batch.map((r) => r.summary));
            const embedTime = Date.now() - embedStart;
            console.log(`[IncarnationBuffer] Embedding completed in ${embedTime}ms`);
            batch.forEach((item, i) => item.resolve(vectors[i]));
        }
        catch (error) {
            console.error("[IncarnationBuffer] Batch processing failed:", error);
            const fallbackDim = this.parser.getVectorDimension();
            const zeroVector = new Array(fallbackDim).fill(0);
            batch.forEach((item) => item.resolve([...zeroVector]));
        }
    }
    async forceFlush() {
        await this.flush();
    }
    /**
     * Get current buffer stats
     */
    getStats() {
        return {
            count: this.buffer.length,
            firstEntryAge: this.firstEntryTime ? Date.now() - this.firstEntryTime : null,
        };
    }
}
//# sourceMappingURL=buffer.js.map