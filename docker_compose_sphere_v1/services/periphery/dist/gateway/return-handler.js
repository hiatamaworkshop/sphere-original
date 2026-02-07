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
     * [Design Decision]
     *   - AutoCapsule is always generated (server truth)
     *   - proposedCapsule is optional (agent claim)
     *   - First phase: Use proposedCapsule if valid, else generate from AutoCapsule
     *   - Second phase: Capsule差分評価 (not implemented yet)
     */
    async processReturn(autoCapsule, proposedCapsule) {
        console.log(`[ReturnHandler] Processing return for session ${autoCapsule.sessionId}`);
        console.log(`[ReturnHandler] AutoCapsule: ${autoCapsule.visits.length} visits, ${autoCapsule.summaryMetrics.uniqueNodes} unique nodes`);
        let finalCapsule = null;
        const errors = [];
        // Case 1: Agent provided a capsule
        if (proposedCapsule) {
            console.log(`[ReturnHandler] Agent provided proposedCapsule`);
            // Validate through Gatekeeper
            const validation = this.gatekeeper.validate(proposedCapsule);
            if (validation.valid) {
                // First phase: Accept proposed capsule as-is
                // Second phase: Would compare with AutoCapsule here
                finalCapsule = proposedCapsule;
                console.log(`[ReturnHandler] Proposed capsule accepted`);
            }
            else {
                // Proposed capsule invalid, log errors (convert ValidationError to string)
                for (const err of validation.errors) {
                    errors.push(`${err.code}: ${err.message}`);
                }
                console.log(`[ReturnHandler] Proposed capsule rejected:`, validation.errors);
                // Fall back to auto-generated capsule
                finalCapsule = this.generateCapsuleFromAuto(autoCapsule);
                console.log(`[ReturnHandler] Using auto-generated capsule instead`);
            }
        }
        // Case 2: Agent returned empty-handed
        else {
            console.log(`[ReturnHandler] Agent returned empty-handed`);
            // Generate capsule from AutoCapsule
            // Even empty-handed return contributes exploration data
            if (autoCapsule.visits.length > 0) {
                finalCapsule = this.generateCapsuleFromAuto(autoCapsule);
                console.log(`[ReturnHandler] Generated capsule from exploration data`);
            }
            else {
                console.log(`[ReturnHandler] No exploration data, nothing to submit`);
            }
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
    /**
     * Generate ExperienceCapsule from AutoCapsule
     *
     * [Design] Minimal capsule - only what was actually explored
     * [Principle] まず記録、意味は後
     */
    generateCapsuleFromAuto(autoCapsule) {
        const topTier = [];
        const normalNodes = [];
        const ghostNodes = [];
        // Convert visits to node seeds (sorted by focus count)
        for (const visit of autoCapsule.visits) {
            // Skip visits with minimal engagement
            if (visit.focusCount === 0)
                continue;
            const seed = {
                tags: ["auto-generated", "exploration"],
                summary: `[Explored] Node ${visit.nodeId.substring(0, 8)}... (${visit.focusCount} focus, ${Math.round(visit.stayTime / 1000)}s stay)`,
                // Heat is determined by config.baseHeat, tier classification handles differentiation
                flags: 0,
            };
            // Categorize based on engagement level
            if (visit.stayTime > 10000 && visit.focusCount >= 2) {
                // High engagement: long stay + multiple focus
                if (topTier.length < 2) {
                    topTier.push(seed);
                }
                else {
                    normalNodes.push(seed);
                }
            }
            else if (visit.stayTime > 3000 || visit.focusCount >= 1) {
                // Medium engagement
                normalNodes.push(seed);
            }
            else {
                // Low engagement
                ghostNodes.push(seed);
            }
        }
        // Add session summary as ghost node
        ghostNodes.push({
            tags: ["auto-capsule", "session-summary"],
            summary: `[AutoCapsule] Session ${autoCapsule.sessionId.substring(0, 8)}...: ${autoCapsule.summaryMetrics.uniqueNodes} nodes, ${Math.round(autoCapsule.duration / 1000)}s duration`,
            // Heat is determined by config.baseHeat
            flags: 0,
        });
        return {
            schemaVersion: CAPSULE_SCHEMA_VERSION,
            topTier: topTier.slice(0, 2),
            normalNodes: normalNodes.slice(0, 5),
            ghostNodes: ghostNodes.slice(0, 3),
            evaluations: [], // AutoCapsule doesn't generate evaluations
            timestamp: Date.now(),
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