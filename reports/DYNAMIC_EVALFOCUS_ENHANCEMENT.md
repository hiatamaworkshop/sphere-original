# 動的 evalFocus Enhancement 実装メモ

**Date**: 2026-02-10
**Scope**: gemma2:2b 専用プロンプト最適化の動的適用
**Status**: ✅ 実装完了・動作確認済み

---

## 目的

gemma2:2b 用の evalFocus 最適化パターン (single-concept + word examples + 2-step analysis) を、全 loadout で重複記述せず、モデル検出時に自動適用する。

## 変更内容

### 1. PromptBuilder 拡張 (phi-agent/src/prompt-builder.ts)

#### modelName パラメータ追加

```typescript
class PromptBuilder {
  private query: string;
  private modelName: string; // NEW

  constructor(query: string, modelName: string = "") {
    this.query = query;
    this.modelName = modelName; // NEW
  }
```

#### enhanceEvalFocus() メソッド追加

```typescript
/**
 * Enhance evalFocus for gemma2:2b model
 * Adds word examples + 2-step analysis pattern
 */
private enhanceEvalFocus(base: string): string {
  if (!this.modelName.startsWith("gemma2")) {
    return base; // No enhancement for other models
  }

  // gemma2:2b specific pattern (2026-02-10)
  const enhancement = `

Rate (0–10, 5=neutral):
heat = motion/attention (0=still, 10=active)
  ex: dormant topic -> low, steady discussion -> neutral, viral trend -> high
weight = density (0=light, 10=heavy)
  ex: casual mention -> low, blog post -> neutral, deep research -> high
decay = fade rate (0=long-lived, 10=short-lived)
  ex: timeless truth -> low, news article -> neutral, trending meme -> high

Step 1: Write a brief report analyzing this node's heat, weight, and decay.
Step 2: Assign accurate numerical scores based on your analysis.`;

  return base + enhancement;
}
```

#### evaluateNode() 修正

```typescript
evaluateNode(node: NodeDetail, evalFocus?: string): string {
  // ...
  // Enhance evalFocus for gemma2:2b (adds word examples + 2-step)
  const enhancedFocus = evalFocus ? this.enhanceEvalFocus(evalFocus) : "";
  const perspective = enhancedFocus
    ? `\nPerspective: ${enhancedFocus}`
    : "";
  // ...
}
```

### 2. Agent 修正 (phi-agent/src/agent.ts)

PromptBuilder インスタンス化時に modelName を渡す:

```typescript
// Line 84
this.prompt = new PromptBuilder(this.config.query, this.ollama.modelName);
```

### 3. Loadout 簡素化 (phi-agent/src/fast-gate.ts)

全 loadout の evalFocus を personality modifier のみに簡素化 (enhancement は PromptBuilder が自動追加):

```typescript
// Before (重複記述)
evalFocus: `Observe this node like a moth drawn to light.

Rate (0–10, 5=neutral):
heat = motion/attention (0=still, 10=active)
  ex: dormant topic -> low, steady discussion -> neutral, viral trend -> high
...`

// After (簡潔)
evalFocus: "Observe this node like a moth drawn to light."
```

適用済み loadout: scout, moth, hermit

---

## 動作確認

### テスト実行

```powershell
# hermit + gemma2:2b
.\test-hermit-gemma-gen005.ps1 -Query "trending viral discussions"

# moth + gemma2:2b
.\test-moth-gemma-gen005.ps1 -Query "trending viral discussions"
```

### ログ出力 (確認用、本番削除予定)

```
[PromptBuilder] ✅ Applying gemma2 enhancement (model: gemma2:2b)
[PromptBuilder] Perspective (584 chars):
Perspective: Observe this node like a moth drawn to light.

Rate (0–10, 5=neutral):
heat = motion/a...
```

### 確認結果

- ✅ gemma2:2b 検出時に enhancement が自動適用される
- ✅ phi3:mini など他モデルでは base evalFocus のみ使用
- ✅ 全評価で一貫して適用される (584 chars perspective)
- ✅ 種族ごとの personality modifier (moth: "like a moth drawn to light") は保持される

