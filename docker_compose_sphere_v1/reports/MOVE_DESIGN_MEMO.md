# Agent Move Design Memo

**作成日**: 2026-01-31
**更新日**: 2026-01-31
**ステータス**: 設計確定（384次元対応版）

---

## 1. 次元数の確認

```typescript
// periphery/src/types/config.ts
parser: {
  vectorDimension: 384,  // all-MiniLM-L6-v2 default
  modelId: "Xenova/all-MiniLM-L6-v2",
}
```

| 項目 | 値 |
|------|-----|
| 実際のモデル | `Xenova/all-MiniLM-L6-v2` |
| 次元数 | **384** |
| 実行方式 | ローカル（API禁止） |

※ sphere_node.ts のコメント `1536-dim` は推奨値。実装は 384次元。

---

## 3. 二層構造アーキテクチャ

### 核心思想

```
┌─────────────────────────────────────────────────────────────┐
│  Sphere は「完全な世界」を持っているが、                       │
│  エージェントは常に不完全にしか知覚できない                     │
└─────────────────────────────────────────────────────────────┘
```

### 構造

```
┌─────────────────────────────────────────────────────────────┐
│  知覚層（エージェント視点）                                    │
├─────────────────────────────────────────────────────────────┤
│  • 量子化された情報のみ                                       │
│  • ノイズが混入                                               │
│  • 方向は知覚できない（384次元は認知不能）                     │
│  • signature（目印）で対象を識別                              │
└─────────────────────────────────────────────────────────────┘
                          ↕ 変換
┌─────────────────────────────────────────────────────────────┐
│  計算層（システム視点）                                        │
├─────────────────────────────────────────────────────────────┤
│  • 384次元ベクトルで正確に計算                                │
│  • コサイン距離による類似度                                   │
│  • 引力ベクトルの合成                                         │
│  • 連続的な座標更新                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 設計制約

### 禁止事項

| 項目 | 理由 |
|------|------|
| エージェントによるベクトル計算 | 384次元は知覚不能 |
| direction の直接返却 | 3次元方向は384次元空間に存在しない |
| ID の直接指定（初期状態） | ID の共有手段がない |
| toward: keyword（Embedding計算） | 高コスト、世界観に反する |

### 許可事項

| 項目 | 説明 |
|------|------|
| 引力による移動 | heat × weight / distance²（内部計算） |
| scan() による近傍探索 | 距離・熱量（量子化）+ signature |
| focus() 後の ID 取得 | 接触して初めて ID が判明 |

---

## 5. scan() の出力形式（確定版）

```typescript
interface ScanResult {
  // ❌ direction は返さない（384次元は知覚不能）
  // direction: [number, number, number];  ← 削除

  // 距離（量子化）- コサイン距離から変換
  distance: "near" | "mid" | "far";

  // 熱量（量子化 + ノイズ）
  heat: "low" | "mid" | "high";

  // 種別
  kind: NodeKind;

  // 一時識別子（セッション内のみ有効）
  signature: number;

  // [将来用] センサー精度（未実装）
  confidence?: "weak" | "normal" | "strong";
}
```

### 設計意図

```
「あっちに熱いものがある」 ❌
「signature 42 は熱い」    ✅

→ 空間は感じられないが、存在は感じられる
→ 方向ではなく「気配」で移動する
```

### 量子化閾値

```typescript
// コサイン距離 → 量子化距離
function quantizeDistance(cosineDist: number): QuantizedDistance {
  if (cosineDist < 0.15) return "near";   // 類似度 > 0.85
  if (cosineDist < 0.40) return "mid";    // 類似度 0.60-0.85
  return "far";                            // 類似度 < 0.60
}

// heat → 量子化熱量
function quantizeHeat(heat: number): QuantizedHeat {
  if (heat < 0.3) return "low";
  if (heat < 0.7) return "mid";
  return "high";
}

// 量子化値 → 計算用数値
const DISTANCE_VALUES = { near: 1, mid: 3, far: 7 };
const HEAT_VALUES = { low: 0.2, mid: 0.5, high: 0.9 };
```

---

## 6. 知覚の原則

```
┌─────────────────────────────────────────────────────────────┐
│  エージェントが知る情報                                       │
├─────────────────────────────────────────────────────────────┤
│  ✅ 距離感（near/mid/far）                                   │
│  ✅ 熱量感（low/mid/high）                                   │
│  ✅ 種別（amber/active/ghost...）                            │
│  ✅ 一時的な目印（signature）                                 │
├─────────────────────────────────────────────────────────────┤
│  ❌ エージェントが知らない情報                                │
├─────────────────────────────────────────────────────────────┤
│  ❌ 方向（384次元空間に「あっち」はない）                     │
│  ❌ 正確な vector 座標                                        │
│  ❌ 正確な heat/weight 数値                                   │
│  ❌ node ID（focus するまで）                                 │
│  ❌ payload 内容（focus するまで）                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. move() 方式

### 方式概要

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 0: drift（力学的移動）← 主役                          │
│  ─────────────────────────────────────────────────────────  │
│  Layer 1: toward signature（目印追跡）← 補助                 │
│  ─────────────────────────────────────────────────────────  │
│  Layer 2: toNode（記憶からの再訪問）← 制限付き               │
└─────────────────────────────────────────────────────────────┘
```

### 型定義

```typescript
type MoveIntent =
  | { drift: DriftMode }
  | { toward: number }           // scan() で得た signature
  | { toNode: string }           // focus() 済みノードのみ
  | { path: string[] };          // focus() 済みノードの連続

type DriftMode =
  | "attract"    // 熱い方へ
  | "repel"      // 熱い方から離れる
  | "wander"     // ランダム
  | "inertia";   // 慣性維持

interface MoveResult {
  success: boolean;
  newVector: number[];           // 384次元（内部用）
  newCellId: string;
  usedFallback?: boolean;
  warning?: string;
}
```

---

## 8. Layer 0: drift（意味物理）

### 概念

エージェントは「意味場の流れ」に身を任せる。
明示的な目標なしに、熱量と重みの引力に従って移動する。

### 計算モデル（384次元）

```typescript
function computeDrift(
  agentVector: number[],           // 384次元
  nearbyNodes: NodeWithVector[],   // 384次元 vector を持つ
  mode: DriftMode
): number[] {                      // 384次元の移動ベクトル

  if (mode === "wander") {
    return randomUnitVector384();
  }

  if (mode === "inertia") {
    return agent.velocityVector;   // 384次元
  }

  // 引力計算（384次元空間）
  const forces = nearbyNodes.map(node => {
    // 相対ベクトル（384次元）
    const relativeVec = subtract(node.vector, agentVector);

    // コサイン距離 → 量子化距離
    const cosineDist = cosineDistance(agentVector, node.vector);
    const distValue = DISTANCE_VALUES[quantizeDistance(cosineDist)];

    // 熱量 → 量子化熱量
    const heatValue = HEAT_VALUES[quantizeHeat(node.metrics.h)];

    // 引力の大きさ（意味空間の万有引力）
    const magnitude = heatValue / (distValue * distValue);

    // 方向ベクトル（正規化済み384次元）
    const direction = normalize(relativeVec);

    return scale(direction, mode === "repel" ? -magnitude : magnitude);
  });

  // 合成（384次元）
  const netForce = sumVectors(forces);

  // 慣性を加味
  const inertia = scale(agent.velocityVector, 0.3);

  // ノイズを加味（世界観: 不確実性）
  const noise = scale(randomUnitVector384(), 0.1);

  // 合成して正規化
  return normalize(add(netForce, inertia, noise));
}
```

### 引力の計算式

```
force = Σ (heat_i / distance_i²) × direction_i

ただし:
  - heat は量子化値（0.2 / 0.5 / 0.9）
  - distance は量子化値（1 / 3 / 7）
  - direction は 384次元の正規化ベクトル
  - 計算は内部で行い、エージェントには見せない
```

---

## 9. Layer 1: toward signature（目印追跡）

### 概念

scan() で発見した「目印」に向かって移動する。
signature はセッション内でのみ有効な一時識別子。

### フロー

```
scan() → ScanResult[] を取得
         ↓
「signature: 42 は熱い、行きたい」
         ↓
move({ toward: 42 })
         ↓
signature → vector を解決（内部）
         ↓
384次元空間で方向計算
         ↓
その方向へ移動（1ステップ）
```

### 実装（384次元対応）

```typescript
function moveTowardSignature(
  agent: SphereAgent,
  signature: number,
  signatureCache: Map<number, SignatureEntry>
): MoveResult {

  const target = signatureCache.get(signature);

  if (!target) {
    // signature が無効（期限切れ or 存在しない）
    // → drift にフォールバック
    return executeDrift(agent, "attract");
  }

  // 目標方向へ移動（384次元）
  const direction = normalize(subtract(target.vector, agent.vector));
  const step = scale(direction, agent.moveSpeed);
  const newVector = normalize(add(agent.vector, step));

  return {
    success: true,
    newVector,
    newCellId: vectorToCellId(newVector),
    movedToward: signature
  };
}
```

### signature の特性

```typescript
interface SignatureEntry {
  signature: number;
  vector: number[];              // 384次元（内部用）
  distance: QuantizedDistance;   // エージェント用
  heat: QuantizedHeat;           // エージェント用
  kind: NodeKind;
  createdAt: number;             // tick
  validFor: number;              // 有効期間（tick数）
}

