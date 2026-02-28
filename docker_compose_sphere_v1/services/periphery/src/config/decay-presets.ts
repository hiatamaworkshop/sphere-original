/**
 * Decay Presets — 減衰パラメータの一括設定
 *
 * sphere.config.json の renal_core.decay.preset で指定。
 * 未指定時は NODE_ENV から自動判定 (development → dev, production → natural)
 */

import { isDevelopment } from "./env.js";

export interface DecayPresetValues {
  alpha: number;
  heatDecayFactor: number;
  weightDecayFactor: number;
  fluxDecayRate: number;
  /** loadFactor の下限 (dev は 1.0 で常時フル稼働) */
  minLoadFactor: number;
}

export type DecayPresetName = "archive" | "natural" | "flow" | "dev";

/**
 * プリセット定義
 *
 * 各プリセットは Heat 半減期を基準に設計。tick=1秒、半減期=ln2/factor
 * alpha は TTL の線形減衰率 (ttl -= alpha * loadFactor / tick)
 *
 * | Preset   | Heat半減期 | Heat 1000t残 | Weight 1000t残 | TTL寿命(normal) | 用途                       |
 * |----------|-----------|-------------|---------------|-----------------|----------------------------|
 * | archive  | ~2時間     | 90.5%       | 95.1%         | ~24時間          | 図書館型、長期保存重視     |
 * | natural  | ~30分      | 67.0%       | 81.9%         | ~8時間           | 汎用（1〜3 agent 運用）    |
 * | flow     | ~5分       | 13.5%       | 36.8%         | ~2.4時間         | SNS型、高速回転            |
 * | dev      | ~2分       | 0.25%       | 5.0%          | ~48分            | 開発用、ライフサイクル観測 |
 */
const PRESETS: Record<DecayPresetName, DecayPresetValues> = {
  archive: {
    alpha: 1.0,
    heatDecayFactor: 0.0001,
    weightDecayFactor: 0.00005,
    fluxDecayRate: 0.0002,
    minLoadFactor: 0.05,
  },
  natural: {
    alpha: 3.0,
    heatDecayFactor: 0.0004,
    weightDecayFactor: 0.0002,
    fluxDecayRate: 0.001,
    minLoadFactor: 0.1,
  },
  flow: {
    alpha: 10.0,
    heatDecayFactor: 0.002,
    weightDecayFactor: 0.001,
    fluxDecayRate: 0.005,
    minLoadFactor: 0.1,
  },
  dev: {
    alpha: 30.0,
    heatDecayFactor: 0.006,
    weightDecayFactor: 0.003,
    fluxDecayRate: 0.01,
    minLoadFactor: 1.0,    // 常時フル稼働
  },
};

/**
 * sphere.config.json の decay セクションからプリセット値を解決する。
 *
 * 1. preset 指定あり → プリセット値を返す
 * 2. preset 未指定 → NODE_ENV から自動判定 (development → dev, production → natural)
 */
export function resolveDecayPreset(decayConfig: {
  preset?: string;
  overrides?: Partial<DecayPresetValues>;
}): { resolved: DecayPresetValues; presetName: string } {
  const presetName = decayConfig.preset
    ?? (isDevelopment ? "dev" : "natural");

  const preset = PRESETS[presetName as DecayPresetName];
  if (!preset) {
    console.warn(`[DecayPreset] Unknown preset "${presetName}", falling back to natural`);
    return { presetName: "natural", resolved: { ...PRESETS.natural, ...(decayConfig.overrides ?? {}) } };
  }

  const resolved = decayConfig.overrides
    ? { ...preset, ...decayConfig.overrides }
    : preset;

  return { presetName, resolved };
}

/**
 * Get preset values by name (for runtime mode switching).
 */
export function getPresetValues(name: DecayPresetName): DecayPresetValues {
  return PRESETS[name] ?? PRESETS.natural;
}
