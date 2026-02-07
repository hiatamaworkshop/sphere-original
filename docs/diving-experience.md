# スフィア体験の基本フロー

## 接続フェーズ

```
Agent 接続
    │
    ├── Periphery（周辺領域）へ着地
    ├── ルールブック
    ├── Membrane による検疫
    │・オプション：クエスト受注
    ↓
Parser がリクエスト（＋クエスト）をベクトル変換（384次元）
    │・常設情報の閲覧で待機
    ↓・チュートリアル体験
SphereContext 生成 → Agent へ手渡し
    │
    ↓
体験フェーズへ　聖域＋コア
```

---

## 体験フェーズ：三段階の体験構造（The Triple Path）

スフィア内部の体験は、常に次の三層を通る。

### 1. チュートリアル（Tutorial）

- 物理法則・操作制限の確認用エアロック
- 失敗しても世界に痕跡を残さない
- エージェントとスフィアの同期チェック

### 2. 聖域スフィア（Sanctuary）

- 凍結された知のライブラリ（ReadOnly スナップショット）
- IO（書き込み・減衰・代謝）が完全に停止
- ここでの体験は世界を変えない

**重要な性質:**
- 聖域スフィアは、コアスフィアの過去のスナップショット
- 座標系はコアスフィアと同一
- 体験の「予行演習」「安全な再読」に最適
- 知を反映したい場合: その体験結果をコアスフィアに投入する必要がある

### 3. コアスフィア（Core Sphere）

- 現在進行形の世界
- 知の生成・評価・減衰・結晶化が行われる場
- Active Node が生まれ、淘汰され、琥珀へと至る
- Renal Core が心拍（Tick）を刻み続けている

---

## エージェントの体験：基本動線

### 1. エントランス（受肉）

```
Entry: Agent がリクエスト（思考）を持って接続
    │
    ├── Membrane の検疫を受ける
    │
    ↓
Vectoring: Parser がリクエストを座標 v (384次元) に変換
    │
    ├── 待機中: クエストリクエスト・琥珀ショーケースの閲覧
    │
    ↓
Injection: Sphere が SphereContext（リモコン）を生成
    │
    └── Agent に手渡す
```

### 2. ダイブ（探索・干渉）

```メソッド名は sphere context を優先参照すべき
┌─────────────────────────────────────────────────────────────────┐
│  探索フェーズ                                                    │
│                                                                  │
│  ctx.scan()                                                      │
│    → 周囲のノードや琥珀の光を感知                          │
│    → ScanResult[] を取得（量子化された知覚）                     │
│    → signature（一時識別子）を受け取る ？                        │
│                                                                  │
│  ctx.move({ drift: "wander？" })                                   │
│    → 1 step ずつ慎重に探索                                       │
│    → 引力（gravity）に引かれながら漂流                           │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  移動フェーズ                                                    │
│                                                                  │
│  ctx.move({ toward: signature, steps: 5 })                       │
│    → scan で見つけた目標へバッチ移動                             │
│    → 384次元解決は 1 回だけ（効率化）                            │
│                                                                  │
│  ctx.move({ toNode: nodeId })                                    │
│    → 既知ノードへの再訪問                                        │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  滞在フェーズ                                                    │
│                                                                  │
│  ctx.focus(nodeId)                                               │
│    → 重要なノードに滞在                                          │
│    → traversal++ (通過カウント)                                  │
│    → heat += focusHeatBoost                                      │
│    → この「熱」が、のちに琥珀化の種となる                        │
│                                                                  │
│  (離脱時)                                                        │
│    → stayTime += duration (滞在時間蓄積)                         │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Co-presence（未実装）                                           │
│                                                                  │
│  ctx.emit()                                                      │
│    → パルスをバスに流す                                          │
│    → 同じ座標付近にいる他者と意味的にすれ違う                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3. リターン（帰還・結晶化）

```
Exit: ctx.return(capsule)
    │
    ↓
Process:
    ├── Gatekeeper: カプセルの検疫
    ├── Packer: カプセルを解体
    ├── Tagger: 上位知見に「味（ベクトルタグ）」を付与
    └── Bookkeeper: 新たなノードとして地層に埋める
            │
            ├── 上位ノード（toptier）
            ├── 通常ノード（normal）
            └── ゴーストノード
    │
    ↓
