/**
 * Sphere Project - NodeForge
 *
 * [Role] 内部発生ノードの成型工房（Router）
 *
 * [Design] 外部入力（Capsule）とは別経路で生成されるノード
 *   - Environmental Node: 環境調整
 *
 * [Principle] 工法（Strategy）をスイッチ可能
 *   - 設定で異なる実装に切り替え可能
 *   - デフォルト: statistical (Environmental)
 */
import { StatisticalEnvForge } from "./env-forge.js";
// Re-export types
export * from "./types.js";
export { StatisticalEnvForge } from "./env-forge.js";
/**
 * デフォルト設定
 */
const DEFAULT_FORGE_CONFIG = {
    environmental: {
        strategy: "statistical",
        initialTTL: 500,
        initialHeat: 0.05,
        initialWeight: 0.4,
        decayRate: 0.02,
    },
};
/**
 * NodeForge: 内部発生ノードの成型工房
 *
 * Usage:
 *   const forge = new NodeForge(config);
 *   const envResult = forge.forgeEnvironmental(request, projDB);
 */
export class NodeForge {
    config;
    envForge;
    constructor(config = {}) {
        this.config = {
            environmental: { ...DEFAULT_FORGE_CONFIG.environmental, ...config.environmental },
        };
        // 工法に応じた Forge を選択
        this.envForge = this.createEnvForge();
        console.log(`[NodeForge] Initialized: env=${this.config.environmental.strategy}`);
    }
    /**
     * Environmental Node を成型
     */
    forgeEnvironmental(request, projDB) {
        try {
            const node = this.envForge.forge(request, projDB);
            if (node) {
                return { success: true, node };
            }
            else {
                return {
                    success: false,
                    error: "Failed to forge environmental node (could not determine placement)",
                };
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[NodeForge] Environmental forge error: ${message}`);
            return { success: false, error: message };
        }
    }
    /**
     * EnvForge インスタンスを作成
     */
    createEnvForge() {
        switch (this.config.environmental.strategy) {
            case "cluster_based":
                // 将来実装
                console.warn("[NodeForge] cluster_based not implemented, using statistical");
                return new StatisticalEnvForge(this.config.environmental);
            case "statistical":
            default:
                return new StatisticalEnvForge(this.config.environmental);
        }
    }
    /**
     * 現在の設定を取得
     */
    getConfig() {
        return { ...this.config };
    }
}
//# sourceMappingURL=index.js.map