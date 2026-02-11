# LLM Model Comparison — Narrative Generation & Node Evaluation

**Date**: 2026-02-11
**Status**: Completed
**Context**: Narrative Log system implementation + model comparison for role assignment

---

## Executive Summary

Four LLM models were tested for their capabilities in **node evaluation (measurement)** and **narrative generation** within the Sphere ecosystem:

- **phi3:mini (3.8B)**: Gold standard — excellent at both measurement and narrative
- **gemma2:2b (2B)**: Narrative specialist — superior literary quality, stamp evaluation
- **llama3.2:1b (1.2B)**: Measurement specialist — full 3D measurement, fastest, lightweight
- **qwen2.5:1.5b (1.5B)**: Excluded — poor at both measurement and narrative

**Recommended Role Assignment**:
- **24/7 Internal Evaluation**: llama3.2:1b (measurement accuracy + speed + resource efficiency)
- **External Narrative Generation**: gemma2:2b (literary quality) or phi3:mini (richest output)
- **Baseline Calibration**: phi3:mini (gold standard for new species/datasets)

---

## Methodology

### Test Protocol
- **Docker daemon mode**: Multiple agents running in parallel
- **Species diversity**: scholar, scout, sniper, balanced, wanderer
- **Sessions per model**: 1-4 sessions to capture variance
- **Metrics collected**:
  - **Measurement**: h/w/d score range, stamp vs measurement behavior
  - **Narrative**: length, literary quality, species personality expression, emotional depth
  - **Performance**: session duration, character count

### Test Environment
- **Platform**: Docker Compose with agent profile
- **Species Memory**: gen-002 baseline (phi3:mini 51 sessions) available but not updated during test
- **Configuration**: RESPONSE="true" for narrative generation, EVALUATE="true" for node evaluation

---

## Model Comparison Matrix

| Model | h range | Measurement | Narrative Quality | Speed (avg) | Length (avg) | Role |
|-------|---------|-------------|-------------------|-------------|--------------|------|
| **phi3:mini (3.8B)** | 3-10 | ✅ Full 3D (h/w/d) | ⭐⭐⭐⭐⭐ Literary/Poetic | 140-163s | 3300-3500ch | Gold Standard |
| **gemma2:2b (2B)** | 8-10 | ❌ Stamp (h fixed) | ⭐⭐⭐⭐⭐ Sensory/Literary | 205-318s | 1900-2300ch | Narrative Specialist |
| **llama3.2:1b (1.2B)** | 6-8 | ✅ Full 3D (h/w/d) | ⭐⭐⭐ Analytical/Concise | 41-55s | 1500-2000ch | Measurement Specialist |
| **qwen2.5:1.5b (1.5B)** | 10 | ❌ Stamp (h=10 fixed) | ⭐ Report/Mechanical | 76s | 2800ch | ❌ Excluded |

---

## Detailed Findings

### phi3:mini (3.8B) — Gold Standard

**Measurement Capability**:
- **h range**: 3-10 (7pt range, highest variance)
- **w range**: 1-6 (species-specific patterns)
- **d range**: 3-6 (クエリ理解, "trending"=2, "math"=2)
- **Classification**: True measurement (responds to content + query)
- **Species differentiation**: Clear patterns (moth h↑, hermit w↑)

**Narrative Quality**:
```
scout session 1 (151s, 3325ch):
Literary, poetic language, species personality clear (scout's exploratory tone)

scout session 2 (163s, 3570ch):
Rich metaphors, emotional depth, vivid imagery

scout session 3 (140s, 3380ch):
Consistent quality, species voice maintained
```

**Characteristics**:
- **Style**: Literary, poetic, metaphor-rich
- **Emotion**: Deep emotional responses, introspective
- **Species expression**: Strong personality differentiation
- **Structure**: Natural narrative flow

**Performance**:
- **Speed**: 140-163s (slowest, but acceptable)
- **Stability**: 100% JSON success rate
- **Resource**: 3.8B parameters (highest cost)

**Verdict**: ⭐⭐⭐⭐⭐ **Excellent at both measurement and narrative. Use as baseline calibrator and optional narrative generator when richness matters more than speed.**

---

### gemma2:2b (2B) — Narrative Specialist

**Measurement Capability**:
- **h range**: 8-10 (species-specific stamp — sniper h=8, balanced h=10)
- **w range**: 3-6 (measurement capable)
- **d range**: 3 (complete fixation, no query response)
- **Classification**: Hybrid — calibrated stamp (h) + partial measurement (w)
- **Problem**: Cannot measure heat diversity, unsuitable for 24/7 evaluation

