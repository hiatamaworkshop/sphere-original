# gemma2:2b evalFocus 最適化レポート

**Date**: 2026-02-10
**Model**: gemma2:2b (2B parameters)
**Scope**: evalFocus プロンプト最適化実験
**Status**: ✅ 確定 (gemma2:2b 専用パターン)

---

## TL;DR

**gemma2:2b には単一概念 + word examples + 2-step analysis が最適。**
他モデル (phi3:mini, llama3.2:1b) には不要かもしれない。

---

## 最適パターン (確定版)

### 構成要素

1. **スケール**: 0-10, 5=neutral
2. **説明語**: 単一概念のみ (motion/attention, density, fade rate)
3. **例**: word-based (low/neutral/high) 各次元3つずつ
4. **プロセス**: 2-step analysis

### テンプレート

```
Observe this node [personality modifier].

Rate (0–10, 5=neutral):
heat = motion/attention (0=still, 10=active)
  ex: dormant topic -> low, steady discussion -> neutral, viral trend -> high
weight = density (0=light, 10=heavy)
  ex: casual mention -> low, blog post -> neutral, deep research -> high
decay = fade rate (0=long-lived, 10=short-lived)
  ex: timeless truth -> low, news article -> neutral, trending meme -> high

Step 1: Write a brief report analyzing this node's heat, weight, and decay.
Step 2: Assign accurate numerical scores based on your analysis.
```

---

## 実験結果

### scout (gemma2:2b)

| Pattern | h range | w range | d range | Notes |
|---------|---------|---------|---------|-------|
| **2-step (最適)** | 8-9 (1pt) | 6-9 (3pt) | 5-7 (2pt) | reason と score 一致度高 |
| multi-descriptor | 8 固定 | 7-9 (2pt) | 5-6 (1pt) | 測定範囲縮小 |

**reason 例** (2-step):
- Fourier (w=5): "not yet established" — ✅ 低評価と一致
- Evolution (h=10): "maximum value appeared" — ✅ 最高値

### moth (gemma2:2b)

| Pattern | h range | w range | d range | Notes |
|---------|---------|---------|---------|-------|
| **2-step (最適)** | 9-10 (1pt) | 8-10 (2pt) | 5-7 (2pt) | 測定範囲良好 |
| 3-step + double check | **10 固定** | **10 固定** | **5 固定** | 完全固定化 (測定不能) |

**reason 例** (2-step):
- Meme (d=7): "decay rate suggests this trend may fade" — ✅ 高 decay と一致
- Internet (w=8): "limited depth of exploration" — ✅ 中程度 weight と一致

**3-step の失敗例**:
- 全評価が h=10, w=10, d=5 に固定
- reason は異なるが、score が全て同一 → 測定停止

---

## anti-patterns (gemma2:2b 専用)

### 1. multi-descriptor

❌ **複数の説明語を "/" で列挙**
```
heat = motion / attention / activity / popularity
weight = density / accuracy / rigor / authority
decay = fade rate / life span / volatility
```

**結果**: 全次元で固定化・範囲縮小
**原因**: gemma2:2b が複数概念を統合できず、デフォルト値に収束

### 2. Step 3 double check

❌ **Step 3: Double check that your scores match your reasoning.**

**結果**: 完全固定化 (h=10, w=10, d=5)
**原因**: 過剰な整合性チェックが測定を阻害、安全な最大値/中央値に収束

**比較** (moth):
- 2-step: h=9-10, w=8-10, d=5-7 (測定範囲良好)
- 3-step: h=10, w=10, d=5 (完全固定)

### 3. 数値例の使用 (過去の知見)

❌ **数値を example に含める**
```
ex: dormant topic -> 2, viral trend -> 8
```

**結果**: gemma が example の最大値に固定化
**解決**: word examples (low/neutral/high) で改善

---

## gemma2:2b の特性

### 測定能力

- **h/w 測定**: 可能 (2-step で安定)
- **d 測定**: 不安定 (クエリ多様性が条件、単一クエリでは固定化)
- **JSON 安定性**: 75% (phi3:mini 100% より低い)

### 挙動パターン

1. **質問形式に応答** — 指示 (Describe) より質問 (Rate) が安定
2. **単一概念を好む** — 複数概念の統合が苦手
3. **example の影響大** — 数値 example で固定化、word example で分散
4. **整合性過剰** — Step 3 double check で測定停止

### 適用範囲

- ✅ **内部評価**: 適用可 (2-step パターン + species memory calibration)
- ⚠️ **外部応答**: 推論品質優先、測定は内部で担う
- ✅ **高速推論**: 22s/session (phi3:mini 60s の 63% 高速)

---

## モデル比較 (参考)

| Model | 測定次元 | JSON | 速度 | 推奨用途 |
|-------|----------|------|------|----------|
| phi3:mini (3.8B) | h/w/**d** (3次元) | 100% | 60s | Baseline 確立 |
| llama3.2:1b (1.2B) | h/w/**d** (3次元, species memory 必須) | — | 32s | 内部評価 (軽量) |
| **gemma2:2b** | h/w (2次元+d不安定) | 75% | 22s | 内部評価 (高速) |

---

## 結論

**gemma2:2b 専用パターンとして 2-step を確定。**

- 他モデル (phi3:mini, llama3.2:1b) には不要かもしれない
- gemma 特有の「複数概念統合の苦手さ」「整合性過剰」に対応
- reason と score の一致度を保ちつつ、測定範囲を確保

**適用済み loadout**: scout, moth
**未適用**: hermit, scholar, archivist, hunter, wanderer, sniper
**次のステップ**: 他の種族への展開 (オプション)

---

## 実装メモ

### 適用場所

`phi-agent/src/fast-gate.ts` — LOADOUTS.scout, LOADOUTS.moth

### 確認方法

```powershell
# scout test
.\test-scout-gemma-gen005.ps1

# moth test
.\test-moth-gemma-gen005.ps1
```

### 期待結果

- h/w/d range: 各次元 1-3pt
- reason と score の一致度: 高
- JSON parse success: >70%
