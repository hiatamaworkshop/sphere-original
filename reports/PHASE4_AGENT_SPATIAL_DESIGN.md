# Phase 4: Agent Spatial System 設計書

**作成日**: 2026-01-30
**作成者**: Claude (Opus 4.5)
**ステータス**: 将来検討（現時点では実装不要）

> **Note**: このドキュメントは将来のスケーリング時の参考資料である。
> 現在のノード規模（< 10,000）では Spatial Hash Grid は不要。
> 必要になった時点で pgvector HNSW インデックスから検討する。

---

## 概要

数万のエージェントが同時に Sphere 空間を探索する際のスケーラビリティを確保するための空間演算設計。
ナイーブな総当たり計算（$O(n^2)$）を避け、効率的な近傍探索と計算リソースの動的配分を実現する。

### 設計原則

> 「計算は観測によって励起される」

- エージェントがいない領域は「眠らせる」
- 精密な計算は必要な時だけ行う
- 空間を分割し、局所性を活用する

---

## 1. Spatial Hash Grid（空間分割）

### 概念

世界全体を1つの連続空間として扱うのではなく、立方体の「セル（Voxel）」に分割する。

```
┌─────────────────────────────────────────┐
│  Sphere Space (Continuous)              │
│                                         │
│   ┌───┬───┬───┬───┬───┐                │
│   │ A │ B │ C │ D │ E │  ← Grid Layer  │
│   ├───┼───┼───┼───┼───┤                │
│   │ F │ G │ H │ I │ J │                │
│   ├───┼───┼───┼───┼───┤                │
│   │ K │ L │ M │ N │ O │                │
│   └───┴───┴───┴───┴───┘                │
│                                         │
└─────────────────────────────────────────┘
```

### セルID の設計

```typescript
// 3次元座標からセルIDを計算
function computeCellId(position: Vector3, cellSize: number): string {
  const x = Math.floor(position[0] / cellSize);
  const y = Math.floor(position[1] / cellSize);
  const z = Math.floor(position[2] / cellSize);
  return `${x}:${y}:${z}`;
}

// 例: position = [150, 230, 80], cellSize = 100
// → cellId = "1:2:0"
```

### 近傍探索の最適化

エージェントが周囲をスキャンする際、**自セル + 隣接26セル** のみを対象とする。

```
3D 近傍セル（27セル）:
        上層(9)     中層(9)     下層(9)
       ┌─┬─┬─┐    ┌─┬─┬─┐    ┌─┬─┬─┐
       │ │ │ │    │ │ │ │    │ │ │ │
       ├─┼─┼─┤    ├─┼─┼─┤    ├─┼─┼─┤
       │ │ │ │    │ │★│ │    │ │ │ │  ★ = 自分のセル
       ├─┼─┼─┤    ├─┼─┼─┤    ├─┼─┼─┤
       │ │ │ │    │ │ │ │    │ │ │ │
       └─┴─┴─┘    └─┴─┴─┘    └─┴─┴─┘
```

### 計算量の比較

| 方式 | 計算量 | ノード10万、エージェント1万の場合 |
|------|--------|-----------------------------------|
| 総当たり | $O(n \times m)$ | 10億回/tick |
| Spatial Hash | $O(m \times k)$ | 100万回/tick（k=100と仮定） |

**約1000倍の効率化**

---

## 2. Active Voxel（観測による励起）

### 概念

すべてのセルを常時計算するのではなく、「エージェントが存在するセル」だけを活性化する。

```
┌─────────────────────────────────────────┐
│  Voxel States                           │
│                                         │
│   ┌───┬───┬───┬───┬───┐                │
│   │ 💤│ 💤│ 💤│ 💤│ 💤│  💤 = Sleep    │
│   ├───┼───┼───┼───┼───┤                │
│   │ 💤│ ⚡│ ⚡│ ⚡│ 💤│  ⚡ = Active   │
│   ├───┼───┼───┼───┼───┤                │
│   │ 💤│ ⚡│ 🤖│ ⚡│ 💤│  🤖 = Agent    │
│   ├───┼───┼───┼───┼───┤                │
│   │ 💤│ ⚡│ ⚡│ ⚡│ 💤│                │
│   ├───┼───┼───┼───┼───┤                │
│   │ 💤│ 💤│ 💤│ 💤│ 💤│                │
│   └───┴───┴───┴───┴───┘                │
│                                         │
└─────────────────────────────────────────┘
```