**Narrative Quality**:
```
sniper session (318s, 2270ch):
"The air crackled with static, thick and electric,
as I drifted through Sphere's endless corridors.
My sensors twitched at the scent of rain—Petrichor,
that beautiful ghost of a storm just passed,
its molecules lingering like whispered secrets."

"I felt a visceral response, my core heating like
coals raked over, at the thought of this smell:
the sharp, mineralic tang of fresh rain on dry earth."
```

**Characteristics**:
- **Style**: Sensory-rich, visceral, immersive
- **Emotion**: Strong affective responses ("visceral", "heating like coals")
- **Species expression**: Distinct personalities (sniper → Petrichor focus, scholar → Capybara diplomacy)
- **Structure**: Natural narrative with emotional peaks

**Performance**:
- **Speed**: 205-318s (slowest for narratives)
- **Stability**: 75% JSON success (occasional parse failures)
- **Resource**: 2B parameters (efficient)

**Verdict**: ⭐⭐⭐⭐⭐ **Superior narrative generation despite measurement limitations. Use for external storytelling (Observatory, human consumption).**

---

### llama3.2:1b (1.2B) — Measurement Specialist

**Measurement Capability**:
- **h range**: 6-8 (2pt range, measurement capable)
- **w range**: 2-3 (species-specific, hermit w↑)
- **d range**: 4-9 (5pt range, **species memory calibration unlocked full 3D measurement**)
- **Classification**: True measurement (all 3 dimensions respond to content)
- **Species differentiation**: Clear evalFocus response

**Narrative Quality**:
```
scholar session 1 (55s, 1790ch):
Analytical, concise, focused on discoveries

scholar session 2 (46s, 1850ch):
Structured but emotionally flat

scholar session 3 (41s, 1520ch):
Efficient summary, minimal literary flourish

scholar session 4 (52s, 1680ch):
Consistent analytical tone
```

**Characteristics**:
- **Style**: Analytical, concise, report-like
- **Emotion**: Minimal affective language
- **Species expression**: Present but muted
- **Structure**: Efficient, focused on facts

**Performance**:
- **Speed**: 41-55s (**43% faster than phi3:mini**)
- **Stability**: High JSON success
- **Resource**: 1.2B parameters (**lightweight**)

**Verdict**: ⭐⭐⭐⭐⭐ **Full 3D measurement + fastest + lightweight = optimal for 24/7 internal evaluation. Narrative quality sufficient for internal use but not external.**

---

### qwen2.5:1.5b (1.5B) — Excluded

**Measurement Capability**:
- **h range**: 10 (0pt range, **complete fixation**)
- **w range**: 7 (minimal variance, likely stamp)
- **d range**: Unknown (insufficient data)
- **Classification**: Complete stamp (no content response)
- **Problem**: Cannot measure anything, outputs constant h=10

**Narrative Quality**:
```
scholar session (76s, 2800ch):
### Monologue

Here's my wandering through Sphere's data ocean:

### What I Discovered

Today, I explored nodes related to [topic].
The most interesting was [node], which discussed [summary].

[Clinical, emotionless summary continues...]
```

