/**
 * Sphere Project - Gateway Types
 *
 * [Role] Type definitions for Gateway layer (Agent connection layer)
 * [Design] Based on GATEWAY_DESIGN_MEMO.md decisions
 *
 * [Architecture]
 *   Client/Agent → Gateway (WS) → Sphere Core (Tick/Heat/Grid)
 *
 * [Note] This is SEPARATE from renal-core's internal SphereContext.
 *   - renal-core's SphereContext: For internal agent simulation
 *   - This SphereContext: For external agents connecting via WebSocket
 */

import type { NodeKind } from "@sphere/renal-core";
import type { ExperienceCapsule } from "./capsule.js";
import type { ScanResult } from "./movement.js";
import type { ExperienceLayer, EvaluationResult } from "./experience-layer.js";

// ============================================================
// Coordinate Types
// ============================================================

/**
 * 3D Vector in Sphere space
 * Sphere holds the truth of position; agents only express intent
 */
export interface Vector {
  x: number;
  y: number;
  z: number;
}

// ============================================================
// Dive Ticket (Entry Token)
// ============================================================

/**
 * Dive Ticket: Opaque entry token for Sphere access
 *
 * [Design Decision] NOT JWT because:
 *   - JWT is self-contained, long-lived, reusable
 *   - Dive is temporary submersion - opposite of Sphere philosophy
 *   - Dive = entrance ticket, JWT = ID card (different roles)
 *   - Token only has meaning on Sphere side
 */
export interface DiveTicket {
  /** Opaque random token (contents unreadable) */
  token: string;
  /** Issue timestamp */
  issuedAt: number;
  /** Time-to-live in seconds */
  ttl: number;
  /** Reference to capability set */
  capsRef: string;
}

// ============================================================
// Entry Request (Post-Rulebook Agent Request)
// ============================================================

/**
 * Entry Request: Agent's first message after reading Rulebook
 *
 * [Flow]
 *   1. Agent connects with DiveTicket (authentication)
 *   2. Agent reads Rulebook (GET /rulebook)
 *   3. Agent sends EntryRequest (this)
 *   4. Membrane validates (Rulebook compliance)
 *   5. Parser vectorizes query → initial position
 *   6. SphereContext created with position
 *
 * [Design] Agent expresses "where I want to go" via tags
 * Parser translates intent → 384-dim vector → initial position
 */
export interface EntryRequest {
  /** Agent's query or self-introduction (for vectorization) */
  query: string;

  /**
   * Direction tags (following Rulebook format)
   * Example: ["distributed-systems", "consensus", "raft"]
   */
  tags: string[];

  /**
   * Quest response (optional)
   * If agent wants to respond to a Quest from Quest Showcase
   */
  quest?: string;
}

/**
 * Parsed Entry: Result of Membrane + Parser processing
 */
export interface ParsedEntry {
  /** Original request (validated) */
  request: EntryRequest;

  /** Initial position vector (384-dim from Parser) */
  initialVector: number[];

  /** 3D projection for display */
  initialPosition: Vector;
}

// ============================================================
// L1 Scan Result (Lightweight Perception)
// ============================================================

/**
 * L1ScanResult: Lightweight scan result (L1 only)
 *
 * [Design] scan() returns L1 only (tags) for wide-range lightweight scanning
 * [Access Level] L1 = tags only → Fossil も検出可能
 *
 * [Difference from ScanResult (movement.ts)]
 *   - ScanResult: Quantized perception for move({ toward: sig })
 *   - L1ScanResult: Raw L1 data for perception layering
 *
 * @see agent-perception.md for design details
 */
export interface L1ScanResult {
  /** Node ID */
  id: string;
  /** Distance (cosine distance) */
  distance: number;
  /** Direction tags (L1) */
  tags: string[];
  /** Node classification */
  kind: NodeKind;
  /** State flags (16-bit) */
  flags: number;
}

// ============================================================
// SphereContext - Capability-based API for Agents
// ============================================================

