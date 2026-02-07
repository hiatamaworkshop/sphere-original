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
 * 代謝設定: RenalCore の動作パラメータ
 */
export interface MetabolismSettings {
  default_ttl: number;
  max_active_nodes: number;
  fossilization_threshold: number;
  plankton_conversion_rate: number;
  cleaner_fish_aggressiveness: number;
}

/**
 * 結晶化ロジック: Amber化のパラメータ
 */
export interface CrystallizationLogic {
  amber_trigger_threshold: number;
  is_amber_enabled: boolean;
  linking_sensitivity: number;
  constellation_limit: number;
  amber_erosion_rate: number;
  min_amber_heat: number;
}

/**
 * 言語膜: 外部エージェントとRenalCoreの境界
 */
export interface LinguisticMembrane {
  tag_encoding: "UTF-8" | "ASCII";
  tag_limit_bytes: number;
  prohibited_patterns: string[];
  auto_translation_to_core: boolean;
}

/**
 * 没入型訓練: AIエージェントの学習設定
 */
export interface ImmersiveTraining {
  teacher_trace_retention: number;
  student_learning_rate: number;
  dojo_noise_level: number;
}

/**
 * インターフェースヒント: Periphery への推奨設定
 */
export interface InterfaceHint {
  rendering_mode: "volumetric" | "point_cloud" | "solid";
  lod_distance: number;
  showcase_refresh_rate: number;
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
 */
export interface RenalCoreFlagsConfig {
  physicsModifiers: {
    Authority: FlagPhysicsModifier;
    Freshness: FlagPhysicsModifier;
    Ephemeral: FlagPhysicsModifier;
    Sticky: FlagPhysicsModifier;
    Volatile: FlagPhysicsModifier;
    Hub: FlagPhysicsModifier;
    Frozen: FlagPhysicsModifier;
  };
}

/**
 * RenalCore 全体設定
 */
export interface RenalCoreConfig {
  heartbeat: { tickIntervalMs: number };
  decay: { alpha: number; heatDecayFactor: number };
  thresholds: {
    amberHeat: number;
    amberWeight: number;
    fossilHeat: number;
    erosionHeat: number;
    ghostHeat: number;
    evaporationHeat: number;
  };
  ghost: { ttlMultiplier: number };
  spatial: {
    gridSize: number;
    planktonConversionRate: number;
    fertilityDecayRate: number;
  };
  hackDetection: {
    traversalThreshold: number;
    stayRatioThreshold: number;
    minPayloadLength: number;
  };
  pause: {
    idleThreshold: number;
    erosionBoost: number;
  };
  dormancy?: {
    thresholdMs: number;
  };
  flags: RenalCoreFlagsConfig;
  pulse?: PulseConfig;  // Phase 3.2: Pulse configuration
}

/**
 * Periphery 設定（簡略版）
 */
export interface PeripheryConfig {
  membrane: LinguisticMembrane;
  parser: { batchSize: number; flushTimeoutMs: number; embeddingProvider: string; vectorDimension: number };
  gatekeeper: { maxNodesPerCapsule: number; maxTopTierPerCapsule: number; maxGhostRatio: number; maxSummaryLength: number };
  tagger: { topTierCount: number };
  packer: {
    tierWeights: { top: number; normal: number; ghost: number };
    tierTTLs: { top: number; normal: number; ghost: number };
    standardDecayCoefficient: number;
    tierFlags: { top: number; normal: number; ghost: number };
    initialMetrics: { traversal: number; stayTime: number };
  };
  incarnationBuffer: { batchSize: number; flushIntervalMs: number };
  server: { port: number };
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
  metabolism_settings: MetabolismSettings;
  crystallization_logic: CrystallizationLogic;
  linguistic_membrane: LinguisticMembrane;
  immersive_training: ImmersiveTraining;
  interface_hint: InterfaceHint;
  activeBus: ActiveBus;
}