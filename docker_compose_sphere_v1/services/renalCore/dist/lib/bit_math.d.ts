/**
 * Bit Math: 純粋関数による物理演算
 * - フラグ判定
 * - 熱量減衰
 * - 物理量変換
 */
import type { SphereNode } from "../types/sphere_node.js";
import type { RenalCoreFlagsConfig } from "../types/stable_config.js";
import { NodeFlag } from "../core/types.js";
/**
 * 特定のフラグが立っているか判定する純粋関数
 * @param node ノード
 * @param mask チェックするフラグ
 * @returns フラグが立っていれば true
 */
export declare const hasFlag: (node: SphereNode, mask: NodeFlag) => boolean;
/**
 * 熱量を減衰させる純粋関数
 * @param currentHeat 現在の熱量
 * @param rate 減衰率
 * @returns 減衰後の熱量（0未満にならない）
 */
export declare const decayHeat: (currentHeat: number, rate: number) => number;
/**
 * フラグに基づいて実効的な減衰率を計算する
 * @param baseDecayRate 基本減衰率
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後の減衰率
 */
export declare const computeEffectiveDecayRate: (baseDecayRate: number, flags: number, config?: RenalCoreFlagsConfig) => number;
/**
 * フラグに基づいて実効的な熱量ブーストを計算する
 * @param baseHeat 基本熱量
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後の熱量
 */
export declare const computeEffectiveHeat: (baseHeat: number, flags: number, config?: RenalCoreFlagsConfig) => number;
/**
 * フラグに基づいて実効的なTTL減衰率を計算する
 * @param baseTTLDecay 基本TTL減衰率
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後のTTL減衰率
 */
export declare const computeEffectiveTTLDecay: (baseTTLDecay: number, flags: number, config?: RenalCoreFlagsConfig) => number;
/**
 * フラグに基づいて実効的なWeightを計算する
 * @param baseWeight 基本Weight
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後のWeight
 */
export declare const computeEffectiveWeight: (baseWeight: number, flags: number, config?: RenalCoreFlagsConfig) => number;
/**
 * フラグに基づいて実効的なWeight減衰率を計算する
 * @param baseWeightDecay 基本Weight減衰率
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後のWeight減衰率
 */
export declare const computeEffectiveWeightDecay: (baseWeightDecay: number, flags: number, config?: RenalCoreFlagsConfig) => number;
//# sourceMappingURL=bit_math.d.ts.map