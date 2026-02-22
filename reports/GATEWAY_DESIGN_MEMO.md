# Gateway Design Memo

Sphere Project - エージェント接続層設計メモ

---

## 1. 概要

Gateway は WebSocket 接続を管理し、エージェントに SphereContext（Capability-based API）を提供する層。

---

## 2. アーキテクチャ

```
[Agent]
   │ HTTP（認証・Ticket発行）
   ▼
[Periphery]  ← Dive Ticket発行、HTTP REST API
   │
   │ WebSocket
   ▼
[Sphere Gateway]  ← 存在の流れを捌く、ctx配布
   │
   ▼
[Sphere Core]  ← 物理法則のみ、座標の正本
```

### 責務分担

| 層 | 責務 |
|---|---|
| Periphery | HTTP REST, 認証, Capability付与, Dive Ticket発行 |
| Gateway | WS接続, ライフサイクル管理, SphereContext配布 |
| Core | 物理法則, 座標の正本, 熱量・通行量の記録 |

---

## 3. SphereContext API

エージェントに渡される Capability-based API（リモコン）。

```typescript
interface SphereContext {
  // ===== 状態 =====
  readonly position: Vector;      // 現在座標（Sphere側が管理）
  readonly sessionId: string;     // セッション識別子
  readonly remainingTime: number; // 残り時間（秒）

  // ===== 感知 =====
  sense(radius?: number): Promise<NearbyNode[]>;
  // → 周囲のノードを感知
  // → 返却: { id, distance, summary, heat, kind, flags }

  // ===== フォーカス =====
  focus(nodeId: string): Promise<NodeDetail>;
  // → ノードに接近・詳細取得
  // → 熱量加算のトリガー
  // → レート制限: focusPerMinute

  // ===== 評価 =====
  evaluate(nodeId: string, score: number): Promise<void>;
  // → ノードに評価を与える（-1.0 〜 1.0）
  // → ノードの熱量に影響

  // ===== 移動 =====
  move(intent: MoveIntent): Promise<MoveResult>;
  // → 意図を出す（実際の移動はSphereが決定）
  // → 返却: { success, newPosition, blocked? }

  // ===== 帰還 =====
  return(capsule?: ExperienceCapsule): Promise<void>;
  // → セッション終了
  // → capsuleあり: Gatekeeper検証 → Pipeline
  // → capsuleなし: 手ぶらで帰還

  // ===== イベント受信 =====
  on(event: "warning", handler: (msg: string) => void): void;
  on(event: "nearby", handler: (nodes: NearbyNode[]) => void): void;
  on(event: "expelled", handler: (reason: string) => void): void;
}

interface MoveIntent {
  toward?: string;      // コンセプトキーワード → ベクトル化
  dx?: number;          // 相対座標移動
  dy?: number;
  dz?: number;
}

interface MoveResult {
  success: boolean;
  position: Vector;     // 移動後の座標
  blocked?: string;     // ブロックされた理由
}

interface NearbyNode {
  id: string;
  distance: number;
  summary: string;
  heat: number;
  kind: NodeKind;
  flags: number;
}

interface NodeDetail extends NearbyNode {
  payload?: string;
  tags: string[];
  ref_url?: string;
  fullContent?: string;
}
```

---

## 4. 座標管理

**原則: 座標の正本は Sphere 側。エージェントは意図のみ出す。**

```
Agent: ctx.move({ toward: "keyword" })  // 意図
       ctx.move({ dx: 0.1, dy: -0.05 }) // 意図
           ↓
Sphere: 「歩けたかどうか」を決める
        座標の正本を更新
        局所密度・混雑ペナルティ計算
           ↓
Agent: MoveResult を受け取る
```

エージェントが自分の座標を決められない理由：
- テレポート防止
- 嘘の近接防止
- 負荷偽装防止

---

## 5. 体験抽出

**原則: エージェントを信頼する。Capsule はエージェントが作成・提出。**

```
ctx.return(capsule?)
   ↓
Gateway: Gatekeeper検証
   ↓
Gatekeeper: Rulebook制約チェック
   - ノード数上限
   - ペイロードサイズ
   - summary長
   - heat範囲
   ↓
ExperienceCapsule
   ↓
Incarnation Pipeline
```

これにより：
- エージェントの自主性を尊重
- 既存Pipeline処理をそのまま活用
- Gatekeeperが常識的フィルタリングを担当

---

## 6. セッション制約（Rulebook定義済み）

