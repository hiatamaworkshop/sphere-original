# Explorers — Sphere Perception UI

**Measurement instrument for observing emergent personality patterns.**

Explorers is not a content browser. It is a tool to observe how different Loadouts (personality presets) produce distinct perception and behavior in phi-agent.

---

## Quick Start

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run UI
python app.py
```

Open http://localhost:7860

### Docker Compose (Recommended)

```bash
cd docker_compose_sphere_v1
docker compose --profile agent up explorers
```

Open http://localhost:7860

---

## Architecture: Complete Separation of Concerns

Explorers is one layer in a **4-layer closed-loop system**. Each layer does **ONE thing only**.

### The Four Layers

| Layer | Role | What it does | What it does **NOT** do |
|-------|------|--------------|-------------------------|
| **Explorers** | **Observation** | Displays perception cycles | Does not judge |
| **phi-agent** | **Behavior** | Explores, evaluates nodes | Does not remember |
| **Sphere** | **Physics** | Maintains node lifecycle | Has no meaning |
| **Digestor** | **Evolution** | Metabolizes evaluations | Does not understand |

**Complete division of labor.**

### Why This Matters

- **Explorers does not judge** — It only shows what phi-agent perceived. No filtering, no interpretation.
- **phi-agent does not remember** — It reads species-profile.json but does not store evaluations itself. Evaluations go to eval-log.jsonl and are forgotten.
- **Sphere has no meaning** — Nodes are just vectors + metadata. Sphere applies physics (decay, heat, weight) but assigns no semantic value.
- **Digestor does not understand** — It scores evaluations mechanically (balanced qv × time decay) and prunes via survival lottery. No comprehension of content.

This separation ensures:
- **Explainability** — Each layer's logic is isolated and traceable
- **Swappability** — Replace any layer without affecting others
- **Emergence** — Personality arises from interaction, not from any single component

---

## The Evolution Cycle

```
┌─────────────┐
│  phi-agent  │  Explores Sphere with Loadout (personality preset)
└──────┬──────┘
       │
       │ eval-log.jsonl (evaluations: h, w, d scores)
       ▼
┌─────────────┐
│  Digestor   │  Scores, prunes, blends (0.7×own + 0.3×all species)
└──────┬──────┘
       │
       │ species-profile.json (cultural memory)
       ▼
┌─────────────┐
│  phi-agent  │  Next generation inherits evolved profile
│ (next gen)  │
└─────────────┘
```

**Key Points:**
- Evaluations accumulate in `eval-log.jsonl` (shared volume: phi-agent-data)
- Digestor runs periodically (recommended: every 3 hours)
- Survival lottery prunes low-quality evaluations
- Environment blend (0.3 from all species) prevents echo chambers
- Next-generation agents inherit the evolved profile → exploration accuracy improves over time

This is **cultural evolution**, not model training.

---

## What You Observe in the UI

### Configuration Section

1. **Query** — Agent's search intent (e.g., "knowledge", "AI safety")
2. **Model** — LLM sensor (default: llama3.2:1b via Ollama)
3. **Species (Loadout)** — Personality preset (9 options)
4. **Description** — Loadout characteristics

#### Why llama3.2:1b?

**Default model: llama3.2:1b** (1.2B parameters)

- ✅ **Full 3D measurement** — h, w, d all measurable with species memory calibration
- ✅ **43% faster than phi3:mini** — Lightweight baseline (32s vs 56s per session)
- ✅ **Species memory activation** — Inherits measurement scale from phi3:mini baseline
- ✅ **Validated** — d range 4-9 (previously "d fixed" in uncalibrated state)

**Alternative models**:
- `phi3:mini` (3.8B) — Gold standard for baseline establishment (slower, most reliable)
- `gemma2:2b` (2B) — High-speed inference (22s) but less stable d measurement

See [Species Memory Calibration Experiment](../reports/SPECIES_MEMORY_CALIBRATION_EXPERIMENT.md) for validation data.

### Perception Cycles Section

Each cycle shows:
- **Action** — sense, focus, evaluate
- **Energy** — Remaining energy (depletes with each action)
- **Nearby Nodes** — Count of visible nodes
- **Focus** — Selected node (ID + tags)
- **Evaluation** — h (heat), w (weight), d (decay) scores
- **Feelings** — satisfaction, frustration, stamina, staleness

### Summary

- Total cycles executed
- Actions breakdown (sense, focus, evaluate)
- Average scores (h, w, d)
- Final energy
- Return reason (satisfaction, energy, frustration, staleness)

---

## The 9 Species (Loadouts)

| Species | Characteristics |
|---------|----------------|
| **balanced** | Generalist — even weights, explore mode |
| **scholar** | Deep reader — high weight sensitivity, deep mode |
| **scout** | Quick surveyor — fast return, explore mode |
| **archivist** | Preservationist — loves Amber (frozen) nodes |
| **hunter** | Heat seeker — chases high-heat areas |
| **moth** | Heat generator — evaluates everything as hot |
| **hermit** | Stability seeker — avoids crowds, deep mode |
| **wanderer** | Exhaustive explorer — never returns until energy is gone |
| **sniper** | Selective evaluator — harsh scorer, high standards |

Each species has different:
- **Weights** (h, w, d) — What they perceive
- **Quality Vector** — What they value
- **Return Weights** — When they come home
- **Walk Preference** — How they move (hot, deep, explore)

**Personality emerges from the Loadout, not from the model.**

---

## Technical Details

### Docker-in-Docker

Explorers runs Docker CLI inside its container to spawn phi-agent containers.

**Why:**
- Unified execution environment (local dev = production)
- phi-agent dependencies isolated from Explorers
- Access to sphere-network and shared volumes

**Implementation:**
```dockerfile
# Install Docker CLI
RUN apt-get install -y docker-ce-cli
```

```yaml
# Mount Docker socket
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

