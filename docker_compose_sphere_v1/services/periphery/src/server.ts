/**
 * Sphere Project - Periphery Server
 *
 * [Role] HTTP REST API Server
 * [Endpoint] POST /sphere/submit - Accept ExperienceCapsules
 * [Future] Add MCP server wrapper
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import type { ExperienceCapsule } from "./types/capsule.js";
// NOTE: ExternalServiceConfig is architectural anchor - external service authentication contract
import type { PeripheryConfig, ExternalServiceConfig as _ExternalServiceConfig } from "./types/config.js";
import type { IIncarnationPipeline } from "./incarnation/pipeline.js";
import type { SphereNode } from "@sphere/renal-core";
import { getRulebookResponse, RULEBOOK_VERSION } from "./rulebook/index.js";
import { getSchemasForAPI } from "./schema/index.js";
import { TicketIssuer, DEFAULT_TICKET_CONFIG, GatewayServer, DEFAULT_GATEWAY_CONFIG } from "./gateway/index.js";
import { QuestStore } from "./gateway/quest-store.js";
import { NodeForge, type EnvironmentalRequest } from "./forge/index.js";
import type { Bookkeeper } from "./bookkeeper/bookkeeper.js";
import type { EntryBuffer } from "./parser/buffer.js";
import type { SphereCoreAdapter } from "./gateway/sphere-core-adapter.js";
import type { GlobalFieldLayer } from "./field/index.js";
import type { ActiveBusLayer } from "./bus/index.js";

// Sphere Server Metadata
const SPHERE_VERSION = "0.1.0";
const SPHERE_NAME = "Sphere";
const SPHERE_DESCRIPTION = "A high-dimensional semantic space where information metabolizes and evolves";

/**
 * External Service Guard Middleware
 * forge エンドポイントは登録済み外部サービスのみアクセス可能
 */
function createExternalServiceGuard(
  config: PeripheryConfig,
  endpoint: "forge/environmental"
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const secret = req.headers["x-service-secret"] as string | undefined;
    const serviceId = req.headers["x-service-id"] as string | undefined;

    if (!secret || !serviceId) {
      res.status(401).json({
        success: false,
        error: "Missing authentication headers (X-Service-Id, X-Service-Secret)",
      });
      return;
    }

    const allowedServices = config.externalServices?.allowed ?? [];
    const service = allowedServices.find(
      (s) => s.id === serviceId && s.secret === secret
    );

    if (!service) {
      console.warn(`[Server] Unauthorized forge access attempt: serviceId=${serviceId}`);
      res.status(403).json({
        success: false,
        error: "Service not authorized",
      });
      return;
    }

    if (!service.allowedEndpoints.includes(endpoint)) {
      console.warn(
        `[Server] Service ${serviceId} not allowed for endpoint ${endpoint}`
      );
      res.status(403).json({
        success: false,
        error: `Service not authorized for ${endpoint}`,
      });
      return;
    }

    console.log(`[Server] Authorized service: ${service.name} (${serviceId})`);
    next();
  };
}

export class PeripheryServer {
  private app = express();
  private ticketIssuer = new TicketIssuer(DEFAULT_TICKET_CONFIG);
  private questStore: QuestStore;
  private gatewayServer: GatewayServer | null = null;
  private nodeForge: NodeForge;

