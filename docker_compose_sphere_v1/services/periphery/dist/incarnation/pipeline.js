/**
 * Sphere Project - Incarnation Pipeline
 *
 * [Role] Unified capsule processing pipeline
 * [Usage]
 *   - Internal agents: Direct injection (no HTTP overhead)
 *   - External agents: Via HTTP API (same pipeline)
 *
 * [Flow] Capsule → Gatekeeper → RefValidator → Parser → Tagger → Packer → Bookkeeper
 *
 * [Component Responsibilities]
 *   - Gatekeeper: Validate capsule format and schema version (STATELESS)
 *   - RefValidator: Validate references exist and are valid kinds (STATEFUL)
 *   - Parser (IncarnationParser): summary → vector (spatial coordinates)
 *   - Tagger: tags → 16bit flags (semantic classification, 16bitTechnique)
 *   - Packer: Build SphereNodes from tagged seeds
 *   - Bookkeeper: Write to RefDB and ProjDB
 *
 * [Note] Membrane is NOT part of this pipeline.
 *   - Membrane: Gateway layer, validates AgentMessage (rulebook compliance)
 *   - This pipeline: Data transformation (capsule → nodes)
 *
 * [Important] "Direct" means skipping HTTP, NOT skipping the pipeline!
 *   All capsules go through: Gatekeeper → RefValidator → Parser → Tagger → Packer → Bookkeeper
 */
/**
 * Maximum derivation depth for node chains
 * depth 0: Root (information)
 * depth 1: Opinion on information
 * depth 2: Response to opinion (terminal)
 */
const MAX_DERIVATION_DEPTH = 2;
/**
 * Valid node kinds that can be referenced
 */
const REFERENCEABLE_KINDS = ["amber", "relic", "active"];
/**
 * Incarnation Pipeline Implementation
 *
 * [Architecture] Composes all periphery components:
 *   Gatekeeper → RefValidator → Parser → Tagger → Packer → Bookkeeper
 *
 * [Note] Membrane is separate - it validates AgentMessage at Gateway layer
 */
