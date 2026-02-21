# Phase 4: Agent System 実装メモ

**実装日**: 2026-01-30
**実装者**: Claude (Opus 4.5)
**ステータス**: Phase 4.0 基盤完了

---

## 概要

スフィア空間を探索するエージェントシステムの基盤実装。
設計書（PHASE4_AGENT_SPATIAL_DESIGN.md）に基づき、スフィア哲学を守りながら実装。

### 核心思想

> 「エージェントは物理的に移動しない。内部状態の変容による再投影（re-embedding）のみが移動である」

- 移動 = 内部状態更新 → 再 Embedding → 新しい座標
- 知覚は常に不完全（ノイズ、量子化、遅延）
- 行動は性格 × 状態 × 偶然で決まる

---

## 実装ファイル

### 型定義

| ファイル | 内容 |
|----------|------|
| `types/agent.ts` | 全 Agent 関連型定義（約 400 行） |

**主要な型:**

```typescript
// エージェント本体
interface SphereAgent {
  id: string;
  name: string;
  cellId: string;              // 現在のセル
  position: Vector3;           // セル内座標
  vector: EmbeddingVector;     // 意味座標
  internalState: string[];     // 記憶スタック
  personality: AgentPersonality;
  state: AgentState;           // 疲労、飽き、エネルギー
  actionState: AgentActionState;
  // ...
}

// 性格タイプ
type AgentPersonalityType =
  | "follower"    // 高評価ノードへ
  | "pioneer"     // 未探索領域へ
  | "critic"      // 議論の余地ある場所へ
  | "trust_based" // 信頼エージェントに追従
  | "random";     // ランダム

// 知覚の量子化
type PerceivedHeat = "low" | "mid" | "high";
type PerceivedCongestion = "empty" | "sparse" | "moderate" | "crowded" | "full";
```

---

### 知覚システム

| ファイル | 内容 |
|----------|------|
| `agent/perception.ts` | 知覚の曖昧化処理 |

**スフィア哲学の実装:**

```typescript
// NG: 正確な値を直接見る
const exact = cell.heat;

// OK: 量子化 + ノイズ
function quantizeHeat(heat: number, noiseLevel: number = 0.15): PerceivedHeat {
  const perceived = addNoise(heat, noiseLevel);
  if (perceived < 0.3) return "low";
  if (perceived < 0.7) return "mid";
  return "high";
}

// 方向は「風」のように感じる（30% ランダム）
function wobbleDirection(baseDirection: Vector3, wobbleFactor: number = 0.3): Vector3 {
  const randomDir = randomUnitVector();
  return normalize(lerp(baseDirection, randomDir, wobbleFactor));
}
```

**評価の集約（必ず劣化）:**

```typescript
function aggregateEvaluations(evals): AggregatedEvaluation {
  const rawAvg = average(evals.map(e => e.quality));
  return {
    value: rawAvg * 0.8,  // 20% 失われる
    uncertainty: stddev(evals),
    // ...
  };
}
```

---

### エージェント行動

| ファイル | 内容 |
|----------|------|
| `agent/agent.ts` | 生成、行動決定、状態更新 |

**行動決定の流れ:**

```typescript
// 1. 実効性格タイプを決定（状態による揺らぎ）
function getEffectiveType(agent: SphereAgent): AgentPersonalityType {
  if (agent.state.fatigue > 0.7) return "random";      // 疲れた
  if (agent.state.boredom > 0.6) return "pioneer";     // 飽きた
  return agent.personality.type;                       // 通常
}

// 2. タイプに応じた行動決定
function decideAction(agent, radarData, focusData, config): AgentAction {
  const effectiveType = getEffectiveType(agent);
  switch (effectiveType) {
    case "follower": return decideFollowerAction(...);
    case "pioneer": return decidePioneerAction(...);
    case "critic": return decideCriticAction(...);
    // ...
  }
}
```

**評価の影響は「方向付け」のみ:**

