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
export {
  TicketIssuer,
  DEFAULT_TICKET_CONFIG,
  STANDARD_CAPABILITIES,
  type TicketIssuerConfig,
  type CapabilityKind,
  type TicketResult,
} from "./ticket-issuer.js";

// Gateway Server
export {
  GatewayServer,
  DEFAULT_GATEWAY_CONFIG,
  type GatewayServerConfig,
} from "./gateway-server.js";

// SphereContext
export {
  SphereContextImpl,
  createSphereContext,
  createMockSphereContext,
  type CreateSphereContextOptions,
} from "./sphere-context.js";

// SphereCore Adapter
export {
  SphereCoreAdapter,
  type SphereCoreAdapterConfig,
} from "./sphere-core-adapter.js";

// Layer Transition (3-Layer Piping)
export {
  LayerTransitionManager,
  DefaultFlushStrategy,
  getTransitionDescription,
  requiresFlush,
  discardsBuffer,
  type TransitionEventType,
  type TransitionEvent,
  type TransitionEventHandler,
  type FlushStrategy,
} from "./layer-transition.js";

// Quest Store
export {
  QuestStore,
  type QuestStoreConfig,
  type QuestSummary,
} from "./quest-store.js";

// Amber Cache (Unified Showcase + Dynamic)
export {
  UnifiedAmberCache,
  createAmberCache,
  type AmberCacheConfig,
} from "./amber-cache.js";
