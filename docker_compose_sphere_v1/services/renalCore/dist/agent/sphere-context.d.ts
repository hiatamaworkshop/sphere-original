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
import type { SphereAgent, FocusData, RadarData, ExperienceCapsule } from "../types/agent.js";
import { AgentManager } from "./agent-manager.js";
export interface PulseEvent {
    type: "agent_nearby" | "hot_node" | "evaluation_spike" | "congestion_warning";
    cellId: string;
    timestamp: number;
    data: unknown;
}
/**
 * API exposed to external agents
 */
export interface SphereContext {
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
/**
 * Create a SphereContext bound to a specific agent
 */
export declare function createSphereContext(agentId: string, manager: AgentManager): SphereContext | null;
/**
 * Simple agent step function (based on original design)
 * Runs one "thinking" cycle for an agent
 */
export declare function runAgentStep(context: SphereContext, getEmbedding: (text: string) => Promise<number[]>): Promise<void>;
//# sourceMappingURL=sphere-context.d.ts.map