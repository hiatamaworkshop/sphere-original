/**
 * Sphere Project - Entry Buffer (Atomic Entry + Dual Timeout)
 *
 * [Role] Batching mechanism for agent entry vectorization
 * [Principle] Atomic Entry - Agent request as indivisible unit
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
  initialPosition: number[];  // from request
}

/**
 * Internal entry request (atomic unit)
 */
interface EntryRequest {
  agentId: string;
  request: string;
  enqueuedAt: number;         // timestamp for maxWaitTime tracking
  resolve: (result: ParsedDiveEntry) => void;
  reject: (error: Error) => void;
}

/**
 * Buffer configuration
 */
export interface EntryBufferConfig {
  maxTextsPerBatch: number;       // Max texts before immediate flush (default: 16)
  entryIdleTimeoutMs: number;     // Flush when idle for this duration (default: 200)
  entryMaxWaitTimeMs: number;     // Force flush after this duration (default: 2000)
}

const DEFAULT_ENTRY_BUFFER_CONFIG: EntryBufferConfig = {
  maxTextsPerBatch: 16,
  entryIdleTimeoutMs: 200,        // 200ms idle - responsive
  entryMaxWaitTimeMs: 2000,       // 2s max wait - bounded delay
};

export class EntryBuffer {
  private buffer: EntryRequest[] = [];
  private readonly config: EntryBufferConfig;
  private idleTimer: NodeJS.Timeout | null = null;
  private maxWaitTimer: NodeJS.Timeout | null = null;
  private firstEntryTime: number | null = null;

  constructor(
    private parser: Parser,
    config: Partial<EntryBufferConfig> = {}
  ) {
    this.config = { ...DEFAULT_ENTRY_BUFFER_CONFIG, ...config };
  }

