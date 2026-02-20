/**
 * Sphere Project - Mock Metabolic Observer
 *
 * [Role] Observe sphere metabolism end-to-end:
 *   candidate → cooldown → amber → sanctification
 *
 * [Design] Wraps SwarmController with sphere state polling.
 *   - Pre-swarm state capture
 *   - Wave-based agent spawning (swarm → pause → swarm → ...)
 *   - Periodic sphere state polling (every N seconds)
 *   - Post-swarm watch period (through cooldown)
 *   - Final timeline report
 *
 * [Usage]
 *   npx tsx src/mock/mock-observer.ts
 *   npx tsx src/mock/mock-observer.ts --waves 3 --agents 5 --behavior boost
 *   npx tsx src/mock/mock-observer.ts --watch 600 --poll 10
 */

import { SwarmController, type SwarmConfig } from "./swarm-agent.js";

// ============================================================
// Configuration
// ============================================================

const DEFAULT_HTTP_URL = "http://localhost:3001";
const DEFAULT_WS_URL = "ws://localhost:8081";

const CANDIDATE_FLAG = 0x8000; // NodeFlag.Candidate

interface ObserverConfig {
  waves: number;         // Number of swarm waves
  waveDelay: number;     // ms between waves
  watchAfter: number;    // seconds to watch after all waves complete
  pollInterval: number;  // seconds between state polls
  swarm: Partial<SwarmConfig>;
}

const DEFAULT_CONFIG: ObserverConfig = {
  waves: 3,
  waveDelay: 10000,      // 10s between waves
  watchAfter: 360,       // 6 min (covers 5-min cooldown)
  pollInterval: 5,       // poll every 5s
  swarm: {
    agentCount: 5,
    behavior: "boost",
    maxDuration: 30000,
    batchSize: 5,
    batchDelay: 2000,
    spawnInterval: 100,
  },
};

// ============================================================
// Types
// ============================================================

interface SphereSnapshot {
  timestamp: number;
  elapsed: number;        // seconds since observation start
  phase: string;          // "pre" | "wave-N" | "cooldown" | "post"
  nodes: {
    active: number;
    amber: number;
    ghost: number;
    fossil: number;
    relic: number;
    environment: number;
    total: number;
  };
  averages: {
    heat: number;
    weight: number;
  };
  candidates: number;     // nodes with Candidate flag
  sanctification: {
    hard: { fired: boolean; progress: number; amberCount: number; target: number };
    soft: { fired: boolean; health: number };
    meta: { healthy: boolean; suspicion: number };
    metabolicMode: string;
    festival: boolean;
  } | null;
}

// ============================================================
// State Polling
// ============================================================