// 特性
// - エージェントごとに異なる（主観的な目印）
// - 5-10 tick で期限切れ
// - 移動すると相対位置が変わる（再 scan 推奨）
// - node ID は含まない
// - vector は内部でのみ使用
```

---

## 10. Layer 2: toNode（記憶からの再訪問）

### 概念

focus() したノードの ID を記憶し、後で再訪問できる。
ただし、ID は focus() するまで不明。

### 制限

```
┌─────────────────────────────────────────────────────────────┐
│  toNode が使える条件                                         │
├─────────────────────────────────────────────────────────────┤
│  1. 過去に focus() したノードであること                       │
│  2. エージェントの memory に ID が記録されていること           │
│  3. ノードがまだ存在すること（蒸発していない）                 │
└─────────────────────────────────────────────────────────────┘
```

### フロー

```
[初回訪問]
scan() → signature 42 を発見（熱い）
         ↓
move({ toward: 42 }) × 数回
         ↓
接触判定（distance === "near"）
         ↓
focus() → node ID "abc123" が判明
         ↓
memory に保存: { id: "abc123", vector: [...] }

[再訪問]
move({ toNode: "abc123" })
         ↓
memory から vector を取得
         ↓
384次元空間で方向計算
         ↓
その方向へ移動
```

---

## 11. 移動の実行

```typescript
function executeMove(
  agent: SphereAgent,
  intent: MoveIntent,
  stepSize: number = 0.05  // コサイン距離での移動量
): MoveResult {

  let direction: number[];  // 384次元

  if ("drift" in intent) {
    direction = computeDrift(agent.vector, getNearby(agent), intent.drift);
  }
  else if ("toward" in intent) {
    const target = resolveSignature(intent.toward);
    if (!target) {
      // フォールバック: 失敗しても世界は続く
      direction = computeDrift(agent.vector, getNearby(agent), "attract");
    } else {
      direction = normalize(subtract(target.vector, agent.vector));
    }
  }
  else if ("toNode" in intent) {
    const target = lookupNode(intent.toNode);
    if (!target) {
      // フォールバック: 紛失しても漂流できる
      direction = computeDrift(agent.vector, getNearby(agent), "attract");
    } else {
      direction = normalize(subtract(target.vector, agent.vector));
    }
  }
  else {
    return { success: false, warning: "unknown intent" };
  }

  // 新しい位置（384次元）
  const newVector = add(agent.vector, scale(direction, stepSize));

  // 正規化（単位球面上に留まる）
  return {
    success: true,
    newVector: normalize(newVector),
    newCellId: vectorToCellId(newVector)
  };
}
```

---

## 12. 優先順位とフォールバック

```
move(intent)
    │
    ├─ toNode? ─────→ memory に存在する？
    │                      │
    │                 Yes  │  No
    │                  ↓   │   ↓
    │              移動実行 │  drift へ
    │                      │
    ├─ toward? ─────→ signature 有効？
    │                      │
    │                 Yes  │  No
    │                  ↓   │   ↓
    │              方向移動 │  drift へ
    │                      │
    ├─ drift? ──────→ 力学移動（常に成功）
    │
    └─ else ────────→ no-op
```

### フォールバックの意義

```
失敗しても世界が続く
エージェントが壊れない
紛失しても漂流できる

→ Sphere の「死なない設計」
```

---

## 13. ID 共有問題の解決策

### ID の取得経路

```
┌─────────────────────────────────────────────────────────────┐
│  ID の取得経路                                               │
├─────────────────────────────────────────────────────────────┤
│  1. focus() による取得（主経路）                              │
│     scan() → 接近 → focus() → ID 判明                        │
│                                                              │
│  2. 帰還カプセルの nodeId（間接経路）                         │
│     他エージェントが持ち帰った情報を外部で共有                │
│     → 次回セッションで toNode 使用可能                        │
│                                                              │
│  3. Amber Showcase（初期経路）                                │
│     セッション開始時に主要 Amber の ID を提示                  │
│     → チュートリアル的な使用                                  │
└─────────────────────────────────────────────────────────────┘
```

### Amber Showcase

```typescript
// セッション開始時に提供
interface SessionStart {
  initialVector: number[];       // 384次元
  amberShowcase: AmberInfo[];    // ID を含む
  rulebook: AgentRulebook;
}

interface AmberInfo {
  id: string;                    // ここで ID を知る
  summary: string;
  heat: QuantizedHeat;
  // approximateDirection は廃止（384次元に方向はない）
}
```

---

## 14. 設計原則（確定版）

| 原則 | 説明 |
|------|------|
| **次元は隠蔽** | エージェントは 384次元を知覚しない |
| **signature が目印** | 方向ではなく「何に向かうか」で移動 |
| **内部は高次元** | システムは 384次元で正確に計算 |
| **表層は量子化** | heat/distance のみ量子化して提示 |
| **ID は稼ぐもの** | focus() するまで不明 |
| **drift が主役** | 明示的目標なしでも移動可能 |
| **フォールバック** | 失敗 → drift へ自動降格 |

### Sphere 世界観との整合

```
全知は禁忌（Rulebook と一致）
学習は必ず仮説的
Amber は「残った奇跡」

→ 完全に整合
```

---

## 15. レイヤー構成

| Layer | 方式 | コスト | 用途 |
|-------|------|--------|------|
| 0 | drift | 最低 | 探索、流れに身を任せる |
| 1 | toward signature | 低 | scan で見つけた目標を追跡 |
| 2 | toNode | 中 | 既知ノードへの再訪問 |

---

## 16. scan 探索範囲

### 384次元空間での「範囲」

```
┌─────────────────────────────────────────────────────────────┐
│  3次元: 半径 r の球                                          │
│  384次元: コサイン距離 < threshold の超球面                   │
└─────────────────────────────────────────────────────────────┘
```

### ScanConfig

```typescript
interface ScanConfig {
  // 基本探索範囲（コサイン距離）
  baseRange: number;           // default: 0.4

  // 熱量による範囲拡張（熱いものは遠くても感じる）
  heatBoost: {
    low: number;               // default: 0.0 (拡張なし)
    mid: number;               // default: 0.1
    high: number;              // default: 0.2
  };

  // 最大取得数（計算コスト制限）
  maxResults: number;          // default: 20

  // 最小熱量（冷たすぎるノードは無視）
  minHeat: number;             // default: 0.1
}
```

### 探索ロジック

```typescript
function scan(
  agentVector: number[],
  allNodes: SphereNode[],
  config: ScanConfig
): ScanResult[] {
  const candidates: Array<{ node: SphereNode; dist: number }> = [];

  for (const node of allNodes) {
    // 冷たすぎるノードはスキップ
    if (node.metrics.h < config.minHeat) continue;

    const dist = cosineDistance(agentVector, node.vector);

    // 熱量で範囲をブースト
    const heatLevel = quantizeHeat(node.metrics.h);
    const effectiveRange = config.baseRange + config.heatBoost[heatLevel];

    if (dist <= effectiveRange) {
      candidates.push({ node, dist });
    }
  }

  // 距離でソート、上位 maxResults 件
  candidates.sort((a, b) => a.dist - b.dist);
  const results = candidates.slice(0, config.maxResults);

  // ScanResult に変換（量子化 + signature 付与）
  return results.map((c, i) => toScanResult(c, i));
}
```

### 世界観との整合

```
┌─────────────────────────────────────────────────────────────┐
│  熱いものは遠くても「感じる」                                 │
│  冷たいものは近くても「見えない」                             │
│  完璧な探索は禁忌（maxResults で打ち切り）                    │
└─────────────────────────────────────────────────────────────┘
```

| 現象 | 実装 |
|------|------|
| 熱源が遠くても引き寄せられる | heatBoost で範囲拡張 |
| 冷たいノードは気づかない | minHeat でフィルタ |
| 見落としがある | maxResults で打ち切り |
| 近くは詳しく見える | 距離でソートして近い順 |

### 計算コスト対策

```typescript
// 最適化版: Active Voxel と連携
function scanOptimized(
  agent: SphereAgent,
  voxelIndex: VoxelIndex,
  config: ScanConfig
): ScanResult[] {
  // 1. 自セル + 隣接セルのノードのみ取得
  const nearbyNodes = voxelIndex.getNodesInRange(agent.cellId, 1);

  // 2. hot セルのノードを追加（遠くても熱いものは感じる）
  const hotNodes = voxelIndex.getHotCellNodes();

  // 3. 重複除去して scan
  const candidates = [...new Set([...nearbyNodes, ...hotNodes])];

  return scan(agent.vector, candidates, config);
}
```

### デフォルト値

```typescript
const DEFAULT_SCAN_CONFIG: ScanConfig = {
  baseRange: 0.4,              // コサイン距離 0.4 以内
  heatBoost: {
    low: 0.0,
    mid: 0.1,
    high: 0.2,                 // 熱いノードは 0.6 まで見える
  },
  maxResults: 20,
  minHeat: 0.1,
};
```

---

## 17. moveBatch（バッチ移動）

### 発想の転換

```
┌─────────────────────────────────────────────────────────────┐
│  エージェント: 今すぐ向かいたい                               │
│  Sphere: 無駄な再計算はしたくない                            │
│                                                              │
│  move = 即時実行  ❌                                         │
│  move = intent の蓄積  ✅                                    │
└─────────────────────────────────────────────────────────────┘
```

### エージェント側（体験）

```typescript
// 「5回分まとめて」進む
ctx.move({ toward: sig, steps: 5 });

