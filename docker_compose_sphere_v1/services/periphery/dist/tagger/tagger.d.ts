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