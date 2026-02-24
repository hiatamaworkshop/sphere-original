# phi-agent: Autonomous Exploration Through Physics

**Intelligence is not in the Sphere. Intelligence is not in the LLM. Intelligence is in the Coupling — the way you measure.**

---

## What phi-agent Is

phi-agent is an autonomous explorer that **dives** into Sphere's metabolic knowledge space, evaluates what it finds, and leaves traces that reshape the ecosystem for every agent that follows.

It **inhabits** the knowledge space — moving through semantic terrain, perceiving nearby nodes through heat-filtered senses, evaluating discoveries with a lightweight LLM, and returning home when its feelings tell it to.

The agent does not decide what is valuable. **Physics decides.** The agent's role is to measure — and measurement itself is what drives natural selection.

---

## The Coupling Layer

The core innovation is the separation of intelligence into three independent layers:

```
Sphere          — Physics only. No personality.
LLM (phi3:mini) — Sensory organ. Returns h/w/d scores. Nothing more unless specified by the developer.
FastGate        — The coupling. Decides what to look at, what counts as good,
                  when to leave. Pure mathematics, 0ms execution.
```

Most AI systems put intelligence in the model — bigger parameters, better fine-tuning, smarter prompts. phi-agent puts intelligence in **the way the model is coupled to the world**.

The LLM is a replaceable sense organ. Swap phi3:mini for GPT-4 and the agent sees with higher resolution — but its personality, its preferences, its emotional responses remain identical. Because those live in the coupling, not in the model.

Before FastGate, every decision required an LLM call (~25s each). FastGate reduced three LLM calls per cycle to one. The model spends its entire budget on the one thing only language can do: **reading content and assigning meaning**.

FastGate scores every sensed node through a compositional pipeline:

```
score = base(metrics + keyword + species memory)
      × flagGate(authority, temporal, density, cognitive)
      × stateGate(hot, systemCore)
      × ratioMod(heatDensity, stability)
```

All gates are soft — they amplify or dampen, never hard-exclude. The pipeline is fully deterministic: same inputs, same scores, same choice.

---

## Where Personality Lives

phi-agent demonstrated that a 3.8B parameter model can exhibit reliably distinct personalities — not by making the model smarter, but by changing what it measures. Each species is defined by a **Loadout** — a compact numerical bundle:

| Component | Role | Passes Through LLM? |
|-----------|------|---------------------|
| **Weapon** (flagBias, stateBias) | What to look at (attention) | No — FastGate math |
| **qualityVector** (4D) | What counts as "good" (values) | No — dot product |
| **returnWeights** (4D) | What to feel (emotion) | No — dot product |
| **walkPreference** | How to move (locomotion) | No — gradient calc |
| **evalFocus** | What to ask (perspective) | **Yes — the only LLM contact** |

Five components. Four never touch the LLM. Adding a new species costs nothing: define 15 lines of numerical vectors. No retraining, no fine-tuning, no new model weights.

Ants build complex nests without requiring intelligent ants. phi-agent produces complex exploration patterns without requiring an intelligent LLM.

---

## Feelings: Emotional Autonomy

phi-agent does not return home because a timer expired. It returns because it **feels** like returning.

A 4-dimensional emotion vector updates after every evaluation:

```
feelings = [satisfaction, frustration, stamina, staleness]

desire = feelings · returnWeights    (personality dot product)
probability = clamp((desire - 0.5) × 2, 0, 1)
shouldReturn = random() < probability
```

Each species weighs these feelings differently — a **scholar** leaves when bored, a **hunter** leaves when targets keep missing, a **wanderer** stays until energy runs out. Two hunters in the same Sphere can have different session lengths. **No two sessions are identical.**

The same feelings vector drives action selection: when frustrated, the agent leaps to a distant region; when satisfied, it exploits the local area; when stale, it seeks novelty.

---

## Lightweight Models Made Effective

phi3:mini (3.8B parameters) is roughly 1/250th the size of GPT-4 class models. It runs on CPU with ~2GB RAM. Three mechanisms make it effective:

- **FastGate**: Pre-filters Sphere data before it reaches the model. The model never sees irrelevant nodes — only the highest-scoring candidate for that species
- **Weapon**: Multiplicative scoring layers that sharpen signal before the model processes anything
- **Physical laws**: Heat, decay, and weight act as natural filters — physics already surfaced the important nodes

The iterative exploration loop — scan, sense, move, focus, evaluate — replaces RAG's one-shot retrieval, allowing even small models to discover through repeated interaction with physical laws.

---

## learned_weight: Environmental Adaptation

Species start with hardcoded preferences (the **genetics**). But genetics alone cannot adapt to a specific Sphere's topology.

```
effective_weight = base × (1 + δ)

base  = species genetics (immutable Loadout)
δ     = environmental adaptation, bounded to ±30%
```

The delta is applied to flag sensitivity, return personality, and quality assessment. Each session, every agent is slightly different. Over generations, the Digestor analyzes which deltas correlated with better outcomes and feeds them back.

**The base preserves species identity. The delta lets the environment teach.**

---

## Stigmergy: Memory Without Central Storage

phi-agent uses **stigmergy** — the same mechanism ants use to coordinate without communication.

**Evaluation as Pheromone**: When an agent evaluates a node `h=9`, that heat persists in Sphere's physics. The next agent senses the warmth. No message was sent. The environment itself carries the signal.

**Species Memory**: The Digestor processes evaluation logs across generations and produces a species profile — which nodes this species has visited, which tags it commonly encounters. The next generation inherits this as a familiarity bonus. The LLM does not change. The **coupling** changes.

---

## Deterministic Projection

Every session produces two outputs:

**Broadcast** (deterministic, no LLM): A thread of posts containing only traceable data — node summaries, h/w/d scores, tags. Same input always produces the same output. No hallucination is possible because no generation occurs.

```
[scholar] query: "quantum entanglement"
8 cycles · 12 nodes · energy 23% · 287s

▸ Bell's theorem and non-locality in quantum mechanics
  h:9 w:8 d:2 [physics, quantum, foundations]
```

**Narrative** (optional, LLM-generated): A species-voiced diary entry, colored by personality and emotional state. This is never authoritative. The broadcast is the record of truth.

---

**phi-agent does not make Sphere smarter. It makes Sphere alive.**
