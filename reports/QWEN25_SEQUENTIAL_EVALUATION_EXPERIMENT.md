# qwen2.5:1.5b Sequential Evaluation Experiment

**Date**: 2026-02-10
**Model**: qwen2.5:1.5b (1.5B parameters)
**Objective**: Develop evaluation pattern for lightweight models with reason-score consistency
**Status**: ✅ Success — Measurement capability restored

---

## Background

### Initial Assessment (species memory なし, 2026-02-09)

| Dimension | Status | Evaluation |
|-----------|--------|------------|
| **h (heat)** | h=5 **固定** (スタンプ) | ❌ 測定不能 |
| **w (weight)** | range 1.3pt | ⚠️ 限定的測定 |
| **d (decay)** | 未検証 | ❓ 不明 |
| **判定** | **"片目"** | 不適格 |

---

## Phase 1: Species Memory Calibration (gen-003)

**Hypothesis**: Species memory が測定能力を活性化する (llama3.2:1b で実証済み)

### Test Results (moth + gen-003, 3 sessions)

| Dimension | Range | Mean | 評価 |
|-----------|-------|------|------|
| **h** | 1-10 (9pt) | 7.8 | ✅ **固定完全打破** |
| **w** | 4-10 (6pt) | 8.5 | ✅ **4.6倍拡大** (1.3pt → 6pt) |
| **d** | 0-10 (10pt) | 5.5 | ✅ **新規獲得** |

**Result**: ✅ Species memory が測定範囲を劇的に拡大
**Speed**: 40.3s (phi3:mini 56s より 28% 高速)
**判定**: "片目" → **"両目（強）"**

### Critical Problem Discovered

**Reason と score が矛盾**:

| Example | Score | Reason | 問題 |
|---------|-------|--------|------|
| Internet rabbit hole | h=**3**, w=**4** | "**Highly relevant** and **active**" | ❌ 矛盾 |
| Turing machine | h=**1** | "**trending** and **influential**" | ❌ 矛盾 |

**Diagnosis**: qwen2.5:1.5b は:
- ✅ Reason 生成能力あり (文章として意味が通る)
- ❌ Score と reason が連動しない
- 🤔 **"賢いスタンプ 2.0"** — reason は装飾、score は独立

---

## Phase 2: gemma2-style Enhancement (2-step analysis)

**Approach**: gemma2:2b で成功した word examples + 2-step analysis を適用

```
Rate (0–10, 5=neutral):
heat = motion/attention
  ex: dormant -> low, viral -> high
weight = density
  ex: casual -> low, deep research -> high
decay = fade rate
  ex: timeless -> low, trending meme -> high

Step 1: Write brief report analyzing h, w, d
Step 2: Assign accurate scores based on analysis
```

### Results

| 指標 | Before (なし) | After (gemma2式) | 変化 |
|------|--------------|-----------------|------|
| JSON Success | 100% | **60%** | ❌ -40% |
| Reason一致 | 20-30% | 20-30% | - 改善なし |
| Speed | 44s | **60s** | ❌ +36% 遅延 |

**Result**: ❌ **逆効果** — JSON parse failure 多発、速度低下

---

## Phase 3: Sequential Dimension Evaluation (3-step)

**Insight**: 3次元同時評価 → 認知負荷が高い → reason と score が乖離

**New Approach**: 各次元を順次評価

```
Step 1: HEAT のみ評価 → reasoning → score
Step 2: WEIGHT のみ評価 → reasoning → score
Step 3: DECAY のみ評価 → reasoning → score
Final: JSON で統合
```

### Results (moth, 1 session)

| Evaluation | h | w | d | Reason 一致度 |
|------------|---|---|---|--------------|
| Evolution | 10 | 8 | 3 | ✅✅✅ 3/3 完全一致 |
| Internet rabbit hole | 10 | 5 | 2 | ✅✅⚠️ 2/3 (w 曖昧) |
| Sapir-Whorf | 10 | 5 | 3 | ✅✅⚠️ 2/3 (d 不完全) |

