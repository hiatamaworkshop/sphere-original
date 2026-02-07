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
import type { ParsedCapsule, TaggedCapsule } from "../types/capsule.js";
export declare class Tagger {
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
    tagCapsule(capsule: ParsedCapsule): Promise<TaggedCapsule>;
}
//# sourceMappingURL=tagger.d.ts.map