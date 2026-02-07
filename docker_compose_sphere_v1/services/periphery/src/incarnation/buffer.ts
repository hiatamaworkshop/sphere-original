/**
 * Sphere Project - Node Ingest Buffer
 *
 * [Role] Batching mechanism for node ingestion to Bookkeeper
 * [Function] Collect nodes, batch write to Bookkeeper
 * [Optimization] Reduces write overhead
 *
 * [Note] This is different from IncarnationBuffer in parser/buffer.ts
 *        which handles summary vectorization batching
 */

import type { Bookkeeper } from "../bookkeeper/bookkeeper.js";
import type { SphereNode } from "@sphere/renal-core";

export class NodeIngestBuffer {
  private buffer: SphereNode[] = [];
  private readonly BATCH_SIZE: number;
  private readonly FLUSH_INTERVAL: number;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private bookkeeper: Bookkeeper,
    batchSize: number = 8,
    flushInterval: number = 100
  ) {
    this.BATCH_SIZE = batchSize;
    this.FLUSH_INTERVAL = flushInterval;
  }

  /**
   * Enqueue nodes for ingestion
   */
  async enqueue(nodes: SphereNode[]): Promise<void> {
    this.buffer.push(...nodes);

    // Flush if batch is full
    if (this.buffer.length >= this.BATCH_SIZE) {
      await this.flush();
    }
    // Otherwise, set timeout
    else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL);
    }
  }

  /**
   * Flush buffer: write all pending nodes
   */
  private async flush() {
    if (this.buffer.length === 0) return;

    // Clear timeout
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Extract batch
    const batch = this.buffer.splice(0, this.BATCH_SIZE);

    console.log(`[NodeIngestBuffer] Flushing batch: ${batch.length} nodes`);

    try {
      await this.bookkeeper.ingest(batch);
    } catch (error) {
      console.error("[NodeIngestBuffer] Flush failed:", error);
    }
  }

  /**
   * Force flush (for graceful shutdown)
   */
  async forceFlush(): Promise<void> {
    await this.flush();
  }
}
