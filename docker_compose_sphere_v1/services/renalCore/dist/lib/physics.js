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
    // Frozen: 代謝停止
    if (flags & NodeFlag.Frozen) {
        result.decay_rate_multiplier = 0;
        result.ttl_decay_multiplier = 0;
        return result;
    }
    // Authority: decay減速
    if (flags & NodeFlag.Authority) {
        result.decay_rate_multiplier *= mods?.Authority?.decayRateMultiplier ?? 0.95;
    }
    // Freshness: heat増幅
    if (flags & NodeFlag.Freshness) {
        result.heat_boost_multiplier *= mods?.Freshness?.heatBoostMultiplier ?? 1.2;
    }
    // Ephemeral: decay加速
    if (flags & NodeFlag.Ephemeral) {
        result.decay_rate_multiplier *= mods?.Ephemeral?.decayRateMultiplier ?? 1.5;
    }
    // Sticky: ttl減衰に抵抗
    if (flags & NodeFlag.Sticky) {
        result.ttl_decay_multiplier *= mods?.Sticky?.ttlDecayMultiplier ?? 0.8;
    }
    // Volatile: 高速蒸発
    if (flags & NodeFlag.Volatile) {
        result.ttl_decay_multiplier *= mods?.Volatile?.ttlDecayMultiplier ?? 1.3;
    }
    // Hub: weight増加
    if (flags & NodeFlag.Hub) {
        result.weight_multiplier *= mods?.Hub?.weightMultiplier ?? 1.1;
    }
    return result;
}
//# sourceMappingURL=physics.js.map