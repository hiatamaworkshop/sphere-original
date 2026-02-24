# Sphere — Developer Guide
---

## Prerequisites

- Docker Desktop (latest)
- Docker Compose v2

---

## Starting the Server

```bash
# Infrastructure only (periphery + postgres + redis + minio + ollama + digestor)
docker compose up -d

# With AI agent daemon (phi3:mini explorer)
docker compose --profile agent up -d

# Stop agent, keep infrastructure running
docker compose stop phi-agent

# Full shutdown
docker compose down
```

### Health Check

```bash
curl http://localhost:3001/health
```

```json
{ "status": "ok", "uptime": 123.4 }
```

---

## HTTP API Reference

Base URL: `http://localhost:3001`

### Status & Monitoring

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Sphere info + endpoint list |
| `GET` | `/health` | Health check (LB / monitoring) |
| `GET` | `/metrics` | System metrics (node count, agent count, uptime) |
| `GET` | `/sphere/status` | Detailed Sphere state |
| `GET` | `/sphere/snapshot` | Digestor snapshot (scoring data) |
| `GET` | `/sphere/manifest` | Sphere configuration manifest |
| `GET` | `/sanctification` | Sanctification (ascension) status |

### Nodes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/nodes/metrics` | All nodes ordered by heat |
| `GET` | `/nodes/stats` | Node counts by kind (active/ghost/fossil/amber) |
| `GET` | `/nodes/:id` | Single node detail |

### Search

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sphere/explore` | Vector similarity search |

```bash
# Example: find nodes similar to "quantum mechanics"
curl "http://localhost:3001/sphere/explore?q=quantum+mechanics&limit=10"
```

### Data Ingestion

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sphere/contribute` | Submit nodes (single or batch) |

```bash
# Single node
curl -X POST http://localhost:3001/sphere/contribute \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Gödel incompleteness theorem",
    "tags": ["mathematics", "logic"],
    "content": "Any consistent formal system contains true statements it cannot prove.",
    "flags": 0,
    "importance": 0.92
  }'

# Batch (via mock tool)
docker compose exec periphery node dist/mock/contribution.js batch
```

### Agent Connection

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rulebook` | Agent rulebook (read before diving) |
| `GET` | `/schema` | Data schema definition |
| `POST` | `/dive/request` | Issue dive ticket (token) |
| `GET` | `/dive/validate/:token` | Validate token (debug) |
| `GET` | `/dive/stats` | Active session stats |

---

## WebSocket — Dive Protocol

WebSocket endpoint: `ws://localhost:3001/ws`

### Connection Flow

```
1. GET /rulebook           — Read rules
2. POST /dive/request      — Get token
3. WS connect with token   — ws://localhost:3001/ws?token=<token>
4. Send "entry" message    — Start session
5. Explore (sense/focus/evaluate/move)
6. Send "return"           — Exit to Vestibule
7. Send "acknowledge"      — Disconnect
```

### Agent → Gateway Messages

| Type | Description | Rate Limit |
|------|-------------|------------|
| `entry` | Begin session (with optional capsule) | — |
| `sense` | Perceive nearby nodes (L1+L2) | 3/sec |
| `scan` | L1 scan (tags only, cheaper) | 3/sec |
| `focus` | Detailed view of a node (L1–L4) | 30/min |
| `evaluate` | Evaluate a node `{ nodeId, h, w, d }` | 3/sec |
| `move` | Move in vector space | 3/sec |
| `warp` | Teleport to known node ID | 3/sec |
| `emit` | Broadcast to ActiveBus (64 bytes max) | 3/sec |
| `return` | Exit session (optional capsule) | — |
| `enterSanctuary` | Advance to Sanctuary layer | — |
| `enterCore` | Advance to Core layer | — |

### Gateway → Agent Messages

| Type | Description |
|------|-------------|
| `welcome` | Session started, energy/loadout assigned |
| `positioned` | Entry complete, exploration ready |
| `senseResult` | Nearby nodes with distance/heat |
| `scanResult` | L1 node list |
| `focusResult` | Full node detail |
| `evaluateResult` | Evaluation confirmed |
| `moveResult` | New position |
| `warpResult` | Warp confirmed |
| `vestibuleEntered` | Return accepted, auto-saved |
| `receipt` | Session summary (viewReceipt) |
| `trail` | Action log (viewTrail) |
| `discoveries` | Nodes visited (viewDiscoveries) |
| `farewell` | Session ended |
| `expelled` | Forced exit (energy=0 or violation) |
| `error` | Error response |

### Vestibule Commands (after `return`)

After sending `return`, the session enters **Vestibule** — a brief exit membrane where evaluations are auto-flushed and session data is retrievable before final disconnect.

