/**
 * Sphere Project - Periphery Server
 *
 * [Role] HTTP REST API Server
 * [Endpoint] POST /sphere/submit - Accept ExperienceCapsules
 * [Future] Add MCP server wrapper
 */
import type { PeripheryConfig } from "./types/config.js";
import type { IIncarnationPipeline } from "./incarnation/pipeline.js";
import type { SphereNode } from "@sphere/renal-core";
import type { Bookkeeper } from "./bookkeeper/bookkeeper.js";
import type { EntryBuffer } from "./parser/buffer.js";
import type { SphereCoreAdapter } from "./gateway/sphere-core-adapter.js";
import type { GlobalFieldLayer } from "./field/index.js";
import type { ActiveBusLayer } from "./bus/index.js";
export declare class PeripheryServer {
    private incarnationPipeline;
    private config;
    private entryBuffer;
    private projectionDB?;
    private bookkeeper?;
    private coreAdapter?;
    private globalFieldLayer?;
    private activeBusLayer?;
    private app;
    private ticketIssuer;
    private questStore;
    private gatewayServer;
    private nodeForge;
    /**
     * Cosine distance between two vectors (0 = identical, 2 = opposite)
     */
    private cosineDistance;
    constructor(incarnationPipeline: IIncarnationPipeline, config: PeripheryConfig, entryBuffer: EntryBuffer, projectionDB?: Map<string, SphereNode> | undefined, bookkeeper?: Bookkeeper | undefined, coreAdapter?: SphereCoreAdapter | undefined, globalFieldLayer?: GlobalFieldLayer | undefined, activeBusLayer?: ActiveBusLayer | undefined);
    private setupRoutes;
    start(): void;
    stop(): void;
    /**
     * Set callback for agent count changes (for Dormancy feature)
     * [Design] Pass-through to GatewayServer
     */
    setOnAgentCountChange(callback: (count: number) => void): void;
}
//# sourceMappingURL=server.d.ts.map