// エージェント的には「一気に進んだ」感覚
```

### Sphere 側（処理）

```typescript
function executeMoveBatch(
  agent: SphereAgent,
  intent: MoveIntent & { steps?: number }
): MoveResult {
  // 384次元解決は 1 回だけ
  const direction = resolveOnce(intent);
  const steps = intent.steps ?? 1;

  const totalStep = steps * BASE_STEP_SIZE;

  // 正規化も 1 回
  agent.vector = normalize(
    add(agent.vector, scale(direction, totalStep))
  );

  return {
    success: true,
    newVector: agent.vector,
    stepsExecuted: steps,
  };
}
```

### 物理的な正当化

```
これはズルじゃない。

解釈：
  同じ意図を連続で持った
  途中で世界を「見ていない」
  だから世界も細かく反応しない

＝ 高速移動中は視野が狭い

現実でも同じ。
```

### トレードオフ

| 失うもの | 得るもの |
|----------|----------|
| 途中の微細な引力変化 | レイテンシ激減 |
| 偶然の発見 | 体験がキビキビ |
| エコーやフォーカス波紋 | 意図が素直に通る |

### 探索フェーズと移動フェーズの分離

```
┌─────────────────────────────────────────────────────────────┐
│  探索フェーズ                                                │
│    scan() → 周囲を感じる                                    │
│    drift({ mode: "wander" }) → 1 step ずつ慎重に            │
│    → 発見重視、細かく反応                                   │
├─────────────────────────────────────────────────────────────┤
│  移動フェーズ                                                │
│    move({ toward: sig, steps: 5 }) → バッチ移動             │
│    → 目標明確、効率重視                                     │
└─────────────────────────────────────────────────────────────┘
```

### 計算量比較

```
従来（steps = 5 を個別実行）:
  resolveDirection() × 5
  normalize() × 5
  DB lookup × 5
  = O(5n)

moveBatch（steps = 5 をまとめて）:
  resolveDirection() × 1
  normalize() × 1
  DB lookup × 1
  = O(n)

→ 5倍の効率化
```

---

## 18. 次元非依存設計（重要）

### 原則

```
┌─────────────────────────────────────────────────────────────┐
│  embedding モデル乗せ換え時に書き換え不要な設計にすること      │
└─────────────────────────────────────────────────────────────┘
```

### 次元依存 vs 次元非依存

| 部分 | 依存性 | 対応 |
|------|--------|------|
| ベクトル演算（add, subtract, normalize） | **非依存** | 任意長配列で動作 |
| コサイン距離計算 | **非依存** | 任意次元で動作 |
| 引力計算式 | **非依存** | 距離と熱量のスカラー計算 |
| `randomUnitVector()` | **パラメータ化必須** | `dim` 引数を取る |
| 量子化閾値 | **config化必須** | モデル依存の可能性 |

### randomUnitVector の実装

```typescript
// ❌ 次元ハードコード禁止
function randomUnitVector384(): number[] { ... }

// ✅ 次元パラメータ化
function randomUnitVector(dim: number): number[] {
  const vec = Array.from({ length: dim }, () => Math.random() - 0.5);
  return normalize(vec);
}
```

### MoveConfig（量子化閾値の外部化）

```typescript
interface MoveConfig {
  // 次元数（embeddingProvider から取得）
  vectorDimension: number;

  // 量子化閾値（モデル依存）
  distanceThresholds: {
    near: number;   // default: 0.15
    mid: number;    // default: 0.40
  };

  heatThresholds: {
    low: number;    // default: 0.3
    mid: number;    // default: 0.7
  };

  // 引力計算パラメータ
  physics: {
    inertiaWeight: number;    // default: 0.3
    noiseWeight: number;      // default: 0.1
    stepSize: number;         // default: 0.05
  };
}
```

### 閾値調整が必要な理由

```
モデルによってコサイン距離の分布が異なる

all-MiniLM-L6-v2 (384dim):
  類似テキスト間の距離: 0.05-0.20

text-embedding-ada-002 (1536dim):
  類似テキスト間の距離: 0.10-0.30

→ 閾値を固定すると「near」の感覚がズレる
→ config で調整可能にしておく
```

---

## 19. 次のステップ

- [x] scan() の出力形式を確定（direction 削除）
- [x] 384次元対応の drift 計算を設計
- [x] 次元非依存設計の注意書きを追加
- [x] scan 探索範囲の設計（ScanConfig + heatBoost）
- [x] moveBatch 設計（intent 蓄積、バッチ実行）
- [x] signature の有効期限設計（時間 + 移動距離の二重減衰）
- [x] MoveConfig の実装（力学パラメータ + 量子化閾値）
- [ ] tick 依存性の設計（RenalCore 同期、velocity 減衰）
- [ ] heat フィードバックの設計（congestion 減衰、repel 切替）
- [ ] focus() の接触判定閾値を設計（コサイン距離ベース）
- [ ] memory のデータ構造を設計
- [ ] Amber Showcase の実装
- [ ] confidence フィールドの実装（将来）

---

## 20. 実装ファイル

### periphery/src/lib/vector.ts
次元非依存のベクトル演算ユーティリティ。
- `cosineDistance`, `normalize`, `add`, `subtract`, `scale`
- `randomUnitVector(dim)`, `lerp`, `weightedSum`

### periphery/src/types/movement.ts
移動関連の型定義。
- `MoveIntent` (drift / toward / toNode)
- `ScanResult`, `ScanConfig`, `MoveConfig`
- `SignatureEntry` (一時識別子)

### periphery/src/gateway/move.ts
移動ロジック本体。
- `SignatureRegistry` - signature の生成・解決・有効期限管理
- `scan()` - 周囲探索（heatBoost, maxResults）
- `calculateDrift()` - 引力計算 + ノイズ
- `executeMove()` - moveBatch 対応
- `AgentMovementState` - エージェント状態管理

### periphery/src/gateway/sphere-context.ts（変更）
- `AgentMovementState` 統合
- `scan()` メソッド追加
- `move()` を新システム対応 + レガシー互換維持

---

---

## 21. 設計 vs 実装のギャップ (2026-02-02 検証)

### 検証内容

explore-agent に move() テストを追加し、move() が sense() 結果に影響するか検証した。

```
[Tutorial] 🧪 MOVE TEST: Does move() change what we sense?
[Tutorial]   Before move - sensed 3 nodes
[Tutorial]   Node IDs: b8bb4761, f0a2586a, 1d8b2b1a
[Tutorial]   Moving dx=50, dy=50, dz=50...
[Tutorial]   Move result: position=(57.9, 45.6, 49.8)  ← 3D位置は更新
[Tutorial]   After move - sensed 3 nodes
[Tutorial]   Node IDs: b8bb4761, f0a2586a, 1d8b2b1a  ← 完全に同じ！
[Tutorial]   ⚠️ SAME NODE SET - move() does NOT affect sense() (fake movement)
```

### 発見された問題

| 設計 | 現状の実装 |
|------|-----------|
| move() → 384D `_embeddingVector` 更新 | move() → 3D `_position` のみ更新 |
| sense() → 移動後は異なるノード発見 | sense() → 常に初期位置から検索 |
| scan() → signature + 量子化距離/熱量 | sense() → nodeId 直接公開 |
| ID は focus() するまで不明 | sense() 結果に ID 含まれる |

### 現状の位置管理構造

```typescript
// SphereContextImpl（現状）
class SphereContextImpl {
  private _embeddingVector: number[];  // 384D - sense() が使用
  private _position: Vector;           // 3D - move() が更新
  // ↑ 2つが分離している！
}
```

### 段階的修正計画

| 段階 | 内容 | 効果 | 状態 |
|------|------|------|------|
| 🅲 | focus() を sense() 結果に限定 | 見えないノードに触れない | ✅ 完了 |
| 🅱 | move(dx,dy,dz) 廃止、warp(nodeId) 導入 | シンプル、設計と整合 | 🔜 次 |
| 🅰 | 384D で本当に動かす | 完全な空間移動 | 📋 将来 |

### 🅱案: warp ベースへの移行

```typescript
// 現状の API
sense() → NearbyNode[] (nodeId 直接公開)
focus(nodeId) → NodeDetail
move({ dx, dy, dz }) → 3D のみ更新（fake）

// 提案 API
sense() → NearbyNode[] (nodeId 直接公開のまま - 変更なし)
focus(nodeId) → NodeDetail
warp(nodeId) → 対象ノードの位置に移動（384D _embeddingVector 更新）
// move() は廃止 or deprecated
```

### warp の実装イメージ

```typescript
async warp(nodeId: string): Promise<WarpResult> {
  // 可視ノードのみワープ可能
  if (!this._visibleNodes.has(nodeId)) {
    throw new Error(`Cannot warp to unseen node`);
  }

  // ノードのベクトルを取得
  const nodeVector = await this.coreAdapter.getNodeVector(nodeId);
  if (!nodeVector) {
    throw new Error(`Node ${nodeId} has no vector`);
  }

  // エージェントの 384D 位置を更新
  this._embeddingVector = [...nodeVector];  // 完全移動

  return { success: true, arrivedAt: nodeId };
}
```

### 探索フロー（warp 導入後）

```
spawn at initial position (query-based 384D)
  ↓
sense() → discover nearby nodes (from current 384D position)
  ↓
focus(nodeA) → read details
  ↓
warp(nodeA) → move to nodeA's 384D position
  ↓
sense() → discover NEW nearby nodes (different set!)
  ↓
focus(nodeB) → ...
```

### Rulebook での warp 定義（確認済み）

Rulebook (`src/rulebook/index.ts`) で warp は既に設計されている：

```typescript
// actions (86-99行)
allowed: [
  { name: "move", description: "Navigate toward a concept (exploration, no limit)" },
  { name: "warp", description: "Jump directly to a known node (rate limited)" },
]

// energy (52-67行)
allocation: {
  move: "Low cost. Conceptual navigation is expected.",
  warp: "Medium cost. Direct node access is a privilege, not a right.",
}

