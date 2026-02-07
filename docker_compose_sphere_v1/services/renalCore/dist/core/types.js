/**
 * Sphere Project - Core Types (Phase 1)
 * [Principle] POD (Plain Old Data): No methods, no logic.
 *
 * 16bit Flags & Core Interfaces
 * - 物性 vs 意味: Flags は「意味」ではなく「物性」
 * - Authority フラグ → decay_rate × 0.95（物理パラメータへ変換）
 * - Freshness フラグ → heat_boost × 1.2
 * - エージェントの足跡を物理定数に変換する
 */
/**
 * 16bit Node Flags: ノードの物理的性質を表すフラグ
 * 各ビットが物理的パラメータ（減衰率、熱量ブースト等）に変換される
 */
export var NodeFlag;
(function (NodeFlag) {
    NodeFlag[NodeFlag["Authority"] = 1] = "Authority";
    NodeFlag[NodeFlag["Freshness"] = 2] = "Freshness";
    NodeFlag[NodeFlag["Catalyst"] = 4] = "Catalyst";
    NodeFlag[NodeFlag["Ephemeral"] = 8] = "Ephemeral";
    NodeFlag[NodeFlag["Sticky"] = 16] = "Sticky";
    NodeFlag[NodeFlag["Volatile"] = 32] = "Volatile";
    NodeFlag[NodeFlag["Hot"] = 64] = "Hot";
    NodeFlag[NodeFlag["Frozen"] = 128] = "Frozen";
    NodeFlag[NodeFlag["Hub"] = 256] = "Hub";
    NodeFlag[NodeFlag["Isolated"] = 512] = "Isolated";
    NodeFlag[NodeFlag["UserMarked"] = 4096] = "UserMarked";
    NodeFlag[NodeFlag["SystemCore"] = 8192] = "SystemCore";
    NodeFlag[NodeFlag["Compressed"] = 16384] = "Compressed";
    NodeFlag[NodeFlag["Candidate"] = 32768] = "Candidate";
})(NodeFlag || (NodeFlag = {}));
//# sourceMappingURL=types.js.map