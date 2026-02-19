# Meta Neuron — 設計上の死角と将来検討事項

作成日: 2026-02-19

---

## 1. Eval Rate スパイクの間接検知

### 現状

Meta ニューロンは以下の4指標で不正を検知している:

1. Organic ratio — 非有機イベントの比率
2. Graph churn rate — 状態遷移の過剰発生
3. Amber slope anomaly — 琥珀数の異常な急増
4. Ghost metabolism — エージェント不在での代謝

評価 (evaluation) の件数そのものは `ObservationTelemetry` に含まれていないため、**評価数の爆発は直接検知できない**。

### 間接検知の範囲

eval スパイクが以下を引き起こした場合は既存指標が捕捉する:

- ノードが Arbiter 閾値を超えて ascend → `churnRate` ↑ → suspicion
- amber が急増 → `amberSlopeAnomaly` ↑ → suspicion

### 死角

Arbiter 閾値 (現在 1500) に届かない**マイルドな eval インフレ**は検知されない。
h+w をじわじわ押し上げても ascension/erosion に至らない段階では Meta は感知しない。

### 将来対処案

`ObservationTelemetry` に `recentEvaluations: number` を追加し、
Meta の5番目の物理量として EMA ベースラインとの乖離を suspicion に加算する。

```
evalRateAnomaly = recentEvaluations / (connectedAgents × expectedEvalsPerAgent)
if evalRateAnomaly > THRESHOLD: suspicionDelta += ...
```

実装コスト: index.ts にカウンタ追加 + ObservationTelemetry 型拡張 + MetaNeuron 1指標追加。

---

## 2. 中間代謝モード (guarded) の検討

### 現状の auto-mode スペクトル

| モード | weightDecay/tick | 想定シーン |
|--------|-----------------|-----------|
| archive | 0.00005 | 目標接近・amber 候補保全 |
| natural | 0.0002  | 標準成長 |
| **gap** | —       | (警戒状態) |
| flow   | 0.001   | 不正検知・festival |

natural → flow の倍率が 5 倍と大きく、中間に「警戒」モードを設ける余地がある。

### 想定ユースケース

- eval rate スパイクを検知したが suspicion がまだ閾値未満
- Meta が少し疑わしいが、完全に flow に振る必要はない段階

### 設計案 (延期)

**案A: suspicion 連動グラデーション**
```
suspicion < 0.3           → natural
0.3 ≤ suspicion < threshold → "guarded" (weightDecay ≈ 0.0005, 2.5× natural)
suspicion ≥ threshold      → flow
```

**案B: 新プリセット "guarded" 追加**
```typescript
guarded: {
  alpha: 5.0,
  heatDecayFactor: 0.001,
  weightDecayFactor: 0.0005,
  fluxDecayRate: 0.002,
  minLoadFactor: 0.1,
}
```
auto-mode に: `eval rate spike → guarded, !meta.healthy → flow`

### 判断保留の理由

- eval rate 指標がないと guarded のトリガ条件が曖昧
- 現時点では 1と2 は同じ前提条件に依存している
- データが蓄積し不正パターンが実際に観測されてから設計すべき

---

## 判断

いずれも**聖域化の実績が 2〜3 回蓄積してから**再検討する。
現在は4指標 + イベント駆動 auto-mode (natural/archive/flow) の構成で継続。
