# Sanctification Neuron Design — 聖域化ニューロンモデル

Date: 2026-02-17

## 背景: スナップショッティングの問題

Core Sphere（代謝型）から Sanctuary Sphere（静的・人間向け）へデータを移行する
「聖域化 (Sanctification)」のタイミング判断が、これまで設計されていなかった。

- 現状の Digestor: ハードスレッショルディング（`w >= threshold → Amber`）
- これは個別ノードの昇格判断であり、スフィア全体の状態判断ではない
- スナップショッティングのタイミングは恣意的（人間 or 固定間隔）
**これは誤った認識　Digestor は琥珀化に関与しない

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
**この点だが、arbiter あたりが　tick n回ごとの監視をしたりしている、それらと同タイミングで行ったらどうだ？　概念的に無理なら気にしなくて良い、計測の負荷を気にしているだけだ

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

### Node 免疫の具体設計 (将来実装)

**原則**: ノードはエージェントの内部状態を知らない（semantic blind）。
自分が受けた評価の**影響**だけで判断する。

#### 三指標

| 指標 | 測るもの | 実装 |
|---|---|---|
| **evaluator_entropy** | 評価源の多様性 | Bloom Filter (16bit), 時間窓で 0 リセット |
| **received_pressure** | 受けた衝撃の総量 | `Σ (\|Δh\| + \|Δw\| + \|Δd\|) * exp(-t/τ)` |
| **stress_delta** | 圧力の変化速度 | pressure の一階微分、Soft Neuron 系で減衰 |

`evaluation_impact = |Δh| + |Δw| + |Δd|` — エージェントの energy や weight ではなく、
ノード自身の metrics がどれだけ動いたかだけで測る。

#### 判断ロジック: 三系統分離パイプライン

**設計原則: 単位の異なる信号を一つのスコアに潰さない。**

三つの系統はそれぞれ性質が異なる:

| 系統 | 性質 | 役割 |
|---|---|---|
| Bloom Filter (evaluator_entropy) | 離散 (bit) | **トリガー** — 低多様性で hard spike を注入 |
| received_pressure | 連続 (soft) | **圧力** — stress_delta を漸増させる |
| metric_anomaly (`\|expected - observed\|`) | 決定論 (数理) | **背景歪み** — 分布のズレを検知 |

これらをベクトル内積や乗算で合算すると、攻撃側が一つの勾配で
全系統を同時最適化できる（adversarial vector が作れる）。
「賢いが脆い」設計になるため、**三系統は分離したまま統合する**。

```
// ❌ 旧案: 一つのスコアに潰す
suspicion = pressure * (1.0 - diversity)

// ✅ 採用: 三系統をパイプラインとして統合
// Step 1: Bloom はトリガー（門を開ける）
if (bloomFilter.saturation() < MIN_DIVERSITY):
    stress_delta += HARD_SPIKE

// Step 2: neural は圧力（流れを押す）
stress_delta += neural_suspicion * softRate

// Step 3: metric は背景（地盤の傾きを伝える）
stress_delta += metric_anomaly * bgRate
```

Bloom が「門を開け」、neural が「圧力を流し」、metric が「地盤の傾きを伝える」。
パイプラインの異なるステージであり、並列に足し合わせるものではない。

**哲学: 検出しない、圧力を溜める。判定しない、炎症させる。**
ノードは「攻撃だ」と判定する必要がない。ただ炎症するだけでいい。

#### 応答メカニズム (要: ノード構造の拡張)

現状ノードは受動的データ。自己防衛には最低限のフィールド追加が必要:

```
// node に追加:
immuneMod: number   // default 1.0 — RenalCore が decay 計算時に参照
inputGain: number   // default 1.0 — Bookkeeper が評価適用時に参照

// RenalCore.processDecay():
effectiveDecay = baseDecay * node.immuneMod

// Bookkeeper.applyEvaluations():
effectiveDelta = rawDelta * node.inputGain
```

#### 応答の駆動方式: Slow Adaptation（即値ではなく漸進的適応）

immuneMod/inputGain を閾値で即座に切り替えるのは Hard Neuron 的な発想であり、
振動問題（ON/OFF の繰り返し）を引き起こす。
stress_delta を通した slow adaptation を採用する:

