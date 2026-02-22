# Sphere Maturity Indicator — difficultyScale 1本で3箇所だけ

**Date**: 2026-02-20
**Status**: Design (構想段階)
**Context**: Allostatic Ascension Threshold 実装時に浮上した設計課題

---

## 設計原則

### 避けるべきもの
- **中央集権モデル**: 「若いとこう、成熟するとこう」の条件分岐
- **パラメータ地獄**: maturity に紐づくパラメータが増殖する未来
- **到達不能**: 成熟スフィアで amber/sanctification が不可能になること
- **trivial**: 若いスフィアで全ノードが即 amber になること

### 根本思想

> 条件を変えるのではなく、**系の性質を1つだけ変える**で表現する。
> 成長によって **速度** が変わるが **到達可能性** は変わらない。

---

## maturity = 系の自己安定力

| 状態 | 特徴 |
|------|------|
| 若い (maturity ≈ 0) | 不安定。早く変化する。でも深くは進まない |
| 成熟 (maturity ≈ 1) | 変化は遅い。でも到達は深い |

- 若いスフィアの早熟 amber は「悪」ではない。若い生物は成長が速い
- 問題は早熟 amber が epoch 進行に直結し、系が追いつかないこと
- 成熟スフィアではエージェントは多いが分散する。threshold が天文学的では困る

---

## 導出元

Sanctification の **Soft Neuron** は既に `vitality` (0-1) を内部計算している:

```
vitality = activeHealth × 0.45 + flexibilityHealth × 0.25 + populationHealth × 0.30
```

これを `maturity ∈ [0, 1]` として公開する。

---

## difficultyScale — 1本のスカラー

```
difficultyScale = lerp(minScale, maxScale, maturity)
// minScale = 0.3, maxScale = 1.5
```

### 掛ける先は3つだけ (絶対原則: 最大3箇所)

| # | 対象 | 式 | 若い (m=0) | 成熟 (m=1) |
|---|------|-----|-----------|-----------|
| 1 | **amber threshold** | `baseThreshold × scale` | 330 | 1650 |
| 2 | **Hard escalation** | `baseEscalation ^ scale` | ×1.08 | ×1.47 |
| 3 | **decay intensity** | `baseDecay × (0.7 + 0.6 × m)` | ×0.70 | ×1.30 |

**それ以外は触らない**: immunity, cooldown, absorption, Soft threshold, Meta — 全て固定。

### 数値テーブル

| maturity | scale | eff. threshold | Hard esc | decay mod | 解釈 |
|----------|-------|----------------|----------|-----------|------|
| 0.0 | 0.30 | 330 | ×1.08 | ×0.70 | 起動直後。amber 容易、epoch 横ばい、decay 緩い |
| 0.2 | 0.54 | 594 | ×1.14 | ×0.82 | 初期成長。initial score 600 でギリギリ candidate |
| 0.5 | 0.90 | 990 | ×1.27 | ×1.00 | 中間。decay neutral、eval 努力が必要 |
| 0.8 | 1.26 | 1386 | ×1.38 | ×1.18 | 安定期。amber は本当に選ばれたノードのみ |
| 1.0 | 1.50 | 1650 | ×1.47 | ×1.30 | 完全成熟。上限。これ以上は上がらない |

---

## 四つのサブシステムの相関

```
   外部 (エージェント)
     │ eval (+h, +w)   ← 推進力
     ▼
┌──────────────────────────────┐
│  Sphere (保存系)              │
│                              │
│  Decay ←──→ Immunity         │
│  (下方圧力)    (再分配)        │
│                              │
│  ← difficultyScale (1本) →   │
│                              │
└──────────┬───────────────────┘
           │ Ascension (amber = 凍結、系外へ)
           ▼
      Amber Layer (不変)
           │
           ▼
      Sanctification (系全体の状態遷移)
```

### Decay → Ascension
- decay が h,w を削る → ascension threshold に届きにくくなる
- **両方が difficultyScale で動く**。片方だけ動くと不整合
- 若い: decay 弱 + threshold 低 → 比率は一定
- 成熟: decay 強 + threshold 高 → 比率は一定

### Ascension → Sanctification
- amber 数が Hard neuron の target を満たす
- 若いスフィアで amber 容易 → Hard がすぐ fire しがち
- **Hard escalation を maturity で制御**: 若い=×1.08 (横ばい), 成熟=×1.47 (急上昇)
- epoch 進行速度がスフィアの成長に追従する

### Immunity の位置づけ
- maturity には紐づけない (固定)
- 現在の ±3% は十分に制約された範囲
- 将来のエネルギー保存モデル (Phase 2) で再検討

