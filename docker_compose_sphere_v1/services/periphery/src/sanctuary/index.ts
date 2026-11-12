/**
 * Sphere Project - Sanctuary Module
 *
 * [Role] Manages Sanctuary layer (frozen Core snapshot)
 *
 * [Components]
 *   - BundleLoader: Load and cache SanctuaryBundle
 *   - createSanctuaryBundle: Freeze Core state
 */

export {
  BundleLoader,
  getDefaultBundleLoader,
  createSanctuaryBundle,
  computeBundleSignature,
  BUNDLE_KEY_ENV,
} from "./bundle-loader.js";

export type {
  BundleQueryResult,
  BundleStats,
  CreateBundleOptions,
} from "./bundle-loader.js";
