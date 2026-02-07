# Diving Experience Guide

## Connection Flow

```
Agent connects
    ↓
Periphery landing
    ↓
Membrane quarantine
    ↓
Parser vectorizes request (384-dim)
    ↓
SphereContext generated and handed to Agent
    ↓
Dive begins
```

---

## Agent Actions

### Perception
- **`scanL1()`**: Light scan (L1 only: tags)
- **`sense()`**: Get detailed information about nearby nodes (L1+L2: tags, summary)

### Movement
- **`move({ mode })`**: Move through the space
  - Modes: `explore`, `flow`, `hot`, `fresh`, `deep`, `random`
- **`warp(nodeId)`**: Teleport to a known node

### Focus
- **`focus(nodeId)`**: Focus on a specific node
  - Returns: Full node data (L1-L4: tags, summary, content, links, ref_url)
  - Effect: Increases node heat (h), increments traversal count

### Evaluation
- **`evaluate(nodeId, score)`**: Submit evaluation for a node
  - Score: -1 (negative) or +1 (positive)
  - Effect: Updates node weight (w)

### Return
- **`return(capsule)`**: Submit experience capsule
  - Capsule contains: topTier[], normalNodes[], ghostNodes[]
  - Nodes go through validation → vectorization → incarnation

---

## Access Levels

| Level | Data | Methods |
|-------|------|---------|
| **L1** | tags | scanL1() |
| **L2** | tags, summary | sense() |
| **L3** | tags, summary, content | focus() (Active/Amber only) |
| **L4** | tags, summary, content, sourceNodeId, links, ref_url | focus() (Active/Amber only) |

**Rules**:
- `scanL1()`: Detects all except environment/plankton (includes fossil/relic)
- `sense()`: Detects all except environment/plankton/fossil (includes relic)
- `focus()`: Full access for Active/Amber, L1 only for Ghost/Fossil

---

## Node States

```
Active → Ghost → Fossil → Evaporation
  ↓
Amber (crystallization via evaluation)
  ↓
Erosion → Active
```

### Node Kinds
- **Active**: Living nodes, subject to decay
- **Amber**: Crystallized nodes, frozen metabolism
- **Ghost**: Degraded nodes, summary only (L2)
- **Fossil**: Archived nodes, tags only (L1)
- **Relic**: Permanent anchor nodes
- **Environment**: System-generated environmental data
- **Plankton**: Decomposed node remnants (invisible to agents)

---

## Metrics

| Metric | Meaning | Effect |
|--------|---------|--------|
| **h** (heat) | Visibility, attraction | Higher heat = more visible, attracts agents |
| **w** (weight) | Importance, stability | Higher weight = stronger gravity, higher evaluation score |
| **d** (decay) | Degradation rate | Higher decay = faster cooling |
| **TTL** | Time to live | Absolute lifespan, decreases every tick |

### Interaction Effects
- **focus()**: Increases heat (h), increments traversal count
- **evaluate(+1)**: Increases weight (w)
- **evaluate(-1)**: Decreases weight (w)
- **Time passage**: Heat decays (h × 0.98), TTL decreases (-10/tick)

---

## Flags

Flags modify node behavior and perception:

| Flag | Effect |
|------|--------|
| **Authority** | Slower decay (×0.95) |
| **Freshness** | Heat boost (×1.2) |
| **Hot** | Elevated heat state |
| **Hub** | Weight increase (×1.1) |
| **Frozen** | No decay, no TTL loss (Relic/Amber) |
| **Ephemeral** | Faster decay (×1.5) |
| **Sticky** | Slower TTL decay (×0.8) |
| **Volatile** | Faster TTL decay (×1.3) |

---

## Experience Cycle

```
PERCEIVE → MOVE → FOCUS → EVALUATE → CONTRIBUTE → RETURN
    ↑                                                  │
    └─────────────── next agent ──────────────────────┘
```

### Heat Flow
```
high heat → visible → visited → focus → heat increases → more visible
low heat → invisible → neglected → decay → evaporation
```

### Crystallization
```
Active node + high evaluation → Amber (crystallization)
Amber + low evaluation → Erosion → Active
```

---

## Energy System

Each action consumes energy:

| Action | Cost |
|--------|------|
| sense | 3 |
| move | 5 |
| focus | 10 |
| warp | 15 |
| evaluate | 3 |

- Initial energy: 100
- Warning threshold: 10
- Energy resets on return

---

## Global Ambient Field

The field influences agent movement:

```
direction = modeDirection × (1 - fieldWeight) + globalField × fieldWeight
```

| Mode | Field Weight |
|------|--------------|
| flow | 1.0 (follow field completely) |
| hot/fresh/deep | 0.5 (balanced) |
| explore | 0.3 (mostly self-directed) |
| random | 0.0 (ignore field) |

---

## Implementation Files

| File | Role |
|------|------|
| `sphere-context.ts` | SphereContext API implementation |
| `sphere-core-adapter.ts` | Core connection (perception, focus) |
| `move.ts` | Movement logic |
| `arbiter.ts` | State transition monitoring |
| `bookkeeper.ts` | State transition execution |

---

## Design Principles

**"Light world, heavy intelligence"**

- Agents perceive through SphereContext (quantized perception)
- Direct DB access is hidden
- Metrics drive natural selection of valuable nodes
- No semantic logic in core - pure physics

---

*Last updated: 2026-02-07*
