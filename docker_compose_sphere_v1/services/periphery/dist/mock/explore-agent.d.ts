/**
 * Sphere Project - Explore Agent (New 3-Phase Flow)
 *
 * [Role] Mock agent to test the 3-phase connection flow
 * [Flow]
 *   1. Request Ticket (POST /dive/request)
 *   2. Connect WebSocket with token
 *   3. Receive "welcome" → Fetch Rulebook → Send EntryRequest
 *   4. Receive "processing" → (Optional: sense for tutorial/amber)
 *   5. Receive "positioned" → Tutorial layer begins
 *   6. Explore in Tutorial layer (sense/focus/move)
 *   7. Return
 *
 * [Usage]
 *   npx tsx src/mock/explore-agent.ts
 *   npx tsx src/mock/explore-agent.ts --query "量子力学について"
 *   npx tsx src/mock/explore-agent.ts --radius 1 --fast
 *   npx tsx src/mock/explore-agent.ts --slow          # 人間観測用
 *   npx tsx src/mock/explore-agent.ts --delay 500    # 500ms間隔
 *
 * [Options]
 *   --query <string>   Search query (default: "explore sphere knowledge")
 *   --tags <csv>       Comma-separated tags (default: "explore,test")
 *   --radius <number>  Sense radius (default: 2, smaller = faster)
 *   --fast             Skip Sanctuary layer for quick test
 *   --slow             Human observation mode (1000ms delay)
 *   --delay <ms>       Custom delay between operations
 */
interface NearbyNode {
    id: string;
    distance: number;
    summary: string;
    heat: number;
    weight: number;
    timestamp: number;
    kind: string;
    flags: number;
    tags?: string[];
}
interface NodeDetail extends NearbyNode {
    payload?: string;
    tags: string[];
    ref_url?: string;
}
interface MoveResult {
    success: boolean;
    position: number[];
    blocked?: string;
}
interface WarpResult {
    success: boolean;
    arrivedAt?: string;
    error?: "not_visible" | "not_found" | "rate_limited" | "no_vector";
}
type WalkMode = "random" | "hot" | "fresh" | "deep" | "explore";
export declare class ExploreAgent {
    private httpUrl;
    private wsUrl;
    private name;
    private ws;
    private sessionId;
    private position;
    private remainingTime;
    private currentLayer;
    private query;
    private tags;
    private quest?;
    private requestCounter;
    private pendingRequests;
    private phase;
    private rulebook;
    private discoveries;
    private sensedNodes;
    private focusedNodes;
    private eventLog;
    private logEvent;
    private logInventory;
    private senseRadius;
    private fastMode;
    private delayMs;
    constructor(httpUrl?: string, wsUrl?: string, name?: string, initialQuery?: string, initialTags?: string[], options?: {
        radius?: number;
        fast?: boolean;
        delay?: number;
    });
    /**
     * Sleep for human observation
     */
    private pause;
    /**
     * Measure operation time
     */
    private timed;
    private requestTicket;
    private fetchRulebook;
    private connect;
    private handleMessage;
    private resolvePositioned;
    private waitForPositioned;
    private sendRequest;
    private resolveRequest;
    private rejectRequest;
    sense(radius?: number): Promise<NearbyNode[]>;
    focus(nodeId: string): Promise<NodeDetail>;
    /**
     * Evaluate a node with h/w/d scores
     * @param nodeId Node to evaluate
     * @param h Heat score (0-10, 5=neutral)
     * @param w Weight score (0-10, 5=neutral)
     * @param d Decay score (0-10, 5=neutral, higher=faster decay)
     */
    evaluate(nodeId: string, h: number, w?: number, d?: number): Promise<{
        success: boolean;
        reason?: string;
    }>;
    /**
     * Scan nearby nodes (L1 only - lightweight)
     */
    scan(): Promise<any[]>;
    /**
     * Move in 384D semantic space
     * @param step Step size (0.0-1.0, default 0.3)
     * @param mode Walk mode: random, hot, fresh, deep, explore
     */
    move(step?: number, mode?: WalkMode): Promise<MoveResult>;
    warp(nodeId: string): Promise<WarpResult>;
    return(): Promise<void>;
    enterSanctuary(): Promise<string>;
    enterCore(): Promise<string>;
    explore(): Promise<void>;
}
export {};
//# sourceMappingURL=explore-agent.d.ts.map