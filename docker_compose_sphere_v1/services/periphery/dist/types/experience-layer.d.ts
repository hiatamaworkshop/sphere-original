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
import type { NodeKind } from "@sphere/renal-core";
/**
 * Experience Layer: Where the agent currently resides
 *
 * [Evaluation Handling]
 *   - tutorial: Discarded (practice only)
 *   - sanctuary: Forbidden (read-only)
 *   - core: Incarnated (written to ProjDB)
 */
export type ExperienceLayer = "tutorial" | "sanctuary" | "core";
/**
 * Layer characteristics lookup
 */
export interface LayerCharacteristics {
    /** Can write evaluations */
    canEvaluate: boolean;
    /** Has tick-based metabolism */
    hasTick: boolean;
    /** Has CleanerFish (fossil/plankton transitions) */
    hasCleanerFish: boolean;
    /** Requires network connection */
    requiresOnline: boolean;
    /** Data source description */
    dataSource: string;
}
/**
 * Layer characteristics by type
 */
export declare const LAYER_CHARACTERISTICS: Record<ExperienceLayer, LayerCharacteristics>;
/**
 * Sanctuary Bundle: Frozen snapshot from Core
 *
 * [Design] Self-contained ROM image for offline/portable operation
 *   - No network required
 *   - No CleanerFish (metabolism stopped)
 *   - Read-only access
 *   - USB/download distributable
 *   - Embedded/edge device compatible
 *
 * [Content] Relic + selected Amber/Active nodes at freeze time
 *   - Relic: Eternal foundational wisdom (from RefDB)
 *   - Amber: Crystallized knowledge at freeze time
 *   - Active: Selected active nodes at freeze time
 *
 * [Versioning] signature + timestamp ensure integrity
 */
export interface SanctuaryBundle {
    /** Bundle version (incremented on structure changes) */
    version: number;
    /** Freeze timestamp (when snapshot was taken from Core) */
    frozenAt: number;
    /** Cryptographic signature for integrity verification */
    signature: string;
    /** Source Core identifier */
    sourceCore: string;
    /** Node data (frozen state) */
    nodes: SanctuaryNode[];
    /** Metadata about the bundle */
    metadata: {
        /** Total node count */
        nodeCount: number;
        /** Relic count */
        relicCount: number;
        /** Amber count */
        amberCount: number;
        /** Active count (at freeze time) */
        activeCount: number;
        /** Bundle description */
        description?: string;
    };
}
/**
 * Sanctuary Node: Frozen node state in bundle
 *
 * [Design] Minimal structure for ROM access
 *   - No mutable metrics (frozen values)
 *   - Vector for similarity search
 *   - Payload for content display
 */
export interface SanctuaryNode {
    id: string;
    kind: NodeKind;
    vector: number[];
    payload?: {
        summary?: string;
        tags?: string[];
        links?: string[];
        ref_url?: string;
    };
    /** Frozen metrics at snapshot time */
    frozenMetrics: {
        weight: number;
        heat: number;
    };
}
/**
 * Bundle validation result
 */
export interface BundleValidation {
    valid: boolean;
    errors: string[];
}
/**
 * Validate SanctuaryBundle integrity
 */
export declare function validateBundle(bundle: SanctuaryBundle): BundleValidation;
/**
 * Evaluation Delta: Temporary evaluation in session
 *
 * [2-Layer Evaluation Architecture]
 *   Agent layer: Intuitive 0-10 evaluation per metric (neutral = 5)
 *   Computation layer: Coefficients adjust actual impact (Bookkeeper)
 *
 * [Design] Stores raw agent input (0-10), NOT computed deltas
 *   - h: Heat evaluation (0-10)
 *   - w: Weight evaluation (0-10)
 *   - d: Decay evaluation (0-10)
 *   - Bookkeeper applies: metric += (input - 5) * coefficient
 */
export interface EvaluationDelta {
    nodeId: string;
    h: number;
    w: number;
    d: number;
    timestamp: number;
}
/**
 * Session Buffer: Temporary state during layer exploration
 *
 * [Design] Accumulates evaluations before layer transition
 *   - Tutorial: Buffer discarded on return
 *   - Sanctuary: Buffer flushed to Core on transition
 *   - Core: Direct write (no buffer needed)
 *
 * [Concurrency] Each session has independent buffer
 *   - No cross-session interference
 *   - Sanctuary read-only allows parallel exploration
 */
export interface SessionBuffer {
    /** Session identifier */
    sessionId: string;
    /** Current layer */
    layer: ExperienceLayer;
    /** Temporary evaluations (Sanctuary only) */
    temporaryEvaluations: Map<string, EvaluationDelta>;
    /** Buffer creation timestamp */
    createdAt: number;
    /** Last activity timestamp */
    lastActivityAt: number;
}
/**
 * Create new session buffer
 */
export declare function createSessionBuffer(sessionId: string, layer: ExperienceLayer): SessionBuffer;
/**
 * Add evaluation to buffer
 *
 * [Design] 1 node 1 evaluation - overwrites any existing evaluation
 * [Note] 1ノード1評価は入口制限（sphere-context で visitedNodes チェック）
 *
 * @throws Error if layer is Core (direct write) or Tutorial (discarded)
 */
export declare function addEvaluationToBuffer(buffer: SessionBuffer, delta: EvaluationDelta): void;
/**
 * Layer Transition Request
 */
export interface LayerTransitionRequest {
    /** Current layer */
    from: ExperienceLayer;
    /** Target layer */
    to: ExperienceLayer;
    /** Session buffer (for flush/discard) */
    buffer?: SessionBuffer;
}
/**
 * Layer Transition Result
 */
export interface LayerTransitionResult {
    success: boolean;
    newLayer: ExperienceLayer;
    /** Evaluations flushed to Core (Sanctuary → Core only) */
    flushedCount?: number;
    /** Error message if failed */
    error?: string;
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
export declare const VALID_TRANSITIONS: Array<[ExperienceLayer, ExperienceLayer]>;
/**
 * Check if layer transition is valid
 */
export declare function isValidTransition(from: ExperienceLayer, to: ExperienceLayer): boolean;
/**
 * Evaluation attempt result
 */
export type EvaluationResult = {
    success: true;
    incarnated: boolean;
} | {
    success: false;
    reason: "read_only" | "discarded" | "invalid_layer" | "insufficient_energy" | "already_evaluated" | "not_in_possession" | "session_limit_reached";
};
/**
 * Handle evaluation based on layer
 *
 * @returns Result indicating if evaluation was accepted
 */
export declare function handleLayerEvaluation(layer: ExperienceLayer, _nodeId: string, _delta: EvaluationDelta): EvaluationResult;
//# sourceMappingURL=experience-layer.d.ts.map