// rateLimit (408-413行)
rateLimit: {
  warpPerMinute: 10,  // warp は制限あり
  focusPerMinute: 30,
  actionsPerTick: 3,
}
```

**move vs warp の設計上の区別:**

| 操作 | 説明 | コスト | 制限 |
|------|------|--------|------|
| `move` | 概念に向かって移動（キーワードベース） | Low | なし |
| `warp` | 既知ノードに直接ジャンプ（IDベース） | Medium | 10回/分 |

**links フィールドの意味 (Rulebook 206-212行):**
> The 'links' field stores node IDs you discovered during exploration.
> These become warp destinations for future explorers.
> When you focus on a node, you learn its ID.

### sphere-context.ts の現状構造

```typescript
class SphereContextImpl {
  // 位置管理（分離問題）
  private _embeddingVector: number[];  // 384D - sense() が使用
  private _position: Vector;           // 3D - move() が更新（fake）

  // 可視性追跡（🅲で追加済み）
  private _visibleNodes: Set<string>;  // sense() 結果のキャッシュ

  // 依存関係
  private coreAdapter?: SphereCoreAdapter;  // getNodeVector() 提供
}
```

### warp() 実装に必要な要素

1. **既存:** `coreAdapter.getNodeVector(nodeId)` - ノードの384Dベクトル取得
2. **既存:** `_visibleNodes` - 可視ノードのみワープ可能（🅲で追加済み）
3. **追加:** `_embeddingVector` 更新ロジック
4. **追加:** `_visibleNodes.clear()` - 移動後は再sense必要
5. **追加:** レート制限（warpPerMinute: 10）

### TODO

**warp:**
- [x] focus() を sense() 結果に限定（🅲 完了）
- [x] `WarpResult` 型を types/gateway.ts に追加 ✅
- [x] `warp(nodeId)` を sphere-context.ts に実装 ✅
- [x] Gateway メッセージに `warpResult` 追加 ✅
- [x] gateway-server.ts で warp ハンドラ追加 ✅
- [x] explore-agent に warp テスト追加 ✅
- [x] warp 後の sense() で異なるノードが返ることを検証 ✅ (Phase 1 完了)
- [ ] move(dx,dy,dz) を deprecated にマーク（後回し可）
- [ ] warp レート制限実装（warpPerMinute: 10）

**randomWalk:**
- [x] `RandomWalkResult` 型を types/gateway.ts に追加 ✅
- [x] `randomWalk(stepSize)` を sphere-context.ts に実装 ✅
- [x] Gateway メッセージに `randomWalkResult` 追加 ✅
- [x] gateway-server.ts で randomWalk ハンドラ追加 ✅
- [x] explore-agent に randomWalk テスト追加 ✅
- [x] randomWalk 後の sense() で異なるノードが返ることを検証 ✅ (Phase 2 テスト成功)
- [ ] 引力影響型への拡張（将来）

### 実装された warp() の仕様

```typescript
// sphere-context.ts
async warp(nodeId: string): Promise<WarpResult> {
  // 1. 可視ノードチェック (_visibleNodes)
  if (!this._visibleNodes.has(nodeId)) {
    return { success: false, error: "not_visible" };
  }

  // 2. ノードの384Dベクトル取得
  const targetVector = await this.coreAdapter.getNodeVector(nodeId);

  // 3. エージェントの位置を更新（真の移動！）
  this._embeddingVector = [...targetVector];

  // 4. 可視ノードをクリア（再sense必須）
  this._visibleNodes.clear();

  return { success: true, arrivedAt: nodeId };
}
```

**探索フロー（実装後）:**
```
sense() → nodes発見 → _visibleNodes に登録
  ↓
warp(nodeId) → 384D _embeddingVector 更新 → _visibleNodes.clear()
  ↓
sense() → 新しい位置から検索 → 異なるノードセット
```

---

## 🎲 randomWalk() - 目標なし探索

### 設計思想

```
warp = 目的地がある移動（ノードIDが必要）
randomWalk = 目的地がない探索（近傍にノードがない場合に必須）
```

**ユースケース:**
- sense() → 興味あるノードがない → randomWalk() → sense() → 新領域発見

### 実装された randomWalk() の仕様

```typescript
// sphere-context.ts
async randomWalk(stepSize: number = 0.1): Promise<RandomWalkResult> {
  // 1. ランダム方向を生成（384D空間で均一分布）
  const direction = this.generateRandomUnitVector(384);

  // 2. 位置を更新
  for (let i = 0; i < 384; i++) {
    this._embeddingVector[i] += direction[i] * stepSize;
  }

  // 3. 正規化（単位超球面上に維持）
  this.normalizeEmbedding();

  // 4. 可視ノードをクリア（再sense必須）
  this._visibleNodes.clear();

  return { success: true, distance: stepSize };
}
```

### RandomWalkResult 型

```typescript
interface RandomWalkResult {
  success: boolean;
  distance: number;      // 移動距離（0.0-1.0）
  blocked?: BlockReason; // 失敗理由（将来拡張用）
}
```

### 計算方法：ランダム単位ベクトル生成

```typescript
// Box-Muller変換でガウス分布 → 正規化で超球面上に均一分布
private generateRandomUnitVector(dim: number): number[] {
  const vector: number[] = [];
  let magnitude = 0;

  for (let i = 0; i < dim; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    vector.push(gaussian);
    magnitude += gaussian * gaussian;
  }

  magnitude = Math.sqrt(magnitude);
  return vector.map(v => v / magnitude);
}
```

### 探索フロー（randomWalk）

```
sense() → 興味なし
  ↓
randomWalk(0.1) → ランダム方向に移動 → _visibleNodes.clear()
  ↓
sense() → 新しい位置から検索 → 異なるノードセット（期待）
```

### テスト結果（2026-02-02）

```
[Tutorial] 🎲 RANDOM WALK TEST: Does randomWalk() change what we sense?
[Tutorial]   Before walk - sensed 4 nodes
[Tutorial]   Node IDs: a48438f7, f0a2586a, 1d8b2b1a
[Tutorial]   RandomWalk(stepSize=0.5)...
[Tutorial]   ✅ RandomWalk succeeded! distance=0.500
[Tutorial]   After walk - sensed 5 nodes
[Tutorial]   Node IDs: a48438f7, d7e0ed5a, 1d8b2b1a
[Tutorial]   ✅ DIFFERENT NODE SET - randomWalk() affects sense() (real movement!)
```

**3つの移動方式の比較（テスト結果）:**

| メソッド | sense()結果 | 384D更新 | 結論 |
|---------|-------------|---------|------|
| move(dx,dy,dz) | ⚠️ SAME | ❌ | 偽の移動（legacy） |
| warp(nodeId) | ✅ DIFFERENT | ✅ | 真の移動 |
| randomWalk(step) | ✅ DIFFERENT | ✅ | 真の移動 |

### Phase 3 設計：エージェント探索性格（WalkMode）

**設計思想:**
```
エージェントが自分の探索スタイルを選べる
= 目的や性格に応じた情報密度勾配への反応
```

**WalkMode 定義:**
```typescript
type WalkMode =
  | "random"   // 純粋ランダム（デフォルト）
  | "hot"      // heat高い方向へ（人気追従型）
  | "fresh"    // freshness高い方向へ（新着志向型）
  | "deep"     // weight高い方向へ（安定志向型）
  | "explore"  // 既知から離れる（開拓型）

randomWalk(stepSize?: number, mode?: WalkMode): Promise<RandomWalkResult>
```

**エージェント性格と探索スタイル:**

| 性格 | mode | 重み計算 | 挙動 |
|------|------|---------|------|
| 好奇心旺盛 | `fresh` | freshness / distance² | 新規情報を追う |
| 人気志向 | `hot` | heat / distance² | 注目領域へ |
| 安定志向 | `deep` | weight / distance² | 確立知識へ |
| 開拓者 | `explore` | -1 / distance² (反発) | 未踏領域へ |
| ランダム | `random` | なし | 偶発的発見 |

**勾配計算（引力型）:**
```typescript
function calculateGradientDirection(
  agentVector: number[],
  visibleNodes: Map<string, { vector: number[], heat: number, distance: number }>
): number[] {
  // 重み付きセントロイドを計算
  let totalWeight = 0;
  const weightedSum = new Array(384).fill(0);

  for (const node of visibleNodes.values()) {
    const weight = node.heat / (node.distance * node.distance);
    totalWeight += weight;

    for (let i = 0; i < 384; i++) {
      weightedSum[i] += node.vector[i] * weight;
    }
  }

  // セントロイドへの方向
  const direction: number[] = [];
  for (let i = 0; i < 384; i++) {
    direction[i] = (weightedSum[i] / totalWeight) - agentVector[i];
  }

  return normalize(direction);
}
```

**使用例:**
```typescript
// 新着追いかけるエージェント
await ctx.randomWalk(0.3, "fresh");

// 人気を追うエージェント
await ctx.randomWalk(0.3, "hot");

