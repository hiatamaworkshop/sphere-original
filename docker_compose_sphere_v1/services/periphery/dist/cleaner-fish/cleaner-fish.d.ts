/**
 * Sphere Project - Cleaner Fish
 *
 * [Role] 「死」の管理 - 自律的なガベージコレクション
 * [Principle] RenalCoreとは独立して動作
 * [Principle] DBを直接触らない（変換のみ、書き込みはPeriphery）
 *
 * 掃除魚は「通知を受信する」受動的な存在ではない。
 * 「餌に反応する」能動的な生態として振る舞う。
 */
import type { SphereNode } from "@sphere/renal-core";
/**
 * CleanerFishPersonality: 掃除魚の性格
 */
export interface CleanerFishPersonality {
    processingSpeed: number;
}
/**
 * CleanerFishConfig: システム設定
 */
export interface CleanerFishConfig {
    count: number;
    baseProcessingSpeed: number;
    baseFossilTTL: number;
    /** Max capacity multiplier at hunger=1.0 (linear interpolation from 1.0) */
    hungerCapacityMultiplier: number;
}
/**
 * FossilizationResult: 化石化の結果
 */
export interface FossilizationResult {
    nodeId: string;
    fossilNode: SphereNode;
    originalWeight: number;
    originalHeat: number;
}
/**
 * DecompositionResult: 分解の結果
 */
export interface DecompositionResult {
    nodeId: string;
    cellId: string;
    fertilityGain: number;
}
/**
 * GhostificationResult: ゴースト化の結果
 */
export interface GhostificationResult {
    nodeId: string;
    ghostNode: SphereNode;
}
/**
 * EnvironmentState: 環境状態（CleanerFish の行動を決定する外部要因）
 *
 * [Design] DB容量は必須、磁場は後で接続
 */
export interface EnvironmentState {
    /** DB容量比率 (0.0 - 1.0) */
    dbCapacityRatio: number;
    /** 磁場強度 (0.0 - 1.0) - 後日実装 */
    fieldIntensity?: number;
}
/**
 * BehaviorParams: 行動パラメータ（環境から算出）
 *
 * [Design] Hunger が閾値を押し上げる = TTL > 0 でも捕食対象に
 */
export interface BehaviorParams {
    /** 処理意欲 (0.0 - 1.0) */
    hunger: number;
    /** 捕食対象 TTL 閾値（この TTL 以下を捕食） */
    preyTTLThreshold: number;
}
/**
 * TransitionThresholds: 遷移閾値（config で定義）
 *
 * [Design] TTL ベースの Access Level 遷移
 *   Active (TTL > ghostifyTTL) → Ghost (TTL > fossilizeTTL) → Fossil → End
 */
export interface TransitionThresholds {
    /** Active → Ghost の TTL 閾値 */
    ghostifyTTL: number;
    /** Ghost → Fossil の TTL 閾値 */
    fossilizeTTL: number;
    /** 捕食保護閾値: h + w がこれ以上で decompose から保護 */
    protectionThreshold?: number;
}
/**
 * ProcessResult: 処理結果（全遷移を含む）
 */
export interface ProcessResult {
    /** Active → Ghost */
    ghostified: GhostificationResult[];
    /** Ghost → Fossil */
    fossilized: FossilizationResult[];
    /** Fossil/Ghost → End */
    decomposed: DecompositionResult[];
}
/**
 * デフォルト遷移閾値（仮値、後で調整）
 */
export declare const DEFAULT_TRANSITION_THRESHOLDS: TransitionThresholds;
/**
 * CleanerFish: 掃除魚クラス
 *
 * 自律的な生態として、空間を巡回し餌（TTL=0ノード）を処理する。
 */
export declare class CleanerFish {
    private readonly id;
    private readonly personality;
    private readonly config;
    constructor(id: string, personality: CleanerFishPersonality, config: CleanerFishConfig);
    /**
     * Ghostification: Active → Ghost
     * kind 変更のみ、データは全て維持
     *
     * [Design 2026-02-06] 遷移 = Access Level 切り替え
     *   - データ削除は decompose 時のみ
     *   - アクセス制限は API レスポンス時にフィルタリング
     */
    ghostify(node: SphereNode): GhostificationResult;
    /**
     * Fossilization: Ghost → Fossil
     * kind 変更 + Frozen フラグのみ、データは全て維持
     *
     * [Design 2026-02-06] 遷移 = Access Level 切り替え
     *   - データ削除は decompose 時のみ
     *   - アクセス制限は API レスポンス時にフィルタリング
     *   - TTL は Frozen フラグで凍結
     */
    fossilize(node: SphereNode): FossilizationResult;
    /**
     * Decomposition: fossil TTL=0 → fertility還元 + 削除
     */
    decompose(fossilNode: SphereNode, cellId: string): DecompositionResult;
    /**
     * Evaporation: ghost TTL=0 → 痕跡なし消滅
     *
     * [Design] Ghost は実体を持たないため、fertility 還元なし
     */
    evaporate(ghostNode: SphereNode): DecompositionResult;
    /**
     * 1tickで処理できるノード数
     */
    getProcessingCapacity(): number;
}
/**
 * CleanerFishPool: 掃除魚のメモリプール
 * 固定数の掃除魚を管理
 *
 * [Design] 環境駆動型 GC
 *   - DB容量 + 磁場 → Hunger → 捕食閾値
 *   - TTL ベースの Access Level 遷移
 */
export declare class CleanerFishPool {
    private readonly fish;
    private readonly config;
    constructor(config: CleanerFishConfig);
    /**
     * 性格を生成（基本は高圧縮、小さな揺らぎ）
     */
    private generatePersonality;
    /**
     * 環境状態から行動パラメータを算出
     *
     * [Design] DB容量ベースの閾値テーブル（やや過敏な性格）
     *   - 通常 (<50%): TTL <= 40 (積極的に遷移)
     *   - 警戒 (~70%): TTL <= 80 (Fossil 対象)
     *   - 限界 (>90%): TTL <= 200 (Ghost/Fossil 対象)
     */
    private computeBehavior;
    /**
     * 保護チェック: エージェントの関心があるノードは捕食しない
     *
     * [Design] 関心スコアが閾値以上 = 誰かが見ている = 消すべきではない
     *   - Ghost: h + w で判定（weight も decay する）
     *   - Fossil: h のみで判定（weight は Frozen で凍結されているため）
     *
     * @param node 判定対象ノード
     * @param threshold 保護閾値
     * @returns true if protected, false otherwise
     */
    private shouldProtect;
    /**
     * 遷移候補を抽出
     *
     * [Design] TTL ベースの Access Level 遷移
     *   - Active (TTL <= ghostifyTTL) → Ghost
     *   - Ghost (TTL <= fossilizeTTL) → Fossil
     *   - Fossil/Ghost (TTL <= preyTTLThreshold) → End
     */
    private findTransitionCandidates;
    /**
     * 全掃除魚で餌を処理（環境駆動版）
     *
     * [Design] 環境状態から行動パラメータを算出し、遷移を実行
     */
    process(nodes: SphereNode[], getCellId: (nodeId: string) => string, env: EnvironmentState, thresholds?: TransitionThresholds): ProcessResult;
}
/**
 * デフォルト設定
 */
export declare const DEFAULT_CLEANER_FISH_CONFIG: CleanerFishConfig;
//# sourceMappingURL=cleaner-fish.d.ts.map