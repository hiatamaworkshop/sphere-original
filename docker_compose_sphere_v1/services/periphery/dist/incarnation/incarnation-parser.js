/**
 * Sphere Project - Incarnation Parser
 *
 * [Role] Vectorize summaries for node spatial coordinates
 * [Function] summary → vector[384] (spatial position in Sphere)
 *
 * [Design] Parser is responsible for WHERE nodes exist in space
 *   - Input: ExperienceCapsule with NodeSeed[] (containing summary)
 *   - Output: ParsedCapsule with ParsedNodeSeed[] (containing vector)
 *
 * [Optimization] IncarnationBuffer for batch processing
 *   - ALL nodes get vectorized (topTier, normal, ghost)
 *   - Buffer batches summaries from multiple capsules for efficiency
 *
 * [Note] Tagger handles 16bit flags (WHAT properties), not spatial position
 *
 * [Pipeline Position]
 *   Gatekeeper → [IncarnationParser] → Tagger → Packer → Bookkeeper
 */
/**
 * Empty vector fallback (should not normally be used)
 */
const EMPTY_VECTOR = [];
export class IncarnationParser {
    buffer;
    constructor(buffer) {
        this.buffer = buffer;
    }
    /**
     * Parse capsule: vectorize ALL summaries for spatial coordinates
     *
     * [Design] All nodes get vectorized for spatial positioning
     * [Input] ExperienceCapsule from Gatekeeper
     * [Output] ParsedCapsule ready for Tagger
     */
    async parseCapsule(capsule) {
        const topCount = capsule.topTier.length;
        const normalCount = capsule.normalNodes.length;
        const ghostCount = capsule.ghostNodes.length;
        const totalCount = topCount + normalCount + ghostCount;
        // [Log] 開始 - ベクトル化開始、入力seeds数
        console.log(`[IncarnationParser] >>> start top=${topCount} normal=${normalCount} ghost=${ghostCount} total=${totalCount}`);
        // === Collect ALL summaries for batch vectorization ===
        const allSummaries = [
            ...capsule.topTier.map((seed) => seed.summary),
            ...capsule.normalNodes.map((seed) => seed.summary),
            ...capsule.ghostNodes.map((seed) => seed.summary),
        ];
        // === Batch vectorize all summaries ===
        let allVectors = [];
        if (allSummaries.length > 0) {
            allVectors = await this.buffer.enqueueBatch(allSummaries);
            const dim = allVectors[0]?.length ?? 0;
            console.log(`[IncarnationParser] vectorized count=${allVectors.length} dim=${dim}`);
        }
        // === Distribute vectors to each tier ===
        let offset = 0;
        const topTier = capsule.topTier.map((seed, i) => ({
            ...seed,
            vector: allVectors[offset + i] ?? EMPTY_VECTOR,
        }));
        offset += topCount;
        const normalNodes = capsule.normalNodes.map((seed, i) => ({
            ...seed,
            vector: allVectors[offset + i] ?? EMPTY_VECTOR,
        }));
        offset += normalCount;
        const ghostNodes = capsule.ghostNodes.map((seed, i) => ({
            ...seed,
            vector: allVectors[offset + i] ?? EMPTY_VECTOR,
        }));
        // === Evaluations: Pass-through (no parsing needed) ===
        const evaluations = capsule.evaluations ?? [];
        // [Log] 終了 - ベクトル化完了、全ノードにベクトル付与
        console.log(`[IncarnationParser] <<< end top=${topTier.length} normal=${normalNodes.length} ghost=${ghostNodes.length} all_vectorized=${allVectors.length} evals=${evaluations.length}`);
        return { topTier, normalNodes, ghostNodes, evaluations };
    }
}
//# sourceMappingURL=incarnation-parser.js.map