  /**
   * Enqueue a dive entry for processing (atomic unit)
   *
   * [Guarantee] agentId is tracked through the entire process
   * [Guarantee] delay is bounded by maxWaitTime
   *
   * @param agentId - Owner agent identifier
   * @param request - Agent's request text
   */
  async enqueueDiveEntry(
    agentId: string,
    request: string,
  ): Promise<ParsedDiveEntry> {
    return new Promise((resolve, reject) => {
      const now = Date.now();
      const entry: EntryRequest = {
        agentId,
        request,
        enqueuedAt: now,
        resolve,
        reject,
      };

      // Calculate how many texts this entry will add
      const entryTextCount = 1;
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
  private countTexts(): number {
    return this.buffer.length;
  }

  /**
   * Start/restart idle timer
   * Fires when no new entries for idleTimeoutMs
   */
  private resetIdleTimer(): void {
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
  private startMaxWaitTimer(): void {
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
  private clearTimers(): void {
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
  private async flush() {
    if (this.buffer.length === 0) return;

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
    const texts: string[] = [];
    const offsets: { entry: EntryRequest; startIdx: number }[] = [];

    for (const entry of batch) {
      const startIdx = texts.length;
      texts.push(entry.request);
      offsets.push({ entry, startIdx });
    }

    console.log(
      `[Entry.Buffer] flush: ${batch.length} entries, ${texts.length} texts ` +
      `(wait: avg=${avgWait.toFixed(0)}ms max=${maxWait.toFixed(0)}ms)`
    );

    const embedStart = Date.now();

    try {
      // Batch vectorize all texts at once
      const vectors = await this.parser.vectorizeBatch(texts);

      const embedTime = Date.now() - embedStart;
      console.log(`[Entry.Buffer] embed=${embedTime}ms`);

      // Distribute results to each entry
      for (const { entry, startIdx } of offsets) {
        const result: ParsedDiveEntry = {
          agentId: entry.agentId,
          request: entry.request,
          initialPosition: vectors[startIdx],
        };
        entry.resolve(result);
      }
    } catch (error) {
      console.error("[Entry.Buffer] Batch processing failed:", error);
      const fallbackDim = this.parser.getVectorDimension();
      const zeroVector = new Array(fallbackDim).fill(0);

      // Fallback: resolve with zero vectors (allows spawn at origin)
      for (const { entry } of offsets) {
        const result: ParsedDiveEntry = {
          agentId: entry.agentId,
          request: entry.request,
          initialPosition: [...zeroVector],
        };
        entry.resolve(result);
      }
    }
  }

  /**
   * Force flush (for graceful shutdown)
   */
  async forceFlush(): Promise<void> {
    await this.flush();
  }

  /**
   * Get current buffer stats
   */
  getStats(): {
    entries: number;
    texts: number;
    firstEntryAge: number | null;
  } {
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
  async vectorize(text: string): Promise<number[]> {
    return this.parser.vectorize(text);
  }
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
  batchSize: number;              // Max summaries before immediate flush (default: 30)
  incarnIdleTimeoutMs: number;    // Flush when idle (default: 1000)
  incarnMaxWaitTimeMs: number;    // Force flush after (default: 3000)
}

const DEFAULT_INCARNATION_BUFFER_CONFIG: IncarnationBufferConfig = {
  batchSize: 30,                  // ~5-6 agents worth of topTier
  incarnIdleTimeoutMs: 1000,      // 1s idle - don't wait too long
  incarnMaxWaitTimeMs: 3000,      // 3s max - keep pipeline flowing
};

/**
 * Internal request for incarnation vectorization
 */
interface IncarnationRequest {
  summary: string;
  enqueuedAt: number;
  resolve: (vec: number[]) => void;
  reject: (error: Error) => void;
}

export class IncarnationBuffer {
  private buffer: IncarnationRequest[] = [];
  private readonly config: IncarnationBufferConfig;
  private idleTimer: NodeJS.Timeout | null = null;
  private maxWaitTimer: NodeJS.Timeout | null = null;
  private firstEntryTime: number | null = null;

  constructor(
    private parser: Parser,
    config: Partial<IncarnationBufferConfig> = {}
  ) {
    this.config = { ...DEFAULT_INCARNATION_BUFFER_CONFIG, ...config };
  }

  /**
   * Enqueue summary for vectorization
   * Returns promise that resolves with the vector
   */
  async enqueue(summary: string): Promise<number[]> {
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
  async enqueueBatch(summaries: string[]): Promise<number[][]> {
    if (summaries.length === 0) return [];

    const promises = summaries.map((summary) => this.enqueue(summary));
    return Promise.all(promises);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      console.log(`[Incarn.Buffer] idle=${this.config.incarnIdleTimeoutMs}ms - flushing`);
      this.flush();
    }, this.config.incarnIdleTimeoutMs);
  }

  private startMaxWaitTimer(): void {
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
    }
    this.maxWaitTimer = setTimeout(() => {
      console.log(`[Incarn.Buffer] maxWait=${this.config.incarnMaxWaitTimeMs}ms - force flushing`);
      this.flush();
    }, this.config.incarnMaxWaitTimeMs);
  }

  private clearTimers(): void {
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

  private async flush() {
    if (this.buffer.length === 0) return;

    this.clearTimers();

    const batch = this.buffer.splice(0);

    // Calculate wait statistics
    const now = Date.now();
    const waitTimes = batch.map((r) => now - r.enqueuedAt);
    const maxWait = Math.max(...waitTimes);
    const avgWait = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;

    console.log(
      `[IncarnationBuffer] Flushing: ${batch.length} summaries ` +
      `(wait: avg=${avgWait.toFixed(0)}ms, max=${maxWait.toFixed(0)}ms)`
    );

    const embedStart = Date.now();

    try {
      const vectors = await this.parser.vectorizeBatch(batch.map((r) => r.summary));
      const embedTime = Date.now() - embedStart;
      console.log(`[IncarnationBuffer] Embedding completed in ${embedTime}ms`);

      batch.forEach((item, i) => item.resolve(vectors[i]));
    } catch (error) {
      console.error("[IncarnationBuffer] Batch processing failed:", error);
      const fallbackDim = this.parser.getVectorDimension();
      const zeroVector = new Array(fallbackDim).fill(0);
      batch.forEach((item) => item.resolve([...zeroVector]));
    }
  }

  async forceFlush(): Promise<void> {
    await this.flush();
  }

  /**
   * Get current buffer stats
   */
  getStats(): {
    count: number;
    firstEntryAge: number | null;
  } {
    return {
      count: this.buffer.length,
      firstEntryAge: this.firstEntryTime ? Date.now() - this.firstEntryTime : null,
    };
  }
}
