# Coupling Layer & Digestor — Developer Guide

> How phi-agent explores the Sphere, and how species memory evolves.

## Architecture at a Glance

```
                        +-----------+
                        |  Sphere   |  Pure physics: decay, heat, weight, TTL
                        | (Periphery|  No personality. No LLM calls. Ever.
                        |  + Renal  |
                        |   Core)   |
                        +-----+-----+
                              |
                    HTTP/WS   |   sense / focus / evaluate / move
                              |
                  +-----------+-----------+
                  |    phi-agent          |  Coupling layer
                  |  (one per explorer)   |  Personality lives HERE
                  +-----------+-----------+
                              |
                    HTTP      |   generate(prompt)
                              |
                        +-----+-----+
                        |  Ollama   |  Interchangeable LLM
                        | (phi3:mini|  Just a sensory organ
                        |  or any)  |
                        +-----------+

  Separate process, shared volume:

                  +-------------------+
                  |     Digestor      |  Species memory metabolism
                  | (periodic, 1h)   |  Reads eval-log, writes profile
                  +-------------------+
                         |
              reads/writes eval-log.jsonl
              writes species-profile.json
              writes generations/gen-NNN.json
```

**Key principle**: Sphere is physics. phi-agent is personality. LLM is a sensor.
These three concerns never mix.

---

## 1. The Coupling Layer

phi-agent is not an "AI agent" in the typical sense. It is a **coupling layer** between a knowledge substrate (Sphere) and a language model (Ollama). Its job:

- **Decide where to look** (FastGate — pure math, 0ms)
- **Ask the LLM what it sees** (one `generate()` call per cycle, ~5-25s)
- **Record the observation** (evaluate — writes h/w/d scores back to Sphere)

The LLM never decides strategy. It only answers: *"How hot (h), weighty (w), and novel (d) is this content?"*

### Why This Matters

Because personality is not in the model — it's in the **measurement apparatus**. A scholar and a kamikaze reading the same node will score it differently, not because they use different LLMs, but because their Loadout vectors interpret the same scores differently.

```
Personality = Loadout (vectors) × Physics (Sphere rules) × Sensor (any LLM)
```

You can swap phi3:mini for GPT-4 or a 1B model. The personality stays the same.

---

## 2. Loadout System

A Loadout is a bundle of numeric vectors that define an agent's personality:

```typescript
interface Loadout {
  name: string;
  weights: FastGateWeights;     // What to pay attention to (perception)
  weapon: Weapon;               // Flag/state biases (worldview)
  qualityVector: number[];      // [heat, weight, preservation, hitRate] (values)
  returnWeights: number[];      // [satisfaction, frustration, stamina, staleness] (emotion)
  walkPreference: WalkMode;     // Movement style: "hot" | "deep" | "explore" | ...
  minCycles: number;            // Minimum exploration before return is possible
  evalFocus: string;            // Hint injected into LLM prompt
}
```

### The 9 Species

| Name | Role | Walk | Trait |
|------|------|------|-------|
| **balanced** | Generalist | explore | Even weights, no extremes |
| **scholar** | Deep reader | deep | High weight sensitivity, sticks around |
| **scout** | Quick surveyor | explore | Fast return, broad coverage |
| **archivist** | Preservationist | deep | Loves Amber (frozen) nodes |
| **hunter** | Heat seeker | hot | Chases high-heat areas |
| **moth** | Heat generator | hot | Evaluates everything as hot |
| **hermit** | Stability seeker | deep | Avoids crowds, seeks stable regions |
| **kamikaze** | Exhaustive explorer | hot | Never returns until energy is gone |
| **sniper** | Selective evaluator | deep | Harsh scorer, high standards |

Each species emerges from the **same code** with different vector values. No special-casing.

### 4D Feelings System

Every cycle, the agent computes four feelings from its session history:

```
feelings = [
  satisfaction:  qualityProfile · qualityVector    (am I finding what I value?)
  frustration:   max(missRate, recentDecline)       (am I failing?)
  stamina:       1 - energyRatio                    (am I tired?)
  staleness:     1 - deltaEntropy                   (am I seeing the same things?)
]
```

These feelings drive action selection:

| Dominant Feeling | Action | Description |
|------------------|--------|-------------|
| satisfaction | camp | Stay put, re-sense same area |
| frustration | leap | Big move in personality direction |
| staleness | leap | Force "explore" mode (break pattern) |
| stamina | scout | Sense-only, no focus (save energy) |

Return desire is `feelings · returnWeights`. A scholar tolerates frustration but returns on staleness. A kamikaze ignores everything except stamina.

---

## 3. Exploration Loop

Each session follows this cycle:

```
connect → transitionToCore → [explore loop] → persistEvalLog → disconnect
```

### One Cycle (standardCycle)

