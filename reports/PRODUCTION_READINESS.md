# Production Readiness 作業予定

## Phase 1: インフラ基盤 (必須)

### 1-1. 永続化
- [ ] Map → 永続ストレージ移行 (SQLite / Redis / PostgreSQL 選定)
- [ ] ProjDB / RefDB の読み書きインターフェース抽象化
- [ ] サーバー起動時のデータ復元

### 1-2. 認証
- [ ] API key 発行・検証ミドルウェア
- [ ] WebSocket 接続時の token 検証
- [ ] `/submit`, `/agent/spawn` 等の保護

### 1-3. レート制限
- [ ] HTTP エンドポイント単位のレート制限 (express-rate-limit 等)
- [ ] WebSocket メッセージ頻度制限

---

## Phase 2: 運用整備

### 2-1. 環境変数管理
- [ ] DB 接続先、シークレット等を環境変数から注入
- [ ] `sphere.config.json` の PROD 用オーバーライド戦略

### 2-2. Graceful Shutdown
- [ ] SIGTERM ハンドラ追加
- [ ] DB flush → WebSocket 切断 → プロセス終了の順序保証

### 2-3. モニタリング
- [ ] `/metrics` エンドポイント (ノード数, agent数, dormancy状態, uptime)
- [ ] ログ JSON 構造化 (CloudWatch / Datadog 対応)

---

## Phase 3: API 整理

### 3-1. 既存 API 洗い出し
- [ ] 全エンドポイントの棚卸し (使用中 / 不要 / 改善必要)
- [ ] レスポンス形式の統一
- [ ] エラーレスポンスの標準化

### 3-2. 不要 API 候補 (要調査)
- [ ] DEPRECATED な gatekeeper 関連
- [ ] 内部デバッグ用エンドポイントの整理

### 3-3. 改善候補 (要調査)
- [ ] `/submit` のレスポンスに incarnation 結果を含めるか
- [ ] `/sphere/explore` のページネーション
- [ ] WebSocket イベントの仕様整理

---

## Phase 4: デプロイ

### 4-1. Docker
- [ ] production 用 Dockerfile (multi-stage build)
- [ ] docker-compose.prod.yml

### 4-2. AWS
- [ ] HTTPS 終端 (ALB / CloudFront)
- [ ] CORS 設定
- [ ] ヘルスチェック確認 (`/health`)
- [ ] ECS or EC2 選定

---

## 優先順位
```
環境変数(2-1) → Graceful Shutdown(2-2) → モニタリング(2-3)
  → API 洗い出し(3-1) → 不要API削除(3-2) → API改善(3-3)
    → 永続化(1-1) → 認証(1-2) → レート制限(1-3)
      → デプロイ(4)
```