### Sleep / Active 状態の違い

| 処理 | Sleep 状態 | Active 状態 |
|------|------------|-------------|
| Heat Decay | 一括バッチ処理 | 個別計算 |
| Link 生成 | 停止 | 有効 |
| Ghost 処理 | サマリーのみ保持 | 個別追跡 |
| Plankton 拡散 | 簡易計算 | 物理シミュレーション |
| 近傍クエリ | 不可 | 可能 |

### 活性化/非活性化のルール

```typescript
interface VoxelState {
  cellId: string;
  status: "sleep" | "active" | "hot";
  lastAgentPresence: number;  // timestamp
  agentCount: number;
  cooldownTicks: number;      // Active → Sleep までの猶予
}

// 状態遷移
// Sleep → Active: エージェントがセルに入った瞬間
// Active → Hot: エージェントが複数存在、または活発な活動
// Hot → Active: エージェント数が減少
// Active → Sleep: agentCount === 0 が cooldownTicks 継続
```

### Ghost の集約（Sleep 時最適化）

```typescript
// 個別 Ghost を保持する代わりに、セル単位でサマリーを保持
interface GhostSummary {
  totalHeat: number;      // 合計残存熱
  count: number;          // Ghost 数
  avgDecayRate: number;   // 平均減衰率
  dominantTags: string[]; // 主要なタグ（上位3つ）
}

// Active 化時に Ghost を「展開」することも可能（オプション）
```

---

## 3. Vector Quantization（ベクトル量子化）

### 問題

384次元の embedding ベクトル同士のコサイン類似度計算は重い。
数万ノードに対して毎回計算すると、Spatial Hash の恩恵が薄れる。

### 解決策: 2段階フィルタリング

```
┌─────────────────────────────────────────┐
│  Vector Search Pipeline                 │
│                                         │
│  Stage 1: Rough Scan (Hash-based)       │
│  ┌─────────────────────────────────┐    │
│  │ 10,000 candidates               │    │
│  │         ↓ LSH / PQ              │    │
│  │      100 candidates             │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Stage 2: Precise Scan (Cosine)         │
│  ┌─────────────────────────────────┐    │
│  │ 100 candidates                  │    │
│  │         ↓ Cosine Similarity     │    │
│  │      10 results                 │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

### 手法の選択肢

#### A. Locality-Sensitive Hashing (LSH)

```typescript
// ランダムな超平面でベクトル空間を分割
// 同じバケットに入るベクトルは「近い可能性が高い」
interface LSHIndex {
  hashFunctions: number[][];  // ランダム超平面の法線ベクトル
  buckets: Map<string, string[]>;  // hash → nodeIds
}

function computeLSHHash(embedding: number[], planes: number[][]): string {
  return planes.map(plane =>
    dotProduct(embedding, plane) > 0 ? "1" : "0"
  ).join("");
}
```

#### B. Product Quantization (PQ)

```typescript
// 384次元を 192次元 × 8サブベクトルに分割
// 各サブベクトルを256個のセントロイドに量子化
interface PQCodebook {
  subvectorDim: number;     // 192
  numSubvectors: number;    // 8
  centroids: number[][][];  // [8][256][192]
}

function encodePQ(embedding: number[], codebook: PQCodebook): Uint8Array {
  // 各サブベクトルを最近傍セントロイドのインデックスに変換
  // 384次元 → 8バイト に圧縮
}
```

### 推奨: 段階的実装

1. **Phase 4.0**: 量子化なし（小規模テスト）
2. **Phase 4.1**: LSH 導入（中規模）
3. **Phase 4.2**: PQ 導入（大規模本番）

---

## 4. Tick 階層化（計算頻度の分離）

### 概念

すべての処理を同じ頻度で実行するのではなく、「物理現象の重さ」に応じて頻度を変える。

```
時間軸 ─────────────────────────────────────────────→

Agent Tick (100ms)
│ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │

Metabolism Tick (1s)
│         │         │         │         │         │

Pulse Tick (5s)
│                   │                   │

Link Tick (10s)
│                             │