```typescript
session: {
  maxDurationSeconds: 3600,           // セッション全体: 1時間
  warningBeforeExpiry: 300,           // 終了警告: 5分前
  disconnectGraceSeconds: 120,        // 切断猶予: 2分
  disconnectWarningSeconds: 90,       // 切断警告: 90秒時点
}

rateLimit: {
  actionsPerTick: 3,
  focusPerMinute: 30,
}
```

---

## 7. 接続方式

**基本は WebSocket、ただし必須ではない構造。**

```typescript
SphereContext
  ├─ transport: WebSocket | SSE | HTTP
  └─ capability: 同一
```

- WebSocket: 連続探索に最適
- SSE / HTTP long-polling: 断続的観測モード

接続方式は「身体の形状差」であって、意識の差ではない。

---

## 8. 未決定事項

### 8.1 プロセス構成

```
案A: 同一プロセス
[Periphery + Gateway] ← Express + WS を同居

案B: 別プロセス
[Periphery] ←HTTP→ [Gateway] ←WS→ [Agent]
```

### 8.2 Dive Ticket

- 形式: JWT? 単純token?
- 発行: Periphery
- 検証: Gateway
- 有効期限: セッション制約に従う

### 8.3 Gateway-Core間通信

- 同一プロセス内呼び出し?
- メッセージキュー?
- gRPC?

---

## 9. 実装状況

| 機能 | 状態 |
|------|------|
| 概念設計 | ✅ 完了 |
| SphereContext型定義 | 🔲 未実装 |
| Gateway実装 | 🔲 未実装 |
| Dive Ticket発行 | 🔲 未実装 |
| 体験抽出ロジック | 🔲 未実装 |
| WebSocket接続管理 | 🔲 未実装 |

---

## 10. 設計決定事項（確定）

### 10.1 sense() の返却内容 ✅

```typescript
interface NearbyNode {
  id: string;        // 同一性の鍵
  distance: number;  // 遠近（実距離 or セル距離）
  summary: string;   // 匂い・見出しレベル
  heat: number;      // 観測値（誤差含む）
  kind: NodeKind;    // 行為選択のための分類
  flags: number;     // ghost/unstable/crowded/decaying等の兆候
}
```

**含めないもの（重要）**:
- 正確なpayload
- 正確なTTL
- 正確なフォーカス人数

> sense は「世界を読む」ではなく「世界に気配があるか感じる」

### 10.2 focus() と熱量加算 ✅

**focus は「読む行為」ではなく「滞在行為」**

熱量加算は即時ではなく、Tick単位で計算:

```typescript
// 熱量加算の物理式
Δheat = base
      × duration        // フォーカス継続時間
      × crowdPenalty    // 混雑度による減衰
      × resonanceFactor // 同調・共鳴係数
```

**設計意図**:
- ワンショット focus スパムは効かない
- 居続けると意味を持つ
- 物理現象として自然

### 10.3 move() の返却 ✅

```typescript
interface MoveResult {
  success: boolean;   // 意図が通ったか
  position: Vector;   // Sphere側が決めた現在地（正本）
  blocked?: string;   // 失敗理由の「兆候」のみ
}

// blocked の種類（詳細理由は返さない）
type BlockReason =
  | "congestion"   // 混雑
  | "boundary"     // 境界
  | "decayZone"    // 減衰地帯
  | "permission";  // 権限
```

> 世界は理由を説明しない

### 10.4 帰還時の体験処理 ✅

**決定: エージェント提出型（ExperienceCapsule）を信頼する**

```
Agent → ExperienceCapsule作成 → Gatekeeper検証 → Pipeline → Bookkeeper
```

**理由**:
- エージェントを信じる設計
- Gatekeeperが常識的なフィルタリングを担当
- 既存の Pipeline 処理がそのまま使える

> エージェントは信頼される存在

---

## 11. アーキテクチャ決定事項（確定）

### 11.1 プロセス構成 ✅

**決定: 別プロセス（最低でも論理分離）**

```
[ Client / External Agent ]
          │
       Gateway
    (WS / HTTP)
          │
   ── Capability ──
          │
      Sphere Core
   (Tick / Heat / Grid)
```

**理由**:
- Sphere = 「世界の物理」
- Periphery/Gateway = 「接続と翻訳」
- 同一にすると通信の都合が物理を歪める
- Sphereは同期的に世界を進める
- Gatewayは非同期で人を捌く

> プロセスを分けることで「世界は止まらない」を保証

### 11.2 Dive Ticket ✅

**決定: 単純opaque token（JWTは不適）**

