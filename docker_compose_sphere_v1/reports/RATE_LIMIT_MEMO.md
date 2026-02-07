# Rate Limit 実装メモ

## 日付: 2026-02-07

## 概要
HTTP エンドポイントと WebSocket メッセージの両方にレート制限を追加。
AWS 公開前の防御策として実装。

---

## HTTP Rate Limiting (express-rate-limit)

### 3段階の制限

| Tier | 制限 | 対象 |
|------|------|------|
| heavy | 10/min | `/sphere/contribute`, `/sphere/forge/environmental` |
| medium | 30/min | `/sphere/explore`, `/quest` |
| read | 120/min | `/nodes/metrics`, `/nodes/stats`, `/nodes/:id` |

### 適用外
- `/health`, `/metrics`, `/stats` — モニタリング用、制限なし
- `/rulebook`, `/schema` — 公開情報、制限なし
- `/dive/request` — TicketIssuer に既存の rate limit あり (30/min, 10 concurrent)

### 実装
- `express-rate-limit` パッケージ使用
- `standardHeaders: true` で `RateLimit-*` ヘッダー返却
- 超過時 429 + `{ success: false, error: "Rate limit exceeded (N/min)" }`

---

## WebSocket Rate Limiting (per-connection)

### 制限値 (sphere.config.json `agent_gateway.rateLimit` と同値)

| 制限 | 値 | 備考 |
|------|----|------|
| actionsPerTick | 3/sec | 全アクション共通 |
| focusPerMinute | 30/min | focus のみ追加制限 (ベクトル検索が重い) |

### 設計
- `WsRateLimiter` クラス (gateway-server.ts 内)
- per-connection: `wsRateLimiters: Map<sessionId, WsRateLimiter>`
- `return` は常に許可 (graceful exit を阻害しない)
- 超過時: `error` メッセージで返却 (WebSocket なので HTTP 429 ではない)

### アクションカウンタ
- per-second: 単純カウンタ + リセットタイム
- focus/minute: sliding window (60秒以内のタイムスタンプ配列)

---

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `periphery/src/server.ts` | `express-rate-limit` import, 3段階 limiter 作成・適用 |
| `periphery/src/gateway/gateway-server.ts` | `WsRateLimiter` クラス追加, handleActiveMessage にチェック追加 |
| `periphery/package.json` | `express-rate-limit` 依存追加 |

---

## DB 環境に関する注意

PostgreSQL コンテナ (`pgvector/pgvector:pg16`) が docker-compose に存在:
- `init.sql`: sphere_nodes (384次元ベクトル+HNSW), spatial_fields, spectral_links
- 環境変数: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`

**アプリ層は未接続** — Repository interfaces 完備:
- `IReferenceRepository`, `IProjectionRepository`, `ISpatialFieldRepository`
- 現在 Map 実装 (`MapReferenceRepository` 等)
- `PostgresReferenceRepository` / `RedisProjectionRepository` は未実装

**B1 (永続化) の作業内容**: Repository interface の PostgreSQL/Redis 実装を作成して index.ts で差し替え。
