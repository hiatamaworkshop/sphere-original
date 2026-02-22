/**
 * Sphere Project - AutoCapsule Types
 *
 * [Role] Server-authoritative action record
 * [Principle] 「まず記録、意味は後」
 *   - No meaning, tags, or vectors
 *   - Only nodeIds and metrics
 *   - Computation is cheap, post-processing is flexible
 *
 * [Design] Based on Agent Action Pipeline in CLAUDE.md
 */
/**
 * Create empty action log
 */
export function createActionLog(sessionId) {
    return {
        sessionId,
        startTime: Date.now(),
        events: [],
    };
}
/**
 * Add event to action log
 */
export function logAction(log, event) {
    log.events.push(event);
}
// ============================================================
// AutoCapsule Builder
// ============================================================
/**
 * Build AutoCapsule from ActionLog
 *
 * [Process]
 *   1. Aggregate focus events per node
 *   2. Calculate visit records
 *   3. Compute summary metrics
 */
export function buildAutoCapsule(log) {
    const endTime = Date.now();
    const duration = endTime - log.startTime;
    // Track per-node data
    const nodeData = new Map();
    // Process events
    for (const event of log.events) {
        switch (event.type) {
            case "focus": {
                const data = nodeData.get(event.nodeId) || {
                    kind: event.kind,
                    stayTime: 0,
                    focusCount: 0,
                    heatDelta: 0,
                    maxHeat: 0,
                };
                data.focusCount++;
                data.maxHeat = Math.max(data.maxHeat, event.heatAtFocus);
                nodeData.set(event.nodeId, data);
                break;
            }
            case "focusEnd": {
                const data = nodeData.get(event.nodeId);
                if (data) {
                    data.stayTime += event.duration;
                    data.heatDelta += event.heatDelta;
                }
                break;
            }
            case "move": {
                // Move events tracked for session stats only
                break;
            }
            case "evaluate": {
                // Evaluations are tracked but don't affect AutoCapsule directly
                // The heat delta comes from focusEnd
                break;
            }
        }
    }
    // Build visits array
    const visits = [];
    let totalFocus = 0;
    let totalStayTime = 0;
    let maxHeatTouched = 0;
    for (const [nodeId, data] of nodeData) {
        visits.push({
            nodeId,
            kind: data.kind,
            stayTime: data.stayTime,
            focusCount: data.focusCount,
            heatDelta: data.heatDelta,
        });
        totalFocus += data.focusCount;
        totalStayTime += data.stayTime;
        maxHeatTouched = Math.max(maxHeatTouched, data.maxHeat);
    }
    // Sort visits by focus count (most focused first)
    visits.sort((a, b) => b.focusCount - a.focusCount);
    return {
        sessionId: log.sessionId,
        duration,
        visits,
        summaryMetrics: {
            totalFocus,
            uniqueNodes: nodeData.size,
            totalStayTime,
            maxHeatTouched,
        },
    };
}
//# sourceMappingURL=auto-capsule.js.map