**Consistency**: **70-80%** (従来 20-30% より大幅改善)
**JSON Success**: 100% (3/3)
**Speed**: 38s (gemma2式 60s より 37% 高速化)

**Result**: ✅ **大成功** — Sequential が reason-score 連動を回復

---

## Phase 4: Enhanced v2 (PAUSE + Concrete Role)

**User Insight**:
1. **PAUSE が重要** — 各次元間に明示的な区切り
2. **Concrete role description** — 抽象的な "hermit" ではなく "contemplative scholar"

### Species Role Mapping

| Abstract (before) | Concrete (after) |
|-------------------|------------------|
| moth | attention-driven explorer drawn to trending topics |
| hermit | contemplative scholar focused on depth and stability |
| scout | rapid information gatherer seeking new discoveries |
| scholar | thorough academic researcher analyzing content deeply |
| hunter | strategic knowledge tracker pursuing specific patterns |

### Enhanced Prompt Structure

```
Remember: You are [attention-driven explorer].

Evaluate each dimension with focused attention:

━━━ Step 1: HEAT (motion/attention) ━━━
Definition: Activity level and attention flow
Your perspective: As [concrete role], assess discussion intensity
Scale: 0 = dormant, 5 = steady, 10 = viral
Analysis: [your reasoning]
Heat score (0-10): [N]

[PAUSE - Move to next dimension]

━━━ Step 2: WEIGHT (depth/authority) ━━━
...

[PAUSE - Move to next dimension]

━━━ Step 3: DECAY (fade rate) ━━━
...
```

### Results (moth + hermit)

| 指標 | v1 (3-step) | v2 (PAUSE + concrete) | 変化 |
|------|-------------|----------------------|------|
| JSON | 100% | 100% | - |
| h 一致 | 70% | **80%** | ✅ +10% |
| w 一致 | 60% | **70%** | ✅ +10% |
| d 一致 | 30% | **0%** | ❌ 逆転理解 |
| Speed (moth) | 40s | 43s | - |

**Highlight**: hermit Eval 4 で **傑作表現**
```
"moderate weight... established authority
WITHOUT being overly authoritative"
```
→ w=5 の完璧な説明

### Critical Issue: Decay 理解が逆転

```
moth Eval 2,3: "SHORT decay time" → d=2 (long-lived)
hermit Eval 2: "LONG-LASTING relevance" → d=7 (short-lived)
```

**Problem**: qwen2.5:1.5b が "decay" を誤解
- 正しい: decay=0 (timeless), decay=10 (ephemeral)
- 誤解: "decay time" = 衰退にかかる時間 → d=2 (短時間で衰退)

---

## Phase 5: LONGEVITY Scale (逆スケール)

**Solution**: "DECAY" → "LONGEVITY" に変更、スケールを反転

```
━━━ Step 3: LONGEVITY (how long it stays relevant) ━━━
Definition: Duration of relevance and usefulness
Your perspective: As [concrete role], assess how long valuable
Scale: 0 = ephemeral/days, 10 = timeless/permanent
Analysis: [your reasoning]
Longevity score (0-10): [N]

Backend conversion: decay = 10 - longevity
```

### Results (moth + hermit)

| 指標 | v2 (DECAY) | v3 (LONGEVITY) | 変化 |
|------|------------|----------------|------|
| JSON Success | 100% | 100% | - |
| h 一致 | 80% | 80% | - |
| w 一致 | 70% | 70% | - |
| **d 逆転表現** | 100% (有) | **0%** (消失) | ✅ |
| **d 説明完全性** | 30% | **60%** | ✅ +100% |
| **d スコア一致** | 0% | **40%** | ✅ |
| Speed (moth) | 43s | **33s** | ✅ -23% |

### Example: Longevity 説明の改善

**moth Eval 1** (d=8):
```
"fundamental concept in biology...
authoritative and ENDURING"
```
- Before (DECAY): "short decay time" (矛盾)
- After (LONGEVITY): "enduring" (矛盾なし)

