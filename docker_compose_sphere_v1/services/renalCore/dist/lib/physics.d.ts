/**
 * Sphere Project - Physics Functions
 * [Phase 2+] 純粋関数による物理演算
 *
 * フラグから物理量への変換ロジック
 */
import type { RenalCoreFlagsConfig } from "../types/stable_config.js";
/**
 * フラグを物理量に変換するための係数マップ
 */
export interface FlagPhysicsModifiers {
    decay_rate_multiplier: number;
    heat_boost_multiplier: number;
    weight_multiplier: number;
    ttl_decay_multiplier: number;
}
/**
 * フラグから物理量修正値を計算する純粋関数
 * @param flags 16bit フラグ値
 * @param config Optional RenalCore flags configuration
 * @returns 物理パラメータの修正倍率
 */
export declare function computePhysicsModifiers(flags: number, config?: RenalCoreFlagsConfig): FlagPhysicsModifiers;
//# sourceMappingURL=physics.d.ts.map