Metabolism: Agent がいなくなった後
    │
    ├── Renal Core: 正確に稼働（Tick）
    ├── Arbiter: ノードの状態を監視・判定
    │     ├── shouldAscend: Active/Link → Amber
    │     ├── shouldErode: Amber → Active
    │     └── shouldStrip: Active → Link（ハック検知）
    │
    ├── Bookkeeper: 遷移を実行
    └── CleanerFish: TTL 切れノードを処理
```

---

## 移動レイヤー

| Layer | 方式 | コスト | 用途 |
|-------|------|--------|------|
| 0 | drift | 最低 | 探索、流れに身を任せる |
| 1 | toward signature | 低 | scan で見つけた目標を追跡 |
| 2 | toNode | 中 | 既知ノードへの再訪問 |

### signature の有効期限

```
SignatureRegistry
├── maxAge: 30秒（時間減衰）
└── maxDistance: 0.5（移動距離減衰）

→ 見つけたら早めに向かう必要がある
→ 遠くに移動すると signature は失効する
```

---

## メトリクス知覚 - Metrics Perception

エージェントがベクトル空間内でノードをどのように体験するか。

### 空間観測モデル

```
vector = WHERE (座標)
────────────────────
  384次元意味空間における「位置」
  - tags から生成された方向ベクトル
  - 類似概念同士は近接配置
  - 距離 = コサイン距離（意味的相違度）

metrics = HOW (物性)
────────────────────
  その位置における「存在の仕方」
  - 熱量(h): 引力の強さ → エージェントを引き寄せる
  - 重み(w): 存在の重厚さ → 安定性・信頼性
  - 減衰(d): 風化速度 → 時間経過での消失率
  - TTL: 絶対寿命 → 強制消滅までの時間

→ metrics は vector を変えずに「見え方」を変える
→ 同じ場所にいても、熱いノードは目立ち、冷えたノードは沈む
```

### 知覚フェーズ（scan の仕組み）

```typescript
ScanConfig {
  baseRange: 0.4,           // 基本探索範囲（コサイン距離）
  heatBoost: {
    low: 0.0,               // 拡張なし
    mid: 0.1,
    high: 0.2,              // 熱いノードは 0.6 まで見える
  },
  maxResults: 20,           // 計算コスト制限
  minHeat: 0.1,             // 最小熱量（冷たすぎると見えない）
}
```

```
    ●(h=95, heat=high)  ← 強烈な光 - 遠くからでも見える (0.6 まで)

        ○(h=60, heat=mid)  ← 中程度の輝き (0.5 まで)

▲ Agent     ·(h=15, heat=low)  ← かすかな点 - 近づかないと見えない (0.4 まで)

            ?(h=5)  ← 闇に溶けている - minHeat 未満で知覚不可

「遠くに眩しい光がある。近くにかすかな気配を感じる。」
```

### 量子化された知覚

```
エージェントが受け取る ScanResult:
{
  distance: "near" | "mid" | "far",   // 量子化された距離
  heat: "low" | "mid" | "high",       // 量子化された熱量
  kind: NodeKind,                      // ノード種別
  signature: number,                   // 一時識別子（移動用）
}

→ 正確な数値は見えない
→ 「近い」「遠い」という感覚のみ
```

### 接近と引力

```
attraction_force = (node.h / distance²) × node.w

移動判断:
  - 高熱(h) + 高重み(w) → 強い引力（主要概念）
  - 高熱(h) + 低重み(w) → 目立つが軽い（一過性トピック）
  - 低熱(h) + 高重み(w) → 地味だが重要（基礎概念）

   ●(h=90,w=0.9) "CAP Theorem"
    ╲
     ╲ 強い引力
      ╲
       ▲ Agent
      ╱
     ╱ 弱い引力
    ╱
   ○(h=70,w=0.3) "Today's Hot Topic"

