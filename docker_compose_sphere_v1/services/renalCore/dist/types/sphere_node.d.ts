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
export type NodeKind = "relic" | "amber" | "active" | "fossil" | "ghost" | "environment";
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
    vector: number[];
    payload?: {
        tags?: string[];
        summary?: string;
        content?: string;
        sourceNodeId?: string;
        links?: string[];
        ref_url?: string;
    };
    metrics: {
        w: number;
        d: number;
        h: number;
        ttl: number;
        flg: number;
        stayTime?: number;
        immuneMod?: number;
    };
    timestamp: number;
}
//# sourceMappingURL=sphere_node.d.ts.map