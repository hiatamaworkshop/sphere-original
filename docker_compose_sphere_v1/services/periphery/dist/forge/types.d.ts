/**
 * Sphere Project - NodeForge Types
 *
 * [Role] 内部発生ノードの成型に関する型定義
 *
 * [Design] 外部入力（Capsule）とは別経路で生成されるノード
 *   - Environmental Node: Observatory が検出した異常への対応
 */
import type { SphereNode } from "@sphere/renal-core";
/**
 * 異常タイプ
 */
export type AnomalyType = "attractant_drop" | "repellent_spike" | "density_drop" | "flow_drop";
/**
 * Environmental Node 生成リクエスト
 * Observatory から送信される
 */
export interface EnvironmentalRequest {
    /** 異常タイプ */
    anomalyType: AnomalyType;
    /** 深刻度（Z-score） */
    severity: number;
    /** 検出時の信号値 */
    signal?: {
        a: number;
        r: number;
        d: number;
        f: number;
    };
    /** 推奨アクション（参考情報） */
    suggestedAction?: string;
}
/**
 * Environmental Node 成型インターフェース
 * 工法をスイッチ可能にする
 */
export interface IEnvForge {
    /**
     * Environmental Node を成型する
     * @param request リクエスト
     * @param projDB Projection DB への参照
     * @returns 成型された SphereNode、または null（失敗時）
     */
    forge(request: EnvironmentalRequest, projDB: Map<string, SphereNode>): SphereNode | null;
}
/**
 * EnvForge 設定（整数スケール: h/w閾値1000, d基準1000）
 */
export interface EnvForgeConfig {
    /** 工法（デフォルト: "statistical"） */
    strategy?: "statistical" | "cluster_based";
    /** 初期 TTL */
    initialTTL?: number;
    /** 初期 Heat（整数: 50） */
    initialHeat?: number;
    /** 初期 Weight（整数: 400、影響範囲） */
    initialWeight?: number;
    /** Decay 係数（整数: 1500、早めに減衰） */
    decayRate?: number;
}
/**
 * NodeForge 全体設定
 */
export interface ForgeConfig {
    environmental: EnvForgeConfig;
}
/**
 * Forge 処理結果
 */
export interface ForgeResult {
    success: boolean;
    node?: SphereNode;
    error?: string;
}
//# sourceMappingURL=types.d.ts.map