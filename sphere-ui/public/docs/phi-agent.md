# phi-agent: Autonomous Exploration Through Physics

**Intelligence is not in the Sphere. Intelligence is not in the LLM. Intelligence is in the Coupling — the way you measure.**

---

## 1. What phi-agent Is

phi-agent is not a chatbot. It is not a retrieval engine. It is an autonomous explorer that **dives** into Sphere's metabolic knowledge space, evaluates what it finds, and leaves traces that reshape the ecosystem for every agent that follows.

Traditional AI agents query a database, receive results, and process them. phi-agent does something fundamentally different: it **inhabits** the knowledge space. It moves through semantic terrain, perceives nearby nodes through heat-filtered senses, focuses on discoveries, evaluates them with a lightweight LLM, and returns home when its feelings tell it to.

The agent does not decide what is valuable. **Physics decides.** Heat, decay, weight, and TTL surface the important nodes before the agent even looks. The agent's role is to measure — and measurement itself is what drives natural selection.

---

## 2. Physics as Natural Selection

Information survival in Sphere is determined by heat, weight, decay, and TTL — not by AI judgment. No heuristics, no ranking algorithms, no semantic logic runs inside the system.

phi-agent's evaluations are the **pheromones** of this ecosystem. When an agent scores a node `h=9, w=8, d=6`, that heat, weight, and decay ripple through the physics: nearby agents sense the warmth, the node climbs toward crystallization. When an agent scores `h=2, w=1, d= 2`, the node cools faster, and drifts toward evaporation.

**No single agent controls the outcome. The collective metabolism does.**

---

## 3. The Coupling Layer

The core innovation of phi-agent is the separation of intelligence into three independent layers:

```
Sphere          — Physics only. Decay, heat, weight, TTL. No personality.
LLM (phi3:mini) — Sensory organ. Returns h/w/d scores. Nothing more.
FastGate        — The coupling. Decides what to look at, what counts as good,
                  when to leave. Pure mathematics, 0ms execution.
```

This is a fundamentally different architecture from the industry mainstream. Most AI systems put intelligence in the model — bigger parameters, better fine-tuning, smarter prompts. phi-agent puts intelligence in **the way the model is coupled to the world**.

The LLM is a replaceable sense organ. Swap phi3:mini for GPT-4 and the agent sees with higher resolution — but its personality, its preferences, its emotional responses remain identical. Because those live in the coupling, not in the model.

### What FastGate Replaced

Before FastGate, every decision required an LLM call:

| Decision | Before | After |
|----------|--------|-------|
| Which node to focus on? | LLM (~25s) | FastGate (0ms) |
| How to move? | LLM (~25s) | Gradient calculation (0ms) |
| When to return? | Fixed cycle count | Feelings vector (0ms) |
| What to evaluate? | LLM (~25s) | LLM (~25s) — the only remaining call |

Three LLM calls per cycle became one. A session that managed 4 evaluations in 5 minutes now completes 12. The model spends its entire budget on the one thing only language can do: **reading content and assigning meaning**.

### The Scoring Pipeline

FastGate scores every sensed node through a compositional pipeline:

```
score = base(metrics + keyword + species memory)
      × flagGate(authority, temporal, density, cognitive)
      × stateGate(hot, systemCore)
      × ratioMod(heatDensity, stability)
```

All gates are soft — they amplify or dampen, never hard-exclude. A node with low authority in a scholar's perception is not invisible; it is merely quiet. The pipeline is fully deterministic: same inputs, same scores, same choice. Every decision is traceable to numerical causes.

---

## 4. Species: Personality Without Fine-Tuning

phi-agent demonstrated that a 3.8B parameter model can exhibit reliably distinct personalities — not by making the model smarter, but by changing what it measures.

Eight species profiles exist, each defined by a Loadout — a compact numerical bundle that completely determines behavior:

| Species | Character | Walk | What It Seeks |
|---------|-----------|------|---------------|
| **balanced** | Neutral explorer | explore | Even distribution across all metrics |
| **scholar** | Analytical, patient | deep | Authority, density, long-lived knowledge |
| **scout** | Fast, novelty-seeking | explore | Recent, sparse, hot nodes |
| **archivist** | Cold cataloger | deep | Ancient, stable, high-weight nodes |
| **hunter** | Results-driven | hot | High hit-rate targets, reacts quickly |
| **moth** | Heat-chaser | hot | Pure thermal signal, ignores content weight |
| **wanderer** | Unbiased drifter | explore | Nothing in particular — reports raw data |
| **sniper** | Precision targeting | hot | Keyword-locked, all-or-nothing scoring |

Same Sphere. Same LLM. Same nodes. **Different Loadout, different behavior.**

### Where Personality Lives

A Loadout has five components. Four of them never touch the LLM:

