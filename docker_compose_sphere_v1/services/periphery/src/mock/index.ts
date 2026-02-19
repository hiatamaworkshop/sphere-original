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
 *   npm run contribute        # Data injection (10 items)
 *   npm run contribute:batch  # All 77 items
 *   npm run explore           # Single-agent full test
 *
 * [Data]
 *   mock_data.json      - 77 test items (62 factual + 15 misinformation flags=1)
 *   wave-injection.json - Curated data with expected flag values
 *   relics.json         - 10 core knowledge pillars (flags=0x2000)
 */

// Core Tools
export { SwarmController, SwarmAgent } from "./swarm-agent.js";
export type { SwarmConfig, SwarmMetrics, AgentStats } from "./swarm-agent.js";
export { ExploreAgent } from "./explore-agent.js";
