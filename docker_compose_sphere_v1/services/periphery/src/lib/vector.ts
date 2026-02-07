/**
 * Sphere Project - Vector Operations
 *
 * [Principle] Dimension-independent: works with any embedding model
 * [Constraint] No hardcoded dimensions - always derive from input length
 */

/**
 * Calculate cosine distance between two vectors
 * @returns Distance in range [0, 2] where 0 = identical, 2 = opposite
 */
export function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 1; // Zero vectors treated as orthogonal

  const similarity = dotProduct / magnitude;
  return 1 - similarity; // Convert similarity to distance
}

/**
 * Normalize vector to unit length
 */
export function normalize(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map((v) => v / magnitude);
}

/**
 * Add two vectors element-wise
 */
export function add(a: number[], b: number[]): number[] {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  return a.map((v, i) => v + b[i]);
}

/**
 * Subtract vector b from vector a
 */
export function subtract(a: number[], b: number[]): number[] {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  return a.map((v, i) => v - b[i]);
}

/**
 * Scale vector by scalar value
 */
export function scale(vec: number[], scalar: number): number[] {
  return vec.map((v) => v * scalar);
}

/**
 * Generate random unit vector of given dimension
 * [Principle] Dimension is always a parameter, never hardcoded
 */
export function randomUnitVector(dim: number): number[] {
  const vec = Array.from({ length: dim }, () => Math.random() - 0.5);
  return normalize(vec);
}

/**
 * Linear interpolation between two vectors
 * @param t Interpolation factor [0, 1]
 */
export function lerp(a: number[], b: number[], t: number): number[] {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  return a.map((v, i) => v + (b[i] - v) * t);
}

/**
 * Calculate weighted sum of multiple vectors
 */
export function weightedSum(
  vectors: number[][],
  weights: number[]
): number[] {
  if (vectors.length === 0) {
    throw new Error("Empty vector list");
  }
  if (vectors.length !== weights.length) {
    throw new Error("Vectors and weights count mismatch");
  }

  const dim = vectors[0].length;
  const result = new Array(dim).fill(0);

  for (let i = 0; i < vectors.length; i++) {
    const vec = vectors[i];
    const w = weights[i];
    for (let j = 0; j < dim; j++) {
      result[j] += vec[j] * w;
    }
  }

  return result;
}

/**
 * Get vector dimension
 */
export function getDimension(vec: number[]): number {
  return vec.length;
}