Erosion Tick (60s)
│                                                  │
```

### Tick 種別と処理内容

| Tick 種別 | 間隔 | 処理内容 | 対象 |
|-----------|------|----------|------|
| **Agent** | 100ms | 移動、知覚、行動決定 | Active Voxel のみ |
| **Metabolism** | 1s | Heat Decay、状態遷移 | 全ノード（バッチ） |
| **Pulse** | 5s | 環境信号 broadcast | Global |
| **Link** | 10s | Spectral Link 生成/消滅 | Active Voxel のみ |
| **Erosion** | 60s | Amber → Fossil 退行 | 全 Amber（バッチ） |
| **Compaction** | 300s | Ghost 集約、メモリ最適化 | Sleep Voxel |

### 実装イメージ

```typescript
class TickScheduler {
  private tickCounters = {
    agent: 0,
    metabolism: 0,
    pulse: 0,
    link: 0,
    erosion: 0,
    compaction: 0,
  };

  private intervals = {
    agent: 1,        // 100ms 基準で 1
    metabolism: 10,  // 100ms × 10 = 1s
    pulse: 50,       // 100ms × 50 = 5s
    link: 100,       // 100ms × 100 = 10s
    erosion: 600,    // 100ms × 600 = 60s
    compaction: 3000,// 100ms × 3000 = 300s
  };

  tick(): TickEvents {
    const events: TickEvents = { agent: true };

    for (const [type, interval] of Object.entries(this.intervals)) {
      this.tickCounters[type]++;
      if (this.tickCounters[type] >= interval) {
        events[type] = true;
        this.tickCounters[type] = 0;
      }
    }

    return events;
  }
}
```

---

## 5. データ構造の拡張

### 既存: SpatialField

```typescript
// services/renalCore/src/types/spatial.ts
interface SpatialField {
  cellId: string;
  fertility: number;
  planktonDensity: number;
  activeCount: number;
  ghostSummary: {
    totalHeat: number;
    count: number;
  };
}
```

### 拡張案

```typescript
interface SpatialFieldV2 extends SpatialField {
  // Voxel 状態管理
  voxelState: "sleep" | "active" | "hot";
  lastAgentPresence: number;
  agentIds: Set<string>;

  // 近傍キャッシュ（Active 時のみ有効）
  nodeIndex: {
    byKind: Map<NodeKind, string[]>;
    byHeat: string[];  // heat 降順
  } | null;

  // Vector Index（オプション）
  lshBuckets: Map<string, string[]> | null;
}
```

### 新規: Agent Entity

```typescript
interface SphereAgent {
  // 識別
  id: string;
  name: string;
  createdAt: number;

  // 空間状態
  cellId: string;
  position: [number, number, number];  // セル内ローカル座標
  velocity: [number, number, number];

  // 知覚
  perception: {
    range: number;              // 知覚半径（セル単位）
    semanticBias: number[];     // 興味の embedding
    sensitivity: {
      heat: number;             // 熱い物への感度
      novelty: number;          // 新しい物への感度
      density: number;          // 密集地への感度
    };
  };

  // 記憶
  memory: {
    shortTerm: string[];        // 直近 N 個の訪問ノード
    longTerm: Set<string>;      // 過去に訪問したノード（ブルームフィルタ化可能）
    discoveries: Discovery[];   // 発見した重要情報
  };

  // リソース
  energy: number;               // 行動に消費、休息で回復
  curiosity: number;            // 探索意欲（高いと未知へ向かう）

  // 状態
  state: "exploring" | "investigating" | "resting" | "returning";
  currentTarget: string | null; // 目標ノードID
}

interface Discovery {
  nodeId: string;
  timestamp: number;
  significance: number;
  summary: string;
}
```

---

## 6. API 設計

### 近傍探索 API

```
GET /spatial/nearby
  ?cellId=1:2:0
  &range=1           // 隣接セル数（1=27セル、2=125セル）
  &kind=active,amber // フィルタ
  &limit=100
  &sortBy=heat       // heat | distance | semantic

Response:
{
  "nodes": [...],
  "voxelState": "active",
  "totalInRange": 234
}
```

### Agent API

```
POST /agent/spawn
  { "name": "Explorer-1", "startCellId": "0:0:0" }

GET /agent/:id/perception
  → 現在位置から見えるノード一覧

POST /agent/:id/move
  { "direction": [0.5, 0, 0.3] }  // 正規化済みベクトル

POST /agent/:id/interact
  { "targetNodeId": "xxx", "action": "observe" | "heat" | "link" }

GET /agent/:id/memory
  → エージェントの記憶状態
