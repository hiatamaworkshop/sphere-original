# learned_weight — 環境が発見した物理定数

**Status**: Phase 1 実装済み (2026-02-24)
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

## Phase 2 (未実装): Digestor learned_δ

### データフロー

```
Agent 探索 → evaluations → experience_score 算出
                                    ↓
                          Digestor: learned_δ 更新
                                    ↓
                          次世代の FastGate weights 変化
```

### experience_score の候補指標

| 指標 | 定義 | 適合度 |
|------|------|--------|
| evaluation_consistency | 同一ノード再評価時のスコア一致度 | ★★★ センサー精度 |
| coverage_diversity | 訪問ノードの tags エントロピー | ★★☆ 探索幅 |
| satisfaction | feelings の S·Q | ★☆☆ 主観的 |

**推奨: evaluation_consistency** — Sphere が測りたいのは「センサーの精度」。

### learned_δ 更新ロジック (構想)

```
Digestor gen-NNN 処理時:
  1. 各種族の evaluation_consistency を算出
  2. flag 別に「高 consistency 時に活性だった flag」を統計
  3. 正の相関があった flag の learned_δ を +ε
  4. 負の相関があった flag の learned_δ を -ε
  5. clamp(learned_δ, -0.3, +0.3)
  6. species-profile.json に weightDelta を記録
```

### species-profile.json への追加 (将来)

```json
{
  "species": {
    "hunter": {
      "evaluations": 50,
      "hotNodes": [...],
      "commonTags": [...],
      "weightDelta": {
        "flagBias": { "authority": -0.05, "temporalShort": 0.12 },
        "returnWeights": [0.03, -0.08, 0.0, 0.05],
        "qualityVector": [-0.02, 0.06, 0.0, -0.04]
      }
    }
  }
}
```

### 配線の穴 (Phase 2 で修正)

`setSpeciesBias()` は hotNodes/tags のみコピーし weightDelta を無視。
Phase 2 では以下のどちらかで対応:

- **A**: `setSpeciesBias` で learned_δ を受け取って再適用 (δ 二重適用に注意)
- **B (推奨)**: `loadSpeciesProfile` を FastGate constructor の前に移動し、constructor 引数で渡す

B が自然 — agent.ts の初期化順序を変えるだけ:
```typescript
// Before: FastGate → loadSpeciesProfile → setSpeciesBias (hotNodes/tags only)
// After:  loadSpeciesProfile → FastGate(query, loadout, fullBias) → δ applied with learned
```

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
| NOISE_AMPLITUDE | 0.1 | fast-gate.ts L195 |
| DELTA_CLAMP | 0.3 | fast-gate.ts L196 |
