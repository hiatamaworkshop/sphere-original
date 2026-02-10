/**
 * Sphere Project - Tagger
 *
 * [Role] Semantic Classification (16bitTechnique)
 * [Function]
 *   1. Classify nodes by tier (top/normal/ghost)
 *   2. Compute 16bit flags from tags (semantic classification)
 *   3. Pass through evaluations unchanged
 *
 * [Design] 16bitTechnique
 *   - Input: tags[] (keyword array)
 *   - Output: 16bit flags (NodeFlag combination)
 *   - NOT vectorization (that's Parser's job)
 *
 * [Philosophy] Tags describe WHAT the node IS, not WHERE it is
 *   - Parser: summary → vector (WHERE in space)
 *   - Tagger: tags → flags (WHAT properties)
 *
 * [Pipeline Position]
 *   Gatekeeper → IncarnationParser → [Tagger] → Packer → Bookkeeper
 *
 * [Data Flow]
 *   ParsedCapsule (with vectors from Parser)
 *     ├── ParsedNodeSeed[] → Tagger → TaggedNodeSeed[] → Packer
 *     └── NodeEvaluation[] → Pass-through → ProjDB
 */

import type {
  ParsedCapsule,
  TaggedCapsule,
  TaggedNodeSeed,
} from "../types/capsule.js";
import { NodeFlag } from "@sphere/renal-core";

/**
 * Tag patterns for 16bit classification (3-layer system)
 *
 * [Design] FLAG_SYSTEM_REDESIGN.md
 *   - Temporal (bits 0-3): when does this matter?
 *   - Density (bits 4-7): how much is packed in?
 *   - Cognitive (bits 8-11): how does it feel?
 *   - Special (bits 12-15): system/user metadata
 *
 * [Philosophy] Sparse patterns. Agents compensate via Loadout.
 * [Note] Dynamic flags (Compressed, Candidate) are set by Arbiter
 */
const TAG_FLAG_PATTERNS: { pattern: RegExp; flags: number }[] = [
  // --- Temporal Layer (bits 0-3) ---

  // TemporalShort (0x0001): time-sensitive, decays quickly
  {
    pattern: /\b(new|latest|breaking|recent|fresh|trending|viral|hot|2024|2025|2026|today|now|current|update|modern|live|just-in)\b/i,
    flags: NodeFlag.TemporalShort,
  },

  // TemporalLong (0x0002): timeless, resists decay
  {
    pattern: /\b(timeless|classic|fundamental|proven|stable|reliable|legacy|permanent|long-term|enduring|fixed|anchor)\b/i,
    flags: NodeFlag.TemporalLong,
  },

  // TemporalCyclic (0x0004): resurfaces periodically (future use)
  // {
  //   pattern: /\b(seasonal|cyclic|recurring|periodic)\b/i,
  //   flags: NodeFlag.TemporalCyclic,
  // },

  // --- Density Layer (bits 4-7) ---

  // Dense (0x0010): high information density
  {
    pattern: /\b(theory|formula|rigorous|technical|dense|detailed|comprehensive|in-depth|academic|formal|mathematical)\b/i,
    flags: NodeFlag.Dense,
  },

  // Sparse (0x0020): low density
  {
    pattern: /\b(casual|light|brief|anecdotal|simple|short|note|memo|thought|overview|intro|summary)\b/i,
    flags: NodeFlag.Sparse,
  },

  // Composite (0x0040): multi-concept fusion
  {
    pattern: /\b(synthesis|integration|combination|hybrid|composite|fusion|interdisciplinary|cross-domain)\b/i,
    flags: NodeFlag.Composite,
  },

  // Authority (0x0080): compressed trust
  {
    pattern: /\b(official|authoritative|peer-reviewed|research|paper|verified|canonical|standard|specification|reference|source|doc|documentation)\b/i,
    flags: NodeFlag.Authority,
  },

  // --- Cognitive Layer (bits 8-11) ---
  // Conservative start: regex-detectable patterns only
  // Future: LLM-based Tagger for nuanced cognitive flags

  // Insightful (0x0100): generates "aha" moments
  {
    pattern: /\b(insight|revelation|breakthrough|discovery|realization|epiphany|illuminating|enlightening)\b/i,
    flags: NodeFlag.Insightful,
  },

  // Confusing (0x0200): low resolution, ambiguous
  {
    pattern: /\b(confusing|unclear|ambiguous|vague|obscure|complex|paradox|contradictory)\b/i,
    flags: NodeFlag.Confusing,
  },

  // Provoking (0x0400): challenges assumptions
  {
    pattern: /\b(controversial|debate|challenge|question|provocative|radical|disruptive|unconventional)\b/i,
    flags: NodeFlag.Provoking,
  },

  // Soothing (0x0800): calming, reassuring
  {
    pattern: /\b(calming|reassuring|stable|peaceful|harmonious|consistent|predictable|gentle)\b/i,
    flags: NodeFlag.Soothing,
  },

  // --- Special Layer (bits 12-15) ---

  // UserMarked (0x1000): user bookmarks
  {
    pattern: /\b(favorite|bookmark|starred|pinned|saved|marked|flagged|remember|keep|preserved|highlighted)\b/i,
    flags: NodeFlag.UserMarked,
  },

  // SystemCore (0x2000): infrastructure
  {
    pattern: /\b(system|config|settings|internal|kernel|infrastructure|architecture|framework|schema|model|engine|runtime|bootstrap|core)\b/i,
    flags: NodeFlag.SystemCore,
  },
];

