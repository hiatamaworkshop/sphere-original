/**
 * RenalCore: 心拍と代謝の制御クラス
 *
 * [Principle] 物理法則の執行
 * - 非知性的・決定論的
 * - payload を読まない
 * - 意味論的判断の禁止（metrics のみ）
 * - すべての定数は config から
 *
 * [Single Metabolic Process]
 * - Decay: 全ノードの Heat/TTL/Fertility を減衰させる
 *
 * [Removed - Handled by Periphery]
 * - Evaporation: CleanerFish (fossilize/decompose/evaporate)
 * - Erosion: Arbiter.shouldErode() + Bookkeeper.applyTransitions()
 * - Ascension: Arbiter.shouldAscend() + Bookkeeper.applyTransitions()
 * - Ghostification: 削除（Ghost は Packer のみが生成）
 * - LinkGeneration: NodeForge（外部生成）
 * - Pulse Broadcast: PulseBroadcaster（Periphery）
 */
import { NodeFlag } from "./core/types.js";
import { computeEffectiveDecayRate, computeEffectiveTTLDecay, computeEffectiveWeightDecay, hasFlag, } from "./lib/bit_math.js";
/**
 * RenalCore クラス
 *
 * 純粋な物理エンジン。Decay のみを担当。
 */
export class RenalCore {
    // データベース
    projectionDB;
    referenceDB;
    spatialFields;
    // 設定
    config;
    // 状態
    tickCount = 0;
    idleTickCount = 0; // Pause判定用の連続Idle Tick数
    lastNodeCount = 0; // 前回のノード数
    agentCount = 0; // 接続中エージェント数（Dormancy判定用）
    constructor(projectionDB, referenceDB, spatialFields, config) {
        this.projectionDB = projectionDB;
        this.referenceDB = referenceDB;
        this.spatialFields = spatialFields;
        this.config = config;
    }
    /**
     * 1心拍 (Tick) の実行
     * 物理的減衰のみを実行
     */
    tick(loadFactor) {
        this.tickCount++;
        // Pause判定: ノード数の変化を監視
        const currentNodeCount = this.projectionDB.size;
        if (currentNodeCount === this.lastNodeCount) {
            this.idleTickCount++;
        }
        else {
            this.idleTickCount = 0;
        }
        this.lastNodeCount = currentNodeCount;
        // [Telemetry] Tick開始 - 毎秒の心拍ログ（tickCount, 負荷係数, アイドル連続数）
        // console.log(`[RenalCore] tick=${this.tickCount} loadFactor=${loadFactor.toFixed(3)} idle=${this.idleTickCount}`);
        // Decay: 全ノードの Heat/TTL + Fertility を減衰させる
        this.processDecay(loadFactor);
        // [Telemetry] Tick終了
        this.logTelemetry();
    }
    /**
     * Decay: 全ノードの Heat/TTL と Fertility を減衰させる
     *
     * [Design] 物理的減衰を一括処理
     * - Node: Heat, TTL
     * - SpatialField: Fertility
     */
    processDecay(loadFactor) {
        // === Node Decay ===
        for (const node of this.projectionDB.values()) {
            // Frozen フラグがある場合は代謝を停止（relic, environment 等）
            if (hasFlag(node, NodeFlag.Frozen)) {
                continue;
            }
            // フラグに基づいて実効的なTTL減衰率を計算
            const effectiveTTLDecay = computeEffectiveTTLDecay(this.config.alpha * loadFactor, node.metrics.flg);
            node.metrics.ttl -= effectiveTTLDecay;
            // フラグに基づいて実効的な Heat 減衰を計算
            const effectiveHeatDecay = computeEffectiveDecayRate(this.config.heatDecayFactor, node.metrics.flg);
            node.metrics.h *= (1 - effectiveHeatDecay);
            // フラグに基づいて実効的な Weight 減衰を計算
            const effectiveWeightDecay = computeEffectiveWeightDecay(this.config.weightDecayFactor, node.metrics.flg);
            node.metrics.w *= (1 - effectiveWeightDecay);
            // [Telemetry] Decay実行時の詳細ログ（サンプリング）
            if (this.tickCount % 10 === 0 && node.id.endsWith("0")) {
                console.log(`[RenalCore] decay node=${node.id.slice(0, 8)} ` +
                    `ttl=${node.metrics.ttl.toFixed(1)} heat=${node.metrics.h.toFixed(3)} weight=${node.metrics.w.toFixed(1)}`);
            }
        }
        // === Spatial Field Decay ===
        for (const field of this.spatialFields.values()) {
            field.fertility *= (1 - this.config.fertilityDecayRate);
        }
    }
    // =========================================================================
    // [REMOVED] 全ての状態遷移・外部通信は Periphery に移行済み
    // - processEvaporation() → CleanerFish
    // - processErosion() → Arbiter + Bookkeeper
    // - processGhostification() → 削除（Ghost は Packer のみが生成）
    // - processAscension() → Arbiter + Bookkeeper
    // - processLinkGeneration() → NodeForge
    // - processPulseBroadcast() → PulseBroadcaster (Periphery)
    // 詳細: reports/RENALCORE_REFACTOR_MEMO.md
    // =========================================================================
    /**
     * Telemetry: Tick終了時の統計ログ
     */
    logTelemetry() {
        const stats = {
            relic: 0,
            amber: 0,
            active: 0,
            fossil: 0,
            ghost: 0,
            link: 0,
            environment: 0,
        };
        for (const node of this.projectionDB.values()) {
            stats[node.kind]++;
        }
        const totalFertility = [...this.spatialFields.values()].reduce((sum, f) => sum + f.fertility, 0);
        // [Telemetry] Tick統計ログ - kind別ノード数、総肥沃度
        // console.log(
        //   `[RenalCore] stats tick=${this.tickCount} ` +
        //   `relic=${stats.relic} amber=${stats.amber} active=${stats.active} ` +
        //   `fossil=${stats.fossil} ghost=${stats.ghost} link=${stats.link} ` +
        //   `environment=${stats.environment} fertility=${totalFertility.toFixed(3)}`
        // );
    }
    /**
     * Update agent count for Dormancy feature
     * [Design] When agentCount drops to 0, RenalCore can enter dormancy mode
     */
    updateAgentCount(count) {
        this.agentCount = count;
    }
}
//# sourceMappingURL=renalcore.js.map