### Sanctification → maturity (帰還)
- Soft.vitality = maturity そのもの
- sanctification 達成 → festival → Soft リセット → maturity 一時低下
- 系が自分で自分の難易度を調整する自然なフィードバックループ

---

## 到達可能性の証明

### amber threshold 上限 = 1650
- eval max: +35/cycle (h: +25, w: +10)
- initial score: 600 (normal tier: h=500, w=100)
- 必要 gain: 1650 - 600 = 1050
- 必要 cycle: 1050 / 35 = 30 cycle (≈ 5 min at 10s interval)
- decay ×1.3 を考慮しても、集中 eval で突破可能
- **速度が変わるだけで、到達可能性は変わらない**

### Hard escalation 上限 = ×1.47
- amber 10 個 → 次 target = ceil(10 × 1.47) = 15
- amber 15 個 → 次 target = ceil(15 × 1.47) = 23
- 急だが不可能ではない。ステップダウンも既存機能で担保

---

## 若いスフィアのライフサイクル

1. 初期ノード投入 → score 600 > threshold 330 → candidate
2. cooldown 5min → decay ×0.7 なので score ほぼ維持 → amber 化
3. amber 増加 → Hard target は ×1.08 でゆっくり上昇
4. Soft vitality が上がる → maturity 上昇 → threshold も上がる
5. **系が自分で自分の難易度を上げていく**
6. ある時点で threshold > initial score → eval 努力が必要に
7. maturity ≈ 0.2 で threshold ≈ 594 → initial 600 ギリギリ → フィルター開始

## 成熟スフィアのライフサイクル

1. threshold 1650 → 初期 600 では candidate にならない
2. エージェントが eval を積む → +35/cycle → 30+ cycle で到達圏
3. decay ×1.3 が削る → 集中 eval されないノードは脱落
4. amber は「本当に選ばれたノード」だけ
5. Hard escalation ×1.47 → 次の sanctification は明確に遠い
6. cap = 1.5 → これ以上は上がらない。天文学的にはならない

---

## 現行の暫定実装 (Phase 0)

- [x] Allostatic threshold: `sqrt(activeNodes / referenceNodeCount)` × baseThreshold
- referenceNodeCount=1000, cap=3.0
- maturity 導入前の proxy。機能するが、パラメータが散在する設計

---

## 実装ロードマップ

### Phase 1: difficultyScale 導入
- [ ] Soft.vitality を SanctificationNeuron から公開 (`get maturity()`)
- [ ] /sanctification API に maturity フィールド追加
- [ ] `difficultyScale = lerp(0.3, 1.5, maturity)` を Periphery に実装
- [ ] Arbiter: `effectiveThreshold = baseThreshold × difficultyScale` (sqrt scaling 置換)
- [ ] Hard: `escalation = BASE_ESCALATION ^ difficultyScale`
- [ ] RenalCore: `effectiveDecay = baseDecay × (0.7 + 0.6 × maturity)` (軽く)
- [ ] sphere.config.json から referenceNodeCount を段階的に廃止

### Phase 2: エネルギー保存モデル (将来)
- [ ] totalMetabolicBudget = f(maturity) — 系全体の代謝総量
- [ ] Immunity をゼロサム再分配に拡張 (加速した分だけ別ノードが減速)
- [ ] amber 化で残りの代謝圧が上がる negative feedback
- [ ] Packer 初期パラメータの maturity 連動

---

## 注意点

- vitality は観測窓 (windowSize=30, ~5分) の移動平均。瞬時値ではない
- スフィア起動直後は vitality=0 (バッファ未充填)。floor が必要
- Festival 期間中は vitality がリセットされる → maturity 一時低下 → threshold 低下 → amber 容易化 (自然な回復期)
- maturity が 3 システムに伝播するため、Soft Neuron のバグが影響するリスク。ただし 3 箇所限定なので影響範囲は制御可能

---

## 絶対ルール

1. **maturity に紐づけるのは最大3箇所まで**
2. **条件分岐ではなく連続関数**
3. **上限キャップ必須** (difficultyScale ≤ 1.5)
4. **到達可能性は不変** — 速度だけが変わる

---

## References

- `arbiter.ts` — Allostatic Ascension Threshold (Phase 0 暫定実装)
- `sanctification-neuron.ts` — Soft Neuron vitality 計算
- `renalcore.ts` — Decay 実行, immuneMod 適用
- `bookkeeper.ts` — Immunity (NodeImmunityTracker)
- `decay-presets.ts` — Decay preset 定義
- `SPHERE_ECOSYSTEM_DESIGN.md` — 全体アーキテクチャ