export class IncarnationPipeline {
    gatekeeper;
    incarnationParser;
    tagger;
    packer;
    bookkeeper;
    refDB;
    constructor(gatekeeper, incarnationParser, tagger, packer, bookkeeper, refDB // Optional for backward compatibility
    ) {
        this.gatekeeper = gatekeeper;
        this.incarnationParser = incarnationParser;
        this.tagger = tagger;
        this.packer = packer;
        this.bookkeeper = bookkeeper;
        this.refDB = refDB;
    }
    /**
     * Process capsule through full pipeline
     *
     * [Flow]
     *   1. Gatekeeper: Validate capsule
     *   2. Parser: summary → vector (WHERE in space)
     *   3. Tagger: tags → 16bit flags (WHAT properties)
     *   4. Packer: Build SphereNodes
     *   5. Bookkeeper: Write to DB
     */
    async ingest(capsule) {
        const totalSeeds = capsule.topTier.length +
            capsule.normalNodes.length +
            capsule.ghostNodes.length;
        const evalCount = capsule.evaluations?.length ?? 0;
        // [Log] パイプライン開始
        console.log(`[Pipeline] ========== INGEST START ==========`);
        console.log(`[Pipeline] input: seeds=${totalSeeds} (top=${capsule.topTier.length} normal=${capsule.normalNodes.length} ghost=${capsule.ghostNodes.length}) evals=${evalCount}`);
        try {
            // 1. Gatekeeper: Validate against Rulebook (STATELESS)
            const validation = this.gatekeeper.validate(capsule);
            if (!validation.valid) {
                // [Eval rescue] EMPTY_CAPSULE means no seeds, but evaluations are independent.
                // Evaluations reference existing nodes and don't go through the node pipeline.
                // Apply them even when no seeds are present.
                const onlyEmptyCapsule = validation.errors?.every(e => e.code === "EMPTY_CAPSULE");
                if (onlyEmptyCapsule && evalCount > 0) {
                    await this.bookkeeper.applyEvaluations(capsule.evaluations);
                    console.log(`[Pipeline] eval-only: evals_applied=${evalCount}`);
                    console.log(`[Pipeline] ========== INGEST END ==========`);
                    return {
                        success: true,
                        nodeCount: 0,
                        evaluationCount: evalCount,
                    };
                }
                console.log(`[Pipeline] REJECTED by Gatekeeper`);
                console.log(`[Pipeline] ========== INGEST END (FAIL) ==========`);
                return {
                    success: false,
                    nodeCount: 0,
                    evaluationCount: 0,
                    errors: validation.errors,
                };
            }
            // 2. RefValidator: Validate references (STATEFUL - requires RefDB)
            if (this.refDB) {
                const refErrors = await this.validateReferences(capsule);
                if (refErrors.length > 0) {
                    console.log(`[Pipeline] REJECTED by RefValidator: ${refErrors.map(e => e.code).join(", ")}`);
                    console.log(`[Pipeline] ========== INGEST END (FAIL) ==========`);
                    return {
                        success: false,
                        nodeCount: 0,
                        evaluationCount: 0,
                        errors: refErrors,
                    };
                }
            }
            // 3. Parser: Vectorize summaries (spatial coordinates)
            const parsed = await this.incarnationParser.parseCapsule(capsule);
            // 4. Tagger: Classify with 16bitTechnique
            const tagged = await this.tagger.tagCapsule(parsed);
            // 5. Packer: Build SphereNodes
            const packed = await this.packer.pack(tagged);
            // 6. Bookkeeper: RefDB → ProjDB (incarnation)
            await this.bookkeeper.ingest(packed.nodes);
            // 7. Evaluations: Direct to ProjDB (no buffer needed)
            if (tagged.evaluations.length > 0) {
                await this.bookkeeper.applyEvaluations(tagged.evaluations);
            }
            // [Log] パイプライン終了
            console.log(`[Pipeline] output: nodes=${packed.nodes.length} evals_applied=${tagged.evaluations.length}`);
            console.log(`[Pipeline] ========== INGEST END ==========`);
            return {
                success: true,
                nodeCount: packed.nodes.length,
                evaluationCount: tagged.evaluations.length,
                nodes: packed.nodes,
            };
        }
        catch (error) {
            console.error("[Pipeline] error:", error);
            return {
                success: false,
                nodeCount: 0,
                evaluationCount: 0,
                errors: [{ code: "PIPELINE_ERROR", message: String(error) }],
            };
        }
    }
    /**
     * Validate node references (sourceNodeId, links)
     *
     * [Checks]
     *   1. Referenced nodes exist in RefDB
     *   2. Referenced nodes are valid kinds (amber, relic, active)
     *   3. Derivation depth does not exceed MAX_DERIVATION_DEPTH
     *
     * [Design] Gatekeeper stays STATELESS, this method is STATEFUL
     */
    async validateReferences(capsule) {
        if (!this.refDB)
            return [];
        const errors = [];
        const allSeeds = [
            ...capsule.topTier,
            ...capsule.normalNodes,
            // Note: ghostNodes are excluded from derivation validation
            // They are ephemeral and should not form chains
        ];
        for (let i = 0; i < allSeeds.length; i++) {
            const seed = allSeeds[i];
            // Validate sourceNodeId
            if (seed.sourceNodeId) {
                const sourceError = await this.validateNodeReference(seed.sourceNodeId, `seed[${i}].sourceNodeId`, true // Check depth for sourceNodeId
                );
                if (sourceError)
                    errors.push(sourceError);
            }
            // Validate links[]
            if (seed.links) {
                for (let j = 0; j < seed.links.length; j++) {
                    const linkError = await this.validateNodeReference(seed.links[j], `seed[${i}].links[${j}]`, false // No depth check for links (they're references, not derivations)
                    );
                    if (linkError)
                        errors.push(linkError);
                }
            }
        }
        return errors;
    }
    /**
     * Validate a single node reference
     */
    async validateNodeReference(nodeId, fieldPath, checkDepth) {
        if (!this.refDB)
            return null;
        // 1. Check existence
        const record = await this.refDB.get(nodeId);
        if (!record) {
            return {
                code: "ORPHAN_REFERENCE",
                message: `Referenced node does not exist: ${nodeId}`,
                field: fieldPath,
            };
        }
        // 2. Check kind is valid for reference
        if (!REFERENCEABLE_KINDS.includes(record.kind)) {
            return {
                code: "INVALID_REFERENCE_KIND",
                message: `Cannot reference ${record.kind} node (only ${REFERENCEABLE_KINDS.join(", ")} allowed)`,
                field: fieldPath,
            };
        }
        // 3. Check derivation depth (only for sourceNodeId)
        if (checkDepth) {
            const depth = await this.getNodeDepth(nodeId);
            if (depth >= MAX_DERIVATION_DEPTH) {
                return {
                    code: "MAX_DEPTH_EXCEEDED",
                    message: `Cannot derive from node at depth ${depth} (max depth is ${MAX_DERIVATION_DEPTH})`,
                    field: fieldPath,
                    actual: depth,
                    limit: MAX_DERIVATION_DEPTH,
                };
            }
        }
        return null;
    }
    /**
     * Calculate derivation depth of a node
     *
     * [Algorithm] Traverse sourceNodeId chain until root (null) or max iterations
     *
     * depth 0: No sourceNodeId (root node)
     * depth 1: Has sourceNodeId pointing to depth-0 node
     * depth 2: Has sourceNodeId pointing to depth-1 node
     */
    async getNodeDepth(nodeId, maxIterations = 10) {
        if (!this.refDB)
            return 0;
        let depth = 0;
        let currentId = nodeId;
        while (currentId && depth < maxIterations) {
            const record = await this.refDB.get(currentId);
            if (!record)
                break;
            const sourceId = record.payload?.sourceNodeId;
            if (!sourceId)
                break; // Reached root
            depth++;
            currentId = sourceId;
        }
        return depth;
    }
}
//# sourceMappingURL=pipeline.js.map