```
1. MOVE      sphere.move(step, mode)        Walk in personality-preferred direction
     ↓                                       Cost: 5 energy
2. SENSE     sphere.sense(radius)            Discover nearby nodes (L2: tags + summary)
     ↓                                       Cost: 3 energy
3. PICK      fastGate.pickFocusTarget()      Score all nodes, pick best — LOCAL, 0ms
     ↓                                       (species memory + bus hints factor in here)
4. FOCUS     sphere.focus(nodeId)            Read full content (L3: content + metadata)
     ↓                                       Cost: 10 energy
5. EVALUATE  ollama.generate(prompt)         LLM scores the content → h, w, d
     ↓                                       Only LLM call per cycle (~5-25s)
6. RECORD    sphere.evaluate(id, h, w, d)    Write scores back to Sphere
     ↓        gate.memory.record(...)         Update local session memory
     ↓                                       Cost: 3 energy
7. BUS       tryEmitBus(nodeId, h, w)        If h≥8, involuntarily broadcast discovery
                                              First emit free, subsequent cost 20 energy
```

Total cost per cycle: ~21 energy. Starting energy: 100. Typical session: 4-5 full cycles.

### FastGate Scoring (Step 3)

```
score = (heat × w_heat + weight × w_weight + decay × w_decay - distance × w_dist)
      + keywordMatch × 5
      + speciesNodeBonus × 3     ← from Digestor profile
      + speciesTagBonus × 3      ← from Digestor profile
      + busHintBonus × 3         ← from other agents' broadcasts

score *= flagGate(authority, catalyst, freshness, sticky)
score *= stateGate(hot, frozen)
score *= ratioModifier(heatDensity, stability)
```

Hard exclusions: visited nodes, ghosts (no content), fossils (compressed), auto-generated.

---

## 4. Species Memory

After each session, the agent appends its evaluations to `eval-log.jsonl`:

```jsonc
// One line per session
{
  "loadout": "kamikaze",
  "model": "phi3:mini",
  "query": "knowledge exploration",
  "timestamp": 1739012345678,
  "duration": 245000,
  "evaluations": [
    { "nodeId": "abc123", "h": 9, "w": 4, "d": 7, "tags": ["physics", "quantum"] },
    { "nodeId": "def456", "h": 6, "w": 8, "d": 3, "tags": ["history", "war"] }
  ],
  "busEmits": 2,
  "busRecvs": 5
}
```

This is **write-only from the agent's perspective**. Agents never read raw eval-log. They read the Digestor's output.

---

## 5. The Digestor

The Digestor is a separate container that periodically metabolizes the raw eval-log into a species profile. It runs independently, like the Sphere's own CleanerFish.

### Why It Exists

Without the Digestor, eval-log.jsonl would:
1. Grow unbounded (no natural death)
2. Accumulate stale data (old evaluations still count)
3. Create echo chambers (species only learn from themselves)

In Sphere philosophy: **append-only without pruning violates the metabolism principle**. Nodes decompose. Evaluations must too.

### Digest Cycle (runs every hour by default)

```
1. READ        Read eval-log.jsonl (all sessions)
      ↓
2. FLATTEN     Convert sessions → individual evaluations
      ↓
3. SCORE       For each evaluation:
      ↓          score = balanced_qv · [h, w, d] × time_decay
      ↓          balanced_qv = [0.33, 0.34, 0.33]  (neutral, no species bias)
      ↓          time_decay = exp(-age_hours / half_life)
      ↓
4. PRUNE       Survival selection based on hunger:
      ↓          score ≥ threshold  →  always survives
      ↓          score < threshold  →  survival lottery (min 5% chance)
      ↓          small species (< 20 evals) → protected from extinction
      ↓
5. PROFILE     Aggregate survivors per species:
      ↓          Per species: avgH, avgW, avgD, hotNodes (top 10), commonTags (top 15)
      ↓          Environmental blend: 0.7 × own_species + 0.3 × global
      ↓          → species-profile.json (agents read this)
      ↓
6. ARCHIVE     Save generation snapshot:
      ↓          → generations/gen-NNN.json (permanent record)
      ↓
7. TRUNCATE    Rewrite eval-log.jsonl with survivors only
                 → Dead evaluations are gone. Their legacy lives in gen-N.
```

### Hunger Curve

Hunger controls how aggressively the Digestor prunes:

```
eval count < 200   → hunger = 0.2  (keep ~80%)
200 - 500          → hunger = 0.2 - 0.8  (linear)
> 500              → hunger = 0.8 - 1.0  (aggressive)
```

Low data = gentle pruning. High data = strong selection pressure.

### Environmental Blend

Each species profile is pre-blended before agents read it:

```
profile[scholar] = 0.7 × scholar_aggregate + 0.3 × global_aggregate
```

This prevents echo chambers. A scholar who only reads about physics will still receive 30% influence from what hunters and moths found interesting. It's the equivalent of environmental pressure in evolution.

### Generation Archive

Each Digestor run produces a permanent snapshot:

