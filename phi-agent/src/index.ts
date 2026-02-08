// ============================================================
// phi-agent — Entry point
// ============================================================
//
// Usage:
//   npx tsx src/index.ts                          # default query
//   npx tsx src/index.ts "AI safety"              # custom query
//   npx tsx src/index.ts "metabolism" --cycles 20  # more cycles
//
// Environment:
//   OLLAMA_HOST    ollama API URL (default: http://localhost:11434)
//   OLLAMA_MODEL   model name (default: phi3:mini)
//   SPHERE_URL     periphery HTTP URL (default: http://localhost:3001)
//   SPHERE_WS      periphery WebSocket URL (default: ws://localhost:3001)

import { OllamaClient } from "./ollama-client.js";
import { SphereClient } from "./sphere-client.js";
import { PhiAgent } from "./agent.js";

function parseArgs(): { query: string; cycles: number; debug: boolean } {
  const args = process.argv.slice(2);
  let query = "knowledge exploration";
  let cycles = 10;
  let debug = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cycles" && args[i + 1]) {
      cycles = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--quiet") {
      debug = false;
    } else if (!args[i].startsWith("--")) {
      query = args[i];
    }
  }

  return { query, cycles, debug };
}

async function main(): Promise<void> {
  const { query, cycles, debug } = parseArgs();

  console.log("========================================");
  console.log("  phi-agent — Sphere Coupling Service");
  console.log("========================================");
  console.log(`Query:  "${query}"`);
  console.log(`Cycles: ${cycles}`);
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

  process.exit(stats.status === "completed" ? 0 : 1);
}

main();
