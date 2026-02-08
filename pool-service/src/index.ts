// ============================================================
// Pool Service — Entry Point
// ============================================================
//
// Standalone service: accepts entries via HTTP, scores with LLM,
// submits accepted entries to Sphere's contribute endpoint.
//
// Usage:
//   npm run dev                         (dev mode with watch)
//   npm start                           (production)
//   npm start -- --port 4000            (custom port)
//   npm start -- --sphere-url http://...

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Pool } from "./pool.js";
import { DEFAULT_CONFIG, type PoolConfig, type PoolEntry } from "./types.js";

// --- CLI args ---
function parseArgs(): Partial<PoolConfig> & { port?: number } {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (args[i]?.startsWith("--") && args[i + 1]) {
      result[args[i].slice(2)] = args[i + 1];
    }
  }
  return {
    port: result.port ? Number(result.port) : undefined,
    sphereUrl: result["sphere-url"],
    ollamaUrl: result["ollama-url"],
    ollamaModel: result["model"],
    debug: result.debug === "false" ? false : undefined,
  };
}

// --- Main ---
async function main(): Promise<void> {
  const cliArgs = parseArgs();
  const port = cliArgs.port ?? 4000;

  const config: PoolConfig = {
    ...DEFAULT_CONFIG,
    ...Object.fromEntries(Object.entries(cliArgs).filter(([, v]) => v !== undefined)),
  };

  const pool = new Pool(config);
  console.log(`[pool-service] Starting with config:`, {
    sphereUrl: config.sphereUrl,
    ollamaUrl: config.ollamaUrl,
    model: config.ollamaModel,
    threshold: config.intakeThreshold,
    coherenceFloor: config.coherenceFloor,
  });

  // Scoring loop: process queue at interval
  setInterval(async () => {
    if (pool.queueLength > 0 && !pool.isProcessing) {
      await pool.processNext();
    }
  }, config.scoringIntervalMs);

  // HTTP server for ingestion
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // POST /ingest — add single entry to pool (membrane validates + sanitizes)
    if (req.method === "POST" && req.url === "/ingest") {
      const body = await readBody(req);
      try {
        const raw = JSON.parse(body) as PoolEntry;
        raw.source = raw.source ?? "manual";
        const errors = pool.ingest(raw);
        if (errors.length > 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Membrane rejected", details: errors }));
          return;
        }
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "queued", queueLength: pool.queueLength }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
      return;
    }

    // POST /ingest/batch — add multiple entries (each passes through membrane)
    if (req.method === "POST" && req.url === "/ingest/batch") {
      const body = await readBody(req);
      try {
        const entries = JSON.parse(body) as PoolEntry[];
        if (!Array.isArray(entries)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Expected JSON array" }));
          return;
        }
        let accepted = 0;
        let rejected = 0;
        for (const raw of entries) {
          raw.source = raw.source ?? "batch";
          const errors = pool.ingest(raw);
          if (errors.length > 0) {
            rejected++;
          } else {
            accepted++;
          }
        }
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "queued", accepted, rejected, queueLength: pool.queueLength }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
      return;
    }

    // GET /status — pool health
    if (req.method === "GET" && req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        queueLength: pool.queueLength,
        processing: pool.isProcessing,
      }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(port, () => {
    console.log(`[pool-service] Listening on http://localhost:${port}`);
    console.log(`[pool-service] POST /ingest       — submit single entry`);
    console.log(`[pool-service] POST /ingest/batch — submit array of entries`);
    console.log(`[pool-service] GET  /status       — check queue status`);
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

main().catch(console.error);
