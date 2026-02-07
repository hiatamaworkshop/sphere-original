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
import type { ExperienceCapsule, ParsedCapsule } from "../types/capsule.js";
export declare class IncarnationParser {
    private buffer;
    constructor(buffer: IncarnationBuffer);
    /**
     * Parse capsule: vectorize ALL summaries for spatial coordinates
     *
     * [Design] All nodes get vectorized for spatial positioning
     * [Input] ExperienceCapsule from Gatekeeper
     * [Output] ParsedCapsule ready for Tagger
     */
    parseCapsule(capsule: ExperienceCapsule): Promise<ParsedCapsule>;
}
//# sourceMappingURL=incarnation-parser.d.ts.map