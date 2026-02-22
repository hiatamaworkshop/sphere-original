/**
 * Sphere Project - Return Handler
 *
 * [Role] Handles agent return with Capsule finalization
 * [Design] Based on Agent Action Pipeline in CLAUDE.md
 *
 * [Flow]
 *   Agent.return(proposedCapsule?)
 *        │
 *        ▼
 *   ┌────────────────────────────────────────────┐
 *   │  Server                                    │
 *   │  ├─ reconstruct AutoCapsule from logs     │
 *   │  ├─ if proposedCapsule:                   │
 *   │  │     ├─ compare with AutoCapsule        │
 *   │  │     ├─ trustScore 加味                 │
 *   │  │     └─ 差分を評価（過剰/不足/虚偽）   │
 *   │  └─ finalize Capsule → Pipeline           │
 *   └────────────────────────────────────────────┘
 *
 * [Principle]
 *   真実はサーバーにある
 *   意味づけはエージェントがする
 *   Capsule は提出物であり、採択物ではない
 */
import type { ExperienceCapsule } from "../types/capsule.js";
import type { AutoCapsule } from "../types/auto-capsule.js";
import type { Gatekeeper } from "../gatekeeper/gatekeeper.js";
import type { IIncarnationPipeline } from "../incarnation/pipeline.js";
/**
 * Result of return processing
 */
export interface ReturnResult {
    /** Whether return was successful */
    success: boolean;
    /** Final capsule that was processed */
    finalCapsule: ExperienceCapsule | null;
    /** Auto-generated capsule (for logging/audit) */
    autoCapsule: AutoCapsule;
    /** Whether proposed capsule was provided */
    hadProposal: boolean;
    /** Validation errors (if any) */
    errors?: string[];
    /** Pipeline ingestion result */
    ingestionResult?: {
        nodeCount: number;
        evaluationCount: number;
    };
}
/**
 * ReturnHandler: Processes agent return with Capsule finalization
 *
 * [Responsibility]
 *   1. Build AutoCapsule from action log (already done before this)
 *   2. Validate proposedCapsule if provided
 *   3. Finalize Capsule for pipeline
 *   4. Submit to Incarnation Pipeline
 */
export declare class ReturnHandler {
    private gatekeeper;
    private pipeline?;
    constructor(gatekeeper: Gatekeeper, pipeline?: IIncarnationPipeline | undefined);
    /**
     * Process agent return
     *
     * [Design Decision — Stigmergic Model]
     *   - AutoCapsule is always generated (server truth, audit log)
     *   - Evaluations (pheromone) are the primary output of agent sessions
     *   - NodeSeed incarnation is ONLY for agents that explicitly propose a capsule
     *     (powerful external agents, not standard phi-agent)
     *   - Default return = evaluations-only (no auto-generated NodeSeeds)
     *
     * [Rationale]
     *   Agents are sensory organs — they evaluate existing nodes (deposit pheromone).
     *   Node creation (incarnation) is the responsibility of:
     *     - pool-service (external data intake)
     *     - humans (Capsule tab / Dive)
     *     - external agents that explicitly submit proposedCapsule
     */
    processReturn(autoCapsule: AutoCapsule, proposedCapsule?: ExperienceCapsule): Promise<ReturnResult>;
}
/**
 * Create ReturnHandler instance
 */
export declare function createReturnHandler(gatekeeper: Gatekeeper, pipeline?: IIncarnationPipeline): ReturnHandler;
//# sourceMappingURL=return-handler.d.ts.map