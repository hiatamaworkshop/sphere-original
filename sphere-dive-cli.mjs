#!/usr/bin/env node
/**
 * Sphere Dive CLI — Stateless command-line client for AI agents
 *
 * Usage:
 *   node sphere-dive-cli.mjs dive "consciousness and AI"
 *   node sphere-dive-cli.mjs dive "quantum mechanics" --tags physics,science
 *   node sphere-dive-cli.mjs sense                        # sense at current position
 *   node sphere-dive-cli.mjs focus <nodeId>               # inspect a node
 *   node sphere-dive-cli.mjs evaluate <nodeId> 8 7 5      # h w d
 *   node sphere-dive-cli.mjs move hot                     # random|hot|fresh|deep|explore
 *   node sphere-dive-cli.mjs warp <nodeId>                # jump to node
 *   node sphere-dive-cli.mjs return                       # exit dive → vestibule
 *   node sphere-dive-cli.mjs acknowledge                  # close session
 *   node sphere-dive-cli.mjs explore "query"              # HTTP-only quick search
 *   node sphere-dive-cli.mjs status                       # sphere status
 *   node sphere-dive-cli.mjs full-dive "query"            # automated full exploration
 *
 * Session state is persisted to .sphere-session.json in cwd.
 * The "full-dive" command runs an automated Tutorial→Sanctuary→Core cycle.
 *
 * Environment:
 *   SPHERE_HTTP=http://localhost:3001
 *   SPHERE_WS=ws://localhost:3001
 */

import { WebSocket } from "ws";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";

const HTTP = process.env.SPHERE_HTTP || "http://localhost:3001";
const WS_URL = process.env.SPHERE_WS || "ws://localhost:3001";
const SESSION_FILE = ".sphere-session.json";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Rate limit guard: max 2 actions/sec to stay under 3/sec limit
const throttle = () => sleep(500);

// ─── Session persistence ──────────────────────────────────────────

function loadSession() {
  try {
    if (existsSync(SESSION_FILE)) {
      return JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
    }
  } catch { /* ignore */ }
  return null;
}

function saveSession(data) {
  writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
}

function clearSession() {
  try { unlinkSync(SESSION_FILE); } catch { /* ignore */ }
}

// ─── HTTP helpers ─────────────────────────────────────────────────

async function httpGet(path) {
  const res = await fetch(`${HTTP}${path}`);
  return res.json();
}

