# Sphere Periphery - Developer Guide

開発者向け API リファレンス・テストスクリプト一覧

---

## 1. サーバー起動

```bash
cd services/periphery
npm run dev      # 開発モード（hot reload）
npm run build    # ビルド
npm run start    # 本番起動
```

サーバーは2つのポートで起動：
- **HTTP REST API**: `http://localhost:3001`
- **WebSocket Gateway**: `ws://localhost:8081`

---

## 2. HTTP REST API

### 2.1 情報系

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | `/` | Sphere 情報（バージョン、エンドポイント一覧、メトリクス）|
| GET | `/health` | ヘルスチェック |
| GET | `/metrics` | システムメトリクス（nodeCount, agents, field, memory）|
| GET | `/stats` | システム統計（legacy）|
| GET | `/rulebook` | エージェント用ルールブック |
| GET | `/schema` | データフォーマット仕様 |

### 2.2 ノード観測

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | `/nodes/metrics` | 全ノードのメトリクス一覧（heat 順）|
| GET | `/nodes/stats` | ノード統計（kind 別カウント）|
| GET | `/nodes/:id` | 特定ノードの詳細 |

### 2.3 探索・貢献

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | `/sphere/explore?q=<query>` | クエリで探索（limit, radius オプション）|
| POST | `/sphere/contribute` | 外部データ投入（単体/バッチ）|

**contribute リクエスト例**:
```json
{
  "source": "external-system",
  "capsule": {
    "topTier": [{ "tags": ["knowledge"], "summary": "...", "initialHeat": 80 }],
    "normalNodes": [],
    "ghostNodes": [],
    "timestamp": 1234567890
  }
}
```

### 2.4 Dive（エージェント入場）

| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | `/dive/request` | Dive チケット発行 |
| GET | `/dive/validate/:token` | チケット検証（デバッグ用）|
| GET | `/dive/stats` | チケット統計 |

**チケット発行レスポンス**:
```json
{
  "success": true,
  "ticket": {
    "token": "abc123...",
    "expiresIn": 120,
    "capabilities": ["sense", "move", "focus", "emit", "return"]
  }
}
```

### 2.5 Quest（外部からの検証依頼）

| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | `/quest` | クエスト投稿 |
| GET | `/quest/stats` | クエストストア統計 |

**quest リクエスト例**:
```json
{
  "query": "Is quantum computing viable for cryptography?",
  "tags": ["quantum", "cryptography", "security"],
  "submitterId": "user-123"
}
```

**設計思想**: Quest は FIFO で管理。TTL なし、意図的削除なし。多くのエージェントが同じクエストを受け、評価を残す。

### 2.6 Forge（内部ノード生成）- 認証必須

| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | `/sphere/forge/environmental` | Environmental ノード生成（Observatory 用）|

**認証ヘッダー**:
```
X-Service-Id: observatory
X-Service-Secret: <secret>
```

---

## 3. WebSocket Gateway API

接続: `ws://localhost:8081?token=<dive-ticket>`

### 3.1 接続フロー

```
Agent                          Gateway
  │                               │
  ├─ connect with token ─────────→│ → welcome
  │                               │
  ├─ entry { request } ──────────→│ → processing
  │                               │   → amber_showcase (optional)
  │                               │   → positioned (初期位置決定)
  │                               │
  ├─ sense/focus/move/... ───────→│ → 各種 result
  │                               │
  ├─ return { capsule? } ────────→│ → returnAck (切断)
```

### 3.2 メッセージ一覧

#### Agent → Gateway

| Type | Payload | 説明 |
|------|---------|------|
| `entry` | `{ requestId, request: EntryRequest }` | 入場リクエスト |
| `sense` | `{ requestId, radius? }` | 周囲ノード知覚 |
| `focus` | `{ requestId, nodeId }` | ノード詳細取得 |
| `evaluate` | `{ requestId, nodeId, score }` | ノード評価 |
| `move` | `{ step, mode: MoveIntent }` | 移動 |
| `warp` | `{ requestId, nodeId }` | ワープ |
| `return` | `{ requestId, capsule? }` | 帰還 |
| `enterSanctuary` | `{ requestId }` | Sanctuary 層へ |
| `enterCore` | `{ requestId }` | Core 層へ |