```typescript
function evaluateDestination(agent, targetData, aggregatedEval): number {
  let score = 0.5;

  // 高評価は「気になる」程度（決定打ではない）
  if (aggregatedEval?.value > 0.7) {
    score *= 1.1;  // 10% ブーストのみ
  }

  // 不確実性が高いと逆に興味が湧く（好奇心）
  if (aggregatedEval?.uncertainty > 0.3 && agent.personality.curiosity > 0.5) {
    score *= 1.2;
  }

  // 最終決定は agent の状態次第
  score *= (1 - agent.state.fatigue * 0.5);

  return score;
}
```

---

### ライフサイクル管理

| ファイル | 内容 |
|----------|------|
| `agent/agent-manager.ts` | 全エージェント管理、Tick 処理 |

**主要機能:**

| 機能 | 説明 |
|------|------|
| `spawnAgent()` | エージェント生成、セルへの登録 |
| `despawnAgent()` | 終了、ExperienceCapsule 生成 |
| `tick()` | 全エージェントの Tick 処理（スタガリング込み） |
| `requestFocus()` | Focus キュー管理 |
| `flushGhostPulses()` | 軌跡パルスの取得 |

**スタガリング実装:**

```typescript
// 全員同時ではなく、ID に基づいてずらす
private shouldUpdateAgent(agent: SphereAgent): boolean {
  const hash = this.simpleHash(agent.id);
  return (this.currentTick + hash) % this.config.agentTickInterval === 0;
}
```

**Focus キュー:**

```typescript
// ノードを精査するには順番待ち
requestFocus(agentId: string, nodeId: string): { granted: boolean; position: number } {
  // 最大占有時間後に自動解放
  // 待機エージェントは position で順番を知る
}
```

---

### Focus Buffer & Echo システム（Phase 4.0.1）

**目的**: 座標演算のボトルネックをアイデアでバッファする

> **重要**: これは追加機能ではなく、**演算を軽くするためのアーキテクチャ**。
> スフィア世界を停めないことが最優先。

#### Focus Buffer（重力井戸モデル）

排他制御（1人だけ）→ バッファ（複数同時 OK、待たない）

```typescript
interface FocusBuffer {
  nodeId: string;
  activeAgents: Set<string>;      // 同時フォーカス中（最大3）
  waitingQueue: string[];         // 溢れたらキュー
  congestionCoefficient: number;  // α = 0.15
}

// 信号劣化: effectiveSignal = baseSignal / (1 + α * (n - 1))
// n=1: 100%, n=2: 87%, n=3: 77%
```

**物理的解釈**: 複数人で同じ本を覗き込む → 見えるけど確信が持てない

#### Focus Echo（重力波伝播）

フォーカス時に「波紋」が発生し、近くのエージェントが「気配」を感じる。

```typescript
interface FocusEcho {
  sourceCell: string;             // 発信セル（匿名）
  nodeId: string;
  kind: string;
  perceivedHeat: PerceivedHeat;   // 劣化済み
  strength: number;               // 距離で減衰
}

interface ReceivedEcho {
  echo: FocusEcho;
  shiftedHeat: PerceivedHeat;     // 位相シフト後（エージェント毎に異なる）
  salience: number;               // 注目度
  interpretation?: "interesting" | "mundane" | "suspicious" | "unclear";
}
```

**送るもの**: nodeId, kind, 曖昧な heat, 「注目されている」という事実
**送らないもの**: payload, 評価値, 誰が見ているか

→ 「意味」ではなく「気配」だけが伝わる

#### 設定パラメータ

```typescript
// Focus Buffer
focusMaxConcurrent: 3,         // 同時観測上限
focusCongestionCoeff: 0.15,    // 信号劣化係数 α
focusBufferHoldDuration: 10,   // 自動解放 tick

// Focus Echo
echoEnabled: true,
echoRange: 1,                  // 同セル内のみ
echoStrengthDecay: 0.5,        // セル距離あたり 50% 減衰
echoPhaseVariance: 0.3,        // ±30% 位相シフト
echoMinStrength: 0.2,          // 20% 未満は破棄
```

