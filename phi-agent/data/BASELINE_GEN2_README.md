# Baseline Generation 2 — Species Profile Archive

**Date**: 2026-02-10
**Purpose**: Initial species-profile.json establishment with balanced preset

---

## Files

| File | Description |
|------|-------------|
| `species-profile-baseline-gen2.json` | Digestor output — species profiles with environmental blend (0.7×self + 0.3×global) |
| `eval-log-baseline-gen2.jsonl` | Pruned evaluation log (91% survival rate, 415/455 evals, hunger=0.51) |
| `generations/gen-002.json` | Generation snapshot with full metadata |

---

## Context

### Why Generation 2?
- **gen-001**: Legacy data from older experiments (mixed models, old mock data)
- **gen-002**: First clean generation with:
  - New mock data (33 diverse everyday observations, 2026-02-10)
  - Unified evalFocus v3 (0-10 scale, all 9 species)
  - Temperature 0.4 (llama3.2:1b + phi3:mini)
  - Balanced species baseline (10 sessions: 5×"everyday curious observations" + 5×"common social behaviors")

### Digest Parameters

```json
{
  "ONCE": "1",
  "MIN_EVALS": "15",
  "MIN_PER_SPECIES": "8",
  "HALF_LIFE_HOURS": "72",
  "hunger": 0.51,
  "survivalRate": "91%"
}
```

### Species Statistics (gen-002)

| Species | Evals | h_avg | w_avg | d_avg | Hot Nodes | Common Tags |
|---------|-------|-------|-------|-------|-----------|-------------|
| **balanced** | **59** | **6.7** | **6.2** | **4.8** | 10 | 15 |
| moth | 108 | 6.7 | 6.2 | 4.1 | 10 | 15 |
| hermit | 77 | 6.2 | 6.0 | 4.0 | 10 | 15 |
| kamikaze | 59 | 7.0 | 6.2 | 4.4 | 10 | 15 |
| hunter | 38 | 6.1 | 5.2 | 4.3 | 10 | 15 |
| scholar | 33 | 5.6 | 7.2 | 4.1 | 10 | 15 |
| archivist | 18 | 6.6 | 7.5 | 3.2 | 10 | 15 |
| scout | 17 | 6.6 | 5.0 | 4.1 | 10 | 15 |
| sniper | 6 | 5.4 | 4.9 | 4.6 | 10 | 15 |

**Key Insight**: balanced species shows d_avg=4.8 (highest), indicating neutral observers perceive longer-lasting patterns. This becomes the global fallback for species without sufficient data.

---

## Design Rationale

### Balanced as Universal Baseline

The balanced loadout was chosen to establish the initial profile because:

1. **Neutral Quality Vector**: `[0.4, 0.3, 0.2, 0.1]` — no extreme biases
2. **Neutral evalFocus**: "Observe this node as a neutral explorer"
3. **Neutral walkPreference**: "explore" (neither hot-seeking nor deep-diving)
4. **Query Diversity**: 2 queries × 5 sessions ensured h,w,d measurement activation
5. **Measurement Device**: phi3:mini (3.8B) — proven full 3D measurement capability (h,w,d ranges 2-6pt)

### Environmental Blend (0.7×self + 0.3×global)

- **Self (70%)**: Species-specific learned preferences
- **Global (30%)**: Environmental pressure from all species
- **Fallback**: Species with <MIN_PER_SPECIES evals use 100% global (= balanced baseline)

This design prevents echo chambers while allowing species differentiation.

### Mock Data Diversity (2026-02-10)

The new mock dataset (33 nodes) was designed for:

- **Heat spectrum**: High (meme evolution, infinite scroll) → Low (petrichor, capybara)
- **Weight spectrum**: High (Chinese Room, evolution) → Low (missing socks, cereal milk)
- **Decay spectrum**: Ephemeral (coffee temp, Friday afternoon) → Lasting (evolution, Chinese Room)

This 3D spread activates measurement across all dimensions, preventing dimension collapse (e.g., gemma2:2b's d=3 fixation).

---

## Usage

### Restoration

To restore this baseline after experiments:

```powershell
# PowerShell
cd phi-agent/data
Copy-Item species-profile-baseline-gen2.json species-profile.json
Copy-Item eval-log-baseline-gen2.jsonl eval-log.jsonl
```

### Comparison

To compare current profile against baseline:

```bash
# Compare species averages
jq '.species.balanced' species-profile.json
jq '.species.balanced' species-profile-baseline-gen2.json
```

### Re-digest from Baseline

```powershell
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original
$env:ONCE = "1"
$env:MIN_EVALS = "50"
$env:MIN_PER_SPECIES = "20"
$env:DATA_DIR = "phi-agent/data"
node digestor/dist/digestor.js
```

---

## Future Work

### Next Steps

1. **Mock Data Injection**: Use `npm run contribute` to inject new 33-node dataset into Sphere
2. **Multi-Species Validation**: Run 3-5 sessions per species (scholar, moth, hermit, hunter) with new data
3. **Generation 3**: Re-digest with hunger=0.4-0.6 for gradual evolution
4. **Epoch Archiving**: Every 10 generations, archive as `epoch-001/` for long-term tracking

### Stability Tracking

Monitor these metrics across generations:

- **h/w/d drift**: Should remain within ±1.0 for balanced species
- **Hot node turnover**: Max 30% per generation (stability indicator)
- **Tag vocabulary growth**: Should expand gradually with new content
- **Survival rate**: Target 85-95% (hunger 0.4-0.6)

---

## Artifacts

### Related Files

- `/reports/MODEL_DEPLOYMENT_STRATEGY.md` — phi3:mini vs gemma2:2b measurement capability
- `/reports/EVALFOCUS_V3_EXPERIMENT.md` — 0-10 scale validation and query diversity tests
- `/reports/DATA_ACCUMULATION_20260209.md` — Pre-baseline data analysis (93 sessions, format:json副作用)
- `/reports/SPECIES_MEMORY_METABOLISM_DESIGN.md` — Digestor design and淘汰原理

### Commands Used

```powershell
# Balanced baseline accumulation (10 sessions)
cd phi-agent
.\run-balanced-daemon-init.ps1

# Digestor one-shot
cd ..
.\run-digestor-once.ps1
```

---

**Baseline Status**: ✅ Established
**Next Milestone**: Multi-species validation with new mock data (gen-003)
