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
import type { SphereNode } from "@sphere/renal-core";
import type { EnvironmentalRequest, ForgeConfig, ForgeResult } from "./types.js";
export * from "./types.js";
export { StatisticalEnvForge } from "./env-forge.js";
/**
 * NodeForge: 内部発生ノードの成型工房
 *
 * Usage:
 *   const forge = new NodeForge(config);
 *   const envResult = forge.forgeEnvironmental(request, projDB);
 */
export declare class NodeForge {
    private config;
    private envForge;
    constructor(config?: Partial<ForgeConfig>);
    /**
     * Environmental Node を成型
     */
    forgeEnvironmental(request: EnvironmentalRequest, projDB: Map<string, SphereNode>): ForgeResult;
    /**
     * EnvForge インスタンスを作成
     */
    private createEnvForge;
    /**
     * 現在の設定を取得
     */
    getConfig(): ForgeConfig;
}
//# sourceMappingURL=index.d.ts.map