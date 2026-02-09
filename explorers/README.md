# Explorers

Minimal web UI to launch phi-agent containers with different **Loadouts** (personality presets) and observe their perception cycles.

## Architecture

```
UI (Gradio) → executor.py → phi-agent (Docker) → Sphere API
```

- **UI**: Gradio app (species selector, execute button, cycle viewer)
- **executor.py**: Spawns phi-agent Docker containers
- **parser.py**: Parses phi-agent stdout (JSON or text)
- **phi-agent**: Couples LLM to Sphere exploration endpoints

## Features

### Phase 1 (MVP) ✅

- **Species Selector**: Choose from 9 loadout presets
- **Execute Button**: Launch phi-agent with selected species
- **Cycle Viewer**: Display sense/focus/evaluate cycles in real-time
- **Summary Stats**: Total cycles, evaluations, avg h/w/d scores

### Phase 2 (Future)

- Loadout Display: Show weights, qualityVector, returnWeights
- Digestor Status: Species memory stats, survival rates
- Multi-agent comparison: Run multiple species in parallel

## Quick Start

### 1. Build phi-agent (with JSON output support)

```bash
# Build TypeScript
cd phi-agent
npm run build

# Build Docker image
docker build -t phi-agent:latest .
```

### 2. Check Environment

```bash
cd explorers
python check_env.py
```

This verifies:
- ✅ Docker is available
- ✅ phi-agent:latest image exists
- ✅ Sphere API is reachable
- ⚠️ Ollama (checked from inside Docker, optional for this check)

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Run UI

```bash
python app.py
```

UI will be available at: http://localhost:7860

---

## Setup Details

### Prerequisites

1. **Docker**: phi-agent must be available as `phi-agent:latest` image
2. **Sphere API**: Running at specified URL (default: localhost:3001)
3. **Ollama**: Running and accessible from Docker (default: host.docker.internal:11434)

## Configuration

### Environment Variables

- `SPHERE_URL`: Sphere API endpoint (default: http://localhost:3001)
- `OLLAMA_HOST`: Ollama endpoint accessible from Docker (default: http://host.docker.internal:11434)

### Advanced Settings (UI)

You can override these in the UI:

- **Sphere API URL**: Change if Sphere is deployed elsewhere (e.g., Render)
- **Ollama Host**: Change if Ollama is on a different host
- **Model**: Change LLM model (default: llama3.2:1b)

## Usage

1. **Select Species**: Choose a loadout (e.g., "wanderer", "scholar", "hunter")
2. **Enter Query**: Provide a search intent (e.g., "knowledge exploration")
3. **Launch Agent**: Click "Launch Agent" button
4. **Observe Cycles**: Watch the agent's perception cycles unfold
5. **Review Summary**: Check total evaluations and average scores

## Design Philosophy

This UI is a **measurement apparatus**, not a content browser:

- **No FastGate**: Does not implement FastGate logic (weights, scoring)
- **No Feelings**: Does not compute satisfaction/staleness/etc.
- **No Content Display**: Shows L2 (tags + summary) only, not full content (L3)
- **Docker-based**: UI launches phi-agent containers, agent handles all logic

**Personality emerges from**: `Loadout (vectors) × Physics (Sphere) × Sensor (LLM)`

The UI simply observes this emergence.

## Deployment

### Local Development

```bash
python app.py
```

### Hugging Face Space

1. Create new Space (Gradio SDK)
2. Upload: `app.py`, `executor.py`, `parser.py`, `requirements.txt`
3. Set secrets:
   - `SPHERE_URL`: Your Sphere API endpoint (e.g., https://sphere-api.render.com)
   - `OLLAMA_HOST`: Your Ollama endpoint
4. Note: Docker execution in HF Space requires custom image or workarounds

### CORS Configuration

If Sphere API is on a different domain, enable CORS:

```typescript
// periphery/src/index.ts
app.use(cors({
  origin: ['http://localhost:7860', 'https://your-hf-space.hf.space'],
  credentials: true
}));
```

## File Structure

```
explorers/
├── app.py              # Gradio UI
├── executor.py         # phi-agent Docker executor
├── parser.py           # stdout parser
├── requirements.txt    # Python dependencies
├── README.md           # This file
└── .gitignore
```

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
- Try: `curl <SPHERE_URL>/health`

### "Connection refused" to Ollama from Docker

- Ollama must be accessible from inside Docker container
- On Docker Desktop (Windows/Mac): Use `http://host.docker.internal:11434`
- On Linux: Use host IP or `--network=host`

## Related Documents

- [EXPLORERS_UI_DESIGN.md](../reports/EXPLORERS_UI_DESIGN.md) — Design philosophy and architecture
- [COUPLING_LAYER_AND_DIGESTOR_GUIDE.md](../docs/COUPLING_LAYER_AND_DIGESTOR_GUIDE.md) — How phi-agent works
- [LOADOUT_DESIGN_MEMO.md](../reports/LOADOUT_DESIGN_MEMO.md) — Species personality vectors

## License

Part of the Sphere project. See main repository for license.
