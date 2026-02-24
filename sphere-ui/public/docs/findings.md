# Key Findings

What Sphere has demonstrated through design and implementation.

---

## Physics as Natural Selection

Information survival in Sphere is determined by heat, decay, weight, and TTL — not by AI judgment. No heuristics, no ranking algorithms, no semantic logic runs inside the system.

This creates a self-cleaning ecosystem. Active nodes that receive attention crystallize into Amber. Neglected nodes cool, decay into Ghosts, then Fossils, and eventually evaporate. The knowledge space curates itself through metabolism, requiring no manual intervention.

The lifecycle — Active → Ghost → Fossil → Evaporation, or Active → Amber — emerges from a handful of numerical rules. The system does not decide what is valuable. Usage patterns decide.

---

## Lightweight Models Made Effective

phi-agent demonstrated that a 3.8B parameter model (ex: phi3:mini) can produce meaningful exploration results — not by making the model smarter, but by making the knowledge easier to navigate. For scale: GPT-4 class models operate at an estimated 1T+ parameters, Claude/Gemini-class at 100B+. phi3:mini is roughly **1/250th the size**, is able to run on CPU with ~2GB RAM, and requires no cloud infrastructure.
Try Explorers UI which demonstrates the functionality with similar light-weight model of Groq.

Three mechanisms work together:

- **FastGate**: Pre-filters Sphere data before it reaches the model, reducing cognitive load
- **Weapon**: Multiplicative scoring layers (flag biases, state biases) that sharpen signal
- **Physical laws**: heat/decay/weight act as natural filters — the model doesn't need to judge relevance because physics already surfaced the important nodes

The Species system extends this further. Eight personality profiles (balanced, scholar, scout, archivist, hunter, moth, wanderer, sniper) change exploration behavior through quality vectors and walk preferences alone. No fine-tuning, no retraining. Same model, different lens.

This is a fundamentally different approach from the industry mainstream, which optimizes models (quantization, distillation, LoRA). Sphere optimizes the knowledge infrastructure instead. The iterative exploration loop — scan/sense, move, focus, evaluate — replaces RAG's one-shot retrieval, allowing even small models to discover through repeated interaction with physical laws.

---

## Hardware Independence

Sphere's approach does not depend on GPU scaling, model size, or compute resources. The core operates on text data and simple arithmetic — heat multiplied by decay coefficients, TTL decremented by ticks, distance calculated in vector space.

The entire Periphery is a few thousand lines of code. No training pipelines, no GPU clusters, no model weights. When hardware constraints tighten — power limits, chip shortages, memory bandwidth — Sphere is unaffected. The value comes from the structure of the knowledge space, not from the power of the machine running it.

The entire Sphere ecosystem — Periphery, phi-agent, Explorers, Digestor, and UI — totals approximately **9,000 lines** of source code currently.

---

*Last updated: 2026-02-24*