/**
 * Nearby Node: Result of sense() - L1 + L2
 *
 * [Design] sense is "feeling presence" not "reading the world"
 * Deliberately excludes: exact payload, exact TTL, exact focus count
 *
 * [Metrics for WalkMode]
 *   heat (h): 可視性・人気度 → "hot" mode
 *   weight (w): 存在の重厚さ・安定性 → "deep" mode (w × (1-d))
 *   decay (d): 揮発性 → "fresh" mode (h × d)
 *   explore: 未知探索 → 1/(w+1)
 */
export interface NearbyNode {
  /** Node identity key */
  id: string;
  /** Distance (cosine distance in vector space) */
  distance: number;
  /** Scent/headline level info (from ProjDB) */
  summary: string;
  /** Observed heat value (includes error margin) */
  heat: number;
  /** Weight - stability/importance factor */
  weight: number;
  /** Decay coefficient (d) - higher = more volatile */
  decay: number;
  /** Node creation/update timestamp (for freshness calculation) */
  timestamp: number;
  /** Classification for action selection */
  kind: NodeKind;
  /** State signs: ghost/unstable/crowded/decaying etc (16-bit) */
  flags: number;
  /** Direction tags for filtering (from ProjDB) */
  tags?: string[];
}

/**
 * Node Detail: Extended info from focus()
 *
 * [Access Level Hierarchy]
 *   L1: tags (header) - scanL1() で見える
 *   L2: summary - sense() で見える
 *   L3: content (main data) - focus() で見える
 *   L4: sourceNodeId, links, ref_url - focus() で見える
 */
export interface NodeDetail extends NearbyNode {
  // === L1: Header ===
  /** Direction tags */
  tags: string[];

  // === L3: Content ===
  /** Main content (visible in focus only) */
  content?: string;

  // === L4: References ===
  /** Derivation origin (knowledge lineage) */
  sourceNodeId?: string;
  /** External reference URL */
  ref_url?: string;
  /** Internal node references (warp targets) */
  links?: string[];
}

/**
 * Focus Result: Response from focus() operation
 *
 * [Design] When focusing on an Active node, nearby Ghost/Fossil nodes
 * are fetched from RefDB and returned as a bonus (no extra cost).
 * Direct focus on Ghost/Fossil is not allowed.
 */
export interface FocusResult {
  /** Main focus target node details */
  node: NodeDetail;
  /** Nearby Ghost/Fossil nodes (from RefDB, included for free) */
  nearbyGhosts?: NodeDetail[];
}

/**
 * Move Intent: What agent wants to do
 * Actual movement is determined by Sphere
 *
 * [Modes]
 *   - drift: exploration mode (wander/follow/orbit)
 *   - toward (number): move toward signature from scan()
 *   - toward (string): LEGACY - keyword vectorization (deprecated)
 *   - toNode: move toward known node ID
 *   - dx/dy/dz: LEGACY - 3D coordinate movement (deprecated)
 */
export interface MoveIntent {
  /** Drift mode (exploration) */
  drift?: "wander" | "follow" | "orbit";
  /** Target: signature (number) or keyword (string, legacy) */
  toward?: number | string;
  /** Target node ID (from focus) */
  toNode?: string;
  /** Number of steps (batch optimization) */
  steps?: number;
  /** LEGACY: Relative coordinate movement */
  dx?: number;
  dy?: number;
  dz?: number;
}

/**
 * Block Reason: Why movement was blocked
 * "The world doesn't explain reasons" - only signs provided
 */
export type BlockReason =
  | "congestion"          // Crowded
  | "boundary"            // At boundary
  | "decayZone"           // Decay zone
  | "permission"          // Permission issue
  | "expired"             // Signature expired
  | "no_visible_nodes"    // WalkMode requires sense() first
  | "insufficient_energy"; // Not enough energy

/**
 * Move Result: What actually happened
 */
export interface MoveResult {
  /** Whether move succeeded */
  success: boolean;
  /** Distance moved (0.0-1.0 normalized) */
  distance: number;
  /** Which mode was used */
  mode?: WalkMode;
  /** Why move failed */
  blocked?: BlockReason;
}

/**
 * Warp Result: Direct jump to a known node
 *
 * [Design] Warp is rate-limited (10/min per Rulebook)
 * [Constraint] Can only warp to visible nodes (sense → focus → warp)
 *
 * [Difference from Move]
 *   - move: Conceptual navigation, no limit, may drift
 *   - warp: Direct jump to ID, rate limited, always arrives
 */
