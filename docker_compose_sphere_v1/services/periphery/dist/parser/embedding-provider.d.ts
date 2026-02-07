/**
 * Sphere Project - Embedding Provider (Abstraction Layer)
 *
 * [Principle] Abstracted for easy model replacement
 * [Constraint] LOCAL MODELS ONLY - API-based embedding is PROHIBITED
 *
 * [Available Providers]
 *   - MockEmbeddingProvider: Random vectors for testing
 *   - LocalEmbeddingProvider: @xenova/transformers (RECOMMENDED)
 *
 * [Default Model] Xenova/all-MiniLM-L6-v2 (384 dimensions, ~50MB)
 */
/**
 * Embedding Provider Interface
 */
export interface IEmbeddingProvider {
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
/**
 * Mock Embedding Provider
 *
 * Generates random normalized 384-dimensional vectors
 * For development/testing only - NO semantic meaning
 *
 * Special feature: Supports cluster keywords for spectral link testing
 * - Text containing [RESONANCE-CLUSTER-X] generates vectors near cluster X's base
 */
export declare class MockEmbeddingProvider implements IEmbeddingProvider {
    private clusterBases;
    private readonly dimension;
    constructor(dimension?: number);
    /**
     * Embed single text → normalized vector
     *
     * If text contains [RESONANCE-CLUSTER-X], generates vector near cluster X's base
     * with distance < 0.1 to ensure spectral link formation
     */
    embed(text: string): Promise<number[]>;
    /**
     * Generate a vector near the cluster's base vector
     */
    private generateClusterVector;
    /**
     * Get the configured dimension
     */
    getDimension(): number;
    /**
     * Batch embed multiple texts
     */
    embedBatch(texts: string[]): Promise<number[][]>;
    /**
     * Normalize vector to unit length
     */
    private normalize;
}
/**
 * Local Embedding Provider Configuration
 */
export interface LocalEmbeddingConfig {
    modelId: string;
    dimension: number;
}
/**
 * Default configuration for local embedding
 */
export declare const DEFAULT_LOCAL_EMBEDDING_CONFIG: LocalEmbeddingConfig;
/**
 * Local Embedding Provider
 *
 * Uses @xenova/transformers for local ONNX-based embedding.
 * Model is downloaded on first use and cached locally.
 *
 * [Constraint] LOCAL ONLY - No external API calls
 * [Default] all-MiniLM-L6-v2 (384 dimensions, ~50MB)
 */
export declare class LocalEmbeddingProvider implements IEmbeddingProvider {
    private config;
    private pipeline;
    private _isLoading;
    private loadPromise;
    constructor(config?: LocalEmbeddingConfig);
    /**
     * Initialize the embedding pipeline (lazy loading)
     */
    private ensureLoaded;
    /**
     * Load the transformer pipeline
     */
    private loadPipeline;
    /**
     * Embed single text → vector
     */
    embed(text: string): Promise<number[]>;
    /**
     * Batch embed multiple texts (TRUE batch processing)
     *
     * [Design] Pass array directly to pipeline for GPU/CPU parallelism
     * [Performance] ~5x faster than sequential calls
     *
     * @see reports/EMBEDDING_BATCH_ISSUE.md
     */
    embedBatch(texts: string[]): Promise<number[][]>;
    /**
     * Get the configured dimension
     */
    getDimension(): number;
    /**
     * Get model ID
     */
    getModelId(): string;
}
/**
 * Factory function to create embedding provider
 */
export declare function createEmbeddingProvider(type: "mock" | "local", config?: Partial<LocalEmbeddingConfig>): IEmbeddingProvider;
//# sourceMappingURL=embedding-provider.d.ts.map