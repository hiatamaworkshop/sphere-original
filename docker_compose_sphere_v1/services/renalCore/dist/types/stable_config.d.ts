/**
 * Sphere Project - Phase 1: Stable Config Definition
 * [Principle] POD (Plain Old Data): No methods, no logic.
 *
 * Stable_Config: 物理定数
 * - スフィアの物理法則を規定する不変の定数
 * - sphere.config.json から読み込まれる
 */
import type { PulseConfig } from "./pulse.js";
/**
 * 物理定数: スフィアの宇宙法則
 */
export interface PhysicalConstants {
    dimension: number;
    gravity_constant: number;
    ambient_temperature: number;
    vacuum_decay: number;
}
/**
 * Active Bus: AI Native Language での限定的コミュニケーション
 */
export interface ActiveBus {
    enabled: boolean;
    protocol: "TEXT" | "AI_NATIVE";
    maxPayloadBytes: number;
    samplingRate: number;
}
/**
 * Flag Physics Modifier: フラグから物理量への変換倍率
 */
export interface FlagPhysicsModifier {
    decayRateMultiplier?: number;
    heatBoostMultiplier?: number;
    weightMultiplier?: number;
    ttlDecayMultiplier?: number;
    description: string;
}
/**
 * RenalCore - Flags 設定
 * Design: FLAG_SYSTEM_REDESIGN.md
 */
export interface RenalCoreFlagsConfig {
    physicsModifiers: {
        TemporalShort: FlagPhysicsModifier;
        TemporalLong: FlagPhysicsModifier;
        Dense: FlagPhysicsModifier;
        Authority: FlagPhysicsModifier;
        SystemCore: FlagPhysicsModifier;
    };
}
/**
 * RenalCore 全体設定
 */
export interface RenalCoreConfig {
    heartbeat: {
        tickIntervalMs: number;
    };
    decay: {
        alpha: number;
        heatDecayFactor: number;
    };
    thresholds: {
        amberHeat: number;
        amberWeight: number;
        fossilHeat: number;
        erosionHeat: number;
        ghostHeat: number;
        evaporationHeat: number;
    };
    ghost: {
        ttlMultiplier: number;
    };
    spatial: {
        gridSize: number;
        planktonConversionRate: number;
        fluxDecayRate: number;
    };
    pause: {
        idleThreshold: number;
        erosionBoost: number;
    };
    dormancy?: {
        thresholdMs: number;
    };
    flags: RenalCoreFlagsConfig;
    pulse?: PulseConfig;
}
/**
 * Periphery 設定（簡略版）
 */
export interface PeripheryConfig {
    membrane: {
        tag_encoding: string;
        tag_limit_bytes: number;
        prohibited_patterns: string[];
    };
    parser: {
        batchSize: number;
        flushTimeoutMs: number;
        embeddingProvider: string;
        vectorDimension: number;
    };
    tagger: {
        topTierCount: number;
    };
    packer: {
        tierWeights: {
            top: number;
            normal: number;
            ghost: number;
        };
        tierTTLs: {
            top: number;
            normal: number;
            ghost: number;
        };
        standardDecayCoefficient: number;
        tierFlags: {
            top: number;
            normal: number;
            ghost: number;
        };
        initialMetrics: {
            stayTime: number;
        };
    };
    incarnationBuffer: {
        batchSize: number;
        flushIntervalMs: number;
    };
    server: {
        port: number;
    };
}
/**
 * Stable Config: スフィア全体の設定
 * sphere.config.json の完全な型定義
 */
export interface StableConfig {
    metadata: {
        sphere_name: string;
        version: string;
        forked_from: string;
        ethos: string;
    };
    physical_constants: PhysicalConstants;
    periphery: PeripheryConfig;
    renal_core: RenalCoreConfig;
    activeBus: ActiveBus;
}
//# sourceMappingURL=stable_config.d.ts.map