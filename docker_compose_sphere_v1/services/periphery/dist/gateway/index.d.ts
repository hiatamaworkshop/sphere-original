/**
 * Sphere Project - Gateway Module
 *
 * [Role] Agent connection layer for Sphere access
 * [Components]
 *   - TicketIssuer: Dive ticket management
 *   - GatewayServer: WebSocket connection handling
 *   - SphereContext: Capability-based API for agents
 */
export { TicketIssuer, DEFAULT_TICKET_CONFIG, STANDARD_CAPABILITIES, type TicketIssuerConfig, type CapabilityKind, type TicketResult, } from "./ticket-issuer.js";
export { GatewayServer, DEFAULT_GATEWAY_CONFIG, type GatewayServerConfig, } from "./gateway-server.js";
export { SphereContextImpl, createSphereContext, createMockSphereContext, type CreateSphereContextOptions, } from "./sphere-context.js";
export { SphereCoreAdapter, type SphereCoreAdapterConfig, } from "./sphere-core-adapter.js";
export { LayerTransitionManager, DefaultFlushStrategy, getTransitionDescription, requiresFlush, discardsBuffer, type TransitionEventType, type TransitionEvent, type TransitionEventHandler, type FlushStrategy, } from "./layer-transition.js";
export { QuestStore, type QuestStoreConfig, type QuestSummary, } from "./quest-store.js";
export { UnifiedAmberCache, createAmberCache, type AmberCacheConfig, } from "./amber-cache.js";
//# sourceMappingURL=index.d.ts.map