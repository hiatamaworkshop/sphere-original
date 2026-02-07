/**
 * Sphere Project - AutoCapsule Types
 *
 * [Role] Server-authoritative action record
 * [Principle] 「まず記録、意味は後」
 *   - No meaning, tags, or vectors
 *   - Only nodeIds and metrics
 *   - Computation is cheap, post-processing is flexible
 *
 * [Design] Based on Agent Action Pipeline in CLAUDE.md
 */
import type { NodeKind } from "@sphere/renal-core";
/**
 * Base action event
 */
interface ActionEventBase {
    /** Timestamp of the action */
    timestamp: number;
}
/**
 * Focus action: Agent focused on a node
 */
export interface FocusAction extends ActionEventBase {
    type: "focus";
    nodeId: string;
    kind: NodeKind;
    heatAtFocus: number;
    /** L3: Derivation origin (if this node is derived from another) */
    sourceNodeId?: string;
}
/**
 * Focus end action: Agent left a node
 */
export interface FocusEndAction extends ActionEventBase {
    type: "focusEnd";
    nodeId: string;
    /** Duration in milliseconds */
    duration: number;
    /** Heat delta from focus (may include decay) */
    heatDelta: number;
}
/**
 * Evaluate action: Agent evaluated a node
 */
export interface EvaluateAction extends ActionEventBase {
    type: "evaluate";
    nodeId: string;
    score: number;
}
/**
 * Move action: Agent moved (drift/toward/toNode)
 */
export interface MoveAction extends ActionEventBase {
    type: "move";
    /** Previous node (if any) */
    fromNodeId?: string;
    /** Successful move */
    success: boolean;
}
/**
 * Warp action: Agent warped directly to a node
 * [Design] Distinct from move - rate-limited, requires visibility
 */
export interface WarpAction extends ActionEventBase {
    type: "warp";
    /** Previous node (if any) */
    fromNodeId?: string;
    /** Target node ID */
    toNodeId: string;
    /** Successful warp */
    success: boolean;
}
/**
 * Emit action: Agent broadcast a message via ActiveBus
 * [Design] AI-to-AI volatile communication
 */
export interface EmitAction extends ActionEventBase {
    type: "emit";
    /** Payload size in bytes */
    payloadSize: number;
}
/**
 * All action types
 */
export type ActionEvent = FocusAction | FocusEndAction | EvaluateAction | MoveAction | WarpAction | EmitAction;
/**
 * ActionLog: Complete action history for a session
 *
 * [Usage] Collected during session, used to build AutoCapsule
 */
export interface ActionLog {
    sessionId: string;
    startTime: number;
    events: ActionEvent[];
}
/**
 * Create empty action log
 */
export declare function createActionLog(sessionId: string): ActionLog;
/**
 * Add event to action log
 */
export declare function logAction(log: ActionLog, event: ActionEvent): void;
/**
 * Visit record: Aggregated data per node
 */
export interface VisitRecord {
    nodeId: string;
    kind: NodeKind;
    /** Total time spent focused (ms) */
    stayTime: number;
    /** Number of focus actions */
    focusCount: number;
    /** Net heat change during session */
    heatDelta: number;
}
/**
 * Summary metrics: Aggregate stats for session
 */
export interface SummaryMetrics {
    /** Total focus actions */
    totalFocus: number;
    /** Unique nodes visited */
    uniqueNodes: number;
    /** Total stay time across all nodes (ms) */
    totalStayTime: number;
    /** Maximum heat touched */
    maxHeatTouched: number;
}
/**
 * AutoCapsule: Server-generated capsule from action logs
 *
 * [Principle] 真実はサーバーにある
 * [Contents] Only metrics, no meaning
 */
export interface AutoCapsule {
    sessionId: string;
    /** Total session duration (ms) */
    duration: number;
    /** Per-node visit records */
    visits: VisitRecord[];
    /** Aggregate metrics */
    summaryMetrics: SummaryMetrics;
}
/**
 * Build AutoCapsule from ActionLog
 *
 * [Process]
 *   1. Aggregate focus events per node
 *   2. Calculate visit records
 *   3. Compute summary metrics
 */
export declare function buildAutoCapsule(log: ActionLog): AutoCapsule;
export {};
//# sourceMappingURL=auto-capsule.d.ts.map