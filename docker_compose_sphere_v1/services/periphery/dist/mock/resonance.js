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
import { CAPSULE_SCHEMA_VERSION } from "../types/capsule.js";
export class ResonanceBot {
    serverUrl;
    clusterId;
    injectionCount = 0;
    constructor(serverUrl, clusterId = "A") {
        this.serverUrl = serverUrl;
        this.clusterId = clusterId;
    }
    /**
     * Generate a resonance capsule with clustered high-heat nodes
     */
    generateResonanceCapsule(iteration) {
        const topTier = [];
        const normalNodes = [];
        // Generate 3 top-tier nodes with cluster keyword
        // Heat is determined by config.baseHeat, differentiation is through tier/flags
        for (let i = 0; i < 3; i++) {
            topTier.push({
                tags: [`RESONANCE-CLUSTER-${this.clusterId}`, "amber-seed", "resonance"],
                summary: `[RESONANCE-CLUSTER-${this.clusterId}] Amber Seed ${iteration}-${i + 1} - High heat crystallization target`,
                flags: 0x0002, // Freshness flag for heat boost
            });
        }
        // Generate 2 normal nodes with cluster keyword
        for (let i = 0; i < 2; i++) {
            normalNodes.push({
                tags: [`RESONANCE-CLUSTER-${this.clusterId}`, "supporting", "resonance"],
                summary: `[RESONANCE-CLUSTER-${this.clusterId}] Supporting node ${iteration}-${i + 1}`,
                flags: 0,
            });
        }
        return {
            schemaVersion: CAPSULE_SCHEMA_VERSION,
            topTier,
            normalNodes,
            ghostNodes: [], // No ghosts for resonance testing
            evaluations: [],
            timestamp: Date.now(),
        };
    }
    /**
     * Submit a single resonance capsule
     */
    async submitResonanceCapsule() {
        this.injectionCount++;
        const capsule = this.generateResonanceCapsule(this.injectionCount);
        try {
            const response = await fetch(`${this.serverUrl}/sphere/contribute`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(capsule),
            });
            if (!response.ok) {
                const error = await response.json();
                console.error(`[Resonance] ❌ Injection ${this.injectionCount} rejected:`, error.errors);
                return;
            }
            const result = await response.json();
            console.log(`[Resonance] ✅ Injection ${this.injectionCount}: ${result.nodeCount} nodes ` +
                `(Cluster-${this.clusterId}, heat=85-100, expected: Amber → Link)`);
        }
        catch (error) {
            console.error(`[Resonance] ❌ Injection ${this.injectionCount} failed:`, error);
        }
    }
    /**
     * Start continuous resonance injection
     *
     * @param intervalMs Interval between injections (default: 5000ms)
     * @param maxInjections Maximum number of injections (default: unlimited)
     */
    async startResonance(intervalMs = 5000, maxInjections) {
        console.log("=".repeat(70));
        console.log("🔗 Spectral Link Resonance Test");
        console.log("=".repeat(70));
        console.log(`📡 Target: ${this.serverUrl}`);
        console.log(`🔮 Cluster: ${this.clusterId}`);
        console.log(`⏱️  Interval: ${intervalMs}ms`);
        console.log(`🎯 Goal: Force Amber ascension → Spectral Link formation`);
        console.log(`📊 Expected: Vector distance < 0.1 → Link threshold: 0.15`);
        if (maxInjections) {
            console.log(`🔢 Max injections: ${maxInjections}`);
        }
        console.log("=".repeat(70));
        console.log("");
        // Initial injection
        await this.submitResonanceCapsule();
        // Continuous injection
        const intervalId = setInterval(async () => {
            await this.submitResonanceCapsule();
            // Stop if max injections reached
            if (maxInjections && this.injectionCount >= maxInjections) {
                clearInterval(intervalId);
                console.log("");
                console.log("=".repeat(70));
                console.log(`✅ Resonance test complete: ${this.injectionCount} injections`);
                console.log("=".repeat(70));
                console.log("📊 Check node stats: GET http://localhost:3001/nodes/stats");
                console.log("🔗 Check for spectral links in server logs");
                console.log("👀 Or use: npm run observe");
                console.log("");
                process.exit(0);
            }
        }, intervalMs);
        // Graceful shutdown
        process.on("SIGINT", () => {
            console.log("\n\n[Resonance] Stopping resonance injection...");
            clearInterval(intervalId);
            console.log(`[Resonance] Total injections: ${this.injectionCount}`);
            process.exit(0);
        });
    }
}
// ===== Standalone Execution =====
// Run with: npm run resonance
if (process.argv[1] && process.argv[1].endsWith("resonance.ts")) {
    const serverUrl = process.env.SERVER_URL || "http://localhost:3001";
    const clusterId = process.env.CLUSTER_ID || "A";
    const intervalMs = parseInt(process.env.INTERVAL_MS || "5000", 10);
    const maxInjections = process.env.MAX_INJECTIONS
        ? parseInt(process.env.MAX_INJECTIONS, 10)
        : undefined;
    const bot = new ResonanceBot(serverUrl, clusterId);
    // Wait a bit for server to be ready
    setTimeout(async () => {
        await bot.startResonance(intervalMs, maxInjections);
    }, 1000);
}
//# sourceMappingURL=resonance.js.map