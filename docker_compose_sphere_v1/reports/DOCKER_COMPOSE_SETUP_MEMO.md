# Docker Compose セットアップ作業メモ

**作成日**: 2026-01-30
**作業内容**: Sphere Project の Docker Compose 環境構築
**ブランチ**: working-for-remote
**作業ディレクトリ**: `c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1`

---

## ✅ 完了した作業

### 1. サービスディレクトリ構造の整備

設計ドキュメント（PHASE3_PERIPHERY_DESIGN.md）を分析して、必要なコンテナを特定し、services ディレクトリに以下を作成:

#### 新規作成したインフラコンテナ
- `services/nginx/` - リバースプロキシ / API Gateway
- `services/redis/` - キャッシュレイヤー
- `services/postgres/` - Reference DB (PostgreSQL + pgvector)
- `services/minio/` - Projection DB (S3互換 Object Storage)
- `services/test-runner/` - Mock Bot / 統合テスト環境

#### 既存サービスへのドキュメント追加
- `services/periphery/` - Entry Point Layer（Phase 3 実装済み）
- `services/renalCore/` - Metabolism Engine（Phase 2 実装済み）
- `services/agents/` - Autonomous Explorers（Phase 3.2+）
- `services/observatory_ui/` - Visualization UI（Phase 4+）

### 2. 各サービスのファイル作成

#### nginx（リバースプロキシ）
- `Dockerfile` - nginx:alpine ベース
- `nginx.conf` - ルーティング設定
  - `/api/*` → periphery:3001
  - `/` → observatory_ui (静的ファイル)
  - `/health` → ヘルスチェック
- `README.md` - 役割と設定の説明

#### redis（キャッシュ）
- `README.md` - Bookkeeper のキャッシュレイヤーとしての役割
- 公式イメージ使用（redis:7-alpine）
- 設定: maxmemory 256MB, allkeys-lru

#### postgres（Reference DB）
- `init.sql` - データベーススキーマ定義
  - `sphere_nodes` テーブル（pgvector対応）
  - `spatial_fields` テーブル
  - `spectral_links` テーブル
  - HNSW インデックス（ベクトル検索用）
- `README.md` - データ構造とマイグレーションパス

#### minio（Projection DB）
- `README.md` - Object Storage としての役割
  - バケット構成: sphere-projections, sphere-media
  - Progressive Loading との連携
  - 負荷特性（容量のみ管理）

#### periphery（既存）
- `Dockerfile` - Node.js 20 alpine ベース
- `README.md` - Phase 3 実装の詳細

#### その他
- `services/renalCore/README.md` - RenalCore の役割と使い方
- `services/agents/README.md` - SphereContext とエネルギーシステム
- `services/observatory_ui/README.md` - 可視化UI（計画）
- `services/test-runner/README.md` - テスト環境

### 3. プロジェクトルートファイル

#### docker-compose.yml
完全なサービス定義を作成:

**インフラ層:**
- nginx (port 80, 443)
- redis (port 6379)
- postgres (port 5432) - pgvector/pgvector:pg16
- minio (port 9000, 9001)

**アプリケーション層:**
- periphery (port 3001)
- renalcore (コメントアウト - periphery に統合)
- agents (コメントアウト - Phase 3.2+)
- observatory_ui (コメントアウト - Phase 4+)

**テスト層:**
- test-runner (profile: testing)

**重要な設定:**
- ヘルスチェック（postgres, minio, periphery）
- 依存関係管理（depends_on, condition）
- ボリューム永続化（redis-data, postgres-data, minio-data）
- ネットワーク分離（sphere-network）
- 環境変数の外部化

#### .env.example
環境変数テンプレート:
- POSTGRES_PASSWORD
- MINIO_ROOT_USER
- MINIO_ROOT_PASSWORD
- NODE_ENV

#### .dockerignore
Docker ビルド時の除外パターン:
- node_modules, dist, logs
- .env, .git
- IDE 設定ファイル

#### DOCKER_SETUP.md
完全なセットアップガイド:
- アーキテクチャ図
- サービス構成表
- セットアップ手順
- 開発ワークフロー
- トラブルシューティング
- 本番環境への展開

---

## 🏗️ アーキテクチャ設計の考慮事項

### Phase 3.1 現在の状態
Periphery はインメモリ実装のため、以下は**オプション**:
- Redis（Bookkeeper がインメモリ Map）
- PostgreSQL（Reference DB がインメモリ Map）
- MinIO（Projection DB がファイルシステム）

**最小構成**: `periphery` のみで起動可能

### Phase 3.2 以降の移行
DB統合時に全インフラサービスが必要:
1. Bookkeeper → Redis キャッシング
2. Reference DB → PostgreSQL + pgvector
3. Projection DB → MinIO (S3互換)

