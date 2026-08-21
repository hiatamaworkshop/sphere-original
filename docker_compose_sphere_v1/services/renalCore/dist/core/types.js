/**
 * Sphere Project - Core Types (Phase 1)
 * [Principle] POD (Plain Old Data): No methods, no logic.
 *
 * 16bit Flags & Core Interfaces
 * - 物性 vs 意味: Flags は「意味」ではなく「物性」
 * - Authority フラグ → decay_rate × 0.95（物理パラメータへ変換）
 * - TemporalShort フラグ → decay × 1.3, ttl_decay × 1.2
 * - エージェントの足跡を物理定数に変換する
 */
/**
 * 16bit Node Flags: ノードの物理的性質を表すフラグ
 * 各ビットが物理的パラメータ（減衰率、熱量ブースト等）に変換される
 *
 * Design: FLAG_SYSTEM_REDESIGN.md
 * - Temporal (bits 0-3): time properties
 * - Density (bits 4-7): structural complexity
 * - Cognitive (bits 8-11): perceptual impact
 * - Special (bits 12-15): system/user metadata
 */
export var NodeFlag;
(function (NodeFlag) {
    // Temporal (bits 0-3)
    NodeFlag[NodeFlag["TemporalShort"] = 1] = "TemporalShort";
    NodeFlag[NodeFlag["TemporalLong"] = 2] = "TemporalLong";
    NodeFlag[NodeFlag["TemporalCyclic"] = 4] = "TemporalCyclic";
    NodeFlag[NodeFlag["_Reserved0008"] = 8] = "_Reserved0008";
    // Density (bits 4-7)
    NodeFlag[NodeFlag["Dense"] = 16] = "Dense";
    NodeFlag[NodeFlag["Sparse"] = 32] = "Sparse";
    NodeFlag[NodeFlag["Composite"] = 64] = "Composite";
    NodeFlag[NodeFlag["Authority"] = 128] = "Authority";
    // Cognitive (bits 8-11) — epistemic state of information
    NodeFlag[NodeFlag["Sharp"] = 256] = "Sharp";
    NodeFlag[NodeFlag["Fuzzy"] = 512] = "Fuzzy";
    NodeFlag[NodeFlag["Tensile"] = 1024] = "Tensile";
    NodeFlag[NodeFlag["Settled"] = 2048] = "Settled";
    // Special (bits 12-15)
    NodeFlag[NodeFlag["UserMarked"] = 4096] = "UserMarked";
    NodeFlag[NodeFlag["SystemCore"] = 8192] = "SystemCore";
    NodeFlag[NodeFlag["Compressed"] = 16384] = "Compressed";
    NodeFlag[NodeFlag["Candidate"] = 32768] = "Candidate";
})(NodeFlag || (NodeFlag = {}));
// State flags (dynamic, Arbiter-assigned)
// Frozen is represented by SystemCore (0x2000) for metabolism purposes
export const Frozen = NodeFlag.SystemCore; // Alias for backwards compatibility
//# sourceMappingURL=types.js.map