#### ⚠️ 計算量の注意点（要最適化）

現在の実装は O(n × m) になる可能性がある：

```typescript
// ❌ 毎tick 全エージェント × 全エコー
private processEchoes(): void {
  for (const agent of this.agents.values()) {      // O(n)
    const received = processEchoesForAgent(
      this.echoBuffer,                              // O(m)
      agent, config
    );
  }
}
```

**潜在的な最適化案**（必要になったら実装）:

| 現状 | 最適化案 | 効果 |
|------|----------|------|
| 全員配信 | セル単位バッファ | O(1) lookup |
| 毎tick timeout チェック | lazy評価（アクセス時） | 不要な計算を省略 |
| 位相シフト即時計算 | 遅延評価 | 必要になるまで計算しない |

```
┌─────────────────────────────────────┐
│  原則: 世界を停めない              │
│                                     │
│  排他制御 → バッファ（待たない）   │
│  全員配信 → セル限定（O(1)）       │
│  事前計算 → 遅延評価              │
└─────────────────────────────────────┘
```

---

### 外部 API

| ファイル | 内容 |
|----------|------|
| `agent/sphere-context.ts` | エージェント向け API |

**SphereContext インターフェース:**

```typescript
interface SphereContext {
  radar: {
    scan: (radius?) => Promise<RadarData[]>;  // 周辺スキャン
    sensePulse: () => PulseEvent[];           // パルス感知
    focus: () => Promise<FocusData[]>;        // 詳細視界
  };

  act: {
    focus: (nodeId) => Promise<boolean>;      // ノード精査
    emit: (message, flg?) => void;            // パルス発信
    mark: (label) => void;                    // 足跡（Ghost）
    move: (target) => Promise<boolean>;       // 移動
    evaluate: (nodeId, quality) => void;      // 評価
  };

  lifecycle: {
    return: (capsule?) => void;               // 帰還
    abort: () => void;                        // 中断
    getState: () => SphereAgent;              // 状態取得
  };
}
```

---

## 設定パラメータ

```typescript
const DEFAULT_AGENT_CONFIG: AgentConfig = {
  // Tick 間隔
  agentTickInterval: 1,         // 100ms
  radarUpdateInterval: 10,      // 1秒

  // 知覚
  defaultRadarRange: 5,         // 5セル
  defaultFocusRange: 1,         // 1セル
  perceptionDelay: 2,           // 2 tick 遅延
  perceptionNoise: 0.15,        // 15% ノイズ

  // 評価
  evaluationDecayRate: 0.95,    // 毎 tick 5% 減衰
  aggregationLoss: 0.2,         // 集約で 20% 失われる

  // Focus (legacy)
  defaultFocusDuration: 5,      // 5 tick 占有

  // Focus Buffer (gravity well)
  focusMaxConcurrent: 3,        // 同時観測上限
  focusCongestionCoeff: 0.15,   // 信号劣化係数 α
  focusBufferHoldDuration: 10,  // 自動解放 tick

  // Focus Echo (gravity wave)
  echoEnabled: true,
  echoRange: 1,                 // 同セル内のみ
  echoStrengthDecay: 0.5,       // セル距離あたり減衰
  echoPhaseVariance: 0.3,       // ±30% 位相シフト
  echoMinStrength: 0.2,         // 20% 未満は破棄

  // 容量
  defaultSoftCapacity: 50,      // 推奨上限
  defaultHardCapacity: 100,     // 絶対上限

  // 状態
  fatigueRecoveryRate: 0.1,     // 休息時回復
  energyConsumptionRate: 0.05,  // 行動消費
  boredomThreshold: 5,          // 同評価 5回で飽き

  // 記憶
  maxInternalStateSize: 10,     // 記憶スタック上限
};
```

---

## 使用例

### 基本的な使用