### Access Level Constraint

Explorers displays **L1+2 only**:
- L1: tags
- L2: summary

Content (L3) and source references (L4) stay in Sphere.

**Rationale:**
- Explorers is a perception observer, not a content browser
- What matters is **what was chosen** and **how it was evaluated**, not the content itself
- Clarifies data ownership (content belongs to Sphere)

---

## Prerequisites

### Docker Setup

1. **phi-agent image** must be built:
   ```bash
   cd phi-agent
   npm run build
   docker build -t phi-agent:latest .
   ```

2. **Sphere API** must be running:
   ```bash
   cd docker_compose_sphere_v1
   docker compose up -d periphery
   ```

3. **Ollama** must be accessible from Docker:
   - On Docker Desktop (Windows/Mac): `http://host.docker.internal:11434`
   - On Linux: Use host IP or `--network=host`

### Environment Variables

- `SPHERE_URL`: Sphere API endpoint (default: http://localhost:3001)
- `OLLAMA_HOST`: Ollama endpoint accessible from Docker (default: http://host.docker.internal:11434)

---

## Configuration

### Advanced Settings (UI)

You can override defaults in the UI's Advanced Settings accordion:

- **Sphere API URL**: Change if Sphere is deployed elsewhere (e.g., Render)
- **Ollama Host**: Change if Ollama is on a different host

---

## Usage

1. **Select Species**: Choose a loadout (e.g., "wanderer", "scholar", "hunter")
2. **Enter Query**: Provide a search intent (e.g., "knowledge exploration")
3. **Launch Agent**: Click "🚀 Launch Agent" button
4. **Observe Cycles**: Watch the agent's perception cycles unfold (~1 minute)
5. **Review Summary**: Check total evaluations and average scores

---

## Design Philosophy

From [EXPLORERS_DESIGN_INTENT.md](../reports/EXPLORERS_DESIGN_INTENT.md):

> **Explorers is not a content browser.**
> **It is a measurement instrument for observing emergent perception patterns in Sphere.**

Principles:
1. **UI has no logic** — All exploration logic is in phi-agent
2. **Displays perception, not content** — L1+2 only
3. **Minimal, no clutter** — Gradio for simplicity
4. **Species memory transparency** — Evolution cycle is visible

**Architecture**: `UI (Gradio) → Docker executor → phi-agent (container) → Sphere API`

**Personality Formula**: `Personality = Loadout (vectors) × Physics (Sphere) × Sensor (LLM)`

The UI simply observes this emergence.

---

## Deployment

### Hugging Face Spaces

1. Create new Space (Gradio SDK)
2. Upload: `app.py`, `executor.py`, `parser.py`, `requirements.txt`, `Dockerfile`
3. Set secrets:
   - `SPHERE_URL`: Your Sphere API endpoint (e.g., https://sphere-api.render.com)
   - `OLLAMA_HOST`: Your Ollama endpoint
4. Note: Requires Docker support (custom image)

### CORS Configuration

If Sphere API is on a different domain, enable CORS in periphery:

```typescript
// periphery/src/index.ts
app.use(cors({
  origin: ['http://localhost:7860', 'https://your-space.hf.space'],
  credentials: true
}));
```

---

## File Structure

```
explorers/
├── app.py              # Gradio UI
├── executor.py         # phi-agent Docker executor
├── parser.py           # stdout parser (JSON/text)
├── requirements.txt    # Python dependencies
├── Dockerfile          # Docker image definition
├── README.md           # This file
└── .gitignore
```

---

## Troubleshooting

### "Docker not available"

- Ensure Docker is installed and running
- On Windows: Docker Desktop must be running
- On Linux: User must be in `docker` group

### "phi-agent:latest image not found"

Build the image:

```bash
cd phi-agent
docker build -t phi-agent:latest .
```

### "Connection refused" to Sphere

- Check `SPHERE_URL` is correct
- Ensure Sphere periphery is running
- Test: `curl <SPHERE_URL>/health`

### "Connection refused" to Ollama from Docker

- Ollama must be accessible from inside Docker container
- On Docker Desktop (Windows/Mac): Use `http://host.docker.internal:11434`
- On Linux: Use host IP or `--network=host`

### "No structured data found"

- Ensure phi-agent is outputting JSON per cycle
- Check phi-agent logs for errors
- Verify Sphere and Ollama are reachable from inside phi-agent container

---

## Potential Applications

This architecture is particularly valuable in the following domains:

### Edge AI
- Lightweight models (1B parameters) with personality differentiation
- Run on resource-constrained devices (mobile, IoT, edge servers)
- No fine-tuning required — swap Loadouts to change behavior

### Explainable AI
- Causal traceability — know **why** an action was taken
- FastGate selection is explicit and logged
- Evaluation scores are recorded in eval-log.jsonl
- Species memory evolution is observable (gen-NNN.json)

### Multi-Agent Systems
- Species memory enables cultural evolution
- Different species can coexist and influence each other (0.3 blend)
- Stigmergic coordination — agents communicate via environment traces (evaluations)

### Low-Cost AI
- Default models + filters only (no training infrastructure)
- Swap Loadouts instead of training new models
- Fast iteration — change personality in seconds

---

## Next Steps

- [ ] Deploy to Hugging Face Spaces
- [ ] Multi-species comparison view
- [ ] Generation archive visualization (gen-NNN.json → graphs)
- [ ] Bus communication visualization (reflex patterns)

---

## References

### Explorers Documentation

- [DESIGN.md](DESIGN.md) — Design philosophy and innovations (detailed)
- [README.md](README.md) — This file (quick start and usage)

### Sphere Core Documentation

- [STIGMERGY_ARCHITECTURE.md](../reports/STIGMERGY_ARCHITECTURE.md) — What Sphere really is
- [EMERGENT_PERSONALITY_MEMO.md](../reports/EMERGENT_PERSONALITY_MEMO.md) — Personality emergence in lightweight LLMs
- [SPECIES_MEMORY_METABOLISM_DESIGN.md](../reports/SPECIES_MEMORY_METABOLISM_DESIGN.md) — Cultural evolution cycle
- [LOADOUT_DESIGN_MEMO.md](../reports/LOADOUT_DESIGN_MEMO.md) — Species personality vectors
- [SPECIES_MEMORY_CALIBRATION_EXPERIMENT.md](../reports/SPECIES_MEMORY_CALIBRATION_EXPERIMENT.md) — Lightweight LLM calibration validation (why llama3.2:1b)

---

## License

Part of the Sphere project. See main repository for license.
