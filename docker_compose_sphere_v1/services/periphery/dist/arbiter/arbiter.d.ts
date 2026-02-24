/**
 * Sphere Project - Arbiter
 *
 * 審判者（Arbiter）= Sphere空間の監視・判定者
 *
 * [Role] 水面を見下ろし、状態変化を検出・判定する
 * [Principle] RenalCore が物理を実行し、Arbiter が遷移を観測・判定
 *
 * [Responsibilities]
 * 1. observe(): Heat/Weight 閾値を監視 → 昇天/風化の候補をキューイング
 * 2. diff(): 事後の状態変化を検出 → TTL切れノードを CleanerFish へ
 *
 * [Design] キューイングのみ、実行は Bookkeeper が担当
 *   - Arbiter は「判定」のみ（node.kind を変更しない）
 *   - Bookkeeper が「実行」（node.kind を変更 + DB永続化）
 *
 * [Symbiosis]
 *   - Arbiter finds prey → CleanerFish processes (Fossilization/Planktonization)
 *   - Arbiter queues transitions → Bookkeeper executes (Ascension/Erosion)
 */
import type { SphereNode, NodeKind, CrystallizationData } from "@sphere/renal-core";
/**
 * Arbiter 設定（Ascension/Erosion 閾値）
 */
export interface ArbiterConfig {
    erosionScoreThreshold: number;
    pauseErosionBoost: number;
    hotHeatThreshold: number;
    ascensionCooldownMs: number;
    ascensionScoreThreshold: number;
    lowerThresholdRatio: number;
    referenceNodeCount?: number;
    ascensionThresholdFloor?: number;
    ascensionThresholdCap?: number;
    dropoutResetH?: number;
    dropoutResetW?: number;
    dropoutResetD?: number;
    absorptionEnabled?: boolean;
    absorptionRadius?: number;
    absorptionFactor?: number;
    maxAbsorbedNodes?: number;
    immuneWeight?: number;
    immuneRatioCap?: number;
    revivalThreshold?: number;
    revivalDThreshold?: number;
    protectionThreshold?: number;
}
/**
 * Snapshot of node states (id → kind, ttl, heat)
 */
export type StateSnapshot = Map<string, {
    kind: NodeKind;
    ttl: number;
    heat: number;
}>;
/**
 * Dynamic flag update (Arbiter が判定、Bookkeeper が実行)
 */
export interface FlagUpdate {
    node: SphereNode;
    add: number;
    remove: number;
    /**
     * Metrics reset on candidate dropout (fake amber punishment)
     * [Design] 冷却期間失敗 → デフォルトメトリクスに戻す
     */
    resetMetrics?: {
        h: number;
        w: number;
        d: number;
    };
}
/**
 * Ascension スコア計算（確定: h + w のみ）
 *
 * [Design] 琥珀化 = 「死を回避する特権」
 *   - d は琥珀化"前"の生存競争（TTL 減衰速度）
 *   - h / w は琥珀化"後"の正当性（資格）
 *   - 世界を分けることで物語も挙動もきれい
 *
 * @param h Heat メトリクス
 * @param w Weight メトリクス
 * @returns Ascension スコア
 */
export declare function computeAscensionScore(h: number, w: number): number;
/**
 * CrystallizationResult: 結晶化処理の結果（Bookkeeper へ渡す）
 *
 * [Design] 昇天確定時に近傍ノードを吸収した結果
 *   - data: RefDB の payload.crystallization に保存
 *   - absorbedNodeIds: ProjDB + RefDB から削除するノード ID
 */
export interface CrystallizationResult {
    data: CrystallizationData;
    absorbedNodeIds: string[];
}
/**
 * 遷移キュー（Bookkeeper が実行する）
 */
export interface TransitionQueue {
    /** Nodes that should ascend (active → amber) */
    shouldAscend: SphereNode[];
    /** Nodes that should erode (amber → active) */
    shouldErode: SphereNode[];
    /** Nodes that should revive (fossil → active) */
    shouldRevive: SphereNode[];
    /** Dynamic flag updates (Hot, Hub, Isolated, etc.) */
    flagUpdates: FlagUpdate[];
    /** Crystallization results for ascending nodes (nodeId → result) */
    crystallizations: Map<string, CrystallizationResult>;
}
/**
 * 検出結果（事後の状態変化）
 */
export interface StateChanges {
    /** Nodes that became amber (active → amber) */
    ascended: SphereNode[];
    /** Nodes that eroded (amber → active) */
    eroded: SphereNode[];
    /** Nodes with TTL <= 0 (prey for cleaner fish, including ghost) */
    expired: SphereNode[];
}
/**
 * CandidateEntry: Ascension 候補のトラッキング
 *
 * [Design] 冷却期間中の候補を監視
 *   - 評価凍結: Candidate フラグ持ちは評価を受け付けない
 *   - 下方スレッショルド: initialScore × effectiveRatio を維持必要
 *   - effectiveRatio = lowerThresholdRatio + immuneWeight × max(0, immuneMod - 1.0)
 *   - 動的スコア再計算: 毎 observe() でスコアを再計算
 */
