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
//   GET  /species/:name/profile  — 種族プロファイル
//   GET  /species                — 全種族プロファイル
//   GET  /generations            — 世代一覧
//   GET  /generations/:id        — 単一世代
//   GET  /stats                  — eval-log 集計
//   GET  /health                 — ヘルスチェック

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface GatewayConfig {
  dataDir: string;
  evalLog: string;
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
  const { evalLog, profileOut, genDir } = config;

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

    const parts = (req.url ?? "/").split("/").filter(Boolean);

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
    console.log(`[io-gateway] GET  /species            — all species profiles`);
    console.log(`[io-gateway] GET  /species/:name/profile — single species`);
    console.log(`[io-gateway] GET  /generations        — generation archive`);
    console.log(`[io-gateway] GET  /stats              — eval-log statistics`);
    console.log(`[io-gateway] GET  /health             — health check`);
  });
}
