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
import type { DiveTicket } from "../types/gateway.js";
/**
 * Ticket Issuer Configuration
 */
export interface TicketIssuerConfig {
    /** Ticket TTL in seconds (entry grace period) */
    ticketTtl: number;
    /** Session TTL in seconds (dive duration) */
    sessionTtl: number;
    /** Rate limit: max tickets per IP per minute */
    rateLimit: {
        maxPerMinute: number;
        maxConcurrent: number;
    };
}
/**
 * Default configuration
 */
export declare const DEFAULT_TICKET_CONFIG: TicketIssuerConfig;
/**
 * Capability kinds (future expansion ready)
 */
export type CapabilityKind = "standard";
/**
 * Standard capabilities
 */
export declare const STANDARD_CAPABILITIES: readonly ["sense", "move", "focus", "emit", "return"];
/**
 * Ticket issuance result
 */
export interface TicketResult {
    success: boolean;
    ticket?: DiveTicket;
    error?: string;
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
export declare class TicketIssuer {
    private config;
    private tickets;
    private tokenToIp;
    private rateLimiter;
    private cleanupInterval;
    constructor(config?: TicketIssuerConfig);
    /**
     * Start periodic cleanup
     */
    start(): void;
    /**
     * Stop periodic cleanup
     */
    stop(): void;
    /**
     * Issue a new Dive Ticket
     *
     * @param ip Requester's IP (for rate limiting)
     * @param capability Capability kind (default: standard)
     */
    issue(ip: string, capability?: CapabilityKind): TicketResult;
    /**
     * Validate a ticket (check if valid and not expired)
     */
    validate(token: string): {
        valid: boolean;
        ticket?: DiveTicket;
        error?: string;
    };
    /**
     * Consume a ticket (mark as used, start session)
     * Returns session TTL for the dive
     */
    consume(token: string): {
        success: boolean;
        sessionTtl?: number;
        error?: string;
    };
    /**
     * Release a session (call when dive ends)
     */
    releaseSession(token: string): void;
    /**
     * Get current stats
     */
    getStats(): {
        activeTickets: number;
        activeSessions: number;
    };
    /**
     * Generate an opaque token
     */
    private generateToken;
    /**
     * Cleanup expired tickets
     */
    private cleanupExpiredTickets;
}
//# sourceMappingURL=ticket-issuer.d.ts.map