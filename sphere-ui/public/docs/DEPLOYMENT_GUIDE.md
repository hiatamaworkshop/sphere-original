# Sphere Deployment Guide

Production Deployment & Operations Guide for Sphere Project

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Sphere                                │
│    High-Dimensional Semantic Space - Where Knowledge Evolves │
└─────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent     │────▶│  Periphery  │────▶│ Renal Core  │
│ (External)  │ WS  │  (Gateway)  │     │  (Physics)  │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## 2. Quick Start

### 2.1 Requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| Node.js | 18.x | 20.x LTS |
| RAM | 2 GB | 8 GB |
| Disk | 1 GB | 10 GB |
| OS | Win/Mac/Linux | Linux |

### 2.2 Startup Procedure

```bash
# 1. Install dependencies
cd docker_compose_sphere_v1/services/periphery
npm install

# 2. Start development mode
npm run dev

# 3. Verify
curl http://localhost:3001/health
```

Windows:
```batch
start-sphere.bat
```

### 2.3 Service Ports

| Service | Port | Protocol |
|---------|------|----------|
| Periphery HTTP | 3001 | HTTP |
| Gateway WS | 8081 | WebSocket |
| Pulse (internal) | 41234 | UDP |

---

## 3. Configuration Parameters

### 3.1 Session Control

```typescript
// services/periphery/src/gateway/ticket-issuer.ts
{
  ticketTtl: 300,      // Ticket expiration (seconds)
  sessionTtl: 120,     // Dive duration (seconds)
  rateLimit: {
    maxPerMinute: 30,  // Per-IP limit
    maxConcurrent: 10, // Concurrent connections limit
  }
}
```

### 3.2 Server Settings

```typescript
// services/periphery/src/types/config.ts
server: {
  port: 3001,      // HTTP
  wsPort: 8081,    // WebSocket
},
perception: {
  targetTotalOps: 100_000,  // Computation load control
},
questStore: {
  maxSize: 100,        // Max quest count (FIFO)
  showcaseSize: 10,    // Showcase display count
},
amberCache: {
  maxSize: 100,                    // Cache size
  showcaseSize: 30,                // Showcase slots
  showcaseRefreshIntervalMs: 3600000,  // 1 hour
  cacheTtlMs: 60000,               // 1 minute
}
```

---

## 4. Scaling

### 4.1 Configuration by Scale

| Concurrent | Configuration | Servers |
|-----------|---------------|---------|
| ~1,000 | Single process | 1 |
| ~10,000 | nginx + Gateway×2 | 3 |
| ~50,000 | + Redis Session | 6-8 |
| ~100,000 | + Core distribution | 10-15 |

### 4.2 nginx Configuration

Key settings:
- WebSocket support (Upgrade header)
- Per-IP rate limiting
- Connection limiting
- Session persistence (ip_hash)

### 4.3 Horizontal Scaling Considerations

| Challenge | Solution |
|-----------|----------|
| Session sharing | Redis Session Store |
| Rate limit sharing | Redis Counter |
| WebSocket routing | ip_hash / sticky session |
| State synchronization | NATS / Redis Pub/Sub |

---

## 5. Performance Benchmarks

### 5.1 At 100,000 Concurrent Connections

| Metric | Value |
|--------|-------|
| New connections | 833 conn/s |
| Messages | 44k msg/s (peak 110k) |
| Memory | ~6.6 GB |
| Bandwidth | 300-700 Mbps |
| Node generation | 30M/day |
| Storage | ~100 GB |

### 5.2 Resource Guidelines (per Gateway)

| Concurrent | CPU | RAM |
|-----------|-----|-----|
| 5,000 | 2 vCPU | 4 GB |
| 10,000 | 4 vCPU | 8 GB |
| 25,000 | 8 vCPU | 16 GB |

---

## 6. Monitoring

### 6.1 Health Checks

```bash
# HTTP
curl http://localhost:3001/health

# WebSocket connections
curl http://localhost:3001/dive/stats
```

### 6.2 Critical Metrics

| Metric | Warning | Critical |
|--------|---------|----------|
| Concurrent connections | 80% of max | 95% |
| Memory usage | 70% | 85% |
| Message latency | 100ms | 500ms |
| Ticket rejection rate | 5% | 15% |
| Error rate | 1% | 5% |

### 6.3 Log Output Examples

```
[TicketIssuer] Issued ticket: abc12345...
[GatewayServer] Agent connected: session-uuid
[GatewayServer] Agent diving: session-uuid (vector dim=384)
[GatewayServer] Connection closed: session-uuid
```

---

## 7. Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| `connect ECONNREFUSED` | Server not running | `npm run dev` |
| `Rate limit exceeded` | IP limit exceeded | Wait 60 seconds |
| `Concurrent limit exceeded` | Connection limit | Wait for session end |
| `Invalid token` | Ticket expired | Re-acquire (300s TTL) |
| `Allocation failed` | Out of memory | Adjust metabolism or add RAM |

---

## 8. Security

| Item | Configuration |
|------|--------------|
| HTTPS | nginx SSL termination |
| CORS | Production domains only |
| Rate Limit | nginx + application |
| Input Validation | Gatekeeper/Membrane |
| Forge API | Auth required (X-Service-Id, X-Service-Secret) |

Important notes:
- Ticket tokens are short-lived (300 seconds)
- Session tokens are single-use
- Capsule content validated by Gatekeeper
- Prohibited patterns filtered by Membrane

---

## 9. File Structure

```
sphere/
├── docker_compose_sphere_v1/
│   └── services/periphery/
│       ├── src/
│       │   ├── gateway/        # WebSocket connection management
│       │   ├── forge/          # Internal node generation
│       │   ├── gatekeeper/     # Validation
│       │   ├── incarnation/    # Pipeline
│       │   ├── rulebook/       # Constraints definition
│       │   └── types/          # Type definitions
│       └── package.json
│
├── start-sphere.bat            # Start
└── stop-sphere.bat             # Stop
```

---

Created: 2025-01-31
Updated: 2026-02-07
Version: v1.1
