/**
 * Decay Presets — 減衰パラメータの一括設定
 *
 * sphere.config.json の renal_core.decay.preset で指定。
 * 未指定時は NODE_ENV から自動判定 (development → dev, production → balanced)
 */

import { isDevelopment } from "./env.js";

export interface DecayPresetValues {
  alpha: number;
  heatDecayFactor: number;
  weightDecayFactor: number;
  fertilityDecayRate: number;
  /** loadFactor の下限 (dev は 1.0 で常時フル稼働) */
  minLoadFactor: number;
}

export type DecayPresetName = "archive" | "balanced" | "flow" | "dev" | "custom";

/**
 * プリセット定義
 *
 * | Preset   | Heat 1000tick残存 | Weight 1000tick残存 | 用途                     |
 * |----------|-------------------|---------------------|--------------------------|
 * | archive  | 0.67%             | 13.5%               | 図書館型、長期保存重視   |
 * | balanced | 0.004%            | 0.67%               | 汎用（現行 production）  |
 * | flow     | ~0%               | 0.004%              | SNS型、高速回転          |
 * | dev      | ~0%               | ~0%                 | 開発用、3倍速 balanced   |
 */
const PRESETS: Record<Exclude<DecayPresetName, "custom">, DecayPresetValues> = {
  archive: {
    alpha: 5.0,
    heatDecayFactor: 0.005,
    weightDecayFactor: 0.002,
    fertilityDecayRate: 0.005,
    minLoadFactor: 0.1,
  },
  balanced: {
    alpha: 10.0,
    heatDecayFactor: 0.01,
    weightDecayFactor: 0.005,
    fertilityDecayRate: 0.01,
    minLoadFactor: 0.1,
  },
  flow: {
    alpha: 15.0,
    heatDecayFactor: 0.02,
    weightDecayFactor: 0.01,
    fertilityDecayRate: 0.02,
    minLoadFactor: 0.1,
  },
  dev: {
    alpha: 30.0,           // balanced × 3
    heatDecayFactor: 0.03, // balanced × 3
    weightDecayFactor: 0.015, // balanced × 3
    fertilityDecayRate: 0.03,
    minLoadFactor: 1.0,    // 常時フル稼働
  },
};

/**
 * sphere.config.json の decay セクションからプリセット値を解決する。
 *
 * 1. preset 指定あり → プリセット値を返す
 * 2. preset: "custom" → 個別値をそのまま返す
 * 3. preset 未指定 → NODE_ENV から自動判定
 */
export function resolveDecayPreset(decayConfig: {
  preset?: string;
  alpha?: number;
  heatDecayFactor?: number;
  weightDecayFactor?: number;
  fertilityDecayRate?: number;
}): { resolved: DecayPresetValues; presetName: string } {
  const presetName = decayConfig.preset
    ?? (isDevelopment ? "dev" : "balanced");

  if (presetName === "custom") {
    return {
      presetName: "custom",
      resolved: {
        alpha: decayConfig.alpha ?? PRESETS.balanced.alpha,
        heatDecayFactor: decayConfig.heatDecayFactor ?? PRESETS.balanced.heatDecayFactor,
        weightDecayFactor: decayConfig.weightDecayFactor ?? PRESETS.balanced.weightDecayFactor,
        fertilityDecayRate: decayConfig.fertilityDecayRate ?? PRESETS.balanced.fertilityDecayRate,
        minLoadFactor: 0.1,
      },
    };
  }

  const preset = PRESETS[presetName as Exclude<DecayPresetName, "custom">];
  if (!preset) {
    console.warn(`[DecayPreset] Unknown preset "${presetName}", falling back to balanced`);
    return { presetName: "balanced", resolved: PRESETS.balanced };
  }

  return { presetName, resolved: preset };
}