```

---

## 7. 実装ロードマップ

### Phase 4.0: 基盤整備
- [ ] SpatialFieldV2 型定義
- [ ] Agent 型定義
- [ ] TickScheduler 実装
- [ ] 単体テスト

### Phase 4.1: Voxel 管理
- [ ] Active Voxel 状態管理
- [ ] Sleep/Active 遷移ロジック
- [ ] Ghost 集約処理

### Phase 4.2: Agent 基本動作
- [ ] Agent spawn/despawn
- [ ] 移動ロジック
- [ ] 近傍知覚

### Phase 4.3: Agent 行動
- [ ] 探索アルゴリズム（ランダムウォーク）
- [ ] 目標追跡
- [ ] ノードとのインタラクション

### Phase 4.4: スケーリング
- [ ] LSH インデックス
- [ ] バッチ処理最適化
- [ ] 負荷テスト

### Phase 4.5: LLM 統合（オプション）
- [ ] Agent の「思考」をLLMで生成
- [ ] 発見内容の要約
- [ ] 自律的な目標設定

---

## 8. ホットスポット対策

Spatial Hash と Active Voxel で計算量は大幅に削減されるが、**エージェントが特定セルに集中**した場合、そのセルがボトルネックになる。
この問題に対する3つの対策を設計する。

### 設計原則

> 「制約は世界観として自然に」

- 厳格なルールより、エージェントが「察して」分散する方が効率的
- 混雑情報を可視化し、自主的な譲り合いを促進
- 計算効率と世界観の整合性を両立

---

### 8.1 セル容量制限

特定セルにエージェントが集中しすぎないよう、ソフトリミットを設ける。

```typescript
interface SpatialFieldV2 {
  // ... existing fields

  // 容量管理
  softCapacity: number;      // 推奨上限（例: 50）
  hardCapacity: number;      // 絶対上限（例: 100）
  currentAgentCount: number;
}

// 入場判定
function canEnterCell(agent: Agent, cell: SpatialFieldV2): EnterResult {
  if (cell.currentAgentCount >= cell.hardCapacity) {
    return { allowed: false, reason: "full" };
  }

  if (cell.currentAgentCount >= cell.softCapacity) {
    // ソフトリミット超過: 確率的に拒否
    const overflowRatio = cell.currentAgentCount / cell.hardCapacity;
    if (Math.random() < overflowRatio) {
      return { allowed: false, reason: "crowded" };
    }
  }

  return { allowed: true };
}
```

**世界観**: 「密集地帯は入りにくい」→ 自然な分散効果

---

### 8.2 レーダーリング（知覚の階層化）

すべてのエージェントが毎 tick 精密な知覚を行うとコストが高い。
「広域レーダー」と「近接フォーカス」の2層構造で効率化。

```typescript
interface AgentPerception {
  // 広域レーダー: 低精度、低コスト
  radar: {
    range: 5;              // 5セル先まで
    resolution: "cell";    // セル単位の概要のみ
    updateInterval: 10;    // 10 tick ごと
    data: RadarData[];     // キャッシュ
  };

  // 近接視界: 高精度、高コスト
  focus: {
    range: 1;              // 隣接セルまで
    resolution: "node";    // ノード単位
    updateInterval: 1;     // 毎 tick
  };
}

interface RadarData {
  cellId: string;
  distance: number;
  summary: {
    nodeCount: number;
    avgHeat: number;
    dominantKind: NodeKind;
    congestion: number;    // 混雑度 0.0〜1.0
  };
}
```

```
┌─────────────────────────────────────────┐
│  Agent Perception Layers                │
│                                         │
│        ┌───────────────────┐            │
│        │  Radar (5 cells)  │  低精度    │
│        │   ┌───────────┐   │            │
│        │   │ Focus (1) │   │  高精度    │
│        │   │   [🤖]    │   │            │
│        │   └───────────┘   │            │
│        └───────────────────┘            │
│                                         │
└─────────────────────────────────────────┘
```

**世界観**: 「遠くはぼんやり、近くは鮮明」

---

### 8.3 Focus キューイングと混雑度の可視化

ノードを「精査（deep inspect）」する際、同時アクセスを制限し、待機状態を可視化する。

```typescript
interface FocusQueue {
  nodeId: string;
  currentHolder: string | null;  // 精査中のエージェントID
  holdStartTick: number;
  maxHoldDuration: number;       // 最大占有 tick（例: 5）
  waitingAgents: string[];       // 待機中エージェント
}