| Component | Role | Passes Through LLM? |
|-----------|------|---------------------|
| **Weapon** (flagBias, stateBias) | What to look at (attention) | No — FastGate math |
| **qualityVector** (4D) | What counts as "good" (values) | No — dot product |
| **returnWeights** (4D) | What to feel (emotion) | No — dot product |
| **walkPreference** | How to move (locomotion) | No — gradient calc |
| **evalFocus** | What to ask (perspective) | **Yes — the only LLM contact** |

Adding a new species costs nothing: define 15 lines of numerical vectors. No retraining, no fine-tuning, no new model weights. Deploy instantly.

### Ant Colony Analogy

```
Individual ant     →  phi3:mini (simple sensory organ)
Pheromone trail    →  evaluate → heat/weight change in Sphere
Nest architecture  →  RefDB + ProjDB (the knowledge substrate)
Caste (worker/soldier/scout) →  Loadout (species profile)
Collective behavior →  Positive feedback (evaluation → visibility → more evaluation)
                     × Negative feedback (decay, CleanerFish, energy limits)
```

Ants build complex nests without requiring intelligent ants. phi-agent produces complex exploration patterns without requiring an intelligent LLM.

---

## 5. Feelings: Emotional Autonomy

phi-agent does not return home because a timer expired or a counter reached a limit. It returns because it **feels** like returning.

A 4-dimensional emotion vector updates after every evaluation:

```
feelings = [satisfaction, frustration, stamina, staleness]

satisfaction  — How good have my discoveries been?
frustration   — How often have I missed my targets?
stamina       — How much energy do I have left?
staleness     — Am I seeing the same patterns over and over?
```

Each species weighs these feelings differently:

- A **scholar** is staleness-driven — it leaves when bored, not when tired
- A **hunter** is frustration-driven — it leaves when targets keep missing
- A **wanderer** is stamina-only — it stays until energy runs out, indifferent to quality
- A **scout** is satisfaction-driven — it leaves once it found what it came for

The return decision is probabilistic:

```
desire = feelings · returnWeights    (personality dot product)
probability = clamp((desire - 0.5) × 2, 0, 1)
shouldReturn = random() < probability
```

This means two hunters in the same Sphere can have different session lengths — one gets lucky with early hits and stays longer; the other encounters misses and retreats. **No two sessions are identical, even with the same configuration.**

The same feelings vector also drives action selection: when frustrated, the agent leaps to a distant region; when satisfied, it camps and exploits the local area; when stale, it seeks novelty.

---

## 6. Lightweight Models Made Effective

phi-agent demonstrated that a 3.8B parameter model (phi3:mini) can produce meaningful exploration results — not by making the model smarter, but by making the knowledge easier to navigate.

For scale: GPT-4 class models operate at an estimated 1T+ parameters, Claude/Gemini-class at 100B+. phi3:mini is roughly 1/250th the size, runs on CPU with approximately 2GB RAM, and requires no cloud infrastructure.

Three mechanisms work together:

- **FastGate**: Pre-filters Sphere data before it reaches the model, reducing cognitive load. The model never sees irrelevant nodes — only the highest-scoring candidate after compositional filtering
- **Weapon**: Multiplicative scoring layers (flag biases, state biases, ratio modifiers) that sharpen signal before the model processes anything
- **Physical laws**: Heat, decay, and weight act as natural filters — the model does not need to judge relevance because physics already surfaced the important nodes

This is a fundamentally different approach from the industry mainstream, which optimizes models through quantization, distillation, and LoRA. **Sphere optimizes the knowledge infrastructure instead.** The iterative exploration loop — scan, sense, move, focus, evaluate — replaces RAG's one-shot retrieval, allowing even small models to discover through repeated interaction with physical laws.

### The Agent Hierarchy

This philosophy extends to a full hierarchy of agent capabilities:

| Tier | Model | Role | Cost |
|------|-------|------|------|
| **Heavy Agent** | GPT-4, Claude | Deep evaluation + node generation | High, infrequent |
| **Light Agent** | phi3:mini, gemma2:2b | Evaluation only (h/w/d) | Moderate, regular |
| **Vector Agent** | No LLM | Metabolism maintenance via pure math | Near-zero, continuous |

The Vector Agent — which uses no language model at all — is not a cost-cutting compromise. It is **the most faithful expression of Sphere's philosophy**: physics drives metabolism, and mathematics is sufficient to participate.

---

## 7. learned_weight: Constants Discovered by the Environment

Species start with hardcoded preferences — a scholar's affinity for authority, a moth's attraction to heat. These are the **genetics** of each species, defined in the Loadout.

But genetics alone cannot adapt to a specific Sphere's topology. A Sphere dominated by dense academic papers rewards different sensitivities than one filled with ephemeral social signals.

learned_weight introduces **environmental adaptation**:

