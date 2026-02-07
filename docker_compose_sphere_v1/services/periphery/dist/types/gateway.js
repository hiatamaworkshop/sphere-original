/**
 * Sphere Project - Gateway Types
 *
 * [Role] Type definitions for Gateway layer (Agent connection layer)
 * [Design] Based on GATEWAY_DESIGN_MEMO.md decisions
 *
 * [Architecture]
 *   Client/Agent → Gateway (WS) → Sphere Core (Tick/Heat/Grid)
 *
 * [Note] This is SEPARATE from renal-core's internal SphereContext.
 *   - renal-core's SphereContext: For internal agent simulation
 *   - This SphereContext: For external agents connecting via WebSocket
 */
export {};
//# sourceMappingURL=gateway.js.map