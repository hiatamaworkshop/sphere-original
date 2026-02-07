/**
 * Sphere Project - EnvForge
 *
 * [Role] Environmental Node の成型（環境調整）
 *
 * [Design] 異常検知に対応する環境ノードを生成
 *   - 配置位置は異常タイプに応じて決定
 *   - 環境への介入点として機能
 *
 * [Philosophy] Observatory からの環境調整リクエストに応答
 *   - 統計的異常に対する「処方箋」
 */
import type { SphereNode } from "@sphere/renal-core";
import type { IEnvForge, EnvironmentalRequest, EnvForgeConfig } from "./types.js";
/**
 * StatisticalEnvForge: 統計的配置による Environmental Node 生成
 */
export declare class StatisticalEnvForge implements IEnvForge {
    private config;
    constructor(config?: Partial<EnvForgeConfig>);
    /**
     * Environmental Node を成型する
     */
    forge(request: EnvironmentalRequest, projDB: Map<string, SphereNode>): SphereNode | null;
    /**
     * 異常タイプに応じた配置位置を決定（Top-K 方式）
     */
    private computePlacement;
    /**
     * メトリクス基準でノードを選択
     */
    private pickNodeByMetric;
    /**
     * ランダムにノードを選択
     */
    private pickRandomNode;
    /**
     * ランダム位置（フォールバック：ノードが0の場合のみ）
     */
    private randomPosition;
    /**
     * Environmental Node ID を生成
     */
    private generateEnvId;
}
//# sourceMappingURL=env-forge.d.ts.map