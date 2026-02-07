/**
 * Sphere Project - Membrane
 *
 * [Role] Rulebook Compliance Checker for Agent Messages
 * [Function] Validate that agents follow the Rulebook when submitting data
 * [Philosophy] Check compliance, NOT arbitrary content filtering
 *
 * [Design]
 *   1. Agent receives Rulebook via GET /rulebook
 *   2. Agent creates data following the Rulebook
 *   3. Membrane checks if agent followed the rules
 *   4. Invalid data is rejected, but visitors are NOT arbitrarily blocked
 *
 * [Scope]
 *   - AgentMessage validation (Gateway layer)
 *   - NOT capsule content filtering (that's arbitrary rejection)
 *   - NOT authentication/rate limiting (that's middleware)
 */
import type { MoveIntent, EntryRequest } from "../types/gateway.js";
import type { ExperienceCapsule } from "../types/capsule.js";
/**
 * Validation result for agent messages
 */
export interface MembraneResult {
    valid: boolean;
    errors: MembraneError[];
}
export interface MembraneError {
    code: string;
    message: string;
    field?: string;
}
/**
 * Agent message types that Membrane validates
 */
export type ValidatableMessage = {
    type: "entry";
    requestId: string;
    request: EntryRequest;
} | {
    type: "sense";
    requestId: string;
    radius?: number;
} | {
    type: "focus";
    requestId: string;
    nodeId: string;
} | {
    type: "evaluate";
    requestId: string;
    nodeId: string;
    h: number;
    w: number;
    d: number;
} | {
    type: "move";
    requestId: string;
    intent: MoveIntent;
} | {
    type: "return";
    requestId: string;
    capsule?: ExperienceCapsule;
};
/**
 * Membrane - Rulebook Compliance Checker
 *
 * [Key Principle] This is NOT content moderation.
 * Membrane checks if the agent "understood and followed" the Rulebook.
 */
export declare class Membrane {
    /**
     * Validate an agent message for Rulebook compliance
     */
    validate(msg: ValidatableMessage): MembraneResult;
    /**
     * Validate entry request (Rulebook compliance for initial position)
     *
     * [Purpose] Check if agent properly created EntryRequest after reading Rulebook
     * This determines where in the Sphere the agent will start
     */
    private validateEntry;
    /**
     * Validate sense message
     */
    private validateSense;
    /**
     * Validate focus message
     */
    private validateFocus;
    /**
     * Validate evaluate message
     *
     * [2-Layer Evaluation Architecture]
     *   Agent layer: Intuitive 0-10 evaluation per metric (neutral = 5)
     *   - h: Heat evaluation
     *   - w: Weight evaluation
     *   - d: Decay evaluation (higher = faster decay)
     */
    private validateEvaluate;
    /**
     * Validate move message
     */
    private validateMove;
    /**
     * Validate return message (with optional capsule)
     *
     * [Key] This checks Rulebook compliance for tags, NOT content filtering
     */
    private validateReturn;
    /**
     * Validate node tags for Rulebook compliance
     *
     * [Purpose] Check if agent properly decomposed tags according to Rulebook
     * [NOT] Content filtering or arbitrary rejection
     */
    private validateNodeTags;
}
//# sourceMappingURL=membrane.d.ts.map