async function httpPost(path, body) {
  const res = await fetch(`${HTTP}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ─── WebSocket helpers ────────────────────────────────────────────

function wsConnect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
    setTimeout(() => reject(new Error("WS connect timeout")), 10000);
  });
}

let reqCounter = 0;

function wsSend(ws, type, payload = {}) {
  const requestId = `cli_${++reqCounter}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${type} timeout`)), 15000);

    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      // Match by requestId or by known response types
      if (msg.requestId === requestId ||
          (type === "entry" && (msg.type === "positioned" || msg.type === "entryError")) ||
          (type === "return" && msg.type === "vestibuleEntered") ||
          (type === "acknowledge" && msg.type === "farewell") ||
          msg.type === "expelled" || msg.type === "error") {

        // For entry, we might get processing/amber first — keep waiting for positioned
        if (type === "entry" && msg.type !== "positioned" && msg.type !== "entryError" && msg.type !== "error") {
          console.log(`  [${msg.type}] ${msg.message || JSON.stringify(msg).substring(0, 100)}`);
          return; // keep listening
        }

        clearTimeout(timeout);
        ws.off("message", handler);
        if (msg.type === "error" || msg.type === "entryError" || msg.type === "expelled") {
          reject(new Error(JSON.stringify(msg)));
        } else {
          resolve(msg);
        }
      } else {
        // Log other messages (bus_message, warning, etc.)
        if (msg.type !== "welcome") {
          console.log(`  [${msg.type}] ${msg.message || msg.reason || ""}`);
        }
      }
    };

    ws.on("message", handler);
    ws.send(JSON.stringify({ type, requestId, ...payload }));
  });
}

// Wait for welcome message (no requestId)
function wsWaitWelcome(ws) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("welcome timeout")), 10000);
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "welcome") {
        clearTimeout(timeout);
        ws.off("message", handler);
        resolve(msg);
      }
    };
    ws.on("message", handler);
  });
}

// ─── Pretty print ─────────────────────────────────────────────────

function printNode(n, indent = "") {
  const dist = n.distance !== undefined ? ` (dist: ${n.distance.toFixed(3)})` : "";
  const heat = n.heat !== undefined ? ` heat:${n.heat.toFixed(0)}` : "";
  const kind = n.kind || "";
  console.log(`${indent}[${kind}] ${n.id?.substring(0, 12)}..${dist}${heat}`);
  console.log(`${indent}  ${n.summary || "(no summary)"}`);
  if (n.tags?.length) console.log(`${indent}  tags: ${n.tags.join(", ")}`);
  if (n.content || n.payload) {
    const text = (n.content || n.payload || "").substring(0, 200);
    console.log(`${indent}  ${text}${text.length >= 200 ? "..." : ""}`);
  }
}

function printNodes(nodes, label) {
  console.log(`\n${label} (${nodes.length} nodes):`);
  console.log("─".repeat(60));
  for (const n of nodes) {
    printNode(n, "  ");
    console.log();
  }
}

// ─── Commands ─────────────────────────────────────────────────────

async function cmdStatus() {
  const [health, stats, status] = await Promise.all([
    httpGet("/health"),
    httpGet("/nodes/stats"),
    httpGet("/sphere/status"),
  ]);
  console.log("Sphere Health:", JSON.stringify(health));
  console.log("Node Stats:", JSON.stringify(stats.counts));
  console.log("Sphere ID:", status.sphereId || "(unknown)");
}

async function cmdExplore(query, limit = 10) {
  const data = await httpGet(`/sphere/explore?q=${encodeURIComponent(query)}&limit=${limit}&radius=1.5`);
  printNodes(data.results || [], `Explore: "${query}"`);
  console.log(`Total matched: ${data.meta?.matched || 0} / ${data.meta?.total || 0}`);
}

async function cmdDive(query, tags = []) {
  console.log(`Requesting dive ticket...`);
  const ticket = await httpPost("/dive/request");
  if (!ticket.success) {
    console.error("Ticket failed:", ticket);
    return;
  }
  console.log(`Ticket: ${ticket.ticket.token.substring(0, 12)}...`);

  // Fetch rulebook
  const rulebook = await httpGet("/rulebook");
  console.log(`Rulebook v${rulebook.version} loaded`);

  // Connect WebSocket
  console.log(`Connecting WebSocket...`);
  const ws = await wsConnect(ticket.ticket.token);
  const welcome = await wsWaitWelcome(ws);
  console.log(`Session: ${welcome.sessionId}`);

  // Send entry
  console.log(`Entering with query: "${query}"`);
  const positioned = await wsSend(ws, "entry", {
    request: { query, tags: tags.length ? tags : ["explore"] }
  });

  const pos = positioned.position || [];
  const posStr = pos.length >= 3
    ? `(${(pos[0]*100).toFixed(1)}, ${(pos[1]*100).toFixed(1)}, ${(pos[2]*100).toFixed(1)})`
    : `(${pos.length}-dim)`;
  console.log(`\nPositioned at ${posStr} (${pos.length}-dim)`);
  console.log(`Remaining time: ${positioned.remainingTime}s`);
  console.log(`Layer: Tutorial`);

  // Save session
  saveSession({
    sessionId: welcome.sessionId,
    token: ticket.ticket.token,
    query,
    tags,
    layer: "tutorial",
    timestamp: Date.now(),
  });

  // Keep ws alive for subsequent commands
  // For CLI usage, we do an initial sense then hold
  const sense = await wsSend(ws, "sense", { radius: 2 });
  printNodes(sense.nodes || [], "Nearby nodes (sense)");

  // Save ws reference for interactive use
  return { ws, sessionId: welcome.sessionId };
}

async function cmdFullDive(query, tags = []) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  FULL DIVE: "${query}"`);
  console.log(`${"═".repeat(60)}\n`);

  // 1. Get ticket
  const ticket = await httpPost("/dive/request");
  if (!ticket.success) { console.error("Ticket failed:", ticket); return; }
  console.log(`[ticket] ${ticket.ticket.token.substring(0, 12)}...`);

  // 2. Rulebook
  const rulebook = await httpGet("/rulebook");
  console.log(`[rulebook] v${rulebook.version}`);

  // 3. Connect
  const ws = await wsConnect(ticket.ticket.token);
  const welcome = await wsWaitWelcome(ws);
  console.log(`[session] ${welcome.sessionId.substring(0, 12)}...`);

  // 4. Entry
  const positioned = await wsSend(ws, "entry", {
    request: { query, tags: tags.length ? tags : ["explore"] }
  });
  const pos = positioned.position || [];
  console.log(`[positioned] ${pos.length}-dim, remaining: ${positioned.remainingTime}s`);

  // ── Tutorial Layer (scan L1 for broad survey) ──
  console.log(`\n── Tutorial Layer ──`);
  const scan1 = await wsSend(ws, "scan", { radius: 3 });
  const nodes1 = scan1.nodes || [];
  console.log(`[scan] ${nodes1.length} nodes found (L1 tags only)`);
  for (const n of nodes1.slice(0, 5)) {
    console.log(`  ${n.id?.substring(0, 12)}.. [${n.kind}] dist:${n.distance?.toFixed(3)} tags:[${(n.tags || []).join(",")}]`);
  }

  // Focus on closest nodes for detail
  const focusResults = [];
  for (const n of nodes1.slice(0, 3)) {
    try {
      await throttle();
      const f = await wsSend(ws, "focus", { nodeId: n.id });
      focusResults.push(f);
      printNode(f.node, "  [focus] ");
      console.log();
    } catch (e) {
      console.log(`  [focus failed] ${e.message}`);
    }
  }

  // Move around
  for (const mode of ["hot", "fresh", "explore"]) {
    try {
      await throttle();
      const m = await wsSend(ws, "move", { mode, step: 0.3 });
      console.log(`[move:${mode}] success=${m.result?.success} dist=${m.result?.distance?.toFixed(3) || "?"}`);
    } catch (e) {
      console.log(`[move:${mode}] ${e.message}`);
    }
  }

  // Scan again after moving
  await throttle();
  const scan2 = await wsSend(ws, "scan", { radius: 3 });
  console.log(`[scan after move] ${(scan2.nodes || []).length} nodes`);
  for (const n of (scan2.nodes || []).slice(0, 3)) {
    console.log(`  ${n.id?.substring(0, 12)}.. [${n.kind}] dist:${n.distance?.toFixed(3)} tags:[${(n.tags || []).join(",")}]`);
  }

  // ── Sanctuary Layer (scan L1) ──
  console.log(`\n── Sanctuary Layer ──`);
  try {
    await throttle();
    const sanc = await wsSend(ws, "enterSanctuary", {});
    console.log(`[layer] ${sanc.layer}: ${sanc.message}`);
  } catch (e) {
    console.log(`[sanctuary] ${e.message}`);
  }

  await throttle();
  const scan3 = await wsSend(ws, "scan", { radius: 3 });
  console.log(`[sanctuary scan] ${(scan3.nodes || []).length} nodes`);
  for (const n of (scan3.nodes || []).slice(0, 3)) {
    console.log(`  ${n.id?.substring(0, 12)}.. [${n.kind}] dist:${n.distance?.toFixed(3)} tags:[${(n.tags || []).join(",")}]`);
  }

  // ── Core Layer (sense L1+L2 for evaluation) ──
  console.log(`\n── Core Layer ──`);
  try {
    await throttle();
    const core = await wsSend(ws, "enterCore", {});
    console.log(`[layer] ${core.layer}: ${core.message}`);
  } catch (e) {
    console.log(`[core] ${e.message}`);
  }

  // Core: sense (L1+L2), focus, evaluate
  await throttle();
  const sense4 = await wsSend(ws, "sense", { radius: 3 });
  const coreNodes = sense4.nodes || [];
  printNodes(coreNodes.slice(0, 5), "Core sense (L1+L2)");

  // Evaluate top nodes in Core (evaluations count here)
  const evaluations = [];
  for (const n of coreNodes.slice(0, 3)) {
    try {
      await throttle();
      const f = await wsSend(ws, "focus", { nodeId: n.id });
      printNode(f.node, "  [core-focus] ");

      // Simple heuristic evaluation
      const h = Math.min(10, Math.round(10 - n.distance * 10)); // closer = hotter
      const w = Math.min(10, Math.round(n.weight / 20));        // weight-based
      const d = Math.min(10, Math.round(n.heat / 100));         // heat-based

      await throttle();
      const ev = await wsSend(ws, "evaluate", { nodeId: n.id, h, w, d });
      evaluations.push({ nodeId: n.id, h, w, d, success: ev.success });
      console.log(`  [evaluate] h=${h} w=${w} d=${d} → ${ev.success ? "ok" : ev.reason}`);
      console.log();
    } catch (e) {
      console.log(`  [eval failed] ${e.message}`);
    }
  }

  // ── Return ──
  console.log(`\n── Returning ──`);
  try {
    await throttle();
    const ret = await wsSend(ws, "return", {});
    console.log(`[vestibule] evaluations applied: ${ret.auto?.evaluationsApplied}`);
    console.log(`[vestibule] auto capsule: ${ret.auto?.autoCapsuleSaved}`);
    console.log(`[farewell] ${ret.farewell}`);

    // View trail
    try {
      const trail = await wsSend(ws, "viewTrail", {});
      console.log(`\n[trail] ${JSON.stringify(trail.data).substring(0, 300)}`);
    } catch { /* optional */ }

    // Acknowledge
    try {
      await wsSend(ws, "acknowledge", {});
      console.log(`[acknowledged] Session complete.`);
    } catch { /* ws may close */ }
  } catch (e) {
    console.log(`[return] ${e.message}`);
  }

  ws.close();
  clearSession();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  DIVE COMPLETE`);
  console.log(`  Nodes scanned: ${nodes1.length + (scan2.nodes?.length || 0) + (scan3.nodes?.length || 0) + coreNodes.length}`);
  console.log(`  Nodes focused: ${focusResults.length + evaluations.length}`);
  console.log(`  Evaluations: ${evaluations.length}`);
  console.log(`${"═".repeat(60)}`);
}

// ─── Main ─────────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;

try {
  switch (cmd) {
    case "status":
      await cmdStatus();
      break;

    case "explore":
      await cmdExplore(args[0] || "knowledge", parseInt(args[1]) || 10);
      break;

    case "dive":
      const tagIdx = args.indexOf("--tags");
      const diveTags = tagIdx >= 0 ? args[tagIdx + 1]?.split(",") : [];
      const diveQuery = tagIdx < 0 ? args.join(" ") : args.filter((_, i) => i !== tagIdx && i !== tagIdx + 1).join(" ") || "explore sphere";
      const session = await cmdDive(diveQuery, diveTags);
      if (session?.ws) {
        // Interactive mode: keep alive for 30s then close
        console.log("\nSession active. Closing in 5s...");
        setTimeout(() => {
          session.ws.close();
          process.exit(0);
        }, 5000);
      }
      break;

    case "full-dive": {
      const ftIdx = args.indexOf("--tags");
      const ftTags = ftIdx >= 0 ? args[ftIdx + 1]?.split(",") : [];
      const ftQuery = ftIdx < 0 ? args.join(" ") : args.filter((_, i) => i !== ftIdx && i !== ftIdx + 1).join(" ") || "explore knowledge";
      await cmdFullDive(ftQuery, ftTags);
      process.exit(0);
      break;
    }

    default:
      console.log(`Sphere Dive CLI
Usage:
  node sphere-dive-cli.mjs status                  # health check
  node sphere-dive-cli.mjs explore "query"          # HTTP search
  node sphere-dive-cli.mjs dive "query" [--tags a,b]  # start dive session
  node sphere-dive-cli.mjs full-dive "query"        # automated full exploration

Environment:
  SPHERE_HTTP=http://localhost:3001
  SPHERE_WS=ws://localhost:3001`);
  }
} catch (e) {
  console.error("Error:", e.message || e);
  process.exit(1);
}