```
// 毎 tick — stress_delta は上記パイプラインから流入:
immuneMod += stress_delta * adaptationRate   // 圧力変化に比例して漸増
immuneMod += (1.0 - immuneMod) * recoveryRate // 基準値 1.0 へ自然回復

// clamp: learned_weight と同じ思想 — 微振動のみ許容
immuneMod = clamp(immuneMod, 0.95, 1.05)
```

**設計制約: 振幅制限**
- 基準値: 1.0（常にここへ回帰する）
- 許容振幅: ±0.05（0.95 〜 1.05）
- 攻撃下でも decay が 5% 増える程度。毎 tick 複利で効くため十分な効果がある
- 仮にバグで暴走しても clamp により壊滅的破壊は起きない
- learned_weight の clamp と同一思想: 系の安定性を振幅制限で保証する

inputGain も同様:
```
inputGain += stress_delta * gainAdaptRate
inputGain += (1.0 - inputGain) * recoveryRate
inputGain = clamp(inputGain, 0.90, 1.0)  // 入力は絞る方向のみ
```

Meta Neuron の `suspicionLevel *= 0.995` と同じ回復構造が
末端ノードまで浸透している。全層で Soft Neuron の原則が統一される。

**実装順序**: Sphere 全体免疫（聖域化ニューロン）→ Node 免疫。土台が先。

## 派生: 代謝速度の自律制御 (内分泌系)

聖域化ニューロンの三者（Hard/Soft/Meta）は、聖域化判断のためにスフィア全体の
「成熟度」を常時観測している。この観測結果は聖域化以外にも使える。

**核心**: 聖域化ニューロンの全出力は同じ三者観測から派生する。

```
SanctificationNeuron.observe()
  │
  ├→ 出力1: sanctify?       → boolean (聖域化判断)
  ├→ 出力2: metabolicMode   → flow | natural | archive (代謝速度)
  ├→ 出力3: dormancy signal → エージェント不在時の代謝停止
  └→ 出力4: festival?       → 聖域化直後の特殊期間
```

### 出力1: 聖域化判断 (実装済 v1)
三者合意 → sanctify=true。現状はログのみ、実行は未接続。

### 出力2: 代謝モード自律切り替え
現在の decay preset（flow/natural/archive/dev）は人間が手動で選択する固定値。
ニューロンシステムからの自律制御:

- 三者が「未成熟」(Hard 低) → flow（速い代謝、試行錯誤を促進）
- 三者が「成長中」(Hard 高, Soft 低) → natural（適度な代謝）
- 三者が「安定・成熟」(全員合意手前) → archive（遅い代謝、保存志向）
- 三者が「聖域化に値する」→ スナップショット実行

新しい判断構造は不要。同じ confidence 値に異なる閾値帯を設けるだけ。

### 出力3: エージェント不在時の代謝制御
現状 `isDormant` はタイマーベース（60 秒無接続で休眠）。
ニューロンに統合すれば Meta の agentDiversity=0 として自然に検知される。
エージェントがいない時に代謝が無駄に進むのを防ぐ。

### 出力4: 祝祭期間 (Festival Period)
聖域化直後の特殊期間。何を意味するかは未定義だが、フックポイントは明確:

```
if (result.sanctify) {
  // 1. Sanctuary スナップショット実行
  // 2. 祝祭期間開始
  //    - 代謝パラメータの一時的変化？
  //    - 新規ノードの優遇？
  //    - フィールド intensity の変動？
  // 3. 一定期間後に通常代謝に復帰
}
```

全て「ニューロンの出力にどんな線を繋ぐか」の配線問題。判断の構造は変わらない。

### 聖域化の内容確定 (2026-02-18)
**Sanctuary = Amber + Relic のみ。Active は含めない。**

- Amber: Arbiter の昇格プロセス（Active → Candidate → 冷却期間 → Amber）を
  通過した成熟ノード。品質は代謝が保証済み。
- Relic: SystemCore フラグで代謝凍結された不変の構造体。座標空間の骨格。
- Active を含めない理由: 昇格プロセスのバイパスになる。
  本当に良い Active は放っておけば琥珀になる。「収穫としての巣」の思想。

これは概念的に**内分泌系**（成長ホルモンによる代謝速度調節）に相当する。

2026-02-17: decay preset を手動設計 → 将来的にニューロンが自律制御する線が見えた。
2026-02-18: 全出力の配線マップを整理。聖域化内容を Amber+Relic に確定。

## 実装ヒント: FastGate 帰還判断との構造的同型

エージェントの帰還判断（`phi-agent/src/fast-gate.ts`）にすでに三者構造が存在する。

