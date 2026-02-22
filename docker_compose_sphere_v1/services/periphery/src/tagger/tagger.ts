/**
 * Sphere Project - Tagger (Domain Adapter)
 *
 * [Role] Domain Adapter — 生データを情報物理空間に投射する変換器
 *   現行: text gate (NLP/regex による tags → 16bit flags 変換)
 *   将来: numeric, signal, graph, vision の各 gate type に差し替え可能
 *
 * [Function]
 *   1. Classify nodes by tier (top/normal/ghost)
 *   2. Compute 16bit flags from tags (domain-specific → domain-independent)
 *   3. Pass through evaluations unchanged
 *
 * [Design] Gate Type Architecture (FLAG_SYSTEM_REDESIGN.md)
 *   - Input: tags[] (keyword array) — text gate 固有
 *   - Output: 16bit flags (NodeFlag combination) — 全 gate type 共通
 *   - FastGate scoring は gate type を知らない (ビット × 係数の汎用演算)
 *   - Tagger が変わっても Sphere の物理法則は変わらない
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
 * Tag patterns for 16bit classification (3-layer + Special)
 *
 * [Design] FLAG_SYSTEM_REDESIGN.md
 *   - Temporal (bits 0-3): when does this matter?     — ユニバーサル
 *   - Density (bits 4-7): how much is packed in?      — ユニバーサル
 *   - Cognitive (bits 8-11): epistemic state            — ドメイン固有 (text gate)
 *   - Special (bits 12-15): system/user metadata       — ユニバーサル
 *
 * [Cognitive Layer — Domain Specific]
 *   text gate:    Sharp / Fuzzy / Tensile / Settled
 *   numeric gate: Precise / Noisy / Volatile / Stable (将来)
 *   signal gate:  Coherent / Distorted / Transient / Steady (将来)
 *   → ビット位置は共通、意味テーブルのみ差し替え
 *
 * [Philosophy] Sparse patterns. Agents compensate via Loadout.
 * [Principle] ビットポジションの確定が本質。物理効果は後から配線できる。
 *   - Temporal/Special: 物理配線済み
 *   - Density: Authority のみ配線。Dense/Sparse/Composite の物理効果は未確定
 *   - Cognitive: 物理効果なし (FastGate scoring のみ — 意図通り)
 *
 * [Dynamic flags — Arbiter/Bookkeeper 管轄, Tagger は付与しない]
 *   - Hot (0x0008): h >= hotHeatThreshold で Arbiter が付与
 *   - SystemCore (0x2000): Relic seed / Amber ascension で Bookkeeper が付与 (代謝凍結)
 *   - Compressed (0x4000): Fossil 化時に Arbiter が付与
 *   - Candidate (0x8000): Ascension 冷却期間中に Arbiter が付与
 *   ※ Candidate/Compressed は将来 state field へ移行予定 (types.ts TODO)
 *   ※ SystemCore を Tagger で付与すると active ノードの代謝が停止するバグが発生した (2026-02)
 *
 * [Known Behaviors]
 *   - "stable" → TemporalLong の単独マッチ (Settled は "established" 等で検出)
 *   - tierFlags.top = 0x0002 (config) → topTier に TemporalLong 自動付与 (Packer 側)
 *     trending topTier は TemporalShort + TemporalLong が共存する
 */
const TAG_FLAG_PATTERNS: { pattern: RegExp; flags: number }[] = [
  // --- Temporal Layer (bits 0-3) ---

  // TemporalShort (0x0001): time-sensitive, decays quickly
  {
    pattern: /\b(new|latest|breaking|recent|fresh|trending|viral|hot|today|now|current|update|modern|live|just-in)\b/i,
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
    pattern: /\b(short|minimal|low-detail|sketch|outline|brief|note|memo|overview|intro|summary|snippet|fragment)\b/i,
    flags: NodeFlag.Sparse,
  },

  // Composite (0x0040): multi-concept fusion
  {
    pattern: /\b(synthesis|integration|combination|hybrid|composite|fusion|interdisciplinary|cross-domain)\b/i,
    flags: NodeFlag.Composite,
  },

  // Authority (0x0080): compressed trust
  {
    pattern: /\b(official|authoritative|peer-reviewed|research|paper|verified|canonical|standard|specification|reference|doc|documentation)\b/i,
    flags: NodeFlag.Authority,
  },

  // --- Cognitive Layer (bits 8-11) --- ドメイン固有 (text gate)
  // Conservative start: regex-detectable patterns only
  // Future: LLM-based Tagger, or entirely different gate type (numeric/signal/graph)
  // Bit positions (0x0100-0x0800) are universal; semantic meaning changes per gate type

  // Sharp (0x0100): 明確、一意的解釈、境界明瞭
  {
    pattern: /\b(definition|theorem|proof|conclusion|precisely|exact|formula|axiom|law)\b/i,
    flags: NodeFlag.Sharp,
  },

  // Fuzzy (0x0200): 曖昧、複数解釈可能、未確定
  {
    pattern: /\b(hypothesis|maybe|perhaps|unclear|ambiguous|uncertain|speculative|conjecture|tentative|approximate)\b/i,
    flags: NodeFlag.Fuzzy,
  },

  // Tensile (0x0400): 内部対立・矛盾を内包、未解決
  {
    pattern: /\b(debate|controversy|paradox|contradiction|versus|conflict|unresolved|dilemma|tension|disputed)\b/i,
    flags: NodeFlag.Tensile,
  },

  // Settled (0x0800): 決着済み、合意形成済み、収束
  {
    pattern: /\b(established|consensus|standard|proven|accepted|settled|canonical|codified|ratified|definitive)\b/i,
    flags: NodeFlag.Settled,
  },

  // --- Special Layer (bits 12-15) ---

  // UserMarked (0x1000): user bookmarks
  {
    pattern: /\b(favorite|bookmark|starred|pinned|saved|marked|flagged|remember|keep|preserved|highlighted)\b/i,
    flags: NodeFlag.UserMarked,
  },

  // SystemCore (0x2000): 付与禁止 — 代謝凍結フラグのため Tagger が付与してはならない
  // Relic seed data と Bookkeeper (Amber ascension) のみが管理する
  // See: Dynamic flags コメント (上記)
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
