/**
 * Test script for LocalEmbeddingProvider
 *
 * [Usage] npm run test:embedding
 *
 * Tests:
 *   1. Model loading
 *   2. Single embedding
 *   3. Batch embedding
 *   4. Cosine similarity calculation
 */
import { MockEmbeddingProvider, createEmbeddingProvider, } from "../parser/embedding-provider.js";
/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
async function main() {
    console.log("=== Embedding Provider Test ===\n");
    // Test 1: Mock provider
    console.log("--- Test 1: Mock Provider ---");
    const mockProvider = new MockEmbeddingProvider();
    const mockVec = await mockProvider.embed("test text");
    console.log(`Mock vector dimension: ${mockVec.length}`);
    console.log(`Mock vector sample: [${mockVec.slice(0, 5).map(v => v.toFixed(4)).join(", ")}, ...]`);
    // Test 2: Local provider
    console.log("\n--- Test 2: Local Provider ---");
    console.log("Loading model... (first run downloads ~50MB)");
    const localProvider = createEmbeddingProvider("local");
    const startTime = Date.now();
    const vec1 = await localProvider.embed("machine learning algorithms");
    const loadTime = Date.now() - startTime;
    console.log(`Load + first embed time: ${loadTime}ms`);
    console.log(`Vector dimension: ${vec1.length}`);
    console.log(`Vector sample: [${vec1.slice(0, 5).map(v => v.toFixed(4)).join(", ")}, ...]`);
    // Test 3: Semantic similarity
    console.log("\n--- Test 3: Semantic Similarity ---");
    const texts = [
        "machine learning classification",
        "deep neural networks",
        "cooking recipes for dinner",
        "artificial intelligence research",
    ];
    const embedStart = Date.now();
    const vectors = await localProvider.embedBatch(texts);
    const embedTime = Date.now() - embedStart;
    console.log(`Batch embed time (${texts.length} texts): ${embedTime}ms`);
    // Calculate similarities
    console.log("\nSimilarity matrix:");
    console.log("                                  |  ML class  |  deep NN   |  cooking   |  AI        |");
    console.log("----------------------------------|------------|------------|------------|------------|");
    for (let i = 0; i < texts.length; i++) {
        const row = [texts[i].padEnd(32).slice(0, 32), "|"];
        for (let j = 0; j < texts.length; j++) {
            const sim = cosineSimilarity(vectors[i], vectors[j]);
            row.push(` ${sim.toFixed(4).padStart(8)} |`);
        }
        console.log(row.join(" "));
    }
    // Test 4: Expected relationships
    console.log("\n--- Test 4: Semantic Relationships ---");
    const mlSim = cosineSimilarity(vectors[0], vectors[1]); // ML vs deep NN
    const cookingSim = cosineSimilarity(vectors[0], vectors[2]); // ML vs cooking
    const aiSim = cosineSimilarity(vectors[0], vectors[3]); // ML vs AI
    console.log(`ML classification ↔ Deep NN: ${mlSim.toFixed(4)} (expect: high)`);
    console.log(`ML classification ↔ Cooking:  ${cookingSim.toFixed(4)} (expect: low)`);
    console.log(`ML classification ↔ AI:       ${aiSim.toFixed(4)} (expect: high)`);
    if (mlSim > cookingSim && aiSim > cookingSim) {
        console.log("\n✓ Semantic relationships verified!");
    }
    else {
        console.log("\n✗ Unexpected similarity pattern");
    }
    // Test 5: Factory function
    console.log("\n--- Test 5: Factory Function ---");
    const factoryMock = createEmbeddingProvider("mock");
    const factoryLocal = createEmbeddingProvider("local");
    console.log(`Factory mock provider: ${factoryMock.constructor.name}`);
    console.log(`Factory local provider: ${factoryLocal.constructor.name}`);
    console.log("\n=== All tests completed ===");
}
main().catch(console.error);
//# sourceMappingURL=test-embedding.js.map