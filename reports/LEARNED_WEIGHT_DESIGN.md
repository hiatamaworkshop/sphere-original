# learned_weight — 環境が発見した物理定数

**Status**: Phase 2 実装済み (2026-02-26)
**関連**: `INFORMATION_PHYSICS_ENGINE_DESIGN.md` §3, §5.2

---

## 概念

```
if/else = 1/0 の世界
重み付け = 確率の世界 (if → ×1.2)
ベクトル内積 = 連続的な類似度の世界
learned_weight = 環境が発見した物理定数
```

FastGate は既に「重み付き if」。これを「学習された重み」にするだけで
「最初の情報物理エンジン」になる。

---

## 二層構造

| 層 | 名前 | 性質 | 更新 |
|----|------|------|------|
| base_bias | 種族の「遺伝子」 | 不変の物理定数 | なし (Loadout 定義) |
| learned_δ | 種族の「後天的適応」 | bounded ±0.3 | Digestor が世代ごとに更新 |

**なぜ二層か:**
- 全置換すると全種族が同じ最適解に収束するリスク
- base_bias が種族の個性を保証。learned_δ は環境への微適応
- 「性格は Loadout に宿る」原則を壊さない

---

## Phase 1 (実装済み): Session Noise

```
effective = base × (1 + δ)
δ = uniform(-0.1, +0.1)   // NOISE_AMPLITUDE
clamp(δ, -0.3, +0.3)      // DELTA_CLAMP (設計ドキュメント準拠)
```

### 適用対象

| カテゴリ | 次元数 | 効果 |
|---------|--------|------|
| flagBias | 10 | フラグ感度の個体差 (authority ±10% 等) |
| returnWeights | 4 | 帰還性格の個体差 (同じ hunter でも慎重/大胆) |
| qualityVector | 4 | 品質基準の個体差 (何を「良い」と感じるか) |

### 除外

| カテゴリ | 理由 |
|---------|------|
| modeWeights (6×4) | 0.0 が多い。乗算で 0×ゆらぎ=0 → 効果なし |
| stateBias (2) | hot/systemCore は動的フラグ反応。ゆらぎ不要 |
| ratioBias (2) | 加算式 (乗算ではない)。δ の意味が異なる |

### 実装箇所

- `fast-gate.ts`: `WeightDelta` 型, `applyWeightDelta()`, `deltaDebug` getter
- `agent.ts`: `run()` 開始時にδログ出力
- `SpeciesMemoryBias.weightDelta?`: Phase 2 受け皿

### ログ出力例

```
δ: flag=[temp:+3%,temp:-7%,dens:+1%,...] return=[+5%,-8%,+2%,+9%] quality=[-4%,+6%,+1%,-3%]
```

---

## Phase 2 (実装済み 2026-02-26): Digestor learned_δ

### データフロー

```
Agent 探索 → evaluations → eval-log.jsonl
                                    ↓
Digestor gen-NNN:
  1. evaluation_consistency 算出 (profiler.ts — Phase 1 で実装済み)
  2. 前世代の weightDelta をロード (generations/gen-NNN.json)
  3. learned_δ 計算: consistency × evaluation patterns → 累積
  4. species-profile.json に weightDelta を記録
                                    ↓
次世代 Agent:
  loadSpeciesProfile → FastGate(query, loadout, fullBias)
  → learned_δ が base_bias に適用 (effective = base × (1 + δ))
```

### experience_score — 採用指標

| 指標 | 定義 | 採用 |
|------|------|--------|
| evaluation_consistency | 同一ノード再評価時のスコア一致度 | ★★★ 採用 |
| coverage_diversity | 訪問ノードの tags エントロピー | ★★☆ 将来 |
| satisfaction | feelings の S·Q | ★☆☆ 将来 |

### learned_δ 更新ロジック (実装済み)

```
profiler.ts: computeWeightDelta(species, previousDelta)

  ec = evaluationConsistency.score    // 0-1 (高 = 安定したセンサー)
  lr = LEARNING_RATE(0.03) × ec      // consistency がゲート

  qualityVector delta:
    h_signal = (avgH - 5) / 5        // 種族の評価傾向 (-1 to +1)
    w_signal = (avgW - 5) / 5
    d_signal = (avgD - 5) / 5
    → prev_δ + lr × signal, clamped ±0.3

  returnWeights delta:
    consistent → satisfaction weight を強化 (信頼できる)
    inconsistent → frustration weight を強化 (逃げシグナル)
    stamina → 物理量、学習しない
    → prev_δ + lr × signal, clamped ±0.3

  flagBias delta:
    前世代から引き継ぎ (per-node flag データが eval-log にないため)
    将来: eval-log に flag を記録 → flag レベルの学習
```

### species-profile.json 出力例

```json
{
  "species": {
    "hunter": {
      "evaluations": 50,
      "hotNodes": [...],
      "commonTags": [...],
      "evaluationConsistency": { "score": 0.82, "nodes": 12, ... },
      "weightDelta": {
        "flagBias": {},
        "returnWeights": [0.03, -0.08, 0.0, 0.05],
        "qualityVector": [-0.02, 0.06, 0.0, -0.04]
      }
    }
  }
}
```

### 配線 (Phase 2 で修正済み — Option B)

```typescript
// Before: FastGate() → loadSpeciesProfile → setSpeciesBias (hotNodes/tags only, δ ignored)
// After:  loadSpeciesProfile → FastGate(query, loadout, fullBias) → δ applied with learned
```

agent.ts: `loadSpeciesProfile()` を FastGate constructor の前に移動。
constructor 引数で `speciesBias` (weightDelta 込み) を渡す。
`applyWeightDelta(learned)` が learned_δ を base に適用 (noise 撤去済み)。

---

## 種族設計への示唆

| 種族タイプ | base_bias (遺伝子) | learned_δ (適応) | 個性 |
|-----------|-------------------|-----------------|------|
| 専門種 (hunter, sniper) | 強い | moderate | 種の個性が明確、δ は微調整 |
| 汎用種 (balanced) | 環境平均 | **strong** | 未分化の幹細胞。δ が方向を決める |

balanced は「何もない空白」ではなく「未分化の幹細胞」。
learned_δ でそのスフィア固有の最適な探索者に育つ。

---

## 定数一覧

| 定数 | 値 | 定義場所 |
|------|-----|---------|
| DELTA_CLAMP | 0.3 | fast-gate.ts, profiler.ts |
| LEARNING_RATE | 0.03 | profiler.ts |
| MIN_CONSISTENCY_NODES | 3 | profiler.ts |

NOISE_AMPLITUDE (0.1) は Phase 1 の足場として存在したが、Phase 2 完成に伴い撤去。
探索のランダム性は WalkMode とスフィア物理が提供する。
