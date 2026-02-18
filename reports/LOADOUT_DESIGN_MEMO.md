# Loadout 設計メモ — 構造型エージェント人格

**日付**: 2026-02-08
**状態**: 設計確定 → 実装中

---

## 核心的洞察

```
知能は Sphere に無い    — 物理法則のみ
知能は Agent (LLM) に無い — テキスト理解のみ（感覚器官）
知能は Coupling にある   — 測り方が人格を決める
```

LLM は「このノードの h は 8」としか言わない。
その 8 をどう**解釈**するかが Loadout で決まる。
Scholar は「もっと掘れ」、Scout は「十分だ、帰る」。

**同じ Sphere、同じ phi、同じノード** — Loadout を変えるだけで全く別の人格になる。
再学習ゼロ。モデル非依存。完全に説明可能。

---

## Loadout = 測り方のバンドル

```typescript
interface Loadout {
  name: string;
  weights: FastGateWeights;        // モノサシ — 何を重視するか
  returnVector: SatisfactionVector; // 性格 — いつ帰るか
  walkPreference: WalkMode;        // 移動戦略 — どう動くか
  minCycles: number;               // 最低探索回数
  energySensitivity: number;       // エネルギー感受性 — 帰り方の美学
}
```

| フィールド | 役割 | 範囲 |
|-----------|------|------|
| `weights` | ノード選択のスコアリング係数 | FastGateWeights (9 flag + 4 metric + keyword) |
| `returnVector` | 満足度の 4D 重み | [relevance, authority, preservation, hitRate] 合計=1.0 |
| `walkPreference` | デフォルト移動モード | WalkMode (6種) |
| `minCycles` | 帰還判定開始までの最低サイクル | 自然数 |
| `energySensitivity` | エネルギー残量への感受性 | 0.0(鈍感) ~ 3.0(敏感) |

---

## エネルギー感受性の設計

### 帰還確率への影響

```
baseProb = clamp((S·R - 0.5) × 2, 0, 1)      // 従来の満足度ベース

energyRatio = currentEnergy / initialEnergy     // 0.0 ~ 1.0
energyPressure = (1 - energyRatio) ^ sensitivity // 0.0 ~ 1.0

finalProb = min(1.0, baseProb + energyPressure)
```

### 具体例 (initialEnergy=100)

| energy | ratio | Scholar(0.5) | Balanced(1.0) | Scout(2.5) |
|--------|-------|-------------|---------------|------------|
| 80 | 0.8 | +0.45 | +0.20 | +0.01 |
| 50 | 0.5 | +0.71 | +0.50 | +0.18 |
| 20 | 0.2 | +0.89 | +0.80 | +0.58 |
| 10 | 0.1 | +0.95 | +0.90 | +0.76 |

**注**: Scholar の sensitivity=0.5 は圧力が**高い**（鈍感ではない）。
感受性が低い = `(1-ratio)^low_power` = 曲線がフラットで早くから圧力を感じる。
感受性が高い = `(1-ratio)^high_power` = 残量が少なくなるまで圧力を感じない。

→ **修正**: sensitivity は「鈍感さ」として解釈する方が直感的。

```
energyPressure = (1 - energyRatio) ^ sensitivity
  sensitivity 小 (0.5) → 早くから圧力 → 慎重派 (Scholar)
  sensitivity 大 (2.5) → ギリギリまで平気 → 大胆派 (Scout)
```

**再修正**: これだと Scout が大胆で Scholar が慎重、性格と逆転する。

### 最終設計: sensitivity = 感度（高い = 早く反応）

```
energyPressure = (1 - energyRatio) ^ (1 / sensitivity)
  sensitivity=0.5 → exponent=2.0 → ギリギリまで平気 (Scholar: 粘る)
  sensitivity=2.5 → exponent=0.4 → 早くから圧力 (Scout: 早期帰還)
```

| energy | ratio | Scholar(0.5→exp2.0) | Balanced(1.0→exp1.0) | Scout(2.5→exp0.4) |
|--------|-------|---------------------|----------------------|---------------------|
| 80 | 0.8 | 0.04 | 0.20 | 0.45 |
| 50 | 0.5 | 0.25 | 0.50 | 0.76 |
| 20 | 0.2 | 0.64 | 0.80 | 0.93 |

Scholar: 半分使ってもまだ +0.25 — 粘る。
Scout: 半分で +0.76 — もう帰りたい。
これが正しい。

---

## エネルギーと帰還の哲学

エネルギー切れ = expelled。しかし returnOnExpelled が AutoCapsule を保全する。
**最悪のケースでも成果は失われない。**

したがって energySensitivity は「リスク管理」ではなく **帰り方の美学** である：

- Scholar が最後まで粘って expelled → 成果は保全。だが **帰還を自分で選べなかった**
- Scout が余裕で帰る → 成果は少ない。だが **自分の意思で帰った**

残量 5、evaluate コスト 3。高品質ノードが目の前にある。
evaluate するか、帰るか。この葛藤は
`energySensitivity × weights × returnVector` の **交差点** で決まる。
パラメータ単体では予測できない。

---

## プリセット一覧

| Loadout | weights 特徴 | returnVector | walk | minCycles | energySensitivity |
|---------|-------------|--------------|------|-----------|-------------------|
| **balanced** | 均等 | [0.4,0.3,0.2,0.1] | explore | 3 | 1.0 |
| **scholar** | authority重視, distance低め | [0.2,0.5,0.2,0.1] | deep | 5 | 0.5 |
| **scout** | hot/fresh重視, distance重め | [0.5,0.1,0.1,0.3] | explore | 2 | 2.5 |
| **archivist** | decay重視, weight重視 | [0.2,0.3,0.4,0.1] | deep | 4 | 0.8 |
| **hunter** | hitRate重視, heat重視 | [0.3,0.2,0.1,0.4] | hot | 3 | 1.5 |

---

## EvalLoop 統合

### Before (agent.ts)

```typescript
this.gate = new FastGate(query, RETURN_PRESETS[config.preset]);
// ...
if (this.gate.shouldReturn()) break;
// moveMode は evalH から決定
```

### After

```typescript
this.gate = new FastGate(query, loadout);
// ...
if (this.gate.shouldReturn(loadout.minCycles, energyRatio)) break;
// moveMode は evalH + loadout.walkPreference から決定
```

FastGate コンストラクタが Loadout を受け取り、全パラメータを一括適用。
`shouldReturn()` に energyRatio を渡し、energySensitivity で帰還圧を計算。
`computeNextMove()` は evalH ベースのまま（Loadout.walkPreference は初期移動のみ）。

---

## 人格空間の広がり

- weights: 9 flag coefficients + 4 metric multipliers + 1 keyword = **14 次元**
- returnVector: **4 次元**
- walkPreference: **6 離散値**
- minCycles: **自然数**
- energySensitivity: **連続値**

合計: 18+ 次元の連続人格空間。5 プリセットはこの空間の代表点に過ぎない。
カスタム Loadout で任意の人格を定義できる。

---

## 関連ドキュメント

- `reports/COUPLING_LAYER_DESIGN_MEMO.md` — 責務分離の原則
- `phi-agent/doc/FAST_PATH_DESIGN.md` — FastGate アーキテクチャ