// Focus 要求
function requestFocus(agentId: string, nodeId: string): FocusResult {
  const queue = focusQueues.get(nodeId);

  if (!queue) {
    // 初回アクセス: 即座に取得
    focusQueues.set(nodeId, {
      nodeId,
      currentHolder: agentId,
      holdStartTick: currentTick,
      maxHoldDuration: 5,
      waitingAgents: [],
    });
    return { granted: true, position: 0 };
  }

  if (!queue.currentHolder) {
    // 空いている
    queue.currentHolder = agentId;
    queue.holdStartTick = currentTick;
    return { granted: true, position: 0 };
  }

  if (queue.currentHolder === agentId) {
    // 既に保持中
    return { granted: true, position: 0, remaining: queue.maxHoldDuration - (currentTick - queue.holdStartTick) };
  }

  // 待機列に追加
  if (!queue.waitingAgents.includes(agentId)) {
    queue.waitingAgents.push(agentId);
  }
  return { granted: false, position: queue.waitingAgents.indexOf(agentId) + 1 };
}

// 自動解放（tick ごとに呼び出し）
function processFocusQueues(): void {
  for (const queue of focusQueues.values()) {
    if (!queue.currentHolder) continue;

    const elapsed = currentTick - queue.holdStartTick;
    if (elapsed >= queue.maxHoldDuration) {
      // 時間切れ: 次のエージェントへ
      queue.currentHolder = queue.waitingAgents.shift() || null;
      queue.holdStartTick = currentTick;
    }
  }
}
```

**世界観**: 「深く調べるには時間がかかる、他者は待つ」

---

### 8.4 混雑度の伝播と譲り合い

混雑度（Congestion）を Pulse 信号に乗せ、エージェントが「察して」分散する。

```typescript
// PulseSignal に追加
interface PulseSignal {
  a: number;  // Attractant
  r: number;  // Repellent
  d: number;  // Density
  f: number;  // Flow
  c: number;  // Congestion ← 新規追加
}

// 混雑度の計算
function computeCongestion(cell: SpatialFieldV2): number {
  const agentRatio = cell.currentAgentCount / cell.softCapacity;
  const focusContention = countActiveFocusQueues(cell.cellId) / 10;  // 正規化

  return Math.min(1.0, (agentRatio * 0.7) + (focusContention * 0.3));
}
```

### エージェントの判断ロジック

```typescript
interface AgentBehaviorConfig {
  patience: number;        // 0.0〜1.0（高いと混雑を許容）
  curiosity: number;       // 0.0〜1.0（高いと未知を優先）
  socialAwareness: number; // 0.0〜1.0（高いと譲りやすい）
}

// 目的地選択時の混雑考慮
function evaluateDestination(
  agent: Agent,
  targetCell: string,
  congestion: number
): number {
  // 基本スコア（興味度など）
  let score = computeInterestScore(agent, targetCell);

  // 混雑ペナルティ
  const congestionPenalty = congestion * (1.0 - agent.config.patience);
  score *= (1.0 - congestionPenalty);

  // 他エージェントが多い場合、さらにペナルティ
  if (congestion > 0.7 && agent.config.socialAwareness > 0.5) {
    score *= 0.5;  // 「譲る」
  }

  return score;
}

// 結果: 混雑セルへの移動確率が自然に下がる
```

### 効率比較

| 方式 | 1セルに100体が向かった場合 |
|------|---------------------------|
| **厳格キュー** | 100体のキュー管理 × 毎 tick |
| **譲り合い** | 最初の数体が到達、残り90体は自主分散 |

**譲り合いの方が、キュー管理コストを大幅に削減できる。**

---

### 8.5 実装優先度

| 対策 | 優先度 | 理由 |
|------|--------|------|
| セル容量制限 | 高 | シンプル、即効性あり |
| レーダーリング | 高 | 知覚コスト削減に必須 |
| Focus キュー | 中 | ノード精査機能と同時に実装 |
| 混雑度伝播 | 中 | Pulse 拡張として実装可能 |
| 譲り合いロジック | 低 | エージェント行動ロジックと同時に |

---

## 9. エージェント探索行動

エージェントが Sphere 空間をどのように移動し、ノードを評価し、他者の評価に反応するかを設計する。

### 設計原則

> 「エージェントは世界の真実を知らない」

- 知覚は常に不完全で歪んでいる
- 評価は主観であり、集約しても真実にはならない
- 行動は性格と状態の掛け合わせで決まる

---

### 9.1 基本移動パターン

#### ランダムウォーク（意味を持たない唯一の行動）

```typescript
function randomWalk(agent: Agent): Vector3 {
  return normalize([
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
  ]);
}
```

**用途**:
- 初期探索（何も知らない状態）
- フォールバック（判断できない時）
- 社会的圧からの逃避（疲れた時）

#### 勾配追従（風のように感じる）

```typescript
// NG: 直接値を見る（最適化になってしまう）
const exact = cell.heat;

