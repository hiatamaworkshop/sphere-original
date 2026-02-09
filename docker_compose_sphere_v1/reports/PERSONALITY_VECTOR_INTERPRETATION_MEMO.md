# 性格ベクトル解釈メモ — あらゆる行動を内積で表現する

**日付**: 2026-02-08
**状態**: 設計原則（実装は returnWeights のみ。他は設計空間）

---

## 核心的洞察

```
「帰還したい」ではなく「もっと良いものを探したい」かもしれない。
同じベクトル内積が、解釈次第であらゆる行動を駆動できる。
```

### 4D 感情ベクトル (実装済み)

```
feelings = [satisfaction, frustration, stamina, staleness]
  satisfaction: 良いものを見つけた満足度 (S·Q → 0-1)
  frustration:  悪いものを引いた焦り    (missRate → 0-1)
  stamina:      体力の残量              (1 - energyRatio → 0-1)
  staleness:    飽き / 驚きの欠如       (1 - entropy → 0-1)

returnDesire = feelings · returnWeights
returnProb = clamp((returnDesire - 0.5) × 2)
```

**全次元が 0-1 の統一スケール。突出する次元がない。**
energySensitivity の支配問題はこの構造で解決された。

---

## 解釈の多面性

### 同じ内積構造で表現できるもの

returnWeights は「帰還したい気持ち」への寄与度として設計されたが、
**同じ feelings ベクトルを別の weights で内積すれば、別の行動を駆動できる**。

| 行動 | weights の解釈 | 例 |
|------|--------------|-----|
| 帰還判断 | `returnWeights` | 満足+疲労が高いとき帰る |
| 探索欲 | `explorationWeights` | 飽き+体力があるとき探索モード |
| 勇敢さ | `braveWeights` | frustration が高くても退かない |
| 集中度 | `focusWeights` | 満足度が低いとき近くを集中スキャン |
| 慎重さ | `cautionWeights` | frustration が高いとき安全なノードを選ぶ |

### 例: 勇敢な性格

```typescript
// 「帰りたくない」= returnDesire が低い
// returnWeights = [0.1, 0.0, 0.1, 0.0]
// → 満足しても、疲れても、がっかりしても、飽きても、帰らない
// → エネルギー物理法則 (expelled) が最終安全装置
```

### 例: 好奇心旺盛な性格

```typescript
// staleness が高い → 「もっと違うものが見たい」
// returnWeights = [0.0, 0.0, 0.0, 0.8]
// → 同じパターンが続いたら帰る（新しい場所を探しに）
// これは「帰還」ではなく「再出発」の表現
```

### 例: 慎重な性格

```typescript
// frustration が高い → 「ここは危ない、引き返そう」
// returnWeights = [0.0, 0.8, 0.2, 0.0]
// → 悪いノードに当たると即座に撤退
```

---

## 設計空間: 行動分岐への拡張

### 現行 (v1): 単一内積 → 帰還判断

```
feelings · returnWeights → returnDesire → 帰還確率
```

### 拡張案 (未実装): 複数内積 → 行動選択

```
feelings · returnWeights     → returnDesire
feelings · explorationWeights → explorationDesire
feelings · focusWeights      → focusDesire

行動 = argmax(returnDesire, explorationDesire, focusDesire)
```

**各 weights ベクトルが同じ feelings を「どう読むか」を定義する。**
性格は weights の集合体になる。

### 拡張案の注意点

```
1. 現行の returnWeights だけで十分な人格分離が既に実証されている
2. 行動分岐を増やすと Loadout の設計空間が指数的に拡大する
3. 「性格の表現力」と「設計の難しさ」はトレードオフ
4. まずは returnWeights の可能性を使い切ってから拡張すべき
```

---

## Loadout は「何を重視するか」の集合体

### 現行の Loadout 構成

```
Loadout = {
  weights:         何を見るか (ターゲット選択)
  qualityVector:   何が良いか (品質判断)
  returnWeights:   何を感じるか (行動決定)
  walkPreference:  どう動くか (移動モード)
  minCycles:       最低サイクル (安全装置)
}
```

**全て独立に設定可能。同じ Sphere、同じ phi、同じノード群に対して、Loadout を変えるだけで全く異なる「人格」が出現する。**

### 性格の直交分解

```
性格 = 知覚 (weights) × 価値観 (qualityVector) × 感情 (returnWeights) × 運動 (walkPreference)

scholar:  重いもの重視 × 重さ=良い × 飽きたら帰る × 深く潜る
scout:    熱いもの重視 × 熱さ=良い × 満足したら帰る × 広く探す
wanderer: 何でも見る × 均等判断 × 体力だけで帰る × 広く探す
```

---

## 実証された知見

| 知見 | 根拠 |
|------|------|
| energySensitivity は feelings の一次元に統合すべき | 極端テストで支配問題が発生 → 4D統合で解消 |
| returnVector=[0,0,0,0] でも物理法則が安全装置になる | wanderer テスト (expelled → returnOnExpelled) |
| 同じ weights でも returnWeights の違いで帰還パターンが分離する | balanced vs scholar vs scout テスト |
| 4D feelings は極端値でも破綻しない | 新システム balanced テスト: stamina=1.00 でも 35% (旧: 70%+) |

## 未検証の仮説

| 仮説 | 優先度 |
|------|--------|
| 複数内積による行動分岐 (return vs explore vs focus) | 低 (現行で十分) |
| feelings を move 方向選択にも使う | 中 (現行は evalH のみ) |
| 磁場感受性を feelings 経由で制御する | 低 (磁場効果自体がまだ弱い) |
| feelings をスキャン半径に影響させる | 低 (API 側の制約あり) |

---

## 関連

- `reports/LOADOUT_DESIGN_MEMO.md` — Loadout 設計
- `reports/AGENT_ARSENAL_DESIGN_MEMO.md` — 武器庫設計リファレンス
- `reports/COUPLING_LAYER_DESIGN_MEMO.md` — 責務分離の原則
- `phi-agent/doc/EXTREME_LOADOUT_TEST_RESULTS.md` — 極端テスト結果
- `phi-agent/doc/LOADOUT_TEST_RESULTS.md` — Loadout テスト結果