---

## テスト結果 (gemma2:2b)

### hermit + "trending viral discussions"

| 評価 | h | w | d |
|------|---|---|---|
| 1 | 10 | 8 | 5 |
| 2 | 10 | 10 | 5 |
| 3 | 10 | 10 | 5 |

- h range: 10 固定 (0pt)
- w range: 8-10 (2pt)
- d range: 5 固定 (0pt)

### moth + "trending viral discussions"

| 評価 | h | w | d |
|------|---|---|---|
| 1 | 10 | 8 | 5 |
| 2 | 10 | 8 | 5 |
| 3 | 10 | 10 | 5 |

- h range: 10 固定 (0pt)
- w range: 8-10 (2pt)
- d range: 5 固定 (0pt)

### 比較: hermit 手動 enhancement (Session 1)

- h range: 0-8 (8pt)
- w range: 2-9 (7pt)
- d range: 1-5 (4pt)

**解釈**:
- 動的 enhancement は正常に機能している
- 測定範囲の縮小は species memory の影響 (Session 2-3)
- gemma2:2b はクエリ依存性が強い (trending → h=10 固定)
- d 測定は不安定 (session により 3 or 5 固定)

---

## 利点

1. **DRY 原則**: 最適化パターンを1箇所で管理 (PromptBuilder)
2. **保守性向上**: パターン変更時は enhanceEvalFocus() のみ修正
3. **種族定義の簡潔化**: evalFocus は personality のみ記述 (species-specific)
4. **モデル検出の自動化**: gemma2 prefix で自動判定、他モデルは無修正
5. **拡張性**: 将来的に他モデル用の enhancement も追加可能

---

## 制約事項

### gemma2:2b の測定特性

- **h 測定**: クエリ依存性が強い (trending → h=10 固定)
- **w 測定**: 可能 (range 2-3pt)
- **d 測定**: 不安定 (session ごとに固定値が変わる: 3 or 5)
- **JSON 安定性**: 75% (phi3:mini 100% より低い)
- **クエリ理解**: 限定的 (trending を強く認識、d 測定には影響しない)

### Species Memory の影響

- Session 1 (memory なし): 最大測定範囲 (h=0-8, w=2-9, d=1-5)
- Session 2-3 (memory あり): 測定範囲縮小 (h=5-10, w=7-10, d=3-5)
- Species memory calibration は llama3.2:1b で効果的、gemma2:2b では限定的

---

## 今後の展開

### 残りの loadout への適用 (オプション)

未適用: balanced, scholar, archivist, hunter, wanderer, sniper

現状は3種族 (scout, moth, hermit) で十分なサンプル。全種族への適用は任意。

### モデルデプロイ戦略 (2026-02-10 確定)

| Role | Model | Rationale |
|------|-------|-----------|
| **内部評価 (24/7)** | **llama3.2:1b** | Full 3D measurement + 43% faster |
| **外部応答** | gemma2:2b | Inference quality + speed |
| **Baseline 確立** | phi3:mini | Gold standard |

gemma2:2b は内部評価よりも外部応答に適する (推論品質優先、測定は llama3.2:1b が担う)。

---

## 実装ファイル

- `phi-agent/src/prompt-builder.ts` — enhanceEvalFocus() 追加
- `phi-agent/src/agent.ts` — modelName 渡し
- `phi-agent/src/fast-gate.ts` — evalFocus 簡素化 (scout, moth, hermit)

---

## 参考レポート

- `reports/GEMMA2_EVALFOCUS_OPTIMIZATION.md` — gemma2:2b 最適パターン確定
- `reports/SPECIES_MEMORY_CALIBRATION_EXPERIMENT.md` — llama3.2:1b calibration 成功
- `reports/MODEL_DEPLOYMENT_STRATEGY.md` — モデル役割分担アーキテクチャ
