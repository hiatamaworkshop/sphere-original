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
export declare function cosineDistance(a: number[], b: number[]): number;
/**
 * Normalize vector to unit length
 */
export declare function normalize(vec: number[]): number[];
/**
 * Add two vectors element-wise
 */
export declare function add(a: number[], b: number[]): number[];
/**
 * Subtract vector b from vector a
 */
export declare function subtract(a: number[], b: number[]): number[];
/**
 * Scale vector by scalar value
 */
export declare function scale(vec: number[], scalar: number): number[];
/**
 * Generate random unit vector of given dimension
 * [Principle] Dimension is always a parameter, never hardcoded
 */
export declare function randomUnitVector(dim: number): number[];
/**
 * Calculate weighted sum of multiple vectors
 */
export declare function weightedSum(vectors: number[][], weights: number[]): number[];
//# sourceMappingURL=vector.d.ts.map