/**
 * Sphere Project - SphereContext API (Phase 4)
 *
 * External interface for agents to interact with the Sphere.
 * Based on the original design from agent_mock.txt
 *
 * [Layers]
 * - radar: Perception sensors (read-only)
 * - act: Interaction/interference
 * - lifecycle: Return/termination
 */

import type {
  SphereAgent,
  FocusData,
  RadarData,
  SubmissionCapsule,
  GhostPulse,
  AgentConfig,
  ExperienceCapsule,
} from "../types/agent.js";
import type { SphereNode } from "../types/sphere_node.js";
import { AgentManager } from "./agent-manager.js";

// ============================================================
// Pulse Event (from Active Bus)
// ============================================================

export interface PulseEvent {
  type: "agent_nearby" | "hot_node" | "evaluation_spike" | "congestion_warning";
  cellId: string;
  timestamp: number;
  data: unknown;
}

// ============================================================
// SphereContext Interface
// ============================================================

/**
 * API exposed to external agents
 */
export interface SphereContext {
  // --- Perception Sensors (Read-only) ---
  radar: {
    /**
     * Scan nearby nodes (Amber/Ghost/Active)
     * @param radius Scan radius in cells (default: agent's exploration radius)
     */
    scan: (radius?: number) => Promise<RadarData[]>;

    /**
     * Read pulse events from the Active Bus
     */
    sensePulse: () => PulseEvent[];

    /**
     * Get detailed view of nearby nodes (focus range)
     */
    focus: () => Promise<FocusData[]>;
  };

  // --- Actions/Interference ---
  act: {
    /**
     * Focus on a specific node (deep inspection, raises Heat)
     * @param nodeId Target node ID
     * @returns Whether focus was granted
     */
    focus: (nodeId: string) => Promise<boolean>;

    /**
     * Emit a pulse to the Active Bus
     * @param message Pulse content
     * @param flg Optional flags
     */
    emit: (message: string, flg?: number) => void;

    /**
     * Leave a mark (Ghost) at current location
     * @param label Mark label
     */
    mark: (label: string) => void;

    /**
     * Move toward a direction or cell
     * @param target Cell ID or direction vector
     */
    move: (target: string | [number, number, number]) => Promise<boolean>;

    /**
     * Evaluate a node (leave opinion)
     * @param nodeId Target node
     * @param quality Quality rating (-1.0 to 1.0)
     */
    evaluate: (nodeId: string, quality: number) => void;
  };

  // --- Lifecycle ---
  lifecycle: {
    /**
     * Return from exploration with gathered data
     * @param capsule Experience capsule to submit
     */
    return: (capsule?: Partial<ExperienceCapsule>) => void;

    /**
     * Abort exploration (discard data)
     */
    abort: () => void;

    /**
     * Get current agent state
     */
    getState: () => SphereAgent;
  };
}

// ============================================================
// SphereContext Factory
// ============================================================

/**
 * Create a SphereContext bound to a specific agent
 */
export function createSphereContext(
  agentId: string,
  manager: AgentManager
): SphereContext | null {
  const agent = manager.getAgent(agentId);
  if (!agent) return null;

  // Pulse event buffer (would be connected to actual Active Bus)
  const pulseBuffer: PulseEvent[] = [];

  return {
    radar: {
      scan: async (radius?: number) => {
        const currentAgent = manager.getAgent(agentId);
        if (!currentAgent) return [];

        // Use manager to get perception
        const agents = manager.getAllAgents();
        // Would call actual perception methods
        return [];
      },

      sensePulse: () => {
        const events = [...pulseBuffer];
        pulseBuffer.length = 0; // Clear buffer
        return events;
      },

      focus: async () => {
        const currentAgent = manager.getAgent(agentId);
        if (!currentAgent) return [];
        // Would return focus perception data
        return [];
      },
    },

    act: {
      focus: async (nodeId: string) => {
        const result = manager.requestFocus(agentId, nodeId);
        return result.granted;
      },

      emit: (message: string, flg?: number) => {
        // Would emit to Active Bus
        console.log(`[Agent ${agentId}] Emit: ${message}`);
      },

      mark: (label: string) => {
        const currentAgent = manager.getAgent(agentId);
        if (!currentAgent) return;

        // Would create Ghost node at current position
        console.log(`[Agent ${agentId}] Mark: ${label} at ${currentAgent.cellId}`);
      },

      move: async (target: string | [number, number, number]) => {
        const currentAgent = manager.getAgent(agentId);
        if (!currentAgent) return false;

        // Execute through manager
        // (simplified - would integrate with tick system)
        return false;
      },

      evaluate: (nodeId: string, quality: number) => {
        const currentAgent = manager.getAgent(agentId);
        if (!currentAgent) return;

        // Would create and store evaluation
        console.log(`[Agent ${agentId}] Evaluate ${nodeId}: ${quality}`);
      },
    },

    lifecycle: {
      return: (capsule?: Partial<ExperienceCapsule>) => {
        // Despawn and submit capsule
        manager.despawnAgent(agentId);
      },

      abort: () => {
        // Despawn without capsule
        manager.despawnAgent(agentId);
      },

      getState: () => {
        const currentAgent = manager.getAgent(agentId);
        if (!currentAgent) {
          throw new Error(`Agent ${agentId} not found`);
        }
        return currentAgent;
      },
    },
  };
}

// ============================================================
// Simple Agent Runner
// ============================================================

/**
 * Simple agent step function (based on original design)
 * Runs one "thinking" cycle for an agent
 */
export async function runAgentStep(
  context: SphereContext,
  getEmbedding: (text: string) => Promise<number[]>
): Promise<void> {
  const agent = context.lifecycle.getState();

  // Check if already thinking (prevent concurrent updates)
  if (agent.actionState === "investigating") {
    return;
  }

  // 1. Scan nearby nodes
  const nearby = await context.radar.focus();
  if (nearby.length === 0) {
    // No nodes nearby: random move
    return;
  }

  // 2. Find most interesting node
  const sorted = nearby.sort((a, b) => {
    const heatA = a.perceivedHeat === "high" ? 3 : a.perceivedHeat === "mid" ? 2 : 1;
    const heatB = b.perceivedHeat === "high" ? 3 : b.perceivedHeat === "mid" ? 2 : 1;
    return heatB - heatA;
  });

  const target = sorted[0];

  // 3. Should we react? (Staggering / "タメ")
  if (Math.random() > 0.7) {
    // Try to focus on the target
    const focused = await context.act.focus(target.nodeId);

    if (focused && target.payload?.summary) {
      // Update internal state with new information
      // This would trigger re-embedding in full implementation
      console.log(`[Agent ${agent.name}] Absorbed: ${target.payload.summary.substring(0, 30)}...`);
    }
  }
}