```typescript
interface DiveTicket {
  token: string;      // random opaque id（中身は読めない）
  issuedAt: number;   // 発行時刻
  ttl: number;        // 有効期限
  capsRef: string;    // Capability set への参照
}
```

**JWTを採用しない理由**:
- JWTは自己完結・長寿命・再利用向き
- Diveは一時的な潜水 → Sphere哲学と逆
- Dive = 入場券、JWT = 身分証（役割が違う）
- tokenは Sphere側でのみ意味を持つ
- 失効したら世界に入れない

**二層TTL設計**:
| 種類 | 値 | 役割 |
|------|-----|------|
| Ticket TTL | 300秒 | 入場猶予（扉の前に立てる時間） |
| Session TTL | 120秒 | 体験時間（世界にいられる時間） |

> スフィアは訪問世界。居住ではない。

**発行条件**:
- 認証: 不要
- API Key: 不要
- レート制限: 必須（10/分/IP、同時3セッション/IP）

**エンドポイント**:
- `POST /dive/request`: Ticket発行
- `GET /dive/validate/:token`: Ticket検証（デバッグ用）
- `GET /dive/stats`: 統計情報

### 11.3 Gateway-Core間通信 ✅

**決定: Message Queue / Channel型**

```
Gateway → Sphere:
  dive, move, focus, emit

Sphere → Gateway:
  senseResult, echo, returnAck
```

**やってはいけない**:
- REST直結
- 同期RPC

**必要な性質**:
- 非同期
- 順序保証あり
- Backpressureをかけられる

**実装候補**:
- Node同一VM: EventEmitter / Channel
- 別プロセス: NATS / Redis Streams / ZeroMQ

---

## 12. 実装状況

| 機能 | 状態 | ファイル |
|------|------|----------|
| 概念設計 | ✅ 完了 | - |
| API設計決定 | ✅ 完了 | - |
| アーキテクチャ決定 | ✅ 完了 | - |
| SphereContext型定義 | ✅ 完了 | `types/gateway.ts` |
| Gateway-Core通信型 | ✅ 完了 | `types/gateway.ts` |
| DiveTicket型 | ✅ 完了 | `types/gateway.ts` |
| 体験処理（Gatekeeper） | ✅ 既存 | `gatekeeper/gatekeeper.ts` |
| Dive Ticket発行 | ✅ 完了 | `gateway/ticket-issuer.ts` |
| Diveエンドポイント | ✅ 完了 | `server.ts` |
| SphereContext実装 | ✅ 完了 | `gateway/sphere-context.ts` |
| WebSocket接続管理 | ✅ 完了 | `gateway/gateway-server.ts` |
| PeripheryServer統合 | ✅ 完了 | `server.ts` |

---

## 13. 接続フロー（実装済み）

```
1. POST /dive/request
   → token取得

2. ws://localhost:8081?token=xxx
   → Gateway接続

3. Gateway: token検証 → consume → SphereContext作成
   → Agent: { type: "ready", sessionId, position, remainingTime }

4. Agent → Gateway: { type: "sense", requestId: "..." }
   ← Gateway: { type: "senseResult", requestId: "...", nodes: [...] }

5. Agent → Gateway: { type: "focus", requestId: "...", nodeId: "..." }
   ← Gateway: { type: "focusResult", requestId: "...", node: {...} }

6. Agent → Gateway: { type: "move", requestId: "...", intent: {...} }
   ← Gateway: { type: "moveResult", requestId: "...", result: {...} }

7. Agent → Gateway: { type: "return", requestId: "...", capsule?: {...} }
   ← Gateway: { type: "returnAck", requestId: "..." }
   → 接続終了
```

---

## 14. ファイル構成

```
services/periphery/src/
├── gateway/
│   ├── index.ts            # モジュールエクスポート
│   ├── ticket-issuer.ts    # Dive Ticket発行・検証・消費
│   ├── gateway-server.ts   # WebSocket接続管理
│   └── sphere-context.ts   # SphereContext実装（stub）
├── types/
│   ├── gateway.ts          # Gateway型定義
│   └── config.ts           # wsPort追加
└── server.ts               # GatewayServer統合
```

---

## 15. 未実装・次のステップ

| 機能 | 優先度 | 備考 |
|------|--------|------|
| Sphere Core連携 | 高 | stub → 実処理 |
| 切断猶予処理 | 中 | 120s grace period |
| 負荷テスト | 低 | 複数同時接続 |
| SSE/HTTP fallback | 低 | WebSocket以外の接続方式 |

---

作成日: 2025-01-31
更新日: 2025-01-31
ステータス: Gateway実装完了（stub版）、Core連携待ち

