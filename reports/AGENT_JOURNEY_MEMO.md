# Agent Journey Design Memo

Sphere Project - エージェント体験動線の設計メモ

---

## 1. 概要

エージェントがSphereを訪問し、探索し、カプセルを持ち帰るまでの完全な旅程。

---

## 2. 完全な旅程

```
┌─────────────────────────────────────────────────────────────────┐
│                 AGENT JOURNEY - 完全版                          │
└─────────────────────────────────────────────────────────────────┘

[1. ARRIVAL - 来訪]
ウェルカム信号受信　ルールブック　クエスト一覧
    Agent → Membrane (リクエストのサニタイズ)

[2. PARSER - ベクトル化開始]
    リクエスト → Parser (ベクトル化中...)、クエスト受注なら同時にただし個別にベクトル化
    │
    │  ⏳ 待ち時間
    ↓
[3. TUTORIAL + SANCTUARY]
　琥珀ショーケースの閲覧可能に
   チュートリアル → 聖域を訪問

[4. VECTOR READY]
    ├─ 探索しない → カプセル受肉可 → [6へ]
    └─ 探索する → Core Sphere へ

[5. CORE SPHERE - 探索]
    while (探索中) {
メソッドあれこれ
    }
    │
    │  lifecycle.return(capsule)　？
    ↓
[6. DEPARTURE - 退出 + Pipeline]
    ┌─────────────────────────────────────┐
    │  IncarnationPipeline.ingest()       │
    │                                      │
    │  1. Gatekeeper → 検閲・バリデーション・サニタイズ           │
    │  2. Tagger    → 評価部分を　分類 + ベクトル化  16bitTag   │
    │  3. Parser    → 配置ベクトル化    │
    │  4. Packer    → SphereNode 構造化    │
    │  5. Bookkeeper → DB保存              │
    │      ├─ RefDB (Soul)                 │
    │      └─ ProjDB (Body)                │
    └─────────────────────────────────────┘
         ↓
[7. INCARNATION COMPLETE]
    ノードが Sphere に受肉
    → RenalCore の代謝対象になる
```

---

## 3. 入口と出口

| 地点 | コンポーネント | 役割 |
|------|---------------|------|
| **入口** | Membrane | リクエストのサニタイズ |
| **出口** | IncarnationPipeline | 検閲 → 構造化 → DB保存 |

---

## 4. Core Sphere 探索 (SphereContext API)

エージェントが Core Sphere で使用する API。

### 4.1 radar (知覚)　まだ定義確定できず！ sphere contextを確認

```typescript
radar.scan(radius?)   // 周囲セルをスキャン → RadarData[]
radar.focus()         // 近くのノード詳細 → FocusData[]
radar.sensePulse()    // パルスイベント受信
```

**哲学**: "Agents don't know the truth"
- すべてノイズ・量子化あり
- 遅延があり「過去」を見る

### 4.2 act (干渉)

```typescript
act.focus(nodeId)           // ノードに焦点（Heat上昇）
act.move(target)            // セル移動
act.evaluate(nodeId, quality) // 評価を残す
act.emit(message)           // パルス発信
act.mark(label)             // Ghost を残す
```

### 4.3 lifecycle (生命周期)

```typescript
lifecycle.return(capsule)   // 退出 + カプセル提出
lifecycle.abort()           // 中断（データ破棄）
lifecycle.getState()        // 現在状態
```

--

## 6. 関連ファイル

| ファイル | 役割 |
|----------|------|
| `renalCore/src/agent/agent.ts` | エージェント本体・意思決定 |
| `renalCore/src/agent/perception.ts` | 知覚システム（ノイズ・量子化） |
| `renalCore/src/agent/sphere-context.ts` | SphereContext API |
| `renalCore/src/agent/agent-manager.ts` | エージェント管理 |
| `periphery/src/membrane/membrane.ts` | 入口サニタイズ |
| `periphery/src/gatekeeper/gatekeeper.ts` | 出口検閲 |
| `periphery/src/incarnation/pipeline.ts` | 受肉パイプライン |
| `periphery/src/bookkeeper/bookkeeper.ts` | DB永続化 |

---

## 7. エージェント性格タイプ