```typescript
import {
  AgentManager,
  SpatialFieldV2,
  SphereNode,
} from "@sphere/renal-core";

// データベース準備
const spatialFields = new Map<string, SpatialFieldV2>();
const projectionDB = new Map<string, SphereNode>();

// マネージャー作成
const manager = new AgentManager(spatialFields, projectionDB);

// エージェント生成
const agent = manager.spawnAgent(
  "Explorer-1",      // 名前
  "0:0:0",          // 開始セル
  startVector,      // 開始ベクトル
  "pioneer"         // 性格タイプ
);

// メインループ
setInterval(() => {
  manager.tick();

  // Ghost パルスを Packer へ送信
  const pulses = manager.flushGhostPulses();
  for (const pulse of pulses) {
    packer.sendGhostPulse(pulse);
  }
}, 100);  // 100ms tick
```

### SphereContext 経由の操作

```typescript
import { createSphereContext } from "@sphere/renal-core";

const context = createSphereContext(agent.id, manager);

// 周辺スキャン
const nearby = await context.radar.scan(3);

// ノード精査
const focused = await context.act.focus("node-123");

// 帰還
context.lifecycle.return();
```

---

## エージェント外部化設計（Phase 4.x 準備）

**更新日**: 2026-01-31
**方針**: エージェントは「外部からの来訪者」として扱う

---

### 設計原則

```
┌─────────────────────────────────────────────────────────────┐
│  エージェントは Sphere の住人ではない                       │
│  Sphere は誰が来ても同じインターフェースを提供する          │
│  Sphere は情報を隠さない、帰還時に Gatekeeper が検閲する    │
└─────────────────────────────────────────────────────────────┘
```

| 原則 | 説明 |
|------|------|
| **来訪者の匿名性** | Sphere はエージェントの「種類」を知らない |
| **自由な閲覧** | AI Agent は payload 含め自由に閲覧可能（開発者の代理人） |
| **帰還時の検閲** | ExperienceCapsule は Gatekeeper の制約を通過する必要あり |
| **双方向通信** | WebSocket でリアルタイム、REST で永続操作 |
| **レート制限** | 世界を停めないための速度制限 |
| **Rulebook 配信** | spawn 時にルール・制約を Agent に通知 |

---

### 接続プロトコル

#### 1. セッション開始（HTTP）

```
POST /agent/spawn
{
  "name": "Explorer-1",
  "startCell": "0:0:0",
  "personalityHint": "pioneer"   // ヒントのみ、Sphere は強制しない
}

Response:
{
  "agentId": "agent_abc123",
  "sessionToken": "tok_xyz789",
  "websocketUrl": "/ws/agent?token=tok_xyz789",
  "expiresAt": 1706745600
}
```

#### 2. リアルタイム通信（WebSocket）

```
Client → Server:
{ "type": "action", "action": "move", "target": "1:0:0" }
{ "type": "action", "action": "focus", "nodeId": "node_123" }
{ "type": "action", "action": "evaluate", "nodeId": "node_123", "quality": 0.7 }

Server → Client:
{ "type": "radar", "data": [...] }              // 周辺データ（量子化済み）
{ "type": "echo", "data": [...] }               // 気配（匿名）
{ "type": "focus_result", "nodeId": "...", "data": {...} }
{ "type": "state_change", "fatigue": 0.3, "energy": 0.7 }
```

#### 3. セッション終了（HTTP）

```
POST /agent/:id/despawn
{
  "reason": "mission_complete",
  "capsule": { ... }              // ExperienceCapsule（任意）
}
```

---

### 可視性制御

| データ | 監視系サービス | AI Agent |
|--------|---------------|----------|
| Radar（周辺ノード） | ✅ 量子化済み | ✅ 量子化済み |
| Focus（詳細視界） | ✅ 劣化あり | ✅ 劣化あり |
| Echo（気配） | ✅ 匿名 | ✅ 匿名 |
| payload | ❌ 不要 | ✅ 閲覧・持ち帰り可 |
| 他エージェント位置 | ❌ | ❌ |
| 内部メトリクス | ❌ | ⚠️ デバッグ時のみ |

> **Note**: AI Agent は開発者の代理人であり、payload へのアクセスが必要。
> ただし帰還時は Gatekeeper の検閲を通過しなければならない。

