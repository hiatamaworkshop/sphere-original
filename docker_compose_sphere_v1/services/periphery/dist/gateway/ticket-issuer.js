/**
 * Sphere Project - Dive Ticket Issuer
 *
 * [Role] Issue and manage Dive Tickets for Sphere entry
 * [Design] Based on GATEWAY_DESIGN_MEMO.md decisions
 *
 * [Ticket Lifecycle]
 *   1. Agent requests ticket via POST /dive/request
 *   2. Ticket issued with TTL (entry grace period)
 *   3. Agent connects to Gateway with ticket
 *   4. Ticket consumed → Session starts (separate TTL)
 *   5. Session expires or agent returns
 */
import { randomBytes } from "crypto";
/**
 * Default configuration
 */
export const DEFAULT_TICKET_CONFIG = {
    ticketTtl: 300, // 5 minutes to enter
    sessionTtl: 120, // 2 minutes inside (visit, not residence)
    rateLimit: {
        maxPerMinute: 30, // 30 tickets per minute per IP (relaxed for swarm testing)
        maxConcurrent: 30, // 30 concurrent dives per IP (increased for parallel testing)
    },
};
// Future: "readOnly" | "observeOnly" | "linker"
/**
 * Standard capabilities
 */
export const STANDARD_CAPABILITIES = [
    "sense",
    "move",
    "focus",
    "emit",
    "return",
];
/**
 * Simple in-memory rate limiter
 */
class RateLimiter {
    config;
    entries = new Map();
    windowMs = 60_000; // 1 minute window
    constructor(config) {
        this.config = config;
    }
    /**
     * Check if request is allowed
     */
    check(ip) {
        const now = Date.now();
        let entry = this.entries.get(ip);
        // Clean up old entry
        if (entry && now - entry.windowStart > this.windowMs) {
            entry = { count: 0, windowStart: now, activeDives: entry.activeDives };
            this.entries.set(ip, entry);
        }
        if (!entry) {
            entry = { count: 0, windowStart: now, activeDives: 0 };
            this.entries.set(ip, entry);
        }
        // Check rate limit
        if (entry.count >= this.config.maxPerMinute) {
            return {
                allowed: false,
                reason: `Rate limit exceeded: ${this.config.maxPerMinute}/minute`,
            };
        }
        // Check concurrent limit
        if (entry.activeDives >= this.config.maxConcurrent) {
            return {
                allowed: false,
                reason: `Concurrent limit exceeded: ${this.config.maxConcurrent} active dives`,
            };
        }
        return { allowed: true };
    }
    /**
     * Record a ticket issuance
     */
    record(ip) {
        const entry = this.entries.get(ip);
        if (entry) {
            entry.count++;
            entry.activeDives++;
        }
    }
    /**
     * Release an active dive (on session end)
     */
    release(ip) {
        const entry = this.entries.get(ip);
        if (entry && entry.activeDives > 0) {
            entry.activeDives--;
        }
    }
    /**
     * Cleanup old entries (call periodically)
     */
    cleanup() {
        const now = Date.now();
        for (const [ip, entry] of this.entries) {
            if (now - entry.windowStart > this.windowMs && entry.activeDives === 0) {
                this.entries.delete(ip);
            }
        }
    }
}
/**
 * Dive Ticket Issuer
 *
 * [Responsibilities]
 * - Generate opaque tokens
 * - Track active tickets
 * - Rate limiting
 * - Ticket validation and consumption
 */
export class TicketIssuer {
    config;
    tickets = new Map();
    tokenToIp = new Map();
    rateLimiter;
    cleanupInterval = null;
    constructor(config = DEFAULT_TICKET_CONFIG) {
        this.config = config;
        this.rateLimiter = new RateLimiter(config.rateLimit);
    }
    /**
     * Start periodic cleanup
     */
    start() {
        // Cleanup every 30 seconds
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredTickets();
            this.rateLimiter.cleanup();
        }, 30_000);
        console.log("[TicketIssuer] Started with config:", {
            ticketTtl: this.config.ticketTtl,
            sessionTtl: this.config.sessionTtl,
            rateLimit: this.config.rateLimit,
        });
    }
    /**
     * Stop periodic cleanup
     */
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
    /**
     * Issue a new Dive Ticket
     *
     * @param ip Requester's IP (for rate limiting)
     * @param capability Capability kind (default: standard)
     */
    issue(ip, capability = "standard") {
        // Rate limit check
        const rateCheck = this.rateLimiter.check(ip);
        if (!rateCheck.allowed) {
            console.log(`[TicketIssuer] Rate limited: ${ip} - ${rateCheck.reason}`);
            return {
                success: false,
                error: rateCheck.reason,
            };
        }
        // Generate opaque token
        const token = this.generateToken();
        const now = Date.now();
        const ticket = {
            token,
            issuedAt: now,
            ttl: this.config.ticketTtl,
            capsRef: capability,
        };
        // Store ticket
        this.tickets.set(token, ticket);
        this.tokenToIp.set(token, ip);
        this.rateLimiter.record(ip);
        console.log(`[TicketIssuer] Issued ticket: ${token.substring(0, 8)}... (IP: ${ip})`);
        return {
            success: true,
            ticket,
        };
    }
    /**
     * Validate a ticket (check if valid and not expired)
     */
    validate(token) {
        const ticket = this.tickets.get(token);
        if (!ticket) {
            return { valid: false, error: "Ticket not found" };
        }
        const now = Date.now();
        const expiresAt = ticket.issuedAt + ticket.ttl * 1000;
        if (now > expiresAt) {
            // Cleanup expired ticket
            this.tickets.delete(token);
            this.tokenToIp.delete(token);
            return { valid: false, error: "Ticket expired" };
        }
        return { valid: true, ticket };
    }
    /**
     * Consume a ticket (mark as used, start session)
     * Returns session TTL for the dive
     */
    consume(token) {
        const validation = this.validate(token);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }
        // Remove ticket (one-time use)
        this.tickets.delete(token);
        console.log(`[TicketIssuer] Consumed ticket: ${token.substring(0, 8)}...`);
        return {
            success: true,
            sessionTtl: this.config.sessionTtl,
        };
    }
    /**
     * Release a session (call when dive ends)
     */
    releaseSession(token) {
        const ip = this.tokenToIp.get(token);
        if (ip) {
            this.rateLimiter.release(ip);
            this.tokenToIp.delete(token);
            console.log(`[TicketIssuer] Released session for IP: ${ip}`);
        }
    }
    /**
     * Get current stats
     */
    getStats() {
        return {
            activeTickets: this.tickets.size,
            activeSessions: this.tokenToIp.size,
        };
    }
    /**
     * Generate an opaque token
     */
    generateToken() {
        return randomBytes(32).toString("hex");
    }
    /**
     * Cleanup expired tickets
     */
    cleanupExpiredTickets() {
        const now = Date.now();
        let cleaned = 0;
        for (const [token, ticket] of this.tickets) {
            const expiresAt = ticket.issuedAt + ticket.ttl * 1000;
            if (now > expiresAt) {
                this.tickets.delete(token);
                // Also release the IP rate limit
                const ip = this.tokenToIp.get(token);
                if (ip) {
                    this.rateLimiter.release(ip);
                    this.tokenToIp.delete(token);
                }
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`[TicketIssuer] Cleaned ${cleaned} expired tickets`);
        }
    }
}
//# sourceMappingURL=ticket-issuer.js.map