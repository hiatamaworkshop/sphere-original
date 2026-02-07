/**
 * Sphere Project - Resonance Script
 *
 * [Role] Spectral Link Formation Testing
 * [Function] Inject clustered nodes to test vector clustering and link formation
 * [Purpose] Verify spectral link metabolism in RenalCore
 *
 * Strategy:
 * 1. Generate nodes with [RESONANCE-CLUSTER-X] keyword
 * 2. MockEmbeddingProvider creates vectors near cluster X's base
 * 3. Vector distance < 0.1 ensures link formation (threshold: 0.15)
 *
 * [NOTE] initialHeat is no longer supported - heat is determined by config.baseHeat
 * To test Ascension/dropout, use one of:
 *   - Set higher config.packer.baseHeat temporarily
 *   - Use evaluate() API to raise node heat
 *   - Modify tierWeights so topTier + baseHeat > 1000
 */
export declare class ResonanceBot {
    private serverUrl;
    private clusterId;
    private injectionCount;
    constructor(serverUrl: string, clusterId?: string);
    /**
     * Generate a resonance capsule with clustered high-heat nodes
     */
    private generateResonanceCapsule;
    /**
     * Submit a single resonance capsule
     */
    submitResonanceCapsule(): Promise<void>;
    /**
     * Start continuous resonance injection
     *
     * @param intervalMs Interval between injections (default: 5000ms)
     * @param maxInjections Maximum number of injections (default: unlimited)
     */
    startResonance(intervalMs?: number, maxInjections?: number): Promise<void>;
}
//# sourceMappingURL=resonance.d.ts.map