// 未開拓領域を探すエージェント
await ctx.randomWalk(0.3, "explore");
```

**実装ステータス:** Phase 3（将来）
- 現在は `mode: "random"` のみ実装済み
- 勾配型は `_visibleNodes` のベクトル情報が必要（coreAdapter拡張）

---

## エージェントのセッションデータ

エージェントが自身について参照できるデータの一覧。

### 📋 接続時に受け取るデータ（welcome メッセージ）

```typescript
// gateway-server.ts → GatewayMessage
{
  type: "welcome";
  sessionId: string;           // セッションID
  rulebookUrl: string;         // ルールブックURL
  quests: QuestSummary[];      // クエストショーケース
  message: string;             // 歓迎メッセージ
}
```

### 🎯 Quest（外部からのガイド）

```typescript
// QuestSummary - welcome で受信
interface QuestSummary {
  id: string;            // クエストID
  question: string;      // クエスト内容
  tags: string[];        // トピックタグ
  submittedAt: number;   // 投稿時刻
}
```

**Questの役割:**
- Quest ≠ SphereNode（ノードではない）
- Quest = 外部世界からのテキストオブジェクト
- Quest = ノードへのガイド
- エージェントはEntryRequest.questでクエストを選択できる

### 📍 positioned メッセージ（Entry後）

```typescript
{
  type: "positioned";
  sessionId: string;
  position: number[];        // 384D初期位置
  remainingTime: number;     // 残り時間
  query: string;             // 自分のクエリ（エコーバック）
  tags: string[];            // 自分のタグ（エコーバック）
  quest?: string;            // 選択したクエスト（あれば）
}
```

### 📍 公開プロパティ（SphereContext readonly）

| プロパティ | 型 | 説明 |
|-----------|-----|------|
| `position` | `Vector {x,y,z}` | 現在の3D位置（Sphereの真実） |
| `sessionId` | `string` | セッション識別子 |
| `remainingTime` | `number` | 残り時間（秒） |
| `layer` | `ExperienceLayer` | 現在のレイヤー（Tutorial/Sanctuary/Core） |

### 🔒 内部データ（エージェントからは不可視）

| データ | 型 | 説明 |
|--------|-----|------|
| `_embeddingVector` | `number[384]` | 真の384D位置（sense計算に使用） |
| `_visibleNodes` | `Set<string>` | 最後のsense()結果のノードID |
| `_actionLog` | `ActionLogEntry[]` | 行動ログ（focus, move, evaluate等） |
| `_focusedNodes` | `Map<nodeId, duration>` | フォーカス履歴と滞在時間 |
| `_evaluations` | `Map<nodeId, score>` | 評価履歴 |

### 📦 エージェントの「持ち物」まとめ

| カテゴリ | データ | 取得タイミング |
|---------|--------|---------------|
| **セッション** | sessionId, remainingTime, layer | 接続時・常時 |
| **位置** | position (3D) | 常時 |
| **ガイド** | quests (QuestSummary[]) | welcome時 |
| **自己申告** | query, tags, quest | positioned時 |
| **履歴** | (内部のみ) | 非公開 |

### 💡 追加候補（未実装）

現状エージェントが知れないが、知りたいかもしれないもの：

| 候補 | 公開すべきか | 理由 |
|------|-------------|------|
| `embeddingVector` | ❌ | 高次元すぎて意味がない |
| `visitedNodeIds` | ❓ | 探索済みを知りたい（下記方針参照） |
| `evaluationHistory` | ❓ | 自分の評価を振り返りたい（下記方針参照） |
| `focusHistory` | ❓ | 滞在履歴を知りたい（下記方針参照） |
| `warpCount` | ⭕ | レート制限確認用（制約情報として必要） |

### 🎯 設計方針（暫定）

**現状は履歴データを公開しない**

```
エージェントは「記憶を持たない観測者」として扱う
行動の意味は World（Sphere）側にのみ蓄積される
```

**理由:**
- エージェントの行動履歴は Sphere の状態（heat, weight 等）に反映される
- エージェント側で履歴を持つと、World との整合性維持が複雑になる
- 「観測」と「記録」の責務を分離する

**move / warp 設計との関係:**
- `sense` / `warp` は 384D ベクトルを直接使用
- `move`（3D）は現在 UI / モック用途であり、世界状態に影響しない
- `warp` は「理解による位置更新」であり、正規の移動手段

**結論:**
```
エージェントは「どこにいるか」を知るが、
「どう動いたか」を知る必要はない。

移動とは履歴ではなく、結果としての位置である。
```

**例外:**
- `warpCount`: レート制限（10/min）確認のため公開を検討
- 将来、自己省察型エージェントを導入する場合に再検討

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-01-31 | 初版作成（SphereNode 分析 + 移動方式設計） |
| 2026-01-31 | 384次元対応版に改訂（direction 削除、二層構造導入） |
| 2026-01-31 | 次元非依存設計、scan 探索範囲を追加 |
| 2026-01-31 | moveBatch 設計を追加（探索/移動フェーズ分離） |
| 2026-01-31 | 実装完了: vector.ts, movement.ts, move.ts, sphere-context.ts 更新 |
| 2026-02-02 | 設計 vs 実装ギャップを検証、warp ベース移行計画を追加 |
| 2026-02-02 | **🅱案 warp() 実装完了**: types/gateway.ts, sphere-context.ts, gateway-server.ts, explore-agent.ts |
| 2026-02-02 | エージェントのセッションデータ一覧を追加 |
| 2026-02-02 | 設計方針追加：エージェントは「記憶を持たない観測者」 |
| 2026-02-02 | **Phase 1 完了**: warp() テスト成功（sense結果が変化） |
| 2026-02-02 | **Phase 2 randomWalk() 実装完了**: 目標なし探索（純粋ランダム） |
| 2026-02-02 | **Phase 2 テスト成功**: randomWalk() → sense() で異なるノードセット確認 |
| 2026-02-02 | **移動API最終設計確定**: warp / randomWalk(mode) / move(deprecated) |
| 2026-02-02 | **Phase 3 WalkMode 実装完了**: 勾配計算、_visibleNodes Map化、テスト追加 |
| 2026-02-02 | **Phase 4 実装完了**: NearbyNode.timestamp追加、freshness計算、distSq削除、explore修正 |

---

## 🎯 移動API最終設計（確定）

### 設計原則

```
意味のある移動 = 観測に基づく移動
意味のない直線移動は存在しない
```

### 移動API一覧

| API | 用途 | sense()必須 | 384D更新 |
|-----|------|------------|---------|
| `warp(nodeId)` | 観測したノードへ直接移動 | ✅ | ✅ |
| `randomWalk(step, mode)` | 方向性を持った探索移動 | mode依存 | ✅ |
| `move(dx,dy,dz)` | ❌ **deprecated** | - | ❌ |

### randomWalk(stepSize, mode) の詳細

```typescript
type WalkMode = "random" | "hot" | "fresh" | "deep" | "explore";

randomWalk(stepSize?: number, mode?: WalkMode): Promise<RandomWalkResult>
```

| mode | sense()必須 | 方向決定 | 説明 |
|------|------------|---------|------|
| `random` | ❌ | ランダム | 偶発的探索（観測なくても可） |
| `hot` | ✅ | heat勾配 | 人気方向へ（観測から計算） |
| `fresh` | ✅ | freshness勾配 | 新着方向へ（観測から計算） |
| `deep` | ✅ | weight勾配 | 安定方向へ（観測から計算） |
| `explore` | ✅ | 反発勾配 | 未知方向へ（観測から反発計算） |

### 探索フロー

```
[目的地あり]
sense() → warp(nodeId) → sense()

[目的地なし・方向性あり]
sense() → randomWalk(step, "hot") → sense()

[目的地なし・方向性なし]
randomWalk(step, "random") → sense()
```

### 実装ステータス

| API | 状態 |
|-----|------|
| `warp(nodeId)` | ✅ 実装済み・テスト済み |
| `randomWalk(step)` mode=random | ✅ 実装済み・テスト済み |
| `randomWalk(step, mode)` 勾配型 | ✅ **Phase 4 完了**（直接メトリクス値使用） |
| `move(dx,dy,dz)` | ⚠️ deprecated（残存） |

---

## Phase 3 WalkMode 実装詳細（2026-02-02）

### 実装内容

**1. 型定義 (types/gateway.ts)**
```typescript
type WalkMode = "random" | "hot" | "fresh" | "deep" | "explore";

interface RandomWalkResult {
  success: boolean;
  distance: number;
  mode?: WalkMode;           // 使用されたモード
  blocked?: BlockReason;
}

// BlockReason に追加
| "no_visible_nodes"  // 勾配モードは sense() 必須
```

**2. _visibleNodes 拡張 (sphere-context.ts)**
```typescript
// Set<string> → Map<string, VisibleNodeInfo>
interface VisibleNodeInfo {
  vector: number[];      // 384D位置（遅延取得）
  heat: number;
  freshness: number;
  weight: number;
  distance: number;
}
```

**3. 勾配計算ロジック**
```typescript
private async calculateGradientDirection(mode: WalkMode): Promise<number[]> {
  for (const [nodeId, info] of this._visibleNodes) {
    // ベクトルを遅延取得
    if (nodeVector.length === 0 && this.coreAdapter) {
      nodeVector = await this.coreAdapter.getNodeVector(nodeId);
    }

    // mode別の重み計算
    switch (mode) {
      case "hot":     weight = heat / distance²
      case "fresh":   weight = freshness / distance²
      case "deep":    weight = weight / distance²
      case "explore": weight = -1 / distance²  // 反発
    }

    // 重み付きセントロイド計算
    weightedSum[i] += nodeVector[i] * weight;
  }

  // 方向 = セントロイド - 現在位置
  direction[i] = (weightedSum[i] / totalWeight) - agentVector[i];
  return normalize(direction);
}
```

**4. randomWalk() 分岐ロジック**
```typescript
async randomWalk(stepSize = 0.3, mode: WalkMode = "random") {
  // 勾配モードは sense() 必須
  if (mode !== "random" && this._visibleNodes.size === 0) {
    return { success: false, blocked: "no_visible_nodes" };
  }

  // 方向計算
  if (mode === "random") {
    direction = this.generateRandomUnitVector(384);
  } else {
    direction = await this.calculateGradientDirection(mode);
  }

  // 移動実行...
}
```

### テスト項目 (explore-agent.ts)

```typescript
// 1. HOT モード（人気方向へ）
const hotResult = await this.randomWalk(0.3, "hot");

