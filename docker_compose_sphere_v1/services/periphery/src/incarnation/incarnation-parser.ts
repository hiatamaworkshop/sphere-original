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

import type { IncarnationBuffer } from "../parser/buffer.js";
import type {
  ExperienceCapsule,
  ParsedCapsule,
  ParsedNodeSeed,
} from "../types/capsule.js";

/**
 * Empty vector fallback (should not normally be used)
 */
const EMPTY_VECTOR: number[] = [];

export class IncarnationParser {
  constructor(private buffer: IncarnationBuffer) {}

  /**
   * Parse capsule: vectorize ALL summaries for spatial coordinates
   *
   * [Design] All nodes get vectorized for spatial positioning
   * [Input] ExperienceCapsule from Gatekeeper
   * [Output] ParsedCapsule ready for Tagger
   */
  async parseCapsule(capsule: ExperienceCapsule): Promise<ParsedCapsule> {
    const topCount = capsule.topTier.length;
    const normalCount = capsule.normalNodes.length;
    const ghostCount = capsule.ghostNodes.length;
    const totalCount = topCount + normalCount + ghostCount;

    // [Log] 開始 - ベクトル化開始、入力seeds数
    console.log(
      `[IncarnationParser] >>> start top=${topCount} normal=${normalCount} ghost=${ghostCount} total=${totalCount}`
    );

    // === Collect ALL summaries for batch vectorization ===
    const allSummaries: string[] = [
      ...capsule.topTier.map((seed) => seed.summary),
      ...capsule.normalNodes.map((seed) => seed.summary),
      ...capsule.ghostNodes.map((seed) => seed.summary),
    ];

    // === Batch vectorize all summaries ===
    let allVectors: number[][] = [];
    if (allSummaries.length > 0) {
      allVectors = await this.buffer.enqueueBatch(allSummaries);
      const dim = allVectors[0]?.length ?? 0;
      console.log(
        `[IncarnationParser] vectorized count=${allVectors.length} dim=${dim}`
      );
    }

    // === Distribute vectors to each tier ===
    let offset = 0;

    const topTier: ParsedNodeSeed[] = capsule.topTier.map((seed, i) => ({
      ...seed,
      vector: allVectors[offset + i] ?? EMPTY_VECTOR,
    }));
    offset += topCount;

    const normalNodes: ParsedNodeSeed[] = capsule.normalNodes.map((seed, i) => ({
      ...seed,
      vector: allVectors[offset + i] ?? EMPTY_VECTOR,
    }));
    offset += normalCount;

    const ghostNodes: ParsedNodeSeed[] = capsule.ghostNodes.map((seed, i) => ({
      ...seed,
      vector: allVectors[offset + i] ?? EMPTY_VECTOR,
    }));

    // === Evaluations: Pass-through (no parsing needed) ===
    const evaluations = capsule.evaluations ?? [];

    // [Log] 終了 - ベクトル化完了、全ノードにベクトル付与
    console.log(
      `[IncarnationParser] <<< end top=${topTier.length} normal=${normalNodes.length} ghost=${ghostNodes.length} all_vectorized=${allVectors.length} evals=${evaluations.length}`
    );

    return { topTier, normalNodes, ghostNodes, evaluations };
  }
}
