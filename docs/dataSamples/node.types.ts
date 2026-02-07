/**
 * Sphere Project - Genesis Edition
 * * [Principle] POD (Plain Old Data): 
 * This file defines only data structures. No methods, no logic.
 * Optimized for serialization and future Rust conversion.
 */

/**
 * 存在の階層 (Phase of Existence)
 * 意味の密度と熱量によって決定される。
 */
export type NodeKind = 
  | "active"   // 受肉直後：高熱・意味あり
  | "amber"    // 結晶化：安定・不変
  | "fossil"   // 風化：圧縮済み・過去の遺物
  | "ghost"    // 摩擦痕跡：高揮発・推論の残像
  | "plankton" // 最終養分：意味消失・座標の熱量のみ
  | "relic"    // 聖典/システム定義：絶対的な重力点
  | "link";    // 構造の楔：ノード間の関係性

/**
 * スフィア・ノードの基本構造 (The Entity)
 */
export interface SphereNode {
  // 識別子
  id: string;        // UUID
  kind: NodeKind;
  
  // 座標 (知能の空間)
  // 1536次元ベクトルを想定。Rust移行時は [f32; 1536] に変換。
  vector: number[];

  // ペイロード：意味の肉体
  // kind が 'plankton' の場合は undefined となり、物理的に削除される。
  payload?: {
    summary?: string; 
    tags?: string[];  
    links?: string[]; // 関連ノード ID リスト
    ref_url?: string; // 原典への外部参照
  };

  // メトリクス：Renal Core が演算する物理量
  metrics: {
    w: number;   // Weight: 存在の確信度/重要度
    d: number;   // Decay: 冷却/減衰速度係数
    h: number;   // Heat: 環境熱量/アクセス密度
    ttl: number; // 生存秒数 ( -1: 永続 / 0: 消滅対象 )
  };

  timestamp: number; // 受肉（生成）時刻
}

/**
 * 空間フィールド属性 (The Field)
 * ノードの実体がない座標エリアそのものが持つ性質。
 * プロジェクション層で「気配」として管理される。
 */
export interface SpatialField {
  cell_id: string;    // 空間を格子状に区切った ID
  center_vector: number[]; // セルの中心座標
  intensity: number;  // 累積熱量 (プランクトンから昇華した「養分」の総和)
  last_updated: number;
}

/**
 * 体験カプセルの解体結果 (Packer Output)
 */
export interface PackerBatch {
  trace_id: string;
  nodes: SphereNode[];
}