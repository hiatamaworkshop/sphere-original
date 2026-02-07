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
import type { DiveTicket } from "../types/gateway.js";

// ============================================================
// Configuration
// ============================================================

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
export const DEFAULT_TICKET_CONFIG: TicketIssuerConfig = {
  ticketTtl: 300,        // 5 minutes to enter
  sessionTtl: 120,       // 2 minutes inside (visit, not residence)
  rateLimit: {
    maxPerMinute: 30,    // 30 tickets per minute per IP (relaxed for swarm testing)
    maxConcurrent: 10,   // 10 concurrent dives per IP (relaxed for swarm testing)
  },
};

// ============================================================
// Capability Types
// ============================================================

/**
 * Capability kinds (future expansion ready)
 */
export type CapabilityKind = "standard";
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
] as const;

// ============================================================
// Rate Limiter
// ============================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
  activeDives: number;
}

/**
 * Simple in-memory rate limiter
 */
class RateLimiter {
  private entries = new Map<string, RateLimitEntry>();
  private readonly windowMs = 60_000; // 1 minute window

  constructor(private config: TicketIssuerConfig["rateLimit"]) {}

  /**
   * Check if request is allowed
   */
  check(ip: string): { allowed: boolean; reason?: string } {
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
  record(ip: string): void {
    const entry = this.entries.get(ip);
    if (entry) {
      entry.count++;
      entry.activeDives++;
    }
  }

  /**
   * Release an active dive (on session end)
   */
  release(ip: string): void {
    const entry = this.entries.get(ip);
    if (entry && entry.activeDives > 0) {
      entry.activeDives--;
    }
  }

  /**
   * Cleanup old entries (call periodically)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.entries) {
      if (now - entry.windowStart > this.windowMs && entry.activeDives === 0) {
        this.entries.delete(ip);
      }
    }
  }
}

// ============================================================
// Ticket Issuer
// ============================================================

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
export class TicketIssuer {
  private tickets = new Map<string, DiveTicket>();
  private tokenToIp = new Map<string, string>();
  private rateLimiter: RateLimiter;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private config: TicketIssuerConfig = DEFAULT_TICKET_CONFIG) {
    this.rateLimiter = new RateLimiter(config.rateLimit);
  }

  /**
   * Start periodic cleanup
   */
  start(): void {
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
  stop(): void {
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
  issue(ip: string, capability: CapabilityKind = "standard"): TicketResult {
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

    const ticket: DiveTicket = {
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
  validate(token: string): { valid: boolean; ticket?: DiveTicket; error?: string } {
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
  consume(token: string): { success: boolean; sessionTtl?: number; error?: string } {
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
  releaseSession(token: string): void {
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
  getStats(): { activeTickets: number; activeSessions: number } {
    return {
      activeTickets: this.tickets.size,
      activeSessions: this.tokenToIp.size,
    };
  }

  /**
   * Generate an opaque token
   */
  private generateToken(): string {
    return randomBytes(32).toString("hex");
  }

  /**
   * Cleanup expired tickets
   */
  private cleanupExpiredTickets(): void {
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
