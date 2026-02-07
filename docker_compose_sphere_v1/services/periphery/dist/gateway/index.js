/**
 * Sphere Project - Gateway Module
 *
 * [Role] Agent connection layer for Sphere access
 * [Components]
 *   - TicketIssuer: Dive ticket management
 *   - GatewayServer: WebSocket connection handling
 *   - SphereContext: Capability-based API for agents
 */
// Ticket Issuer
export { TicketIssuer, DEFAULT_TICKET_CONFIG, STANDARD_CAPABILITIES, } from "./ticket-issuer.js";
// Gateway Server
export { GatewayServer, DEFAULT_GATEWAY_CONFIG, } from "./gateway-server.js";
// SphereContext
export { SphereContextImpl, createSphereContext, createMockSphereContext, } from "./sphere-context.js";
// SphereCore Adapter
export { SphereCoreAdapter, } from "./sphere-core-adapter.js";
// Layer Transition (3-Layer Piping)
export { LayerTransitionManager, DefaultFlushStrategy, getTransitionDescription, requiresFlush, discardsBuffer, } from "./layer-transition.js";
// Quest Store
export { QuestStore, } from "./quest-store.js";
// Amber Cache (Unified Showcase + Dynamic)
export { UnifiedAmberCache, createAmberCache, } from "./amber-cache.js";
//# sourceMappingURL=index.js.map