async function fetchNodeStats(httpUrl: string): Promise<SphereSnapshot["nodes"] & { averages: { heat: number; weight: number } }> {
  try {
    const res = await fetch(`${httpUrl}/nodes/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any;
    return {
      active: data.counts?.active ?? 0,
      amber: data.counts?.amber ?? 0,
      ghost: data.counts?.ghost ?? 0,
      fossil: data.counts?.fossil ?? 0,
      relic: data.counts?.relic ?? 0,
      environment: data.counts?.environment ?? 0,
      total: data.counts?.total ?? 0,
      averages: {
        heat: data.averages?.heat ?? 0,
        weight: data.averages?.weight ?? 0,
      },
    };
  } catch {
    return { active: 0, amber: 0, ghost: 0, fossil: 0, relic: 0, environment: 0, total: 0, averages: { heat: 0, weight: 0 } };
  }
}

async function fetchSanctification(httpUrl: string): Promise<SphereSnapshot["sanctification"]> {
  try {
    const res = await fetch(`${httpUrl}/sanctification`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (!data.hard) return null;
    return {
      hard: {
        fired: data.hard.fired,
        progress: data.hard.progress,
        amberCount: data.hard.amberCount,
        target: data.hard.target,
      },
      soft: {
        fired: data.soft.fired,
        health: data.soft.health,
      },
      meta: {
        healthy: data.meta.healthy,
        suspicion: data.meta.suspicion,
      },
      metabolicMode: data.metabolicMode,
      festival: data.festival,
    };
  } catch {
    return null;
  }
}

async function fetchCandidateCount(httpUrl: string): Promise<number> {
  try {
    const res = await fetch(`${httpUrl}/nodes/metrics`);
    if (!res.ok) return 0;
    const data = await res.json() as any;
    const nodes = data.nodes as Array<{ flags: number }>;
    return nodes.filter(n => (n.flags & CANDIDATE_FLAG) !== 0).length;
  } catch {
    return 0;
  }
}

async function captureSnapshot(
  httpUrl: string,
  startTime: number,
  phase: string
): Promise<SphereSnapshot> {
  const [nodeData, sanctData, candidates] = await Promise.all([
    fetchNodeStats(httpUrl),
    fetchSanctification(httpUrl),
    fetchCandidateCount(httpUrl),
  ]);

  return {
    timestamp: Date.now(),
    elapsed: Math.round((Date.now() - startTime) / 1000),
    phase,
    nodes: {
      active: nodeData.active,
      amber: nodeData.amber,
      ghost: nodeData.ghost,
      fossil: nodeData.fossil,
      relic: nodeData.relic,
      environment: nodeData.environment,
      total: nodeData.total,
    },
    averages: nodeData.averages,
    candidates,
    sanctification: sanctData,
  };
}

// ============================================================
// Display
// ============================================================

function printSnapshot(snap: SphereSnapshot, prev?: SphereSnapshot): void {
  const t = String(snap.elapsed).padStart(4) + "s";
  const phase = snap.phase.padEnd(12);

  // Delta indicators
  const amberDelta = prev ? snap.nodes.amber - prev.nodes.amber : 0;
  const candDelta = prev ? snap.candidates - prev.candidates : 0;
  const heatDelta = prev ? snap.averages.heat - prev.averages.heat : 0;

  const amberStr = amberDelta > 0 ? `\x1b[33m${snap.nodes.amber}(+${amberDelta})\x1b[0m`
    : amberDelta < 0 ? `\x1b[31m${snap.nodes.amber}(${amberDelta})\x1b[0m`
    : String(snap.nodes.amber);

  const candStr = candDelta > 0 ? `\x1b[36m${snap.candidates}(+${candDelta})\x1b[0m`
    : candDelta < 0 ? `\x1b[31m${snap.candidates}(${candDelta})\x1b[0m`
    : String(snap.candidates);

  const heatStr = heatDelta > 5 ? `\x1b[31m${snap.averages.heat.toFixed(0)}(+${heatDelta.toFixed(0)})\x1b[0m`
    : heatDelta < -5 ? `\x1b[34m${snap.averages.heat.toFixed(0)}(${heatDelta.toFixed(0)})\x1b[0m`
    : snap.averages.heat.toFixed(0);

  const sanct = snap.sanctification;
  const hardStr = sanct ? `H:${sanct.hard.fired ? "Y" : "N"}(${sanct.hard.amberCount}/${sanct.hard.target})` : "H:-";
  const softStr = sanct ? `S:${sanct.soft.fired ? "Y" : "N"}(${sanct.soft.health.toFixed(2)})` : "S:-";
  const metaStr = sanct ? `M:${sanct.meta.healthy ? "Y" : "N"}(${sanct.meta.suspicion.toFixed(3)})` : "M:-";
  const modeStr = sanct?.metabolicMode ?? "-";

  console.log(
    `  ${t} [${phase}] ` +
    `active=${snap.nodes.active} amber=${amberStr} cand=${candStr} ` +
    `h=${heatStr} w=${snap.averages.weight.toFixed(0)} | ` +
    `${hardStr} ${softStr} ${metaStr} mode=${modeStr}`
  );

  // Festival alert
  if (sanct?.festival) {
    console.log(`  ${"".padStart(4)}  \x1b[35m*** FESTIVAL DETECTED ***\x1b[0m`);
  }
}

function printTimeline(snapshots: SphereSnapshot[]): void {
  console.log("");
  console.log("=".repeat(90));
  console.log("  METABOLIC OBSERVATION TIMELINE");
  console.log("=".repeat(90));
  console.log("");

  if (snapshots.length < 2) {
    console.log("  Insufficient data points.");
    return;
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  console.log("  Duration:           " + last.elapsed + "s");
  console.log("  Snapshots:          " + snapshots.length);
  console.log("");

  // Summary table
  console.log("-".repeat(90));
  console.log("  Metric             Start      End        Delta");
  console.log("-".repeat(90));

  const rows = [
    ["Active nodes",    first.nodes.active,    last.nodes.active],
    ["Amber nodes",     first.nodes.amber,     last.nodes.amber],
    ["Candidates",      first.candidates,      last.candidates],
    ["Total nodes",     first.nodes.total,     last.nodes.total],
    ["Avg heat",        first.averages.heat,   last.averages.heat],
    ["Avg weight",      first.averages.weight, last.averages.weight],
  ];

  for (const [label, start, end] of rows) {
    const delta = (end as number) - (start as number);
    const deltaStr = delta > 0 ? `+${typeof start === 'number' && start % 1 !== 0 ? delta.toFixed(1) : delta}`
      : delta < 0 ? `${typeof start === 'number' && start % 1 !== 0 ? delta.toFixed(1) : delta}`
      : "0";
    console.log(
      `  ${(label as string).padEnd(20)} ` +
      `${String(typeof start === 'number' && start % 1 !== 0 ? (start as number).toFixed(1) : start).padStart(8)}   ` +
      `${String(typeof end === 'number' && end % 1 !== 0 ? (end as number).toFixed(1) : end).padStart(8)}   ` +
      `${deltaStr.padStart(8)}`
    );
  }
  console.log("-".repeat(90));

  // Sanctification comparison
  const firstSanct = first.sanctification;
  const lastSanct = last.sanctification;
  if (firstSanct && lastSanct) {
    console.log("");
    console.log("  Sanctification Triangle");
    console.log("-".repeat(90));
    console.log(`  Hard neuron:   ${firstSanct.hard.fired ? "FIRED" : "idle"} → ${lastSanct.hard.fired ? "FIRED" : "idle"}  (amber: ${firstSanct.hard.amberCount} → ${lastSanct.hard.amberCount}/${lastSanct.hard.target})`);
    console.log(`  Soft neuron:   health ${firstSanct.soft.health.toFixed(3)} → ${lastSanct.soft.health.toFixed(3)}  (fired: ${lastSanct.soft.fired})`);
    console.log(`  Meta neuron:   suspicion ${firstSanct.meta.suspicion.toFixed(4)} → ${lastSanct.meta.suspicion.toFixed(4)}  (healthy: ${lastSanct.meta.healthy})`);
    console.log(`  Mode:          ${firstSanct.metabolicMode} → ${lastSanct.metabolicMode}`);
    console.log("-".repeat(90));
  }

  // Key events
  console.log("");
  console.log("  Key Events");
  console.log("-".repeat(90));

  let prevSnap: SphereSnapshot | undefined;
  for (const snap of snapshots) {
    if (prevSnap) {
      const amberDelta = snap.nodes.amber - prevSnap.nodes.amber;
      const candDelta = snap.candidates - prevSnap.candidates;

      if (amberDelta > 0) {
        console.log(`  ${String(snap.elapsed).padStart(4)}s  +${amberDelta} amber (total: ${snap.nodes.amber})`);
      }
      if (amberDelta < 0) {
        console.log(`  ${String(snap.elapsed).padStart(4)}s  ${amberDelta} amber erosion (total: ${snap.nodes.amber})`);
      }
      if (candDelta > 0) {
        console.log(`  ${String(snap.elapsed).padStart(4)}s  +${candDelta} candidates registered (total: ${snap.candidates})`);
      }
      if (candDelta < 0 && amberDelta === 0) {
        console.log(`  ${String(snap.elapsed).padStart(4)}s  ${candDelta} candidate dropout (total: ${snap.candidates})`);
      }
      if (snap.sanctification?.festival && !prevSnap.sanctification?.festival) {
        console.log(`  ${String(snap.elapsed).padStart(4)}s  *** FESTIVAL STARTED ***`);
      }
      if (!snap.sanctification?.festival && prevSnap.sanctification?.festival) {
        console.log(`  ${String(snap.elapsed).padStart(4)}s  *** FESTIVAL ENDED ***`);
      }
      if (snap.sanctification?.metabolicMode !== prevSnap.sanctification?.metabolicMode) {
        console.log(`  ${String(snap.elapsed).padStart(4)}s  Mode: ${prevSnap.sanctification?.metabolicMode} → ${snap.sanctification?.metabolicMode}`);
      }
    }
    prevSnap = snap;
  }

  console.log("-".repeat(90));
  console.log("");
  console.log("=".repeat(90));
}

// ============================================================
// Main Observer
// ============================================================

async function observe(config: ObserverConfig, httpUrl: string, wsUrl: string): Promise<void> {
  const startTime = Date.now();
  const snapshots: SphereSnapshot[] = [];

  console.log("");
  console.log("=".repeat(90));
  console.log("  SPHERE METABOLIC OBSERVER");
  console.log("=".repeat(90));
  console.log(`  Waves:            ${config.waves}`);
  console.log(`  Agents/wave:      ${config.swarm.agentCount ?? 5}`);
  console.log(`  Behavior:         ${config.swarm.behavior ?? "boost"}`);
  console.log(`  Wave delay:       ${config.waveDelay}ms`);
  console.log(`  Post-watch:       ${config.watchAfter}s`);
  console.log(`  Poll interval:    ${config.pollInterval}s`);
  console.log(`  HTTP:             ${httpUrl}`);
  console.log(`  WS:               ${wsUrl}`);
  console.log("=".repeat(90));
  console.log("");

  // --- Phase 0: Pre-swarm snapshot ---
  console.log("[Observer] Capturing initial state...");
  const initial = await captureSnapshot(httpUrl, startTime, "pre");
  snapshots.push(initial);
  printSnapshot(initial);

  if (initial.nodes.total === 0) {
    console.log("[Observer] WARNING: Sphere has 0 nodes. Seed data may not be loaded.");
  }

  // --- Start background polling ---
  let currentPhase = "pre";
  const pollTimer = setInterval(async () => {
    try {
      const snap = await captureSnapshot(httpUrl, startTime, currentPhase);
      snapshots.push(snap);
      printSnapshot(snap, snapshots[snapshots.length - 2]);
    } catch {
      // Silently skip failed polls
    }
  }, config.pollInterval * 1000);

  // --- Phase 1: Swarm waves ---
  for (let wave = 1; wave <= config.waves; wave++) {
    currentPhase = `wave-${wave}`;
    console.log("");
    console.log(`[Observer] === Wave ${wave}/${config.waves} ===`);

    const swarm = new SwarmController(config.swarm, httpUrl, wsUrl);
    await swarm.spawn();

    // Brief pause between waves
    if (wave < config.waves) {
      console.log(`[Observer] Wave ${wave} complete. Waiting ${config.waveDelay / 1000}s before next wave...`);
      await delay(config.waveDelay);
    }
  }

  // --- Phase 2: Post-swarm watch (cooldown observation) ---
  currentPhase = "cooldown";
  console.log("");
  console.log(`[Observer] All waves complete. Watching for ${config.watchAfter}s (cooldown observation)...`);
  console.log(`[Observer] Cooldown period: candidates must survive ~5min to become amber.`);

  const watchEnd = Date.now() + config.watchAfter * 1000;

  while (Date.now() < watchEnd) {
    await delay(config.pollInterval * 1000);

    // Check for festival (sanctification in progress)
    const latest = snapshots[snapshots.length - 1];
    if (latest?.sanctification?.festival) {
      console.log(`[Observer] Festival detected at ${latest.elapsed}s - sanctification in progress!`);
    }
  }

  // --- Phase 3: Final snapshot ---
  currentPhase = "post";
  clearInterval(pollTimer);

  const final = await captureSnapshot(httpUrl, startTime, "post");
  snapshots.push(final);

  console.log("");
  console.log("[Observer] Final state:");
  printSnapshot(final, initial);

  // --- Timeline report ---
  printTimeline(snapshots);
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// CLI
// ============================================================

function parseArgs(): ObserverConfig {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG, swarm: { ...DEFAULT_CONFIG.swarm } };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--waves":
      case "-W":
        config.waves = parseInt(args[++i], 10) || 3;
        break;
      case "--wave-delay":
        config.waveDelay = parseInt(args[++i], 10) || 10000;
        break;
      case "--watch":
      case "-w":
        config.watchAfter = parseInt(args[++i], 10) || 360;
        break;
      case "--poll":
      case "-p":
        config.pollInterval = parseInt(args[++i], 10) || 5;
        break;
      case "--agents":
      case "-n":
        config.swarm.agentCount = parseInt(args[++i], 10) || 5;
        break;
      case "--behavior":
      case "-b":
        const b = args[++i];
        if (b === "random" || b === "focused" || b === "distributed" || b === "boost") {
          config.swarm.behavior = b;
        }
        break;
      case "--topic":
      case "-t":
        config.swarm.topic = args[++i];
        config.swarm.behavior = "focused";
        break;
      case "--duration":
      case "-d":
        config.swarm.maxDuration = parseInt(args[++i], 10) || 30000;
        break;
      case "--fast":
        // Fast mode: short durations for quick testing
        config.swarm.maxDuration = 15000;
        config.watchAfter = 60;
        config.waveDelay = 5000;
        break;
      case "--help":
      case "-h":
        console.log(`
Sphere Metabolic Observer - Swarm + State Observation

Usage:
  npx tsx src/mock/mock-observer.ts [options]

Observer Options:
  -W, --waves <num>       Number of swarm waves (default: 3)
      --wave-delay <ms>   Delay between waves (default: 10000)
  -w, --watch <sec>       Post-swarm watch period in seconds (default: 360)
  -p, --poll <sec>        State poll interval in seconds (default: 5)
      --fast              Quick test mode (15s duration, 60s watch)

Swarm Options:
  -n, --agents <num>      Agents per wave (default: 5)
  -b, --behavior <type>   random, focused, distributed, boost (default: boost)
  -t, --topic <query>     Focus topic (sets behavior to focused)
  -d, --duration <ms>     Max exploration duration per agent (default: 30000)

Examples:
  npx tsx src/mock/mock-observer.ts                          # Default: 3 waves, 5 boost agents
  npx tsx src/mock/mock-observer.ts -W 5 -n 10 -w 600       # Heavy: 5 waves of 10, watch 10min
  npx tsx src/mock/mock-observer.ts --fast                   # Quick test run
  npx tsx src/mock/mock-observer.ts -b focused -t "量子力学" # Focused on topic
`);
        process.exit(0);
    }
  }

  return config;
}

// ============================================================
// Entry
// ============================================================

if (process.argv[1]?.endsWith("mock-observer.ts") || process.argv[1]?.endsWith("mock-observer.js")) {
  const config = parseArgs();
  const httpUrl = process.env.HTTP_URL || DEFAULT_HTTP_URL;
  const wsUrl = process.env.WS_URL || DEFAULT_WS_URL;

  observe(config, httpUrl, wsUrl)
    .then(() => {
      console.log("[Observer] Observation complete.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[Observer] Fatal error:", error);
      process.exit(1);
    });
}

export { observe, ObserverConfig };
