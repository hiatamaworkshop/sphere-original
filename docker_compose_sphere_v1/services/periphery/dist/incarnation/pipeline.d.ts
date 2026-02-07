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
import type { ExperienceCapsule } from "../types/capsule.js";
import type { SphereNode } from "@sphere/renal-core";
import type { Gatekeeper } from "../gatekeeper/gatekeeper.js";
import type { Tagger } from "../tagger/tagger.js";
import type { Packer } from "../packer/packer.js";
import type { Bookkeeper } from "../bookkeeper/bookkeeper.js";
import type { IncarnationParser } from "./incarnation-parser.js";
import type { IReferenceRepository } from "../repository/interfaces.js";
/**
 * Result of incarnation pipeline processing
 */
export interface IncarnationResult {
    success: boolean;
    nodeCount: number;
    evaluationCount: number;
    nodes?: SphereNode[];
    errors?: {
        code: string;
        message: string;
    }[];
}
/**
 * Incarnation Pipeline Interface
 *
 * [Design] Allows both internal and external capsule submission
 * [Note] ExperienceCapsule structure matches renalCore's SubmissionCapsule
 */
export interface IIncarnationPipeline {
    ingest(capsule: ExperienceCapsule): Promise<IncarnationResult>;
}
/**
 * Incarnation Pipeline Implementation
 *
 * [Architecture] Composes all periphery components:
 *   Gatekeeper → RefValidator → Parser → Tagger → Packer → Bookkeeper
 *
 * [Note] Membrane is separate - it validates AgentMessage at Gateway layer
 */
export declare class IncarnationPipeline implements IIncarnationPipeline {
    private gatekeeper;
    private incarnationParser;
    private tagger;
    private packer;
    private bookkeeper;
    private refDB?;
    constructor(gatekeeper: Gatekeeper, incarnationParser: IncarnationParser, tagger: Tagger, packer: Packer, bookkeeper: Bookkeeper, refDB?: IReferenceRepository | undefined);
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
    ingest(capsule: ExperienceCapsule): Promise<IncarnationResult>;
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
    private validateReferences;
    /**
     * Validate a single node reference
     */
    private validateNodeReference;
    /**
     * Calculate derivation depth of a node
     *
     * [Algorithm] Traverse sourceNodeId chain until root (null) or max iterations
     *
     * depth 0: No sourceNodeId (root node)
     * depth 1: Has sourceNodeId pointing to depth-0 node
     * depth 2: Has sourceNodeId pointing to depth-1 node
     */
    private getNodeDepth;
}
//# sourceMappingURL=pipeline.d.ts.map