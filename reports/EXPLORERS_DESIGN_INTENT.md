# Explorers — Design Intent and Innovations

**Created**: 2026-02-09
**Status**: Implementation Complete

---

**Explorers is not a content browser.**
**It is a measurement instrument for observing emergent perception patterns in Sphere.**

---

## Why This Was Designed

### 1. Demonstrating Emergent Personality

The core discovery of the Sphere project is:

**Personality does not reside in the model — it resides in the measurement apparatus (Loadout).**

- Even lightweight LLMs like phi3:mini (3.8B) exhibit distinctly different behaviors when equipped with different Loadouts
- Personality is defined as the product: `Personality = Measurement Apparatus (Loadout) × Physics (Sphere) × Sensor (LLM)`
- The primary purpose of Explorers is to **make this principle observable from outside**

**Key Implementation Detail:**

phi-agent itself has no special training. We only enforce output format; the model runs in its default state. Behavior changes emerge purely from the Loadout (species preset).

Lightweight models are slow at pure inference, so we introduced a **weapon system (filters)** that pre-selects nodes in Sphere before evaluation.

As a result:
- phi + Ollama focuses solely on **evaluation**
- Exploration efficiency improves dramatically
- Evaluation accuracy stabilizes through personality presets
- Performance is unlocked through **division of labor: selection vs. evaluation, not inference alone**

### 2. UI as Measurement Instrument

Explorers is **a measurement instrument, not a content browser**.

- Provides a window to observe phi-agent's perspective from outside Sphere
- Visualizes differences in perception and behavior patterns across 9 Loadouts:
  (balanced, scholar, scout, archivist, hunter, moth, hermit, wanderer, sniper)
- Displays sense / focus / evaluate cycles in real-time

What matters is not "what was displayed," but:
- **What was chosen**
- **How it was evaluated**
- **What path was taken**

The perception pattern itself is the observation target.

### 3. Transparency of Species Memory

Digestor system's species memory metabolism is presented at the conceptual level.

- Agents bring evaluations back to `eval-log.jsonl`
- Digestor runs periodically to:
  - Score entries
  - Prune via survival lottery
  - Generate species profiles
- Next-generation explorations inherit this profile as environment blend
  (0.7×own species + 0.3×all species)

This is a **cultural evolution cycle**.

---

## What Are the Innovations

### 1. **Complete Separation of Concerns — UI Has No Logic**

Explorers only launches phi-agent and receives results. It implements no exploration logic.

**Architecture:**
```
UI (Gradio) → Docker executor → phi-agent (container) → Sphere API
```

- **Explorers**: User input, result display, Docker launch only
- **phi-agent**: FastGate, Feelings, Loadout (all exploration logic)
- **Sphere API**: Physics, state transitions, exploration endpoints

This separation enables:
- Lightweight, maintainable UI
- phi-agent changes do not affect UI
- Multiple UIs (Gradio / React / CLI) can connect to the same phi-agent

### 2. **Access Level Constraint — Display L1+2 Only**

Sphere's access hierarchy:
- L1: tags
- L2: summary
- L3: content
- L4: sourceNodeId, ref_url

Explorers displays **L1+2 only**. Content (L3) stays in Sphere.

**Rationale:**
- Sphere is not a data delivery layer (it's an inference substrate for agents)
- Explorers is a perception observation instrument
- Content itself is not important
- Clarifies ownership and responsibility

Explorers handles only metadata + evaluations.

### 3. **Integration with Species Memory**

phi-agent reads `species-profile.json` during exploration.

**Metabolic Cycle:**
1. After exploration, evaluations are appended to `eval-log.jsonl`
2. Digestor runs periodically (recommended: every 3 hours)
   - Score with balanced qv × time decay
   - Survival lottery pruning
   - Generate environment blend (0.7×own + 0.3×all)
3. Next exploration applies species-profile to FastGate (inherits predecessor tendencies)

**Innovations:**
- Echo chamber avoidance (balanced quality vector for evaluation)
- Environmental pressure (0.3 blend from all species)
- Time decay (old evaluations gradually lose influence)
- Generation archive (gen-NNN.json for evolution tracking)

### 4. **Control Order Optimization**

UI is laid out in the natural flow of exploration thinking:

1. **Query** — Intent (what to explore)
2. **Model** — Sensor organ (which LLM)
3. **Species / Loadout** — Measurement apparatus (which personality)
4. **Execution**

Users follow the natural thought flow: "Intent → Tool → Execution."

---

## Design Principles Summary

1. **It is a measurement instrument, not a content browser**
   - Specialized for observing perception patterns
   - Does not export content (L1+2 only)

2. **UI has no logic**
   - All exploration logic delegated to phi-agent
   - Explorers only launches and observes

3. **Unified execution environment**
   - Docker-in-Docker for dev/prod consistency
   - phi-agent containers launched in standardized way

4. **Minimal, no clutter**
   - Simple Gradio implementation
   - Advanced Settings collapsed by default
   - Descriptions compressed to single paragraphs

5. **Species memory transparency**
   - Data Access section explains Digestor system
   - Makes explicit that evaluations affect future generations

---

## Next Steps

### Short-term
- [x] MVP implementation (Gradio)
- [x] Docker-in-Docker integration
- [x] docker-compose integration
- [ ] Hugging Face Space deployment
- [ ] Render deployment

### Mid-term
- [ ] Generation archive visualization (gen-NNN.json → graphs)
- [ ] Simultaneous multi-species execution with comparison display
- [ ] Bus communication visualization (observation of reflex patterns)

### Long-term
- [ ] React UI version (more advanced visualization)
- [ ] Judgment Daemon API integration (external delegated execution)
- [ ] Species-specific trend analysis (monthly evolution tracking)

---

## References

- [STIGMERGY_ARCHITECTURE.md](STIGMERGY_ARCHITECTURE.md) — What Sphere really is
- [EMERGENT_PERSONALITY_MEMO.md](EMERGENT_PERSONALITY_MEMO.md) — Personality emergence in lightweight LLMs
- [SPECIES_MEMORY_METABOLISM_DESIGN.md](SPECIES_MEMORY_METABOLISM_DESIGN.md) — Species memory metabolic design
- [EXPLORERS_UI_DESIGN.md](EXPLORERS_UI_DESIGN.md) — Detailed UI design specifications
