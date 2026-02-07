/**
 * Sphere Project - Parser
 *
 * [Role] Embedding Service / Vectorizer
 * [Function] Convert text to 1536-dim vectors
 * [Stateless] Coordinates defined by embedding model
 */

import type { IEmbeddingProvider } from "./embedding-provider.js";
import type { PeripheryConfig } from "../types/config.js";

export class Parser {
  constructor(
    private provider: IEmbeddingProvider,
    private config: PeripheryConfig
  ) {}

  /**
   * Vectorize single summary
   */
  async vectorize(summary: string): Promise<number[]> {
    return this.provider.embed(summary);
  }

  /**
   * Vectorize batch of summaries
   */
  async vectorizeBatch(summaries: string[]): Promise<number[][]> {
    return this.provider.embedBatch(summaries);
  }

  /**
   * Vectorize tags (join and embed)
   * Used for movement vectorization
   */
  async vectorizeTags(tags: string[]): Promise<number[]> {
    const combined = tags.join(" ");
    return this.provider.embed(combined);
  }

  /**
   * Get vector dimension from config
   */
  getVectorDimension(): number {
    return this.config.parser.vectorDimension;
  }
}
