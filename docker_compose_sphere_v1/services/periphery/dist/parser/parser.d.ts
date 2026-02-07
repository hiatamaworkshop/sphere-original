/**
 * Sphere Project - Parser
 *
 * [Role] Embedding Service / Vectorizer
 * [Function] Convert text to 1536-dim vectors
 * [Stateless] Coordinates defined by embedding model
 */
import type { IEmbeddingProvider } from "./embedding-provider.js";
import type { PeripheryConfig } from "../types/config.js";
export declare class Parser {
    private provider;
    private config;
    constructor(provider: IEmbeddingProvider, config: PeripheryConfig);
    /**
     * Vectorize single summary
     */
    vectorize(summary: string): Promise<number[]>;
    /**
     * Vectorize batch of summaries
     */
    vectorizeBatch(summaries: string[]): Promise<number[][]>;
    /**
     * Vectorize tags (join and embed)
     * Used for movement vectorization
     */
    vectorizeTags(tags: string[]): Promise<number[]>;
    /**
     * Get vector dimension from config
     */
    getVectorDimension(): number;
}
//# sourceMappingURL=parser.d.ts.map