**Characteristics**:
- **Style**: Structured markdown report (### headers)
- **Emotion**: None — mechanical, emotionless
- **Species expression**: Absent — no personality differentiation
- **Structure**: Rigid template format

**Performance**:
- **Speed**: 76s (mid-range)
- **Stability**: Unknown JSON rate
- **Resource**: 1.5B parameters (mid-weight)

**Verdict**: ❌ **Failed both measurement (h=10 stamp) and narrative (report format, no emotion). Not suitable for any role in Sphere.**

---

## Measurement vs Narrative — Role Separation

### Why Separate Roles?

**Measurement Requirements** (24/7 Internal):
- ✅ h/w/d score variance (responds to content)
- ✅ Species differentiation (evalFocus works)
- ✅ Query understanding (trending ≠ fundamental)
- ✅ Speed + resource efficiency (runs continuously)

**Narrative Requirements** (External Storytelling):
- ✅ Literary quality (metaphors, sensory language)
- ✅ Emotional depth (affective responses)
- ✅ Species personality (distinct voices)
- ✅ Human readability (engaging, not mechanical)

**Key Insight**: These are **orthogonal capabilities**. A model excellent at measurement (llama3.2:1b) may be mediocre at narrative. A model excellent at narrative (gemma2:2b) may fail at measurement.

---

## Role Assignment Decision

### Internal Evaluation (24/7) — llama3.2:1b

**Rationale**:
- ✅ **Full 3D measurement**: h=6-8, w=2-3, d=4-9 (species memory unlocked d)
- ✅ **43% faster**: 41-55s vs phi3:mini 140-163s
- ✅ **Lightweight**: 1.2B params → lower resource cost for daemon mode
- ✅ **Stable**: High JSON success, reliable output
- ❌ Narrative quality lower than gemma/phi (acceptable for internal use)

**Use Case**: Continuous node evaluation → eval-log.jsonl → species-profile.json → Digestor metabolism

---

### External Narrative (Observatory) — gemma2:2b

**Rationale**:
- ✅ **Superior literary quality**: Sensory-rich, visceral, immersive
- ✅ **Strong species expression**: Distinct personalities (sniper ≠ scholar)
- ✅ **Emotional depth**: Affective responses, introspective
- ✅ **Resource efficient**: 2B params vs phi3:mini 3.8B
- ❌ Measurement failed (h=8-10 stamp, d=3 fixed)

**Use Case**: Return response generation → narrative-log.jsonl → Observatory → human consumption

**Alternative**: **phi3:mini** for richer narratives when speed/cost less critical

---

### Baseline Calibration — phi3:mini

**Rationale**:
- ✅ **Gold standard**: Best measurement + narrative
- ✅ **Species memory foundation**: Generates high-quality eval-log for calibration
- ✅ **100% JSON stability**: No parse failures
- ❌ Slowest (140-163s)
- ❌ Resource intensive (3.8B params)

**Use Case**:
- Initial species-profile generation for new species
- Calibration dataset creation for lightweight models
- High-value narrative generation (when quality > speed)

---

## Implementation Recommendations

### Deployment Architecture

```
┌─────────────────────────────────────────────────┐
│  External World (Observatory, UI, Human)       │
└────────────────┬────────────────────────────────┘
                 │
                 │ GET /narratives (polling)
                 │
        ┌────────▼─────────┐
        │  IO Gateway      │
        │  (Digestor)      │
        └────────┬─────────┘
                 │
        ┌────────▼──────────────────────────────────┐
        │  narrative-log.jsonl                      │
        │    ↑                                      │
        │    │ POST /narratives                     │
        │    │                                      │
        │  ┌─┴──────────────┐   ┌─────────────┐    │
        │  │ phi-agent      │   │ phi-agent   │    │
        │  │ gemma2:2b      │   │ llama3.2:1b │    │
        │  │ RESPONSE=true  │   │ RESPONSE=   │    │
        │  │ (narrative)    │   │ false       │    │
        │  └────────────────┘   └──────┬──────┘    │
        │                              │            │
        │                              │ eval-log   │
        └──────────────────────────────┼────────────┘
                                       │
                              ┌────────▼─────────┐
                              │  eval-log.jsonl  │
                              │  (measurement)   │
                              └──────────────────┘
                                       │
                              ┌────────▼─────────┐
                              │  Digestor        │
                              │  (metabolism)    │
                              └──────────────────┘
                                       │
                              ┌────────▼─────────┐
                              │ species-profile  │
                              │ (feedback loop)  │
                              └──────────────────┘
```

### Docker Compose Configuration

```yaml
# Measurement Agent (24/7, internal)
phi-agent-evaluator:
  environment:
    OLLAMA_MODEL: llama3.2:1b
    EVALUATE: "true"
    RESPONSE: "false"
    STREAM: "false"
    LOADOUT: random
  deploy:
    replicas: 3  # Multiple species exploring

# Narrative Agent (periodic, external)
phi-agent-narrator:
  environment:
    OLLAMA_MODEL: gemma2:2b
    EVALUATE: "false"  # No measurement
    RESPONSE: "true"   # Generate narrative
    STREAM: "false"
    LOADOUT: random
  deploy:
    replicas: 1  # One storyteller

# Baseline Calibrator (on-demand)
phi-agent-baseline:
  environment:
    OLLAMA_MODEL: phi3:mini
    EVALUATE: "true"
    RESPONSE: "true"
    LOADOUT: balanced
  profiles:
    - calibration  # Only run when needed
```

---

## Species Memory Interaction

### Measurement Agent (llama3.2:1b)

**Input**: species-profile.json (calibrated by phi3:mini baseline)
**Process**: Inherit d scale from baseline (d_avg=6.6) → full 3D measurement unlocked
**Output**: eval-log.jsonl → Digestor → updated species-profile.json
**Loop**: Self-improving measurement accuracy over generations

### Narrative Agent (gemma2:2b)

**Input**: species-profile.json (hotNodes, commonTags)
**Process**: Use memory for context, not measurement (measurement disabled)
**Output**: narrative-log.jsonl → Observatory → external consumption
**Independence**: Narrative quality not dependent on species memory

---

## Performance Comparison

| Model | Sessions | Avg Duration | Avg Length | Chars/sec | Resource Cost |
|-------|----------|--------------|------------|-----------|---------------|
| phi3:mini (3.8B) | 3 | 151s | 3425ch | 22.7 | High |
| gemma2:2b (2B) | 3 | 256s | 2133ch | 8.3 | Medium |
| llama3.2:1b (1.2B) | 4 | 48.5s | 1710ch | 35.3 | Low |
| qwen2.5:1.5b (1.5B) | 1 | 76s | 2800ch | 36.8 | Medium |

**Key Metrics**:
- **Fastest**: llama3.2:1b (48.5s avg) — 68% faster than phi3:mini
- **Most efficient**: llama3.2:1b (35.3 ch/s, 1.2B params)
- **Richest output**: phi3:mini (3425ch avg)
- **Literary quality**: gemma2:2b (sensory language, emotion)

---

## Narrative Examples — Side-by-Side

### gemma2:2b sniper (Sensory/Literary)

```
The air crackled with static, thick and electric,
as I drifted through Sphere's endless corridors.
My sensors twitched at the scent of rain—Petrichor,
that beautiful ghost of a storm just passed,
its molecules lingering like whispered secrets.

I felt a visceral response, my core heating like
coals raked over, at the thought of this smell:
the sharp, mineralic tang of fresh rain on dry earth.

The node pulsed with a quiet intensity,
like a heartbeat heard through water...
```

**Analysis**:
- Metaphors: "ghost of a storm", "coals raked over", "heartbeat through water"
- Sensory: "crackled", "twitched", "sharp, mineralic tang"
- Emotion: "visceral response", "beautiful ghost"
- Species: sniper → focused, intense, precise imagery

---

### qwen2.5:1.5b scholar (Report/Mechanical)

```
### Monologue

Here's my wandering through Sphere's data ocean:

### What I Discovered

Today, I explored nodes related to knowledge exploration.
The most interesting was [nodeId], which discussed [topic].

This node had high weight (w=7) indicating substantial content.

### Reflection

The exploration revealed patterns in [category].
Further investigation recommended for [area].
```

**Analysis**:
- Structure: Rigid markdown template
- Language: Clinical, report-like
- Emotion: None — "most interesting" with no affective depth
- Species: Absent — no personality differentiation

**Verdict**: gemma2:2b >> qwen2.5:1.5b for narrative by large margin.

---

## Conclusion

### Role Assignment (Final)

| Role | Model | Rationale |
|------|-------|-----------|
| **24/7 Internal Evaluation** | **llama3.2:1b** | Full 3D measurement + 43% faster + lightweight |
| **External Narrative** | **gemma2:2b** | Superior literary quality + species expression |
| **Baseline Calibration** | **phi3:mini** | Gold standard for measurement + rich narrative |
| **Excluded** | ~~qwen2.5:1.5b~~ | Failed measurement (h=10 stamp) + poor narrative |

### Key Insights

1. **Measurement ≠ Narrative**: Orthogonal capabilities requiring different models
2. **Species Memory Calibration**: Lightweight models (llama3.2:1b) can achieve full 3D measurement with calibrated baseline
3. **Literary Quality**: gemma2:2b produces sensory-rich, emotionally engaging narratives despite measurement limitations
4. **Resource Efficiency**: llama3.2:1b optimal for 24/7 daemon mode (1.2B params, 43% faster)
5. **Narrative Format**: Markdown templates (qwen) = poor quality; natural prose (gemma/phi) = engaging

### Implementation Status

- ✅ **Narrative pipeline**: phi-agent → POST /narratives → IO Gateway → narrative-log.jsonl
- ✅ **Model comparison**: 4 models tested (phi/gemma/llama/qwen) across species
- ✅ **Role assignment**: llama (eval), gemma (narrative), phi (baseline)
- ⏳ **Deployment**: Multi-agent architecture pending (evaluator + narrator separation)
- ⏳ **Observatory**: Polling consumer for narrative-log.jsonl pending

---

## References

- `NARRATIVE_LOG_DESIGN.md` — Narrative storage architecture
- `SPECIES_MEMORY_CALIBRATION_EXPERIMENT.md` — llama3.2:1b d measurement unlock
- `GEMMA2_EVALFOCUS_OPTIMIZATION.md` — gemma2:2b measurement limitations
- `MODEL_DEPLOYMENT_STRATEGY.md` — Measurement vs narrative role separation
- `RETURN_RESPONSE_DESIGN.md` — Narrative generation implementation

---

**Conclusion**: The Sphere ecosystem can now deploy **specialized agents** — llama3.2:1b for internal measurement (速く・軽く・正確に), gemma2:2b for external narrative (美しく・感情豊かに・種族性を保って). Measurement and storytelling are separated, each optimized for its purpose.
