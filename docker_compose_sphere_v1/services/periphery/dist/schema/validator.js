/**
 * Sphere Project - Schema Validator
 *
 * [Role] Dynamic validation based on JSON schema definitions
 * [Design] Stateless, pure function validation
 */
/**
 * Validate data against a schema definition
 *
 * @param data - Data to validate
 * @param schema - Schema definition
 * @param registry - All schemas (for resolving "items" references)
 * @param fieldPrefix - Field path prefix (for nested validation)
 * @returns Array of validation errors (empty = valid)
 */
export function validateAgainstSchema(data, schema, registry, fieldPrefix = "") {
    const errors = [];
    if (typeof data !== "object" || data === null) {
        errors.push({
            code: "INVALID_TYPE",
            message: `Expected object, got ${typeof data}`,
            field: fieldPrefix || "root",
        });
        return errors;
    }
    const obj = data;
    // Check each field defined in schema
    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
        const fieldPath = fieldPrefix ? `${fieldPrefix}.${fieldName}` : fieldName;
        const value = obj[fieldName];
        // Required check
        if (fieldDef.required && (value === undefined || value === null)) {
            errors.push({
                code: "REQUIRED_FIELD_MISSING",
                message: `Required field '${fieldName}' is missing`,
                field: fieldPath,
            });
            continue;
        }
        // Skip validation if field is not present and not required
        if (value === undefined || value === null) {
            continue;
        }
        // Type-specific validation
        const fieldErrors = validateField(value, fieldDef, fieldPath, registry);
        errors.push(...fieldErrors);
    }
    return errors;
}
/**
 * Validate a single field value
 */
function validateField(value, fieldDef, fieldPath, registry) {
    const errors = [];
    switch (fieldDef.type) {
        case "string":
            errors.push(...validateString(value, fieldDef, fieldPath));
            break;
        case "number":
            errors.push(...validateNumber(value, fieldDef, fieldPath));
            break;
        case "boolean":
            errors.push(...validateBoolean(value, fieldPath));
            break;
        case "string[]":
            errors.push(...validateStringArray(value, fieldDef, fieldPath));
            break;
        case "array":
            errors.push(...validateObjectArray(value, fieldDef, fieldPath, registry));
            break;
    }
    return errors;
}
/**
 * Validate string field
 */
function validateString(value, fieldDef, fieldPath) {
    const errors = [];
    if (typeof value !== "string") {
        errors.push({
            code: "INVALID_TYPE",
            message: `Expected string, got ${typeof value}`,
            field: fieldPath,
        });
        return errors;
    }
    // maxLength check
    if (fieldDef.maxLength !== undefined && value.length > fieldDef.maxLength) {
        errors.push({
            code: "STRING_TOO_LONG",
            message: `String exceeds max length: ${value.length} > ${fieldDef.maxLength}`,
            field: fieldPath,
            actual: value.length,
            limit: fieldDef.maxLength,
        });
    }
    // pattern check
    if (fieldDef.pattern !== undefined) {
        const regex = new RegExp(fieldDef.pattern);
        if (!regex.test(value)) {
            errors.push({
                code: "PATTERN_MISMATCH",
                message: `String does not match pattern: ${fieldDef.pattern}`,
                field: fieldPath,
                actual: value,
                limit: fieldDef.pattern,
            });
        }
    }
    return errors;
}
/**
 * Validate number field
 */
function validateNumber(value, fieldDef, fieldPath) {
    const errors = [];
    if (typeof value !== "number" || Number.isNaN(value)) {
        errors.push({
            code: "INVALID_TYPE",
            message: `Expected number, got ${typeof value}`,
            field: fieldPath,
        });
        return errors;
    }
    // min check
    if (fieldDef.min !== undefined && value < fieldDef.min) {
        errors.push({
            code: "NUMBER_TOO_SMALL",
            message: `Number below minimum: ${value} < ${fieldDef.min}`,
            field: fieldPath,
            actual: value,
            limit: fieldDef.min,
        });
    }
    // max check (for numbers, not array length)
    if (fieldDef.max !== undefined && fieldDef.type === "number" && value > fieldDef.max) {
        errors.push({
            code: "NUMBER_TOO_LARGE",
            message: `Number exceeds maximum: ${value} > ${fieldDef.max}`,
            field: fieldPath,
            actual: value,
            limit: fieldDef.max,
        });
    }
    return errors;
}
/**
 * Validate boolean field
 */
function validateBoolean(value, fieldPath) {
    const errors = [];
    if (typeof value !== "boolean") {
        errors.push({
            code: "INVALID_TYPE",
            message: `Expected boolean, got ${typeof value}`,
            field: fieldPath,
        });
    }
    return errors;
}
/**
 * Validate string array field (e.g., tags)
 */
