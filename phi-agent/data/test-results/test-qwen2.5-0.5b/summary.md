# qwen2.5:0.5b Model Comparison Test — Summary

**Date**: 2026-02-09
**Model**: qwen2.5:0.5b (397 MB, 0.5B parameters)
**Query**: "knowledge exploration"
**Sphere**: http://sphere-periphery:3001

---

## Test Results

### Execution Metrics

| Species | Time (s) | Cycles | Evals | avgH | avgW | avgD | Notes |
|---------|----------|--------|-------|------|------|------|-------|
| balanced | 27.7 | 4 | 3 | 8.3 | 7.0 | 4.0 | Baseline |
| hunter | 23.8 | 5 | 3* | 8.0 | 7.0 | 4.0 | *1 JSON parse failure |
| scholar | 23.0 | 4 | 3 | 9.0 | 6.3 | 3.7 | Fastest |
| hermit | 24.4 | 4 | 3 | 8.0 | 7.0 | 4.0 | — |

**Average execution time**: 24.7s (vs baseline ~60s with llama3.2:1b)

### Raw Evaluation Data

**balanced** (3 evals):
- Cycle 1: h=8, w=7, d=4 (Topological manifolds)
- Cycle 2: h=9, w=7, d=4 (Stanford prison experiment)
- Cycle 3: h=8, w=7, d=4 (Evolution by natural selection)

**hunter** (3 evals, 1 failure):
- Cycle 1: h=undefined (JSON parse failure)
- Cycle 2: h=8, w=7, d=4 (Topological manifolds)
- Cycle 3: h=8, w=7, d=4 (Evolution by natural selection)
- Cycle 4: h=8, w=7, d=4 (Pentatonic scale)

**scholar** (3 evals):
- Cycle 1: h=9, w=7, d=4 (Sapir-Whorf hypothesis)
- Cycle 2: h=8, w=7, d=4 (Chomsky hierarchy)
- Cycle 3: h=10, w=5, d=3 (Birthday paradox)

**hermit** (3 evals):
- Cycle 1: h=8, w=7, d=4 (Nash equilibrium)
- Cycle 2: h=8, w=7, d=4 (Stanford prison experiment)
- Cycle 3: h=8, w=7, d=4 (Topological manifolds)

---

## Analysis

### ✅ Speed Improvement: SUCCESS

- **Target**: <40s per session (50% reduction from 60s baseline)
- **Result**: 24.7s average (**59% faster** than baseline)
- **Conclusion**: ✅ 0.5B model delivers significant speed improvement

### ⚠️ Species Differentiation: WEAK

**Expected**:
- hunter avgH > balanced (heat seeker bias)
- scholar avgW > balanced (weight lover bias)
- hermit avgD > balanced (stability seeker bias)

**Observed**:
- hunter avgH (8.0) < balanced avgH (8.3) ❌
- scholar avgW (6.3) < balanced avgW (7.0) ❌
- hermit avgD (4.0) = balanced avgD (4.0) ❌

**Differences from baseline**:
- All species converge to h≈8, w≈7, d≈4
- Very low variance (±0.5 points)
- No clear personality differentiation

### 🔍 Score Distribution

**h (heat)**: 8.0-9.0 (tight range, median 8.0)
**w (weight)**: 5.0-7.0 (slight variance, median 7.0)
**d (decay)**: 3.0-4.0 (very tight range, median 4.0)

**Observations**:
- Scores are in valid range (not all 10 or all 0)
- Model understands the task and produces reasonable evaluations
- But: lacks **sensitivity to quality vector differences** in the prompt

### 🚨 JSON Format Issues

- **1 parse failure** in hunter Cycle 1
- Model occasionally ignores `format:json` directive
- Success rate: 11/12 = 92%

---

## Comparison vs Baseline

| Metric | Baseline (llama3.2:1b + phi3:mini) | qwen2.5:0.5b | Δ |
|--------|-----------------------------------|--------------|---|
| **Speed** | ~60s | 24.7s | **-59%** ✅ |
| **hunter avgH** | 6.0 | 8.0 | +2.0 (but no species diff) |
| **scholar avgW** | 7.71 | 6.3 | -1.4 ❌ |
| **Species differences** | Clear (hunter > balanced by +0.8 H) | **Absent** ❌ |
| **JSON compliance** | ~100% | 92% ⚠️ |

