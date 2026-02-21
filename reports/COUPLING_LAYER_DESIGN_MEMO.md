# カップリングレイヤー設計メモ

**日付**: 2026-02-08
**状態**: 設計確定、Loadout 実装前

---

## 責務分離の原則

### Sphere (Arbiter / RenalCore) — 物理法則のみ

- flags と metrics を管理する
- 閾値ベースの **状態遷移** のみ実行（Ascension, Erosion, Fossilize 等）
- **ノードの「価値」を判断しない**
- Arbiter が見るのは物理量 (h, w, TTL) のみ

```
Arbiter の判断例:
  h + w >= 1000 → Ascension    ← 閾値のみ、「良い」かどうかは問わない
  TTL <= 0      → Ghost 化      ← 自然減衰の結果
  h < 100       → Erosion       ← 物理量が基準を下回った
```

### カップリングレイヤー (phi-agent) — 解釈・性格・戦略

- ノードの「価値」を判断する（何が良いノードか）
- flags + metrics を **解釈** してスコアリングする
- 解釈の仕方がエージェントの「性格」を決める

```
カップリングレイヤーの判断例:
  Hot + 高heat → "注目すべき" (Scholar は無視、Scout は飛びつく)
  高weight + 低decay → "保存価値あり" (Archivist が重視)
  Freshness + keyword一致 → "関連性高い" (全員が重視)
```

---

## Loadout（装備セット）構想

エージェントはカップリングレイヤーで「モノサシ」を身に着け、性格を定め、
それから Sphere 体験をする。

### 構成要素

| パーツ | 型 | 役割 |
|--------|-----|------|
| `weights` | `FastGateWeights` | モノサシ — 何を重視するか |
| `returnVector` | `SatisfactionVector` | 性格 — いつ帰るか |
| `walkPreference` | `WalkMode` | 移動戦略 — どう動くか |
| `minCycles` | `number` | 最低探索回数 |

### プリセット案

| Loadout | weights 特徴 | returnVector | walk | minCycles |
|---------|-------------|--------------|------|-----------|
| Scholar | weight重視, authority高 | [0.2,0.5,0.2,0.1] | deep | 5 |
| Scout | hot/fresh重視 | [0.5,0.1,0.1,0.3] | explore | 2 |
| Archivist | 低decay重視 | [0.2,0.3,0.4,0.1] | deep | 4 |
| Hunter | hitRate重視 | [0.3,0.2,0.1,0.4] | hot | 3 |
| Balanced | 均等 | [0.4,0.3,0.2,0.1] | ※動的 | 3 |

### 起動フロー

```
1. Loadout 選択（名前指定 or カスタム）
2. FastGate(query, loadout.returnVector, loadout.weights) を生成
3. Sphere 接続 → entry → positioned
4. EvalLoop 開始（loadout の weights で pick、walk で移動）
5. shouldReturn(loadout.minCycles) で帰還判定
```

---

## なぜ Arbiter で価値判断をしないか

1. **Arbiter は全ノードに対して均一に動作する** — 個別の「解釈」は持たない
2. **エージェントごとに「良いノード」の定義が異なる** — Scholar と Scout では全く違う
3. **物理法則と価値判断の混在は保守性を下げる** — flags の物理効果と評価基準が絡まる
4. **カップリングレイヤーは交換可能** — 別の AI モデルでも同じ Sphere を体験できる

---

## Hub flag の deprecation

- `Hub (0x0100)` は `linkCount > 5` で Arbiter が動的設定する設計だった
- しかし `arbiter.observe()` に `linkCounts` が供給されていない → 動的 Hub は死んでいる
- Tagger のキーワードマッチ ("overview", "guide" 等) でのみ設定される
- **FastGate のスコアリングからは除外済み**
- weight と decay の組み合わせで代替可能（高weight + 低decay = 構造的に重要）

## hotHeatThreshold 修正

- 旧値: `10` (整数スケール移行前の遺物)
- 新値: `150` = baseHeat(100) + 2回の最大評価(+25 each)
- 根拠: 複数のポジティブ評価を受けて初めて "Hot" になるべき

---

## 将来検討: 複合シグナル

- `decay / (weight + 1)` = 逆価値密度 (高い = 価値が低い)
- 経験的データが溜まってから検討
- SessionMemory の eval 履歴を使って weights を動的調整する案もあり