export interface CandidateEntry {
    /** 対象ノード ID */
    nodeId: string;
    /** 候補登録時刻 */
    candidateSince: number;
    /** 登録時の複合スコア */
    initialScore: number;
    /** 下方スレッショルド = initialScore × effectiveRatio（免疫信号で調整済み） */
    lowerThreshold: number;
    /** 参考用: 登録時のメトリクス */
    snapshot: {
        h: number;
        w: number;
        d: number;
    };
    /** 登録時の immuneMod（免疫信号スナップショット、ログ用） */
    snapshotImmuneMod: number;
}
/**
 * Arbiter: ProjDB を監視し、状態遷移を判定・検出する
 *
 * Usage:
 *   const arbiter = new Arbiter(config);
 *   const queue = arbiter.observe(projDB, { isPaused });  // 即時判定
 *   await bookkeeper.applyTransitions(queue);              // 実行
 */
export declare class Arbiter {
    private config;
    private candidateStore;
    private currentEffectiveThreshold;
    constructor(config: ArbiterConfig);
    /**
     * Take a snapshot of current node states
     */
    snapshot(projDB: Map<string, SphereNode>): StateSnapshot;
    /**
     * Observe ProjDB and queue transitions (判定のみ、実行しない)
     *
     * [Design] Arbiter は node.kind を変更しない
     * - 昇天/風化の「候補」を返すだけ
     * - 動的 flags の更新候補も返す
     * - 実際の変更は Bookkeeper が行う
     *
     * [Ascension Cooldown]
     * - 複合スコア閾値超過 → Candidate フラグ付与（候補登録）
     * - 冷却期間中: 毎 observe() でスコア再計算
     * - 下方スレッショルド未達 → 脱落（Candidate 除去）
     * - 冷却期間完了 + スコア維持 → Amber 昇格
     *
     * @param projDB - Current projection database
     * @param options.isPaused - Whether Sphere is paused
     */
    observe(projDB: Map<string, SphereNode>, options?: {
        isPaused?: boolean;
    }): TransitionQueue;
    /**
     * Monitor existing candidates: dropout or promotion
     *
     * [Design] 毎 observe() で全候補をチェック
     *   - スコア再計算: currentScore = (h + w) / (1 + d / 1000)
     *   - currentScore < lowerThreshold → 脱落（Candidate 除去）
     *   - 冷却期間完了 AND currentScore ≥ lowerThreshold → Amber 昇格
     */
    private monitorCandidates;
    /**
     * Check if node should become a new candidate
     *
     * [Design] 複合スコアが閾値を超えたら候補登録
     *   - Candidate フラグ付与
     *   - 下方スレッショルド = initialScore × effectiveRatio
     *
     * [Immune Threshold Amplification]
     *   免疫系の微細な信号 (immuneMod ±0.03) を増幅し、下限スレッショルドに反映
     *   - immuneMod ≈ 1.0 (organic): effectiveRatio = baseRatio (0.9) → 余裕あり
     *   - immuneMod ≈ 1.02+ (suspicious): effectiveRatio → cap (0.99) → decay で脱落
     *   immuneWeight = (avgRetention - baseRatio) / criticalImmuneDev
     */
    private checkNewCandidate;
    /**
     * Detect changes between snapshot and current state (事後検出)
     *
     * Note: Bookkeeper が遷移を実行した後に呼び出す
     * - 実際に起きた変化を検出
     * - TTL切れノードを CleanerFish へ報告（ghost 含む）
     */
    diff(before: StateSnapshot, projDB: Map<string, SphereNode>): StateChanges;
    /**
     * Erosion 判定: Amber → Active
     * [Design] Ascension と対称: h + w スコアで判定
     *   Ascension: h + w >= ascensionScoreThreshold (500) → 琥珀化
     *   Erosion:   h + w <  erosionScoreThreshold (200)   → 琥珀解除
     *   heat (注目度) と weight (情報価値) の両方が低下して初めて Erosion
     */
    private shouldErode;
    /**
     * Revival 判定: Fossil → Active
     *
     * [Design] h×w 積 + d 安定性ゲート
     *   - h×w >= revivalThreshold (両メトリクス必要、単発評価では達成不可)
     *   - d <= revivalDThreshold (複数回「安定」と評価された)
     *
     * [Philosophy] 一度の評価では復活できない = 複数の関心が必要
     */
    private shouldRevive;
    /**
     * Compute dynamic flag updates for a node
     *
     * [Dynamic Flags]
     *   - Hot: heat > hotHeatThreshold
     *
     * Hub/Isolated dynamic flags removed — linkCounts never supplied.
     * Static Hub/Isolated via Tagger keyword matching is unaffected.
     *
     * @returns FlagUpdate if any changes needed, null otherwise
     */
    private computeFlagUpdate;
    private hasFlag;
    /**
     * Apply flag update to node (utility for Bookkeeper)
     *
     * @returns New flags value
     */
    static applyFlagUpdate(currentFlags: number, update: FlagUpdate): number;
    private logQueue;
    /**
     * Log summary of detected changes
     */
    logChanges(changes: StateChanges): void;
    /**
     * Absorb nearby nodes and crystallize on successful ascension
     *
     * [Design] 冷却期間成功後に実行
     *   - 近傍 = vector 距離が absorptionRadius 以内
     *   - 削除対象 = active, ghost（amber, link, relic は除外）
     *   - 選出対象 = active のみ（ghost は削除のみ）
     *   - 選出 = h + w スコア上位（琥珀化と同じロジック）
     *   - 継承 = 選出上位ノードの平均 h, w × factor を琥珀に加算
     *   - 吸収後は ProjDB + RefDB から削除
     *
     * [Principle] 反対意見でも優れていれば高スコア
     *
     * @param node - 昇天するノード
     * @param projDB - Projection Database
     * @returns CrystallizationResult if any nodes absorbed, null otherwise
     */
    private absorbAndCrystallize;
}
//# sourceMappingURL=arbiter.d.ts.map