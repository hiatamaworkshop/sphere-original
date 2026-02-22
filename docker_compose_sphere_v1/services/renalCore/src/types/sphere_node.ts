/**
 * Sphere Project - Genesis Edition
 *
 * [Principle] POD (Plain Old Data):
 * This file defines only data structures. No methods, no logic.
 * Optimized for serialization and future Rust conversion.
 */

/**
 * 存在の階層 (Phase of Existence)
 * 意味の密度と熱量によって決定される。
 *
 * [Note] plankton は SpatialField.flux（対流因子）で表現される（ノードではない）
 */
export type NodeKind =
  | "relic"       // 永続
  | "amber"       // 結晶化
  | "active"      // 活性
  | "fossil"      // 風化
  | "ghost"       // 痕跡
  | "environment";// 環境

/**
 * スフィア・ノードの基本構造 (The Entity)
 *
 * [Access Level Hierarchy]
 *   L1: tags (header) - scanL1() で見える
 *   L2: summary - sense() で見える
 *   L3: content (main data) - focus() で見える
 *   L4: sourceNodeId, links, ref_url - focus() で見える
 */
export interface SphereNode {
  id: string;
  kind: NodeKind;
  vector: number[];  // 384-dim vector (or as configured)
  payload?: {
    // L1: Header
    tags?: string[];

    // L2: Summary
    summary?: string;

    // L3: Content (main data, visible in focus())
    content?: string;

    // L4: References (visible in focus())
    sourceNodeId?: string;  // Derivation origin (lineage)
    links?: string[];       // Related node references
    ref_url?: string;       // External URL reference
  };
  metrics: {
    w: number;       // weight
    d: number;       // decay coefficient
    h: number;       // heat
    ttl: number;     // time-to-live
    flg: number;     // 16-bit flags
    stayTime?: number;
    immuneMod?: number; // [Node immunity] heat decay multiplier (default 1.0, clamp 0.97~1.03)
  };
  timestamp: number;
}
