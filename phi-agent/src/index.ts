// ============================================================
// phi-agent — Entry point
// ============================================================
//
// Usage:
//   npx tsx src/index.ts                               # default query
//   npx tsx src/index.ts "AI safety"                    # custom query
//   npx tsx src/index.ts "metabolism" --cycles 20       # more cycles
//   npx tsx src/index.ts "physics" --loadout scholar    # personality
//
// Environment:
//   OLLAMA_HOST    ollama API URL (default: http://localhost:11434)
//   OLLAMA_MODEL   model name (default: phi3:mini)
//   SPHERE_URL     periphery HTTP URL (default: http://localhost:3001)
//   SPHERE_WS      periphery WebSocket URL (default: ws://localhost:3001)

import { OllamaClient } from "./ollama-client.js";
import { SphereClient } from "./sphere-client.js";
import { PhiAgent } from "./agent.js";
import { LOADOUTS } from "./fast-gate.js";
import type { LoadoutName } from "./fast-gate.js";
import { getSpeciesSummary } from "./eval-log.js";

const VALID_LOADOUTS = Object.keys(LOADOUTS) as LoadoutName[];

function parseArgs(): { query: string; cycles: number; loadout: LoadoutName; debug: boolean } {
  const args = process.argv.slice(2);
  let query = "knowledge exploration";
  let cycles = 10;
  let loadout: LoadoutName = "balanced";
  let debug = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cycles" && args[i + 1]) {
      cycles = parseInt(args[i + 1], 10);
      i++;
    } else if ((args[i] === "--loadout" || args[i] === "--preset") && args[i + 1]) {
      const p = args[i + 1] as LoadoutName;
      if (VALID_LOADOUTS.includes(p)) {
        loadout = p;
      } else {
        console.log(`Unknown loadout "${args[i + 1]}", using "balanced". Available: ${VALID_LOADOUTS.join(", ")}`);
      }
      i++;
    } else if (args[i] === "--quiet") {
      debug = false;
    } else if (!args[i].startsWith("--")) {
      query = args[i];
    }
  }

  return { query, cycles, loadout, debug };
}

async function main(): Promise<void> {
  const { query, cycles, loadout, debug } = parseArgs();
  const l = LOADOUTS[loadout];

  console.log("========================================");
  console.log("  phi-agent — Sphere Coupling Service");
  console.log("========================================");
  console.log(`Query:   "${query}"`);
  console.log(`Loadout: ${l.name} (walk: ${l.walkPreference}, minCycles: ${l.minCycles})`);
  console.log(`Quality: [${l.qualityVector.map(v => v.toFixed(1)).join(", ")}]`);
  console.log(`Return:  [${l.returnWeights.map(v => v.toFixed(1)).join(", ")}] (sat,frust,stam,stale)`);
  console.log(`Cycles:  ${cycles}`);
  console.log();

  const ollama = new OllamaClient();
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

  process.exit(stats.status === "completed" ? 0 : 1);
}

main();
