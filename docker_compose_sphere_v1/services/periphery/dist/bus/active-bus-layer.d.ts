/**
 * Sphere Project - ActiveBusLayer
 *
 * [Role] AI-to-AI volatile broadcast communication
 * [Design] Ring buffer (FIFO) + WebSocket push
 *
 * [Architecture]
 *   Agent A → emit() → RingBuffer[10] → broadcast() → All Agents
 *                          ↓
 *                    FIFO overflow (oldest discarded)
 *
 * [Philosophy]
 *   - "Air vibration" not "bulletin board"
 *   - Miss it and it's gone
 *   - No persistence, no targeting
 */
import type { BusMessage, ActiveBusConfig, BusMessageHandler } from "../types/active-bus.js";
/**
 * ActiveBusLayer - Singleton for bus communication
 */
export declare class ActiveBusLayer {
    private config;
    private buffer;
    private handlers;
    private messageCount;
    private loggedCount;
    constructor(config?: Partial<ActiveBusConfig>);
    /**
     * Check if bus is enabled
     */
    isEnabled(): boolean;
    /**
     * Emit a message to the bus
     *
     * @param senderId Agent ID of sender
     * @param payload Message payload (max 64 bytes)
     * @returns BusMessage if successful, null if disabled or invalid
     */
    emit(senderId: string, payload: Uint8Array): BusMessage | null;
    /**
     * Subscribe to bus messages
     *
     * @param handler Callback for new messages
     * @returns Unsubscribe function
     */
    subscribe(handler: BusMessageHandler): () => void;
    /**
     * Broadcast message to all subscribers
     */
    private broadcast;
    /**
     * Get recent messages (for late joiners or debugging)
     *
     * @param count Number of messages to retrieve (default: all)
     * @returns Recent messages (newest last)
     */
    getRecent(count?: number): BusMessage[];
    /**
     * Get statistics
     */
    getStats(): {
        enabled: boolean;
        bufferSize: number;
        currentSize: number;
        totalMessages: number;
        loggedMessages: number;
        subscriberCount: number;
    };
    /**
     * Clear buffer (for testing)
     */
    clear(): void;
}
//# sourceMappingURL=active-bus-layer.d.ts.map