/**
 * Compute 16bit flags from tags array
 *
 * [Algorithm]
 *   1. Combine all tags into searchable text
 *   2. Match against known patterns
 *   3. OR all matching flags together
 *
 * @param tags - Array of tag strings
 * @returns 16bit NodeFlag combination
 */
function computeClassificationFlags(tags: string[]): number {
  const tagText = tags.join(" ").toLowerCase();
  let flags = 0;

  for (const { pattern, flags: flagValue } of TAG_FLAG_PATTERNS) {
    if (pattern.test(tagText)) {
      flags |= flagValue;
    }
  }

  return flags;
}

export class Tagger {
  /**
   * Tag capsule nodes with tier, rank, and classification flags
   *
   * [Responsibility] Tagger owns 16bitTechnique classification
   * [Note] Vector already attached by IncarnationParser
   *
   * [Processing]
   *   - ParsedNodeSeed → compute flags → TaggedNodeSeed
   *   - NodeEvaluation: pass-through unchanged
   */
  public async tagCapsule(capsule: ParsedCapsule): Promise<TaggedCapsule> {
    // [Log] 開始 - タグ付け開始、入力データ構成
    console.log(
      `[Tagger] >>> start top=${capsule.topTier.length} normal=${capsule.normalNodes.length} ghost=${capsule.ghostNodes.length}`
    );

    // === TopTier: Add tier/rank/flags ===
    const topTier: TaggedNodeSeed[] = capsule.topTier.map((seed, i) => ({
      ...seed,
      tier: "top" as const,
      rank: i,
      classificationFlags: computeClassificationFlags(seed.tags),
    }));

    // === Normal: Add tier/rank/flags ===
    const normal: TaggedNodeSeed[] = capsule.normalNodes.map((seed, i) => ({
      ...seed,
      tier: "normal" as const,
      rank: i + capsule.topTier.length,
      classificationFlags: computeClassificationFlags(seed.tags),
    }));

    // === Ghost: Add tier/rank/flags ===
    const ghost: TaggedNodeSeed[] = capsule.ghostNodes.map((seed, i) => ({
      ...seed,
      tier: "ghost" as const,
      rank: i + capsule.topTier.length + capsule.normalNodes.length,
      classificationFlags: computeClassificationFlags(seed.tags),
    }));

    // === Evaluations: Pass-through unchanged ===
    const evaluations = capsule.evaluations ?? [];

    // [Log] 終了 - タグ付け完了、16bitフラグ付与済み
    const flagSamples = topTier.slice(0, 3).map(s => `0x${s.classificationFlags.toString(16)}`).join(",");
    console.log(
      `[Tagger] <<< end top=${topTier.length} normal=${normal.length} ghost=${ghost.length} flagSamples=[${flagSamples}]`
    );

    return { topTier, normal, ghost, evaluations };
  }
}
