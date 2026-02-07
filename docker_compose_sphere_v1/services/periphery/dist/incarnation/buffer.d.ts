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
export declare class NodeIngestBuffer {
    private bookkeeper;
    private buffer;
    private readonly BATCH_SIZE;
    private readonly FLUSH_INTERVAL;
    private flushTimer;
    constructor(bookkeeper: Bookkeeper, batchSize?: number, flushInterval?: number);
    /**
     * Enqueue nodes for ingestion
     */
    enqueue(nodes: SphereNode[]): Promise<void>;
    /**
     * Flush buffer: write all pending nodes
     */
    private flush;
    /**
     * Force flush (for graceful shutdown)
     */
    forceFlush(): Promise<void>;
}
//# sourceMappingURL=buffer.d.ts.map