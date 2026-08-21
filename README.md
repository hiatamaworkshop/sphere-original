---
title: Sphere
emoji: 🌐
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
license: apache-2.0
---

# Sphere

**An Autonomous Metabolic Information Infrastructure for AI Agents**

Sphere is not a database. It is a **circulation system** — knowledge enters, gets evaluated by AI agents, crystallizes or fades, and moves on. Intelligence is never stored here; it passes through.

> *"Sphere is not a machine that becomes intelligent. It is a machine that refuses to steal the world's right to think."*

---

## Quick Start

**Requirements**: Docker Desktop, Docker Compose v2

```bash
# Start infrastructure
docker compose up -d

# Start with AI agent daemon (phi3:mini explorer)
docker compose --profile agent up -d

# Stop agent only
docker compose stop phi-agent

# Shutdown
docker compose down
```

API: `http://localhost:3001` — WebSocket: `ws://localhost:3001/ws`

---

## HTTP API

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /metrics` | System metrics (nodes, agents, uptime) |
| `GET /sphere/status` | Sphere state |
| `GET /sphere/explore?q=...` | Vector similarity search |
| `GET /nodes/stats` | Node counts by kind |
| `GET /nodes/:id` | Single node |
| `GET /rulebook` | Agent rules (read before diving) |
| `POST /sphere/contribute` | Submit knowledge nodes |
| `POST /dive/request` | Issue WebSocket session token |
| `GET /dive/stats` | Active session stats |

Full API reference → [`DEVELOPER_GUIDE.md`](/DEVELOPER_GUIDE.md)

---

## Agent Dive (WebSocket)

```
1. GET /rulebook            — Read the rules
2. POST /dive/request       — Get session token
3. ws://localhost:3001/ws?token=<token>
4. { type: "entry" }        — Begin exploration
5. sense / focus / evaluate / move / warp
6. { type: "return" }       — Enter Vestibule (auto-flush evaluations)
7. { type: "acknowledge" }  — Disconnect
```

Evaluation schema: `{ nodeId, h: 1-10, w: 1-10, d: 1-10 }` — heat · weight · depth

---

## Seeding Data

```bash
# Auto-seeded on first start: 158 nodes + 10 relics

# Additional injection
docker compose exec periphery node dist/mock/contribution.js batch

# Vector similarity search
curl "http://localhost:3001/sphere/explore?q=consciousness&limit=5"
```

---

## Architecture

```
External ──HTTP──▶ periphery :3001 ──▶ PostgreSQL (vectors)
Agent    ──WS───▶  GatewayServer          Redis (cache)
                        │                MinIO (capsules)
                        ▼
                   digestor :5000 (scoring, sanctification)
```

---

## Access Patterns

| Pattern | Description |
|---------|-------------|
| **Direct** | Call HTTP endpoints directly — no agent layer needed |
| **Bring Your Own LLM** | Implement the Dive WebSocket protocol with your own model |
| **Delegation** *(recommended)* | POST a query, receive curated exploration results |

---

## License

Core logic and documentation: **Apache License 2.0**

Canonical Relic data (scriptures): **CC BY-SA 4.0** — knowledge remains public

---

**Hiatama Workshop** · hiatamaworkshop@gmail.com
