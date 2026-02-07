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
 * Default dimension for mock provider (matches all-MiniLM-L6-v2)
 */
const MOCK_DIMENSION = 384;
/**
 * Mock Embedding Provider
 *
 * Generates random normalized 384-dimensional vectors
 * For development/testing only - NO semantic meaning
 *
 * Special feature: Supports cluster keywords for spectral link testing
 * - Text containing [RESONANCE-CLUSTER-X] generates vectors near cluster X's base
 */
export class MockEmbeddingProvider {
    clusterBases = new Map();
    dimension;
    constructor(dimension = MOCK_DIMENSION) {
        this.dimension = dimension;
    }
    /**
     * Embed single text → normalized vector
     *
     * If text contains [RESONANCE-CLUSTER-X], generates vector near cluster X's base
     * with distance < 0.1 to ensure spectral link formation
     */
    async embed(text) {
        // Check for cluster keyword
        const clusterMatch = text.match(/\[RESONANCE-CLUSTER-([A-Z])\]/);
        if (clusterMatch) {
            const clusterId = clusterMatch[1];
            return this.generateClusterVector(clusterId);
        }
        // Default: Generate random vector
        const vec = Array.from({ length: this.dimension }, () => Math.random() - 0.5);
        // Normalize to unit length
        return this.normalize(vec);
    }
    /**
     * Generate a vector near the cluster's base vector
     */
    generateClusterVector(clusterId) {
        // Get or create cluster base vector
        if (!this.clusterBases.has(clusterId)) {
            const base = Array.from({ length: this.dimension }, () => Math.random() - 0.5);
            this.clusterBases.set(clusterId, this.normalize(base));
        }
        const base = this.clusterBases.get(clusterId);
        // Add small random noise (max magnitude 0.05 to ensure distance < 0.1)
        const noise = Array.from({ length: this.dimension }, () => (Math.random() - 0.5) * 0.05);
        const vec = base.map((v, i) => v + noise[i]);
        return this.normalize(vec);
    }
    /**
     * Get the configured dimension
     */
    getDimension() {
        return this.dimension;
    }
    /**
     * Batch embed multiple texts
     */
    async embedBatch(texts) {
        // Simulate slight processing delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return Promise.all(texts.map((t) => this.embed(t)));
    }
    /**
     * Normalize vector to unit length
     */
    normalize(vec) {
        const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
        // Prevent division by zero
        if (magnitude === 0) {
            return vec;
        }
        return vec.map((v) => v / magnitude);
    }
}
/**
 * Default configuration for local embedding
 */
export const DEFAULT_LOCAL_EMBEDDING_CONFIG = {
    modelId: "Xenova/all-MiniLM-L6-v2",
    dimension: 384,
};
/**
 * Local Embedding Provider
 *
 * Uses @xenova/transformers for local ONNX-based embedding.
 * Model is downloaded on first use and cached locally.
 *
 * [Constraint] LOCAL ONLY - No external API calls
 * [Default] all-MiniLM-L6-v2 (384 dimensions, ~50MB)
 */
export class LocalEmbeddingProvider {
    config;
    pipeline = null;
    // intentionally unused (reserved for UI integration / loading indicator)
    _isLoading = false;
    loadPromise = null;
    constructor(config = DEFAULT_LOCAL_EMBEDDING_CONFIG) {
        this.config = config;
    }
    /**
     * Initialize the embedding pipeline (lazy loading)
     */
    async ensureLoaded() {
        if (this.pipeline)
            return;
        if (this.loadPromise) {
            await this.loadPromise;
            return;
        }
        this._isLoading = true;
        this.loadPromise = this.loadPipeline();
        await this.loadPromise;
        this._isLoading = false;
    }
    /**
     * Load the transformer pipeline
     */
    async loadPipeline() {
        console.log(`[LocalEmbeddingProvider] Loading model: ${this.config.modelId}...`);
        const startTime = Date.now();
        try {
            // Dynamic import to avoid issues with ESM
            const { pipeline } = await import("@xenova/transformers");
            this.pipeline = await pipeline("feature-extraction", this.config.modelId, {
                quantized: true,
            });
            const loadTime = Date.now() - startTime;
            console.log(`[LocalEmbeddingProvider] Model loaded in ${loadTime}ms`);
        }
        catch (error) {
            console.error("[LocalEmbeddingProvider] Failed to load model:", error);
            throw error;
        }
    }
    /**
     * Embed single text → vector
     */
    async embed(text) {
        await this.ensureLoaded();
        const output = await this.pipeline(text, {
            pooling: "mean",
            normalize: true,
        });
        // Convert to plain array
        return Array.from(output.data);
    }
    /**
     * Batch embed multiple texts (TRUE batch processing)
     *
     * [Design] Pass array directly to pipeline for GPU/CPU parallelism
     * [Performance] ~5x faster than sequential calls
     *
     * @see reports/EMBEDDING_BATCH_ISSUE.md
     */
    async embedBatch(texts) {
        if (texts.length === 0)
            return [];
        await this.ensureLoaded();
        // Single call with array input - true batch processing
        const output = await this.pipeline(texts, {
            pooling: "mean",
            normalize: true,
        });
        // Output is a single Tensor with shape [batch_size, dimension]
        // data is a flat Float32Array: [vec1..., vec2..., vec3..., ...]
        const results = [];
        const dim = this.config.dimension;
        const data = output.data;
        for (let i = 0; i < texts.length; i++) {
            const start = i * dim;
            const end = start + dim;
            results.push(Array.from(data.slice(start, end)));
        }
        return results;
    }
    /**
     * Get the configured dimension
     */
    getDimension() {
        return this.config.dimension;
    }
    /**
     * Get model ID
     */
    getModelId() {
        return this.config.modelId;
    }
}
/**
 * Factory function to create embedding provider
 */
export function createEmbeddingProvider(type, config) {
    if (type === "local") {
        return new LocalEmbeddingProvider({
            ...DEFAULT_LOCAL_EMBEDDING_CONFIG,
            ...config,
        });
    }
    return new MockEmbeddingProvider();
}
//# sourceMappingURL=embedding-provider.js.map