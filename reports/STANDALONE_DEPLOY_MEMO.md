# Standalone Deploy 実装メモ

## 日付: 2026-02-07

## 概要
Render / Hugging Face Spaces でのデモ公開用に、PostgreSQL/Redis 不要のスタンドアロン構成を実装。
永続化不要（Map 実装のまま）、定期リセットで不正防御。

---

## 実装内容 (4項目)

### 1. WebSocket 同一ポート統合

**課題**: Render Free Tier は PORT 1つのみ。HTTP(3001) と WS(8081) の分離が不可。

**解決**: `GatewayServer.start()` を HttpServer / number 両対応に変更。

| モード | 条件 | 動作 |
|--------|------|------|
| 別ポート (ローカル開発) | `wsPort` が設定済み & httpPort と異なる | `new WebSocketServer({ port })` |
| 同一ポート (本番) | `wsPort` が 0 or 未設定 | `new WebSocketServer({ server: httpServer })` |

**変更ファイル**:
- `gateway-server.ts`: `start(serverOrPort?: HttpServer | number)` に変更、`http` から `Server` 型を import
- `server.ts`: `app.listen()` の戻り値を gateway に渡す分岐ロジック追加

### 2. CORS

**変更ファイル**: `server.ts`

`setupRoutes()` 先頭に手動ヘッダー追加（追加パッケージなし）:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, X-Service-Id, X-Service-Secret`
- OPTIONS → 204 で即返却

### 3. Seed Data (起動時データ投入)

**変更ファイル**: `index.ts`

- `seedSphere()` 関数追加: `mock/mock_data.json` (80件) を読み込み
- contribution.ts と同じロジックで ExperienceCapsule を構築
- `incarnationPipeline.ingest()` で直接投入 (HTTP 経由せず)
- 非同期実行 (health check は先に応答可能)
- `SEED_DATA_PATH` 環境変数でパス上書き可能

**ビルド**: `copy-assets` で `dist/mock/mock_data.json` にコピー済み (既存)

### 4. Ephemeral Mode (定期リセット)

**変更ファイル**: `index.ts`, `sphere.config.json`

sphere.config.json:
```json
"ephemeral": {
  "enabled": false,
  "resetIntervalMs": 3600000
}
```

動作:
1. `projectionDB.clear()` + `referenceDB.clear()` + `spatialFields.clear()`
2. `tickCounter = 0`, Dormancy 状態リセット
3. `seedSphere()` で再投入
4. embedding model は再ロード不要 (プロセス内リセット)

---

## Dockerfile

`Dockerfile.standalone` (リポジトリルート):
- Multi-stage build: renalCore → periphery → production (node:20-alpine)
- `sphere.config.json` を `./config/` にコピー
- `ENV SPHERE_CONFIG=./config/sphere.config.json`
- Render: `PORT` 環境変数で自動対応
- HF Spaces: `PORT=7860` で対応

---

## sphere.config.json 変更

| キー | 値 | 説明 |
|------|-----|------|
| `periphery.server.wsPort` | `8081` (追加) | ローカル開発用。本番は 0 にして同一ポート |
| `ephemeral.enabled` | `false` | デフォルト off。本番デプロイ時に true |
| `ephemeral.resetIntervalMs` | `3600000` | 1時間リセット |

---

## デプロイ時の設定

### Render
```
PORT=10000 (Render 自動設定)
NODE_ENV=production
```
sphere.config.json で `wsPort: 0`, `ephemeral.enabled: true` に変更

### Hugging Face Spaces
```
PORT=7860
NODE_ENV=production
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `periphery/src/gateway/gateway-server.ts` | start() を HttpServer/number 両対応に |
| `periphery/src/server.ts` | CORS middleware + httpServer gateway 連携 |
| `periphery/src/index.ts` | seedSphere() + Ephemeral Mode タイマー |
| `sphere.config.json` | wsPort: 8081, ephemeral セクション追加 |
| `Dockerfile.standalone` (新規) | multi-stage standalone build |
