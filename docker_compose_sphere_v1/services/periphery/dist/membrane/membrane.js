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
import { INCARNATION_CONSTRAINTS, ENTRY_CONSTRAINTS } from "../rulebook/index.js";
/**
 * Membrane - Rulebook Compliance Checker
 *
 * [Key Principle] This is NOT content moderation.
 * Membrane checks if the agent "understood and followed" the Rulebook.
 */
export class Membrane {
    /**
     * Validate an agent message for Rulebook compliance
     */
    validate(msg) {
        const errors = [];
        // Common: requestId validation
        if (!msg.requestId || typeof msg.requestId !== "string") {
            errors.push({
                code: "INVALID_REQUEST_ID",
                message: "requestId must be a non-empty string",
                field: "requestId",
            });
        }
        // Type-specific validation
        switch (msg.type) {
            case "entry":
                this.validateEntry(msg.request, errors);
                break;
            case "sense":
                this.validateSense(msg, errors);
                break;
            case "focus":
                this.validateFocus(msg, errors);
                break;
            case "evaluate":
                this.validateEvaluate(msg, errors);
                break;
            case "move":
                this.validateMove(msg, errors);
                break;
            case "return":
                this.validateReturn(msg, errors);
                break;
        }
        if (errors.length > 0) {
            console.log(`[Membrane] ❌ Message rejected: ${errors.map(e => e.code).join(", ")}`);
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
    /**
     * Validate entry request (Rulebook compliance for initial position)
     *
     * [Purpose] Check if agent properly created EntryRequest after reading Rulebook
     * This determines where in the Sphere the agent will start
     */
    validateEntry(request, errors) {
        if (!request) {
            errors.push({
                code: "MISSING_ENTRY_REQUEST",
                message: "EntryRequest is required",
                field: "request",
            });
            return;
        }
        const constraints = ENTRY_CONSTRAINTS;
        // Validate query
        if (!request.query || typeof request.query !== "string") {
            errors.push({
                code: "INVALID_QUERY",
                message: "query must be a non-empty string",
                field: "request.query",
            });
        }
        else {
            if (request.query.length < constraints.minQueryLength) {
                errors.push({
                    code: "QUERY_TOO_SHORT",
                    message: `query must be at least ${constraints.minQueryLength} characters`,
                    field: "request.query",
                });
            }
            if (request.query.length > constraints.maxQueryLength) {
                errors.push({
                    code: "QUERY_TOO_LONG",
                    message: `query must not exceed ${constraints.maxQueryLength} characters`,
                    field: "request.query",
                });
            }
        }
        // Validate tags array
        if (!Array.isArray(request.tags)) {
            errors.push({
                code: "INVALID_TAGS",
                message: "tags must be an array",
                field: "request.tags",
            });
            return;
        }
        // Tag count validation
        if (request.tags.length < constraints.minTagCount) {
            errors.push({
                code: "TOO_FEW_TAGS",
                message: `Entry requires at least ${constraints.minTagCount} direction tag(s)`,
                field: "request.tags",
            });
        }
        if (request.tags.length > constraints.maxTagCount) {
            errors.push({
                code: "TOO_MANY_TAGS",
                message: `Entry allows at most ${constraints.maxTagCount} tags`,
                field: "request.tags",
            });
        }
        // Individual tag validation
        for (let i = 0; i < request.tags.length; i++) {
            const tag = request.tags[i];
            if (typeof tag !== "string") {
                errors.push({
                    code: "INVALID_TAG_TYPE",
                    message: `tag[${i}] must be a string`,
                    field: `request.tags[${i}]`,
                });
            }
            else if (tag.length === 0) {
                errors.push({
                    code: "EMPTY_TAG",
                    message: `tag[${i}] must not be empty`,
                    field: `request.tags[${i}]`,
                });
            }
            else if (tag.length > constraints.maxTagLength) {
                errors.push({
                    code: "TAG_TOO_LONG",
                    message: `tag[${i}] exceeds ${constraints.maxTagLength} characters`,
                    field: `request.tags[${i}]`,
                });
            }
        }
    }
    /**
     * Validate sense message
     */
    validateSense(msg, errors) {
        if (msg.radius !== undefined) {
            if (typeof msg.radius !== "number" || msg.radius <= 0) {
                errors.push({
                    code: "INVALID_RADIUS",
                    message: "radius must be a positive number",
                    field: "radius",
                });
            }
            // Upper bound check (reasonable limit)
            if (msg.radius > 100) {
                errors.push({
                    code: "RADIUS_TOO_LARGE",
                    message: "radius exceeds maximum (100)",
                    field: "radius",
                });
            }
        }
    }
    /**
     * Validate focus message
     */
    validateFocus(msg, errors) {
        if (!msg.nodeId || typeof msg.nodeId !== "string") {
            errors.push({
                code: "INVALID_NODE_ID",
                message: "nodeId must be a non-empty string",
                field: "nodeId",
            });
        }
    }
    /**
     * Validate evaluate message
     *
     * [2-Layer Evaluation Architecture]
     *   Agent layer: Intuitive 0-10 evaluation per metric (neutral = 5)
     *   - h: Heat evaluation
     *   - w: Weight evaluation
     *   - d: Decay evaluation (higher = faster decay)
     */
    validateEvaluate(msg, errors) {
        if (!msg.nodeId || typeof msg.nodeId !== "string") {
            errors.push({
                code: "INVALID_NODE_ID",
                message: "nodeId must be a non-empty string",
                field: "nodeId",
            });
        }
        // Validate h (heat)
        if (typeof msg.h !== "number") {
            errors.push({
                code: "INVALID_H",
                message: "h must be a number",
                field: "h",
            });
        }
        else if (msg.h < 0 || msg.h > 10) {
            errors.push({
                code: "H_OUT_OF_RANGE",
                message: "h must be between 0 and 10",
                field: "h",
            });
        }
        // Validate w (weight)
        if (typeof msg.w !== "number") {
            errors.push({
                code: "INVALID_W",
                message: "w must be a number",
                field: "w",
            });
        }
        else if (msg.w < 0 || msg.w > 10) {
            errors.push({
                code: "W_OUT_OF_RANGE",
                message: "w must be between 0 and 10",
                field: "w",
            });
        }
        // Validate d (decay)
        if (typeof msg.d !== "number") {
            errors.push({
                code: "INVALID_D",
                message: "d must be a number",
                field: "d",
            });
        }
        else if (msg.d < 0 || msg.d > 10) {
            errors.push({
                code: "D_OUT_OF_RANGE",
                message: "d must be between 0 and 10",
                field: "d",
            });
        }
    }
    /**
     * Validate move message
     */
    validateMove(msg, errors) {
        if (!msg.intent || typeof msg.intent !== "object") {
            errors.push({
                code: "INVALID_INTENT",
                message: "intent must be an object",
                field: "intent",
            });
            return;
        }
        const { drift, toward, toNode, steps, dx, dy, dz } = msg.intent;
        // At least one intent type should be specified
        const hasIntent = drift || toward !== undefined || toNode || dx !== undefined || dy !== undefined || dz !== undefined;
        if (!hasIntent) {
            errors.push({
                code: "EMPTY_INTENT",
                message: "intent must specify at least one movement type (drift, toward, toNode, or dx/dy/dz)",
                field: "intent",
            });
        }
        // Validate drift mode
        if (drift && !["wander", "follow", "orbit"].includes(drift)) {
            errors.push({
                code: "INVALID_DRIFT_MODE",
                message: "drift must be one of: wander, follow, orbit",
                field: "intent.drift",
            });
        }
        // Validate steps
        if (steps !== undefined && (typeof steps !== "number" || steps < 1)) {
            errors.push({
                code: "INVALID_STEPS",
                message: "steps must be a positive number",
                field: "intent.steps",
            });
        }
    }
    /**
     * Validate return message (with optional capsule)
     *
     * [Key] This checks Rulebook compliance for tags, NOT content filtering
     */
    validateReturn(msg, errors) {
        if (!msg.capsule) {
            // Empty-handed return is allowed
            return;
        }
        const capsule = msg.capsule;
        // Check schemaVersion exists
        if (!capsule.schemaVersion) {
            errors.push({
                code: "MISSING_SCHEMA_VERSION",
                message: "capsule must include schemaVersion",
                field: "capsule.schemaVersion",
            });
        }
        // Check timestamp
        if (!capsule.timestamp || typeof capsule.timestamp !== "number") {
            errors.push({
                code: "INVALID_TIMESTAMP",
                message: "capsule must include a valid timestamp",
                field: "capsule.timestamp",
            });
        }
        // Check arrays exist
        if (!Array.isArray(capsule.topTier)) {
            errors.push({
                code: "INVALID_TOP_TIER",
                message: "capsule.topTier must be an array",
                field: "capsule.topTier",
            });
        }
        if (!Array.isArray(capsule.normalNodes)) {
            errors.push({
                code: "INVALID_NORMAL_NODES",
                message: "capsule.normalNodes must be an array",
                field: "capsule.normalNodes",
            });
        }
        if (!Array.isArray(capsule.ghostNodes)) {
            errors.push({
                code: "INVALID_GHOST_NODES",
                message: "capsule.ghostNodes must be an array",
                field: "capsule.ghostNodes",
            });
        }
        // Validate tag decomposition (Rulebook compliance)
        const allNodes = [
            ...(capsule.topTier || []),
            ...(capsule.normalNodes || []),
            ...(capsule.ghostNodes || []),
        ];
        for (let i = 0; i < allNodes.length; i++) {
            const node = allNodes[i];
            this.validateNodeTags(node, i, errors);
        }
    }
    /**
     * Validate node tags for Rulebook compliance
     *
     * [Purpose] Check if agent properly decomposed tags according to Rulebook
     * [NOT] Content filtering or arbitrary rejection
     */
    validateNodeTags(node, index, errors) {
        const quality = INCARNATION_CONSTRAINTS.quality;
        // Tags must be an array
        if (!Array.isArray(node.tags)) {
            errors.push({
                code: "INVALID_TAGS",
                message: `Node[${index}] tags must be an array`,
                field: `nodes[${index}].tags`,
            });
            return;
        }
        // Tags must not be empty (Rulebook requires direction tags)
        if (node.tags.length < quality.minTagCount) {
            errors.push({
                code: "EMPTY_TAGS",
                message: `Node[${index}] must have at least ${quality.minTagCount} tag(s) (Rulebook requirement)`,
                field: `nodes[${index}].tags`,
            });
        }
        // Check tag count limit
        if (node.tags.length > quality.maxTagCount) {
            errors.push({
                code: "TOO_MANY_TAGS",
                message: `Node[${index}] has too many tags: ${node.tags.length} > ${quality.maxTagCount}`,
                field: `nodes[${index}].tags`,
            });
        }
        // Check individual tags are strings
        for (let j = 0; j < node.tags.length; j++) {
            const tag = node.tags[j];
            if (typeof tag !== "string") {
                errors.push({
                    code: "INVALID_TAG_TYPE",
                    message: `Node[${index}] tag[${j}] must be a string`,
                    field: `nodes[${index}].tags[${j}]`,
                });
            }
            else if (tag.length === 0) {
                errors.push({
                    code: "EMPTY_TAG",
                    message: `Node[${index}] tag[${j}] must not be empty`,
                    field: `nodes[${index}].tags[${j}]`,
                });
            }
        }
        // Summary is required (Rulebook requirement)
        if (!node.summary || typeof node.summary !== "string") {
            errors.push({
                code: "INVALID_SUMMARY",
                message: `Node[${index}] summary must be a non-empty string`,
                field: `nodes[${index}].summary`,
            });
        }
        else if (node.summary.length < quality.minSummaryLength) {
            errors.push({
                code: "SUMMARY_TOO_SHORT",
                message: `Node[${index}] summary too short: ${node.summary.length} < ${quality.minSummaryLength}`,
                field: `nodes[${index}].summary`,
            });
        }
    }
}
//# sourceMappingURL=membrane.js.map