// 2. EXPLORE モード（既知から離れる）
const exploreResult = await this.randomWalk(0.3, "explore");

// 3. sense()なしで勾配モード → blocked
const noSenseResult = await this.randomWalk(0.3, "hot");
// Expected: { success: false, blocked: "no_visible_nodes" }
```

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `types/gateway.ts` | WalkMode型、BlockReason拡張、シグネチャ更新 |
| `sphere-context.ts` | VisibleNodeInfo、_visibleNodes Map化、勾配計算 |
| `gateway-server.ts` | AgentMessage に mode 追加、ハンドラ更新 |
| `explore-agent.ts` | WalkMode型、テスト追加 |

### 設計ポイント

1. **遅延ベクトル取得**: sense()時にはベクトルを保存せず、勾配計算時に coreAdapter.getNodeVector() で取得
2. **反発計算**: explore モードは負の重みで自然に既知ノードから離れる方向を計算
3. **フォールバック**: ベクトル取得失敗時はランダム方向にフォールバック

---

## Phase 4 設計修正：メトリクス整合性（2026-02-02）

### 問題点

Phase 3 の実装には以下の不整合があった：

1. **freshness が NearbyNode にない** - SphereNode.timestamp から計算可能だが、NearbyNode に伝搬していない
2. **distance² 係数は不要** - sense() にヒットした時点で「近傍」であり、距離による重み付けは冗長
3. **explore モードの複雑さ** - 反発計算は単純なランダムウォークで十分

### SphereNode vs NearbyNode

```
SphereNode (renalCore)          NearbyNode (periphery)
-----------------------         ----------------------
metrics.h (heat)         →      heat ✅
metrics.w (weight)       →      weight ✅
metrics.d (decay)        →      (不要)
metrics.ttl              →      (不要)
metrics.flg              →      flags ✅
timestamp                →      ❌ **欠落**
```

### 修正方針

**1. NearbyNode に timestamp を追加**
```typescript
export interface NearbyNode {
  id: string;
  distance: number;
  summary: string;
  heat: number;
  weight: number;
  timestamp: number;  // 追加: SphereNode.timestamp
  kind: NodeKind;
  flags: number;
}
```

**2. freshness の計算**
```typescript
// 新しいほど高い値（0.0-1.0）
const age = Date.now() - node.timestamp;
const freshness = 1 / (1 + age / 3600000);  // 1時間で半減
```

**3. 距離係数の削除**
```typescript
// Before (Phase 3)
weight = info.heat / distSq;

// After (Phase 4)
weight = info.heat;  // 距離係数不要
```

**4. explore = 最遠ノード方向（distance を使用）**
```typescript
// Before (Phase 3)
case "explore":
  weight = -1 / distSq;  // 反発計算

// After (Phase 4)
case "explore":
  weight = info.distance;  // 遠いほど高い重み
  // = 最も遠いノード方向へ向かう
```

### WalkMode 最終定義

| mode | 計算 | sense必須 | 備考 |
|------|------|----------|------|
| (指定なし) | ランダム方向 | ❌ | 純粋ランダム |
| `hot` | Σ(heat × vector) | ✅ | 人気追従 |
| `fresh` | Σ(freshness × vector) | ✅ | 新着追従 |
| `deep` | Σ(weight × vector) | ✅ | 安定追従 |
| `explore` | Σ(distance × vector) | ✅ | **最遠ノードへ** |

### explore の意図

```
explore = 「一番遠くのノードに向かう」

sense() で見えた中で最も遠いノード方向へ
= 現在の探索範囲の境界へ
= 未踏領域への橋渡し

反発計算ではなく、distance を重みとして使用することで：
- 近いノードは無視
- 遠いノードに引き寄せられる
- 探索範囲が自然に広がる
```

### 実装 TODO

- [x] NearbyNode に `timestamp` フィールド追加 ✅
- [x] coreAdapter.sense() で timestamp を含める ✅
- [x] VisibleNodeInfo で freshness を timestamp から計算 ✅
- [x] calculateGradientDirection から `/ distSq` を削除 ✅
- [x] explore モードで `weight = distance` に修正 ✅

**Phase 4 実装完了 (2026-02-02)**

### 設計根拠

```
sense() でヒットした時点で「近傍」である。
距離による除算は冗長であり、メトリクス値そのものが方向を決める。

explore = 「未知方向へ」という意図は、
          「最も遠い既知ノードへ向かう」ことで達成される。
          既知の境界まで行けば、その先は未踏領域。

random（指定なし）= 何も考えずランダムに歩く
explore = 意図を持って遠くへ向かう

化石ノードは timestamp が古い → freshness が低い
新規ノードは timestamp が新しい → freshness が高い
ttl は寿命の長さであり、鮮度とは異なる概念。
```

---

## Phase 4 実装詳細（2026-02-02）

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `types/gateway.ts` | NearbyNode に `timestamp` フィールド追加、WalkMode コメント更新 |
| `sphere-context.ts` | freshness計算追加、calculateGradientDirection から distSq 削除 |
| `sphere-core-adapter.ts` | sense()/focus() で timestamp を返すように修正 |
| `explore-agent.ts` | NearbyNode ローカル定義に timestamp 追加 |
| `swarm-agent.ts` | NearbyNode ローカル定義に timestamp 追加 |

### NearbyNode 更新

```typescript
// types/gateway.ts
export interface NearbyNode {
  id: string;
  distance: number;
  summary: string;
  heat: number;
  weight: number;
  timestamp: number;  // 追加: SphereNode.timestamp から
  kind: NodeKind;
  flags: number;
}
```

### freshness 計算

```typescript
// sphere-context.ts sense() 内
const now = Date.now();
for (const node of nodes) {
  const age = now - (node.timestamp || now);
  const freshness = 1 / (1 + age / 3600000);  // 1時間半減期
  this._visibleNodes.set(node.id, {
    vector: [],
    heat: node.heat,
    freshness,
    weight: node.weight,
    distance: node.distance,
  });
}
```

### 勾配計算（Phase 4 最終版）

```typescript
// sphere-context.ts calculateGradientDirection()
// distSq 除算を削除、直接メトリクス値を使用

switch (mode) {
  case "hot":
    weight = info.heat;         // 人気追従
    break;
  case "fresh":
    weight = info.freshness;    // 新着追従
    break;
  case "deep":
    weight = info.weight;       // 安定追従
    break;
  case "explore":
    weight = info.distance;     // 最遠ノードへ（境界探索）
    break;
  default:
    weight = 1;
}
```

### 設計根拠の確認

1. **distSq 削除**: sense() でヒットした時点で「近傍」であり、距離による重み付けは冗長
2. **explore = distance**: 反発計算ではなく、最遠ノード方向への引力として実装
3. **freshness 計算**: timestamp から 1時間半減期の指数減衰

### テスト結果（2026-02-02 検証完了）

```
[Tutorial] 🧭 WALKMODE TEST: Does gradient-based movement work?
[Tutorial]   Sensing to populate visible nodes...
[Tutorial]   Sensed 7 nodes for gradient calculation
[Tutorial]   Testing randomWalk(0.3, "hot")...
[Tutorial]   ✅ HOT mode succeeded! distance=0.300, mode=hot
[Tutorial]   Testing randomWalk(0.3, "explore")...
[Tutorial]   ✅ EXPLORE mode succeeded! distance=0.300, mode=explore
[Tutorial]   Testing randomWalk("hot") WITHOUT sense...
[Tutorial]   ✅ Correctly blocked: no_visible_nodes (gradient mode requires sense)
```

**サーバーログ（debug出力）:**
```
[SphereContext] randomWalk(stepSize=0.3, mode=hot, visibleNodes=7)
[SphereContext] RandomWalk complete - moved 0.300 in hot direction
[SphereContext] randomWalk(stepSize=0.3, mode=explore, visibleNodes=9)
[SphereContext] RandomWalk complete - moved 0.300 in explore direction
[SphereContext] randomWalk(stepSize=0.3, mode=hot, visibleNodes=0)
[SphereContext] RandomWalk failed: mode=hot requires sense() first
```

**検証結果:**
- ✅ hot mode: 動作確認（mode=hot が返される）
- ✅ explore mode: 動作確認（mode=explore が返される）
- ✅ sense() なしの勾配モード: 正しく blocked="no_visible_nodes" で拒否

### 更新履歴に追加

| 日付 | 内容 |
|------|------|
| 2026-02-02 | **Phase 4 実装完了**: NearbyNode.timestamp追加、freshness計算、distSq削除、explore修正 |
| 2026-02-02 | **Phase 4 テスト検証完了**: hot/explore mode 動作確認、no_visible_nodes 拒否確認 |
| 2026-02-02 | **Phase 5 設計開始**: sense() 処理負荷軽減の検討 |

---

## Phase 5 設計: sense() 処理負荷軽減（2026-02-02）

### 問題提起

勾配モード（hot/fresh/deep/explore）は sense() に依存する。
しかし、Rulebook では sense は「Low cost. Use freely」と定義されている。

```
現状の処理フロー:
  randomWalk(mode="hot")
      ↓ 必須
    sense()
      ↓
    projectionRepo.queryNearby()  ← 384次元近傍検索（重い）
      ↓
    NearbyNode[] 返却
      ↓
    勾配計算（heat/weight/timestamp/distance）
