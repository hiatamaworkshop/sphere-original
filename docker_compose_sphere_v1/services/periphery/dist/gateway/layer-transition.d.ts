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
import type { ExperienceLayer, LayerTransitionRequest, LayerTransitionResult, SessionBuffer } from "../types/experience-layer.js";
/**
 * Transition event types
 */
export type TransitionEventType = "beforeTransition" | "afterTransition" | "transitionFailed";
/**
 * Transition event data
 */
export interface TransitionEvent {
    sessionId: string;
    from: ExperienceLayer;
    to: ExperienceLayer;
    timestamp: number;
    flushedCount?: number;
    error?: string;
}
/**
 * Transition event handler
 */
export type TransitionEventHandler = (event: TransitionEvent) => void;
/**
 * Strategy for flushing session buffer
 */
export interface FlushStrategy {
    /**
     * Flush buffered evaluations to Core
     * @returns Number of evaluations successfully flushed
     */
    flush(buffer: SessionBuffer): Promise<number>;
}
/**
 * Default flush strategy: logs and returns count
 */
export declare class DefaultFlushStrategy implements FlushStrategy {
    flush(buffer: SessionBuffer): Promise<number>;
}
/**
 * Layer Transition Manager
 *
 * [Usage]
 *   const manager = new LayerTransitionManager();
 *   manager.on("afterTransition", (e) => console.log(`Transitioned to ${e.to}`));
 *   const result = await manager.transition({ from: "tutorial", to: "sanctuary", buffer });
 */
export declare class LayerTransitionManager {
    private eventHandlers;
    private flushStrategy;
    constructor(flushStrategy?: FlushStrategy);
    /**
     * Execute layer transition
     */
    transition(request: LayerTransitionRequest): Promise<LayerTransitionResult>;
    /**
     * Subscribe to transition events
     */
    on(event: TransitionEventType, handler: TransitionEventHandler): void;
    /**
     * Unsubscribe from transition events
     */
    off(event: TransitionEventType, handler: TransitionEventHandler): void;
    /**
     * Emit transition event
     */
    private emit;
    /**
     * Set flush strategy
     */
    setFlushStrategy(strategy: FlushStrategy): void;
}
/**
 * Get human-readable transition description
 */
export declare function getTransitionDescription(from: ExperienceLayer, to: ExperienceLayer): string;
/**
 * Check if transition requires buffer flush
 */
export declare function requiresFlush(from: ExperienceLayer, to: ExperienceLayer): boolean;
/**
 * Check if transition discards buffer
 */
export declare function discardsBuffer(from: ExperienceLayer, _to: ExperienceLayer): boolean;
//# sourceMappingURL=layer-transition.d.ts.map