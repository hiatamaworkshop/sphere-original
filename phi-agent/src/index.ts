// ============================================================
// phi-agent — Entry point
// ============================================================
//
// Usage:
//   npx tsx src/index.ts                               # default: evaluate only
//   npx tsx src/index.ts "AI safety"                    # custom query
//   npx tsx src/index.ts "metabolism" --cycles 20       # more cycles
//   npx tsx src/index.ts "physics" --loadout scholar    # personality
//   npx tsx src/index.ts "query" --response             # evaluate + response
//   npx tsx src/index.ts "query" --no-evaluate --response  # response only (old liaison)
//
// Environment:
//   OLLAMA_HOST    ollama API URL (default: http://localhost:11434)
//   OLLAMA_MODEL   model name (default: phi3:mini)
//   SPHERE_URL     periphery HTTP URL (default: http://localhost:3001)
//   SPHERE_WS      periphery WebSocket URL (default: ws://localhost:3001)
//   EVALUATE       true/false (default: true)
//   RESPONSE       true/false (default: false)
//   STREAM         true/false (default: false, future)

import type { LlmClient } from "./llm-client.js";
import { OllamaClient } from "./ollama-client.js";
import { HfInferenceClient } from "./hf-client.js";
import { SphereClient } from "./sphere-client.js";
import { PhiAgent } from "./agent.js";
import { LOADOUTS } from "./fast-gate.js";
import type { LoadoutName } from "./fast-gate.js";
import { getSpeciesSummary } from "./eval-log.js";

function createLlmClient(): LlmClient {
  const backend = process.env.LLM_BACKEND || "ollama";
  if (backend === "huggingface") {
    return new HfInferenceClient();
  }
  return new OllamaClient();
}

const VALID_LOADOUTS = Object.keys(LOADOUTS) as LoadoutName[];

// Diverse query pool for daemon mode rotation
// Covers all mock_data categories: academic, CS, psychology, menial, trending
const QUERY_POOL = [
  // Academic / Theory
  "fundamental mathematics",
  "quantum physics concepts",
  "formal logic and proofs",
  // CS / Tech
  "algorithm design patterns",
  "distributed systems",
  "cryptography and security",
  // Psychology / Social
  "cognitive biases and perception",
  "social behavior patterns",
  // Trending / Current
  "trending viral discussions",
  "emerging technology shifts",
  // Menial / Everyday
  "everyday curious observations",
  "random trivia and fun facts",
  "life's small mysteries",
  "kitchen science and food",
  "pet behavior and animal quirks",
  // General / Cross-domain
  "knowledge exploration",
  "cross-disciplinary connections",
  "philosophical foundations",
  "cultural phenomena and traditions",
];

interface ParsedArgs {
  query: string;
  queryExplicit: boolean;
  cycles: number;
  loadout: LoadoutName;
  randomLoadout: boolean;
  evaluate: boolean;
  response: boolean;
  stream: boolean;
  debug: boolean;
  daemon: boolean;
  daemonSleepMs: number;
}

// --- CLI args + env vars (CLI > env > defaults) ---
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let query = "knowledge exploration";
  let queryExplicit = false;
  let cycles = 10;
  let loadout: LoadoutName | "random" = "balanced";
  let evaluate = true;
  let response = false;
  let stream = false;
  let debug = true;
  let daemon = false;
  let daemonSleepMs = 30_000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cycles" && args[i + 1]) {
      cycles = parseInt(args[i + 1], 10);
      i++;
    } else if ((args[i] === "--loadout" || args[i] === "--preset") && args[i + 1]) {
      const p = args[i + 1];
      if (p === "random" || VALID_LOADOUTS.includes(p as LoadoutName)) {
        loadout = p as LoadoutName | "random";
      } else {
        console.log(`Unknown loadout "${p}", using "balanced". Available: ${VALID_LOADOUTS.join(", ")}, random`);
      }
      i++;
    } else if (args[i] === "--no-evaluate") {
      evaluate = false;
    } else if (args[i] === "--response") {
      response = true;
    } else if (args[i] === "--stream") {
      stream = true;
    } else if (args[i] === "--daemon") {
      daemon = true;
    } else if (args[i] === "--sleep" && args[i + 1]) {
      daemonSleepMs = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--quiet") {
      debug = false;
    } else if (!args[i].startsWith("--")) {
      query = args[i];
      queryExplicit = true;
    }
  }

  // Env var fallbacks (CLI > env > defaults)
  if (process.env.QUERY && !queryExplicit) {
    query = process.env.QUERY;
    queryExplicit = true;
  }
  if (process.env.CYCLES) cycles = parseInt(process.env.CYCLES, 10) || cycles;
  if (process.env.LOADOUT) {
    const envL = process.env.LOADOUT;
    if (envL === "random" || VALID_LOADOUTS.includes(envL as LoadoutName)) {
      loadout = envL as LoadoutName | "random";
    }
  }
  if (process.env.EVALUATE === "false") evaluate = false;
  if (process.env.RESPONSE === "true") response = true;
  if (process.env.STREAM === "true") stream = true;
  if (process.env.DAEMON === "true") daemon = true;
  if (process.env.DAEMON_SLEEP_MS) daemonSleepMs = parseInt(process.env.DAEMON_SLEEP_MS, 10) || daemonSleepMs;
  if (process.env.DEBUG === "false") debug = false;

  // Resolve "random" → pick a random loadout (remember flag for daemon re-random)
  const isRandom = loadout === "random";
  const resolvedLoadout: LoadoutName = isRandom
    ? VALID_LOADOUTS[Math.floor(Math.random() * VALID_LOADOUTS.length)]
    : loadout;

  return { query, queryExplicit, cycles, loadout: resolvedLoadout, randomLoadout: isRandom, evaluate, response, stream, debug, daemon, daemonSleepMs };
}

