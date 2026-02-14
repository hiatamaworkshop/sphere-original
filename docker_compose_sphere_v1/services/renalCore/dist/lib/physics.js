/**
 * Sphere Project - Physics Functions
 * [Phase 2+] 純粋関数による物理演算
 *
 * フラグから物理量への変換ロジック
 */
import { NodeFlag } from "../core/types.js";
/**
 * デフォルトの物理修正値
 */
const DEFAULT_MODIFIERS = {
    decay_rate_multiplier: 1.0,
    heat_boost_multiplier: 1.0,
    weight_multiplier: 1.0,
    ttl_decay_multiplier: 1.0,
};
/**
 * フラグから物理量修正値を計算する純粋関数
 * @param flags 16bit フラグ値
 * @param config Optional RenalCore flags configuration
 * @returns 物理パラメータの修正倍率
 */
export function computePhysicsModifiers(flags, config) {
    const result = { ...DEFAULT_MODIFIERS };
    const mods = config?.physicsModifiers;
    // SystemCore: 代謝停止 (Frozen metabolism for Relic)
    if (flags & NodeFlag.SystemCore) {
        result.decay_rate_multiplier = 0;
        result.ttl_decay_multiplier = 0;
        return result;
    }
    // Authority: decay減速
    if (flags & NodeFlag.Authority) {
        result.decay_rate_multiplier *= mods?.Authority?.decayRateMultiplier ?? 0.95;
    }
    // TemporalShort: decay加速, heat増幅 (replaces Freshness/Ephemeral)
    if (flags & NodeFlag.TemporalShort) {
        result.decay_rate_multiplier *= mods?.TemporalShort?.decayRateMultiplier ?? 1.3;
    }
    // TemporalLong: ttl減衰に抵抗
    if (flags & NodeFlag.TemporalLong) {
        result.ttl_decay_multiplier *= mods?.TemporalLong?.ttlDecayMultiplier ?? 0.7;
    }
    // Dense: weight増幅
    if (flags & NodeFlag.Dense) {
        result.weight_multiplier *= 1.2;
    }
    return result;
}
//# sourceMappingURL=physics.js.map