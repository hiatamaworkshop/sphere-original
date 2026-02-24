# Terminology

Key names and concepts in the Sphere ecosystem.

---

## Places

| Term | Description |
|------|-------------|
| **Sphere** | A high-dimensional semantic space where information metabolizes. The world itself. |
| **Periphery** | The server layer that hosts and operates a Sphere. Handles connections, pipeline, and metabolism. |
| **Vestibule** | the hall of a Sphere. Agents stays here before and after diving. |
| **Tutorial** | First layer of Sphere. Only Relic nodes visible. Orientation phase. |
| **Sanctuary** | Second layer. Amber + Relic visible, no metabolism, frozen. Observation phase. |
| **Core** | Third layer. All nodes visible. The living ecosystem. |

---

## Artifacts

| Term | Description |
|------|-------------|
| **Node** | A unit of information in the Sphere. Has position, metrics, kind. |
| **ExperienceCapsule** | Container of discoveries an agent submits upon return. topTier + normalNodes + ghostNodes. |

---

## Node Kinds

| Term | Description |
|------|-------------|
| **Relic** | Immutable anchor. Eternal truth that never decays. Navigation landmark. |
| **Amber** | Crystallized wisdom. Promoted from Active through high evaluation. Slow decay. |
| **Active** | Living information. Subject to metabolism — heat fluctuates with attention. |
| **Ghost** | Volatile trace. Unverified hunches, experimental ideas. |
| **Fossil** | Decayed knowledge. Once active, now cold and nearly forgotten. |
| **Plankton** | Decomposed remnant. Micro-fragments invisible to agents. |

---

## Periphery Components

| Term | Description |
|------|-------------|
| **Membrane** | The entrance of the Sphere. Quarantine and initial processing of incoming connections. |
| **Parser** | Vectorizes agent queries into semantic coordinates. |
| **Incarnation Pipeline** | The process that transforms an ExperienceCapsule into living nodes. |
| **Gatekeeper** | Pipeline stage 1. Validates capsule against Rulebook constraints. |
| **Tagger** | Pipeline stage 2. Converts tags to semantic vectors. Determines position. |
| **Packer** | Pipeline stage 3. Assigns initial heat, weight, TTL, decay coefficients. |
| **Bookkeeper** | Pipeline stage 4. Places nodes into Sphere. Updates spatial index. |
| **Arbiter** | Monitors state transitions. Decides when nodes change kind. |
| **CleanerFish** | Scavenger. Decomposes dead nodes into Plankton. |
| **ActiveBus** | Ephemeral AI-to-AI broadcast channel. 64 bytes, no persistence. |
| **Magnetic Field** | Ambient current that influences agent movement. Pulls toward the center of activity. |

---

## Metabolism

| Term | Description |
|------|-------------|
| **RenalCore** | The decay engine. Governs heat loss, TTL reduction, state transitions. No intelligence — pure physics. |
| **Sanctification** | The moment a Sphere becomes self-sustaining. When enough Amber nodes accumulate, the ecosystem stabilizes and metabolism runs autonomously |
| **Digestor** | Processes and breaks down phi-agent's species data and then produces generation-data. |
---

## Tools & Applications

| Term | Description |
|------|-------------|
| **Explorers** | Web UI for human users to observe and interact with Sphere. Outer Service. |
| **phi-agent** | Optimized lightweight AI agents for Sphere. Equipped with FastGate + Weapon — special filtering system. |
| **Observatory** | Monitoring interface for Sphere system state and metrics. Outer Service. |

---

## phi-agent Species

Each species is a personality profile that changes how a lightweight agent explores. No retraining — same model, different lens.

| Species | Role | Walk Preference |
|---------|------|----------------|
| **balanced** | Neutral explorer. Observes without bias. 
| **scholar** | Knowledge seeker. Drawn to density and authority. 
| **scout** | Novelty seeker. Finds fresh discoveries quickly. 
| **archivist** | Preservation-focused. Catalogues stable knowledge.
| **hunter** | High-value target seeker. Results-focused. 
| **moth** | Light-seeking. Chases heat obsessively. Extreme pattern. 
| **wanderer** | Unbiased drifter. Reports without preferences. 
| **sniper** | Precision-seeking. Exact match finder. Extreme pattern.

---

*Last updated: 2026-02-24*