async function runOnce(config: ParsedArgs): Promise<number> {
  const { query, cycles, loadout, evaluate, response, stream, debug } = config;
  const l = LOADOUTS[loadout];

  const flags = [
    evaluate ? "evaluate" : null,
    response ? "response" : null,
    stream ? "stream" : null,
  ].filter(Boolean).join("+") || "observe-only";

  console.log("========================================");
  console.log("  phi-agent — Sphere Coupling Service");
  console.log("========================================");
  console.log(`Query:   "${query}"`);
  console.log(`Loadout: ${l.name} (walk: ${l.walkPreference}, minCycles: ${l.minCycles})`);
  console.log(`Quality: [${l.qualityVector.map(v => v.toFixed(1)).join(", ")}]`);
  console.log(`Return:  [${l.returnWeights.map(v => v.toFixed(1)).join(", ")}] (sat,frust,stam,stale)`);
  console.log(`Cycles:  ${cycles}`);
  console.log(`Flags:   ${flags}`);
  if (config.daemon) console.log(`Daemon:  sleep ${config.daemonSleepMs}ms between runs`);
  console.log();

  const ollama = createLlmClient();
  // Ollama-specific: auto-pull model if not present
  if (ollama instanceof OllamaClient) {
    await ollama.ensureModel();
  }
  const sphere = new SphereClient();

  // Event logging
  sphere.onEvent((event) => {
    if (debug) {
      console.log(`[sphere] ${event.type}`, "sessionId" in event ? event.sessionId : "");
    }
  });

  const agent = new PhiAgent(ollama, sphere, {
    query,
    loadout,
    evaluate,
    response,
    stream,
    maxCycles: cycles,
    debug,
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[phi-agent] Stopping...");
    agent.stop();
  });

  const stats = await agent.run();

  console.log();
  console.log("========================================");
  console.log("  Results");
  console.log("========================================");
  console.log(`Status:      ${stats.status}`);
  console.log(`Cycles:      ${stats.cycles}`);
  console.log(`Examined:    ${stats.nodesExamined} nodes`);
  console.log(`Evaluations: ${stats.evaluations}`);
  console.log(`Heat delta:  ${stats.totalHeatDelta > 0 ? "+" : ""}${stats.totalHeatDelta}`);
  console.log(`Duration:    ${((stats.endTime - stats.startTime) / 1000).toFixed(1)}s`);

  if (stats.error) {
    console.log(`Error:       ${stats.error}`);
  }

  // Species memory summary
  const species = getSpeciesSummary(loadout);
  if (species.sessions > 0) {
    console.log();
    console.log("--- Species Memory ---");
    console.log(`Sessions:    ${species.sessions} (${species.loadout})`);
    console.log(`Total evals: ${species.totalEvals}`);
    console.log(`Avg scores:  h=${species.avgH.toFixed(1)} w=${species.avgW.toFixed(1)} d=${species.avgD.toFixed(1)}`);
    if (species.hotNodes.length > 0) {
      console.log(`Hot nodes:   ${species.hotNodes.map(n => `${n.nodeId.slice(0, 8)}(×${n.count})`).join(", ")}`);
    }
    if (species.commonTags.length > 0) {
      console.log(`Common tags: ${species.commonTags.slice(0, 5).map(t => t.tag).join(", ")}`);
    }
  }

  return stats.status === "completed" ? 0 : 1;
}

async function main(): Promise<void> {
  const config = parseArgs();

  if (!config.daemon) {
    // Single run mode (original behavior)
    const code = await runOnce(config);
    process.exit(code);
  }

  // Daemon mode: run → sleep → repeat
  console.log(`[phi-agent] Daemon mode — will run indefinitely (sleep ${config.daemonSleepMs}ms between runs)`);
  if (!config.queryExplicit) {
    console.log(`[phi-agent] Query rotation enabled (${QUERY_POOL.length} queries in pool)`);
  }
  let session = 0;
  while (true) {
    session++;
    // Re-randomize loadout each session if original was "random"
    if (config.randomLoadout) {
      config.loadout = VALID_LOADOUTS[Math.floor(Math.random() * VALID_LOADOUTS.length)];
    }
    // Rotate query each session if not explicitly set
    if (!config.queryExplicit) {
      config.query = QUERY_POOL[Math.floor(Math.random() * QUERY_POOL.length)];
    }
    console.log(`\n[phi-agent] === Session ${session} (${config.loadout}) ===`);
    try {
      await runOnce(config);
    } catch (err) {
      console.error(`[phi-agent] Session ${session} error:`, err);
    }
    console.log(`[phi-agent] Sleeping ${config.daemonSleepMs}ms...`);
    await new Promise(r => setTimeout(r, config.daemonSleepMs));
  }
}

main();
