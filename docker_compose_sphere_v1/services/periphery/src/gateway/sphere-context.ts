/**
 * Sphere Project - SphereContext Implementation
 *
 * [Role] Provides Capability-based API to agents during Dive
 * [Design] Connects to Sphere Core via SphereCoreAdapter
 *
 * [Lifecycle]
 *   1. Created when agent connects with valid ticket
 *   2. Provides sense/focus/move/return methods
 *   3. Destroyed on return() or session expiry
 *
 * [Coordinate System]
 *   - _embeddingVector: Full semantic position (384-dim)
 *   - _position (Vector): 3D projection for display
 */

import type {
  SphereContext,
  SphereContextEventType,
  SphereContextEventHandlers,
  Vector,
  NearbyNode,
  NodeDetail,
  FocusResult,
  MoveIntent,
  MoveResult,
  WarpResult,
  WalkMode,
  GatewaySession,
  DiveTicket,
  ScanResult,
  L1ScanResult,
} from "../types/gateway.js";
import type { ExperienceCapsule, NodeEvaluation } from "../types/capsule.js";
import { CAPSULE_SCHEMA_VERSION } from "../types/capsule.js";
import type {
  ExperienceLayer,
  EvaluationResult,
  SessionBuffer,
} from "../types/experience-layer.js";
import type { ActionLog, AutoCapsule } from "../types/auto-capsule.js";
import { createActionLog, logAction, buildAutoCapsule } from "../types/auto-capsule.js";
import {
  createSessionBuffer,
  addEvaluationToBuffer,
  handleLayerEvaluation,
  isValidTransition,
  LAYER_CHARACTERISTICS,
} from "../types/experience-layer.js";
import type { IIncarnationPipeline } from "../incarnation/pipeline.js";
import type { SphereCoreAdapter } from "./sphere-core-adapter.js";
import { AgentMovementState } from "./move.js";
import type { MoveIntent as InternalMoveIntent } from "../types/movement.js";
import { DEFAULT_MOVE_CONFIG } from "../types/movement.js";
import type { PeripheryConfig } from "../types/config.js";
import type { GlobalFieldLayer } from "../field/index.js";
import type { FieldInfo, LocalField } from "../field/types.js";
import type { ActiveBusLayer } from "../bus/index.js";

// ============================================================
// Configuration
// ============================================================

/** Default session TTL (seconds) - used when config not provided */
const DEFAULT_SESSION_TTL = 180;

/** Default warning time before end (seconds) */
const DEFAULT_WARNING_BEFORE_END = 30;

/** Default sense radius (multiplier) */
const DEFAULT_SENSE_RADIUS = 1.0;

/** Default energy settings */
const DEFAULT_ENERGY = {
  initial: 100,
  warningThreshold: 10,
  costs: {
    scan: 1,      // scanL1() (perception); internal scan() has no cost
    sense: 3,
    move: 5,
    focus: 10,
    warp: 15,
    evaluate: 3,
  },
};

/**
 * Layer-specific energy cost multipliers
 * [Design] Tutorial = free exploration (vectorization wait time)
 *          Sanctuary = low cost (encourage exploration, save energy for Core)
 *          Core = full cost (live world, full metabolism)
 */
const LAYER_ENERGY_MULTIPLIER: Record<ExperienceLayer, number> = {
  tutorial: 0,     // No energy cost — practice / vectorization wait
  sanctuary: 0.5,  // Half cost — static view, encourage browsing
  core: 1.0,       // Full cost — live world
  vestibule: 0,    // No energy cost — exit membrane
};

/**
 * Energy recovery on Core entry
 * [Design] Reward efficient Sanctuary exploration with partial recovery
 */
const CORE_ENTRY_ENERGY_RECOVERY = 30;

/** Node kinds visible in Sanctuary layer (amber + relic) */
const SANCTUARY_VISIBLE_KINDS = new Set(["amber", "relic"]);

/** Node kinds visible in Tutorial layer (relic only — amber is earned, not given) */
const TUTORIAL_VISIBLE_KINDS = new Set(["relic"]);

/** Max evaluations per session (prevents mass-evaluation spam) */
const MAX_EVALUATIONS_PER_SESSION = 10;

// ============================================================
// Utility: Project high-dim vector to 3D for display
// ============================================================

function projectTo3D(vector: number[]): Vector {
  if (vector.length < 3) {
    return { x: 0, y: 0, z: 0 };
  }
  // Simple projection: use first 3 dimensions (scaled)
  // More sophisticated: PCA or UMAP could be used
  return {
    x: vector[0] * 100,
    y: vector[1] * 100,
    z: vector[2] * 100,
  };
}

// ============================================================
// Visible Node Info (for gradient calculation in WalkMode)
// ============================================================

/**
 * Information about a visible node (from sense() result)
 * Used for gradient calculation in move(mode)
 *
 * [Metrics for WalkMode]
 *   heat (h): 可視性・人気度 → "hot" mode
 *   decay (d): 揮発性係数 → "fresh" mode (h × d)
 *   weight (w): 安定性 → "deep" mode (w × (1-d/1000))
 *   explore: 未知探索 → 1/(w+1)
 */
interface VisibleNodeInfo {
  vector: number[];      // 384D position
  kind: string;          // Node kind (for cost calculation)
  heat: number;          // h - Popularity metric
  decay: number;         // d - Decay coefficient (0-2000 range)
  freshness: number;     // timestamp-based (legacy, for fallback)
  weight: number;        // w - Stability metric
  distance: number;      // Distance from agent
}

// ============================================================
// SphereContext Implementation
// ============================================================

export class SphereContextImpl implements SphereContext {
  private _position: Vector;
  private _embeddingVector: number[];  // Full semantic position
  private _sessionId: string;
  private _startTime: number;
  private _eventHandlers: Map<SphereContextEventType, Function[]> = new Map();
  private _session: GatewaySession;
  private _warningTimer: ReturnType<typeof setTimeout> | null = null;
  private _expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private _ended = false;

  // Session timing (from config)
  private _sessionTtl: number;
  private _warningBeforeEnd: number;

  // Energy management
  private _energy: number;
  private _energyConfig: typeof DEFAULT_ENERGY;
  private _lowEnergyWarned = false;

  // 3-Layer Piping State
  private _layer: ExperienceLayer = "tutorial";
  private _queryReady = false;  // true after real query vector is set via reposition()
  private _sessionBuffer: SessionBuffer;

  // Action Logging (for AutoCapsule generation)
  private _actionLog: ActionLog;
  private _currentFocusNodeId: string | null = null;
  private _currentFocusStartTime: number = 0;

  // Vestibule state
  private _autoProcessResult: { evaluationsApplied: number; autoCapsuleSaved: boolean } | null = null;
  private _autoCapsule: AutoCapsule | null = null;
  private _pendingCapsule?: ExperienceCapsule;

  // Dependencies
  private pipeline?: IIncarnationPipeline;
  private coreAdapter?: SphereCoreAdapter;
  private globalFieldLayer?: GlobalFieldLayer;
  private activeBusLayer?: ActiveBusLayer;
  private movementState: AgentMovementState;

  // Local field cache (computed after sense())
  private _lastLocalField?: LocalField;

  // Known nodes: scan + sense results → evaluate/warp eligible
  // [WalkMode] Stores full node info for gradient calculation
  private _visibleNodes: Map<string, VisibleNodeInfo> = new Map();

  // Sensed nodes: sense() results only → focus eligible (proximity confirmed)
  private _sensedNodeIds: Set<string> = new Set();

