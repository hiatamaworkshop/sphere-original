/**
 * Sphere Project - 3-Layer Piping System
 *
 * [Architecture] Agent → Tutorial → Sanctuary → Core → Return
 *
 * [Layer Definitions]
 *   - Tutorial: Practice mode (evaluation discarded, shared SanctuaryBundle)
 *   - Sanctuary: Read-only exploration (frozen Core snapshot, offline/portable)
 *   - Core: Live world (evaluation incarnated, tick-based metabolism)
 *
 * [Design Principles]
 *   - Sanctuary = frozen snapshot of Core (no CleanerFish, no metabolism)
 *   - Tutorial uses same SanctuaryBundle as Sanctuary
 *   - Only Core accepts evaluation writes
 */
/**
 * Layer characteristics by type
 */
export const LAYER_CHARACTERISTICS = {
    tutorial: {
        canEvaluate: false,
        hasTick: false,
        hasCleanerFish: false,
        requiresOnline: false,
        dataSource: "SanctuaryBundle (shared)",
    },
    sanctuary: {
        canEvaluate: false,
        hasTick: false,
        hasCleanerFish: false,
        requiresOnline: false,
        dataSource: "SanctuaryBundle (frozen snapshot)",
    },
    core: {
        canEvaluate: true,
        hasTick: true,
        hasCleanerFish: true,
        requiresOnline: true,
        dataSource: "Live ProjDB + RefDB",
    },
};
/**
 * Validate SanctuaryBundle integrity
 */
export function validateBundle(bundle) {
    const errors = [];
    if (!bundle.version || bundle.version < 1) {
        errors.push("Invalid bundle version");
    }
    if (!bundle.frozenAt || bundle.frozenAt <= 0) {
        errors.push("Invalid freeze timestamp");
    }
    if (!bundle.signature) {
        errors.push("Missing signature");
    }
    if (!bundle.nodes || !Array.isArray(bundle.nodes)) {
        errors.push("Missing or invalid nodes array");
    }
    if (bundle.nodes && bundle.nodes.length !== bundle.metadata.nodeCount) {
        errors.push(`Node count mismatch: expected ${bundle.metadata.nodeCount}, got ${bundle.nodes.length}`);
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
/**
 * Create new session buffer
 */
export function createSessionBuffer(sessionId, layer) {
    const now = Date.now();
    return {
        sessionId,
        layer,
        temporaryEvaluations: new Map(),
        createdAt: now,
        lastActivityAt: now,
    };
}
/**
 * Add evaluation to buffer
 *
 * [Design] 1 node 1 evaluation - overwrites any existing evaluation
 * [Note] 1ノード1評価は入口制限（sphere-context で visitedNodes チェック）
 *
 * @throws Error if layer is Core (direct write) or Tutorial (discarded)
 */
export function addEvaluationToBuffer(buffer, delta) {
    if (buffer.layer === "core") {
        // Core layer also uses buffer now (flushed on return)
        // Changed from direct write to buffer accumulation
    }
    if (buffer.layer === "tutorial") {
        // Tutorial evaluations are silently ignored (practice mode)
        return;
    }
    // Sanctuary/Core: store for later flush (1 node 1 evaluation - overwrite)
    buffer.temporaryEvaluations.set(delta.nodeId, { ...delta });
    buffer.lastActivityAt = Date.now();
}
/**
 * Valid layer transitions
 *
 * [Flow] Tutorial → Sanctuary → Core (順序強制)
 *   - Tutorial → Sanctuary: Parser complete
 *   - Sanctuary → Core: Agent chooses to incarnate
 *   - Any → Return: End session (always allowed, no delay forced)
 *
 * [Design] Tutorial は必ず通過する
 *   - スキップ不可（Parser 待機バッファとしての役割）
 *   - ただし「すぐに帰還」は常に可能（遅延を強制しない）
 *   - ユーザー体験の遅延をよしとしない
 *
 * [Invalid]
 *   - Tutorial → Core: 直接遷移不可（Sanctuary を経由せよ）
 *   - Core → Sanctuary: Cannot un-incarnate
 *   - Sanctuary → Tutorial: No regression
 */
export const VALID_TRANSITIONS = [
    ["tutorial", "sanctuary"],
    ["sanctuary", "core"],
];
/**
 * Check if layer transition is valid
 */
export function isValidTransition(from, to) {
    return VALID_TRANSITIONS.some(([f, t]) => f === from && t === to);
}
/**
 * Handle evaluation based on layer
 *
 * @returns Result indicating if evaluation was accepted
 */
export function handleLayerEvaluation(layer, _nodeId, _delta) {
    switch (layer) {
        case "tutorial":
            // Practice mode: silently discard
            return { success: false, reason: "discarded" };
        case "sanctuary":
            // Read-only: reject with clear reason
            return { success: false, reason: "read_only" };
        case "core":
            // Live world: accept for incarnation
            return { success: true, incarnated: true };
        default:
            return { success: false, reason: "invalid_layer" };
    }
}
//# sourceMappingURL=experience-layer.js.map