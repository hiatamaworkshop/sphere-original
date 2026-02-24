/**
 * Sphere Project - Mock / Test Tools
 *
 * [Structure]
 *   Core Tools:
 *     - SwarmController: Multi-agent spawner (primary test tool)
 *     - ExploreAgent: Single-agent 3-layer exploration test
 *     - contribution: Data injection from mock_data.json
 *
 * [Usage]
 *   npm run swarm             # 3 agents (default)
 *   npm run swarm:5           # 5 agents
 *   npm run swarm:10          # 10 agents
 *   npm run observe           # Metabolic observer (3 waves × 5 boost agents)
 *   npm run observe:fast      # Quick observation test
 *   npm run contribute        # Data injection (10 items)
 *   npm run contribute:batch  # All items
 *   npm run explore           # Single-agent full test
 *
 * [Data]
 *   mock_data.json      - 101 test items (83 factual + 18 misinformation flags=1)
 *   wave-injection.json - Curated data with expected flag values
 *   relics.json         - 10 core knowledge pillars (flags=0x2000)
 */

// Core Tools
export { SwarmController, SwarmAgent } from "./swarm-agent.js";
export type { SwarmConfig, SwarmMetrics, AgentStats } from "./swarm-agent.js";
export { ExploreAgent } from "./explore-agent.js";
export { observe } from "./mock-observer.js";
export type { ObserverConfig } from "./mock-observer.js";
