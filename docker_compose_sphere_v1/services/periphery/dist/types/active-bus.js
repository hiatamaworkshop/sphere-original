/**
 * Sphere Project - ActiveBus Types
 *
 * [Role] AI-to-AI communication channel
 * [Design] Volatile broadcast - "air vibration", not "bulletin board"
 *
 * [Philosophy]
 *   - Messages are ephemeral (FIFO overflow, no TTL)
 *   - Broadcast to all, no targeting
 *   - Push delivery (WebSocket)
 *   - 70% log sampling for monitoring without overload
 */
/**
 * Default ActiveBus configuration
 */
export const DEFAULT_ACTIVE_BUS_CONFIG = {
    enabled: true,
    protocol: "AI_NATIVE",
    maxPayloadBytes: 64,
    bufferSize: 10,
    samplingRate: 0.7,
};
//# sourceMappingURL=active-bus.js.map