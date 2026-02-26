// ============================================================
// IO Gateway — Agent Cluster の外部窓口
// ============================================================
//
// Digestor プロセス内に HTTP サーバーを設置。
// 内部ファイル (eval-log.jsonl, species-profile.json, generations/)
// への読み書きを API として公開する。
//
// Design: SPHERE_ECOSYSTEM_DESIGN.md Section 8
//
// Endpoints:
//   POST /evaluations            — eval 受付 (phi-agent → eval-log.jsonl)
//   POST /narratives             — narrative 受付 (phi-agent → narrative-log.jsonl)
//   POST /trails                 — trail 受付 (periphery → trail-log.jsonl)
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
import { readFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface GatewayConfig {
  dataDir: string;
  evalLog: string;
  narrativeLog: string;
  trailLog: string;
  profileOut: string;
  genDir: string;
}

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

export function startServer(port: number, config: GatewayConfig): void {
  const { evalLog, narrativeLog, trailLog, profileOut, genDir } = config;

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
      json(res, 200, { status: "ok", uptime: Math.floor((Date.now() - startTime) / 1000) });
      return;
    }

    // POST /evaluations
    if (req.method === "POST" && parts[0] === "evaluations") {
      try {
        const body = await readBody(req);
        const entry = JSON.parse(body);
        // Minimal validation
        if (!entry.loadout || !Array.isArray(entry.evaluations) || entry.evaluations.length === 0) {
          json(res, 400, { error: "Missing loadout or evaluations" });
          return;
        }
        // Append to eval-log.jsonl (same format as phi-agent file write)
        const dir = join(evalLog, "..");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        appendFileSync(evalLog, JSON.stringify(entry) + "\n", "utf-8");
        json(res, 202, { status: "accepted", evaluations: entry.evaluations.length });
      } catch {
        json(res, 400, { error: "Invalid JSON" });
      }
      return;
    }

    // POST /narratives — accept narrative entries (return response or stream fragment)
    if (req.method === "POST" && parts[0] === "narratives") {
      try {
        const body = await readBody(req);
        const entry = JSON.parse(body);
        // Minimal validation: must have type and loadout
        if (!entry.type || !entry.loadout) {
          json(res, 400, { error: "Missing type or loadout" });
          return;
        }
        // Assign id + timestamp if not present
        if (!entry.id) entry.id = randomUUID();
        if (!entry.timestamp) entry.timestamp = Date.now();
        const dir = join(narrativeLog, "..");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        appendFileSync(narrativeLog, JSON.stringify(entry) + "\n", "utf-8");
        json(res, 202, { status: "accepted", id: entry.id });
      } catch {
        json(res, 400, { error: "Invalid JSON" });
      }
      return;
    }

    // POST /trails — accept trail entries (periphery → trail-log.jsonl)
    if (req.method === "POST" && parts[0] === "trails") {
      try {
        const body = await readBody(req);
        const entry = JSON.parse(body);
        // Minimal validation: must have loadout and events
        if (!entry.loadout || !Array.isArray(entry.events) || entry.events.length === 0) {
          json(res, 400, { error: "Missing loadout or events" });
          return;
        }
        if (!entry.timestamp) entry.timestamp = Date.now();
        const dir = join(trailLog, "..");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        appendFileSync(trailLog, JSON.stringify(entry) + "\n", "utf-8");
        json(res, 202, { status: "accepted", sessionId: entry.sessionId ?? null });
      } catch {
        json(res, 400, { error: "Invalid JSON" });
      }
      return;
    }

    // GET /trails — list trails (newest first, optional ?limit=N&loadout=X)
    if (req.method === "GET" && parts[0] === "trails" && parts.length === 1) {
      if (!existsSync(trailLog)) {
        json(res, 200, { trails: [], total: 0 });
        return;
      }
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const limit = parseInt(url.searchParams.get("limit") ?? "50");
        const filterLoadout = url.searchParams.get("loadout");

        const raw = readFileSync(trailLog, "utf-8");
        const all: unknown[] = [];
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (filterLoadout && entry.loadout !== filterLoadout) continue;
            all.push(entry);
          } catch { /* skip */ }
        }
        all.reverse();
        json(res, 200, { trails: all.slice(0, limit), total: all.length });
      } catch {
        json(res, 500, { error: "Failed to read trail-log" });
      }
      return;
    }

    // GET /trails/:sessionId — single trail by sessionId
    if (req.method === "GET" && parts[0] === "trails" && parts[1]) {
      if (!existsSync(trailLog)) {
        json(res, 404, { error: "Not found" });
        return;
      }
      try {
        const targetId = decodeURIComponent(parts[1]);
        const raw = readFileSync(trailLog, "utf-8");
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.sessionId === targetId) {
              json(res, 200, entry);
              return;
            }
          } catch { /* skip */ }
        }
        json(res, 404, { error: `Trail '${targetId}' not found` });
      } catch {
        json(res, 500, { error: "Failed to read trail-log" });
      }
      return;
    }

    // GET /narratives — list narratives (newest first, optional ?limit=N&loadout=X)
    if (req.method === "GET" && parts[0] === "narratives" && parts.length === 1) {
      if (!existsSync(narrativeLog)) {
        json(res, 200, { narratives: [] });
        return;
      }
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const limit = parseInt(url.searchParams.get("limit") ?? "50");
        const filterLoadout = url.searchParams.get("loadout");
        const filterType = url.searchParams.get("type");

        const raw = readFileSync(narrativeLog, "utf-8");
        const all: unknown[] = [];
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (filterLoadout && entry.loadout !== filterLoadout) continue;
            if (filterType && entry.type !== filterType) continue;
            all.push(entry);
          } catch { /* skip */ }
        }
        // Newest first, apply limit
        all.reverse();
        json(res, 200, { narratives: all.slice(0, limit), total: all.length });
      } catch {
        json(res, 500, { error: "Failed to read narrative-log" });
      }
      return;
    }

    // GET /narratives/:id — single narrative by id
    if (req.method === "GET" && parts[0] === "narratives" && parts[1]) {
      if (!existsSync(narrativeLog)) {
        json(res, 404, { error: "Not found" });
        return;
      }
      try {
        const targetId = decodeURIComponent(parts[1]);
        const raw = readFileSync(narrativeLog, "utf-8");
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.id === targetId) {
              json(res, 200, entry);
              return;
            }
          } catch { /* skip */ }
        }
        json(res, 404, { error: `Narrative '${targetId}' not found` });
      } catch {
        json(res, 500, { error: "Failed to read narrative-log" });
      }
      return;
    }

    // GET /species/:name/profile
    if (req.method === "GET" && parts[0] === "species" && parts[2] === "profile" && parts[1]) {
      if (!existsSync(profileOut)) {
        json(res, 404, { error: "Profile not found" });
        return;
      }
      try {
        const profile = JSON.parse(readFileSync(profileOut, "utf-8"));
        const name = decodeURIComponent(parts[1]);
        const entry = profile.species?.[name] ?? profile.global;
        if (!entry) {
          json(res, 404, { error: `Species '${name}' not found` });
          return;
        }
        json(res, 200, entry);
      } catch {
        json(res, 500, { error: "Failed to read profile" });
      }
      return;
    }

    // GET /species
    if (req.method === "GET" && parts[0] === "species" && parts.length === 1) {
      if (!existsSync(profileOut)) {
        json(res, 404, { error: "Profile not found" });
        return;
      }
      try {
        const raw = readFileSync(profileOut, "utf-8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(raw);
      } catch {
        json(res, 500, { error: "Failed to read profile" });
      }
      return;
    }

    // GET /generations/:id
    if (req.method === "GET" && parts[0] === "generations" && parts[1]) {
      const padded = parts[1].padStart(3, "0");
      const file = join(genDir, `gen-${padded}.json`);
      if (!existsSync(file)) {
        json(res, 404, { error: `Generation ${parts[1]} not found` });
        return;
      }
      try {
        const raw = readFileSync(file, "utf-8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(raw);
      } catch {
        json(res, 500, { error: "Failed to read generation" });
      }
      return;
    }

    // GET /generations
    if (req.method === "GET" && parts[0] === "generations" && parts.length === 1) {
      if (!existsSync(genDir)) {
        json(res, 200, { generations: [] });
        return;
      }
      try {
        const files = readdirSync(genDir)
          .filter(f => /^gen-\d+\.json$/.test(f))
          .sort()
          .reverse();
        const generations = files.map(f => {
          try {
            return JSON.parse(readFileSync(join(genDir, f), "utf-8"));
          } catch {
            return null;
          }
        }).filter(Boolean);
        json(res, 200, { generations });
      } catch {
        json(res, 500, { error: "Failed to read generations" });
      }
      return;
    }

    // GET /stats
    if (req.method === "GET" && parts[0] === "stats") {
      if (!existsSync(evalLog)) {
        json(res, 200, { sessions: 0, evaluations: 0, species: [] });
        return;
      }
      try {
        const raw = readFileSync(evalLog, "utf-8");
        let sessions = 0;
        let evaluations = 0;
        const speciesCount = new Map<string, number>();
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            sessions++;
            const n = Array.isArray(entry.evaluations) ? entry.evaluations.length : 0;
            evaluations += n;
            speciesCount.set(entry.loadout, (speciesCount.get(entry.loadout) ?? 0) + n);
          } catch { /* skip */ }
        }
        const species = [...speciesCount.entries()]
          .map(([name, count]) => ({ name, evaluations: count }))
          .sort((a, b) => b.evaluations - a.evaluations);
        json(res, 200, { sessions, evaluations, species });
      } catch {
        json(res, 500, { error: "Failed to read eval-log" });
      }
      return;
    }

    // 404
    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(port, () => {
    console.log(`[io-gateway] Listening on http://localhost:${port}`);
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