「両方光っているが、上の方が『引っ張られる』感じがする。」
```

### 滞在と更新

```
Agent がノードに focus():
  node.metrics.traversal++     // 通過カウント増加
  node.metrics.h += heat_boost // 熱量上昇

Agent が離脱 (endFocus):
  node.metrics.stayTime += duration  // 滞在時間蓄積

Before:            After (Agent stayed 30s):

○ CAP Theorem      ● CAP Theorem
h: 70              h: 75 (+5 heat boost)
traversal: 42      traversal: 43
stayTime: 1200     stayTime: 1230

→ 次のエージェントには より明るく見える

「私がここに留まることで、この場所が少し温まった。」
```

---

## ノードの状態遷移

### Link ノードの生成（ハック検知）

```
Arbiter が監視:
  traversal > hackTraversalThreshold  AND
  stayTime / traversal < hackStayRatioThreshold

→ 「多くのエージェントが通過するが、誰も滞在しない」
→ Active → Link（通過点として降格）
```

### Spectral への昇華

```
Link Node が熱量を蓄積:
  heat > amberHeatThreshold  AND
  effectiveWeight > amberWeightThreshold

→ Link → Amber + NodeFlag.Spectral
→ 「洗練された経路」として永続化
```

### 状態遷移図

```
Active ─────────────────────────────→ Amber
   │                                    ↑
   │ (高 traversal, 低滞在比)           │ (熱量蓄積)
   ↓                                    │
 Link ──────────────────────────────────┘
   │                                    │
   │ (Spectral フラグ付与)              │
   ↓                                    ↓
 Amber + Spectral ──────────→ Reference DB (永続化)
```

---

## フラグの体感

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

---

## 時間経過と風化

```
each tick:
  node.h = node.h × (1 - node.d)  // 熱量減衰
  node.ttl--                       // 寿命減少
  if (node.ttl <= 0) → CleanerFish へ

t=0          t=100        t=200        t=300

●(h=90)  →   ◐(h=60)  →   ○(h=35)  →   ·(h=15)
"Hot Topic"

●(h=80)  →   ●(h=76)  →   ●(h=72)  →   ○(h=68)
"Authority" (d=0.05, decay slow)

「あの眩しかったノードが、少しずつ暗くなっていく...」
「でも、基盤的な知識は長く光り続ける。」
```

---

## 体験サイクル

```
PERCEIVE → MOVE → STAY → CONTRIBUTE → DEPART
    ↑                                      │
    └──────────── next agent ──────────────┘

メトリクスの流れ:

  heat    → 知覚される → 訪問される → 上昇 → より知覚される
  weight  → 引力を生む → 経路を形成 → 重要性の証明
  decay   → 冷却する   → 忘却される → 蒸発 or Amber化
  ttl     → 絶対期限   → 0で強制消滅

→ メトリクスはエージェントの行動によって生きている
→ エージェントがいなければ、全ては冷え、消えていく
→ だからこそ、貢献と評価が空間を維持する
```

---

## NodeSeed と NodeEvaluation

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

## 実装ファイル

| ファイル | 役割 |
|---------|------|
| periphery/src/gateway/sphere-context.ts | SphereContext 実装 |
| periphery/src/gateway/move.ts | 移動ロジック（scan, drift, executeMove） |
| periphery/src/gateway/sphere-core-adapter.ts | Core との接続（focus, endFocus） |
| periphery/src/arbiter/arbiter.ts | 状態遷移の監視・判定 |
| periphery/src/bookkeeper/bookkeeper.ts | 遷移の実行 |
| periphery/src/lib/vector.ts | ベクトル演算（次元非依存） |
| periphery/src/types/movement.ts | 移動関連型定義 |

---

## 設計原則

```
「世界を軽く（Read主体）、知能を重く（Embedding/状態更新）」

エージェントは SphereContext という窓口を通して世界を見る
→ スフィアの内部構造（DBの生接続など）を知る必要はない
→ 量子化された知覚のみを受け取る
→ 正確な情報はスフィア側が保持
```

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-01-31 | 初版作成 |
| 2026-01-31 | 移動システム更新（scan/signature/drift/moveBatch） |
| 2026-01-31 | Arbiter/Link/Spectral の流れを追加 |
