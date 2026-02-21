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
export enum NodeFlag {
  // Temporal (bits 0-3)
  TemporalShort  = 0x0001,  // 短命: decay_rate × 1.3, ttl_decay × 1.2 (trending, breaking)
  TemporalLong   = 0x0002,  // 長命: decay_rate × 0.8, ttl_decay × 0.7 (timeless, stable)
  TemporalCyclic = 0x0004,  // 周期: TBD (seasonal resurface)
  Hot            = 0x0008,  // 高熱: 現在高い熱量を持つ (dynamic, Arbiter-assigned)

  // Density (bits 4-7)
  Dense      = 0x0010,  // 高密度: weight × 1.2 (theory, formula)
  Sparse     = 0x0020,  // 低密度: weight × 0.9 (casual, anecdotal)
  Composite  = 0x0040,  // 複合: weight × 1.1 (multi-concept fusion)
  Authority  = 0x0080,  // 権威: decay_rate × 0.95 (peer-reviewed, official)

  // Cognitive (bits 8-11) — epistemic state of information
  Sharp      = 0x0100,  // 明確: 一意的解釈、境界明瞭 (定義, 定理, 結論)
  Fuzzy      = 0x0200,  // 曖昧: 複数解釈可能、未確定 (仮説, 問い, 推測)
  Tensile    = 0x0400,  // 張力: 内部対立・矛盾を内包、未解決 (論争, パラドックス)
  Settled    = 0x0800,  // 収束: 決着済み、合意形成済み (定説, 法律, 標準)

  // Special (bits 12-15)
  UserMarked  = 0x1000,  // ユーザーマーク: immune to decay
  SystemCore  = 0x2000,  // システムコア: Frozen metabolism (Relic)
  Compressed  = 0x4000,  // 圧縮済み: Fossil化 (TODO: move to state)
  Candidate   = 0x8000,  // 候補: Ascension cooling period (TODO: move to state)
}

// State flags (dynamic, Arbiter-assigned)
// Frozen is represented by SystemCore (0x2000) for metabolism purposes
export const Frozen = NodeFlag.SystemCore;  // Alias for backwards compatibility

/**
 * CrystallizationRecord: 結晶化時に吸収されたノードの記録
 *
 * [Design] 琥珀化の瞬間に近傍ノードを「巻き込む」
 *   - 選出基準: h + w スコア上位（琥珀化と同じロジック）
 *   - supportRatio: 賛成寄りか反対寄りか（態度指標）
 */
export interface CrystallizationRecord {
  id: string;
  score: number;        // h + w（選出基準）
  supportRatio: number; // h / (h + d)（0-1、態度指標）
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
    // L1: Header
    tags?: string[];

    // L2: Summary
    summary?: string;

    // L3: Content (main data, visible in focus())
    content?: string;

    // L4: References
    sourceNodeId?: string;  // 派生元ノード（系譜追跡用）
    links?: string[];       // 関連ノード参照
    ref_url?: string;       // 外部URL参照

    // Amber専用: 結晶化履歴
    crystallization?: CrystallizationData;
  };
  snapshot: {
    vector: number[];
    weight: number;
    heat: number;
    decay: number;   // TTL decay coefficient (baseline 1000)
    flags: number;
  };
}

/**
 * SpatialField: 空間セルの物理的状態
 * flux（対流因子）: 分解が起きた場所に沈殿する活動痕跡。
 * 近傍ノードの TTL に少量ずつ染み出し、自然減衰する。
 */
export interface SpatialField {
  cellId: string;
  flux: number;
  nodeCount: number;
  avgHeat: number;
  lastUpdate: number;
}