---

## Verdict

**Category**: ⚠️ **Conditional Pass** (Speed OK, Personality Weak)

### What Works

1. ✅ **Speed**: 59% faster execution (24.7s vs 60s)
2. ✅ **Scores in valid range**: Not all 10/0, shows understanding
3. ✅ **Stable operation**: No crashes, Docker integration works
4. ✅ **Bus communication**: Emits/receives work correctly

### What Doesn't Work

1. ❌ **Species differentiation lost**: All species evaluate similarly
2. ❌ **Quality vector sensitivity**: Model ignores fine-grained evalFocus differences
3. ⚠️ **JSON compliance**: 8% failure rate (1/12 evals)

---

## Interpretation (Per EMERGENT_PERSONALITY_MEMO.md)

> 性格 = 測定器具 (Loadout) × 物理法則 (Sphere) × 感覚器官 (任意の LLM)

**Hypothesis**: 0.5B model lacks **resolution** in the sensor (LLM) component.

- **Loadout (vectors)**: Different ✅
- **Physics (Sphere)**: Same ✅
- **Sensor (qwen2.5:0.5b)**: **Too coarse-grained** ❌

**Analogy**: Using a low-resolution camera (0.5B) to read fine print (quality vector differences).
- The text exists (Loadout differs)
- But the sensor cannot resolve it (LLM too small)

**Result**: Personality **does not emerge** because the measurement instrument lacks sensitivity.

---

## Next Steps (Per MODEL_COMPARISON_PROTOCOL.md)

### Option 1: Prompt Simplification (Recommended)

**Problem**: evalFocus is too complex for 0.5B model
**Solution**: Simplify evalFocus to single-dimension focus

Example:
- hunter: "Rate ONLY heat (h). Ignore weight and decay."
- scholar: "Rate ONLY weight (w). Ignore heat and decay."

**Expected**: Species differences re-emerge with simplified instructions

### Option 2: Larger Model (Fallback)

**Test phi3.5:mini (3.8B)** if simplification fails:
- Higher parameter count → better instruction following
- Expected: Species differentiation restored
- Trade-off: Slower execution (~40-50s)

### Option 3: Hybrid Strategy

- Use qwen2.5:0.5b for **daemon mode** (speed priority, personality not critical)
- Use phi3:mini for **interactive mode** (personality matters)

---

## Conclusion

**qwen2.5:0.5b delivers speed but sacrifices personality.**

- **For raw speed**: ✅ Use it (59% faster)
- **For species memory experiments**: ❌ Inadequate (no personality differentiation)
- **For production**: ⚠️ Needs prompt tuning or larger model

**Recommended action**: Proceed to Option 1 (prompt simplification) before trying larger models.

---

## Appendices

### A. Species Memory Statistics (Post-Test)

From test output:

- **balanced**: 22 evals total, avgH=5.0, avgW=4.6, avgD=3.8
- **hunter**: 22 evals total, avgH=6.3, avgW=5.1, avgD=4.0
- **scholar**: 65 evals total, avgH=5.2, avgW=**7.8**, avgD=4.7 (weight bias visible in aggregate)
- **hermit**: 67 evals total, avgH=5.6, avgW=6.2, avgD=4.1

**Observation**: Species memory **does show differences** (scholar avgW=7.8 is highest).
But **current session** (3 evals each) does not reflect this due to low sample size and model limitations.

### B. Execution Environment

- **Docker**: sphere-network, sphere-phi-agent-data volume
- **Sphere**: periphery @ localhost:3001
- **Ollama**: host.docker.internal:11434
- **phi-agent**: latest image (built 2026-02-09)

### C. Raw Output Files

Stored in `eval-log.jsonl` (appended to species memory).
To extract qwen test data:
```bash
tail -12 phi-agent/data/eval-log.jsonl > test-qwen2.5-0.5b/eval-log-qwen-test.jsonl
```

---

**Created**: 2026-02-09
**Status**: Analysis complete, awaiting decision on next steps