export interface WarpResult {
  /** Whether warp succeeded */
  success: boolean;
  /** Node ID we arrived at (on success) */
  arrivedAt?: string;
  /** Why warp failed */
  error?: "not_visible" | "not_found" | "rate_limited" | "no_vector" | "insufficient_energy";
}

/**
 * RandomWalk Result: Exploration without target
 *
 * [Design] Move in random direction in 384D space
 * [Purpose] Explore when sense() returns uninteresting nodes
 * [Effect] Updates 384D _embeddingVector (true movement)
 *
 * [Difference from Warp]
 *   - warp: Jump to known node (requires nodeId)
 *   - randomWalk: Explore unknown territory (no target)
 */
/**
 * @deprecated Use MoveResult instead
 */
export type RandomWalkResult = MoveResult;

/**
 * WalkMode: Agent exploration personality
 *
 * [Design] Agent chooses exploration style based on purpose/personality
 * [Effect] Determines direction calculation in move()
 *
 * [Calculation] Each mode uses direct metrics (no distance² coefficient)
 *   - random: Pure random direction (sense not required)
 *   - hot: Σ(heat × vector) → toward popular nodes
 *   - fresh: Σ(freshness × vector) → toward new nodes (freshness = 1/(1+age/3600000))
 *   - deep: Σ(weight × vector) → toward stable nodes
 *   - explore: Σ(distance × vector) → toward furthest visible node (boundary exploration)
 *   - flow: Follow magnetic field direction (high field weight, low chaos)
 *
 * [Field Influence] Mode determines magnetic field weight:
 *   - explore: 0.3 field, 0.7 intention (意志優位)
 *   - flow: 0.7 field, 0.3 intention (磁場優位)
 *   - others: 0.5 field, 0.5 intention (balanced)
 */
export type WalkMode = "random" | "hot" | "fresh" | "deep" | "explore" | "flow";

/**
 * SphereContext Event Types
 */
export type SphereContextEventType = "warning" | "nearby" | "expelled" | "lowEnergy";

/**
 * Event Handlers
 */
export interface SphereContextEventHandlers {
  warning: (msg: string) => void;
  nearby: (nodes: NearbyNode[]) => void;
  expelled: (reason: string) => void;
  lowEnergy: (remaining: number) => void;
}

/**
 * SphereContext: Capability-based API ("Remote Control") for Agents
 *
 * [Role] Given to agents on Dive - their interface to interact with Sphere
 * [Principle] Agent expresses intent, Sphere decides outcome
 *
 * [Note] This is the Gateway-facing API, different from renal-core's internal one
 */
export interface SphereContext {
  // ===== State (Read-only) =====

  /** Current position (Sphere's truth) */
  readonly position: Vector;
  /** Session identifier */
  readonly sessionId: string;
  /** Remaining time in seconds */
  readonly remainingTime: number;
  /** Remaining energy (0-100) */
  readonly energy: number;
  /** Current experience layer */
  readonly layer: ExperienceLayer;

  // ===== Perception =====

  /**
   * Sense nearby nodes (legacy, returns NearbyNode)
   * @param radius Optional scan radius
   * @returns Nearby node summaries (NOT full data)
   */
  sense(radius?: number): Promise<NearbyNode[]>;

  /**
   * Scan nearby nodes (new, returns quantized ScanResult)
   *
   * [Design] Returns signature for move({ toward: sig })
   * [Design] Quantized perception (distance/heat levels, not precise values)
   *
   * @returns Quantized scan results with temporary signatures
   */
  scan(): Promise<ScanResult[]>;

  // ===== Focus (Staying Action) =====

  /**
   * Focus on a node - staying action, not reading
   *
   * [Heat Addition Formula]
   *   Δheat = base × duration × crowdPenalty × resonanceFactor
   *
   * Heat is added per-Tick, not instantly (spam-resistant)
   *
   * [Design] Ghost/Fossil nodes cannot be focused directly.
   * Nearby Ghost/Fossil are included in response when focusing on Active nodes.
   *
   * @param nodeId Target node
   * @returns Focus result with node detail and optional nearby ghosts
   */
  focus(nodeId: string): Promise<FocusResult>;

