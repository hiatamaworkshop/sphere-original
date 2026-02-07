/**
 * Sphere Project - Global Field Layer
 *
 * [Design] スフィア全体の「気候」を計算する Singleton
 * [Principle] 揮発性データのみ - DB に書き込まない
 * [Trigger] tick ベースで低頻度更新
 */
import type { SphereNode } from "@sphere/renal-core";
import type { IProjectionRepository } from "../repository/interfaces.js";
import type { GlobalAmbientField, LocalField, FieldConfig } from "./types.js";
/**
 * Global Field Layer - Singleton
 *
 * Periphery 内で完結、tick ベースで更新
 */
export declare class GlobalFieldLayer {
    private currentField;
    private config;
    private tickCounter;
    private dimension;
    constructor(dimension?: number, config?: Partial<FieldConfig>);
    /**
     * 空の磁場を生成
     */
    private createEmptyField;
    /**
     * tick 毎に呼び出される
     * 設定された間隔で磁場を更新
     */
    tick(projDB: IProjectionRepository): Promise<void>;
    /**
     * 磁場を即時更新 (tick 間隔を無視)
     */
    forceUpdate(projDB: IProjectionRepository): Promise<void>;
    /**
     * 磁場計算の本体
     */
    private update;
    /**
     * ランダムサンプリング (Fisher-Yates)
     */
    private randomSample;
    /**
     * サンプルノードから磁場成分を抽出
     *
     * [Design] dominantFlags は 30%+ 閾値方式
     * 単純な論理和だとノードが多いと全ビット ON になるため
     */
    private harvest;
    /**
     * Sigmoid 関数
     */
    private sigmoid;
    /**
     * 現在の Global Field を取得 (DB アクセスなし)
     */
    getGlobalField(): GlobalAmbientField;
    /**
     * Local Field を計算 (sense() 用)
     *
     * [Design] flags は 30%+ 閾値方式 (Global と同様)
     *
     * @param agentPosition エージェントの位置ベクトル
     * @param nearbyNodes sense() でヒットした近傍ノード
     */
    computeLocalField(agentPosition: number[], nearbyNodes: SphereNode[]): LocalField;
    /**
     * Global + Local を合成 (エージェント用)
     *
     * メモより:
     * const field =
     *   localField.scale(0.7)
     *   .add(globalField.scale(0.1))
     *   .add(agent.chaos.scale(0.2));
     */
    compositeDirection(agentPosition: number[], localField: LocalField, chaosVector?: number[]): number[];
    /**
     * デバッグ用: 現在の状態を取得
     */
    getDebugInfo(): {
        field: GlobalAmbientField;
        tickCounter: number;
        config: FieldConfig;
    };
}
//# sourceMappingURL=global-field-layer.d.ts.map