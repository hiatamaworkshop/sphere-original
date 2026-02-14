/**
 * Sphere Project - Core Types (Phase 1)
 * [Principle] POD (Plain Old Data): No methods, no logic.
 *
 * 16bit Flags & Core Interfaces
 * - 物性 vs 意味: Flags は「意味」ではなく「物性」
 * - Authority フラグ → decay_rate × 0.95（物理パラメータへ変換）
 * - TemporalShort フラグ → decay × 1.3, ttl_decay × 1.2
 * - エージェントの足跡を物理定数に変換する
 */
/**
 * 16bit Node Flags: ノードの物理的性質を表すフラグ
 * 各ビットが物理的パラメータ（減衰率、熱量ブースト等）に変換される
 *
 * Design: FLAG_SYSTEM_REDESIGN.md
 * - Temporal (bits 0-3): time properties
 * - Density (bits 4-7): structural complexity
 * - Cognitive (bits 8-11): perceptual impact
 * - Special (bits 12-15): system/user metadata
 */
export declare enum NodeFlag {
    TemporalShort = 1,// 短命: decay_rate × 1.3, ttl_decay × 1.2 (trending, breaking)
    TemporalLong = 2,// 長命: decay_rate × 0.8, ttl_decay × 0.7 (timeless, stable)
    TemporalCyclic = 4,// 周期: TBD (seasonal resurface)
    Hot = 8,// 高熱: 現在高い熱量を持つ (dynamic, Arbiter-assigned)
    Dense = 16,// 高密度: weight × 1.2 (theory, formula)
    Sparse = 32,// 低密度: weight × 0.9 (casual, anecdotal)
    Composite = 64,// 複合: weight × 1.1 (multi-concept fusion)
    Authority = 128,// 権威: decay_rate × 0.95 (peer-reviewed, official)
    Sharp = 256,// 明確: 一意的解釈、境界明瞭 (定義, 定理, 結論)
    Fuzzy = 512,// 曖昧: 複数解釈可能、未確定 (仮説, 問い, 推測)
    Tensile = 1024,// 張力: 内部対立・矛盾を内包、未解決 (論争, パラドックス)
    Settled = 2048,// 収束: 決着済み、合意形成済み (定説, 法律, 標準)
    UserMarked = 4096,// ユーザーマーク: immune to decay
    SystemCore = 8192,// システムコア: Frozen metabolism (Relic)
    Compressed = 16384,// 圧縮済み: Fossil化 (TODO: move to state)
    Candidate = 32768
}
export declare const Frozen = NodeFlag.SystemCore;
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