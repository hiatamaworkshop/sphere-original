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
import { CAPSULE_SCHEMA_VERSION } from "../types/capsule.js";
import { createActionLog, logAction, buildAutoCapsule } from "../types/auto-capsule.js";
import { createReturnHandler } from "./return-handler.js";
import { createSessionBuffer, addEvaluationToBuffer, handleLayerEvaluation, isValidTransition, LAYER_CHARACTERISTICS, } from "../types/experience-layer.js";
import { Gatekeeper } from "../gatekeeper/gatekeeper.js";
import { AgentMovementState } from "./move.js";
import { DEFAULT_MOVE_CONFIG } from "../types/movement.js";
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
        scan: 1, // scanL1() (perception); internal scan() has no cost
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
const LAYER_ENERGY_MULTIPLIER = {
    tutorial: 0, // No energy cost — practice / vectorization wait
    sanctuary: 0.5, // Half cost — static view, encourage browsing
    core: 1.0, // Full cost — live world
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
function projectTo3D(vector) {
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
// SphereContext Implementation
// ============================================================
export class SphereContextImpl {
    _position;
    _embeddingVector; // Full semantic position
    _sessionId;
    _startTime;
    _eventHandlers = new Map();
    _session;
    _warningTimer = null;
    _expiryTimer = null;
    _ended = false;
    // Session timing (from config)
    _sessionTtl;
    _warningBeforeEnd;
    // Energy management
    _energy;
    _energyConfig;
    _lowEnergyWarned = false;
    // 3-Layer Piping State
    _layer = "tutorial";
    _queryReady = false; // true after real query vector is set via reposition()
    _sessionBuffer;
    // Action Logging (for AutoCapsule generation)
    _actionLog;
    _currentFocusNodeId = null;
    _currentFocusStartTime = 0;
    // Dependencies
    gatekeeper = new Gatekeeper();
    returnHandler;
    pipeline;
    coreAdapter;
    globalFieldLayer;
    activeBusLayer;
    movementState;
    // Local field cache (computed after sense())
    _lastLocalField;
    // Known nodes: scan + sense results → evaluate/warp eligible
    // [WalkMode] Stores full node info for gradient calculation
    _visibleNodes = new Map();
    // Sensed nodes: sense() results only → focus eligible (proximity confirmed)
    _sensedNodeIds = new Set();
    // Evaluation tracking: prevents duplicate evaluations in same session
    // [Design] 1 node = 1 evaluation per session (no spam)
    _evaluatedIds = new Set();
    constructor(ticket, sessionId, initialVector, pipeline, coreAdapter, sessionConfig, energyConfig, globalFieldLayer, activeBusLayer) {
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
        // Initialize return handler
        this.returnHandler = createReturnHandler(this.gatekeeper, this.pipeline);
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
    get embeddingVector() {
        return [...this._embeddingVector];
    }
    // ===== Read-only Properties =====
    get position() {
        return { ...this._position };
    }
    get sessionId() {
        return this._sessionId;
    }
    get remainingTime() {
        const elapsed = (Date.now() - this._startTime) / 1000;
        return Math.max(0, this._sessionTtl - elapsed);
    }
    get energy() {
        return this._energy;
    }
    get layer() {
        return this._layer;
    }
    // ===== Perception =====
    async sense(radius) {
        this.checkSession();
        this.updateActivity();
        // Consume energy
        if (!this.consumeEnergy("sense")) {
            return []; // No energy, return empty
        }
        const r = radius ?? DEFAULT_SENSE_RADIUS;
        // Use adapter if available, otherwise fall back to mock
        let nodes;
        if (this.coreAdapter) {
            nodes = await this.coreAdapter.sense(this._embeddingVector, r);
        }
        else {
            nodes = this.mockSense(r);
        }
        // Layer access control: filter by node kind
        nodes = this.filterByLayer(nodes);
        // Track visible nodes: only these can be focused/warped
        // [Design] Prevents "teleporting" to unseen nodes
        // [WalkMode] Stores info for gradient calculation (vector fetched on demand)
        // [Phase 4] Calculate freshness from timestamp: 1 / (1 + age/3600000) (1hr half-life)
        const now = Date.now();
        this._visibleNodes.clear(); // Known nodes reset on new sense
        this._sensedNodeIds.clear(); // Proximity-confirmed nodes reset
        for (const node of nodes) {
            const age = now - (node.timestamp || now);
            const freshness = 1 / (1 + age / 3600000); // 1 hour half-life (legacy fallback)
            this._visibleNodes.set(node.id, {
                vector: [], // Fetched on demand during gradient calculation
                kind: node.kind,
                heat: node.heat,
                decay: node.decay, // d metric from node
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
            const preview = nodes.slice(0, 5).map(n => `  ${n.id.substring(0, 8)}... [${n.kind}] h=${n.heat.toFixed(1)} d=${n.distance.toFixed(3)} tags=[${n.tags?.join(',') || ''}]`);
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
    getField() {
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
    async scan() {
        this.checkSession();
        this.updateActivity();
        console.log(`[SphereContext] scan() at vector dim=${this._embeddingVector.length}`);
        // Get nodes from adapter or use mock
        let nodes = [];
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
    async scanL1(radius) {
        this.checkSession();
        this.updateActivity();
        if (!this.consumeEnergy("scan")) {
            return [];
        }
        const r = radius ?? 2.0; // Default wider than sense
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
                        vector: [], // Not available from L1 scan
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
    async focus(nodeId) {
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
        let detail;
        let nearbyGhosts;
        if (this.coreAdapter) {
            const focusResult = await this.coreAdapter.focus(this._sessionId, nodeId, this._embeddingVector);
            if (focusResult) {
                detail = focusResult.node;
                nearbyGhosts = focusResult.nearbyGhosts;
            }
            else {
                // If node not found or ghost/fossil (cannot focus directly), fall back to mock
                console.warn(`[SphereContext] Node ${nodeId} not focusable (not found or ghost/fossil), using mock`);
                detail = this.mockFocus(nodeId);
            }
        }
        else {
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
            sourceNodeId: detail.sourceNodeId, // L3: track derivation for depth awareness
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
    endCurrentFocus() {
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
    async evaluate(nodeId, h, w, d) {
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
            score: (h - 5) / 5, // Legacy: convert to -1~1 for action log compatibility
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
                this._evaluatedIds.add(nodeId); // Track to prevent duplicate
                console.log(`[SphereContext] Evaluation buffered for Sanctuary → Core transition`);
            }
            return result;
        }
        // Core layer: buffer for batch processing on return (NOT real-time ProjDB write)
        // [Design] Evaluations are processed by Bookkeeper.applyEvaluations() at return time
        addEvaluationToBuffer(this._sessionBuffer, delta);
        this._evaluatedIds.add(nodeId); // Track to prevent duplicate
        console.log(`[SphereContext] Evaluation buffered for return-time processing`);
        return result;
    }
    // ===== Movement =====
    /**
     * @deprecated Use move(step, mode) instead
     * Low-level movement intent API
     */
    async moveIntent(intent) {
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
            const internalIntent = {
                drift: intent.drift,
                steps: intent.steps,
            };
            return this.executeInternalMove(internalIntent, previousFocusNodeId);
        }
        // Handle toward (signature - number)
        if (typeof intent.toward === "number") {
            const internalIntent = {
                toward: intent.toward,
                steps: intent.steps,
            };
            return this.executeInternalMove(internalIntent, previousFocusNodeId);
        }
        // Handle toNode (node ID)
        if (intent.toNode) {
            const internalIntent = {
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
            const moveFactor = 0.3; // Move 30% toward target
            this._embeddingVector = this._embeddingVector.map((v, i) => v + (targetVector[i] - v) * moveFactor);
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
                distance: 0.3, // Legacy: approximate distance
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
    async warp(nodeId) {
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
    async move(step = 0.3, mode = "random") {
        this.checkSession();
        this.updateActivity();
        // Consume energy
        if (!this.consumeEnergy("move")) {
            return { success: false, distance: 0, mode, blocked: "insufficient_energy" };
        }
        // Clamp step to valid range
        const clampedStep = Math.max(0.01, Math.min(1.0, step));
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
        const fieldWeights = {
            random: 0.0, // Pure intention, no field influence
            hot: 0.5, // Balanced
            fresh: 0.5, // Balanced
            deep: 0.5, // Balanced
            explore: 0.3, // 意志優位 (resist the current)
            flow: 1.0, // Pure field (follow the current)
        };
        const fieldWeight = fieldWeights[mode];
        // Get global field direction (if available)
        let globalFieldVector = null;
        if (fieldWeight > 0 && this.globalFieldLayer) {
            const field = this.globalFieldLayer.getGlobalField();
            if (field.intensity > 0.01) {
                globalFieldVector = field.vector;
            }
        }
        // Calculate mode-specific direction (intention)
        let modeDirection;
        if (mode === "random") {
            modeDirection = this.generateRandomUnitVector(this._embeddingVector.length);
        }
        else if (mode === "flow") {
            // Flow uses global field directly, modeDirection is just fallback
            modeDirection = this.generateRandomUnitVector(this._embeddingVector.length);
        }
        else {
            // hot/deep/fresh/explore: calculate weighted direction from visible nodes
            modeDirection = await this.calculateFieldDirection(mode);
        }
        // Blend mode direction with global field
        let direction;
        if (globalFieldVector && fieldWeight > 0) {
            direction = this.blendDirections(modeDirection, globalFieldVector, fieldWeight);
            console.log(`[SphereContext] move(step=${step}, mode=${mode}) fieldWeight=${fieldWeight.toFixed(2)}`);
        }
        else {
            direction = modeDirection;
            console.log(`[SphereContext] move(step=${step}, mode=${mode}) no field influence`);
        }
        // Update 384D position: newPos = currentPos + direction * stepSize
        for (let i = 0; i < this._embeddingVector.length; i++) {
            this._embeddingVector[i] += direction[i] * clampedStep;
        }
        // Normalize to keep on unit hypersphere (optional, but keeps vectors comparable)
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
        console.log(`[SphereContext] Move complete - moved ${clampedStep.toFixed(3)} in ${mode} direction`);
        return {
            success: true,
            distance: clampedStep,
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
    async calculateFieldDirection(mode) {
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
                    info.vector = fetched; // Cache for future use
                }
                else {
                    continue; // Skip nodes without vectors
                }
            }
            if (nodeVector.length !== dim)
                continue;
            // Calculate weight based on mode
            // [Design] Mode determines which metric aspect agent is drawn to
            let weight;
            switch (mode) {
                case "hot":
                    // 活気のある方向 (heat)
                    weight = info.heat;
                    break;
                case "fresh":
                    // 新鮮で活発な方向 (h × d)
                    // d が高い = 揮発性が高い = 新しいか不安定 → 好奇心が惹かれる
                    weight = info.heat * (info.decay / 1000); // d is 0-2000 range
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
        const direction = [];
        for (let i = 0; i < dim; i++) {
            direction[i] = (weightedSum[i] / totalWeight) - this._embeddingVector[i];
        }
        // Normalize direction
        return this.normalizeVector(direction);
    }
    /**
     * Normalize a vector to unit length
     */
    normalizeVector(vector) {
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
    blendDirections(modeDir, fieldDir, fieldWeight) {
        const dim = modeDir.length;
        const intentionWeight = 1 - fieldWeight;
        const result = [];
        for (let i = 0; i < dim; i++) {
            result[i] = modeDir[i] * intentionWeight + (fieldDir[i] || 0) * fieldWeight;
        }
        return this.normalizeVector(result);
    }
    /**
     * Generate a random unit vector in n-dimensional space
     * Uses Gaussian distribution for uniform distribution on hypersphere
     */
    generateRandomUnitVector(dim) {
        const vector = [];
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
    normalizeEmbedding() {
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
    executeInternalMove(intent, previousFocusNodeId = null) {
        // Get nodes for movement calculation (mock for now)
        const nodes = [];
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
            distance: result.stepsExecuted * 0.05, // Approximate distance from steps
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
    async emitBus(payload) {
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
    // ===== Return =====
    /**
     * Forced return for expelled sessions (energy exhaustion / TTL expiry).
     * Bypasses checkSession() since session state is already "expired".
     * Ensures AutoCapsule + buffered evaluations flow through the pipeline.
     */
    async returnOnExpelled() {
        if (this._ended)
            return; // already returned normally
        console.log(`[SphereContext] returnOnExpelled() - session ${this._sessionId}`);
        return this._processReturn();
    }
    async return(capsule) {
        this.checkSession();
        console.log(`[SphereContext] return() - session ${this._sessionId}`);
        return this._processReturn(capsule);
    }
    async _processReturn(capsule) {
        this._ended = true;
        // End any current focus (with action log)
        this.endCurrentFocus();
        if (this.coreAdapter) {
            await this.coreAdapter.endFocus(this._sessionId);
        }
        // Clear timers
        this.clearTimers();
        // Build AutoCapsule from action log (server truth)
        const autoCapsule = buildAutoCapsule(this._actionLog);
        console.log(`[SphereContext] AutoCapsule built: ${autoCapsule.visits.length} visits, ${autoCapsule.summaryMetrics.uniqueNodes} unique nodes`);
        // Extract evaluations from session buffer
        // [Design] Session buffer holds h, w, d (0-10) values from evaluate() calls
        // These are converted to NodeEvaluation format for capsule submission
        const bufferedEvaluations = [];
        for (const [_nodeId, delta] of this._sessionBuffer.temporaryEvaluations) {
            bufferedEvaluations.push({
                nodeId: delta.nodeId,
                h: delta.h,
                w: delta.w,
                d: delta.d,
            });
        }
        if (bufferedEvaluations.length > 0) {
            console.log(`[SphereContext] Adding ${bufferedEvaluations.length} buffered evaluations to capsule`);
        }
        // Merge buffered evaluations into capsule
        let finalCapsule = capsule;
        if (bufferedEvaluations.length > 0) {
            if (capsule) {
                // Merge with existing capsule
                finalCapsule = {
                    ...capsule,
                    evaluations: [...(capsule.evaluations || []), ...bufferedEvaluations],
                };
            }
            else {
                // Create minimal capsule with evaluations only
                finalCapsule = {
                    schemaVersion: CAPSULE_SCHEMA_VERSION,
                    topTier: [],
                    normalNodes: [],
                    ghostNodes: [],
                    evaluations: bufferedEvaluations,
                    timestamp: Date.now(),
                };
            }
        }
        // Process return through ReturnHandler
        const result = await this.returnHandler.processReturn(autoCapsule, finalCapsule);
        if (!result.success) {
            console.log(`[SphereContext] Return had issues:`, result.errors);
        }
        if (result.ingestionResult) {
            console.log(`[SphereContext] Pipeline result: ${result.ingestionResult.nodeCount} nodes, ${result.ingestionResult.evaluationCount} evaluations`);
        }
        // Update session state
        this._session.state = "disconnected";
        this._session.disconnectedAt = Date.now();
    }
    // ===== Layer Transition =====
    async enterSanctuary() {
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
    async enterCore() {
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
    get queryReady() {
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
    reposition(newVector) {
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
    on(event, handler) {
        const handlers = this._eventHandlers.get(event) || [];
        handlers.push(handler);
        this._eventHandlers.set(event, handlers);
    }
    // ===== Internal: Emit Events =====
    emit(event, ...args) {
        const handlers = this._eventHandlers.get(event);
        if (handlers) {
            handlers.forEach((h) => h(...args));
        }
    }
    // ===== Internal: Session Management =====
    checkSession() {
        if (this._ended) {
            throw new Error("Session has ended");
        }
        if (this._session.state !== "connected") {
            throw new Error(`Session is ${this._session.state}`);
        }
    }
    updateActivity() {
        this._session.lastActivityAt = Date.now();
    }
    /**
     * Consume energy for an action
     * @param action Action name for cost lookup
     * @returns true if action can proceed, false if insufficient energy
     */
    consumeEnergy(action) {
        const baseCost = this._energyConfig.costs[action];
        const multiplier = LAYER_ENERGY_MULTIPLIER[this._layer];
        const cost = Math.round(baseCost * multiplier);
        // Tutorial layer: zero cost, always proceed
        if (cost === 0)
            return true;
        if (this._energy < cost) {
            console.log(`[SphereContext] ⚡ ${action} blocked: energy ${this._energy} < cost ${cost} (layer=${this._layer})`);
            return false;
        }
        const before = this._energy;
        this._energy -= cost;
        console.log(`[SphereContext] ⚡ ${action}: -${cost} energy (${before} → ${this._energy}, layer=${this._layer})`);
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
    filterByLayer(nodes) {
        if (this._layer === "core")
            return nodes;
        if (this._layer === "tutorial")
            return nodes.filter(n => TUTORIAL_VISIBLE_KINDS.has(n.kind));
        return nodes.filter(n => SANCTUARY_VISIBLE_KINDS.has(n.kind));
    }
    setupTimers() {
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
    clearTimers() {
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
    mockSense(radius) {
        const now = Date.now();
        // Return some mock nodes with weight for attraction calculation
        // [Design] sense() returns summary + tags from ProjDB
        return [
            {
                id: "mock-node-1",
                distance: radius * 0.3,
                summary: "TypeScript design patterns",
                heat: 45,
                weight: 0.7, // Medium-high stability
                decay: 500, // Medium decay (stable-ish)
                timestamp: now - 600000, // 10 minutes ago (fresh)
                kind: "active",
                flags: 0,
                tags: ["typescript", "patterns"],
            },
            {
                id: "mock-node-2",
                distance: radius * 0.6,
                summary: "System architecture overview",
                heat: 30,
                weight: 0.9, // High stability (relic)
                decay: 100, // Low decay (very stable)
                timestamp: now - 7200000, // 2 hours ago (older)
                kind: "relic",
                flags: 0,
                tags: ["architecture", "system"],
            },
        ];
    }
    mockFocus(nodeId) {
        return {
            id: nodeId,
            distance: 0,
            summary: `⚠️ Mock data - This node (ghost/fossil) cannot be focused directly. Use sense/scan + evaluate instead.`,
            heat: 50,
            weight: 0.7,
            decay: 500, // Medium decay
            timestamp: Date.now() - 300000, // 5 minutes ago
            kind: "active",
            flags: 0,
            tags: ["⚠️-mock"],
            content: "⚠️ Ghost/Fossil nodes cannot be focused. You can still evaluate them from sense/scan results.",
        };
    }
    mockMove(intent, previousFocusNodeId = null) {
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
            distance: 0.1, // Legacy: approximate distance
        };
    }
    // ===== Public: Get Session State =====
    getSession() {
        return { ...this._session };
    }
    isEnded() {
        return this._ended || this._session.state !== "connected";
    }
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
export function createSphereContext(options) {
    return new SphereContextImpl(options.ticket, options.sessionId, options.initialVector, options.pipeline, options.coreAdapter, options.sessionConfig, options.energyConfig, options.globalFieldLayer, options.activeBusLayer);
}
//# sourceMappingURL=sphere-context.js.map