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
import { CAPSULE_SCHEMA_VERSION } from "../types/capsule.js";
// ============================================================
// Return Handler
// ============================================================
/**
 * ReturnHandler: Processes agent return with Capsule finalization
 *
 * [Responsibility]
 *   1. Build AutoCapsule from action log (already done before this)
 *   2. Validate proposedCapsule if provided
 *   3. Finalize Capsule for pipeline
 *   4. Submit to Incarnation Pipeline
 */
export class ReturnHandler {
    gatekeeper;
    pipeline;
    constructor(gatekeeper, pipeline) {
        this.gatekeeper = gatekeeper;
        this.pipeline = pipeline;
    }
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
    async processReturn(autoCapsule, proposedCapsule) {
        console.log(`[ReturnHandler] Processing return for session ${autoCapsule.sessionId}`);
        console.log(`[ReturnHandler] AutoCapsule: ${autoCapsule.visits.length} visits, ${autoCapsule.summaryMetrics.uniqueNodes} unique nodes`);
        let finalCapsule = null;
        const errors = [];
        const hasEvaluations = proposedCapsule?.evaluations && proposedCapsule.evaluations.length > 0;
        const hasNodeSeeds = proposedCapsule &&
            (proposedCapsule.topTier.length > 0 || proposedCapsule.normalNodes.length > 0 || proposedCapsule.ghostNodes.length > 0);
        // Case 1: Agent provided a capsule WITH NodeSeeds (incarnation request)
        if (proposedCapsule && hasNodeSeeds) {
            console.log(`[ReturnHandler] Agent proposed capsule with NodeSeeds (incarnation request)`);
            // Validate through Gatekeeper
            const validation = this.gatekeeper.validate(proposedCapsule);
            if (validation.valid) {
                finalCapsule = proposedCapsule;
                console.log(`[ReturnHandler] Proposed capsule accepted (${proposedCapsule.topTier.length}t/${proposedCapsule.normalNodes.length}n/${proposedCapsule.ghostNodes.length}g nodes)`);
            }
            else {
                // Proposed capsule invalid — reject NodeSeeds but keep evaluations
                for (const err of validation.errors) {
                    errors.push(`${err.code}: ${err.message}`);
                }
                console.log(`[ReturnHandler] Proposed capsule rejected:`, validation.errors);
                // Evaluations-only fallback (no auto-generated NodeSeeds)
                if (hasEvaluations) {
                    finalCapsule = {
                        schemaVersion: CAPSULE_SCHEMA_VERSION,
                        topTier: [],
                        normalNodes: [],
                        ghostNodes: [],
                        evaluations: proposedCapsule.evaluations,
                        timestamp: Date.now(),
                    };
                    console.log(`[ReturnHandler] Keeping ${proposedCapsule.evaluations.length} evaluations, discarding NodeSeeds`);
                }
            }
        }
        // Case 2: Evaluations-only return (standard path for phi-agent)
        else if (proposedCapsule && hasEvaluations) {
            finalCapsule = proposedCapsule; // Already evaluations-only from sphere-context
            console.log(`[ReturnHandler] Evaluations-only return (${proposedCapsule.evaluations.length} evaluations, pheromone deposit)`);
        }
        // Case 3: Empty return (no evaluations, no NodeSeeds)
        else {
            console.log(`[ReturnHandler] Empty return (${autoCapsule.visits.length} visits recorded, no evaluations to deposit)`);
        }
        // Submit to Incarnation Pipeline
        let ingestionResult;
        if (finalCapsule && this.pipeline) {
            try {
                const result = await this.pipeline.ingest(finalCapsule);
                ingestionResult = {
                    nodeCount: result.nodeCount,
                    evaluationCount: result.evaluationCount,
                };
                console.log(`[ReturnHandler] Pipeline ingestion: ${result.nodeCount} nodes, ${result.evaluationCount} evaluations`);
            }
            catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                errors.push(`Pipeline error: ${errorMsg}`);
                console.error(`[ReturnHandler] Pipeline error:`, err);
            }
        }
        return {
            success: errors.length === 0,
            finalCapsule,
            autoCapsule,
            hadProposal: !!proposedCapsule,
            errors: errors.length > 0 ? errors : undefined,
            ingestionResult,
        };
    }
}
// ============================================================
// Factory Function
// ============================================================
/**
 * Create ReturnHandler instance
 */
export function createReturnHandler(gatekeeper, pipeline) {
    return new ReturnHandler(gatekeeper, pipeline);
}
//# sourceMappingURL=return-handler.js.map