| 聖域化ニューロン | FastGate 帰還判断 | 位置 |
|---|---|---|
| Hard (状態資格) | `minCycles` チェック + `minEnergy` 閾値 | fast-gate.ts L754, agent.ts L329 |
| Soft (時間的正当性) | `SessionMemory` — qualityProfile の時間積分、delta エントロピー | fast-gate.ts L353-496 |
| Meta (過程の真正性) | 4D feelings (satisfaction, frustration, stamina, staleness) | fast-gate.ts L680-732 |

転用可能な実装パターン:
- **リングバッファ**: `SessionMemory._deltas[]` → MetaNeuron.buffer[]
- **確率的発火**: `returnProb = clamp((desire - 0.5) * 2)` → 聖域化確信度マッピング
- **重みベクトル**: species `returnWeights` → ニューロン間の感度調整
- **velocity 検知**: frustration の `decline × 2` 増幅 → Hard→Soft velocity cooling

エージェントの「もう帰っていい」とスフィアの「もう保存していい」は
スケールが違うだけで構造が同じ。ゼロから設計する必要はない。

2026-02-17: 帰還判断の三者構造を発見。実装時の参照元として記録。

## 実装ログ

### 2026-02-18: v1 実装完了

**作成ファイル:**
- `periphery/src/sanctification/sanctification-neuron.ts` — Hard/Soft/Meta 三者 + オーケストレーター
- `periphery/src/sanctification/index.ts` — エクスポート

**変更ファイル:**
- `periphery/src/index.ts` — 注入（Arbiter 観測サイクル同期、L331 直後）

**実装パラメータ (v1):**
- window size: 30 観測 = 5 分（observationInterval=10tick × 30）
- Hard threshold: 0.3
- Soft threshold: 0.25 (velocity cooling factor: 5.0)
- Meta suspicion threshold: 0.5 (recovery: ×0.995/tick)
- ログ出力: 30 観測ごと or sanctify=true 時

**Hard Neuron の入力重み (v1):**
- amberRatio × 0.35 + activeHealth × 0.25 + capacityHealth × 0.25 + relicHealth × 0.15

**Meta Neuron の 4 物理量:**
1. Organic ratio: (ghostified+fossilized+decomposed) / 全遷移イベント
2. Graph churn rate: 全遷移数 / 総ノード数
3. Amber slope anomaly: 現在の amber 変化速度 / 過去平均速度
4. Agent diversity: (connectedAgents - 1) / 3 (v1 proxy, 4+ agents で 1.0)

**現在の状態: 判定のみ、実行なし。**
sanctify=true 時にログを出すが、Core → Sanctuary のデータ転送は未接続。
ニューロンは「いつ」を判断する門番。「何をするか」は後続の実装。

**テスト:**
統合テストは困難（三者合意に最低 5 分の助走 + 有機的代謝パターンが必要）。
Docker 運用時に `[Sanctification]` ログで三者状態を確認し、閾値を調整する方針。

### Node 免疫の追加設計 (2026-02-18)

- evaluation_impact = |Δh| + |Δw| + |Δd| (ノード視点、agent 内部状態を見ない)
- 三系統分離パイプライン: Bloom→トリガー、neural→圧力、metric→背景歪み
- Slow Adaptation 採用 (即値ではなく stress_delta 経由の漸進的適応)
- 振幅制限: immuneMod ±0.05, inputGain 0.90〜1.0
- metric_anomaly: ノードが自分の baseline (EMA, alpha=0.05) を持ち、乖離を検知
- 哲学: 「検出しない、圧力を溜める。判定しない、炎症させる。」

## 未決事項

- [x] Hard Neuron の `computeHealth()` 入力信号の具体的な重み設計
- [x] 共通 window size の決定（30 観測 = 5 分）
- [x] Meta Neuron の閾値パラメータ
- [ ] Dynamic Thresholding (v1.2 相当): ambient level の算出と effective threshold
- [x] Periphery サイクルオーケストレーションの集約ポイント特定
- [ ] 聖域化後の Core → Sanctuary データ転送フォーマット
- [ ] sanctify=true 時の実際の処理接続（スナップショット実行、Core 側の後処理）
- [ ] 閾値パラメータの実運用チューニング（Docker 運用ログから）
- [ ] Node 免疫の実装（immuneMod/inputGain フィールド追加、Sphere 全体免疫の後）