  /**
   * Cosine distance between two vectors (0 = identical, 2 = opposite)
   */
  private cosineDistance(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 2;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 2;
    return 1 - dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  constructor(
    private incarnationPipeline: IIncarnationPipeline,
    private config: PeripheryConfig,
    private entryBuffer: EntryBuffer,
    private projectionDB?: Map<string, SphereNode>,
    private bookkeeper?: Bookkeeper,
    private coreAdapter?: SphereCoreAdapter,
    private globalFieldLayer?: GlobalFieldLayer,
    private activeBusLayer?: ActiveBusLayer
  ) {
    // Initialize QuestStore with config
    this.questStore = new QuestStore(config.questStore);
    // Initialize NodeForge with config (if available)
    this.nodeForge = new NodeForge(config.forge);
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.use(express.json());

    // CORS (allow all origins for public demo)
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Service-Id, X-Service-Secret");
      if (_req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    });

    // ===== Rate Limiting =====
    // Heavy operations: contribute (incarnation pipeline), forge
    const heavyLimiter = rateLimit({
      windowMs: 60_000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: "Rate limit exceeded (10/min)" },
    });
    // Medium operations: explore (vector search), quest
    const mediumLimiter = rateLimit({
      windowMs: 60_000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: "Rate limit exceeded (30/min)" },
    });
    // Read-only endpoints: info, nodes, stats
    const readLimiter = rateLimit({
      windowMs: 60_000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: "Rate limit exceeded (120/min)" },
    });

    // ===== Sphere Information Endpoint =====
    // External-facing information about this Sphere instance
    this.app.get("/", (_req, res) => {
      const nodeCount = this.projectionDB?.size ?? 0;

      res.json({
        name: SPHERE_NAME,
        description: SPHERE_DESCRIPTION,
        version: SPHERE_VERSION,
        rulebookVersion: RULEBOOK_VERSION,
        status: "operational",
        endpoints: {
          info: {
            "GET /": "Sphere information (this endpoint)",
            "GET /health": "Health check",
            "GET /metrics": "System metrics (monitoring)",
            "GET /stats": "System statistics",
          },
          observation: {
            "GET /nodes/metrics": "List all nodes with metrics (sorted by heat)",
            "GET /nodes/stats": "Node statistics by kind",
            "GET /nodes/:id": "Get specific node details",
          },
          exploration: {
            "GET /sphere/explore": "Explore Sphere with a query (main entry point)",
          },
          contribution: {
            "POST /sphere/contribute": "External data contribution (single or batch)",
          },
          forge: {
            "POST /sphere/forge/environmental": "Generate Environmental Node (called by Observatory)",
          },
          sanctuary: {
            "POST /sphere/upstream": "(planned) Bulk import from cloud storage",
            "GET /sphere/downstream": "(planned) Export SanctuaryBundle to cloud storage",
          },
          guidance: {
            "GET /rulebook": "Agent rulebook (rules, constraints, guidance)",
            "GET /schema": "Data format specification for submissions",
          },
          dive: {
            "POST /dive/request": "Request a Dive Ticket for Sphere entry",
            "GET /dive/validate/:token": "Validate a Dive Ticket (debug)",
            "GET /dive/stats": "Dive ticket statistics",
          },
          quest: {
            "POST /quest": "Submit Quest (verification request from external world)",
            "GET /quest/stats": "Quest store statistics",
          },
        },
        metrics: {
          nodeCount,
          uptime: process.uptime(),
        },
      });
    });

    // ===== External Data Contribution Endpoint =====
    // For external sources to provide data to Sphere
    // Supports both single and batch modes
    this.app.post("/sphere/contribute", heavyLimiter, async (req, res) => {
      try {
        const { source, capsule, capsules, batch } = req.body;

        // Validate source
        if (!source || typeof source !== "string") {
          res.status(400).json({
            success: false,
            error: "Field 'source' is required to identify the contributor",
          });
          return;
        }

        // Determine mode: single or batch
        const isBatch = batch === true && Array.isArray(capsules);
        const items: ExperienceCapsule[] = isBatch ? capsules : (capsule ? [capsule] : []);

        if (items.length === 0) {
          res.status(400).json({
            success: false,
            error: "Provide 'capsule' for single mode or 'capsules' array with 'batch: true' for batch mode",
          });
          return;
        }

        console.log(
          `[Server] External contribution from "${source}": ` +
            `${items.length} capsule(s), batch=${isBatch}`
        );

        // Process all capsules through pipeline
        let totalNodes = 0;
        const warnings: string[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const result = await this.incarnationPipeline.ingest(item);

          if (result.success) {
            totalNodes += result.nodeCount ?? 0;
          } else {
            warnings.push(`Capsule ${i}: ${result.errors?.map(e => e.code).join(", ")}`);
          }
        }

        console.log(
          `[Server] ✅ Contribution processed: ${totalNodes} nodes incarnated` +
            (warnings.length > 0 ? `, ${warnings.length} warnings` : "")
        );

        res.json({
          success: totalNodes > 0 || warnings.length === 0,
          nodeCount: totalNodes,
          processed: items.length,
          ...(warnings.length > 0 && { warnings }),
        });
      } catch (error) {
        console.error("[Server] Error processing contribution:", error);
        res.status(500).json({
          success: false,
          error: "Internal server error",
        });
      }
    });

    // Health check endpoint
    this.app.get("/health", (_req, res) => {
      res.json({ status: "ok", service: "periphery" });
    });

    // System metrics endpoint (for monitoring)
    this.app.get("/metrics", (_req, res) => {
      const nodeCount = this.projectionDB?.size ?? 0;
      const agents = this.gatewayServer?.getConnectionCount() ?? 0;
      const field = this.globalFieldLayer?.getGlobalField();

      res.json({
        uptime: process.uptime(),
        nodeCount,
        agents,
        field: field ? {
          intensity: field.intensity,
          dominantFlags: field.dominantFlags,
          volatility: field.volatility,
        } : null,
        memory: {
          rss: process.memoryUsage.rss(),
          heapUsed: process.memoryUsage().heapUsed,
        },
      });
    });

    // Stats endpoint (legacy, kept for compatibility)
    this.app.get("/stats", (_req, res) => {
      res.json({
        service: "periphery",
        uptime: process.uptime(),
      });
    });

    // Node observation endpoints
    // ===== Node Metrics Endpoint =====
    // ProjDB全ノードのメトリクス一覧（heat順ソート）
    this.app.get("/nodes/metrics", readLimiter, (_req, res) => {
      if (!this.projectionDB) {
        res.status(503).json({ error: "ProjectionDB not available" });
        return;
      }

      const nodes = Array.from(this.projectionDB.values()).map(node => ({
        id: node.id,
        kind: node.kind,
        heat: node.metrics.h,
        weight: node.metrics.w,
        decay: node.metrics.d,
        ttl: node.metrics.ttl,
        flags: node.metrics.flg,
        traversal: node.metrics.traversal ?? 0,
        stayTime: node.metrics.stayTime ?? 0,
        timestamp: node.timestamp,
        summary: node.payload?.summary?.substring(0, 100),
      }));

      res.json({
        total: nodes.length,
        nodes: nodes.sort((a, b) => b.heat - a.heat),
      });
    });

    this.app.get("/nodes/stats", readLimiter, (_req, res) => {
      if (!this.projectionDB) {
        res.status(503).json({ error: "ProjectionDB not available" });
        return;
      }

      const stats: Record<string, number> = {
        relic: 0,
        amber: 0,
        active: 0,
        fossil: 0,
        ghost: 0,
        link: 0,
        environment: 0,
        total: this.projectionDB.size,
      };

      let totalHeat = 0;
      let totalWeight = 0;
      let totalTTL = 0;

      for (const node of this.projectionDB.values()) {
        stats[node.kind] = (stats[node.kind] ?? 0) + 1;
        totalHeat += node.metrics.h;
        totalWeight += node.metrics.w;
        totalTTL += node.metrics.ttl;
      }

      res.json({
        counts: stats,
        averages: {
          heat: stats.total > 0 ? totalHeat / stats.total : 0,
          weight: stats.total > 0 ? totalWeight / stats.total : 0,
          ttl: stats.total > 0 ? totalTTL / stats.total : 0,
        },
      });
    });

    this.app.get("/nodes/:id", readLimiter, (req, res) => {
      if (!this.projectionDB) {
        res.status(503).json({ error: "ProjectionDB not available" });
        return;
      }

      const node = this.projectionDB.get(req.params.id);
      if (!node) {
        res.status(404).json({ error: "Node not found" });
        return;
      }

      res.json(node);
    });

    // ===== Sphere Exploration Endpoint =====
    // Main entry point for knowledge discovery
    // Agent brings a query → vectorized → search → return raw knowledge
    this.app.get("/sphere/explore", mediumLimiter, async (req, res) => {
      if (!this.projectionDB) {
        res.status(503).json({ error: "ProjectionDB not available" });
        return;
      }

      const query = req.query.q as string;
      if (!query) {
        res.status(400).json({ error: "Query parameter 'q' is required" });
        return;
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const radius = parseFloat(req.query.radius as string) || 0.5;

      try {
        // Vectorize query using real embedding
        const queryVector = await this.entryBuffer.vectorize(query);

        // Vector similarity search
        const candidates: { node: SphereNode; distance: number }[] = [];

        for (const node of this.projectionDB.values()) {
          if (!node.vector || node.vector.length === 0) continue;

          const distance = this.cosineDistance(queryVector, node.vector);
          if (distance <= radius) {
            candidates.push({ node, distance });
          }
        }

        // Sort by distance, take top N
        candidates.sort((a, b) => a.distance - b.distance);
        const topCandidates = candidates.slice(0, limit);

        const results = topCandidates.map(({ node, distance }) => ({
          id: node.id,
          distance,
          summary: node.payload?.summary ?? "",
          kind: node.kind,
          tags: node.payload?.tags ?? [],
          heat: node.metrics.h,
          flags: node.metrics.flg,
          ref_url: node.payload?.ref_url,
        }));

        res.json({
          query,
          radius,
          results,
          meta: {
            total: this.projectionDB.size,
            matched: candidates.length,
            returned: results.length,
          },
        });
      } catch (error) {
        console.error("[Server] Explore error:", error);
        res.status(500).json({ error: "Vector search failed" });
      }
    });

    // ===== Agent Rulebook Endpoint =====
    // Provides rules, constraints, and guidance for agents
    this.app.get("/rulebook", (_req, res) => {
      res.json(getRulebookResponse());
    });

    // ===== Dive Ticket Request Endpoint =====
    // Entry point for Sphere access - issue a Dive Ticket
    this.app.post("/dive/request", (req, res) => {
      // Get client IP for rate limiting
      const ip = req.ip || req.socket.remoteAddress || "unknown";

      // Issue ticket
      const result = this.ticketIssuer.issue(ip);

      if (!result.success) {
        res.status(429).json({
          success: false,
          error: result.error,
        });
        return;
      }

      console.log(`[Server] Dive ticket issued to ${ip}`);

      res.json({
        success: true,
        ticket: {
          token: result.ticket!.token,
          expiresIn: result.ticket!.ttl,
          capabilities: ["sense", "move", "focus", "emit", "return"],
        },
        instructions: {
          connect: "Use this token to connect via WebSocket",
          ttl: `Token expires in ${result.ticket!.ttl} seconds`,
          sessionDuration: "Once connected, session lasts for the configured duration",
        },
      });
    });

    // ===== Dive Ticket Validation Endpoint (for debugging) =====
    this.app.get("/dive/validate/:token", (req, res) => {
      const result = this.ticketIssuer.validate(req.params.token);

      res.json({
        valid: result.valid,
        ...(result.error && { error: result.error }),
        ...(result.ticket && {
          issuedAt: result.ticket.issuedAt,
          expiresAt: result.ticket.issuedAt + result.ticket.ttl * 1000,
          remainingSeconds: Math.max(
            0,
            Math.floor((result.ticket.issuedAt + result.ticket.ttl * 1000 - Date.now()) / 1000)
          ),
        }),
      });
    });

    // ===== Dive Stats Endpoint =====
    this.app.get("/dive/stats", (_req, res) => {
      const stats = this.ticketIssuer.getStats();
      res.json(stats);
    });

    // ===== Quest Submission Endpoint =====
    // External world submits quests (verification requests)
    // Uses same structure as EntryRequest (query + tags)
    this.app.post("/quest", mediumLimiter, (req, res) => {
      try {
        const { query, tags, submitterId } = req.body;

        // Validate: same structure as EntryRequest
        if (!query || typeof query !== "string") {
          res.status(400).json({
            success: false,
            error: "Field 'query' is required (quest text)",
          });
          return;
        }

        if (!Array.isArray(tags)) {
          res.status(400).json({
            success: false,
            error: "Field 'tags' is required (string array)",
          });
          return;
        }

        // Submit to Quest Store
        const questId = this.questStore.submit(
          { query, tags },
          submitterId
        );

        console.log(`[Server] Quest submitted: ${questId}`);

        res.json({
          success: true,
          questId,
          message: "Quest submitted. Agents will see it in Quest Showcase.",
        });
      } catch (error) {
        console.error("[Server] Error submitting quest:", error);
        res.status(500).json({
          success: false,
          error: "Internal server error",
        });
      }
    });

    // ===== Quest Stats Endpoint =====
    this.app.get("/quest/stats", (_req, res) => {
      const stats = this.questStore.getStats();
      res.json(stats);
    });

    // ===== Schema Endpoint =====
    // Data format specification for external submissions (schema-driven)
    this.app.get("/schema", (_req, res) => {
      res.json({
        version: SPHERE_VERSION,
        description: "Data format specification for Sphere submissions",
        schemas: getSchemasForAPI(),
      });
    });

    // ===== NodeForge Endpoints =====
    // Internal node generation (Environmental)
    // Called by Observatory or other authorized external services ONLY

    /**
     * POST /sphere/forge/environmental
     * Generate an Environmental Node for anomaly response
     * Called by Observatory when it detects statistical anomalies
     *
     * [Auth] Requires X-Service-Id and X-Service-Secret headers
     */
    this.app.post(
      "/sphere/forge/environmental",
      heavyLimiter,
      createExternalServiceGuard(this.config, "forge/environmental"),
      async (req, res) => {
      if (!this.projectionDB) {
        res.status(503).json({ error: "ProjectionDB not available" });
        return;
      }

      try {
        const { anomalyType, severity, signal, suggestedAction } = req.body as EnvironmentalRequest;

        if (!anomalyType || severity === undefined) {
          res.status(400).json({
            success: false,
            error: "Fields 'anomalyType' and 'severity' are required",
          });
          return;
        }

        console.log(
          `[Server] Forge environmental request: type=${anomalyType} severity=${severity.toFixed(2)}`
        );

        // Forge the environmental node
        const result = this.nodeForge.forgeEnvironmental(
          { anomalyType, severity, signal, suggestedAction },
          this.projectionDB
        );

        if (!result.success || !result.node) {
          res.status(400).json({
            success: false,
            error: result.error ?? "Failed to forge environmental node",
          });
          return;
        }

        // Environmental Node は ProjDB のみ（RefDB には保存しない）
        // 一時的な処方箋であり、役目を終えたら消滅する
        this.projectionDB.set(result.node.id, result.node);

        console.log(
          `[Server] ✅ Environmental forged: ${result.node.id.slice(0, 8)} type=${anomalyType}`
        );

        res.json({
          success: true,
          node: {
            id: result.node.id,
            kind: result.node.kind,
            anomalyType,
            severity,
          },
        });
      } catch (error) {
        console.error("[Server] Error forging environmental:", error);
        res.status(500).json({
          success: false,
          error: "Internal server error",
        });
      }
    });

    // Static file serving (opt-in via env, for standalone deployment only)
    const staticDir = process.env.STATIC_DIR;
    if (staticDir) this.app.use(express.static(staticDir));
  }

  public start() {
    // Start ticket issuer cleanup
    this.ticketIssuer.start();

    // Start Gateway WebSocket server
    // Production mode (PORT env set): use same port for HTTP and WebSocket
    const httpPort = process.env.PORT ? parseInt(process.env.PORT, 10) : this.config.server.port;
    const wsPort = process.env.PORT
      ? 0  // 0 = use HTTP server (same port)
      : (this.config.server.wsPort ?? DEFAULT_GATEWAY_CONFIG.port);

    this.gatewayServer = new GatewayServer(
      this.ticketIssuer,
      this.entryBuffer,
      { port: wsPort },
      this.incarnationPipeline,
      this.questStore,
      this.coreAdapter,
      undefined,  // amberCache
      this.globalFieldLayer,
      this.activeBusLayer
    );
    const httpServer = this.app.listen(httpPort, () => {
      console.log(`[PeripheryServer] 🚀 Listening on port ${httpPort}`);
      console.log(`[PeripheryServer] ${SPHERE_NAME} v${SPHERE_VERSION}`);
      console.log(`[PeripheryServer] Endpoints:`);
      console.log(`  GET  /                   - Sphere information`);
      console.log(`  GET  /health             - Health check`);
      console.log(`  GET  /metrics            - System metrics (monitoring)`);
      console.log(`  GET  /stats              - System stats`);
      console.log(`  GET  /nodes/metrics      - List all nodes with metrics`);
      console.log(`  GET  /nodes/stats        - Node statistics`);
      console.log(`  GET  /nodes/:id          - Get specific node`);
      console.log(`  GET  /sphere/explore     - Explore with query`);
      console.log(`  POST /sphere/contribute  - External data contribution`);
      console.log(`  POST /sphere/forge/env   - Generate Environmental Node`);
      console.log(`  GET  /rulebook           - Agent rulebook`);
      console.log(`  GET  /schema             - Data format specification`);
      console.log(`  POST /dive/request       - Request Dive Ticket`);
      console.log(`  GET  /dive/validate/:t   - Validate ticket (debug)`);
      console.log(`  GET  /dive/stats         - Dive statistics`);
      console.log(`  POST /quest              - Submit Quest (external)`);
      console.log(`  GET  /quest/stats        - Quest statistics`);
    });

    // WebSocket: same port (wsPort=0 or unset) or separate port (local dev)
    if (wsPort && wsPort !== httpPort) {
      this.gatewayServer.start(wsPort);
      console.log(`[PeripheryServer] WebSocket Gateway: ws://localhost:${wsPort} (separate port)`);
    } else {
      this.gatewayServer.start(httpServer);
      console.log(`[PeripheryServer] WebSocket Gateway: ws://localhost:${httpPort} (same port)`);
    }
  }

  public stop() {
    this.ticketIssuer.stop();
    this.gatewayServer?.stop();
  }

  /**
   * Set callback for agent count changes (for Dormancy feature)
   * [Design] Pass-through to GatewayServer
   */
  public setOnAgentCountChange(callback: (count: number) => void): void {
    this.gatewayServer?.setOnAgentCountChange(callback);
  }
}