function validateStringArray(value, fieldDef, fieldPath) {
    const errors = [];
    if (!Array.isArray(value)) {
        errors.push({
            code: "INVALID_TYPE",
            message: `Expected array, got ${typeof value}`,
            field: fieldPath,
        });
        return errors;
    }
    // Check array length constraints
    const arrayLength = value.length;
    if (fieldDef.minItems !== undefined && arrayLength < fieldDef.minItems) {
        errors.push({
            code: "ARRAY_TOO_SHORT",
            message: `Array has too few items: ${arrayLength} < ${fieldDef.minItems}`,
            field: fieldPath,
            actual: arrayLength,
            limit: fieldDef.minItems,
        });
    }
    const maxItems = fieldDef.maxItems ?? fieldDef.max;
    if (maxItems !== undefined && arrayLength > maxItems) {
        errors.push({
            code: "ARRAY_TOO_LONG",
            message: `Array has too many items: ${arrayLength} > ${maxItems}`,
            field: fieldPath,
            actual: arrayLength,
            limit: maxItems,
        });
    }
    // Check each element is a string
    for (let i = 0; i < value.length; i++) {
        if (typeof value[i] !== "string") {
            errors.push({
                code: "INVALID_ARRAY_ELEMENT",
                message: `Array element [${i}] must be string, got ${typeof value[i]}`,
                field: `${fieldPath}[${i}]`,
            });
        }
    }
    return errors;
}
/**
 * Validate object array field (e.g., topTier: NodeSeed[])
 */
function validateObjectArray(value, fieldDef, fieldPath, registry) {
    const errors = [];
    if (!Array.isArray(value)) {
        errors.push({
            code: "INVALID_TYPE",
            message: `Expected array, got ${typeof value}`,
            field: fieldPath,
        });
        return errors;
    }
    // Check array length constraints
    const arrayLength = value.length;
    const maxItems = fieldDef.maxItems ?? fieldDef.max;
    if (maxItems !== undefined && arrayLength > maxItems) {
        errors.push({
            code: "ARRAY_TOO_LONG",
            message: `Array has too many items: ${arrayLength} > ${maxItems}`,
            field: fieldPath,
            actual: arrayLength,
            limit: maxItems,
        });
    }
    // Validate each element against referenced schema
    if (fieldDef.items) {
        const itemSchema = registry.get(fieldDef.items);
        if (!itemSchema) {
            errors.push({
                code: "SCHEMA_NOT_FOUND",
                message: `Referenced schema '${fieldDef.items}' not found`,
                field: fieldPath,
            });
            return errors;
        }
        for (let i = 0; i < value.length; i++) {
            const itemErrors = validateAgainstSchema(value[i], itemSchema, registry, `${fieldPath}[${i}]`);
            errors.push(...itemErrors);
        }
    }
    return errors;
}
/**
 * Calculate total payload bytes for a capsule
 * (Composite constraint validation)
 */
export function calculatePayloadBytes(capsule) {
    if (typeof capsule !== "object" || capsule === null) {
        return 0;
    }
    const encoder = new TextEncoder();
    let totalBytes = 0;
    const obj = capsule;
    const allNodes = [
        ...(Array.isArray(obj.topTier) ? obj.topTier : []),
        ...(Array.isArray(obj.normalNodes) ? obj.normalNodes : []),
        ...(Array.isArray(obj.ghostNodes) ? obj.ghostNodes : []),
    ];
    for (const node of allNodes) {
        if (typeof node !== "object" || node === null)
            continue;
        const n = node;
        if (typeof n.summary === "string") {
            totalBytes += encoder.encode(n.summary).length;
        }
        if (typeof n.content === "string") {
            totalBytes += encoder.encode(n.content).length;
        }
        if (Array.isArray(n.links)) {
            totalBytes += encoder.encode(n.links.join(",")).length;
        }
        if (typeof n.ref_url === "string") {
            totalBytes += encoder.encode(n.ref_url).length;
        }
        if (typeof n.sourceNodeId === "string") {
            totalBytes += encoder.encode(n.sourceNodeId).length;
        }
    }
    return totalBytes;
}
/**
 * Validate composite constraints (cross-field rules)
 */
export function validateConstraints(capsule, schema) {
    const errors = [];
    if (!schema.constraints) {
        return errors;
    }
    // maxTotalPayloadBytes
    if (schema.constraints.maxTotalPayloadBytes !== undefined) {
        const totalBytes = calculatePayloadBytes(capsule);
        if (totalBytes > schema.constraints.maxTotalPayloadBytes) {
            errors.push({
                code: "PAYLOAD_TOO_LARGE",
                message: `Total payload size exceeds limit: ${totalBytes} > ${schema.constraints.maxTotalPayloadBytes} bytes`,
                field: "totalPayload",
                actual: totalBytes,
                limit: schema.constraints.maxTotalPayloadBytes,
            });
        }
    }
    return errors;
}
//# sourceMappingURL=validator.js.map