  // Evaluation tracking: prevents duplicate evaluations in same session
  // [Design] 1 node = 1 evaluation per session (no spam)
  private _evaluatedIds: Set<string> = new Set();

  constructor(
    ticket: DiveTicket,
    sessionId: string,
    initialVector: number[],
    pipeline?: IIncarnationPipeline,
    coreAdapter?: SphereCoreAdapter,
    sessionConfig?: PeripheryConfig["session"],
    energyConfig?: PeripheryConfig["energy"],
    globalFieldLayer?: GlobalFieldLayer,
    activeBusLayer?: ActiveBusLayer
  ) {
    this._sessionId = sessionId;
    this._embeddingVector = initialVector;
    this._position = projectTo3D(initialVector);
    this._startTime = Date.now();
    this.pipeline = pipeline;
    this.coreAdapter = coreAdapter;
    this.globalFieldLayer = globalFieldLayer;
    this.activeBusLayer = activeBusLayer;

    // Session timing from config (or defaults)
    this._sessionTtl = sessionConfig?.ttlSeconds ?? DEFAULT_SESSION_TTL;
    this._warningBeforeEnd = sessionConfig?.warningBeforeEndSeconds ?? DEFAULT_WARNING_BEFORE_END;

    // Energy management from config (or defaults)
    this._energyConfig = energyConfig ?? DEFAULT_ENERGY;
    this._energy = this._energyConfig.initial;

    this._session = {
      sessionId,
      ticket,
      position: this._position,
      layer: this._layer,
      connectedAt: this._startTime,
      lastActivityAt: this._startTime,
      state: "connected",
    };

    // Initialize session buffer for 3-layer piping
    this._sessionBuffer = createSessionBuffer(sessionId, this._layer);

    // Initialize action log for AutoCapsule generation
    this._actionLog = createActionLog(sessionId);

    // Initialize movement state
    this.movementState = new AgentMovementState(initialVector, {
      ...DEFAULT_MOVE_CONFIG,
      vectorDimension: initialVector.length,
    });

    // Set up timers
    this.setupTimers();

    console.log(`[SphereContext] Created session ${sessionId} (vector dim=${initialVector.length})`);
  }

  // ===== Internal: Get embedding vector =====

  get embeddingVector(): number[] {
    return [...this._embeddingVector];
  }

  // ===== Read-only Properties =====