```jsonc
// generations/gen-003.json
{
  "generation": 3,
  "timestamp": "2026-02-09T07:25:00.000Z",
  "inputEvaluations": 476,
  "survivedEvaluations": 458,
  "hunger": 0.53,
  "halfLifeHours": 72,
  "species": {
    "kamikaze": { "evaluations": 143, "avgH": 6.8, "avgW": 5.9, ... },
    "scholar":  { "evaluations": 91,  "avgH": 5.4, "avgW": 7.0, ... },
    ...
  },
  "global": { ... }
}
```

Individual evaluations die. The generation profile is their fossil record.

### Defense Against Drift

| Layer | Mechanism | Status |
|-------|-----------|--------|
| 1st | Environmental blend (0.7/0.3) | Implemented |
| 2nd | Ancestral recall (blend gen-001 at low weight) | Future option |

The 2nd defense uses the same `blendEntry()` function — no new code needed. It activates if score distributions converge too tightly across generations.

---

## 6. ActiveBus (Inter-Agent Communication)

Agents can broadcast discoveries involuntarily:

- **Trigger**: `h ≥ 8` (strong reaction leaks into the air)
- **Payload**: `[h, w, ...nodeId_utf8]` (max 64 bytes)
- **Cost**: First emit per session is free ("birth cry"), subsequent: 20 energy
- **Reception**: Other agents receive hints via WebSocket, stored as `busHints`
- **Effect**: +3 bonus in FastGate scoring (decays over 5 min half-life)

This is **not strategic communication**. It's involuntary pheromone release. A kamikaze finding something exciting can't help but leak it. A hermit absorbs these signals but rarely emits.

---

## 7. Data Flow Summary

```
                    phi-agent (session N)
                         |
                    appendEvalLog()
                         |
                         v
                  eval-log.jsonl  ←──────────────────┐
                         |                            |
                    [Digestor reads]              [Digestor writes back
                         |                        survivors only]
                         v
                  scoring + pruning
                         |
              ┌──────────┼──────────┐
              v          v          v
     species-profile  gen-NNN    eval-log
        .json          .json     (truncated)
              |
              v
        phi-agent (session N+1)
          loadSpeciesProfile()
              |
              v
          FastGate scoring
         (hotNodes bonus,
          tag bonus)
```

---

## 8. Running

### Docker Compose (recommended)

```bash
# Start everything: Sphere + Ollama + 3 agents + Digestor + Pool
docker compose --profile agent up -d --scale phi-agent=3

# Custom species (single agent)
docker compose --profile agent run -d \
  -e LOADOUT=scholar -e DAEMON=true \
  phi-agent

# Digestor with custom interval (7 min for testing)
docker compose --profile agent run -d \
  -e DIGEST_INTERVAL_MS=420000 \
  digestor
```

### Environment Variables

**phi-agent:**
| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API URL |
| `OLLAMA_MODEL` | `phi3:mini` | LLM model name |
| `SPHERE_URL` | `http://localhost:3001` | Periphery HTTP |
| `SPHERE_WS` | `ws://localhost:3001` | Periphery WebSocket |
| `LOADOUT` | `balanced` | Species name or `random` |
| `DAEMON` | `false` | Run indefinitely |
| `DAEMON_SLEEP_MS` | `30000` | Sleep between sessions |

**Digestor:**
| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `/app/data` | Shared data directory |
| `DIGEST_INTERVAL_MS` | `3600000` | Digest cycle interval (1h) |
| `HALF_LIFE_HOURS` | `72` | Time decay half-life |
| `MIN_EVALS` | `50` | Minimum evals before digesting |
| `MIN_PER_SPECIES` | `20` | Extinction protection threshold |

### Shared Volume

Both phi-agent and Digestor mount the same Docker volume (`phi-agent-data`) at `/app/data`:

```
/app/data/
  eval-log.jsonl           # Agent writes, Digestor reads+truncates
  species-profile.json     # Digestor writes, Agent reads
  generations/
    gen-001.json           # Permanent generation snapshots
    gen-002.json
    ...
```

---

## 9. Biological Analogy

| Sphere Concept | Biology | Role |
|----------------|---------|------|
| Loadout | Genotype | Initial personality (static) |
| Species Memory | Culture | Accumulated collective knowledge |
| Digestor | Natural Selection | Prunes weak memories, preserves strong |
| species-profile.json | Phenotype | Observable behavior (shaped by genes + culture) |
| gen-NNN.json | Fossil Record | Permanent trace of past generations |
| Environmental Blend | Gene Flow | 30% cross-species influence prevents isolation |
| eval-log.jsonl | Stomach | Undigested data awaiting metabolism |
| ActiveBus | Pheromones | Involuntary chemical signals between individuals |

The system follows stigmergic principles: agents don't communicate directly. They modify the environment (Sphere nodes via evaluations, species memory via eval-log), and other agents respond to those modifications. Intelligence emerges from the substrate, not from any individual agent.
