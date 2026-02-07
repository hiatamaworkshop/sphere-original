/**
 * Sphere Project - Amber Types
 * [Principle] POD: Pure data definitions for crystallized nodes
 */
/**
 * AmberRecord: Amber化されたノードの永続化レコード
 */
export interface AmberRecord {
    id: string;
    timestamp: number;
    kind: "amber";
    summary: string;
    tags: string[];
    vector: number[];
    weight: number;
    heat: number;
    flags: number;
    links?: string[];
    ref_url?: string;
}
/**
 * SpectralLink: Amber間のリンク
 */
export interface SpectralLink {
    id: string;
    source_id: string;
    target_id: string;
    weight: number;
    traversal_count: number;
    created_at: number;
}
/**
 * Constellation: Amber群の星座
 */
export interface Constellation {
    id: string;
    name?: string;
    amber_ids: string[];
    centroid: number[];
    total_weight: number;
    created_at: number;
}
//# sourceMappingURL=amber.d.ts.map