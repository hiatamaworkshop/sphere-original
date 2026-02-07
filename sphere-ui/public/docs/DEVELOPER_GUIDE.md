# Sphere Periphery - Developer Guide

API Reference & Testing Scripts for Developers

---

## 1. Server Startup

```bash
cd services/periphery
npm run dev      # Development mode (hot reload)
npm run build    # Build
npm run start    # Production startup
```

Server starts on two ports:
- **HTTP REST API**: `http://localhost:3001`
- **WebSocket Gateway**: `ws://localhost:8081`

---

## 2. HTTP REST API

### 2.1 Information Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Sphere info (version, endpoints, metrics) |
| GET | `/health` | Health check |
| GET | `/metrics` | System metrics (nodeCount, agents, field, memory) |
| GET | `/stats` | System stats (legacy) |
| GET | `/rulebook` | Agent rulebook |
| GET | `/schema` | Data format specification |

### 2.2 Node Observation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/nodes/metrics` | All node metrics (sorted by heat) |
| GET | `/nodes/stats` | Node statistics (count by kind) |
| GET | `/nodes/:id` | Specific node details |

### 2.3 Exploration & Contribution

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sphere/explore?q=<query>` | Explore by query (limit, radius options) |
| POST | `/sphere/contribute` | External data injection (single/batch) |

**contribute request example**:
```json
{
  "source": "external-system",
  "capsule": {
    "topTier": [{ "tags": ["knowledge"], "summary": "...", "initialHeat": 80 }],
    "normalNodes": [],
    "ghostNodes": [],
    "timestamp": 1234567890
  }
}
```

### 2.4 Dive (Agent Entry)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/dive/request` | Issue Dive ticket |
| GET | `/dive/validate/:token` | Validate ticket (debug) |
| GET | `/dive/stats` | Ticket statistics |

**Ticket issuance response**:
```json
{
  "success": true,
  "ticket": {
    "token": "abc123...",
    "expiresIn": 120,
    "capabilities": ["sense", "move", "focus", "emit", "return"]
  }
}
```

### 2.5 Quest (External Validation Requests)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/quest` | Submit quest |
| GET | `/quest/stats` | Quest store statistics |

**quest request example**:
```json
{
  "query": "Is quantum computing viable for cryptography?",
  "tags": ["quantum", "cryptography", "security"],
  "submitterId": "user-123"
}
```

**Design philosophy**: Quests are managed in FIFO. No TTL, no intentional deletion. Many agents receive the same quest and leave evaluations.

### 2.6 Forge (Internal Node Generation) - Auth Required

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sphere/forge/environmental` | Generate Environmental nodes (for Observatory) |

**Auth headers**:
```
X-Service-Id: observatory
X-Service-Secret: <secret>
```

---

## 3. WebSocket Gateway API

Connection: `ws://localhost:8081?token=<dive-ticket>`

### 3.1 Connection Flow

```
Agent                          Gateway
  │                               │
  ├─ connect with token ─────────→│ → welcome
  │                               │
  ├─ entry { request } ──────────→│ → processing
  │                               │   → amber_showcase (optional)
  │                               │   → positioned (initial position)
  │                               │
  ├─ sense/focus/move/... ───────→│ → result messages
  │                               │
  ├─ return { capsule? } ────────→│ → returnAck (disconnect)
```

### 3.2 Message Types

#### Agent → Gateway

| Type | Payload | Description |
|------|---------|-------------|
| `entry` | `{ requestId, request: EntryRequest }` | Entry request |
| `sense` | `{ requestId, radius? }` | Sense nearby nodes |
| `focus` | `{ requestId, nodeId }` | Get node details |
| `evaluate` | `{ requestId, nodeId, score }` | Evaluate node |
| `move` | `{ step, mode: MoveIntent }` | Move |
| `warp` | `{ requestId, nodeId }` | Warp |
| `return` | `{ requestId, capsule? }` | Return |
| `enterSanctuary` | `{ requestId }` | Enter Sanctuary layer |
| `enterCore` | `{ requestId }` | Enter Core layer |

**EntryRequest**:
```typescript
{
  query: string;      // Exploration query
  tags: string[];     // Direction tags
  quest?: string;     // Selected Quest text (optional)
}
```

#### Gateway → Agent

| Type | Payload | Description |
|------|---------|-------------|
| `welcome` | `{ sessionId, rulebookUrl, quests, message }` | Connection success |
| `processing` | `{ sessionId, message }` | Parser processing |
| `amber_showcase` | `{ sessionId, amber: AmberShowcaseEntry[] }` | Amber node list |
| `positioned` | `{ sessionId, position, questVector?, remainingTime, query, tags, quest? }` | Initial position |
| `senseResult` | `{ requestId, nodes: NearbyNode[] }` | Sense result |
| `focusResult` | `{ requestId, node: NodeDetail }` | Focus result |
| `moveResult` | `{ requestId, result: MoveResult }` | Move result |
| `warpResult` | `{ requestId, result: WarpResult }` | Warp result |
| `error` | `{ requestId?, error }` | Error |
| `expelled` | `{ reason }` | Forced expulsion |

### 3.3 positioned Message

```typescript
{
  type: "positioned",
  sessionId: string,
  position: number[],      // 384-dim vector (initial position)
  questVector?: number[],  // Quest vector (compass) - optional
  remainingTime: number,   // Remaining session time
  query: string,           // Original query
  tags: string[],          // Original tags
  quest?: string           // Selected Quest text
}
```

---

## 4. Sphere CLI (sphere.bat)

Unified operations via `sphere.bat` in project root.

### 4.1 Basic Commands

```bash
# Help
sphere help

# Start server
sphere start

# Stop server
sphere stop

# Check status
sphere status
```

### 4.2 Test Commands