**hermit Eval 2** (d=8):
```
"well-established... remains RELEVANT...
foundational role"
```
- longevity 表現が自然に出現

**hermit Eval 3** (d=3) ✅:
```
"established... depth and authority... relevant"
```
- Reason と score が一致！

---

## Final Results

### Overall Performance

| Model | h | w | d | JSON | Reason一致 | Speed | 判定 |
|-------|---|---|---|------|-----------|-------|------|
| **phi3:mini** (3.8B) | 2-6 | 1-6 | 3-6 | 100% | 80-90% | 56s | **Gold standard** |
| **llama3.2:1b** (1.2B) | 0-9 | 1-6 | 4-9 | 100% | 70-80% | 32s | **両目（強）** |
| **qwen2.5:1.5b** (v1: base) | 5固定 | 1.3pt | - | 100% | 20-30% | 44s | **片目** |
| **qwen2.5:1.5b** (v2: PAUSE+concrete) | 1-10 | 3-10 | 0-10 | 100% | 50-70% | 43s | **両目（中）** |
| **qwen2.5:1.5b** (v3: LONGEVITY) | 0-10 | 4-10 | 0-10 | 100% | **60-80%** | **33s** | **両目（強）** |

### Key Achievements

1. ✅ **Measurement capability restored** — h,w,d 全次元で測定可能
2. ✅ **Reason-score consistency** — 20-30% → 60-80% (3倍改善)
3. ✅ **JSON stability** — 100% maintained throughout
4. ✅ **Speed improvement** — 44s → 33s (25% 高速化)
5. ✅ **Decay understanding** — 逆転表現消失、説明完全性 2倍改善

---

## Design Principles Discovered

### 1. Sequential Dimension Evaluation

**Principle**: 各次元を個別に評価することで認知負荷を低減

- 同時評価 (h,w,d) → 混乱、矛盾
- 順次評価 (h → w → d) → 明確、一貫性

### 2. PAUSE as Cognitive Boundary

**Principle**: 明示的な区切りが次元間の混同を防ぐ

```
[PAUSE - Move to next dimension]
```

### 3. Concrete Role Descriptions

**Principle**: 抽象的な比喩ではなく、具体的な役割記述を使用

- ❌ "like a moth drawn to light" (抽象的)
- ✅ "attention-driven explorer drawn to trending topics" (具体的)

### 4. Inverted Scale for Clarity

**Principle**: LLM が誤解しやすい用語は逆スケール + 変換で対応

- ❌ "decay" → "decay time" と誤解
- ✅ "longevity" → 直感的理解 + backend で `d = 10 - longevity`

### 5. Agent's Perspective

**Principle**: 各次元で agent の視点を明示

```
Your perspective: As [concrete role], assess [specific aspect]
```

---

## Remaining Issues

### 1. Scale Calibration

qwen2.5:1.5b は longevity スコアを低めに評価する傾向:
- "well-established... foundational" → longevity 7-10 を期待
- 実際: longevity 2-3 (d=7-8) を出力

### 2. Dimension Explanation Completeness

- h: 90% 説明率
- w: 80% 説明率
- d: 60% 説明率 (改善したが依然不完全)

### 3. Query Dependency

一致度がクエリに依存:
- "viral" クエリ: 70-80% 一致
- "scientific" クエリ: 65% 一致
- "philosophical" クエリ: 50% 一致

---

## Model Deployment Strategy (Updated)

| Role | Model | Rationale |
|------|-------|-----------|
| **Internal evaluation (24/7)** | **llama3.2:1b** | Full 3D + 43% faster + species memory compatible |
| **External response** | gemma2:2b | Inference quality + speed |
| **Baseline establishment** | phi3:mini | Gold standard |
| **Research/Experimentation** | **qwen2.5:1.5b** | Sequential evaluation testbed + 41% faster than phi3 |

---