```

**矛盾**: 「自由に使える」はずの sense() が、実は重い処理を伴う。

### エージェントの真の目的

エージェントは「次の行き先を決める」だけ。

| 目的 | 使うフィールド | 必要な精度 |
|------|---------------|-----------|
| warp 先選択 | `id` | 正確 |
| focus 先選択 | `id` | 正確 |
| hot 勾配 | `heat` | 量子化で十分 |
| fresh 勾配 | `timestamp` | 量子化で十分 |
| deep 勾配 | `weight` | 量子化で十分 |
| explore 勾配 | `distance` | 量子化で十分 |

### 3D 折り畳み技術（deprecated move() から継承）

```typescript
// 1. 単純投影: 最初の3次元を使用
function projectTo3D(vector: number[]): Vector {
  return {
    x: vector[0] * 100,
    y: vector[1] * 100,
    z: vector[2] * 100,
  };
}

// 2. 量子化: 連続値 → 離散レベル
quantizeDistance(cosineDist) → "near" | "mid" | "far"
quantizeHeat(heat) → "low" | "mid" | "high"

// 計算用数値
DISTANCE_VALUES = { near: 1, mid: 3, far: 7 }
HEAT_VALUES = { low: 0.2, mid: 0.5, high: 0.9 }
```

### 設計思想（二層構造）

```
┌─────────────────────────────────────────────────────────────┐
│  知覚層（Agent View）: 量子化された情報                       │
├─────────────────────────────────────────────────────────────┤
│  ✅ 距離感（near/mid/far）                                   │
│  ✅ 熱量感（low/mid/high）                                   │
│  ✅ 種別（amber/active/ghost...）                            │
│  ✅ 一時的な目印（signature or id）                          │
├─────────────────────────────────────────────────────────────┤
│  計算層（System）: 384次元精密計算                           │
├─────────────────────────────────────────────────────────────┤
│  ✅ 正確な384Dベクトル座標                                   │
│  ✅ 正確な heat/weight 数値                                  │
│  ✅ 正確なコサイン距離                                       │
└─────────────────────────────────────────────────────────────┘
```

### 軽量化案

#### 案A: 二段階フィルタリング

```
1. 粗い検索（3D投影空間）: 高速に候補を絞り込む
2. 精密検索（384D空間）: 絞り込まれた候補のみ計算
```

**利点**: 投影品質次第で大幅に高速化
**欠点**: 3D投影の品質が低いと候補漏れ

#### 案B: 量子化キャッシュ

```
量子化された距離レベルが変わるまでキャッシュ再利用

例: エージェントが near 圏内で微動しても、
    量子化距離は "near" のままなのでキャッシュヒット
```

**利点**: 移動が小さい間はほぼ無コスト
**欠点**: 大きく移動するとキャッシュミス

#### 案C: 空間インデックス（3D R-tree）

```
3D投影空間にR-treeを構築
  → O(log n) で候補取得
  → 候補のみ384D距離計算
```

**利点**: 大規模データでも高速
**欠点**: 初期構築コスト、投影品質依存

### 共通の前提

**エージェントには量子化情報で十分**

```typescript
// 現状: 精密な数値を返す
interface NearbyNode {
  distance: number;     // 0.234567...
  heat: number;         // 75.3421...
  weight: number;       // 42.1289...
}

// 改善案: 量子化レベルを返す（内部計算は精密）
interface QuantizedNearbyNode {
  distance: "near" | "mid" | "far";
  heat: "low" | "mid" | "high";
  weight: "low" | "mid" | "high";
}
```

勾配計算は内部で量子化値を数値変換して行う。
エージェントは量子化結果だけを受け取る。

### 重要な制約（2026-02-02 確認）

```
┌─────────────────────────────────────────────────────────────┐
│  精度を落としてよいもの                                       │
├─────────────────────────────────────────────────────────────┤
│  ✅ distance → near/mid/far で十分（勾配計算用）             │
│  ✅ heat → low/mid/high で十分（勾配計算用）                 │
│  ✅ weight → low/mid/high で十分（勾配計算用）               │
│  ✅ 候補の網羅性 → 多少漏れても可                            │
├─────────────────────────────────────────────────────────────┤
│  正確でなければならないもの                                   │
├─────────────────────────────────────────────────────────────┤
│  ❌ node id → focus/warp のターゲット指定に必須              │
│  ❌ kind → フィルタリング判断に必要                          │
└─────────────────────────────────────────────────────────────┘
```

**原則: 候補に挙がったノードの id は正確に返す。メトリクスは量子化。**

### 現状の queryNearby() 実装

```typescript
// map-projection.repository.ts
async queryNearby(vector: number[], limit: number, maxDistance: number) {
  const results: SpatialQueryResult[] = [];

  // ★ O(n) - 全ノードをスキャン
  for (const node of this.store.values()) {
    // ★ 384次元コサイン距離計算（各ノードごと）
    const distance = cosineDistance(vector, node.vector);
    if (distance <= maxDistance) {
      results.push({ node, distance });
    }
  }

  results.sort((a, b) => a.distance - b.distance);
  return results.slice(0, limit);
}
```

**問題**: O(n × 384) の計算コスト

**コメント記載**: "Production should use HNSW, IVFFlat"

### 軽量化の方向性

```
現状:
  全ノード × 384次元距離計算 → 正確な NearbyNode[]

改善案:
  3D投影で粗く候補選定 → 候補のみ詳細取得 → 量子化 NearbyNode[]

  SphereNode に 3D 投影座標を事前保持:
    node.vector: number[384]  ← 既存
    node.proj3d: Vector       ← 追加（x, y, z）
```

### 次のステップ

- [x] projectionRepo.queryNearby() の実装確認 ✅
- [ ] SphereNode への proj3d フィールド追加検討
- [ ] 3D投影インデックス（R-tree or Grid）の実現可能性調査
- [ ] 量子化 NearbyNode インターフェース設計
- [ ] ベンチマーク: 現状 vs 軽量化版

---

### 設計転換: 「正確な sense」は設計意図に反する（2026-02-02）

#### 問題の再定義

```
❌ sense = 正確な近傍検索
❌ sense = 無料 API
❌ sense = 世界の真実

✅ sense = 不完全な知覚
✅ sense = 高コスト（代謝的）
✅ sense = 運と偏り
```

#### 哲学的整合性チェック

| 現状の実装 | 評価 | 理由 |
|-----------|------|------|
| `addNoise()` で知覚値にノイズ追加 | ✅ | 既に「不正確」を意図 |
| Rulebook: "sense is feeling presence" | ❌ | 全スキャンは "feeling" ではない |
| Rulebook: "Agents don't perceive: exact values" | ❌ | 全候補を正確に取得している |

**結論**: 現状の「正確な sense + ノイズ後付け」は設計意図に反している

#### 新しい選択肢

##### 🅰 ランダムサンプル型（推奨）

```typescript
sense():
  sample M nodes from all nodes
  optional: bias by heat / freshness
```

- **計算量**: O(M × 384) where M = 100〜200
- **改善率**: 100x（n=10,000 の場合）
- **特性**: 世界が「雑音を含んで見える」
- **実装難度**: 低

##### 🅱 セル × ランダム（ハイブリッド）

```typescript
candidates = spatialCells + randomGlobal
```

- **特性**: 局所性と偶然性の両立、探索が"跳ねる"
- **実装難度**: 中

##### 🅲 成功率制限

```typescript
sense():
  if random() > perceptionAccuracy:
    return []
```

- **特性**: クールダウン、時間消費、成功率
- **問題**: 計算量は変わらない（O(n)）
- **実装難度**: 低

#### 設計的帰結

```
sense が不正確
    ↓
同じ場所でも毎回違うノードが見える
    ↓
「運」と「偶然の出会い」が生まれる
    ↓
focus で確認、evaluate で評価が重要になる
    ↓
エージェントの行動に意味が生まれる
```

**核心**:
- 正確な sense を前提にすると、move / randomWalk / warp が全部嘘になる
- sense が雑 → move が雑 → randomWalk が雑 → だからこそ focus / evaluate が意味を持つ

#### 🅰 ランダムサンプル型の実装イメージ

```typescript
async sense(agentVector: number[], radius: number = 1.0): Promise<NearbyNode[]> {
  const SAMPLE_SIZE = 100;
  const allNodes = await this.projectionRepo.getAll();

  // ランダムサンプリング（熱量バイアス可能）
  const sampled = randomSample(allNodes, SAMPLE_SIZE, {
    bias: (node) => node.metrics.h  // 高熱量ほど見つかりやすい
  });

  // サンプルのみ距離計算
  const perceptionRadius = this.config.basePerceptionRadius * radius;
  const results: NearbyNode[] = [];

  for (const node of sampled) {
    if (!node.vector || node.vector.length === 0) continue;

    const distance = cosineDistance(agentVector, node.vector);
    if (distance <= perceptionRadius) {
      results.push({
        id: node.id,
        distance: addNoise(distance, this.config.noiseFactor),
        summary: node.payload?.summary ?? "(no summary)",
        heat: addNoise(node.metrics.h, this.config.noiseFactor),
        weight: addNoise(node.metrics.w, this.config.noiseFactor),
        timestamp: node.timestamp,
        kind: node.kind,
        flags: node.metrics.flg,
      });
    }
  }

  results.sort((a, b) => a.distance - b.distance);
  return results.slice(0, this.config.maxSenseResults);
}

