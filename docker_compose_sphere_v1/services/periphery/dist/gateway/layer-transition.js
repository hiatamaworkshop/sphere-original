/**
 * Sphere Project - Layer Transition Manager
 *
 * [Role] Manage transitions between Tutorial → Sanctuary → Core layers
 *
 * [Design] Orchestrates layer transitions with proper state management
 *   - Validates transition rules
 *   - Handles buffer flush/discard
 *   - Emits transition events
 *
 * [Flow]
 *   Tutorial → Sanctuary: Parser complete or manual skip
 *   Sanctuary → Core: Agent chooses to incarnate
 *   Any → Return: End session (handled by SphereContext.return())
 */
import { isValidTransition, LAYER_CHARACTERISTICS, } from "../types/experience-layer.js";
/**
 * Default flush strategy: logs and returns count
 */
export class DefaultFlushStrategy {
    async flush(buffer) {
        const count = buffer.temporaryEvaluations.size;
        console.log(`[FlushStrategy] Flushing ${count} evaluations from session ${buffer.sessionId}`);
        // In production, this would write to ProjDB via adapter
        // For now, just clear and return count
        buffer.temporaryEvaluations.clear();
        return count;
    }
}
// ============================================================
// Layer Transition Manager
// ============================================================
/**
 * Layer Transition Manager
 *
 * [Usage]
 *   const manager = new LayerTransitionManager();
 *   manager.on("afterTransition", (e) => console.log(`Transitioned to ${e.to}`));
 *   const result = await manager.transition({ from: "tutorial", to: "sanctuary", buffer });
 */
export class LayerTransitionManager {
    eventHandlers = new Map();
    flushStrategy;
    constructor(flushStrategy) {
        this.flushStrategy = flushStrategy ?? new DefaultFlushStrategy();
    }
    /**
     * Execute layer transition
     */
    async transition(request) {
        const { from, to, buffer } = request;
        const timestamp = Date.now();
        // Validate transition
        if (!isValidTransition(from, to)) {
            const error = `Invalid transition: ${from} → ${to}`;
            this.emit("transitionFailed", {
                sessionId: buffer?.sessionId ?? "unknown",
                from,
                to,
                timestamp,
                error,
            });
            return {
                success: false,
                newLayer: from,
                error,
            };
        }
        // Emit before event
        this.emit("beforeTransition", {
            sessionId: buffer?.sessionId ?? "unknown",
            from,
            to,
            timestamp,
        });
        let flushedCount = 0;
        // Handle buffer based on transition type
        if (buffer) {
            if (to === "core" && from === "sanctuary") {
                // Sanctuary → Core: Flush buffered evaluations
                flushedCount = await this.flushStrategy.flush(buffer);
                console.log(`[LayerTransition] Flushed ${flushedCount} evaluations to Core`);
            }
            else if (from === "tutorial") {
                // Tutorial → Any: Discard buffer (practice mode)
                buffer.temporaryEvaluations.clear();
                console.log(`[LayerTransition] Discarded Tutorial buffer`);
            }
            // Update buffer's layer
            buffer.layer = to;
        }
        // Log transition characteristics
        const fromChars = LAYER_CHARACTERISTICS[from];
        const toChars = LAYER_CHARACTERISTICS[to];
        console.log(`[LayerTransition] ${from} → ${to}`);
        console.log(`  From: canEvaluate=${fromChars.canEvaluate}, hasTick=${fromChars.hasTick}`);
        console.log(`  To: canEvaluate=${toChars.canEvaluate}, hasTick=${toChars.hasTick}`);
        // Emit after event
        this.emit("afterTransition", {
            sessionId: buffer?.sessionId ?? "unknown",
            from,
            to,
            timestamp,
            flushedCount,
        });
        return {
            success: true,
            newLayer: to,
            flushedCount,
        };
    }
    /**
     * Subscribe to transition events
     */
    on(event, handler) {
        const handlers = this.eventHandlers.get(event) ?? [];
        handlers.push(handler);
        this.eventHandlers.set(event, handlers);
    }
    /**
     * Unsubscribe from transition events
     */
    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index >= 0) {
                handlers.splice(index, 1);
            }
        }
    }
    /**
     * Emit transition event
     */
    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data);
                }
                catch (err) {
                    console.error(`[LayerTransition] Event handler error:`, err);
                }
            }
        }
    }
    /**
     * Set flush strategy
     */
    setFlushStrategy(strategy) {
        this.flushStrategy = strategy;
    }
}
// ============================================================
// Helper Functions
// ============================================================
/**
 * Get human-readable transition description
 */
export function getTransitionDescription(from, to) {
    if (from === "tutorial" && to === "sanctuary") {
        return "Entering Sanctuary - exploration begins (read-only)";
    }
    if (from === "tutorial" && to === "core") {
        return "Direct dive to Core - live world access";
    }
    if (from === "sanctuary" && to === "core") {
        return "Entering Core - evaluations will be incarnated";
    }
    return `${from} → ${to}`;
}
/**
 * Check if transition requires buffer flush
 */
export function requiresFlush(from, to) {
    return from === "sanctuary" && to === "core";
}
/**
 * Check if transition discards buffer
 */
export function discardsBuffer(from, _to) {
    return from === "tutorial";
}
//# sourceMappingURL=layer-transition.js.map