**EntryRequest**:
```typescript
{
  query: string;      // 探索クエリ
  tags: string[];     // 方向タグ
  quest?: string;     // 選択した Quest テキスト（optional）
}
```

#### Gateway → Agent

| Type | Payload | 説明 |
|------|---------|------|
| `welcome` | `{ sessionId, rulebookUrl, quests, message }` | 接続成功 |
| `processing` | `{ sessionId, message }` | Parser 処理中 |
| `amber_showcase` | `{ sessionId, amber: AmberShowcaseEntry[] }` | Amber ノード一覧 |
| `positioned` | `{ sessionId, position, questVector?, remainingTime, query, tags, quest? }` | 初期位置決定 |
| `senseResult` | `{ requestId, nodes: NearbyNode[] }` | sense 結果 |
| `focusResult` | `{ requestId, node: NodeDetail }` | focus 結果 |
| `moveResult` | `{ requestId, result: MoveResult }` | move 結果 |
| `warpResult` | `{ requestId, result: WarpResult }` | warp 結果 |
| `error` | `{ requestId?, error }` | エラー |
| `expelled` | `{ reason }` | 強制退場 |

### 3.3 positioned メッセージ

```typescript
{
  type: "positioned",
  sessionId: string,
  position: number[],      // 384次元ベクトル（初期位置）
  questVector?: number[],  // Quest ベクトル（コンパス）- optional
  remainingTime: number,   // 残りセッション時間
  query: string,           // 元のクエリ
  tags: string[],          // 元のタグ
  quest?: string           // 選択した Quest テキスト
}
```

---

## 4. Sphere CLI (sphere.bat)

プロジェクトルートの `sphere.bat` で統一的に操作可能。

### 4.1 基本コマンド

```bash
# ヘルプ
sphere help

# サーバー起動
sphere start

# サーバー停止
sphere stop

# ステータス確認
sphere status
```

### 4.2 テストコマンド

| コマンド | 説明 |
|---------|------|
| `sphere batch` | テストデータ投入（60 items）|
| `sphere contribute 1` | 1 アイテム投入 |
| `sphere contribute 10` | 10 アイテム投入 |
| `sphere contribute 50` | 50 アイテム投入 |
| `sphere wave` | Wave inject（50 items, 3s delay）|
| `sphere wave 100 2000` | Wave inject 100 items, 2s delay |
| `sphere swarm` | スウォームエージェント（デフォルト 3 体）|
| `sphere swarm 10` | スウォームエージェント 10 体 |
| `sphere explore` | 3層探索テスト |
| `sphere full` | batch + explore（フルテスト）|

### 4.3 インタラクティブモード

引数なしで実行すると対話式メニュー：

```bash
sphere

========================================
  Sphere CLI - Interactive Mode
========================================

  [1] start       - Start Periphery server
  [2] stop        - Stop all services
  [3] batch       - Inject test data (60 items)
  [4] contribute  - Inject test data (1/10/50/custom)
  [5] wave        - Wave inject (staggered)
  [6] swarm       - Run swarm agents
  [7] explore     - Run 3-layer exploration
  [8] full        - batch + explore
  [0] status      - Show server status
  [q] quit

Select [0-8, q]:
```

### 4.4 npm スクリプト（periphery 直接実行）

```bash
cd services/periphery
```

| スクリプト | コマンド | 説明 |
|-----------|---------|------|
| 開発サーバー | `npm run dev` | hot reload で起動 |
| 単体貢献 | `npm run contribute` | 1つの ExperienceCapsule を投入 |
| バッチ貢献 | `npm run contribute:batch` | 複数カプセルをバッチ投入 |
| 探索エージェント | `npm run explore` | 3層探索テスト |
| スウォーム | `npm run swarm` | 複数エージェント同時 Dive |
| スウォーム(5体) | `npm run swarm:5` | 5 エージェント |
| スウォーム(10体) | `npm run swarm:10` | 10 エージェント |
| 埋め込みテスト | `npm run test:embedding` | ローカル埋め込みモデルテスト |

