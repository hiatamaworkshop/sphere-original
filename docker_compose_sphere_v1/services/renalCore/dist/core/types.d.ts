/**
 * Sphere Project - Core Types (Phase 1)
 * [Principle] POD (Plain Old Data): No methods, no logic.
 *
 * 16bit Flags & Core Interfaces
 * - 物性 vs 意味: Flags は「意味」ではなく「物性」
 * - Authority フラグ → decay_rate × 0.95（物理パラメータへ変換）
 * - Freshness フラグ → heat_boost × 1.2
 * - エージェントの足跡を物理定数に変換する
 */
/**
 * 16bit Node Flags: ノードの物理的性質を表すフラグ
 * 各ビットが物理的パラメータ（減衰率、熱量ブースト等）に変換される
 */
export declare enum NodeFlag {
    Authority = 1,// 権威性: decay_rate × 0.95 (decay減速)
    Freshness = 2,// 新鮮さ: heat_boost × 1.2 (heat増幅)
    Catalyst = 4,// 触媒性: 通過点として機能
    Ephemeral = 8,// 一時性: decay_rate × 1.5 (decay加速)
    Sticky = 16,// 粘着性: ttl減衰に抵抗（ttl_decay × 0.8）
    Volatile = 32,// 揮発性: 高速蒸発（ttl_decay × 1.3）
    Hot = 64,// 高熱: 現在高い熱量を持つ（動的付与）
    Frozen = 128,// 凍結: 代謝を一時停止（Relic用）
    Hub = 256,// ハブ性: 多数のリンクを持つ（weight × 1.1）
    Isolated = 512,// 孤立: 他ノードとの接続が弱い（fossilization促進）
    Spectral = 1024,// スペクトル: 洗練された経路の一部
    Constellation = 2048,// 星座: Amber間の強固なリンク
    UserMarked = 4096,// ユーザーマーク: 手動で重要指定
    SystemCore = 8192,// システムコア: Relic/不変
    Compressed = 16384,// 圧縮済み: Fossil化された
    Candidate = 32768
}
/**
 * CrystallizationRecord: 結晶化時に吸収されたノードの記録
 *
 * [Design] 琥珀化の瞬間に近傍ノードを「巻き込む」
 *   - 選出基準: h + w スコア上位（琥珀化と同じロジック）
 *   - supportRatio: 賛成寄りか反対寄りか（態度指標）
 */
export interface CrystallizationRecord {
    id: string;
    score: number;
    supportRatio: number;
}
/**
 * CrystallizationData: 結晶化処理の結果
 *
 * [Design] 琥珀の payload.crystallization に保存
 *   - absorbed: スコア上位の吸収ノード群
 *   - totalCount: 吸収したノード総数（active + ghost）
 *   - totalHeat: 吸収した熱量総計（ログ用）
 */
export interface CrystallizationData {
    absorbed: CrystallizationRecord[];
    totalCount: number;
    totalHeat: number;
}
/**
 * ReferenceRecord: 実体を持つノードの永続化レコード
 * Reference DB（原典）に保存される記録
 *
 * [Design] RefDB = 実体を持つすべてのノードの原典
 * - active: 外部 Contribution 時に記録（代謝する）
 * - ghost: TTL低下によりゴースト化（L1+L2のみアクセス可）
 * - fossil: さらにTTL低下により化石化（L1のみアクセス可）
 * - amber: Ascension 後（代謝する、評価により active へ降格）
 * - relic: システムコア（Frozen、代謝しない）
 *
 * [Access Level Hierarchy]
 *   L1: tags (header)
 *   L2: summary
 *   L3: content (main data)
 *   L4: sourceNodeId, links, ref_url (references)
 */
export interface ReferenceRecord {
    id: string;
    timestamp: number;
    kind: "active" | "ghost" | "fossil" | "amber" | "relic";
    payload: {
        tags?: string[];
        summary?: string;
        content?: string;
        sourceNodeId?: string;
        links?: string[];
        ref_url?: string;
        crystallization?: CrystallizationData;
    };
    snapshot: {
        vector: number[];
        weight: number;
        heat: number;
        decay: number;
        flags: number;
    };
}
/**
 * SpatialField: 空間セルの物理的状態
 * プランクトン（蒸発したノードの残留熱量）を管理する
 */
export interface SpatialField {
    cellId: string;
    fertility: number;
    nodeCount: number;
    avgHeat: number;
    lastUpdate: number;
}
//# sourceMappingURL=types.d.ts.map