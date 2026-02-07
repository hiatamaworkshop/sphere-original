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
 * Bus Message: Single communication unit
 */
export interface BusMessage {
    /** Unique message ID */
    id: string;
    /** Timestamp (ms) */
    timestamp: number;
    /** Sender agent ID */
    senderId: string;
    /** Payload (max 64 bytes) */
    payload: Uint8Array;
}
/**
 * ActiveBus Configuration
 */
export interface ActiveBusConfig {
    /** Enable/disable the bus */
    enabled: boolean;
    /** Protocol type */
    protocol: "TEXT" | "AI_NATIVE";
    /** Max payload size in bytes */
    maxPayloadBytes: number;
    /** Ring buffer size (FIFO) */
    bufferSize: number;
    /** Log sampling rate (0.0-1.0) */
    samplingRate: number;
}
/**
 * Default ActiveBus configuration
 */
export declare const DEFAULT_ACTIVE_BUS_CONFIG: ActiveBusConfig;
/**
 * Bus Event Handler type
 */
export type BusMessageHandler = (message: BusMessage) => void;
//# sourceMappingURL=active-bus.d.ts.map