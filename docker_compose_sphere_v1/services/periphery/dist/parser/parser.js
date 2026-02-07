/**
 * Sphere Project - Parser
 *
 * [Role] Embedding Service / Vectorizer
 * [Function] Convert text to 1536-dim vectors
 * [Stateless] Coordinates defined by embedding model
 */
export class Parser {
    provider;
    config;
    constructor(provider, config) {
        this.provider = provider;
        this.config = config;
    }
    /**
     * Vectorize single summary
     */
    async vectorize(summary) {
        return this.provider.embed(summary);
    }
    /**
     * Vectorize batch of summaries
     */
    async vectorizeBatch(summaries) {
        return this.provider.embedBatch(summaries);
    }
    /**
     * Vectorize tags (join and embed)
     * Used for movement vectorization
     */
    async vectorizeTags(tags) {
        const combined = tags.join(" ");
        return this.provider.embed(combined);
    }
    /**
     * Get vector dimension from config
     */
    getVectorDimension() {
        return this.config.parser.vectorDimension;
    }
}
//# sourceMappingURL=parser.js.map