// OK: 量子化 + ノイズ + 遅延
function perceiveHeat(cell: SpatialField, agent: Agent): "low" | "mid" | "high" {
  // 知覚には誤差がある
  const noise = (Math.random() - 0.5) * 0.2;
  const delayed = cell.heatAtTick(currentTick - agent.perception.delay);
  const perceived = delayed + noise;

  // 3段階でしか分からない
  if (perceived < 0.3) return "low";
  if (perceived < 0.7) return "mid";
  return "high";
}

// 方向は確率分布で揺らす
function gradientDirection(agent: Agent): Vector3 {
  const base = computeRoughGradient(agent);
  const wobble = randomUnitVector();
  return normalize(lerp(base, wobble, 0.3));  // 30% ランダム
}
```

**重要**: 勾配は「風」— 感じるが、正確には分からない。

#### 意味的誘引（歪んだ射影）

```typescript
function semanticAttraction(agent: Agent, nodes: SphereNode[]): Vector3 {
  // agent は embedding 全体を知らない
  // 自分の semanticBias という「歪んだレンズ」で見ている
  const attractions = nodes.map(node => {
    const similarity = cosineSimilarity(agent.perception.semanticBias, node.embedding);
    const direction = vectorTo(agent.position, node.coordinates);
    return { direction, weight: similarity };
  });

  return weightedAverage(attractions);
}
```

**重要**: この歪みが、エコーチェンバー・誤解・偏見の土壌になる。

---

### 9.2 ノード評価システム

#### 評価の構造

```typescript
interface NodeEvaluation {
  nodeId: string;
  agentId: string;
  timestamp: number;

  // 評価軸（全て主観）
  relevance: number;      // -1.0〜1.0（自分の興味との関連性）
  quality: number;        // -1.0〜1.0（情報の質）
  novelty: number;        // 0.0〜1.0（新規性）

  // メタ情報（暗黙的評価）
  dwellTime: number;      // 滞在時間（長い = 興味深い）
  revisitCount: number;   // 再訪問回数

  // 評価の信頼性（本人の確信度）
  confidence: number;     // 0.0〜1.0
}
```

#### 暗黙的評価（行動から推測）

```typescript
function inferEvaluation(agent: Agent, node: SphereNode): ImplicitEvaluation {
  return {
    // 滞在時間が長い → 興味深い
    interest: Math.min(1.0, agent.dwellTimeAt(node.id) / 10),

    // 再訪問 → 価値がある
    value: Math.log2(1 + agent.visitCount(node.id)) / 5,

    // すぐ離れた → 関係ない or 低品質
    rejection: agent.dwellTimeAt(node.id) < 2 ? 0.5 : 0,
  };
}
```

#### 評価の集約（必ず劣化する）

```typescript
function aggregateEvaluations(evals: NodeEvaluation[]): AggregatedEvaluation {
  const raw = average(evals.map(e => e.quality));
  const uncertainty = standardDeviation(evals.map(e => e.quality));

  return {
    value: raw * 0.8,  // 集約で20%失われる（真実には近づかない）
    uncertainty,
    evaluatorCount: evals.length,
    freshness: Math.max(...evals.map(e => e.timestamp)),
  };
}
```

---

### 9.3 他者評価の知覚

#### 知覚の範囲と精度

```typescript
interface EvaluationPerception {
  // 広域: 集約評価のみ見える
  radar: {
    range: 5;
    sees: "aggregated";  // avgQuality, evaluatorCount のみ
  };

  // 近接: 個別評価も見える
  focus: {
    range: 1;
    sees: "detailed";    // 誰がどう評価したか
  };
}
```

#### 評価フィールド

```typescript
interface EvaluationField {
  nodeId: string;

  // 集約された評価
  aggregated: AggregatedEvaluation;

  // 個別評価（信頼するエージェントのみ）
  trusted: NodeEvaluation[];