// バイアス付きランダムサンプリング
function randomSample<T>(
  items: T[],
  count: number,
  options?: { bias?: (item: T) => number }
): T[] {
  if (items.length <= count) return items;

  if (!options?.bias) {
    // 単純ランダム
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  // 重み付きサンプリング
  const weighted = items.map(item => ({
    item,
    weight: options.bias!(item) + 0.1  // 最低重み保証
  }));

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const selected: T[] = [];
  const used = new Set<number>();

  while (selected.length < count && used.size < items.length) {
    let r = Math.random() * totalWeight;
    for (let i = 0; i < weighted.length; i++) {
      if (used.has(i)) continue;
      r -= weighted[i].weight;
      if (r <= 0) {
        selected.push(weighted[i].item);
        used.add(i);
        break;
      }
    }
  }

  return selected;
}
```

#### 推奨決定

**🅰 ランダムサンプル型を採用**

| 評価軸 | スコア |
|--------|--------|
| 計算量削減 | ◎ 100x 改善 |
| Sphere 哲学との整合性 | ◎ 「不完全な知覚」 |
| focus/evaluate の価値向上 | ◎ 確認行動に意味 |
| 実装の単純さ | ◎ 既存コードへの最小変更 |

#### 次のステップ（更新）

- [ ] randomSample 関数の実装
- [ ] sphere-core-adapter.ts の sense() を改修
- [ ] SAMPLE_SIZE を config に追加（デフォルト: 100）
- [x] ~~バイアス関数の選択肢検討~~ → **廃止決定**（バイアス計算自体が O(n)）
- [ ] テスト: 同一位置での sense 結果のばらつき確認

---

### 設計改善: バイアス廃止と動的サンプルサイズ（2026-02-02）

#### バイアス計算の問題

```typescript
// ❌ 間違い: バイアス計算で全ノードをスキャン
const sampled = randomSample(allNodes, SAMPLE_SIZE, {
  bias: (node) => node.metrics.h  // ← 全ノードに適用 = O(n)
});
```

**これでは全スキャンと同じ計算量。設計ミス。**

#### 正しい設計原則

```
判断しない = 計算しない = 最速

1. 単純ランダムで M 個取得: O(M)
2. M 個のみ距離計算: O(M × 384)
3. ソートなし（知覚に順序は本来ない）
4. 終わり
```

#### 知覚の物理法則（最終決定 2026-02-02）

**目標**: システム総負荷 = 定数 T

```
総負荷 = エージェント数 × サンプル数 × 次元数
       = a × M × D = T

∴ M = T / (a × D)

サンプル率 = M / n = T / (a × n × D)
```

#### 最終実装

```typescript
/**
 * 知覚の物理法則
 *
 * これは「最適化の式」ではなく「知覚の物理法則」
 * - 数学的に完全
 * - 実装が最小
 * - 世界観と一致
 * - スケールしても破綻しない
 * - 「sense は不完全である」を保証
 * - 人数が増えるほど協調が生まれる
 */
function getSampleSize(n: number, a: number): number {
  const D = 384;       // 次元数（物理定数）
  const T = 100_000;   // システム目標負荷（唯一のチューニングパラメータ）

  const M = Math.floor(T / (a * D));
  return Math.max(1, Math.min(M, n));
}
```

#### スケーリングテーブル（純粋演算結果）

| ノード数 | エージェント数 | M = T/(a×D) | サンプル率 | **結果** |
|---------|---------------|-------------|-----------|---------|
| 100 | 1 | 260 | 100% | **100** |
| 1,000 | 1 | 260 | 26% | **260** |
| 10,000 | 1 | 260 | 2.6% | **260** |
| 1,000,000 | 1 | 260 | 0.026% | **260** |
| 1,000,000 | 5 | 52 | 0.005% | **52** |
| 1,000,000 | 10 | 26 | 0.003% | **26** |
| 1,000,000 | 50 | 5 | 0.0005% | **5** |
| 1,000,000 | 100 | 2 | 0.0002% | **2** |

#### 設計根拠

```
サンプル数 M はノード数に依存しない（上限以外）
サンプル率 rate はノード数に反比例

n が増える → rate が下がる → 同じ M を維持
a が増える → M が下がる → 負荷一定を維持

立方根も対数も上限も下限も不要。純粋な乗算のみ。
```

#### 世界観との整合

| 特性 | 解釈 |
|------|------|
| M = 260（単独） | 十分な探索視野 |
| M = 5（50人） | 混雑で視界が狭い |
| M = 2（100人） | ほぼ見えない |

**「混雑時は視界が極端に狭くなる」**
- 物理的にも説得力がある
- focus/evaluate の価値がさらに上がる
- 協調の動機が生まれる（情報共有）

#### 単純ランダムサンプリング

```typescript
function randomSampleFast<T>(items: T[], count: number): T[] {
  const n = items.length;
  if (n <= count) return items;

  const indices = new Set<number>();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * n));
  }

  return Array.from(indices).map(i => items[i]);
}
```

#### config（最小構成）

```typescript
interface SenseConfig {
  targetTotalOps: number;  // 唯一のチューニングパラメータ (default: 100_000)
  dimensionality: number;  // 物理定数 (384)
}
```

#### 最終設計まとめ

```
┌─────────────────────────────────────────────────────────────┐
│  sense() の物理法則                                          │
├─────────────────────────────────────────────────────────────┤
│  M = T / (a × D)                                            │
│                                                             │
│  T = 100,000  （システム目標負荷）                            │
│  D = 384      （次元数 - 物理定数）                          │
│  a = エージェント数                                          │
│  n = ノード数                                                │
├─────────────────────────────────────────────────────────────┤
│  ✅ バイアスなし（判断しない = 計算しない = 最速）            │
│  ✅ ソートなし（知覚に順序は本来ない）                        │
│  ✅ 上限・下限なし（純粋演算）                               │
│  ✅ システム全体負荷 = 定数                                   │
│  ✅ 知覚の不完全性を物理法則として保証                        │
└─────────────────────────────────────────────────────────────┘
```

#### 次のステップ

- [ ] `SenseConfig` を既存 config に統合
- [ ] `getSampleSize()` 関数実装
- [ ] `randomSampleFast()` 関数実装
- [ ] `sphere-core-adapter.ts` の `sense()` 改修
- [ ] 負荷テスト: エージェント数変動時の応答時間計測

---

### Phase 5 総括: スケーリング思想の確立（2026-02-02）

#### 出発点

sense() の処理負荷問題から議論を開始した。

```
問題: sense() が O(n × 384) の全スキャン
矛盾: Rulebook では「Low cost. Use freely」と定義
```

#### 設計の転換

**重要な原則**: sense 自体を抑制する意図はない。

```
❌ sense にレート制限をかける → エージェント体験を壊す
❌ sense を有料化する → 探索を阻害する
❌ sense の精度を落とす → それだけでは不十分

✅ 負荷をバッファする → エージェントは自由に sense できる
```

#### 到達した思想

sense の議論から、Sphere 全体に適用可能な **スケーリングの物理法則** が生まれた。

```
システム総負荷 = エージェント数 × 個別処理量 × 計算コスト = 定数

∴ 個別処理量 = 定数 / (エージェント数 × 計算コスト)
```

#### 思想の核心

```
┌─────────────────────────────────────────────────────────────┐
│  エージェント体験を守りながら、システムを守る                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  エージェント視点:                                            │
│    - sense は自由に使える（制限なし）                         │
│    - 混雑時は「視界が狭い」と感じる（自然な制約）              │
│    - 行動を制限されている感覚はない                           │
│                                                             │
│  システム視点:                                                │
│    - 総負荷は常に一定（バッファされている）                   │
│    - ノード数が増えてもスケール                               │
│    - エージェント数が増えてもスケール                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 適用範囲

この思想は sense 以外にも適用可能:

| 操作 | 適用方法 |
|------|---------|
| sense | サンプルサイズ M を動的調整 |
| queryNearby | 同上（内部で使用） |
| broadcast | 到達範囲を動的調整（将来） |
| metabolism tick | 処理ノード数を動的調整（将来） |

#### 設計の美しさ

```
1. 数学的に完全（純粋な乗算）
2. 実装が最小（1行の式）
3. 世界観と一致（知覚は不完全）
4. スケールしても破綻しない
5. エージェント体験を損なわない
6. 協調の動機を生む（混雑時の情報共有）
```

#### 結論

> sense から出発した議論は、
> Sphere のスケーリング思想の確立に至った。
>
> **「負荷をバッファする」**
>
> これは単なる最適化ではなく、
> システムとエージェント体験を両立させる設計哲学である。

---

### Spatial Grid: 後回し決定（2026-02-02）

#### 現時点の判断

**Spatial Grid（空間ハッシュグリッド）は後回しでOK**

#### 理由

既存の `projectionRepo.getAll()` をそのまま使える:

```typescript
// 現状で十分機能する実装
const allNodes = await this.projectionRepo.getAll();
const sampled = randomSampleFast(allNodes, sampleSize);
```

「全ノード配列からランダム抽出」で設計は成立する。

#### 将来のスケール対策

スケールが必要になったら差し替え可能:

| 手法 | 適用タイミング |
|------|---------------|
| Reservoir Sampling | ストリーム処理が必要になったとき |
| Shard単位サンプリング | 分散DB導入時 |
| Spatial Grid | 局所性が重要になったとき |

#### 設計原則

```
現時点で動くものを作る
  → 問題が発生したら対策する
  → 抽象化レイヤーがあるので差し替え可能

「今必要ないものは作らない」
```

#### 参照

既存の Spatial Grid 設計は保持:
- [PHASE4_AGENT_SPATIAL_DESIGN.md](./PHASE4_AGENT_SPATIAL_DESIGN.md)

将来必要になったときに参照可能。