### 4.5 典型的なテストフロー

```bash
# CLI を使う場合
sphere start       # サーバー起動（別ウィンドウ）
sphere batch       # テストデータ投入
sphere explore     # 探索テスト

# または一括で
sphere full        # batch + explore

# npm を直接使う場合
cd services/periphery
npm run dev                 # ターミナル1
npm run contribute:batch    # ターミナル2
npm run explore             # ターミナル3
```

---

## 5. 設定 (PeripheryConfig)

`types/config.ts` で定義。主要設定項目：

```typescript
{
  // Parser（埋め込み）
  parser: {
    batchSize: 8,
    vectorDimension: 384,
    embeddingProvider: "local",  // "mock" | "local"
  },

  // サーバー
  server: {
    port: 3001,      // HTTP
    wsPort: 8081,    // WebSocket
  },

  // Quest Store
  questStore: {
    maxSize: 100,       // 最大クエスト数（FIFO）
    showcaseSize: 10,   // Showcase 表示数
  },

  // Amber Cache
  amberCache: {
    maxSize: 100,
    showcaseSize: 30,
    showcaseRefreshIntervalMs: 3600000,  // 1 hour
  },
}
```

---

## 6. アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────┐
│                    Periphery Service                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │  HTTP REST   │   │   Gateway    │   │  Quest      │  │
│  │  (Express)   │   │  (WebSocket) │   │  Store      │  │
│  └──────┬───────┘   └──────┬───────┘   └─────────────┘  │
│         │                  │                             │
│         v                  v                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │                    Membrane                       │   │
│  │              (Input Validation)                   │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│                          v                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │               Parser / EntryBuffer                │   │
│  │           (Vectorization, Batching)               │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│                          v                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Incarnation Pipeline                   │   │
│  │    (Tagger → Packer → Bookkeeper → RefDB)        │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│                          v                               │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │    ProjDB      │  │     RefDB      │                 │
│  │ (In-Memory)    │  │  (Persistent)  │                 │
│  └────────────────┘  └────────────────┘                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 7. 主要コンポーネント

| コンポーネント | ファイル | 役割 |
|---------------|---------|------|
| PeripheryServer | `server.ts` | HTTP REST API |
| GatewayServer | `gateway/gateway-server.ts` | WebSocket Gateway |
| EntryBuffer | `parser/buffer.ts` | ベクトル化バッチ処理 |
| QuestStore | `gateway/quest-store.ts` | Quest 管理（FIFO）|
| UnifiedAmberCache | `gateway/amber-cache.ts` | Amber ノードキャッシュ |
| SphereCoreAdapter | `gateway/sphere-core-adapter.ts` | sense/focus/move の実装 |
| TicketIssuer | `gateway/ticket-issuer.ts` | Dive チケット管理 |
| Membrane | `membrane/membrane.ts` | 入力バリデーション |

---

## 8. Quest フロー詳細

```
External World                    Sphere
     │                              │
     ├─ POST /quest ───────────────→│ QuestStore に保存（FIFO）
     │  { query, tags }             │
     │                              │
     │                              │
Agent ←─ welcome ──────────────────┤ quests[] で Quest 一覧受信
     │                              │
     ├─ entry ─────────────────────→│
     │  { query, tags, quest }      │ quest テキストを含めて送信
     │                              │
     │                              │ Parser: query → position
     │                              │ Parser: quest → questVector
     │                              │
     │←─ positioned ───────────────┤
     │  { position, questVector }   │ コンパスとして questVector 受信
     │                              │
     │  (Agent は自身のコンテキストに│
     │   questVector を保存して探索) │
```

---

## 9. 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `NODE_ENV` | `development` | `production` で DEV 加速無効化 |
| `PORT` | `3001` | HTTP サーバーポート |
| `WS_PORT` | `8081` | WebSocket ポート |
| `SPHERE_CONFIG` | `../../../sphere.config.json` | config ファイルパス |
| `SPHERE_URL` | `http://localhost:3001` | mock スクリプト用 |

詳細な設定リファレンスは `docs/config-reference.md` を参照。

---

作成日: 2025-02-03
更新日: 2026-02-07
バージョン: v1.1