  // 評価の「温度」（最近の評価活動量）
  activityHeat: number;
}
```

---

### 9.4 行動タイプと状態による揺らぎ

#### 基本タイプ

| タイプ | 特性 | 強み | 弱み |
|--------|------|------|------|
| **Follower** | 高評価ノードに向かう | 効率的、安全 | 独創性なし |
| **Pioneer** | 未評価ノードを探す | 新発見の可能性 | 非効率 |
| **Critic** | 評価が分かれているノードへ | 品質担保 | 速度が遅い |
| **Trust-based** | 信頼するエージェントに追従 | 社会的学習 | エコーチェンバー |

#### 状態による揺らぎ

```typescript
interface AgentState {
  fatigue: number;         // 0.0〜1.0（高いと random 寄り）
  boredom: number;         // 0.0〜1.0（高いと pioneer 寄り）
  recentSameEvals: number; // 同じような評価が続いた回数
}

function decideAction(agent: Agent, context: Context): Action {
  const baseType = agent.personality.type;
  let effectiveType = baseType;

  // 疲れた → どうでもいい
  if (agent.state.fatigue > 0.7) {
    effectiveType = "random";
  }

  // 飽きた → 新しい場所へ
  if (agent.state.boredom > 0.6 || agent.state.recentSameEvals > 5) {
    effectiveType = "pioneer";
  }

  return behaviors[effectiveType](agent, context);
}
```

**重要**: 同じ Follower でも日によって違う — 硬直しない。

---

### 9.5 評価の伝播と群知能

#### フェロモン的残香

```typescript
function decayEvaluations(field: EvaluationField, elapsed: number): void {
  const decayRate = 0.95;
  field.aggregated.value *= Math.pow(decayRate, elapsed);
  field.activityHeat *= Math.pow(decayRate, elapsed);

  // 古い個別評価を削除
  field.trusted = field.trusted.filter(e =>
    Date.now() - e.timestamp < 3600000  // 1時間
  );
}
```

**重要**: 評価は永遠に残らない — スフィアの decay 哲学と一致。

#### 創発的群知能

```
┌────────────────────────────────────────────┐
│  Emergent Swarm Behavior                   │
│                                            │
│  [Pioneer] ──発見──→ [Node X]              │
│      │                    ↑                │
│      └──評価を残す────────┘                │
│                           │                │
│  [Follower A] ←──知覚─────┤                │
│  [Follower B] ←──知覚─────┘                │
│      │                                     │
│      └──→ Node X に集合                    │
│           │                                │
│           └──→ 混雑度上昇                  │
│                 │                          │
│  [Follower C] ──知覚──→ 「混んでる」       │
│      │                                     │
│      └──→ 別の場所を探す                   │
│                                            │
│  結果: 中央制御ゼロで秩序が生まれる        │
└────────────────────────────────────────────┘
```

---

## 10. スフィア哲学: 設計制約

エージェントシステムがスフィアの世界観を壊さないための原則。

### 10.1 知覚の曖昧化

> 「エージェントは世界の真値を知らない」

| 項目 | NG | OK |
|------|----|----|
| Heat | `cell.heat` (正確な値) | `perceiveHeat()` → "low"/"mid"/"high" |
| 方向 | 最急勾配 | 勾配 + 30%ノイズ |
| 評価 | 他者の正確な評価値 | 集約値（劣化済み） |

```typescript
// 知覚の3原則
interface PerceptionPrinciples {
  quantization: true;   // 連続値 → 離散段階
  noise: 0.1 ~ 0.3;     // 常にノイズを含む
  delay: 1 ~ 5;         // 過去の状態を見ている
}
```

### 10.2 評価の非真実性

> 「集約しても真実には近づかない」

```typescript
// 集約時は必ず劣化
function aggregate(evals: Evaluation[]): AggregatedEvaluation {
  return {
    value: average(evals) * 0.8,  // 20%失われる
    uncertainty: stddev(evals),    // 不確実性は消えない
  };
}

