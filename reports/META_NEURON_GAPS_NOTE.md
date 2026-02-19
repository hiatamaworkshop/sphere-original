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

---

## 3. Mass Amber → Suspicion Decay → 強制聖域化 (2026-02-19)

### 問題: 物量攻撃による聖域化トリガ

**再現手順:**
1. エージェント数 × eval 速度 × 低閾値 の組み合わせで、全ノードが短期間に閾値を突破
2. 全ノードが一斉に amber 昇格 → `amberSlopeAnomaly` 発火 → Meta suspicion=1.0
3. Meta がブロック → 聖域化は止まる
4. しかし **suspicion は時間とともに減衰する** (毎サイクル × 0.982)
5. 約 7〜10 分で Meta が復旧 → Hard=✓ Soft=✓ Meta=✓ → 聖域化が発火

### 現状の死角

- suspicion は「不正な状態での聖域化」を一時的にブロックするが、最終的には解除される
- 不正バッチで生まれた amber ノードはその後も Hard ニューロンの `amberCount` に算入され続ける
- 物量攻撃 + 数分待機 = **任意のタイミングで聖域化を強制可能**

### 影響の深刻度

実験スフィア（20ノード + 3エージェント）でも再現した。本番スフィアでは
エージェント数を増やすだけで成立するため、設計的な対処が必要。

### 設計方向 (延期)

**Meta をストッパとして機能させ、不正バッチの amber を Hard カウントから除外する:**

```
suspicion >= threshold で fraud 検知
  → その時点で amber 昇格したノードに "tainted" フラグを付与
  → Hard ニューロン: tainted amber は amberCount に算入しない
  → tainted フラグは一定期間 (N サイクル or M 分) で自動解除
    (恒久的なタインティングは legitimate な amber も排除しうるため)
```

**なぜ恒久タインティングではないか:**
- amber は減衰しないため、永久タインティングは「過去の事故で amber になったノード」を
  永続的に Hard カウントから外す → 正当な聖域化も妨げる
- 一定期間後の解除により「不正を繰り返せば suspicion が再発火する」抑止力を維持

**実装コスト (概算):**
- `ReferenceNode` に `taintedUntil?: number` (timestamp) 追加
- Arbiter: amber 昇格時に Meta の suspicion 状態を確認し、超過なら `taintedUntil` 設定
- Hard ニューロン: `amberCount` 算出時に `taintedUntil > Date.now()` のものを除外

### 判断

聖域化の実績が 2〜3 回蓄積してから設計を確定する。
現時点では suspicion による一時ブロックの挙動を観測し続ける。
