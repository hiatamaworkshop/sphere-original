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
import { NodeFlag } from "@sphere/renal-core";
/**
 * Tag patterns for 16bit classification
 *
 * [Design] Map tag keywords to NodeFlag combinations
 * [Coverage] Authority, Freshness, Catalyst, Ephemeral, Sticky, Volatile,
 *            Hot, Hub, UserMarked, SystemCore
 *
 * [Note] Dynamic flags (Frozen, Isolated, Candidate, Compressed) are set by Arbiter
 */
const TAG_FLAG_PATTERNS = [
    // Authority (0x0001): Official sources, academic rigor, or specifications
    {
        pattern: /\b(official|authoritative|source|reference|standard|canonical|spec|specification|documentation|doc|peer-reviewed|research|paper|thesis|verified|proven|original)\b/i,
        flags: NodeFlag.Authority,
    },
    // Freshness (0x0002): Recent updates, current timeframes, or breaking info
    {
        pattern: /\b(new|fresh|latest|recent|breaking|update|revised|modern|upcoming|2024|2025|2026|today|now|current|realtime|live|just-in)\b/i,
        flags: NodeFlag.Freshness,
    },
    // Catalyst (0x0004): Intermediaries, structural foundations, or integration points
    {
        pattern: /\b(hub|central|core|foundation|base|link|connect|bridge|relation|integration|interface|gateway|junction|middleware|api|glue|nexus|pipeline)\b/i,
        flags: NodeFlag.Catalyst,
    },
    // Ephemeral (0x0008): Short-lived, experimental, or draft-state content
    {
        pattern: /\b(temporary|ephemeral|transient|short-term|brief|draft|wip|experimental|prototype|test|beta|trial|random|thought|note|memo|volatile|fleeting)\b/i,
        flags: NodeFlag.Ephemeral,
    },
    // Sticky (0x0010): Essential, stable, or long-term foundational knowledge
    {
        pattern: /\b(important|critical|essential|fundamental|key|permanent|stable|reliable|proven|fixed|legacy|anchor|root|main|major|primary|vital)\b/i,
        flags: NodeFlag.Sticky,
    },
    // Volatile (0x0020): Fast-changing, unstable, or frequently mutating content
    {
        pattern: /\b(unstable|changing|mutable|dynamic|flux|shifting|evolving|fluid|variable|fluctuating|turbulent|chaotic)\b/i,
        flags: NodeFlag.Volatile,
    },
    // Hot (0x0040): High activity, trending topics, or controversial debate
    {
        pattern: /\b(trending|popular|viral|hot|active|discussion|debate|controversial|shout|alert|emergency|attention|boom|hype|burst)\b/i,
        flags: NodeFlag.Hot,
    },
    // Hub (0x0100): Structural summaries, navigational aids, or collections
    {
        pattern: /\b(overview|summary|index|catalog|collection|guide|tutorial|introduction|101|map|portal|archive|list|directory|atlas|handbook)\b/i,
        flags: NodeFlag.Hub,
    },
    // UserMarked (0x1000): User-indicated importance or bookmarks
    {
        pattern: /\b(favorite|bookmark|starred|pinned|saved|marked|flagged|remember|keep|preserved|highlighted)\b/i,
        flags: NodeFlag.UserMarked,
    },
    // SystemCore (0x2000): System infrastructure, configuration, or architecture
    {
        pattern: /\b(system|config|settings|internal|kernel|infrastructure|architecture|framework|schema|model|engine|runtime|bootstrap)\b/i,
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
function computeClassificationFlags(tags) {
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
    async tagCapsule(capsule) {
        // [Log] 開始 - タグ付け開始、入力データ構成
        console.log(`[Tagger] >>> start top=${capsule.topTier.length} normal=${capsule.normalNodes.length} ghost=${capsule.ghostNodes.length}`);
        // === TopTier: Add tier/rank/flags ===
        const topTier = capsule.topTier.map((seed, i) => ({
            ...seed,
            tier: "top",
            rank: i,
            classificationFlags: computeClassificationFlags(seed.tags),
        }));
        // === Normal: Add tier/rank/flags ===
        const normal = capsule.normalNodes.map((seed, i) => ({
            ...seed,
            tier: "normal",
            rank: i + capsule.topTier.length,
            classificationFlags: computeClassificationFlags(seed.tags),
        }));
        // === Ghost: Add tier/rank/flags ===
        const ghost = capsule.ghostNodes.map((seed, i) => ({
            ...seed,
            tier: "ghost",
            rank: i + capsule.topTier.length + capsule.normalNodes.length,
            classificationFlags: computeClassificationFlags(seed.tags),
        }));
        // === Evaluations: Pass-through unchanged ===
        const evaluations = capsule.evaluations ?? [];
        // [Log] 終了 - タグ付け完了、16bitフラグ付与済み
        const flagSamples = topTier.slice(0, 3).map(s => `0x${s.classificationFlags.toString(16)}`).join(",");
        console.log(`[Tagger] <<< end top=${topTier.length} normal=${normal.length} ghost=${ghost.length} flagSamples=[${flagSamples}]`);
        return { topTier, normal, ghost, evaluations };
    }
}
//# sourceMappingURL=tagger.js.map