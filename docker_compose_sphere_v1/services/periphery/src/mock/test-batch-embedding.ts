/**
 * Test: Batch vs Individual - Cosine Similarity Check
 */

import { pipeline } from "@xenova/transformers";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const texts = [
  "Machine learning algorithms for classification",
  "Database query optimization techniques",
  "TypeScript advanced type system features",
  "React component lifecycle hooks explained",
];

async function main() {
  console.log("Loading model...");
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    quantized: true,
  });
  console.log("Model loaded!\n");

  // Get individual vectors
  const individualVecs: number[][] = [];
  for (const text of texts) {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    individualVecs.push(Array.from(output.data as Float32Array));
  }

  // Get batch vectors
  const batchOutput = await extractor(texts, { pooling: "mean", normalize: true });
  const dim = batchOutput.dims[1];
  const batchVecs: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const start = i * dim;
    batchVecs.push(Array.from((batchOutput.data as Float32Array).slice(start, start + dim)));
  }

  // Compare
  console.log("=== Individual vs Batch Cosine Similarity ===\n");
  for (let i = 0; i < texts.length; i++) {
    const sim = cosineSimilarity(individualVecs[i], batchVecs[i]);
    console.log(`Text ${i}: "${texts[i].slice(0, 30)}..."`);
    console.log(`  Cosine similarity: ${sim.toFixed(6)} (${sim > 0.99 ? "✅ High" : "⚠️ Low"})`);
  }

  // Cross-text similarity (should be lower)
  console.log("\n=== Cross-text similarity (individual) ===\n");
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const sim = cosineSimilarity(individualVecs[i], individualVecs[j]);
      console.log(`Text ${i} vs ${j}: ${sim.toFixed(4)}`);
    }
  }
}

main().catch(console.error);
