/**
 * Sphere Project - Bus Module
 *
 * [Role] Inter-agent communication channels
 * [Components]
 *   - ActiveBusLayer: Volatile broadcast communication
 */

export { ActiveBusLayer } from "./active-bus-layer.js";
export type {
  BusMessage,
  ActiveBusConfig,
  BusMessageHandler,
} from "../types/active-bus.js";
export { DEFAULT_ACTIVE_BUS_CONFIG } from "../types/active-bus.js";
