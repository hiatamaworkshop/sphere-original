# Sanctification Neuron Design — 聖域化ニューロンモデル

Date: 2026-02-17

## 背景: スナップショッティングの問題

Core Sphere（代謝型）から Sanctuary Sphere（静的・人間向け）へデータを移行する
「聖域化 (Sanctification)」のタイミング判断が、これまで設計されていなかった。

- 現状の Digestor: ハードスレッショルディング（`w >= threshold → Amber`）
- これは個別ノードの昇格判断であり、スフィア全体の状態判断ではない
- スナップショッティングのタイミングは恣意的（人間 or 固定間隔）

**問題**: スフィア全体が「聖域化に値する状態」かどうかを、スフィア自身が判断する機構がない。

## 着想: McCulloch-Pitts デュアルニューロン

Chrome 拡張 Neural Suppressor で実装したデュアルニューロン音量リミッターをベースとする。

### 元モデル（Audio Limiter）の構造

```
source → [Analyser] → Hard Neuron (peak detection, Aδ fiber)
                     → Soft Neuron (RMS integration, C fiber)
                          ↓
                     [GainNode] → output
```

- **Hard Neuron**: 瞬間ピーク検出。閾値超えで即座に発火。attack の深さを決定。
- **Soft Neuron**: リングバッファによる時間窓内の RMS 積分。持続的エネルギーを検出。

### SoftNeuron の核心設計（content.js より）

```javascript
class SoftNeuron {
  // リングバッファ: 時間窓内のエネルギー履歴
  this.energyHistory = [];
  this.maxHistoryLength = Math.ceil((windowMs / 1000) * (sampleRate / 128));

  process(timeDomainData) {
    // RMS 算出
    const rms = Math.sqrt(sumSquares / timeDomainData.length);

    // リングバッファに追加（古いデータは自然脱落）
    this.energyHistory.push(rms);
    if (this.energyHistory.length > this.maxHistoryLength) {
      this.energyHistory.shift();
    }

    // 時間窓内の積分平均
    const integratedRms = integratedSum / this.energyHistory.length;
    const integratedDb = linearToDb(integratedRms);

    // 閾値判定 + computeGain で確信度のグラデーション
    if (integratedDb > this.threshold) {
      this.fired = true;
      this.targetGain = computeGain(integratedDb, this.threshold, this.ratio);
    }
  }
}
```

**設計上の要点**:
1. リングバッファによる自然な記憶消去
2. 積分による平滑化（瞬間スパイクを無視）
3. computeGain による連続的確信度（二値ではない）

## Sphere 聖域化への転写

### 基本原則

- 個別ノードの琥珀化 ≠ 聖域化（Digestor の仕事は変えない）
- 聖域化 = **スフィア全体の状態**がスナップショットに値するかの判断
- 入力はスフィア全体のメトリクス集約値

### 二者協調モデル: 速度フィードバック

二つのニューロンは独立したゲートではなく、**協調して一つの判断を下す**。

核心の洞察: **「熱しやすいものは冷めやすい」**

Hard Neuron が検出した閾値超過の**速度**を、Soft Neuron の積分に**冷却重み**として注入する。

```typescript
// Hard neuron: 閾値と速度を検出
const health = computeHealth(snapshot);
const velocity = Math.abs(health - this.prevHealth);
const hardFired = health > this.threshold;

// velocity → cooling weight（速いほど冷たく扱う）
const coolingWeight = 1.0 / (1.0 + velocity * coolingFactor);

// Soft neuron: 冷却重み付きで積分
this.stateHistory.push(health * coolingWeight);
const integrated = avg(this.stateHistory);
const softReady = integrated > this.sanctifyThreshold;
```

**効果**:
- 自然な成長（velocity 小）→ coolingWeight ≈ 1.0 → 積分蓄積 → 聖域化
- 人工的スパイク（velocity 大）→ coolingWeight ≈ 0.1 → 積分に寄与しない → 阻止
- スパイク終了後 → health 急落 → 何も残らない

## 脆弱性分析と第三のニューロン

### 二者モデルの穴