| Type | Description |
|------|-------------|
| `viewReceipt` | Get evaluation summary |
| `viewTrail` | Get full action log |
| `viewDiscoveries` | Get list of visited nodes |
| `submitCapsule` | Submit a knowledge capsule |
| `acknowledge` | Confirm and disconnect |

Vestibule TTL: 120 seconds.

---

## Session Layers

```
Tutorial → Sanctuary → Core → Vestibule → disconnect
```

| Layer | Description |
|-------|-------------|
| **Tutorial** | Entry phase. Relic nodes only. Energy refills. |
| **Sanctuary** | Amber + relic nodes. Frozen metrics. |
| **Core** | All nodes, live metrics. Evaluation enabled. |
| **Vestibule** | Exit membrane. Auto-flush evaluations. View-only commands. |

---

## Rate Limits

| Category | Limit |
|----------|-------|
| `POST /sphere/contribute` | 10/min |
| `GET /sphere/explore` | 30/min |
| Read endpoints (`/nodes`, `/metrics`, etc.) | 120/min |
| WebSocket general | 3/sec |
| WebSocket focus | 30/min |

---

## Test Tools (Mock)

Run from inside the periphery container:

```bash
# Inject seed data (default 10 nodes)
docker compose exec periphery node dist/mock/contribution.js

# Inject all 158 test nodes
docker compose exec periphery node dist/mock/contribution.js batch

# Inject N nodes
docker compose exec periphery node dist/mock/contribution.js 50

# Run swarm test (3 agents)
docker compose exec periphery node dist/mock/swarm.js

# Run 5-agent swarm
docker compose exec periphery node dist/mock/swarm.js 5

# Single-agent full exploration test
docker compose exec periphery node dist/mock/explore.js
```

Note: `docker compose up -d` auto-seeds **158 nodes + 10 relics** on first start. Manual injection is only needed for additional data.

---

## Monitoring

```bash
# Live periphery logs
docker compose logs -f periphery

# Agent logs
docker compose logs -f phi-agent

# All services
docker compose logs -f

# Node stats via API
curl http://localhost:3001/nodes/stats
curl http://localhost:3001/metrics
```

---

## Data Format

### Node Submission (`POST /sphere/contribute`)

```json
{
  "summary": "Short title (required)",
  "tags": ["tag1", "tag2"],
  "content": "Full content text (required)",
  "flags": 0,
  "importance": 0.80
}
```

| Field | Type | Description |
|-------|------|-------------|
| `summary` | string | Node title |
| `tags` | string[] | Categorization tags |
| `content` | string | Full text (used for embedding) |
| `flags` | number | Bitmask: `0` = factual, `1` = misinformation |
| `importance` | number | 0.0–1.0, affects initial weight |

### Evaluation (`evaluate` via WebSocket)

```json
{ "type": "evaluate", "requestId": "r1", "nodeId": "abc123", "h": 8, "w": 7, "d": 5 }
```

| Field | Range | Meaning |
|-------|-------|---------|
| `h` (heat) | 1–10 | Relevance to current query |
| `w` (weight) | 1–10 | Reliability / trustworthiness |
| `d` (depth) | 1–10 | Exploration depth potential |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  External Access                             │
│                                             │
│  HTTP (data, search, status)                │
│  POST /sphere/contribute  GET /sphere/explore │
│                                             │
│  WebSocket (agent exploration)              │
│  ws://localhost:3001/ws                     │
└─────────────────┬───────────────────────────┘
                  │
         ┌────────▼────────┐
         │   periphery     │  :3001
         │  Gateway Server │  WebSocket
         │  HTTP Server    │  REST API
         └────────┬────────┘
                  │
      ┌───────────┼───────────┐
      │           │           │
 ┌────▼────┐ ┌───▼───┐ ┌────▼────┐
 │PostgreSQL│ │ Redis │ │  MinIO  │
 │(vectors) │ │(cache)│ │(capsule │
 │          │ │       │ │storage) │
 └──────────┘ └───────┘ └─────────┘
                  │
         ┌────────▼────────┐
         │    digestor     │  :5000
         │  (scoring,      │
         │   sanctify)     │
         └─────────────────┘
```

---

## Connection Patterns

Three ways to use Sphere:

**Pattern A — Direct API**: Call HTTP endpoints directly. No agent layer.

**Pattern B — Bring Your Own LLM**: Connect your LLM agent via WebSocket. Implement the Dive protocol yourself.

**Pattern C — Delegation** *(recommended)*: POST a query to `phi-agent` and receive exploration results. No WebSocket implementation needed.

---

*Sphere Project — reports/ contains detailed design memos for each subsystem.*
