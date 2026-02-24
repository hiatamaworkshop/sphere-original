/**
 * Sphere Project - Gateway WebSocket Server
 *
 * [Role] Manage WebSocket connections for agent Dives
 * [Design] Token-based authentication, 3-phase connection flow
 *
 * [Connection Flow]
 *   1. Agent connects with token → "connected" (pending)
 *   2. Agent reads Rulebook, sends EntryRequest
 *   3. Membrane validates → SphereContext(relic vector) → "processing" (Tutorial active)
 *   4. Parser vectorizes (async) → reposition(queryVector) → "positioned"
 *   5. Agent transitions: enterSanctuary → enterCore
 *   6. Agent interacts via sense/focus/move/evaluate/return
 *   7. On return() or expiry → cleanup
 *
 * [2-Phase Design]
 *   - pending: Awaiting EntryRequest (only entry message allowed)
 *   - active: SphereContext exists, Tutorial layer (relic vector → query vector via reposition)
 */
import type { Server as HttpServer } from "http";
import { TicketIssuer } from "./ticket-issuer.js";
import type { EntryBuffer } from "../parser/buffer.js";
import type { IIncarnationPipeline } from "../incarnation/pipeline.js";
import type { QuestStore } from "./quest-store.js";
import type { SphereCoreAdapter } from "./sphere-core-adapter.js";
import type { UnifiedAmberCache } from "./amber-cache.js";
import type { GlobalFieldLayer } from "../field/index.js";
import type { ActiveBusLayer } from "../bus/index.js";
import type { PeripheryConfig } from "../types/config.js";
export interface GatewayServerConfig {
    port: number;
    /** URL for agents to fetch Rulebook */
    rulebookUrl?: string;
}
export declare const DEFAULT_GATEWAY_CONFIG: GatewayServerConfig;
export declare class GatewayServer {
    private ticketIssuer;
    private entryBuffer;
    private config;
    private pipeline?;
    private questStore?;
    private coreAdapter?;
    private amberCache?;
    private globalFieldLayer?;
    private activeBusLayer?;
    private sessionConfig?;
    private energyConfig?;
    private wss;
    private connections;
    private wsRateLimiters;
    private wsRateLimitConfig;
    private membrane;
    /** Callback for agent count changes (for Dormancy feature) */
    private onAgentCountChange?;
    constructor(ticketIssuer: TicketIssuer, entryBuffer: EntryBuffer, config?: GatewayServerConfig, pipeline?: IIncarnationPipeline | undefined, questStore?: QuestStore | undefined, coreAdapter?: SphereCoreAdapter | undefined, amberCache?: UnifiedAmberCache | undefined, globalFieldLayer?: GlobalFieldLayer | undefined, activeBusLayer?: ActiveBusLayer | undefined, sessionConfig?: PeripheryConfig["session"], energyConfig?: PeripheryConfig["energy"]);
    /**
     * Broadcast bus message to all connected agents (Push delivery)
     */
    private broadcastBusMessage;
    /**
     * Set callback for agent count changes
     * [Design] Used by RenalCore for Dormancy feature
     */
    setOnAgentCountChange(callback: (count: number) => void): void;
    getConnectionCount(): number;
    /**
     * Expel all connected agents (for Ephemeral reset).
     * Sends "expelled" before closing, unlike stop() which is for shutdown.
     */
    expelAll(reason: string): void;
    /**
     * Notify agent count change
     */
    private notifyAgentCountChange;
    /**
     * Start the WebSocket server
     */
    /**
     * Start WebSocket server.
     * @param serverOrPort - http.Server for same-port mode (production), number for standalone port (dev)
     */
    start(serverOrPort?: HttpServer | number): void;
    /**
     * Stop the WebSocket server
     */
    stop(): void;
    /**
     * Handle new WebSocket connection
     *
     * [Phase 1: Pending] Authentication only - await EntryRequest
     */
    private handleConnection;
    /**
     * Handle incoming message from agent
     */
    private handleMessage;
    /**
     * Handle messages in pending state
     * Only "entry" is allowed
     */
    private handlePendingMessage;
    /**
     * Start async vectorization via EntryBuffer
     * When complete, reposition agent and send "positioned"
     *
     * [Entry Pipeline] SphereContext already exists (relic vector).
     * This method runs async — agent can explore Tutorial while waiting.
     */
    private startVectorization;
    /**
     * Handle messages in active (diving) state
     * All operations allowed
     */
    private handleActiveMessage;
    /**
     * Send message to socket
     */
    private send;
    /**
     * Send error message
     */
    private sendError;
    /**
     * Get Quest Showcase (external questions awaiting verification)
     *
     * [Design] Quest ≠ ProjDB node
     *   - Quest = text object from external POST
     *   - Stored in Quest Store (NOT ProjDB)
     *   - Available BEFORE Parser (agents decide quest at welcome)
     *
     * [Flow]
     *   POST /quest → Quest Store → Quest Showcase (welcome)
     *   Agent selects quest → EntryRequest { quest } → ParserBuffer
     */
    private getQuestShowcase;
    /**
     * Send Amber Showcase to agent
     *
     * [Design] SHOWCASE_QUEST_DESIGN_MEMO v7
     *   - Showcase = L1/L2 only (id, summary, heat, tags, kind)
     *   - Parser wait masking: Agent browses while vector is calculated
     *   - focus() required for L3/L4 (payload, ref_url, links)
     *
     * [Philosophy] 道は歩いて初めてできる
     *   - Showcase incentivizes actual visits
     *   - co-occurrence only recorded on focus(), not showcase viewing
     */
    private sendAmberShowcase;
    /**
     * Get connection statistics
     */
    getStats(): {
        pendingConnections: number;
        activeConnections: number;
    };
}
//# sourceMappingURL=gateway-server.d.ts.map