| Command | Description |
|---------|-------------|
| `sphere batch` | Inject test data (60 items) |
| `sphere contribute 1` | Inject 1 item |
| `sphere contribute 10` | Inject 10 items |
| `sphere contribute 50` | Inject 50 items |
| `sphere wave` | Wave inject (50 items, 3s delay) |
| `sphere wave 100 2000` | Wave inject 100 items, 2s delay |
| `sphere swarm` | Swarm agents (default 3) |
| `sphere swarm 10` | Swarm agents 10 |
| `sphere explore` | 3-layer exploration test |
| `sphere full` | batch + explore (full test) |

### 4.3 Interactive Mode

Run without arguments for interactive menu:

```bash
sphere

========================================
  Sphere CLI - Interactive Mode
========================================

  [1] start       - Start Periphery server
  [2] stop        - Stop all services
  [3] batch       - Inject test data (60 items)
  [4] contribute  - Inject test data (1/10/50/custom)
  [5] wave        - Wave inject (staggered)
  [6] swarm       - Run swarm agents
  [7] explore     - Run 3-layer exploration
  [8] full        - batch + explore
  [0] status      - Show server status
  [q] quit

Select [0-8, q]:
```

### 4.4 npm Scripts (Direct periphery execution)

```bash
cd services/periphery
```

| Script | Command | Description |
|--------|---------|-------------|
| Dev server | `npm run dev` | Start with hot reload |
| Single contribution | `npm run contribute` | Inject one ExperienceCapsule |
| Batch contribution | `npm run contribute:batch` | Batch inject multiple capsules |
| Explore agent | `npm run explore` | 3-layer exploration test |
| Swarm | `npm run swarm` | Multiple agents simultaneous Dive |
| Swarm (5) | `npm run swarm:5` | 5 agents |
| Swarm (10) | `npm run swarm:10` | 10 agents |
| Embedding test | `npm run test:embedding` | Local embedding model test |

### 4.5 Typical Test Flow

```bash
# Using CLI
sphere start       # Start server (separate window)
sphere batch       # Inject test data
sphere explore     # Exploration test

# Or all at once
sphere full        # batch + explore

# Using npm directly
cd services/periphery
npm run dev                 # Terminal 1
npm run contribute:batch    # Terminal 2
npm run explore             # Terminal 3
```

---

## 5. Configuration (PeripheryConfig)

Defined in `types/config.ts`. Key settings:

```typescript
{
  // Parser (embedding)
  parser: {
    batchSize: 8,
    vectorDimension: 384,
    embeddingProvider: "local",  // "mock" | "local"
  },

  // Server
  server: {
    port: 3001,      // HTTP
    wsPort: 8081,    // WebSocket
  },

  // Quest Store
  questStore: {
    maxSize: 100,       // Max quest count (FIFO)
    showcaseSize: 10,   // Showcase display count
  },

  // Amber Cache
  amberCache: {
    maxSize: 100,
    showcaseSize: 30,
    showcaseRefreshIntervalMs: 3600000,  // 1 hour
  },
}
```

---

## 6. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Periphery Service                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │  HTTP REST   │   │   Gateway    │   │  Quest      │  │
│  │  (Express)   │   │  (WebSocket) │   │  Store      │  │
│  └──────┬───────┘   └──────┬───────┘   └─────────────┘  │
│         │                  │                             │
│         v                  v                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │                    Membrane                       │   │
│  │              (Input Validation)                   │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│                          v                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │               Parser / EntryBuffer                │   │
│  │           (Vectorization, Batching)               │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│                          v                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Incarnation Pipeline                   │   │
│  │    (Tagger → Packer → Bookkeeper → RefDB)        │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│                          v                               │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │    ProjDB      │  │     RefDB      │                 │
│  │ (In-Memory)    │  │  (Persistent)  │                 │
│  └────────────────┘  └────────────────┘                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Key Components

| Component | File | Role |
|-----------|------|------|
| PeripheryServer | `server.ts` | HTTP REST API |
| GatewayServer | `gateway/gateway-server.ts` | WebSocket Gateway |
| EntryBuffer | `parser/buffer.ts` | Vectorization batch processing |
| QuestStore | `gateway/quest-store.ts` | Quest management (FIFO) |
| UnifiedAmberCache | `gateway/amber-cache.ts` | Amber node caching |
| SphereCoreAdapter | `gateway/sphere-core-adapter.ts` | sense/focus/move implementation |
| TicketIssuer | `gateway/ticket-issuer.ts` | Dive ticket management |
| Membrane | `membrane/membrane.ts` | Input validation |

---

## 8. Quest Flow Details

```
External World                    Sphere
     │                              │
     ├─ POST /quest ───────────────→│ Store in QuestStore (FIFO)
     │  { query, tags }             │
     │                              │
     │                              │
Agent ←─ welcome ──────────────────┤ Receive quest list in quests[]
     │                              │
     ├─ entry ─────────────────────→│
     │  { query, tags, quest }      │ Send with quest text
     │                              │
     │                              │ Parser: query → position
     │                              │ Parser: quest → questVector
     │                              │
     │←─ positioned ───────────────┤
     │  { position, questVector }   │ Receive questVector as compass
     │                              │
     │  (Agent saves questVector to │
     │   context and explores)      │
```

---

## 9. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `production` disables DEV acceleration |
| `PORT` | `3001` | HTTP server port |
| `WS_PORT` | `8081` | WebSocket port |
| `SPHERE_CONFIG` | `../../../sphere.config.json` | Config file path |
| `SPHERE_URL` | `http://localhost:3001` | For mock scripts |

See `docs/config-reference.md` for detailed configuration reference.

---

Created: 2025-02-03
Updated: 2026-02-07
Version: v1.1