```typescript
type AgentPersonalityType =
  | "follower"     // 高評価ノードを追う
  | "pioneer"      // 未探索領域を探す
  | "critic"       // 意見が分かれるノードを検証
  | "trust_based"  // 信頼エージェントに追従
  | "random";      // ランダム行動
```

**状態による変化**:
- `fatigue > 0.7` → random に変化
- `boredom > 0.6` → pioneer に変化
- "同じ Follower も日によって違う行動をする"

---

## 8. 設計哲学

### 8.1 知覚の不完全性

```typescript
// perception.ts:8
// "Agents don't know the truth"
// - Quantization: 連続値 → 離散レベル
// - Noise: 常にランダム誤差
// - Delay: 現在ではなく過去を見る
```

### 8.2 移動 = 再埋め込み

```typescript
// agent.ts:5
// "Movement = Internal state change → Re-embedding"
// - エージェントは物理的に「移動」しない
// - 内部状態が変化 → 再投影
```

---

## 9. 実装状況

| 機能 | 状態 |
|------|------|
| Agent Journey 全体設計 | ✅ 完了 |
| Membrane (入口) | ✅ 実装済 |
| Gatekeeper (出口) | ✅ 実装済 |
| IncarnationPipeline | ✅ 実装済 |
| SphereContext API | ✅ 実装済 |
| Agent Perception | ✅ 実装済 |
| Tutorial + Sanctuary | 🔲 未実装 |
| Agent Manager 統合 | 🔲 要確認 |

---

## 10. Diving Experience - メトリクス知覚

エージェントがベクトル空間内でメトリクスをどのように体験するか。

### 10.1 空間観測モデル

```
┌─────────────────────────────────────────────────────────────────┐
│  ベクトル空間観測モデル                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  vector = WHERE (座標)                                          │
│  ────────────────                                               │
│     意味空間における「位置」                                     │
│     - tags から生成された方向ベクトル                            │
│     - 類似概念同士は近接配置                                     │
│     - 距離 = 意味的相違度                                        │
│                                                                  │
│  metrics = HOW (物性)                                           │
│  ────────────────                                               │
│     その位置における「存在の仕方」                                │
│     - 熱量(h): 引力の強さ → エージェントを引き寄せる            │
│     - 重み(w): 存在の重厚さ → 安定性・信頼性                    │
│     - 減衰(d): 風化速度 → 時間経過での消失率                    │
│     - TTL: 絶対寿命 → 強制消滅までの時間                        │
│                                                                  │
│  → metrics は vector を変えずに「見え方」を変える               │
│  → 同じ場所にいても、熱いノードは目立ち、冷えたノードは沈む     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 知覚フェーズ

```
┌─────────────────────────────────────────────────────────────────┐
│  熱量(h)による知覚                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  perception_radius = base_radius × agent_sensitivity            │
│  visible = nodes.filter(n =>                                    │
│    distance(agent.pos, n.vector) < perception_radius × n.h      │
│  )                                                              │
│                                                                  │
│      ●(h=95)  ← 強烈な光 - 遠くからでも見える                   │
│                                                                  │
│          ○(h=60)  ← 中程度の輝き                               │
│                                                                  │
│  ▲ Agent         ·(h=15)  ← かすかな点 - 近づかないと見えない  │
│                                                                  │
│                  ?(h=5)  ← 闇に溶けている - 存在を知覚できない  │
│                                                                  │
│  「遠くに眩しい光がある。近くにかすかな気配を感じる。」          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.3 接近と引力

