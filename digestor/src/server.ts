// ============================================================
// IO Gateway — Agent Cluster の外部窓口
// ============================================================
//
// Digestor プロセス内に HTTP サーバーを設置。
// Storage 層を介して eval/narrative/trail/profile/generation を読み書き。
//
// Design: SPHERE_ECOSYSTEM_DESIGN.md Section 8
//
// Endpoints:
//   POST /evaluations            — eval 受付 (phi-agent → storage)
//   POST /narratives             — narrative 受付 (phi-agent → storage)
//   POST /trails                 — trail 受付 (phi-agent → storage)
//   GET  /narratives             — narrative 一覧 (?limit=N&loadout=X&type=return|stream)
//   GET  /narratives/:id         — 単一 narrative
//   GET  /trails                 — trail 一覧 (?limit=N&loadout=X)
//   GET  /trails/:sessionId      — 単一 trail
//   GET  /species/:name/profile  — 種族プロファイル
//   GET  /species                — 全種族プロファイル
//   GET  /generations            — 世代一覧
//   GET  /generations/:id        — 単一世代
//   GET  /stats                  — eval-log 集計
//   GET  /health                 — ヘルスチェック

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { Storage, EvalLogEntry, NarrativeEntry, TrailEntry } from "./storage.js";

const startTime = Date.now();

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function startServer(port: number, storage: Storage): void {
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

    const rawUrl = req.url ?? "/";
    const pathname = rawUrl.split("?")[0];
    const parts = pathname.split("/").filter(Boolean);

    // GET /health
    if (req.method === "GET" && parts[0] === "health") {
      json(res, 200, { status: "ok", uptime: Math.floor((Date.now() - startTime) / 1000), backend: storage.backend });
      return;
    }

    // POST /evaluations
    if (req.method === "POST" && parts[0] === "evaluations") {
      try {
        const body = await readBody(req);
        const entry = JSON.parse(body) as EvalLogEntry;
        if (!entry.loadout || !Array.isArray(entry.evaluations) || entry.evaluations.length === 0) {
          json(res, 400, { error: "Missing loadout or evaluations" });
          return;
        }
        await storage.appendEvaluation(entry);
        json(res, 202, { status: "accepted", evaluations: entry.evaluations.length });
      } catch {
        json(res, 400, { error: "Invalid JSON" });
      }
      return;
    }

    // POST /narratives
    if (req.method === "POST" && parts[0] === "narratives") {
      try {
        const body = await readBody(req);
        const entry = JSON.parse(body) as NarrativeEntry;
        if (!entry.type || !entry.loadout) {
          json(res, 400, { error: "Missing type or loadout" });
          return;
        }
        if (!entry.id) entry.id = randomUUID();
        if (!entry.timestamp) entry.timestamp = Date.now();
        await storage.appendNarrative(entry);
        json(res, 202, { status: "accepted", id: entry.id });
      } catch {
        json(res, 400, { error: "Invalid JSON" });
      }
      return;
    }

    // POST /trails
    if (req.method === "POST" && parts[0] === "trails") {
      try {
        const body = await readBody(req);
        const entry = JSON.parse(body) as TrailEntry;
        if (!entry.loadout || !Array.isArray(entry.events) || entry.events.length === 0) {
          json(res, 400, { error: "Missing loadout or events" });
          return;
        }
        if (!entry.timestamp) entry.timestamp = Date.now();
        await storage.appendTrail(entry);
        json(res, 202, { status: "accepted", sessionId: entry.sessionId ?? null });
      } catch {
        json(res, 400, { error: "Invalid JSON" });
      }
      return;
    }

    // GET /trails
    if (req.method === "GET" && parts[0] === "trails" && parts.length === 1) {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const limit = parseInt(url.searchParams.get("limit") ?? "50");
        const loadout = url.searchParams.get("loadout") ?? undefined;
        const result = await storage.listTrails({ limit, loadout });
        json(res, 200, result);
      } catch {
        json(res, 500, { error: "Failed to read trails" });
      }
      return;
    }

    // GET /trails/:sessionId
    if (req.method === "GET" && parts[0] === "trails" && parts[1]) {
      try {
        const targetId = decodeURIComponent(parts[1]);
        const trail = await storage.getTrail(targetId);
        if (!trail) { json(res, 404, { error: `Trail '${targetId}' not found` }); return; }
        json(res, 200, trail);
      } catch {
        json(res, 500, { error: "Failed to read trail" });
      }
      return;
    }

    // GET /narratives
    if (req.method === "GET" && parts[0] === "narratives" && parts.length === 1) {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const limit = parseInt(url.searchParams.get("limit") ?? "50");
        const loadout = url.searchParams.get("loadout") ?? undefined;
        const type = url.searchParams.get("type") ?? undefined;
        const result = await storage.listNarratives({ limit, loadout, type });
        json(res, 200, result);
      } catch {
        json(res, 500, { error: "Failed to read narratives" });
      }
      return;
    }

    // GET /narratives/:id
    if (req.method === "GET" && parts[0] === "narratives" && parts[1]) {
      try {
        const targetId = decodeURIComponent(parts[1]);
        const narrative = await storage.getNarrative(targetId);
        if (!narrative) { json(res, 404, { error: `Narrative '${targetId}' not found` }); return; }
        json(res, 200, narrative);
      } catch {
        json(res, 500, { error: "Failed to read narrative" });
      }
      return;
    }

    // GET /species/:name/profile
    if (req.method === "GET" && parts[0] === "species" && parts[2] === "profile" && parts[1]) {
      try {
        const name = decodeURIComponent(parts[1]);
        const entry = await storage.getSpeciesProfile(name);
        if (!entry) { json(res, 404, { error: `Species '${name}' not found` }); return; }
        json(res, 200, entry);
      } catch {
        json(res, 500, { error: "Failed to read profile" });
      }
      return;
    }

    // GET /species
    if (req.method === "GET" && parts[0] === "species" && parts.length === 1) {
      try {
        const raw = await storage.getAllSpeciesProfiles();
        if (!raw) { json(res, 404, { error: "Profile not found" }); return; }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(raw);
      } catch {
        json(res, 500, { error: "Failed to read profile" });
      }
      return;
    }

    // GET /generations/:id
    if (req.method === "GET" && parts[0] === "generations" && parts[1]) {
      try {
        const id = parseInt(parts[1]);
        const gen = await storage.getGeneration(id);
        if (!gen) { json(res, 404, { error: `Generation ${parts[1]} not found` }); return; }
        json(res, 200, gen);
      } catch {
        json(res, 500, { error: "Failed to read generation" });
      }
      return;
    }

    // GET /generations
    if (req.method === "GET" && parts[0] === "generations" && parts.length === 1) {
      try {
        const generations = await storage.listGenerations();
        json(res, 200, { generations });
      } catch {
        json(res, 500, { error: "Failed to read generations" });
      }
      return;
    }

    // GET /stats
    if (req.method === "GET" && parts[0] === "stats") {
      try {
        const stats = await storage.getStats();
        json(res, 200, stats);
      } catch {
        json(res, 500, { error: "Failed to read stats" });
      }
      return;
    }

    // 404
    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(port, () => {
    console.log(`[io-gateway] Listening on http://localhost:${port} (backend: ${storage.backend})`);
    console.log(`[io-gateway] POST /evaluations       — accept evaluations`);
    console.log(`[io-gateway] POST /narratives        — accept narratives`);
    console.log(`[io-gateway] POST /trails            — accept trails`);
    console.log(`[io-gateway] GET  /narratives        — list narratives`);
    console.log(`[io-gateway] GET  /narratives/:id    — single narrative`);
    console.log(`[io-gateway] GET  /trails             — list trails`);
    console.log(`[io-gateway] GET  /trails/:sessionId  — single trail`);
    console.log(`[io-gateway] GET  /species            — all species profiles`);
    console.log(`[io-gateway] GET  /species/:name/profile — single species`);
    console.log(`[io-gateway] GET  /generations        — generation archive`);
    console.log(`[io-gateway] GET  /stats              — eval-log statistics`);
    console.log(`[io-gateway] GET  /health             — health check`);
  });
}
