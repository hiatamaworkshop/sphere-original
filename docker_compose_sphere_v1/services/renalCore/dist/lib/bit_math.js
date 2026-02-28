/**
 * Bit Math: 純粋関数による物理演算
 * - フラグ判定
 * - 熱量減衰
 * - 物理量変換
 */
import { NodeFlag } from "../core/types.js";
/**
 * 特定のフラグが立っているか判定する純粋関数
 * @param node ノード
 * @param mask チェックするフラグ
 * @returns フラグが立っていれば true
 */
export const hasFlag = (node, mask) => {
    return (node.metrics.flg & mask) !== 0;
};
/**
 * 熱量を減衰させる純粋関数
 * @param currentHeat 現在の熱量
 * @param rate 減衰率
 * @returns 減衰後の熱量（0未満にならない）
 */
export const decayHeat = (currentHeat, rate) => {
    return Math.max(0, currentHeat * (1 - rate));
};
/**
 * デフォルトの物理修正値
 * Design: FLAG_SYSTEM_REDESIGN.md
 */
const DEFAULT_MODIFIERS = {
    // Temporal (bits 0-3)
    TemporalShort: { decayRateMultiplier: 1.3, ttlDecayMultiplier: 1.2 },
    TemporalLong: { decayRateMultiplier: 0.8, ttlDecayMultiplier: 0.7 },
    // Density (bits 4-7)
    Dense: { weightMultiplier: 1.2 },
    Sparse: { weightMultiplier: 0.8 },
    Composite: { weightMultiplier: 1.1 },
    Authority: { decayRateMultiplier: 0.95 },
    // Special (bits 12-15)
    SystemCore: { decayRateMultiplier: 0, ttlDecayMultiplier: 0 }, // Frozen metabolism (Relic)
};
/**
 * フラグに基づいて実効的な減衰率を計算する
 * @param baseDecayRate 基本減衰率
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後の減衰率
 */
export const computeEffectiveDecayRate = (baseDecayRate, flags, config) => {
    let rate = baseDecayRate;
    const mods = config?.physicsModifiers ?? DEFAULT_MODIFIERS;
    // SystemCore: 代謝停止 (Frozen metabolism for Relic)
    if (flags & NodeFlag.SystemCore) {
        return 0;
    }
    // Temporal layer
    if (flags & NodeFlag.TemporalShort) {
        rate *= mods.TemporalShort?.decayRateMultiplier ?? 1.3;
    }
    if (flags & NodeFlag.TemporalLong) {
        rate *= mods.TemporalLong?.decayRateMultiplier ?? 0.8;
    }
    // Density layer
    if (flags & NodeFlag.Authority) {
        rate *= mods.Authority?.decayRateMultiplier ?? 0.95;
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
export const computeEffectiveHeat = (baseHeat, flags, config) => {
    return baseHeat;
};
/**
 * フラグに基づいて実効的なTTL減衰率を計算する
 * @param baseTTLDecay 基本TTL減衰率
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後のTTL減衰率
 */
export const computeEffectiveTTLDecay = (baseTTLDecay, flags, config) => {
    let decay = baseTTLDecay;
    const mods = config?.physicsModifiers ?? DEFAULT_MODIFIERS;
    // SystemCore: 代謝停止 (Frozen metabolism for Relic)
    if (flags & NodeFlag.SystemCore) {
        return 0;
    }
    // Temporal layer
    if (flags & NodeFlag.TemporalShort) {
        decay *= mods.TemporalShort?.ttlDecayMultiplier ?? 1.2;
    }
    if (flags & NodeFlag.TemporalLong) {
        decay *= mods.TemporalLong?.ttlDecayMultiplier ?? 0.7;
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
export const computeEffectiveWeight = (baseWeight, flags, config) => {
    return baseWeight;
};
/**
 * フラグに基づいて実効的なWeight減衰率を計算する
 * @param baseWeightDecay 基本Weight減衰率
 * @param flags ノードのフラグ
 * @param config Optional RenalCore flags configuration
 * @returns フラグ修正後のWeight減衰率
 */
export const computeEffectiveWeightDecay = (baseWeightDecay, flags, config) => {
    let decay = baseWeightDecay;
    const mods = config?.physicsModifiers ?? DEFAULT_MODIFIERS;
    // SystemCore: 代謝停止 (Frozen metabolism for Relic)
    if (flags & NodeFlag.SystemCore) {
        return 0;
    }
    // Authority: decay減速 (weight も保護)
    if (flags & NodeFlag.Authority) {
        decay *= mods.Authority?.decayRateMultiplier ?? 0.95;
    }
    // (Hub removed - no longer used)
    return decay;
};
//# sourceMappingURL=bit_math.js.map