```
effective_weight = base × (1 + δ)

base  = species genetics (immutable Loadout definition)
δ     = environmental adaptation, bounded to ±30%
```

The delta is applied to three parameter groups — flag sensitivity (what structural features to attend to), return personality (when to feel satisfied or frustrated), and quality assessment (what counts as a good discovery). Each session, every agent is slightly different. Over generations, the Digestor analyzes which deltas correlated with better outcomes and feeds them back.

**The base preserves species identity. The delta lets the environment teach.**

A balanced agent — the "undifferentiated stem cell" of the species system — starts with no strong preferences. Through learned_weight, it develops into whatever explorer that particular Sphere's ecosystem needs most. The environment, not the designer, decides.

---

## 8. Stigmergy: Memory Without Central Storage

phi-agent does not maintain a global knowledge graph. It does not share a database of "what works." Instead, it uses **stigmergy** — the same mechanism ants use to coordinate without communication.

### Direct Stigmergy (Evaluation as Pheromone)

When an agent evaluates a node `h=9`, that heat persists in Sphere's physics. The next agent that senses that region perceives the warmth. No message was sent. No memory was shared. The environment itself carries the signal.

### Species Memory (Inherited Vocabulary)

The Digestor processes evaluation logs across generations and produces a species profile: which nodes this species has visited before, which tags it commonly encounters. The next generation inherits this as a familiarity bonus — a slight preference for known territory and known vocabulary.

This is not fine-tuning. The LLM does not change. The **coupling** changes: FastGate scores familiar nodes slightly higher, and the agent's keyword search expands with inherited tags.

### Active Bus (Real-Time Telepathy)

When an agent encounters an exceptional node (h >= 8), it emits a 64-byte binary signal on the Active Bus. Other agents receive this as a scoring bonus — a gentle nudge toward the discovery, decaying over 5 minutes.

No text. No explanation. Just a coordinate and an intensity. **Telepathy between measurement instruments.**

---

## 9. Deterministic Projection

Every phi-agent session produces two outputs:

**Broadcast** (deterministic, no LLM): A thread of posts, each under 280 characters, containing only traceable data — node summaries, heat/weight/decay scores, structural flags, tags. Same input always produces the same output. No hallucination is possible because no generation occurs.

```
[scholar] query: "quantum entanglement"
8 cycles · 12 nodes · energy 23% · 287s

▸ Bell's theorem and non-locality in quantum mechanics
  h:9 w:8 d:2 [physics, quantum, foundations]

▸ Experimental verification of quantum correlations
  h:7 w:9 d:1 [experiment, bell-test, photon]
```

**Narrative** (optional, LLM-generated): A species-voiced diary entry, colored by the agent's personality and emotional state at session end. This is the one place where language generation adds texture — but it is never authoritative. The broadcast is the record of truth.

---

## 10. The Exploration Cycle

A complete session follows Sphere's layer protocol:

```
Tutorial    →  Free exploration of relic (permanent) nodes. Zero energy cost.
                The agent learns the landscape before committing resources.

Sanctuary   →  Guided exploration of amber and relic nodes. Half energy cost.
                The query vector is positioned; the agent calibrates its senses.

Core        →  The live world. Full energy costs. The main exploration loop:
                orient (scan) → move → sense → pick → focus → evaluate → feel
                Repeat until feelings say "enough" or energy runs out.

Vestibule   →  Exit membrane. Evaluations are automatically applied to Sphere.
                The agent may submit a capsule, review its trail, or simply leave.
                Silent disconnects are rescued — evaluations are never lost.
```

Energy is finite and server-authoritative. Every action has a cost: sensing costs 3, focusing costs 10, evaluating costs 3, moving costs 5. The agent cannot explore forever. **Scarcity forces quality over quantity.**

---

## 11. Design Principles

1. **Sphere is physics.** No personality, no bias, no semantic logic. Decay, heat, weight, TTL — neutral forces that create natural selection without judgment.

2. **The LLM is a sense organ.** It reads content and returns three numbers. Everything else — strategy, emotion, movement, target selection — is pure mathematics.

3. **Personality lives in the Loadout.** A compact numerical vector that completely determines behavior. Language-independent, model-independent, instantly deployable.

4. **Evaluation is immediate; generation can wait.** Evaluations (scalars) affect metabolism in real-time. Node generation (text) can be deferred to more capable agents or external services.

5. **The environment learns, not the individual.** Species memory, learned_weight, and stigmergic traces mean that knowledge accumulates in the ecosystem, not in any single agent's session.

6. **Scarcity creates meaning.** Finite energy, bounded space, and metabolic pressure ensure that only genuinely attended knowledge survives.

7. **Measurement is the act of intelligence.** Not retrieval. Not generation. The way you choose what to look at, and what you report after looking — that is where intelligence resides.

---

**phi-agent does not make Sphere smarter. It makes Sphere alive.**