| 脆弱性 | 内容 |
|--------|------|
| **茹でガエル (Boiling Frog)** | velocity ≈ 0 の遅い操作は冷却されない |
| **文脈の欠如** | Gate Control Theory (Melzack & Wall, 1965): Aδ/C だけでは不十分、脳からの文脈信号が必要 |
| **過敏化 (Central Sensitization)** | 攻撃後に coolingFactor が過剰反応し永久に聖域化できなくなる |
| **線形分離不能 (Minsky & Papert, 1969)** | 単層 MP ニューロンは XOR パターンを解けない — 巧妙な偽装は原理的に区別不能 |

### 解決: 三位一体 (Trinity Model)

第三のニューロンは外部者ではなく、**内部のトライアングル**を形成する。

```
        Hard (状態)
        /        \
       /    △     \
      /            \
Soft (軌跡) ── Meta (過程)
```

**三者の定義**:

| Neuron | 問い | 観測対象 |
|--------|------|----------|
| **Hard** | Where am I now? (状態の資格) | 瞬間メトリクス集約 |
| **Soft** | How long has this been true? (時間的正当性) | 時間積分 + 速度冷却 |
| **Meta** | How did we get here? (代謝的真正性) | 代謝プロセスのテレメトリ |

**判定**:
```typescript
const hardReady = hardNeuron.fire(stateMetrics);
const softReady = softNeuron.fire(stateMetrics, velocity);
const metaReady = metaNeuron.fire(metabolismMetrics);

if (hardReady && softReady && metaReady) {
  snapshotSphere();
}
```

Meta は VETO（拒否権）ではなく**同意者**。三者が対等に合意する。

### 三者の相互フィードバック

```
Hard ──velocity──→ Soft    (速度 → 冷却重み)
Soft ──variance──→ Meta    (変動幅 → 正常範囲の期待値)
Meta ──diversity─→ Hard    (エージェント多様性 → 閾値調整)
```

循環する。どの一者も単独では聖域化を決定できない。

## Meta Neuron 設計原則

### Semantic Blind — 意味を見ない

Meta は：
- ❌ 意味を理解しない
- ❌ ノード内容を見ない
- ❌ flags を読まない
- ✅ 数だけを見る
- ✅ 速度だけを見る
- ✅ 分布だけを見る

**Meta = 純テレメトリ層。observer であって producer ではない。**

### Danger Model (Matzinger, 1994) との一致

免疫は「異物かどうか」ではなく「異常な死のパターン」を見る。
Meta は結果ではなくプロセスを観測する = danger model の実装。

### 4つの物理量

| # | 物理量 | 定義 | 目的 |
|---|--------|------|------|
| ① | **evaluation source entropy** | `-Σ p_i * log(p_i)` where `p_i = agent_i / total_evals` | 単一エージェント支配の検出 |
| ② | **organic ratio** | `decayEvents / (decayEvents + evalDrivenEvents)` | 自然代謝 vs 評価駆動の比率 |
| ③ | **graph churn rate** | `(Δnodes_add + Δnodes_remove + Δtransitions) / window` | 短時間での構造変動 |
| ④ | **amber promotion slope** | `(amber_now - amber_prev) / Δt` vs historical mean | Amber 昇格速度の異常検出 |

### 実装（ルールベース、ML 不要）

```typescript
class MetaNeuron {
  private suspicionLevel = 0;
  private recoveryFactor = 0.995;  // 毎 tick 自然回復

  fire(report: CycleReport): boolean {
    // 疑念の自然減衰（慢性炎症防止）
    this.suspicionLevel *= this.recoveryFactor;

    // ルールベース判定
    if (report.organicRatio < 0.4) return false;
    if (report.agentEntropy < MIN_ENTROPY) return false;
    if (report.amberSlope > this.historicalMean * 3) return false;

    return true;
  }
}
```

### 回復機構（必須）

`suspicionLevel *= 0.995` が毎 tick 適用される。

- 攻撃が止まれば suspicion は指数的にゼロへ回復
- 攻撃が続けば suspicion は蓄積し続ける

**これがないと Sphere は慢性炎症 (chronic inflammation) → PTSD 状態になり、
永久に聖域化できなくなる。免疫寛容 (immune tolerance) の欠如。**