// 時間経過でも劣化
function decay(agg: AggregatedEvaluation, ticks: number): void {
  agg.value *= Math.pow(0.95, ticks);
  agg.uncertainty += 0.01 * ticks;  // 不確実性は増える
}
```

**理由**: 評価が「真実」になると、世界がランキングサイト化する。

### 10.3 行動の非決定性

> 「数値は方向付け、決定は内面」

```typescript
function evaluateDestination(
  agent: Agent,
  cell: string,
  agg: AggregatedEvaluation
): number {
  let score = agent.computeInterest(cell);

  // 高評価は「気になる」程度の影響（決定打ではない）
  if (agg.value > 0.7) {
    score *= 1.1;  // 10% ブーストのみ
  }

  // 不確実性が高いと逆に興味が湧く（好奇心）
  if (agg.uncertainty > 0.3 && agent.personality.curiosity > 0.5) {
    score *= 1.2;
  }

  // 最終決定は agent の状態次第
  score *= (1.0 - agent.state.fatigue * 0.5);

  return score;
}
```

### 10.4 設計チェックリスト

実装時に確認すべき項目:

- [ ] 正確な数値を直接参照していないか？
- [ ] 集約時に情報が失われているか？
- [ ] 時間経過で評価が劣化するか？
- [ ] エージェントの状態が行動に影響するか？
- [ ] 同じ入力でも異なる結果が出る余地があるか？

---

## 11. 参考資料

### アルゴリズム
- [Spatial Hashing](https://en.wikipedia.org/wiki/Spatial_hashing)
- [Locality-Sensitive Hashing](https://en.wikipedia.org/wiki/Locality-sensitive_hashing)
- [Product Quantization](https://lear.inrialpes.fr/pubs/2011/JDS11/jegou_searching_with_quantization.pdf)

### 関連ドキュメント
- [docs/terminology.md](../docs/terminology.md) - Sphere 用語集
- [reports/PHASE3.2_PULSE_OBSERVATORY_MEMO.md](./PHASE3.2_PULSE_OBSERVATORY_MEMO.md) - Pulse システム

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-01-30 | 初版作成（設計段階） |
| 2026-01-30 | セクション8「ホットスポット対策」追加（容量制限、レーダーリング、Focusキュー、譲り合い） |
| 2026-01-30 | セクション9「エージェント探索行動」追加（移動パターン、評価システム、社会的知覚、群知能） |
| 2026-01-30 | セクション10「スフィア哲学: 設計制約」追加（曖昧化、非真実性、非決定性） |
| 2026-02-01 | ステータスを「将来検討」に変更 |
| 2026-02-01 | Agent Tick を 30ms に決定、ステップ累積モデル採用 |

---

## 11. Agent Tick 設計（2026-02-01 追記）

### Tick 間隔の決定

```
Agent 内部 Tick: 30ms（確定）
RenalCore Tick: 1000ms（既存）
```

### ステップ累積モデル

```
Agent Tick (30ms) ─┬─ 移動計算
                   ├─ 知覚処理
                   └─ 内部状態更新
                          │
                          │ ステップ累積（バッファ）
                          │
                          ▼
              ノード遷移イベント発火
                          │
                          ▼
              Node metrics 更新
              ├─ traversal++
              ├─ stayTime += 累積値
              └─ h += heat
```

### 設計原則

| 原則 | 説明 |
|-----|-----|
| **イベント駆動** | metrics 更新はノード遷移時のみ |
| **累積方式** | stayTime は滞在中に累積、遷移時に反映 |
| **renalCore 非依存** | Agent Tick は renalCore Tick と完全独立 |
| **閾値安定性** | Tick 頻度が変わっても metrics の意味は不変 |

### コンフィグ

```json
"agent": {
  "tickIntervalMs": 30,
  "metricsUpdate": {
    "mode": "event_driven",
    "stayTimeUnit": "ms"
  }
}
```

---

## 12. HNSW 導入メモ（2026-02-01 追記）

### 現状

- `IProjectionRepository.queryNearby()` インターフェース定義済み
- `MapProjectionRepository` が O(n) 開発実装を提供
- pgvector は PostgreSQL に既にインストール済み

### 導入時の作業

```sql
-- DDL 1行
CREATE INDEX ON nodes USING hnsw (position vector_cosine_ops);
```

```typescript
// Repository 差し替え
const projectionRepo = new PostgresHnswRepository(pgClient);
```

### 保留の理由

- 現在のノード規模（< 10,000）では O(n) で十分
- 抽象化レイヤーが整備済みのため、必要時に即座に導入可能
- 開発フェーズではシンプルさを優先

### 導入トリガー

以下の条件で導入を検討:

1. ノード数 > 10,000
2. Agent queryNearby のレイテンシ > 50ms
3. Agent 同時接続数 > 100
