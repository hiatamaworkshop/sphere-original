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
import type { SphereContext, SphereContextEventType, SphereContextEventHandlers, Vector, NearbyNode, FocusResult, MoveIntent, MoveResult, WarpResult, RandomWalkResult, WalkMode, GatewaySession, DiveTicket, ScanResult, L1ScanResult } from "../types/gateway.js";
import type { ExperienceCapsule } from "../types/capsule.js";
import type { ExperienceLayer, EvaluationResult } from "../types/experience-layer.js";
import type { IIncarnationPipeline } from "../incarnation/pipeline.js";
import type { SphereCoreAdapter } from "./sphere-core-adapter.js";
import type { PeripheryConfig } from "../types/config.js";
import type { GlobalFieldLayer } from "../field/index.js";
import type { FieldInfo } from "../field/types.js";
import type { ActiveBusLayer } from "../bus/index.js";
export declare class SphereContextImpl implements SphereContext {
    private _position;
    private _embeddingVector;
    private _sessionId;
    private _startTime;
    private _eventHandlers;
    private _session;
    private _warningTimer;
    private _expiryTimer;
    private _ended;
    private _sessionTtl;
    private _warningBeforeEnd;
    private _energy;
    private _energyConfig;
    private _lowEnergyWarned;
    private _layer;
    private _sessionBuffer;
    private _actionLog;
    private _currentFocusNodeId;
    private _currentFocusStartTime;
    private gatekeeper;
    private returnHandler;
    private pipeline?;
    private coreAdapter?;
    private globalFieldLayer?;
    private activeBusLayer?;
    private movementState;
    private _lastLocalField?;
    private _visibleNodes;
    private _sensedNodeIds;
    private _evaluatedIds;
    constructor(ticket: DiveTicket, sessionId: string, initialVector: number[], pipeline?: IIncarnationPipeline, coreAdapter?: SphereCoreAdapter, sessionConfig?: PeripheryConfig["session"], energyConfig?: PeripheryConfig["energy"], globalFieldLayer?: GlobalFieldLayer, activeBusLayer?: ActiveBusLayer);
    get embeddingVector(): number[];
    get position(): Vector;
    get sessionId(): string;
    get remainingTime(): number;
    get energy(): number;
    get layer(): ExperienceLayer;
    sense(radius?: number): Promise<NearbyNode[]>;
    /**
     * Get current magnetic field information
     *
     * [Design] Returns global field always, local field if sense() was called
     * [Usage] Agent can query field to understand sphere "climate"
     *
     * @returns FieldInfo with global and optional local field
     */
    getField(): FieldInfo;
    scan(): Promise<ScanResult[]>;
    scanL1(radius?: number): Promise<L1ScanResult[]>;
    focus(nodeId: string): Promise<FocusResult>;
    /**
     * End current focus and log focusEnd action
     */
    private endCurrentFocus;
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
    evaluate(nodeId: string, h: number, w: number, d: number): Promise<EvaluationResult>;
    /**
     * @deprecated Use move(step, mode) instead
     * Low-level movement intent API
     */
    moveIntent(intent: MoveIntent): Promise<MoveResult>;
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
    warp(nodeId: string): Promise<WarpResult>;
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
    move(step?: number, mode?: WalkMode): Promise<MoveResult>;
    /**
     * @deprecated Use move(step, mode) instead
     */
    randomWalk(stepSize?: number, mode?: WalkMode): Promise<RandomWalkResult>;
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
    private calculateFieldDirection;
    /**
     * Normalize a vector to unit length
     */
    private normalizeVector;
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
    private blendDirections;
    /**
     * Generate a random unit vector in n-dimensional space
     * Uses Gaussian distribution for uniform distribution on hypersphere
     */
    private generateRandomUnitVector;
    /**
     * Normalize embedding vector to unit length
     */
    private normalizeEmbedding;
    /**
     * Execute movement using new internal system
     */
    private executeInternalMove;
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
    return(capsule?: ExperienceCapsule): Promise<void>;
    enterSanctuary(): Promise<void>;
    enterCore(): Promise<void>;
    on<K extends SphereContextEventType>(event: K, handler: SphereContextEventHandlers[K]): void;
    private emit;
    private checkSession;
    private updateActivity;
    /**
     * Consume energy for an action
     * @param action Action name for cost lookup
     * @returns true if action can proceed, false if insufficient energy
     */
    private consumeEnergy;
    private setupTimers;
    private clearTimers;
    private mockSense;
    private mockFocus;
    private mockMove;
    getSession(): GatewaySession;
    isEnded(): boolean;
}
/**
 * Create SphereContext options
 */
export interface CreateSphereContextOptions {
    ticket: DiveTicket;
    sessionId: string;
    initialVector: number[];
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
export declare function createSphereContext(options: CreateSphereContextOptions): SphereContextImpl;
/**
 * Create SphereContext with default zero vector (for testing/mock)
 */
export declare function createMockSphereContext(ticket: DiveTicket, sessionId: string, vectorDim?: number, pipeline?: IIncarnationPipeline): SphereContextImpl;
//# sourceMappingURL=sphere-context.d.ts.map