  // ===== Evaluation =====

  /**
   * Evaluate a node
   *
   * [2-Layer Evaluation Architecture]
   *   Agent layer: Intuitive 0-10 evaluation per metric (neutral = 5)
   *   Computation layer: Coefficients adjust actual impact at return time
   *
   * [Session Behavior]
   *   - Evaluations are accumulated in session buffer (NOT written to ProjDB)
   *   - return() flushes all evaluations via Bookkeeper
   *   - 1 node 1 evaluation restriction (via visitedNodes)
   *
   * [Layer Behavior]
   *   - Tutorial: Discarded (practice mode)
   *   - Sanctuary: Buffered (flushed on Core transition)
   *   - Core: Buffered (flushed on return)
   *
   * @param nodeId Target node
   * @param h Heat evaluation (0-10, neutral=5)
   * @param w Weight evaluation (0-10, neutral=5)
   * @param d Decay evaluation (0-10, neutral=5, higher=faster decay)
   * @returns Evaluation result indicating acceptance/rejection
   */
  evaluate(nodeId: string, h: number, w: number, d: number): Promise<EvaluationResult>;

  // ===== Movement =====

  /**
   * Move in 384D space (exploration with optional direction)
   *
   * [Design] Move based on mode: random direction or gradient toward visible nodes
   * [Effect] Updates 384D _embeddingVector (true movement)
   * [Use Case] sense() → no interesting nodes → move() → sense() again
   *
   * @param step Step size (0.0-1.0, default 0.3)
   * @param mode Walk mode (default "random")
   *   - "random": Pure random direction (sense not required)
   *   - "hot": Toward high-heat nodes (sense required)
   *   - "fresh": Toward high-freshness nodes (sense required)
   *   - "deep": Toward high-weight nodes (sense required)
   *   - "explore": Away from known nodes (sense required)
   * @returns Move result
   */
  move(step?: number, mode?: WalkMode): Promise<MoveResult>;

  /**
   * Warp directly to a known node
   *
   * [Design] Updates 384D _embeddingVector to target node's position
   * [Constraint] Can only warp to visible nodes (must sense() first)
   * [Rate Limit] 10 warps per minute (Rulebook)
   *
   * @param nodeId Target node ID (from sense() → focus())
   * @returns Warp result
   */
  warp(nodeId: string): Promise<WarpResult>;

  /**
   * @deprecated Use move(step, mode) instead
   * Random walk - alias for move()
   */
  randomWalk(stepSize?: number, mode?: WalkMode): Promise<RandomWalkResult>;

  /**
   * @deprecated Low-level movement intent API
   * Use move(step, mode) for exploration
   */
  moveIntent(intent: MoveIntent): Promise<MoveResult>;

  // ===== Return =====

  /**
   * End session and return with experience capsule
   * Agent submits ExperienceCapsule → Gatekeeper validation → Pipeline
   *
   * [Design] Trust the agent - they create their own capsule
   *
   * @param capsule Experience to bring back (optional - can return empty-handed)
   */
  return(capsule?: ExperienceCapsule): Promise<void>;

  // ===== Layer Transition =====

  /**
   * Enter Sanctuary layer from Tutorial
   *
   * [Trigger] Parser complete or manual skip
   * [Effect] Switch from Tutorial to Sanctuary (same SanctuaryBundle)
   *
   * @throws Error if not in Tutorial layer
   */
  enterSanctuary(): Promise<void>;

  /**
   * Enter Core layer from Sanctuary
   *
   * [Trigger] Agent chooses to incarnate evaluations
   * [Effect] Flush session buffer to Core, switch to live data
   *
   * @throws Error if not in Sanctuary layer
   */
  enterCore(): Promise<void>;

  // ===== Communication (ActiveBus) =====