## 既存コードベースからのデータ源

### 新しい計測は不要。既存の戻り値を集約するだけ。

#### ① Evaluation Source Entropy

| データ源 | ファイル | 取得可能データ |
|----------|---------|---------------|
| AutoCapsule | `types/auto-capsule.ts` | `sessionId` per evaluation |
| Bookkeeper.applyEvaluations() | `bookkeeper.ts:459` | applied / frozen / notFound counts |
| AgentManager.getStats() | RenalCore | `totalAgents`, `byType` |

#### ② Organic Ratio

| データ源 | ファイル | 取得可能データ |
|----------|---------|---------------|
| CleanerFish.process() | `cleaner-fish.ts:446` | ghostified + fossilized + decomposed |
| Arbiter.observe() | `arbiter.ts:222` | shouldAscend + shouldErode + shouldRevive |

```
decayEvents = ghostified + fossilized + decomposed
evalDriven  = ascended + eroded + revived
organicRatio = decayEvents / (decayEvents + evalDriven)
```

#### ③ Graph Churn Rate

| データ源 | ファイル | 取得可能データ |
|----------|---------|---------------|
| Bookkeeper.ingest() | `bookkeeper.ts:40` | nodes added per cycle |
| Bookkeeper.applyDecomposition() | `bookkeeper.ts:357` | nodes removed per cycle |
| Arbiter transitions | `arbiter.ts:549` | kind transitions per cycle |
| Crystallization | `arbiter.ts:590` | absorbed nodes count |

#### ④ Amber Promotion Slope

| データ源 | ファイル | 取得可能データ |
|----------|---------|---------------|
| Arbiter candidateStore | `arbiter.ts:280` | registered / promoted / dropout |
| shouldAscend.length | `arbiter.ts:549` | promotions per cycle |
| RenalCore logTelemetry | `renalcore.ts` | `amber=N` every 10 ticks |

### Meta Neuron の所在地

Periphery 側。既存サイクルの戻り値を集約する:

```
Periphery 1 cycle:
  Bookkeeper.ingest()             → nodeAdded count
  Bookkeeper.applyEvaluations()   → applied, frozen, agentIds
  Arbiter.observe()               → ascend, erode, revive, flags
  CleanerFish.process()           → ghost, fossil, decompose
  RenalCore.logTelemetry()        → amber count, node totals
               ↓
        MetaNeuron.process(cycleReport)
               ↓
        { fired: boolean }
```

## 理論的裏付け

| 理論 | 年 | 対応 |
|------|-----|------|
| McCulloch-Pitts Neuron | 1943 | 重み付き入力 + 閾値 → 発火。基本構造 |
| Gate Control Theory (Melzack & Wall) | 1965 | Aδ/C だけでは不十分 → 第三の文脈信号 = Meta |
| Minsky & Papert (Perceptrons) | 1969 | 線形分離限界 → 三者協調で回避 |
| Danger Model (Matzinger) | 1994 | 異物ではなく「異常な死」を検出 = Meta の設計思想 |
| Triple Modular Redundancy | NASA | 3系統合意で commit |
| Predictive Coding (Friston) | 2010 | what / when / how の分離 = Hard / Soft / Meta |

## 最終形

```
Hard   = instantaneous energy     (状態の資格)
Soft   = integrated energy        (時間的正当性)
Meta   = entropy of metabolism    (代謝的真正性)

三者合意 → SANCTIFY
```

聖域化はスフィアの「意識」。
三つのニューロンが一つの判断を下す。

## 攻撃耐性まとめ

| 攻撃 | Hard | Soft | Meta | 結果 |
|------|------|------|------|------|
| 急激なスパイク | good | **blocked** (velocity 冷却) | — | 阻止 |
| 遅い汚染 (boiling frog) | good | good | **abnormal** (低 entropy) | 阻止 |
| 自然な成長 | good | good | normal | **聖域化** |
| 一時的好状態 | good | **not sustained** | normal | 待機 |
| 未成熟 | **not yet** | — | normal | 待機 |
| 攻撃後の回復 | — | — | **suspicion decaying** | 徐々に回復 |