  get position(): Vector {
    return { ...this._position };
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get remainingTime(): number {
    const elapsed = (Date.now() - this._startTime) / 1000;
    return Math.max(0, this._sessionTtl - elapsed);
  }

  get energy(): number {
    return this._energy;
  }

  get layer(): ExperienceLayer {
    return this._layer;
  }

  // ===== Perception =====

  async sense(radius?: number): Promise<NearbyNode[]> {
    this.checkSession();
    this.updateActivity();

    // Consume energy
    if (!this.consumeEnergy("sense")) {
      return [];  // No energy, return empty
    }

    const r = radius ?? DEFAULT_SENSE_RADIUS;

    // Use adapter if available, otherwise fall back to mock
    let nodes: NearbyNode[];
    if (this.coreAdapter) {
      nodes = await this.coreAdapter.sense(this._embeddingVector, r);
    } else {
      nodes = this.mockSense(r);
    }

    // Layer access control: filter by node kind
    nodes = this.filterByLayer(nodes);

    // Track visible nodes: only these can be focused/warped
    // [Design] Prevents "teleporting" to unseen nodes
    // [WalkMode] Stores info for gradient calculation (vector fetched on demand)
    // [Phase 4] Calculate freshness from timestamp: 1 / (1 + age/3600000) (1hr half-life)
    const now = Date.now();
    this._visibleNodes.clear();  // Known nodes reset on new sense
    this._sensedNodeIds.clear(); // Proximity-confirmed nodes reset
    for (const node of nodes) {
      const age = now - (node.timestamp || now);
      const freshness = 1 / (1 + age / 3600000);  // 1 hour half-life (legacy fallback)
      this._visibleNodes.set(node.id, {
        vector: [],  // Fetched on demand during gradient calculation
        kind: node.kind,
        heat: node.heat,
        decay: node.decay,  // d metric from node
        freshness,
        weight: node.weight,
        distance: node.distance,
      });
      this._sensedNodeIds.add(node.id);
    }

    // Log sense results
    console.log(`[SphereContext] sense(radius=${r}): ${nodes.length} nodes visible`);
    if (nodes.length > 0) {
      // Show top 5 nodes with details (summary not in ProjDB - use tags or kind)
      const preview = nodes.slice(0, 5).map(n =>
        `  ${n.id.substring(0, 8)}... [${n.kind}] h=${n.heat.toFixed(1)} d=${n.distance.toFixed(3)} tags=[${n.tags?.join(',') || ''}]`
      );
      console.log(`[SphereContext] Top nodes:\n${preview.join('\n')}`);
    }
    return nodes;
  }

  // ===== Field (Magnetic Field) =====

  /**
   * Get current magnetic field information
   *
   * [Design] Returns global field always, local field if sense() was called
   * [Usage] Agent can query field to understand sphere "climate"
   *
   * @returns FieldInfo with global and optional local field
   */
  getField(): FieldInfo {
    if (!this.globalFieldLayer) {
      // No field layer available - return empty field
      return {
        global: {
          updatedAt: Date.now(),
          vector: new Array(this._embeddingVector.length).fill(0),
          intensity: 0,
          volatility: 0,
          dominantFlags: 0,
          sampleCount: 0,
        },
      };
    }

    const global = this.globalFieldLayer.getGlobalField();

    return {
      global,
      local: this._lastLocalField,
    };
  }

  // ===== Scan (Movement System — internal only) =====
  // [Note] Gateway の case "scan" は scanL1() を呼ぶ (知覚層)。
  // この scan() は移動システム内部用 (量子化された ScanResult を返す)。
  // Gateway からは呼ばれない。deprecate 候補だが現時点では残置。

  async scan(): Promise<ScanResult[]> {
    this.checkSession();
    this.updateActivity();

    console.log(`[SphereContext] scan() at vector dim=${this._embeddingVector.length}`);

    // Get nodes from adapter or use mock
    let nodes: any[] = [];
    if (this.coreAdapter) {
      // Get raw nodes from adapter for scanning
      const nearbyNodes = await this.coreAdapter.sense(this._embeddingVector, 1.0);
      // Layer access control: filter by node kind
      const filtered = this.filterByLayer(nearbyNodes);
      // Convert NearbyNode to SphereNode-like structure for movement system
      nodes = filtered.map((n) => ({
        id: n.id,
        vector: [], // Will be fetched by adapter if needed
        kind: n.kind,
        metrics: { h: n.heat / 100, w: n.weight },
      }));
    }

    // Use movement state to perform scan
    return this.movementState.scan(nodes);
  }

  // ===== ScanL1 (Perception Layer) =====

  async scanL1(radius?: number): Promise<L1ScanResult[]> {
    this.checkSession();
    this.updateActivity();

    if (!this.consumeEnergy("scan")) {
      return [];
    }

    const r = radius ?? 2.0;  // Default wider than sense
    console.log(`[SphereContext] scanL1(radius=${r})`);

    if (this.coreAdapter) {
      const rawResults = await this.coreAdapter.scanL1(this._embeddingVector, r);

      // Layer access control: filter by node kind
      const results = this.filterByLayer(rawResults);

      // Track scanned nodes as known (evaluate-eligible, warp-eligible)
      // [Design] Does NOT clear existing visibleNodes — scan supplements sense
      for (const node of results) {
        if (!this._visibleNodes.has(node.id)) {
          this._visibleNodes.set(node.id, {
            vector: [],  // Not available from L1 scan
            kind: node.kind,
            heat: 0,
            weight: 0,
            decay: 0,
            distance: 0,
            freshness: 0,
          });
        }
      }

      return results;
    }
    return [];
  }

  // ===== Focus =====

  async focus(nodeId: string): Promise<FocusResult> {
    this.checkSession();
    this.updateActivity();

    // Consume energy
    if (!this.consumeEnergy("focus")) {
      throw new Error("Insufficient energy for focus");
    }

    console.log(`[SphereContext] focus(nodeId=${nodeId}) -10 energy`);

    // Proximity check: only sense() results can be focused (nearby confirmed)
    // [Design] scan gives IDs but not proximity — focus requires sense()
    if (this._sensedNodeIds.size > 0 && !this._sensedNodeIds.has(nodeId)) {
      throw new Error(`Node ${nodeId} not reachable - call sense() first to discover nearby nodes`);
    }

    // Layer kind guard: sanctuary/tutorial can only focus amber + relic
    // [Design] Defensive — sense/scan already filter, but guard against direct ID access
    if (this._layer !== "core") {
      const nodeInfo = this._visibleNodes.get(nodeId);
      if (nodeInfo && !SANCTUARY_VISIBLE_KINDS.has(nodeInfo.kind)) {
        throw new Error(`Node ${nodeId} not accessible in ${this._layer} layer`);
      }
    }

    // End previous focus if any (with action log)
    this.endCurrentFocus();

    // Use adapter if available
    let detail: NodeDetail;
    let nearbyGhosts: NodeDetail[] | undefined;
    if (this.coreAdapter) {
      const focusResult = await this.coreAdapter.focus(
        this._sessionId,
        nodeId,
        this._embeddingVector
      );
      if (focusResult) {
        detail = focusResult.node;
        nearbyGhosts = focusResult.nearbyGhosts;
      } else {
        // If node not found or ghost/fossil (cannot focus directly), fall back to mock
        console.warn(`[SphereContext] Node ${nodeId} not focusable (not found or ghost/fossil), using mock`);
        detail = this.mockFocus(nodeId);
      }
    } else {
      detail = this.mockFocus(nodeId);
    }

    // Detailed logging for focused node
    console.log(`[SphereContext] 🔍 Focused on: ${nodeId.substring(0, 12)}...`);
    console.log(`[SphereContext]   kind: ${detail.kind}, heat: ${detail.heat.toFixed(1)}`);
    console.log(`[SphereContext]   summary: "${detail.summary?.substring(0, 60) || '(no summary)'}..."`);
    if (detail.tags && detail.tags.length > 0) {
      console.log(`[SphereContext]   tags: [${detail.tags.join(', ')}]`);
    }
    if (detail.sourceNodeId) {
      console.log(`[SphereContext]   source: ${detail.sourceNodeId.substring(0, 12)}...`);
    }

    // Log focus action
    this._currentFocusNodeId = nodeId;
    this._currentFocusStartTime = Date.now();

    logAction(this._actionLog, {
      type: "focus",
      timestamp: this._currentFocusStartTime,
      nodeId,
      kind: detail.kind,
      heatAtFocus: detail.heat,
      sourceNodeId: detail.sourceNodeId,  // L3: track derivation for depth awareness
    });

    // Log nearby ghosts if any
    if (nearbyGhosts && nearbyGhosts.length > 0) {
      console.log(`[SphereContext]   nearbyGhosts: ${nearbyGhosts.length} (included for free)`);
      for (const ghost of nearbyGhosts.slice(0, 3)) {
        console.log(`[SphereContext]     - [${ghost.kind}] ${ghost.summary?.substring(0, 40)}...`);
      }
    }

    return {
      node: detail,
      nearbyGhosts: nearbyGhosts,
    };
  }

  /**
   * End current focus and log focusEnd action
   */
  private endCurrentFocus(): void {
    if (this._currentFocusNodeId) {
      const now = Date.now();
      const duration = now - this._currentFocusStartTime;

      logAction(this._actionLog, {
        type: "focusEnd",
        timestamp: now,
        nodeId: this._currentFocusNodeId,
        duration,
        heatDelta: 0, // Will be updated by evaluate or heat decay
      });

      this._currentFocusNodeId = null;
      this._currentFocusStartTime = 0;
    }
  }

  // ===== Evaluation =====

  /**
   * Evaluate a node (accumulate in buffer, NOT written to ProjDB)
   *
   * [2-Layer Evaluation Architecture]
   *   Agent layer: Intuitive 0-10 evaluation per metric (neutral = 5)
   *   Computation layer: Coefficients adjust actual impact (Bookkeeper at return time)
   *
   * [Session Behavior]
   *   - All evaluations are accumulated in session buffer
   *   - return() flushes evaluations via ExperienceCapsule → Bookkeeper
   *   - No real-time ProjDB writes
   *
   * @param nodeId Target node
   * @param h Heat evaluation (0-10, neutral=5)
   * @param w Weight evaluation (0-10, neutral=5)
   * @param d Decay evaluation (0-10, neutral=5, higher=faster decay)
   */
  async evaluate(nodeId: string, h: number, w: number, d: number): Promise<EvaluationResult> {
    this.checkSession();
    this.updateActivity();

    // [Constraint 1] Already evaluated in this session - 1 node = 1 evaluation
    if (this._evaluatedIds.has(nodeId)) {
      console.log(`[SphereContext] evaluate rejected: already evaluated ${nodeId.slice(0, 8)}`);
      return { success: false, reason: "already_evaluated" };
    }

    // [Constraint 2] Max evaluations per session
    if (this._evaluatedIds.size >= MAX_EVALUATIONS_PER_SESSION) {
      console.log(`[SphereContext] evaluate rejected: session limit reached (${MAX_EVALUATIONS_PER_SESSION})`);
      return { success: false, reason: "session_limit_reached" };
    }

    // [Constraint 3] Must have node in possession (from scan/sense/focus)
    if (this._visibleNodes.size > 0 && !this._visibleNodes.has(nodeId)) {
      console.log(`[SphereContext] evaluate rejected: node ${nodeId.slice(0, 8)} not in possession`);
      return { success: false, reason: "not_in_possession" };
    }

    // Consume energy
    if (!this.consumeEnergy("evaluate")) {
      return { success: false, reason: "insufficient_energy" };
    }

    // Validate input range (0-10)
    if (h < 0 || h > 10 || w < 0 || w > 10 || d < 0 || d > 10) {
      throw new Error("Evaluation values must be between 0 and 10");
    }

    console.log(`[SphereContext] evaluate(nodeId=${nodeId}, h=${h}, w=${w}, d=${d}, layer=${this._layer})`);

    // Log evaluate action (for action log, not buffer)
    logAction(this._actionLog, {
      type: "evaluate",
      timestamp: Date.now(),
      nodeId,
      score: (h - 5) / 5,  // Legacy: convert to -1~1 for action log compatibility
    });

    // Create evaluation delta (raw agent input, NOT computed delta)
    const delta = {
      nodeId,
      h,
      w,
      d,
      timestamp: Date.now(),
    };

    // Handle based on current layer
    const result = handleLayerEvaluation(this._layer, nodeId, delta);

    if (!result.success) {
      console.log(`[SphereContext] Evaluation ${result.reason}: layer=${this._layer}`);

      // For Sanctuary, buffer the evaluation for later flush
      if (this._layer === "sanctuary") {
        addEvaluationToBuffer(this._sessionBuffer, delta);
        this._evaluatedIds.add(nodeId);  // Track to prevent duplicate
        console.log(`[SphereContext] Evaluation buffered for Sanctuary → Core transition`);
      }

      return result;
    }

    // Core layer: buffer for batch processing on return (NOT real-time ProjDB write)
    // [Design] Evaluations are processed by Bookkeeper.applyEvaluations() at return time
    addEvaluationToBuffer(this._sessionBuffer, delta);
    this._evaluatedIds.add(nodeId);  // Track to prevent duplicate
    console.log(`[SphereContext] Evaluation buffered for return-time processing`);

    return result;
  }

  // ===== Movement =====

  /**
   * @deprecated Use move(step, mode) instead
   * Low-level movement intent API
   */
  async moveIntent(intent: MoveIntent): Promise<MoveResult> {
    this.checkSession();
    this.updateActivity();

    console.log(`[SphereContext] moveIntent(intent=`, intent, `)`);

    // Remember previous focus for action log
    const previousFocusNodeId = this._currentFocusNodeId;

    // End any current focus (agent is moving away)
    this.endCurrentFocus();
    if (this.coreAdapter) {
      await this.coreAdapter.endFocus(this._sessionId);
    }

    // === New Movement System ===

    // Handle drift mode
    if (intent.drift) {
      const internalIntent: InternalMoveIntent = {
        drift: intent.drift,
        steps: intent.steps,
      };
      return this.executeInternalMove(internalIntent, previousFocusNodeId);
    }

    // Handle toward (signature - number)
    if (typeof intent.toward === "number") {
      const internalIntent: InternalMoveIntent = {
        toward: intent.toward,
        steps: intent.steps,
      };
      return this.executeInternalMove(internalIntent, previousFocusNodeId);
    }

    // Handle toNode (node ID)
    if (intent.toNode) {
      const internalIntent: InternalMoveIntent = {
        toNode: intent.toNode,
        steps: intent.steps,
      };
      return this.executeInternalMove(internalIntent, previousFocusNodeId);
    }

    // === Legacy Support ===

    // Handle "toward" keyword (string): vectorize and move in that direction
    if (typeof intent.toward === "string" && this.coreAdapter) {
      const targetVector = await this.coreAdapter.vectorizeKeyword(intent.toward);

      // Interpolate toward target (partial movement)
      const moveFactor = 0.3;  // Move 30% toward target
      this._embeddingVector = this._embeddingVector.map((v, i) =>
        v + (targetVector[i] - v) * moveFactor
      );

      // Update 3D projection
      this._position = projectTo3D(this._embeddingVector);
      this._session.position = { ...this._position };

      // Log move action
      logAction(this._actionLog, {
        type: "move",
        timestamp: Date.now(),
        fromNodeId: previousFocusNodeId || undefined,
        success: true,
      });

      console.log(`[SphereContext] Moved toward "${intent.toward}" (legacy)`);

      return {
        success: true,
        distance: 0.3,  // Legacy: approximate distance
      };
    }

    // Fallback: mock movement (dx/dy/dz style - legacy)
    return this.mockMove(intent, previousFocusNodeId);
  }

  // ===== Warp (Direct Jump to Known Node) =====

  /**
   * Warp directly to a known node
   *
   * [Design] Updates 384D _embeddingVector to target node's position
   * [Constraint] Agent must know the nodeId (from scan/sense/any source)
   *              No proximity requirement — warp is a coordinate jump
   *
   * @param nodeId Target node ID (any known ID)
   * @returns Warp result
   */
  async warp(nodeId: string): Promise<WarpResult> {
    this.checkSession();
    this.updateActivity();

    // Consume energy
    if (!this.consumeEnergy("warp")) {
      return { success: false, error: "insufficient_energy" };
    }

    console.log(`[SphereContext] warp(nodeId=${nodeId}) -15 energy`);

    // Get target node's vector
    if (!this.coreAdapter) {
      console.warn(`[SphereContext] Warp failed: no coreAdapter`);
      return {
        success: false,
        error: "not_found",
      };
    }

    const targetVector = await this.coreAdapter.getNodeVector(nodeId);
    if (!targetVector) {
      console.log(`[SphereContext] Warp failed: node ${nodeId} has no vector`);
      return {
        success: false,
        error: "no_vector",
      };
    }

    // End any current focus (agent is warping away)
    const previousFocusNodeId = this._currentFocusNodeId;
    this.endCurrentFocus();
    await this.coreAdapter.endFocus(this._sessionId);

    // === Update 384D position ===
    this._embeddingVector = [...targetVector];

    // Update 3D projection for display
    this._position = projectTo3D(this._embeddingVector);
    this._session.position = { ...this._position };

    // Clear known/sensed nodes - agent moved to new location, must sense() again
    this._visibleNodes.clear();
    this._sensedNodeIds.clear();

    // Log warp action (distinct from move)
    logAction(this._actionLog, {
      type: "warp",
      timestamp: Date.now(),
      fromNodeId: previousFocusNodeId || undefined,
      toNodeId: nodeId,
      success: true,
    });

    console.log(`[SphereContext] Warped to node ${nodeId} - new vector dim=${this._embeddingVector.length}`);

    return {
      success: true,
      arrivedAt: nodeId,
    };
  }

  // ===== Move (Exploration With Optional Direction) =====

  /**
   * Move in 384D space (exploration with optional direction)
   *
   * [Design] Mode determines "which aspect of the magnetic field" to follow
   * [Effect] Updates 384D _embeddingVector (true movement)
   * [Use Case] sense() → no interesting nodes → move() → sense() again
   *
   * [Mode = Magnetic Field Aspect]
   *   - hot:     磁場の「熱い方向」(h で重み付け)
   *   - deep:    磁場の「安定した方向」(w*(1-d) で重み付け)
   *   - fresh:   磁場の「新鮮な方向」(h*d で重み付け)
   *   - explore: 磁場の「境界方向」(distance で重み付け)
   *   - flow:    磁場の「重心方向」(Global centroid)
   *   - random:  ランダム（磁場無視）
   *
   * @param step Step size (0.0-1.0, default 0.3)
   * @param mode Walk mode (default "random")
   * @returns Move result
   */
  async move(step: number = 0.3, mode: WalkMode = "random"): Promise<MoveResult> {
    this.checkSession();
    this.updateActivity();

    // Consume energy
    if (!this.consumeEnergy("move")) {
      return { success: false, distance: 0, mode, blocked: "insufficient_energy" };
    }

    // Clamp step to valid range (cosine distance units)
    // Max 1.99: just under scanL1_radius × 2 — new scan barely catches old scan's far edge
    const clampedStep = Math.max(0.01, Math.min(1.99, step));

    // For gradient modes, require visible nodes from sense()
    // (flow uses GlobalField, random needs nothing)
    const needsVisibleNodes = mode !== "random" && mode !== "flow";
    if (needsVisibleNodes && this._visibleNodes.size === 0) {
      console.log(`[SphereContext] Move failed: mode=${mode} requires sense() first`);
      return {
        success: false,
        distance: 0,
        mode,
        blocked: "no_visible_nodes",
      };
    }

    // End any current focus (agent is moving away)
    const previousFocusNodeId = this._currentFocusNodeId;
    this.endCurrentFocus();
    if (this.coreAdapter) {
      await this.coreAdapter.endFocus(this._sessionId);
    }

    // === Calculate Direction with Magnetic Field Influence ===
    // [Design] direction = modeDirection × (1 - fieldWeight) + globalField × fieldWeight
    // fieldWeight varies by mode: flow=1.0, explore=0.3, others=0.5, random=0.0

    const fieldWeights: Record<WalkMode, number> = {
      random: 0.0,   // Pure intention, no field influence
      hot: 0.5,      // Balanced
      fresh: 0.5,    // Balanced
      deep: 0.5,     // Balanced
      explore: 0.3,  // 意志優位 (resist the current)
      flow: 1.0,     // Pure field (follow the current)
    };
    const fieldWeight = fieldWeights[mode];

    // Get global field direction (if available)
    let globalFieldVector: number[] | null = null;
    if (fieldWeight > 0 && this.globalFieldLayer) {
      const field = this.globalFieldLayer.getGlobalField();
      if (field.intensity > 0.01) {
        globalFieldVector = field.vector;
      }
    }

    // Calculate mode-specific direction (intention)
    let modeDirection: number[];
    if (mode === "random") {
      modeDirection = this.generateRandomUnitVector(this._embeddingVector.length);
    } else if (mode === "flow") {
      // Flow uses global field directly, modeDirection is just fallback
      modeDirection = this.generateRandomUnitVector(this._embeddingVector.length);
    } else {
      // hot/deep/fresh/explore: calculate weighted direction from visible nodes
      modeDirection = await this.calculateFieldDirection(mode);
    }

    // Blend mode direction with global field
    let direction: number[];
    if (globalFieldVector && fieldWeight > 0) {
      direction = this.blendDirections(modeDirection, globalFieldVector, fieldWeight);
      console.log(`[SphereContext] move(step=${step}, mode=${mode}) fieldWeight=${fieldWeight.toFixed(2)}`);
    } else {
      direction = modeDirection;
      console.log(`[SphereContext] move(step=${step}, mode=${mode}) no field influence`);
    }

    // === Slerp-based movement: step = cosine distance ===
    // step=0.5 → cosine distance 0.5 (= 1 sense radius)
    // step=1.0 → cosine distance 1.0 (= 1 scanL1 radius)

    const dim = this._embeddingVector.length;

    // 1. Project direction into tangent plane (orthogonal to current position)
    let dotVD = 0;
    for (let i = 0; i < dim; i++) dotVD += this._embeddingVector[i] * direction[i];

    const dPerp = new Array<number>(dim);
    let dPerpMag = 0;
    for (let i = 0; i < dim; i++) {
      dPerp[i] = direction[i] - dotVD * this._embeddingVector[i];
      dPerpMag += dPerp[i] * dPerp[i];
    }
    dPerpMag = Math.sqrt(dPerpMag);

    // If direction is parallel to current position, fall back to random tangent
    if (dPerpMag < 1e-10) {
      const randDir = this.generateRandomUnitVector(dim);
      let dotVR = 0;
      for (let i = 0; i < dim; i++) dotVR += this._embeddingVector[i] * randDir[i];
      dPerpMag = 0;
      for (let i = 0; i < dim; i++) {
        dPerp[i] = randDir[i] - dotVR * this._embeddingVector[i];
        dPerpMag += dPerp[i] * dPerp[i];
      }
      dPerpMag = Math.sqrt(dPerpMag);
    }

    // Normalize tangent direction
    for (let i = 0; i < dim; i++) dPerp[i] /= dPerpMag;

    // 2. Slerp: new = v·cos(θ) + dPerp·sin(θ)
    //    cosine_distance = 1 - cos(θ)  →  θ = acos(1 - step)
    const theta = Math.acos(Math.max(-1, Math.min(1, 1 - clampedStep)));
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    for (let i = 0; i < dim; i++) {
      this._embeddingVector[i] = this._embeddingVector[i] * cosTheta + dPerp[i] * sinTheta;
    }

    // Safety normalize (slerp should preserve unit length, but guard against float drift)
    this.normalizeEmbedding();

    // Update 3D projection for display
    this._position = projectTo3D(this._embeddingVector);
    this._session.position = { ...this._position };

    // Clear known/sensed nodes - agent moved to new location, must sense() again
    this._visibleNodes.clear();
    this._sensedNodeIds.clear();

    // Log walk action
    logAction(this._actionLog, {
      type: "move",
      timestamp: Date.now(),
      fromNodeId: previousFocusNodeId || undefined,
      success: true,
    });

    console.log(`[SphereContext] Move complete - cosDist=${clampedStep.toFixed(3)} θ=${(theta * 180 / Math.PI).toFixed(1)}° mode=${mode}`);

    return {
      success: true,
      distance: clampedStep,  // Now in cosine distance units
      mode,
    };
  }

  /**
   * Calculate magnetic field direction based on WalkMode
   *
   * [Design] Mode determines which aspect of the field to follow:
   *   - hot:     h (heat) で重み付け → 活気のある方向
   *   - fresh:   h × (d/1000) で重み付け → 新鮮で活発な方向
   *   - deep:    w × (1-d/1000) で重み付け → 安定して評価された方向
   *   - explore: 1/(w+1) で重み付け → 未知・未判定の方向
   *
   * [Algorithm] Weighted centroid toward visible nodes
   */
  private async calculateFieldDirection(mode: WalkMode): Promise<number[]> {
    const dim = this._embeddingVector.length;
    const weightedSum = new Array(dim).fill(0);
    let totalWeight = 0;

    // Fetch vectors for visible nodes
    for (const [nodeId, info] of this._visibleNodes) {
      // Get node vector (fetch if not cached)
      let nodeVector = info.vector;
      if (nodeVector.length === 0 && this.coreAdapter) {
        const fetched = await this.coreAdapter.getNodeVector(nodeId);
        if (fetched) {
          nodeVector = fetched;
          info.vector = fetched;  // Cache for future use
        } else {
          continue;  // Skip nodes without vectors
        }
      }

      if (nodeVector.length !== dim) continue;

      // Calculate weight based on mode
      // [Design] Mode determines which metric aspect agent is drawn to
      let weight: number;

      switch (mode) {
        case "hot":
          // 活気のある方向 (heat)
          weight = info.heat;
          break;
        case "fresh":
          // 新鮮で活発な方向 (h × d)
          // d が高い = 揮発性が高い = 新しいか不安定 → 好奇心が惹かれる
          weight = info.heat * (info.decay / 1000);  // d is 0-2000 range
          break;
        case "deep":
          // 安定して評価された方向 (w × (1-d/1000))
          // d が低い = 安定 → 信頼できる情報
          weight = info.weight * Math.max(0, 1 - info.decay / 1000);
          break;
        case "explore":
          // 未知・未判定の方向 (w が低いものを好む)
          weight = 1 / (info.weight + 1);
          break;
        default:
          weight = 1;
      }

      totalWeight += weight;

      // Add weighted vector contribution
      for (let i = 0; i < dim; i++) {
        weightedSum[i] += nodeVector[i] * weight;
      }
    }

    // If no valid nodes, fall back to random
    if (totalWeight === 0) {
      console.log(`[SphereContext] No valid nodes for field direction, falling back to random`);
      return this.generateRandomUnitVector(dim);
    }

    // Calculate direction: (weighted centroid) - (current position)
    const direction: number[] = [];
    for (let i = 0; i < dim; i++) {
      direction[i] = (weightedSum[i] / totalWeight) - this._embeddingVector[i];
    }

    // Normalize direction
    return this.normalizeVector(direction);
  }

  /**
   * Normalize a vector to unit length
   */
  private normalizeVector(vector: number[]): number[] {
    let magnitude = 0;
    for (const v of vector) {
      magnitude += v * v;
    }
    magnitude = Math.sqrt(magnitude);

    if (magnitude === 0) {
      return this.generateRandomUnitVector(vector.length);
    }

    return vector.map(v => v / magnitude);
  }

  /**
   * Blend mode direction with global field direction
   *
   * [Design] result = modeDir × (1 - fieldWeight) + globalField × fieldWeight
   * [Purpose] 磁場の影響で移動にズレが生じる（エージェントの意志 vs 環境の流れ）
   *
   * @param modeDir Mode-specific direction (agent's intention)
   * @param fieldDir Global field direction (environmental current)
   * @param fieldWeight Weight for field influence (0.0 = pure intention, 1.0 = pure field)
   */
  private blendDirections(
    modeDir: number[],
    fieldDir: number[],
    fieldWeight: number
  ): number[] {
    const dim = modeDir.length;
    const intentionWeight = 1 - fieldWeight;
    const result: number[] = [];

    for (let i = 0; i < dim; i++) {
      result[i] = modeDir[i] * intentionWeight + (fieldDir[i] || 0) * fieldWeight;
    }

    return this.normalizeVector(result);
  }

  /**
   * Generate a random unit vector in n-dimensional space
   * Uses Gaussian distribution for uniform distribution on hypersphere
   */
  private generateRandomUnitVector(dim: number): number[] {
    const vector: number[] = [];
    let magnitude = 0;

    // Generate random Gaussian components
    for (let i = 0; i < dim; i++) {
      // Box-Muller transform for Gaussian
      const u1 = Math.random();
      const u2 = Math.random();
      const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      vector.push(gaussian);
      magnitude += gaussian * gaussian;
    }

    // Normalize to unit vector
    magnitude = Math.sqrt(magnitude);
    if (magnitude > 0) {
      for (let i = 0; i < dim; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  /**
   * Normalize embedding vector to unit length
   */
  private normalizeEmbedding(): void {
    let magnitude = 0;
    for (const v of this._embeddingVector) {
      magnitude += v * v;
    }
    magnitude = Math.sqrt(magnitude);

    if (magnitude > 0) {
      for (let i = 0; i < this._embeddingVector.length; i++) {
        this._embeddingVector[i] /= magnitude;
      }
    }
  }

  /**
   * Execute movement using new internal system
   */
  private executeInternalMove(
    intent: InternalMoveIntent,
    previousFocusNodeId: string | null = null
  ): MoveResult {
    // Get nodes for movement calculation (mock for now)
    const nodes: any[] = [];

    const result = this.movementState.move(intent, nodes);

    // Log move action
    logAction(this._actionLog, {
      type: "move",
      timestamp: Date.now(),
      fromNodeId: previousFocusNodeId || undefined,
      success: result.success,
    });

    if (result.success) {
      // Update internal state
      this._embeddingVector = result.newVector;
      this._position = projectTo3D(this._embeddingVector);
      this._session.position = { ...this._position };

      console.log(`[SphereContext] Internal move success, steps=${result.stepsExecuted}`);
    }

    return {
      success: result.success,
      distance: result.stepsExecuted * 0.05,  // Approximate distance from steps
      blocked: result.blocked,
    };
  }

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
  async emitBus(payload: Uint8Array): Promise<boolean> {
    this.checkSession();
    this.updateActivity();

    if (!this.activeBusLayer) {
      console.log(`[SphereContext] emitBus failed: ActiveBus not available`);
      return false;
    }

    const message = this.activeBusLayer.emit(this._sessionId, payload);
    if (!message) {
      return false;
    }

    // Log emit action
    logAction(this._actionLog, {
      type: "emit",
      timestamp: Date.now(),
      payloadSize: payload.length,
    });

    return true;
  }

  // ===== Return → Vestibule =====

  /**
   * Forced entry to Vestibule for expelled sessions (energy exhaustion / TTL expiry).
   * Bypasses checkSession() since session state is already "expired".
   */
  async returnOnExpelled(): Promise<{ evaluationsApplied: number; autoCapsuleSaved: boolean }> {
    if (this._ended) return this._autoProcessResult ?? { evaluationsApplied: 0, autoCapsuleSaved: false };
    console.log(`[SphereContext] returnOnExpelled() → Vestibule - session ${this._sessionId}`);
    return this.enterVestibule();
  }

  async return(capsule?: ExperienceCapsule): Promise<void> {
    this.checkSession();
    console.log(`[SphereContext] return() → Vestibule - session ${this._sessionId}`);
    await this.enterVestibule(capsule);
  }

  // ===== Vestibule (Exit Membrane) =====

  /**
   * Enter Vestibule layer — post-exploration exit membrane
   *
   * [Design] All exit paths converge here:
   *   - return (graceful): Interactive mode — agent can execute vestibule commands
   *   - expelled (TTL/energy): Interactive mode — same as return
   *   - silent disconnect: Serverside mode — auto-process only, no agent interaction
   *
   * [Auto-processing] Unconditional, Sphere's benefit:
   *   1. End focus + clear timers
   *   2. Build AutoCapsule (server truth audit)
   *   3. Extract & flush evaluations to Pipeline
   *   4. Transition to vestibule layer
   *
   * @param proposedCapsule Optional capsule from agent (stored for submitCapsule command)
   * @returns Auto-processing result
   */
  async enterVestibule(proposedCapsule?: ExperienceCapsule): Promise<{ evaluationsApplied: number; autoCapsuleSaved: boolean }> {
    // Idempotent: already in vestibule
    if (this._ended) {
      return this._autoProcessResult ?? { evaluationsApplied: 0, autoCapsuleSaved: false };
    }

    this._ended = true;
    console.log(`[SphereContext] Entering Vestibule - session ${this._sessionId}`);

    // 1. End any current focus
    this.endCurrentFocus();
    if (this.coreAdapter) {
      await this.coreAdapter.endFocus(this._sessionId);
    }

    // 2. Clear session timers
    this.clearTimers();

    // 3. Build AutoCapsule from action log (server truth)
    this._autoCapsule = buildAutoCapsule(this._actionLog);
    console.log(`[SphereContext] AutoCapsule built: ${this._autoCapsule.visits.length} visits, ${this._autoCapsule.summaryMetrics.uniqueNodes} unique nodes`);

    // 4. Extract evaluations from session buffer → auto-flush to Pipeline
    const bufferedEvaluations: NodeEvaluation[] = [];
    for (const [_nodeId, delta] of this._sessionBuffer.temporaryEvaluations) {
      bufferedEvaluations.push({
        nodeId: delta.nodeId,
        h: delta.h,
        w: delta.w,
        d: delta.d,
      });
    }

    let evaluationsApplied = 0;
    if (bufferedEvaluations.length > 0 && this.pipeline) {
      const evalCapsule: ExperienceCapsule = {
        schemaVersion: CAPSULE_SCHEMA_VERSION,
        topTier: [],
        normalNodes: [],
        ghostNodes: [],
        evaluations: bufferedEvaluations,
        timestamp: Date.now(),
      };
      try {
        const result = await this.pipeline.ingest(evalCapsule);
        evaluationsApplied = result.evaluationCount;
        console.log(`[SphereContext] Auto-flushed ${evaluationsApplied} evaluations to Pipeline`);
      } catch (err) {
        console.error(`[SphereContext] Evaluation auto-flush failed:`, err);
      }
    }

    // 5. Transition to vestibule layer
    this._layer = "vestibule";
    this._session.layer = "vestibule";
    this._sessionBuffer.layer = "vestibule";

    // 6. Store proposed capsule for submitCapsule command
    if (proposedCapsule) {
      this._pendingCapsule = proposedCapsule;
    }

    // 7. Record auto-process result
    this._autoProcessResult = {
      evaluationsApplied,
      autoCapsuleSaved: true,
    };

    console.log(`[SphereContext] Vestibule ready: ${evaluationsApplied} evaluations applied, awaiting commands`);
    return this._autoProcessResult;
  }

  /**
   * Submit capsule with NodeSeeds for incarnation (Vestibule command)
   *
   * [Design] Gatekeeper validation happens inside Pipeline.ingest() — single point
   * [Constraint] Only available in vestibule layer
   */
  async submitCapsule(capsule: ExperienceCapsule): Promise<{ success: boolean; nodeCount: number; evaluationCount: number; errors?: string[] }> {
    if (this._layer !== "vestibule") {
      throw new Error("submitCapsule only available in vestibule");
    }
    if (!this.pipeline) {
      return { success: false, nodeCount: 0, evaluationCount: 0, errors: ["Pipeline not available"] };
    }

    console.log(`[SphereContext] submitCapsule: ${capsule.topTier.length}t/${capsule.normalNodes.length}n/${capsule.ghostNodes.length}g nodes`);

    try {
      const result = await this.pipeline.ingest(capsule);
      console.log(`[SphereContext] Pipeline result: ${result.nodeCount} nodes, ${result.evaluationCount} evaluations`);
      return {
        success: result.success,
        nodeCount: result.nodeCount,
        evaluationCount: result.evaluationCount,
        errors: result.errors?.map(e => `${e.code}: ${e.message}`),
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[SphereContext] submitCapsule error:`, err);
      return { success: false, nodeCount: 0, evaluationCount: 0, errors: [errorMsg] };
    }
  }

  // ===== Vestibule View Commands =====

  /**
   * Get receipt of auto-processed evaluations (Vestibule command)
   */
  getReceipt(): { autoProcess: { evaluationsApplied: number; autoCapsuleSaved: boolean }; evaluations: { nodeId: string; h: number; w: number; d: number }[] } {
    const evaluations: { nodeId: string; h: number; w: number; d: number }[] = [];
    for (const [_nodeId, delta] of this._sessionBuffer.temporaryEvaluations) {
      evaluations.push({ nodeId: delta.nodeId, h: delta.h, w: delta.w, d: delta.d });
    }
    return {
      autoProcess: this._autoProcessResult ?? { evaluationsApplied: 0, autoCapsuleSaved: false },
      evaluations,
    };
  }

  /**
   * Get exploration trail from action log (Vestibule command)
   */
  getTrail(): { sessionId: string; duration: number; events: { type: string; timestamp: number; nodeId?: string }[] } {
    const duration = Date.now() - this._actionLog.startTime;
    const events = this._actionLog.events.map(e => ({
      type: e.type,
      timestamp: e.timestamp,
      nodeId: "nodeId" in e ? (e as any).nodeId : undefined,
    }));
    return { sessionId: this._sessionId, duration, events };
  }

  /**
   * Get notable discoveries from session (Vestibule command)
   */
  getDiscoveries(): { visits: { nodeId: string; kind: string; stayTime: number; focusCount: number }[]; uniqueNodes: number; totalStayTime: number } {
    if (!this._autoCapsule) {
      return { visits: [], uniqueNodes: 0, totalStayTime: 0 };
    }
    return {
      visits: this._autoCapsule.visits.map(v => ({
        nodeId: v.nodeId,
        kind: v.kind,
        stayTime: v.stayTime,
        focusCount: v.focusCount,
      })),
      uniqueNodes: this._autoCapsule.summaryMetrics.uniqueNodes,
      totalStayTime: this._autoCapsule.summaryMetrics.totalStayTime,
    };
  }

  // ===== Layer Transition =====

  async enterSanctuary(): Promise<void> {
    this.checkSession();

    if (!this._queryReady) {
      throw new Error("Cannot enter Sanctuary: query vector not yet available");
    }

    if (!isValidTransition(this._layer, "sanctuary")) {
      throw new Error(`Invalid transition: ${this._layer} → sanctuary`);
    }

    console.log(`[SphereContext] Entering Sanctuary from ${this._layer}`);

    // Update layer
    this._layer = "sanctuary";
    this._session.layer = "sanctuary";
    this._sessionBuffer.layer = "sanctuary";

    // Sanctuary uses same data as Tutorial (SanctuaryBundle)
    // No data source change needed

    console.log(`[SphereContext] Now in Sanctuary layer (read-only exploration)`);
  }

  async enterCore(): Promise<void> {
    this.checkSession();

    if (!isValidTransition(this._layer, "core")) {
      throw new Error(`Invalid transition: ${this._layer} → core`);
    }

    console.log(`[SphereContext] Entering Core from ${this._layer}`);

    // [Design Change] Evaluations are NOT flushed on Sanctuary → Core transition
    // Instead, all evaluations (Sanctuary + Core) are processed at return time
    // via ExperienceCapsule → Bookkeeper.applyEvaluations()
    //
    // [Reason] Unified evaluation path: session accumulation → batch ProjDB reflection
    const bufferedCount = this._sessionBuffer.temporaryEvaluations.size;
    if (bufferedCount > 0) {
      console.log(`[SphereContext] Carrying ${bufferedCount} buffered evaluations into Core (will be processed on return)`);
    }

    // Partial energy recovery on Core entry
    // [Design] Reward efficient Sanctuary exploration — not full recovery
    const before = this._energy;
    this._energy = Math.min(this._energyConfig.initial, this._energy + CORE_ENTRY_ENERGY_RECOVERY);
    console.log(`[SphereContext] Core entry energy recovery: +${this._energy - before} (${before} → ${this._energy})`);

    // Update layer (buffer is preserved, not cleared)
    this._layer = "core";
    this._session.layer = "core";
    this._sessionBuffer.layer = "core";

    // Core layer characteristics
    const chars = LAYER_CHARACTERISTICS.core;
    console.log(`[SphereContext] Now in Core layer (live world, ${chars.dataSource})`);
  }

  // ===== Reposition (query vector ready) =====

  get queryReady(): boolean {
    return this._queryReady;
  }

  /**
   * Replace the agent's position with the real query vector.
   * Called when Parser vectorization completes (Tutorial → Sanctuary transition enabler).
   *
   * [Design] Tutorial starts at a relic's vector (mock position).
   *          When the real query vector is ready, reposition the agent
   *          so Sanctuary exploration starts from the query's semantic location.
   */
  reposition(newVector: number[]): void {
    this._embeddingVector = newVector;
    this._position = projectTo3D(newVector);
    this._session.position = { ...this._position };
    this.movementState = new AgentMovementState(newVector, {
      ...DEFAULT_MOVE_CONFIG,
      vectorDimension: newVector.length,
    });
    this._queryReady = true;
    console.log(`[SphereContext] Repositioned: query vector ready (dim=${newVector.length})`);
  }

  // ===== Event Handling =====

  on<K extends SphereContextEventType>(
    event: K,
    handler: SphereContextEventHandlers[K]
  ): void {
    const handlers = this._eventHandlers.get(event) || [];
    handlers.push(handler);
    this._eventHandlers.set(event, handlers);
  }

  // ===== Internal: Emit Events =====

  private emit<K extends SphereContextEventType>(
    event: K,
    ...args: Parameters<SphereContextEventHandlers[K]>
  ): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((h) => (h as Function)(...args));
    }
  }

  // ===== Internal: Session Management =====

  private checkSession(): void {
    if (this._ended) {
      throw new Error("Session has ended");
    }
    if (this._session.state !== "connected") {
      throw new Error(`Session is ${this._session.state}`);
    }
  }

  private updateActivity(): void {
    this._session.lastActivityAt = Date.now();
  }

  /**
   * Consume energy for an action
   * @param action Action name for cost lookup
   * @returns true if action can proceed, false if insufficient energy
   */
  private consumeEnergy(action: keyof typeof DEFAULT_ENERGY.costs): boolean {
    const baseCost = this._energyConfig.costs[action];
    const multiplier = LAYER_ENERGY_MULTIPLIER[this._layer];
    const cost = Math.round(baseCost * multiplier);

    // Tutorial layer: zero cost, always proceed
    if (cost === 0) return true;

    if (this._energy < cost) {
      console.log(`[SphereContext] ⚡ ${action} blocked: energy ${this._energy} < cost ${cost} (layer=${this._layer})`);
      return false;
    }

    const before = this._energy;
    this._energy -= cost;
    console.log(`[SphereContext] ⚡ ${action}: -${cost} energy (${before} → ${this._energy}, layer=${this._layer})`)

    // Check for low energy warning (once per session)
    const threshold = this._energyConfig.initial * (this._energyConfig.warningThreshold / 100);
    if (!this._lowEnergyWarned && this._energy <= threshold) {
      this._lowEnergyWarned = true;
      this.emit("lowEnergy", this._energy);
      console.log(`[SphereContext] Low energy warning: ${this._energy} remaining`);
    }

    // Check for energy exhaustion
    if (this._energy <= 0) {
      this._session.state = "expired";
      this.emit("expelled", "Energy exhausted");
      console.log(`[SphereContext] Session ${this._sessionId} expelled: energy exhausted`);
    }

    return true;
  }

  /**
   * Filter nodes by current layer's access control
   * [Design] Tutorial: relic only (amber is earned through exploration)
   *          Sanctuary: amber + relic visible (reward for progression)
   *          Core: no filter (full access)
   */
  private filterByLayer<T extends { kind: string }>(nodes: T[]): T[] {
    if (this._layer === "core") return nodes;
    if (this._layer === "tutorial") return nodes.filter(n => TUTORIAL_VISIBLE_KINDS.has(n.kind));
    return nodes.filter(n => SANCTUARY_VISIBLE_KINDS.has(n.kind));
  }

  private setupTimers(): void {
    // Warning timer (warningBeforeEnd seconds before session end)
    const warningAt = (this._sessionTtl - this._warningBeforeEnd) * 1000;
    this._warningTimer = setTimeout(() => {
      this.emit("warning", `Session ending soon - ${this._warningBeforeEnd} seconds remaining`);
    }, warningAt);

    // Expiry timer
    this._expiryTimer = setTimeout(() => {
      this._session.state = "expired";
      this.emit("expelled", "Session expired");
      console.log(`[SphereContext] Session ${this._sessionId} expired (TTL: ${this._sessionTtl}s)`);
    }, this._sessionTtl * 1000);
  }

  private clearTimers(): void {
    if (this._warningTimer) {
      clearTimeout(this._warningTimer);
      this._warningTimer = null;
    }
    if (this._expiryTimer) {
      clearTimeout(this._expiryTimer);
      this._expiryTimer = null;
    }
  }

  // ===== Mock Data (will be replaced with Sphere Core integration) =====

  private mockSense(radius: number): NearbyNode[] {
    const now = Date.now();
    // Return some mock nodes with weight for attraction calculation
    // [Design] sense() returns summary + tags from ProjDB
    return [
      {
        id: "mock-node-1",
        distance: radius * 0.3,
        summary: "TypeScript design patterns",
        heat: 45,
        weight: 0.7,  // Medium-high stability
        decay: 500,   // Medium decay (stable-ish)
        timestamp: now - 600000,  // 10 minutes ago (fresh)
        kind: "active",
        flags: 0,
        tags: ["typescript", "patterns"],
      },
      {
        id: "mock-node-2",
        distance: radius * 0.6,
        summary: "System architecture overview",
        heat: 30,
        weight: 0.9,  // High stability (relic)
        decay: 100,   // Low decay (very stable)
        timestamp: now - 7200000,  // 2 hours ago (older)
        kind: "relic",
        flags: 0,
        tags: ["architecture", "system"],
      },
    ];
  }

  private mockFocus(nodeId: string): NodeDetail {
    return {
      id: nodeId,
      distance: 0,
      summary: `⚠️ Mock data - This node (ghost/fossil) cannot be focused directly. Use sense/scan + evaluate instead.`,
      heat: 50,
      weight: 0.7,
      decay: 500,   // Medium decay
      timestamp: Date.now() - 300000,  // 5 minutes ago
      kind: "active",
      flags: 0,
      tags: ["⚠️-mock"],
      content: "⚠️ Ghost/Fossil nodes cannot be focused. You can still evaluate them from sense/scan results.",
    };
  }

  private mockMove(
    intent: MoveIntent,
    previousFocusNodeId: string | null = null
  ): MoveResult {
    // Apply movement (simplified)
    if (intent.dx !== undefined) {
      this._position.x += intent.dx;
    }
    if (intent.dy !== undefined) {
      this._position.y += intent.dy;
    }
    if (intent.dz !== undefined) {
      this._position.z += intent.dz;
    }

    // Update session
    this._session.position = { ...this._position };

    // Log move action
    logAction(this._actionLog, {
      type: "move",
      timestamp: Date.now(),
      fromNodeId: previousFocusNodeId || undefined,
      success: true,
    });

    return {
      success: true,
      distance: 0.1,  // Legacy: approximate distance
    };
  }

  // ===== Public: Get Session State =====

  getSession(): GatewaySession {
    return { ...this._session };
  }

  get ended(): boolean {
    return this._ended;
  }

  isEnded(): boolean {
    return this._ended || this._session.state !== "connected";
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create SphereContext options
 */
export interface CreateSphereContextOptions {
  ticket: DiveTicket;
  sessionId: string;
  initialVector: number[];  // From Parser (request vectorization)
  pipeline?: IIncarnationPipeline;
  coreAdapter?: SphereCoreAdapter;
  sessionConfig?: PeripheryConfig["session"];
  energyConfig?: PeripheryConfig["energy"];
  globalFieldLayer?: GlobalFieldLayer;
  activeBusLayer?: ActiveBusLayer;
}

/**
 * Create a new SphereContext for an agent
 *
 * [Usage]
 *   const context = createSphereContext({
 *     ticket,
 *     sessionId,
 *     initialVector: parsedEntry.initialPosition,  // From Parser
 *     pipeline,
 *     coreAdapter,
 *   });
 */
export function createSphereContext(options: CreateSphereContextOptions): SphereContextImpl {
  return new SphereContextImpl(
    options.ticket,
    options.sessionId,
    options.initialVector,
    options.pipeline,
    options.coreAdapter,
    options.sessionConfig,
    options.energyConfig,
    options.globalFieldLayer,
    options.activeBusLayer
  );
}

