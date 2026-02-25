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

// ============================================================
// Action Log (Raw Events)
// ============================================================

/**
 * Base action event
 */
interface ActionEventBase {
  /** Timestamp of the action */
  timestamp: number;
}

/**
 * Focus action: Agent focused on a node
 * [2026-02-25] positionSnapshot added for trajectory analysis (Spectral pattern)
 */
export interface FocusAction extends ActionEventBase {
  type: "focus";
  nodeId: string;
  kind: NodeKind;
  heatAtFocus: number;
  /** L3: Derivation origin (if this node is derived from another) */
  sourceNodeId?: string;
  /** Agent's embedding position at the moment of focus (for trajectory/Δpos analysis) */
  positionSnapshot?: number[];
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
export type ActionEvent =
  | FocusAction
  | FocusEndAction
  | EvaluateAction
  | MoveAction
  | WarpAction
  | EmitAction;

// ============================================================
// Action Log (Session Record)
// ============================================================

/**
 * ActionLog: Complete action history for a session
 *
 * [Usage] Collected during session, used to build AutoCapsule
 * [2026-02-25] agentId, initialQuery, sphereId added for cross-session linkage
 *   - agentId: Facade journeyId or external agent identifier (optional)
 *   - initialQuery: What the agent came to explore
 *   - sphereId: Which sphere was dived into
 */
export interface ActionLog {
  sessionId: string;
  startTime: number;
  events: ActionEvent[];
  /** Cross-session identifier (Facade journeyId or external agent ID) */
  agentId?: string;
  /** Initial query text (what the agent came to explore) */
  initialQuery?: string;
  /** Sphere identifier */
  sphereId?: string;
}

/**
 * Create empty action log
 */
export function createActionLog(
  sessionId: string,
  meta?: { agentId?: string; initialQuery?: string; sphereId?: string }
): ActionLog {
  return {
    sessionId,
    startTime: Date.now(),
    events: [],
    agentId: meta?.agentId,
    initialQuery: meta?.initialQuery,
    sphereId: meta?.sphereId,
  };
}

/**
 * Add event to action log
 */
export function logAction(log: ActionLog, event: ActionEvent): void {
  log.events.push(event);
}

// ============================================================
// AutoCapsule (Server Truth)
// ============================================================

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
 * [2026-02-25] lastPosition added for reconnection support
 */
export interface AutoCapsule {
  sessionId: string;
  /** Total session duration (ms) */
  duration: number;
  /** Per-node visit records */
  visits: VisitRecord[];
  /** Aggregate metrics */
  summaryMetrics: SummaryMetrics;
  /** Agent's final embedding position (for reconnection to same location) */
  lastPosition?: number[];
}

// ============================================================
// AutoCapsule Builder
// ============================================================

/**
 * Build AutoCapsule from ActionLog
 *
 * [Process]
 *   1. Aggregate focus events per node
 *   2. Calculate visit records
 *   3. Compute summary metrics
 */
export function buildAutoCapsule(log: ActionLog): AutoCapsule {
  const endTime = Date.now();
  const duration = endTime - log.startTime;

  // Track per-node data
  const nodeData = new Map<
    string,
    {
      kind: NodeKind;
      stayTime: number;
      focusCount: number;
      heatDelta: number;
      maxHeat: number;
    }
  >();

  // Track last focus position for reconnection
  let lastPosition: number[] | undefined;

  // Process events
  for (const event of log.events) {
    switch (event.type) {
      case "focus": {
        const data = nodeData.get(event.nodeId) || {
          kind: event.kind,
          stayTime: 0,
          focusCount: 0,
          heatDelta: 0,
          maxHeat: 0,
        };
        data.focusCount++;
        data.maxHeat = Math.max(data.maxHeat, event.heatAtFocus);
        nodeData.set(event.nodeId, data);
        // Update last known position (for reconnection)
        if (event.positionSnapshot) {
          lastPosition = event.positionSnapshot;
        }
        break;
      }

      case "focusEnd": {
        const data = nodeData.get(event.nodeId);
        if (data) {
          data.stayTime += event.duration;
          data.heatDelta += event.heatDelta;
        }
        break;
      }

      case "move": {
        // Move events tracked for session stats only
        break;
      }

      case "evaluate": {
        // Evaluations are tracked but don't affect AutoCapsule directly
        // The heat delta comes from focusEnd
        break;
      }
    }
  }

  // Build visits array
  const visits: VisitRecord[] = [];
  let totalFocus = 0;
  let totalStayTime = 0;
  let maxHeatTouched = 0;

  for (const [nodeId, data] of nodeData) {
    visits.push({
      nodeId,
      kind: data.kind,
      stayTime: data.stayTime,
      focusCount: data.focusCount,
      heatDelta: data.heatDelta,
    });

    totalFocus += data.focusCount;
    totalStayTime += data.stayTime;
    maxHeatTouched = Math.max(maxHeatTouched, data.maxHeat);
  }

  // Sort visits by focus count (most focused first)
  visits.sort((a, b) => b.focusCount - a.focusCount);

  return {
    sessionId: log.sessionId,
    duration,
    visits,
    lastPosition,
    summaryMetrics: {
      totalFocus,
      uniqueNodes: nodeData.size,
      totalStayTime,
      maxHeatTouched,
    },
  };
}