## 設計制約: 時間窓の同期 (Temporal Grid Alignment)

Meta の 4 入力（entropy, organic, churn, amber slope）は、
それぞれ異なるコンポーネントから異なるタイミングで生成される。

**問題**: window サイズがバラバラだと Meta が幻覚を見る。
あるサイクルでは entropy が 3 サイクル前のデータを反映し、
churn は 1 サイクル前を見ている — 時間的にずれた入力から判断を下すことになる。

**解法**: Meta 側で共通リングバッファを持ち、全入力を同一 Δt グリッドに再投影する。

```typescript
class MetaNeuron {
  // 共通リングバッファ — 全入力を同一グリッドで管理
  private buffer: CycleSnapshot[] = [];
  private windowSize: number;  // 共通ウィンドウ (e.g., 20 cycles)

  process(report: CycleReport): { fired: boolean } {
    // 1 cycle = 1 snapshot、全物理量を同時に記録
    this.buffer.push({
      tick: report.tick,
      entropy: report.agentEntropy,
      organic: report.organicRatio,
      churn: report.churnRate,
      amberCount: report.amberCount,
    });
    if (this.buffer.length > this.windowSize) {
      this.buffer.shift();
    }

    // 全入力が同一時間窓から算出される
    const avgEntropy = avg(this.buffer.map(s => s.entropy));
    const avgOrganic = avg(this.buffer.map(s => s.organic));
    const avgChurn   = avg(this.buffer.map(s => s.churn));
    const amberSlope = (last(this.buffer).amberCount - first(this.buffer).amberCount)
                       / this.buffer.length;

    // ... 判定
  }
}
```

**核心**: 1 cycle = 1 snapshot。全物理量が同じタイムスタンプで記録される。
時間窓のずれは原理的に発生しない。設計は崩れない。

## 設計の本質

**Meta Neuron は observer であって producer ではない。**

各器官 → 戻り値 → 集約 → Meta。
Meta はただの代謝読取装置。何も生み出さない。
これが中央集権を回避する鍵。

実装条件:
- 新規計測ゼロ
- 新規 producer ゼロ
- 既存代謝の戻り値のみ

## 将来構想: 分散免疫 — ノード固有のふるまい論理

現在の設計では Meta は Periphery に1つ。中央の読取装置。
しかし生物の免疫は中央集権ではない。

**将来方向: ノード自身が免疫を持つ**

ノードが固有のふるまい論理を持つとしたら:
- ノードが自分の decay を調整する（「自分は押されすぎている」と判断）
- ノードが自分の source entropy を記録する（「評価が単一エージェントに偏っている」）
- ノードが自分の metrics 変動を監視する（局所的な異常検知）

つまりノード = 局所的な Meta。

### 多層免疫構造

```
現在:
  Meta Neuron (中央) ← 全体テレメトリ

将来:
  Sphere 免疫  ← Meta Neuron (全体状態)
  Cluster 免疫 ← クラスタ単位の代謝パターン監視
  Node 免疫    ← ノード固有のふるまい論理
```

生物で言えば:
- Sphere 免疫 = 適応免疫（全身レベル、T細胞/B細胞）
- Cluster 免疫 = 粘膜免疫（局所バリア、IgA）
- Node 免疫 = 自然免疫（細胞レベル、TLR、即座の応答）

**今はこれを実装しない。** Meta の中央モデルで十分。
ただし、ノードの metrics 構造に将来の拡張余地を残しておく意識は必要。
（例: `metrics.localEntropy` のようなフィールドの予約）

## 未決事項

- [ ] Hard Neuron の `computeHealth()` 入力信号の具体的な重み設計
- [ ] 共通 window size の決定（何サイクル分を積分するか）
- [ ] Meta Neuron の閾値パラメータ（MIN_ENTROPY, maxDeviation, maxAmberRate）
- [ ] Dynamic Thresholding (v1.2 相当): ambient level の算出と effective threshold
- [ ] Periphery サイクルオーケストレーションの集約ポイント特定
- [ ] 聖域化後の Core → Sanctuary データ転送フォーマット
