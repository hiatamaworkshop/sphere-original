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
import { randomUUID } from "crypto";
import { DEFAULT_ACTIVE_BUS_CONFIG } from "../types/active-bus.js";
/**
 * ActiveBusLayer - Singleton for bus communication
 */
export class ActiveBusLayer {
    config;
    buffer = [];
    handlers = new Set();
    messageCount = 0;
    loggedCount = 0;
    constructor(config = {}) {
        this.config = { ...DEFAULT_ACTIVE_BUS_CONFIG, ...config };
        console.log(`[ActiveBus] Initialized: enabled=${this.config.enabled} ` +
            `bufferSize=${this.config.bufferSize} samplingRate=${this.config.samplingRate}`);
    }
    /**
     * Check if bus is enabled
     */
    isEnabled() {
        return this.config.enabled;
    }
    /**
     * Emit a message to the bus
     *
     * @param senderId Agent ID of sender
     * @param payload Message payload (max 64 bytes)
     * @returns BusMessage if successful, null if disabled or invalid
     */
    emit(senderId, payload) {
        if (!this.config.enabled) {
            return null;
        }
        // Validate payload size
        if (payload.length > this.config.maxPayloadBytes) {
            console.warn(`[ActiveBus] Payload too large: ${payload.length} > ${this.config.maxPayloadBytes}`);
            return null;
        }
        // Create message
        const message = {
            id: randomUUID(),
            timestamp: Date.now(),
            senderId,
            payload,
        };
        // Add to ring buffer (FIFO)
        this.buffer.push(message);
        if (this.buffer.length > this.config.bufferSize) {
            this.buffer.shift(); // Remove oldest
        }
        // Update stats
        this.messageCount++;
        // Sampled logging (70%)
        const shouldLog = Math.random() < this.config.samplingRate;
        if (shouldLog) {
            this.loggedCount++;
            console.log(`[ActiveBus] emit agent=${senderId.slice(0, 8)} ` +
                `size=${payload.length} id=${message.id.slice(0, 8)}`);
        }
        // Broadcast to all handlers (WebSocket push)
        this.broadcast(message);
        return message;
    }
    /**
     * Subscribe to bus messages
     *
     * @param handler Callback for new messages
     * @returns Unsubscribe function
     */
    subscribe(handler) {
        this.handlers.add(handler);
        return () => {
            this.handlers.delete(handler);
        };
    }
    /**
     * Broadcast message to all subscribers
     */
    broadcast(message) {
        for (const handler of this.handlers) {
            try {
                handler(message);
            }
            catch (err) {
                console.error(`[ActiveBus] Handler error:`, err);
            }
        }
    }
    /**
     * Get recent messages (for late joiners or debugging)
     *
     * @param count Number of messages to retrieve (default: all)
     * @returns Recent messages (newest last)
     */
    getRecent(count) {
        if (count === undefined || count >= this.buffer.length) {
            return [...this.buffer];
        }
        return this.buffer.slice(-count);
    }
    /**
     * Get statistics
     */
    getStats() {
        return {
            enabled: this.config.enabled,
            bufferSize: this.config.bufferSize,
            currentSize: this.buffer.length,
            totalMessages: this.messageCount,
            loggedMessages: this.loggedCount,
            subscriberCount: this.handlers.size,
        };
    }
    /**
     * Clear buffer (for testing)
     */
    clear() {
        this.buffer = [];
        this.messageCount = 0;
        this.loggedCount = 0;
    }
}
//# sourceMappingURL=active-bus-layer.js.map