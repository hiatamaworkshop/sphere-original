# Data Format Audit — payload/content Naming Hierarchy

**Date**: 2026-02-17
**Status**: Inconsistencies identified, pending unification

---

## Source of Truth: SphereNode (renalCore)

`renalCore/src/types/sphere_node.ts` defines the canonical structure.
SphereNode is the persisted entity — the "true form" within Sphere.

```typescript
interface SphereNode {
  id: string;
  kind: NodeKind;
  vector: number[];
  payload?: {              // <-- all node data lives here
    tags?: string[];           // L1: Header
    summary?: string;          // L2: Summary
    content?: string;          // L3: Main text
    sourceNodeId?: string;     // L4: Reference
    links?: string[];          // L4: Reference
    ref_url?: string;          // L4: Reference
  };
  metrics: { w, d, h, ttl, flg };
  timestamp: number;
}
```

### Naming Hierarchy

```
SphereNode.payload          = envelope (all readable data carried by node)
SphereNode.payload.content  = specific L3 text field within that envelope
```

**`payload` contains `content`**, not the reverse.
This is the authoritative naming — all other formats derive from it.

---

## NodeSeed (Input Format)

`periphery/types/capsule.ts` defines the agent submission format.
NodeSeed is a **flattened convenience** for input — not the canonical structure.

```typescript
interface NodeSeed {
  tags: string[];        // → SphereNode.payload.tags
  summary: string;       // → SphereNode.payload.summary
  content?: string;      // → SphereNode.payload.content
  sourceNodeId?: string; // → SphereNode.payload.sourceNodeId
  links?: string[];      // → SphereNode.payload.links
  ref_url?: string;      // → SphereNode.payload.ref_url
  flags: number;         // → SphereNode.metrics.flg
}
```

NodeSeed field names match `SphereNode.payload.*` — this is correct.
The Packer wraps these into `payload: { }` during incarnation.

---

## Files with Format Inconsistency

### JSON Data Files

| File | Problem |
|------|---------|
| `periphery/src/mock/mock_data.json` | All 153 items use `"payload"` for L3 text. Should be `"content"` |
| `sphere-ui/public/mock-data.json` | Copy of above. Same issue |

The field `"payload": "text..."` confuses SphereNode.payload (object)
with SphereNode.payload.content (string). These are different levels.

### TypeScript — Legacy Fallback Interfaces

| File | Lines | Problem |
|------|-------|---------|
| `periphery/src/mock/contribution.ts` | L33-42 | `RawData` has `payload?`, `content?`, `title?` with fallback mapping |
| `periphery/src/index.ts` | L473-481 | `RawSeedItem` has `title?`, `summary?`, `content?`, `payload?` (4-way) |
| `periphery/src/mock/explore-agent.ts` | L43-48 | `MockEntry` uses `title` + `content` instead of `summary` + `content` |

These interfaces exist to handle the inconsistent mock_data.json.
Once JSON is unified, the fallback chains become unnecessary.

### JavaScript — Frontend Fallback

| File | Lines | Problem |
|------|-------|---------|
| `sphere-ui/public/app.js` | L129, L451-452, L944 | `item.payload \|\| item.content \|\| item.summary \|\| item.title` fallback chain |

### Pool Service — Intentional Aliasing

| File | Problem | Verdict |
|------|---------|---------|
| `pool-service/src/types.ts` L11-24 | `PoolEntry` uses `title` + `body` (external API convention) | **Acceptable** |
| `pool-service/src/membrane.ts` L80-81 | Bidirectional aliasing: `raw.title ?? raw.summary` | **Acceptable** |
| `pool-service/src/pool.ts` L111-116 | `submitToSphere()` maps `title→summary`, `body→content` | **Acceptable** |

Pool Service uses standard external naming internally, converts at Sphere boundary.
Its local `NodeSeed` type (types.ts L75-81) correctly uses `summary` + `content`.

### Design Document

| File | Problem |
|------|---------|
| `WIZARD_DESIGN_MEMO.md` L390, L516, L605-606 | References v3 schema: `payload?: string`, `initialHeat` — outdated |

---

## Unification Plan (mock data = owner's task)

1. **mock_data.json** (both copies): `"payload"` → `"content"`
2. **contribution.ts**: Remove `payload?` and `title?` from RawData, drop fallbacks
3. **index.ts**: Simplify RawSeedItem to match NodeSeed fields
4. **explore-agent.ts**: `title` → `summary` in MockEntry
5. **app.js**: Remove payload/title fallback chain
6. **WIZARD_DESIGN_MEMO.md**: Add note that v3 `payload` field was renamed to `content` in v4

---

## Key Principle

> `payload` is the **container** (SphereNode level).
> `content` is a **field within** that container (L3 text).
> Never use `payload` where `content` is meant.
> The naming authority flows from SphereNode downward.

---

*Last updated: 2026-02-17*