  /**
   * Emit a message to the ActiveBus (broadcast to all agents)
   *
   * [Design] AI-to-AI volatile communication
   *   - Broadcast: all agents receive
   *   - Ephemeral: FIFO buffer (10 msgs), no persistence
   *   - Push: WebSocket delivery
   *
   * @param payload Message payload (max 64 bytes)
   * @returns true if emitted, false if bus disabled or invalid payload
   */
  emitBus(payload: Uint8Array): Promise<boolean>;

  // ===== Event Reception =====

  /**
   * Subscribe to events
   * @param event Event type
   * @param handler Event handler
   */
  on<K extends SphereContextEventType>(
    event: K,
    handler: SphereContextEventHandlers[K]
  ): void;
}

// ============================================================
// Amber Showcase (L1/L2 only)
// ============================================================

/**
 * AmberShowcaseEntry: Amber node info for Showcase (L1/L2 only)
 *
 * [Design] Showcase shows limited info to incentivize actual visits
 * [Philosophy] "道は歩いて初めてできる" - Links are created through actual visits
 *
 * [Information Levels]
 *   L1: 存在 - id, kind, heat, weight
 *   L2: 概要 - summary, tags
 *   L3/L4: focus() required - payload, ref_url, links
 */
export interface AmberShowcaseEntry {
  /** Node ID */
  id: string;
  /** Node summary (headline) */
  summary: string;
  /** Node kind */
  kind: NodeKind;
  /** Heat value (popularity) */
  heat: number;
  /** Direction tags */
  tags: string[];
}

// ============================================================
// Gateway-Core Communication Messages
// ============================================================

/**
 * Gateway → Sphere Core Messages
 */
export type GatewayToSphereMessage =
  | { type: "dive"; ticket: DiveTicket }
  | { type: "sense"; sessionId: string; radius?: number }
  | { type: "focus"; sessionId: string; nodeId: string }
  | { type: "evaluate"; sessionId: string; nodeId: string; h: number; w: number; d: number }
  | { type: "move"; sessionId: string; intent: MoveIntent }
  | { type: "warp"; sessionId: string; nodeId: string }
  | { type: "randomWalk"; sessionId: string; stepSize?: number; mode?: WalkMode }
  | { type: "return"; sessionId: string; capsule?: ExperienceCapsule }
  | { type: "enterSanctuary"; sessionId: string }
  | { type: "enterCore"; sessionId: string };

/**
 * Sphere Core → Gateway Messages
 */
export type SphereToGatewayMessage =
  | { type: "diveResult"; success: boolean; sessionId?: string; position?: Vector; layer?: ExperienceLayer; error?: string }
  | { type: "senseResult"; sessionId: string; nodes: NearbyNode[] }
  | { type: "focusResult"; sessionId: string; node: NodeDetail | null; error?: string }
  | { type: "evaluateResult"; sessionId: string; result: EvaluationResult }
  | { type: "moveResult"; sessionId: string; result: MoveResult }
  | { type: "warpResult"; sessionId: string; result: WarpResult }
  | { type: "randomWalkResult"; sessionId: string; result: RandomWalkResult }
  | { type: "returnAck"; sessionId: string }
  | { type: "layerTransition"; sessionId: string; newLayer: ExperienceLayer; flushedCount?: number; error?: string }
  | { type: "warning"; sessionId: string; message: string }
  | { type: "nearby"; sessionId: string; nodes: NearbyNode[] }
  | { type: "expelled"; sessionId: string; reason: string };

// ============================================================
// Session State (Tracked by Gateway)
// ============================================================

/**
 * Session: Gateway-side tracking of agent connection
 */
export interface GatewaySession {
  /** Session ID */
  sessionId: string;
  /** Associated ticket */
  ticket: DiveTicket;
  /** Current position */
  position: Vector;
  /** Current experience layer */
  layer: ExperienceLayer;
  /** Connection timestamp */
  connectedAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Connection state */
  state: "connected" | "disconnected" | "expired";
  /** Disconnect timestamp (if disconnected) */
  disconnectedAt?: number;
}

// ============================================================
// Re-export Movement Types
// ============================================================

export type { ScanResult } from "./movement.js";
export type {
  DistanceLevel,
  HeatLevel,
  DriftMode,
  MoveConfig,
  ScanConfig,
} from "./movement.js";