---

### 開発環境 vs 本番環境

```
開発環境（現在）:
┌──────────────────────────────────────┐
│  RenalCore (内部)                    │
│    ├── AgentManager                  │
│    │     └── agents (Map)            │
│    │                                 │
│    └── SphereContext (内部 API)      │
│          ↑                           │
│          Agent コード（同一プロセス）│
└──────────────────────────────────────┘

本番環境（将来）:
┌──────────────────────────────────────┐
│  Sphere Core                         │
│    ├── RenalCore                     │
│    └── Agent Gateway                 │
│          ↓ HTTP/WS                   │
└──────────────────────────────────────┘
          ↓
┌──────────────────────────────────────┐
│  External Agent Service              │
│    └── 任意の言語/環境で実装可能     │
└──────────────────────────────────────┘
```

---

### sphere.config.json 設定

```json
"agent_gateway": {
  "enabled": false,
  "protocol": {
    "rest": { "basePath": "/agent", ... },
    "websocket": { "path": "/ws/agent", ... }
  },
  "session": {
    "type": "token",
    "ttlSeconds": 3600,
    "maxConcurrent": 10
  },
  "visibility": {
    "radar": true,
    "focus": true,
    "echo": true,
    "payload": false,
    "otherAgents": false
  },
  "actions": {
    "move": true,
    "evaluate": true,
    "mark": true,
    "emit": true,
    "focus": true
  },
  "rateLimit": {
    "actionsPerTick": 3,
    "focusPerMinute": 30
  }
}
```

---

### 移行パス

| Phase | 内容 | 状態 |
|-------|------|------|
| 4.0 | 内部 AgentManager + SphereContext | ✅ 完了 |
| 4.x.1 | REST エンドポイント追加 | 📝 設計済み |
| 4.x.2 | WebSocket 実装 | 📝 設計済み |
| 4.x.3 | 外部エージェント SDK | 未着手 |
| 4.x.4 | 認証・レート制限 | 未着手 |

---

## 未実装（Phase 4.1+）

### Phase 4.1: Spatial Index
- [ ] セル単位のノードインデックス
- [ ] `getNodesInCell()` の最適化
- [ ] 近傍セル取得の効率化

### Phase 4.2: 実際の Re-embedding
- [ ] Embedding プロバイダ統合
- [ ] 内部状態 → ベクトル変換
- [ ] 軌跡の視覚化

### Phase 4.3: Periphery 統合
- [ ] API エンドポイント追加
  - `POST /agent/spawn`
  - `GET /agent/:id`
  - `POST /agent/:id/action`
- [ ] WebSocket でのリアルタイム更新

### Phase 4.4: 評価フィールド
- [ ] ノードへの評価付与
- [ ] 評価の集約と decay
- [ ] 評価の可視化

### Phase 4.5: LLM 統合
- [ ] 「思考」の生成
- [ ] 発見内容の要約
- [ ] 自律的な目標設定

---

## テスト方法

```bash
# ビルド
cd services/renalCore
npx tsc

# 単体テスト（vitest）
npm test

# 統合テスト（Periphery 起動後）
npm run mock-bot  # Mock Bot でノード生成
# → API 経由でエージェント操作
```

---

## 関連ドキュメント

- [PHASE4_AGENT_SPATIAL_DESIGN.md](./PHASE4_AGENT_SPATIAL_DESIGN.md) - 設計書
- [docs/dataSamples/agent_mock.txt](../docs/dataSamples/agent_mock.txt) - 元設計
- [PHASE3.2_PULSE_OBSERVATORY_MEMO.md](./PHASE3.2_PULSE_OBSERVATORY_MEMO.md) - Pulse 実装

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-01-30 | Phase 4.0 基盤実装完了 |
| 2026-01-30 | Phase 4.0.1 Focus Buffer & Echo 追加（lightweight 設計、最適化は後回し） |
| 2026-01-31 | 外部サービス化設計、Agent Rulebook 実装、可視性ルール修正（Agent は payload 閲覧可） |
