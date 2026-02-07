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
// ============================================================
// SphereContext Factory
// ============================================================
/**
 * Create a SphereContext bound to a specific agent
 */
export function createSphereContext(agentId, manager) {
    const agent = manager.getAgent(agentId);
    if (!agent)
        return null;
    // Pulse event buffer (would be connected to actual Active Bus)
    const pulseBuffer = [];
    return {
        radar: {
            scan: async (radius) => {
                const currentAgent = manager.getAgent(agentId);
                if (!currentAgent)
                    return [];
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
                if (!currentAgent)
                    return [];
                // Would return focus perception data
                return [];
            },
        },
        act: {
            focus: async (nodeId) => {
                const result = manager.requestFocus(agentId, nodeId);
                return result.granted;
            },
            emit: (message, flg) => {
                // Would emit to Active Bus
                console.log(`[Agent ${agentId}] Emit: ${message}`);
            },
            mark: (label) => {
                const currentAgent = manager.getAgent(agentId);
                if (!currentAgent)
                    return;
                // Would create Ghost node at current position
                console.log(`[Agent ${agentId}] Mark: ${label} at ${currentAgent.cellId}`);
            },
            move: async (target) => {
                const currentAgent = manager.getAgent(agentId);
                if (!currentAgent)
                    return false;
                // Execute through manager
                // (simplified - would integrate with tick system)
                return false;
            },
            evaluate: (nodeId, quality) => {
                const currentAgent = manager.getAgent(agentId);
                if (!currentAgent)
                    return;
                // Would create and store evaluation
                console.log(`[Agent ${agentId}] Evaluate ${nodeId}: ${quality}`);
            },
        },
        lifecycle: {
            return: (capsule) => {
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
export async function runAgentStep(context, getEmbedding) {
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
//# sourceMappingURL=sphere-context.js.map