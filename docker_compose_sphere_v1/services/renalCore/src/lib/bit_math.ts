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
export const hasFlag = (node: SphereNode, mask: NodeFlag): boolean => {
  return (node.metrics.flg & mask) !== 0;
};

/**
 * 熱量を減衰させる純粋関数
 * @param currentHeat 現在の熱量
 * @param rate 減衰率
 * @returns 減衰後の熱量（0未満にならない）
 */
export const decayHeat = (currentHeat: number, rate: number): number => {
  return Math.max(0, currentHeat * (1 - rate));
};

/**
 * デフォルトの物理修正値
 */
const DEFAULT_MODIFIERS = {
  Authority: { decayRateMultiplier: 0.95 },
  Freshness: { heatBoostMultiplier: 1.2 },
  Ephemeral: { decayRateMultiplier: 1.5 },
  Sticky: { ttlDecayMultiplier: 0.8 },
  Volatile: { ttlDecayMultiplier: 1.3 },
  Hub: { weightMultiplier: 1.1 },
  Frozen: { decayRateMultiplier: 0, ttlDecayMultiplier: 0 },
};

/**
 * フラグに基づいて実効的な減衰率を計算する
 * @param baseDecayRate 基本減衰率
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後の減衰率
 */
export const computeEffectiveDecayRate = (
  baseDecayRate: number,
  flags: number,
  config?: RenalCoreFlagsConfig
): number => {
  let rate = baseDecayRate;
  const mods = config?.physicsModifiers ?? DEFAULT_MODIFIERS;

  // Frozen: 代謝停止
  if (flags & NodeFlag.Frozen) {
    return 0;
  }

  // Authority: decay減速
  if (flags & NodeFlag.Authority) {
    rate *= mods.Authority?.decayRateMultiplier ?? 0.95;
  }

  // Ephemeral: decay加速
  if (flags & NodeFlag.Ephemeral) {
    rate *= mods.Ephemeral?.decayRateMultiplier ?? 1.5;
  }

  return rate;
};

/**
 * フラグに基づいて実効的な熱量ブーストを計算する
 * @param baseHeat 基本熱量
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後の熱量
 */
export const computeEffectiveHeat = (
  baseHeat: number,
  flags: number,
  config?: RenalCoreFlagsConfig
): number => {
  let heat = baseHeat;
  const mods = config?.physicsModifiers ?? DEFAULT_MODIFIERS;

  // Freshness: heat増幅
  if (flags & NodeFlag.Freshness) {
    heat *= mods.Freshness?.heatBoostMultiplier ?? 1.2;
  }

  return heat;
};

/**
 * フラグに基づいて実効的なTTL減衰率を計算する
 * @param baseTTLDecay 基本TTL減衰率
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後のTTL減衰率
 */
export const computeEffectiveTTLDecay = (
  baseTTLDecay: number,
  flags: number,
  config?: RenalCoreFlagsConfig
): number => {
  let decay = baseTTLDecay;
  const mods = config?.physicsModifiers ?? DEFAULT_MODIFIERS;

  // Frozen: 代謝停止
  if (flags & NodeFlag.Frozen) {
    return 0;
  }

  // Sticky: ttl減衰に抵抗
  if (flags & NodeFlag.Sticky) {
    decay *= mods.Sticky?.ttlDecayMultiplier ?? 0.8;
  }

  // Volatile: 高速蒸発
  if (flags & NodeFlag.Volatile) {
    decay *= mods.Volatile?.ttlDecayMultiplier ?? 1.3;
  }

  return decay;
};

/**
 * フラグに基づいて実効的なWeightを計算する
 * @param baseWeight 基本Weight
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後のWeight
 */
export const computeEffectiveWeight = (
  baseWeight: number,
  flags: number,
  config?: RenalCoreFlagsConfig
): number => {
  let weight = baseWeight;
  const mods = config?.physicsModifiers ?? DEFAULT_MODIFIERS;

  // Hub: weight増加
  if (flags & NodeFlag.Hub) {
    weight *= mods.Hub?.weightMultiplier ?? 1.1;
  }

  return weight;
};

/**
 * フラグに基づいて実効的なWeight減衰率を計算する
 * @param baseWeightDecay 基本Weight減衰率
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後のWeight減衰率
 */
export const computeEffectiveWeightDecay = (
  baseWeightDecay: number,
  flags: number,
  config?: RenalCoreFlagsConfig
): number => {
  let decay = baseWeightDecay;
  const mods = config?.physicsModifiers ?? DEFAULT_MODIFIERS;

  // Frozen: 代謝停止
  if (flags & NodeFlag.Frozen) {
    return 0;
  }

  // Authority: decay減速 (weight も保護)
  if (flags & NodeFlag.Authority) {
    decay *= mods.Authority?.decayRateMultiplier ?? 0.95;
  }

  // Hub: weight減衰に抵抗 (安定したハブは重みを保つ)
  if (flags & NodeFlag.Hub) {
    decay *= 0.8; // Hub nodes resist weight decay
  }

  return decay;
};