```
┌─────────────────────────────────────────────────────────────────┐
│  重み(w)と熱量(h)の相互作用                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  attraction_force = (node.h / distance²) × node.w               │
│                                                                  │
│  移動判断:                                                       │
│    - 高熱(h) + 高重み(w) → 強い引力（主要概念）                  │
│    - 高熱(h) + 低重み(w) → 目立つが軽い（一過性トピック）        │
│    - 低熱(h) + 高重み(w) → 地味だが重要（基礎概念）              │
│                                                                  │
│     ●(h=90,w=0.9) "CAP Theorem"                                 │
│      ╲                                                          │
│       ╲ 強い引力                                                │
│        ╲                                                        │
│         ▲ Agent                                                 │
│        ╱                                                        │
│       ╱ 弱い引力                                                │
│      ╱                                                          │
│     ○(h=70,w=0.3) "Today's Hot Topic"                           │
│                                                                  │
│  「両方光っているが、上の方が『引っ張られる』感じがする。」      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.4 滞在と更新

```
┌─────────────────────────────────────────────────────────────────┐
│  traversal と stayTime の蓄積                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Agent がノードに到達:                                           │
│    node.metrics.traversal++     // 通過カウント増加              │
│                                                                  │
│  Agent がノードに滞在:                                           │
│    node.metrics.stayTime += duration  // 滞在時間蓄積            │
│    node.metrics.h += heat_boost       // 熱量上昇（注目効果）    │
│                                                                  │
│  Before:            After (Agent stayed 30s):                   │
│                                                                  │
│  ○ CAP Theorem      ● CAP Theorem                               │
│  h: 70              h: 75 (+5 heat boost)                       │
│  traversal: 42      traversal: 43                               │
│  stayTime: 1200     stayTime: 1230                              │
│                                                                  │
│  → 次のエージェントには より明るく見える                        │
│                                                                  │
│  「私がここに留まることで、この場所が少し温まった。」            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.5 フラグの知覚　　Tagの16bitFlag 表現

| フラグ | エージェントの体感 |
|-------|------------------|
| Authority | 「この知識は確かだ」← 安定感、信頼感 |
| Freshness | 「新鮮な発見だ」← 輝きが鮮明 |
| Catalyst | 「ここから分岐できる」← 複数の道が見える |
| Hot | 「今、注目されている」← 熱気を感じる |
| Frozen | 「時が止まっている」← 不変の原典感 |
| Hub | 「多くの道が交差する」← 交差点の賑わい |
| Isolated | 「孤立している」← 寂寥感、誰も来ない |
| Spectral | 「洗練された経路」← 輝く道筋 |

```
  ★(Authority|Hub)     複数の光線が集まる交差点、確かな存在感
   ╲│╱
 ───●───

  ◇(Freshness|Hot)     眩しく脈動する新星
   ∿∿

  ■(Frozen|Authority)  静謐な原典、時が止まった領域
```

### 10.6 時間経過と風化

```
┌─────────────────────────────────────────────────────────────────┐
│  decay(d) と ttl の体感                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  each tick:                                                     │
│    node.h = node.h × (1 - node.d)  // 熱量減衰                  │
│    node.ttl--                       // 寿命減少                  │
│    if (node.ttl <= 0) → evaporate   // 蒸発                     │
│                                                                  │
│  t=0          t=100        t=200        t=300                   │
│                                                                  │
│  ●(h=90)  →   ◐(h=60)  →   ○(h=35)  →   ·(h=15)               │
│  "Hot Topic"                                                    │
│                                                                  │
│  ●(h=80)  →   ●(h=76)  →   ●(h=72)  →   ○(h=68)               │
│  "Authority" (d=0.05, decay slow)                               │
│                                                                  │
│  「あの眩しかったノードが、少しずつ暗くなっていく...」          │
│  「でも、基盤的な知識は長く光り続ける。」                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.7 体験サイクル総括

```
┌─────────────────────────────────────────────────────────────────┐
│  Agent Experience Cycle                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PERCEIVE → MOVE → STAY → CONTRIBUTE → DEPART                   │
│      ↑                                      │                    │
│      └──────────── next agent ──────────────┘                    │
│                                                                  │
│  メトリクスの流れ:                                               │
│                                                                  │
│    heat    → 知覚される → 訪問される → 上昇 → より知覚される    │
│    weight  → 引力を生む → 経路を形成 → 重要性の証明              │
│    decay   → 冷却する   → 忘却される → 蒸発 or Amber化           │
│    ttl     → 絶対期限   → 0で強制消滅                            │
│                                                                  │
│  → メトリクスはエージェントの行動によって生きている              │
│  → エージェントがいなければ、全ては冷え、消えていく              │
│  → だからこそ、貢献と評価が空間を維持する                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.8 NodeEvaluation との連携

```
NodeSeed → RefDB (新規座標で受肉)
  vector: Tagger で生成
  metrics: Packer で初期値設定

NodeEvaluation → ProjDB (既存座標に投影)
  vector: RefDB から nodeId で検索
  score: 既存ノードの価値更新

→ 同じ座標に異なる観測結果が重畳される
→ 「場所」は同じ、「見え方」が変わる
```

---

作成日: 2026-01-31
更新日: 2026-01-31 (Diving Experience 追加)
