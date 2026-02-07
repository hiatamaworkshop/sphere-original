# ReferenceDB Replacement Guide

How to replace, populate, or migrate the ReferenceDB when forking or deploying a new Sphere instance.

---

## Overview

Sphere uses two databases:

| DB | Content | Mutability | Persistence |
|----|---------|-----------|-------------|
| **ReferenceDB** | Full node data (L1-L4): tags, summary, content, links | Append-only (Amber ascension is the only write-back) | Currently in-memory (`Map`) |
| **ProjectionDB** | Spatial data (L1+L2): tags, summary, vector, position | Mutable (heat/weight/TTL change per tick) | Currently in-memory (`Map`) |

**Critical rule**: Every node in ProjectionDB must have a corresponding entry in ReferenceDB via `relic_id` (content hash). RefDB is the **Single Source of Truth**.

---

## When You Need to Replace RefDB

| Scenario | Action |
|----------|--------|
| Fresh fork with custom data | Populate from scratch via contribute API |
| Knowledge base migration | Batch contribute then restart |
| Embedding model upgrade | Re-vectorize all nodes (future: `sphere-wizard upgrade`) |
| Sphere merge (A + B → C) | Re-embed combined data (future: `sphere-wizard merge`) |

---

## Method A: Contribute API (Available Now)

The only currently implemented path. Works with a running Sphere instance.

### Step 1: Prepare Data

Format your data as ExperienceCapsules:

```json
{
  "source": "my-loader",
  "batch": true,
  "capsules": [
    {
      "topTier": [
        {
          "tags": ["machine-learning", "deep-learning"],
          "summary": "Neural network architectures overview",
          "content": "Full article text goes here. This becomes L3 data.",
          "ref_url": "https://example.com/article",
          "initialHeat": 100
        }
      ],
      "normalNodes": [
        {
          "tags": ["optimization"],
          "summary": "Gradient descent variants"
        }
      ],
      "ghostNodes": [],
      "timestamp": 1707300000
    }
  ]
}
```

**Tier selection guide**:

| Tier | When to use | Vectorized | Initial TTL |
|------|------------|-----------|-------------|
| `topTier` | Core knowledge, high-value content | Yes (384-dim) | 2 days |
| `normalNodes` | Supporting information | No | 1 day |
| `ghostNodes` | Ephemeral / low-confidence data | No | 5 min |

**Important**: Only `topTier` nodes get vector embeddings. They are the only nodes discoverable via `/sphere/explore` (vector search). Choose topTier for content that needs semantic positioning.

### Step 2: Send to Sphere

```bash
# Single batch
curl -X POST http://localhost:3001/sphere/contribute \
  -H "Content-Type: application/json" \
  -d @my-data.json

# Or use the CLI
sphere contribute 50
```

**Rate limit**: 10 requests/min. For large datasets, add delays between batches.

### Step 3: Verify

```bash
# Check node counts
curl http://localhost:3001/nodes/stats

# Search by content
curl "http://localhost:3001/sphere/explore?q=machine+learning&limit=5"

# Check specific node
curl http://localhost:3001/nodes/<id>
```

### Batch Script Example (Node.js)

```javascript
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('my-dataset.json'));

const BATCH_SIZE = 5;   // capsules per request
const DELAY_MS = 7000;  // 7s between batches (stays under 10/min)

async function load() {
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const res = await fetch('http://localhost:3001/sphere/contribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'batch-loader',
        batch: true,
        capsules: batch
      })
    });
    const result = await res.json();
    console.log(`Batch ${i / BATCH_SIZE + 1}: ${result.nodeCount} nodes`);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

load();
```

---

## Method B: Sanctuary Bundle (Partially Implemented)

Load pre-packaged node bundles via the Sanctuary system.

**Status**: Bundle loading works, but **signature verification is incomplete** (SHA256 hash computed but not compared).

**When ready**: This will be the recommended method for distributing curated knowledge sets (amber collections, domain-specific databases).

---

## Method C: Sphere Wizard CLI (Not Yet Implemented)

The planned standard tool for Sphere lifecycle management.

```bash
sphere-wizard init          # Interactive: model selection → batch vectorize → deploy
sphere-wizard resume        # Resume interrupted operation (savepoint-based)
sphere-wizard merge A B     # Merge two Spheres into one (re-embedding)
sphere-wizard upgrade       # Change embedding model + re-vectorize all nodes
sphere-wizard status        # Current Sphere state
```

**5-step pipeline**:
1. Config retrieval + schema fetch + model selection + input validation
2. Batch vectorization → ProjectionDB generation
3. ReferenceDB integration + Relic placement
4. Bookkeeper validation
5. Deployment (new ProjectionDB activation + archiving)

Each step saves a **savepoint** (JSON file). Resumable on failure.

---

## Important Notes

### Data Survives Ticks, Not Restarts

Current implementation uses in-memory Maps. **All data is lost on server restart**. Plan accordingly:
- For development: Use batch scripts to re-populate on startup
- For production: Persistence layer (SQLite/Redis/Postgres) is on the roadmap

### Content Hash Deduplication

`relic_id` is derived from content hash. Submitting the same content twice will not create duplicates. This is by design.

### Embedding Model Compatibility

**Changing the embedding model invalidates all existing vectors**. If you switch from `all-MiniLM-L6-v2` to another model:
1. All spatial relationships break
2. Vector search (`/sphere/explore`) returns incorrect results
3. Agent sense/scanL1 distances become meaningless

**Solution**: Re-vectorize all nodes after model change. This is the primary use case for `sphere-wizard upgrade`.

### ProjDB Consistency

After replacing RefDB:
- ProjDB nodes referencing deleted RefDB entries become orphaned
- Best practice: Clear both databases and re-populate together
- Fresh start is simpler than incremental migration

---

## Data Format Reference

Use `GET /schema` to retrieve the current JSON Schema for capsule validation.

### ReferenceNode Structure

```typescript
{
  id: string;          // UUID
  relic_id: string;    // Content hash (dedup key)
  kind: NodeKind;      // "active" | "amber" | "ghost" | "fossil" | "relic" | "environment"
  tags: string[];      // L1
  summary: string;     // L2
  content: string;     // L3
  ref_url?: string;    // L4
  sourceNodeId?: string; // L4
  timestamp: number;
  tier: "top" | "normal" | "ghost";
}
```

### Capsule Limits

| Constraint | Limit | Source |
|-----------|-------|--------|
| topTier per capsule | 2 max | capsule.schema.json |
| normalNodes per capsule | 5 max | capsule.schema.json |
| ghostNodes per capsule | 3 max | capsule.schema.json |
| Total payload | 8192 bytes (8KB) | capsule.schema.json |
| Summary length | 500 chars | Rulebook |
| Tags per node | 1-10 | Rulebook |
| Tag length | 64 bytes | Membrane config |
| Node links | 5 max per seed | Rulebook |
| External URL | 256 chars | Rulebook |

---

*Last updated: 2026-02-07*