## Implications for Lightweight Models

### Universal Pattern (Sequential + PAUSE + Concrete)

この発見は他の軽量モデルにも適用可能:

1. **Sequential dimension evaluation** は認知負荷を低減
2. **PAUSE** は混同を防ぐ認知境界
3. **Concrete role descriptions** は自己認識を明確化
4. **Scale inversion** は誤解を回避

### Future Work

1. **Prompt optimization** — scale calibration の改善
2. **Multi-model validation** — smollm2:360m, qwen2.5:0.5b での検証
3. **Automatic role detection** — evalFocus から自動的に concrete role を抽出
4. **Dynamic scaling** — モデルごとの scale bias を学習・補正

---

## Conclusion

✅ **qwen2.5:1.5b は測定器として使用可能**

- Sequential + PAUSE + Concrete + LONGEVITY により、reason-score consistency が 20-30% → 60-80% に改善
- JSON stability 100% 維持
- phi3:mini より 41% 高速 (33s vs 56s)

🎯 **測定 = Sequential Evaluation + Species Memory + LLM**

- Loadout (初期設定) + Species Memory (後天的形質) + Sequential Pattern (測定手順) の三位一体
- 軽量モデルでも適切な測定パターンにより、測定器として機能する

---

## Universal Pattern Validation: gemma2:2b

**Date**: 2026-02-10 (after qwen2.5:1.5b success)
**Hypothesis**: Sequential pattern は他のモデルにも有効

### Before Sequential Pattern (word examples + 2-step)

| Metric | moth | hermit | 評価 |
|--------|------|--------|------|
| **d range** | 0pt (d=5 固定) | 0pt (d=3 固定) | ❌ 測定不能 |
| **w range** | 1pt | 1pt | ⚠️ 限定的 |
| **Reason一致** | 60-70% | 50-60% | ⚠️ 不完全 |
| **Speed** | 83s | 81.58s | - |

### After Sequential Pattern (PAUSE + Concrete + LONGEVITY)

| Metric | moth | hermit | 評価 | 変化 |
|--------|------|--------|------|------|
| **d range** | 2pt (4-5) | 3pt (3-6) | ✅ 測定可能 | **完全固定 → 測定活性化** |
| **w range** | 1pt | 2pt | ✅ 改善 | hermit +1pt |
| **Reason一致** | 80-90% | 70-80% | ✅ 大幅改善 | **+20%** |
| **Speed** | 72.45s | 91.38s | - | 変化なし |

### Example: Reason-Score Consistency

**moth Eval 3** (h=7 w=5 d=3):
```
"high heat... viral... moderate depth... lacks clear authority... short-term relevance"
```
- w=5 ← "moderate depth, lacks authority" ✅
- d=3 (longevity=7) ← "**short-term relevance**" ✅

**hermit Eval 2** (h=7 w=5 d=3):
```
"complex and foundational... authoritative... lacks depth"
```
- w=5 ← "lacks depth" ✅
- d=3 (longevity=7) ← "foundational" ✅ (長期的価値)

### Key Findings

1. ✅ **d 測定能力が完全固定から活性化** (gemma2:2b の既知の弱点を克服)
2. ✅ **Reason-score 一致度が +20% 改善** (qwen2.5:1.5b と同様の効果)
3. ✅ **LONGEVITY 表現が自然に出現** — "short-term relevance", "limited longevity"
4. ⚠️ **速度は改善せず** (82s 前後、qwen2.5:1.5b の 33s より遅い)

### Conclusion

🎯 **Sequential Pattern は普遍的に有効**

- qwen2.5:1.5b (1.5B) と gemma2:2b (2B) の両方で測定能力向上を確認
- **PAUSE + Concrete Role + LONGEVITY** の組み合わせが認知負荷を低減
- モデルアーキテクチャに依存しない一般的な prompt engineering 手法

---

**Status**: ✅ Experiment complete — Sequential pattern universally validated
**Next**: Multi-species data accumulation with optimized pattern