### マイグレーションパス
```
Phase 3.1: インメモリ Map（現在）
    ↓
Phase 3.2: SQLite + Filesystem（開発環境）
    ↓
Phase 3.3: PostgreSQL + MinIO（本番環境）
```

---

## 📊 サービス間の依存関係

### 起動順序
```
1. postgres (healthcheck: pg_isready)
2. redis
3. minio (healthcheck: /minio/health/live)
4. periphery (depends_on: postgres, redis, minio)
5. nginx (depends_on: periphery)
```

### ネットワーク通信
- nginx → periphery (http://periphery:3001)
- periphery → postgres (postgres:5432)
- periphery → redis (redis:6379)
- periphery → minio (minio:9000)

### データフロー
```
External → nginx:80
    ↓
periphery:3001 (POST /sphere/submit)
    ↓
[Membrane → Gatekeeper → Parser → Tagger → Packer]
    ↓
IncarnationBuffer → Bookkeeper
    ↓
┌─────────┼──────────┬─────────┐
│         │          │         │
redis   postgres   minio   RenalCore
(cache) (RefDB)   (ProjDB) (in-memory)
```

---

## 🔧 技術的な決定事項

### 1. pgvector の採用理由
- PostgreSQL の拡張機能
- 1536次元ベクトルの保存と検索
- HNSW インデックスによる高速類似度検索
- コサイン類似度計算のネイティブサポート

### 2. MinIO の採用理由
- S3互換 API（本番環境への移行が容易）
- Docker Compose で簡単にセットアップ可能
- Object Storage として Projection DB に最適
- 負荷に鈍感（ストレージ容量のみ管理）

### 3. Redis の使用目的
- Reference DB の読み取りキャッシュ
- ノードメタデータの高速アクセス
- 近傍計算結果のキャッシング
- 将来的なレート制限カウンター

### 4. Nginx の役割
- リバースプロキシ
- ロードバランシング（将来的に periphery を複数起動）
- SSL/TLS 終端
- 静的ファイル配信（Observatory UI）

---

## 📝 設定ファイルの重要ポイント

### docker-compose.yml

#### ヘルスチェックの実装
```yaml
postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U sphere_user -d sphere_db"]
    interval: 10s
    timeout: 5s
    retries: 5

minio:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 30s
    timeout: 20s
    retries: 3
```

#### 依存関係の管理
```yaml
periphery:
  depends_on:
    postgres:
      condition: service_healthy  # ← ヘルスチェック完了まで待機
    redis:
      condition: service_started
    minio:
      condition: service_healthy
```

#### ボリューム永続化
```yaml
volumes:
  redis-data:
    name: sphere-redis-data
  postgres-data:
    name: sphere-postgres-data
  minio-data:
    name: sphere-minio-data
  periphery-logs:
    name: sphere-periphery-logs
```

### postgres/init.sql

#### pgvector の有効化
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

#### ベクトルインデックス
```sql
-- HNSW インデックス（高速近似検索）
CREATE INDEX idx_nodes_position_hnsw ON sphere_nodes
USING hnsw (position vector_cosine_ops);
```

### nginx/nginx.conf

#### API ルーティング
```nginx
location /api/ {
    proxy_pass http://periphery_backend/;
    proxy_http_version 1.1;
    # WebSocket サポート
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
}
```

---

## 🧪 テスト方法

### 最小構成テスト（Phase 3.1）
```bash
# Periphery のみ起動
docker-compose up -d periphery

# ログ確認
docker-compose logs -f periphery

# ヘルスチェック
curl http://localhost:3001/health

# Stats 確認
curl http://localhost:3001/stats
```

### 完全構成テスト（Phase 3.2+）
```bash
# 全サービス起動
docker-compose up -d

# すべてのヘルスチェック
curl http://localhost:3001/health          # Periphery
curl http://localhost/api/health           # Nginx 経由
docker-compose exec postgres pg_isready    # PostgreSQL
curl http://localhost:9000/minio/health/live  # MinIO
```

### Mock Bot テスト
```bash
# test-runner プロファイルで起動
docker-compose --profile testing up test-runner

# または Periphery 内で直接実行
docker-compose exec periphery npm run mock-bot
```

---

## 🚀 今後の展開

### Phase 3.2: DB 統合
- [ ] Bookkeeper の PostgreSQL 実装
- [ ] Reference DB CRUD 操作
- [ ] Projection DB への書き込み（MinIO）
- [ ] Redis キャッシング実装

### Phase 3.3: パフォーマンス最適化
- [ ] Progressive Loading 実装
- [ ] Prefetching 機構
- [ ] Connection Pool 最適化
- [ ] ベクトル検索のチューニング

### Phase 4: Observatory UI
- [ ] React/Vue/Svelte フロントエンド
- [ ] Three.js による Point Cloud レンダリング
- [ ] Real-time モニタリング
- [ ] Amber Showcase 実装

### Phase 5: Agents
- [ ] SphereContext の完全実装
- [ ] エネルギーシステム
- [ ] Tutorial Sphere
- [ ] Sanctuary Sphere

---

## ⚠️ 重要な注意事項

### セキュリティ
1. **.env ファイルを .gitignore に追加**
   - パスワードやシークレットを含む
   - `.env.example` のみコミット

2. **本番環境での設定**
   - 強力なパスワード設定
   - PostgreSQL, Redis, MinIO を外部公開しない
   - Nginx のみ外部公開（SSL/TLS 必須）

3. **MinIO アクセスキー**
   - デフォルト値を変更
   - Console (port 9001) を本番では非公開に

### パフォーマンス
1. **PostgreSQL チューニング**
   - shared_buffers の調整
   - work_mem の設定
   - max_connections の最適化

2. **Redis メモリ管理**
   - maxmemory-policy の設定
   - 開発: 256MB
   - 本番: 2GB+

3. **MinIO ストレージ**
   - ディスク容量の監視
   - バックアップ戦略

### 開発ワークフロー
1. **Phase 3.1 では最小構成を使用**
   ```bash
   docker-compose up -d periphery
   ```

2. **DB 統合後は完全構成**
   ```bash
   docker-compose up -d
   ```

3. **テストは専用プロファイル**
   ```bash
   docker-compose --profile testing up test-runner
   ```

---

## 📚 関連ドキュメント

- [DOCKER_SETUP.md](./DOCKER_SETUP.md) - セットアップガイド
- [PHASE3_PERIPHERY_DESIGN.md](./PHASE3_PERIPHERY_DESIGN.md) - アーキテクチャ設計
- [sphere.config.json](./sphere.config.json) - 統合設定ファイル
- [services/periphery/CLAUDE_SESSION_MEMO.md](./services/periphery/CLAUDE_SESSION_MEMO.md) - Phase 3 実装詳細
- [SESSION_STATE.md](./SESSION_STATE.md) - RenalCore 実装状態

---

## 📂 ファイル構造（完成版）

```
docker_compose_sphere_v1/
├── docker-compose.yml          # ⭐ メインの Compose 定義
├── .env.example                # 環境変数テンプレート
├── .dockerignore               # Docker ビルド除外設定
├── DOCKER_SETUP.md             # ⭐ セットアップガイド
├── DOCKER_COMPOSE_SETUP_MEMO.md # ⭐ この作業メモ
├── sphere.config.json          # 統合設定ファイル
├── PHASE3_PERIPHERY_DESIGN.md  # アーキテクチャ設計
├── SESSION_STATE.md            # RenalCore 実装状態
│
└── services/
    ├── nginx/
    │   ├── Dockerfile
    │   ├── nginx.conf
    │   └── README.md
    │
    ├── redis/
    │   └── README.md
    │
    ├── postgres/
    │   ├── init.sql           # ⭐ スキーマ定義
    │   └── README.md
    │
    ├── minio/
    │   └── README.md
    │
    ├── periphery/             # Phase 3 実装済み
    │   ├── Dockerfile
    │   ├── README.md
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       ├── server.ts
    │       ├── membrane/
    │       ├── gatekeeper/
    │       ├── parser/
    │       ├── tagger/
    │       ├── packer/
    │       ├── bookkeeper/
    │       └── incarnation/
    │
    ├── renalCore/             # Phase 2 実装済み
    │   ├── README.md
    │   └── src/
    │
    ├── agents/                # Phase 3.2+
    │   └── README.md
    │
    ├── observatory_ui/        # Phase 4+
    │   └── README.md
    │
    └── test-runner/
        └── README.md
```

---

## ✅ チェックリスト

### 完了項目
- [x] 設計ドキュメント分析
- [x] 必要なコンテナ特定
- [x] services ディレクトリ構造作成
- [x] 各サービスの README.md 作成
- [x] Dockerfile 作成（nginx, periphery）
- [x] 設定ファイル作成（nginx.conf, init.sql）
- [x] docker-compose.yml 作成
- [x] .env.example 作成
- [x] .dockerignore 作成
- [x] DOCKER_SETUP.md 作成
- [x] この作業メモ作成

### 次のセッションでやること
- [ ] .env ファイルを作成（.env.example をコピー）
- [ ] docker-compose up -d periphery でテスト起動
- [ ] Mock Bot の動作確認
- [ ] PostgreSQL スキーマの動作確認（Phase 3.2）
- [ ] MinIO バケット作成（Phase 3.2）

---

**作業完了日時**: 2026-01-30
**次回セッションへの引き継ぎ**: Docker環境は完全にセットアップ済み。Phase 3.1 では `periphery` のみで動作確認可能。Phase 3.2 からは全インフラサービスを使用して DB 統合を開始する。

---

**End of Memo**
