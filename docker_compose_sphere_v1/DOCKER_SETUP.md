# Docker Setup Guide - Sphere Project

## 概要

Sphere プロジェクトの Docker Compose 環境セットアップガイドです。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                     Nginx (Port 80)                     │
│              Reverse Proxy / API Gateway                │
└─────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
    ┌───────────────────┐   ┌──────────────────┐
    │   Periphery       │   │  Observatory UI  │
    │   (Port 3001)     │   │  (Static Files)  │
    └───────────────────┘   └──────────────────┘
                │
        ┌───────┼───────┬────────┐
        ▼       ▼       ▼        ▼
    ┌─────┐ ┌─────┐ ┌──────┐ ┌──────┐
    │Redis│ │Post │ │MinIO │ │Renal │
    │     │ │greSQL│ │     │ │Core  │
    └─────┘ └─────┘ └──────┘ └──────┘
```

## サービス構成

### インフラ層

| サービス | ポート | 役割 | 状態 |
|---------|-------|------|------|
| **nginx** | 80, 443 | リバースプロキシ | ✅ 準備完了 |
| **redis** | 6379 | キャッシュレイヤー | ✅ 準備完了 |
| **postgres** | 5432 | Reference DB (pgvector) | ✅ 準備完了 |
| **minio** | 9000, 9001 | Projection DB (S3互換) | ✅ 準備完了 |

### アプリケーション層

| サービス | ポート | 役割 | 状態 |
|---------|-------|------|------|
| **periphery** | 3001 | Entry Point Layer | ✅ 準備完了 |
| **renalcore** | - | Metabolism Engine | ⏸️ Peripheryに統合 |
| **agents** | - | Autonomous Explorers | 📝 Phase 3.2+ |
| **observatory_ui** | - | Visualization UI | 📝 Phase 4+ |

### テスト・開発

| サービス | 役割 | 状態 |
|---------|------|------|
| **test-runner** | Mock Bot / 統合テスト | ✅ 準備完了 |

## セットアップ手順

### 1. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集して必要な値を設定:
```bash
POSTGRES_PASSWORD=your_secure_password
MINIO_ROOT_USER=your_minio_user
MINIO_ROOT_PASSWORD=your_minio_password
```

### 2. コンテナのビルドと起動

#### 全サービス起動
```bash
docker-compose up -d
```

#### 特定サービスのみ起動
```bash
# Periphery + 依存サービス
docker-compose up -d periphery

# Nginx + Periphery
docker-compose up -d nginx periphery
```

#### ログ確認
```bash
# 全サービス
docker-compose logs -f

# 特定サービス
docker-compose logs -f periphery
```

### 3. 初期化確認

#### ヘルスチェック
```bash
# Periphery
curl http://localhost:3001/health

# Nginx経由
curl http://localhost/api/health

# PostgreSQL
docker-compose exec postgres pg_isready -U sphere_user

# MinIO
curl http://localhost:9000/minio/health/live
```

#### システム統計
```bash
curl http://localhost:3001/stats
```

### 4. テスト実行

#### Mock Bot の起動
```bash
docker-compose --profile testing up test-runner
```

または直接 periphery 内で:
```bash
docker-compose exec periphery npm run mock-bot
```

## 開発ワークフロー

### Phase 3.1 現在の状態

Periphery は**インメモリ実装**のため、以下のサービスは**オプション**:
- ✅ **Redis**: オプション（Bookkeeperがインメモリ）
- ✅ **PostgreSQL**: オプション（Reference DBがインメモリ）
- ✅ **MinIO**: オプション（Projection DBがファイルシステム）

**最小構成で起動**:
```bash
docker-compose up -d periphery
```

### Phase 3.2 以降

DB統合後は全インフラサービスが必要:
```bash
docker-compose up -d nginx redis postgres minio periphery
```

## サービス管理

### コンテナの停止
```bash
docker-compose down
```

### データ永続化の削除（注意）
```bash
docker-compose down -v
```

### 特定サービスの再起動
```bash
docker-compose restart periphery
```

### コンテナの再ビルド
```bash
docker-compose build periphery
docker-compose up -d periphery
```

## トラブルシューティング

### ポート競合
```bash
# ポート使用状況確認
netstat -an | grep LISTEN | grep 3001

# docker-compose.yml でポートを変更
ports:
  - "3002:3001"  # ホスト:コンテナ
```

### PostgreSQL 接続エラー
```bash
# PostgreSQL ログ確認
docker-compose logs postgres

# データベース接続テスト
docker-compose exec postgres psql -U sphere_user -d sphere_db -c "SELECT version();"
```

### MinIO バケット作成
```bash
# MinIO Console にアクセス
open http://localhost:9001

# または CLI で
docker-compose exec minio mc mb /data/sphere-projections
```

### Periphery ビルドエラー
```bash
# node_modules をクリーン
cd services/periphery
rm -rf node_modules
npm install

# Docker イメージを再ビルド
docker-compose build --no-cache periphery
```

## 設定ファイル

### sphere.config.json
プロジェクトルートの設定ファイルが全サービスで共有されます:
```bash
./sphere.config.json → /app/sphere.config.json (read-only)
```

### Nginx 設定の変更
```bash
# nginx.conf を編集
vi services/nginx/nginx.conf

# Nginx を再起動
docker-compose restart nginx
```

## 本番環境への展開

### セキュリティ対策

1. **環境変数の保護**
   - `.env` ファイルを `.gitignore` に追加
   - 強力なパスワードを設定

2. **SSL/TLS 証明書**
   - Let's Encrypt を使用
   - `nginx.conf` に証明書を設定

3. **ネットワーク分離**
   - PostgreSQL, Redis, MinIO を外部公開しない
   - Nginx のみ外部公開

### スケーリング

```bash
# Periphery を3インスタンスに増やす
docker-compose up -d --scale periphery=3

# Nginx が自動的にロードバランシング
```

## 次のステップ

- [ ] Phase 3.2: PostgreSQL 統合
- [ ] Phase 3.3: MinIO 統合
- [ ] Phase 4: Observatory UI 実装
- [ ] Phase 5: Agents 実装

## 参考ドキュメント

- [PHASE3_PERIPHERY_DESIGN.md](./PHASE3_PERIPHERY_DESIGN.md) - アーキテクチャ設計
- [sphere.config.json](./sphere.config.json) - 設定ファイル
- [services/periphery/CLAUDE_SESSION_MEMO.md](./services/periphery/CLAUDE_SESSION_MEMO.md) - Phase 3 実装詳細
