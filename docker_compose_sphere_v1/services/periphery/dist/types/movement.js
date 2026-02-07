/**
 * Sphere Project - Agent Movement Types
 *
 * [Design] Based on MOVE_DESIGN_MEMO.md
 * [Principle] Two-layer architecture:
 *   - Perception Layer: quantized, noisy (agent sees this)
 *   - Computation Layer: 384-dim precise (internal)
 */
/**
 * Default scan configuration
 */
export const DEFAULT_SCAN_CONFIG = {
    baseRange: 0.4,
    heatBoost: {
        low: 0.0,
        mid: 0.1,
        high: 0.2,
    },
    maxResults: 20,
    minHeat: 0.1,
};
/**
 * Default move configuration (for all-MiniLM-L6-v2, 384-dim)
 */
export const DEFAULT_MOVE_CONFIG = {
    vectorDimension: 384,
    distanceThresholds: {
        near: 0.15,
        mid: 0.40,
    },
    heatThresholds: {
        low: 0.3,
        mid: 0.7,
    },
    physics: {
        inertiaWeight: 0.3,
        noiseWeight: 0.1,
        stepSize: 0.05,
    },
    scan: DEFAULT_SCAN_CONFIG,
};
//# sourceMappingURL=movement.js.map