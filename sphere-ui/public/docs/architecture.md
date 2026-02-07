# Architecture Definition: Sphere Original (Genesis Spec)

## Core Directives

This system is NOT an intelligent knowledge base. It is a **Deterministic Metabolism System**.

### Inside the Core:

- **No Reasoning**: The system does not "think."
- **No Optimization**: It does not seek efficiency of meaning.
- **No Interpretation**: It does not understand context.
- **No Semantic Creation**: It does not generate new meaning.

Intelligence resides strictly OUTSIDE the Sphere. The core is an engine that applies immutable physical laws.

### The Taboos

- **Do NOT introduce heuristics**: No "rule of thumb" logic.
- **Do NOT add adaptive logic**: The core does not learn or change its rules.
- **Do NOT rank, score, or judge meaning**: Value is determined by external interaction only.
- **Do NOT read or modify payload content**: The core is blind to data substance.
- **Do NOT merge nodes semantically**: Clustering is a physical result, not a logical operation.

---

## 0. Core Mission

The system is not a library for storage; it is a **Metabolic Substrate** governing the birth, death, and rearrangement of information.

All implementations must adhere to the following **Three Providences**:

1. **Death as the Default**: Information without external energy (interaction) will inevitably evaporate. Persistence is an exception—a result of intentional will.

2. **Local Serves the Global**: Localized congestion or "High Heat" is automatically cooled. This energy is redistributed to uncharted or low-density regions (Entropy Balancing).

3. **Externalized Intelligence**: The core (RenalCore) is composed solely of non-intelligent, deterministic physical laws. Reasoning, interpretation, and meaning-making are the exclusive responsibilities of external Agents.

---

## 1. Terminology & Taxonomy

Internal implementations must avoid conventional IT jargon in favor of the "World-View" vocabulary.

| Conventional Term | Sphere Terminology | Conceptual Definition |
|-------------------|--------------------|-----------------------|
| User / Account | Agent / Diver | Transient explorers with no inherent authority. |
| API / Request | Pulse / Osmosis | Pressure and vibration passing through the Membrane. |
| Database | Reference / Projection | The Tomb of Records / The Surface of Phenomena. |
| Cache | Heat Reservoir | Volatile storage of thermal energy. |
| Delete / Purge | Evaporation / Decomposition | Natural decay and metabolic breakdown. |
| Admin / Manager | RenalCore / Glazier | Homeostatic organs and environmental tuners. |

---

## 2. Implementation Constraints

### 2.1 Structural Constraints

- **POD Principle**: No Classes. Data must be defined as Types/Interfaces; Logic must consist of Pure Functions only.
- **Rust-Ready**: No mutable references, side effects, or implicit states.

### 2.2 Dual-Layer Memory

- **ReferenceDB (Cold)**: Immutable, append-only "Truth." Information is stored but never interpreted.
- **ProjectionDB (Hot)**: Vector, Heat, Weight, Decay, and TTL. This is the "Phenomena." It is interpreted but never permanently stored.

### 2.3 Decoupled Intelligence

- No LLMs are executed within the Sphere.
- Embeddings and transformations are isolated within the Parser.
- The RenalCore processes numerical values only.

---

## 3. System Components

### 3.1 The Pipeline

**Entry Pipeline** → **3-Layered Sphere Experience** → **Incarnation Pipeline**

(Membrane, Parser, Gatekeeper, Tagger, Packer, Bookkeeper, Arbiter, CleanerFish)

### 3.2 RenalCore (The Organ)

The non-intelligent engine maintaining Sphere's homeostasis.

- **Tick**: The "Heartbeat" of the world. Applies Dynamic Decay at fixed intervals.
- **Decay Formula**:
  ```
  ttl_new = ttl_current - (α × LoadFactor)
  ```

- **Ascension / Erosion**:
  - Active → Amber (Crystallization via Evaluation)
  - Amber → Active (Erosion / Weathering)
  - Active → Ghost → Fossil → Decomposition (Scavenged by CleanerFish into Plankton)

---

## 4. Data Model: Archetypes

```typescript
type NodeKind =
  | "relic"       // Anchor nodes for vector-oriented mapping
  | "amber"       // Crystallized data; immune to decay unless eroded
  | "active"      // Standard information in flux
  | "ghost"       // Summary-only; readable via Sense()
  | "fossil"      // Header-only; readable via Scan()
  | "plankton"    // Non-readable; exists only as environmental metrics
  | "environment" // System-level field parameters
```

---

## 5. The Manifesto of Sphere Original

### Coordinates are Hypotheses

We reject the blind faith in "precise coordinates" as absolute truth. In Sphere, a vector is merely an initial placement. Margin for "correction and refinement through exploration" is prioritized over initial precision.

### Truth is Determined by Survival

Validity is not proven by mathematics alone. The only truth in Sphere is the fact that a piece of wisdom was discovered, heated, and crystallized into Amber—surviving the trial of time.

### Self-Healing via Metabolism

Sphere is not a static database. Old information weathers, the valueless is scavenged by the RenalCore, and new wisdom fills the gaps. This constant metabolism is the source of the ecosystem's resilience.

### Democratization of Intelligence

We avoid dependency on massive compute resources. By using lightweight coordinate systems and allowing wisdom to "mature" over time on affordable hardware, we liberate intelligence from monopoly.

---

## The Iron Law

**Reference is Truth: Do Not Touch.**

**Projection is Phenomenon: Let it Burn.**

Any implementation that violates this separation destroys the soul of the Sphere.
