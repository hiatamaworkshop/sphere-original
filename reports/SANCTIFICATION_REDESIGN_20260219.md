# Sanctification Neuron Redesign — 2026-02-19

## 概要

ニューロントライアングルの役割を明確化し、Hard/Soft を再設計。

---

## 動機

旧 Hard neuron は `amberRatio = amber / totalNodes` を使用していたが、
amber は不滅・他ノードは減衰するため、放置で枯死するスフィアでも比率が上昇する構造的欠陥があった。

---

## 新設計: 三者の役割

| Neuron | 役割 | 問い |
|--------|------|------|
| Hard | 目標達成 | 「amber が目標数に達したか？」 |
| Soft | 健全性チェック | 「スフィアは十分な期間健全か？」 |
| Meta | 不正検知 | 「プロセスに操作はないか？」 |

---

## Hard Neuron — Escalating Amber Goal

### 旧: 比率型（廃止）
```
confidence = amberRatio×0.35 + activeHealth×0.25 + capacityHealth×0.25 + relicHealth×0.15
threshold = max(FLOOR, baseline × BASELINE_RATIO)  // allostatic EMA
```

### 新: ゴール型
```
progress = amberCount / target
fired = amberCount >= target
```

- `INITIAL_TARGET = 5` — 最初の聖域化に必要な amber 数
- `ESCALATION = 1.3` — 聖域化ごとに目標が × 1.3
- `onSanctify(currentAmber)` → 次の target = ceil(currentAmber × 1.3)

### 特性
- 枯死スフィアは amber が増えない → progress 停滞（偽陽性なし）
- amber 降格で progress 後退（自然な試練）
- スケール非依存（totalNodes に影響されない）

---

## Soft Neuron — Temporal Health Check

### 旧: Hard confidence の時間積分（廃止）
```
cooledValue = hardConfidence × coolingWeight
integrated = ringBuffer.mean()
```

### 新: スフィア健全性の時間ウィンドウ統合
```
vitality = activeHealth×0.45 + relicHealth×0.25 + populationHealth×0.30
health = ringBuffer.mean(vitality)
fired = bufferFull && health >= THRESHOLD
```

- `THRESHOLD = 0.40`
- `MIN_POPULATION = 30`
- activeHealth: `1 - |livingRatio - 0.5| × 2` （living = active + amber）
- relicHealth: `min(1, relicCount / 3)`
- populationHealth: `min(1, totalNodes / 30)`

---

## Meta Neuron — 変更なし

不正検知に集中。4つの物理量はそのまま維持:
1. Organic ratio
2. Graph churn rate
3. Amber slope anomaly
4. Ghost metabolism

---

## Metabolic Auto-Mode

### 旧: baseline 相対バンド
```
confidence < baseline × 0.5 → flow
confidence < baseline        → natural
confidence ≥ baseline        → archive
```

### 新: progress ベースバンド
```
progress < 0.3 → flow    (ゴール遠い → 代謝刺激)
progress < 0.7 → natural (接近中 → 標準)
progress >= 0.7 → archive (達成近い → 保存)
```

---

## その他の変更（同日）

### Mock Data ティア廃止
- `importance` によるティア振り分け（topTier/normal/ghost）を廃止
- 全 seed を normalNodes として投入 → スフィア内の実績で昇降
- `capsule.schema.json` の `normalNodes.max` を 5 → 10 に拡張

### Arbiter scoreThreshold
- 1000 → 1500 に引き上げ（前日）

---

## 変更ファイル一覧

| ファイル | 変更種別 |
|---------|---------|
| `sanctification/sanctification-neuron.ts` | Hard/Soft 全面書き換え、API status 更新 |
| `index.ts` | metabolic auto-mode を progress ベースに変更、seed ティア廃止 |
| `schema/capsule.schema.json` | normalNodes.max 5→10 |

---

## 未実施・将来検討

| 項目 | 状態 | 備考 |
|------|------|------|
| Escalation 減衰カーブ | 延期 | `1 + 0.3/(1 + epoch × 0.2)` 等。2-3回聖域化してからデータで決定 |
| Sphere Maturity / Level | 未設計 | 若いスフィアは成長率が高く、成熟すると鈍化する概念。エージェント数の増加も考慮要。経験則が必要 |
| Sanctuary Snapshot (DB書き出し) | 未実装 | `// TODO` コメントのみ |
| Festival 効果 | 構造のみ | 期間中の代謝変化・フィールド変動は未定義 |

---

## 検証結果

```json
{
  "hard": { "fired": false, "progress": 0, "amberCount": 0, "target": 5 },
  "soft": { "fired": false, "health": 0.5228, "threshold": 0.4, "bufferFull": false },
  "meta": { "healthy": true, "suspicion": 0 },
  "metabolicMode": "flow"
}
```

- Hard: amber 0/5 → 進捗ゼロ
- Soft: health 0.52 > threshold 0.40 だがバッファ未充填
- Meta: 健全
- Metabolic: flow（progress=0 < 0.3 → 代謝刺激）

3体エージェント同時投入テスト実施（wanderer, moth, scholar）。
3ラウンド走行で nodes=87, amber=0 を確認。Arbiter threshold=1500 により即時昇格なし。
