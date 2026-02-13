# Sphere Deployment Strategy

**Date**: 2026-02-11
**Status**: Design memo

---

## 設計原則

### サービス境界
- **Pool のみ公開** — 外部データ intake
- **残り全て内部** — Sphere, Digestor, Explorers, Observatory

### 理由
- Hugging Face Spaces / Render.com の無料枠では **All-in-One は重すぎる**
- Sphere は PostgreSQL/Redis/MinIO 必要 → VPS 必須
- Digestor は認証なし → 内部ネットワーク前提
- 疎結合思想 → サービス分離で独立デプロイ可能

---

## Phase 1: 現時点（開発/小規模本番）

### 構成図

```
Internet
   ↓
VPS (€4.15/月, Hetzner Cloud)
   ├─ Pool (0.0.0.0:4000) ← 公開
   ├─ Sphere (127.0.0.1:3001) ← 内部
   ├─ Digestor (127.0.0.1:5000) ← 内部
   └─ Explorers (127.0.0.1:7860) ← 内部 (SSH tunnel)

Observatory (ローカル CLI, SSH 経由)
```

### 配置理由

| サービス | 公開範囲 | 認証 | 理由 |
|---------|---------|------|------|
| **Pool** | Internet | なし (rate limit 30/min) | 外部データ intake、認証不要が設計思想 |
| **Sphere** | Internal | dive ticket (120s TTL) | Agent 実行環境、SSH tunnel でアクセス |
| **Digestor** | Internal | **なし** | 認証なし → 内部ネットワーク必須 |
| **Explorers** | Internal | なし | 開発ツール、SSH tunnel でアクセス |
| **Observatory** | Local/SSH | なし | CLI ツール、外部公開不要 |

### VPS スペック (推奨)

**Hetzner Cloud CX22** (推奨):
- vCPU: 2
- RAM: 4GB
- Storage: 40GB SSD
- Bandwidth: 20TB
- **月額**: €4.15 ($4.50)

**代替プロバイダー**:
- DigitalOcean: $6/月 (1 vCPU, 1GB RAM) — 最低限
- Linode: $5/月 (1 vCPU, 1GB RAM)
- Vultr: $6/月 (1 vCPU, 1GB RAM)

### Docker Compose 設定

**docker-compose.yml (公開ポート設定)**:

```yaml
services:
  pool-service:
    ports:
      - "0.0.0.0:4000:4000"  # 外部公開
    environment:
      - NODE_ENV=production

  periphery:
    ports:
      - "127.0.0.1:3001:3001"  # localhost のみ
    environment:
      - NODE_ENV=production

  digestor:
    # ports なし (内部アクセスのみ、Docker network 経由)

  explorers:
    ports:
      - "127.0.0.1:7860:7860"  # localhost のみ
```

### SSH Tunnel でのアクセス

```bash
# Explorers UI へのアクセス
ssh -L 7860:localhost:7860 user@vps-ip

# Sphere API へのアクセス (開発時)
ssh -L 3001:localhost:3001 user@vps-ip

# Digestor IO Gateway へのアクセス
ssh -L 5000:localhost:5000 user@vps-ip

# 複数ポート同時
ssh -L 7860:localhost:7860 -L 3001:localhost:3001 -L 5000:localhost:5000 user@vps-ip
```

### ネットワーク分離 (セキュリティ強化版)

**docker-compose.override.yml (本番用)**:

```yaml
networks:
  public_net:
    driver: bridge
  internal_net:
    driver: bridge
    internal: true  # 外部接続不可

services:
  pool-service:
    networks:
      - public_net
      - internal_net

  periphery:
    networks:
      - internal_net

  digestor:
    networks:
      - internal_net

  explorers:
    networks:
      - internal_net
```

---

## Phase 2: 将来（中規模本番）

### 構成図

```
Internet
   ↓
   ├─ Explorers UI (Hugging Face Spaces) ← デモ/広報用
   │    ↓ read static data
   │  generations.json (GitHub Pages or S3)
   │
   └─ Pool (Render.com or VPS) ← 外部データ intake
        ↓ HTTP API call
     VPS (Hetzner Cloud)
        ├─ Sphere (内部)
        ├─ Digestor (内部)
        └─ phi-agent cluster (内部)

Observatory (ローカル CLI, SSH 経由)
```

### 追加要素

#### Explorers UI (Hugging Face Spaces)

**目的**: デモ/プレゼン用の公開 UI

**制約**:
- Agent 実行機能をオフ (DEMO_MODE=true)
- Generations 可視化のみ有効
- 静的データ (generations.json) を GitHub Pages から取得

**app.py 修正**:

```python
import os

DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
GENERATIONS_URL = os.getenv("GENERATIONS_URL", "https://username.github.io/sphere-data/generations.json")

if DEMO_MODE:
    # Agent 実行機能をオフ
    gr.Markdown("⚠️ Demo mode: Agent execution disabled. Viewing archived generation data.")

    # 静的データ取得
    def fetch_generations():
        response = requests.get(GENERATIONS_URL)
        return response.json()
else:
    # 通常モード (Docker executor 使用)
    pass
```

**デプロイ**:

```bash
# HF Spaces に push
git clone https://huggingface.co/spaces/{username}/sphere-explorers
cp -r explorers/* sphere-explorers/
cd sphere-explorers

# .env 設定
echo "DEMO_MODE=true" >> .env
echo "GENERATIONS_URL=https://username.github.io/sphere-data/generations.json" >> .env

git add .
git commit -m "Deploy Explorers UI (demo mode)"
git push
```

#### Pool Service (Render.com 分離案)

**目的**: Pool のみスケールアウト

**render.yaml**:

```yaml
services:
  - type: web
    name: sphere-pool
    env: docker
    dockerfilePath: ./pool-service/Dockerfile
    envVars:
      - key: SPHERE_URL
        value: https://your-vps.com:3001
      - key: OLLAMA_HOST
        value: https://your-vps.com:11434
      - key: PORT
        value: 4000
      - key: NODE_ENV
        value: production
    healthCheckPath: /health
```

**制約**:
- 無料枠は 15分無通信で sleep
- 初回リクエストで wake-up (遅延 10-30s)

#### 静的データ配信 (GitHub Pages or S3)

**目的**: Explorers (HF Spaces) が generations.json を取得

**GitHub Actions (定期更新)**:

```yaml
# .github/workflows/sync-generations.yml
name: Sync Generations Data

on:
  schedule:
    - cron: '0 */6 * * *'  # 6時間ごと
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          repository: username/sphere-data
          token: ${{ secrets.PAT }}

      - name: Fetch generations from VPS
        run: |
          scp -i ${{ secrets.SSH_KEY }} \
            vps:/opt/sphere/phi-agent/data/generations/*.json \
            ./generations/

      - name: Commit and push
        run: |
          git add generations/
          git commit -m "Update generations $(date)"
          git push
```

---

## Phase 3: 将来（大規模本番）

### 構成図

```
Internet
   ↓
Load Balancer (Cloudflare or nginx)
   ├─ Pool (×3 instances, Render or Kubernetes)
   ├─ Sphere UI (static CDN)
   └─ Explorers UI (HF Spaces or static CDN)
          ↓ internal
       VPS Cluster (Hetzner or DO)
          ├─ Sphere (×1, vertical scaling)
          ├─ Digestor (×1)
          ├─ PostgreSQL (managed DB)
          ├─ Redis (managed cache)
          └─ MinIO (S3-compatible storage)

Observatory (ローカル CLI, VPN 経由)
```

### スケーリング戦略

| サービス | スケール方向 | 理由 |
|---------|-------------|------|
| **Pool** | Horizontal (×N instances) | 外部負荷が高い、stateless |
| **Sphere** | Vertical (CPU/RAM 増強) | State 管理が複雑、horizontal 困難 |
| **Digestor** | Vertical | 単一インスタンスで十分 (定期実行) |
| **PostgreSQL** | Managed DB | 運用負荷軽減 |
| **Redis** | Managed Cache | 運用負荷軽減 |

### Kubernetes 移行 (オプション)

**対象**: Pool のみ

```yaml
# k8s/pool-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sphere-pool
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: pool
        image: sphere-pool:latest
        env:
        - name: SPHERE_URL
          value: "http://sphere-api.internal:3001"
        - name: OLLAMA_HOST
          value: "http://ollama.internal:11434"
---
apiVersion: v1
kind: Service
metadata:
  name: sphere-pool
spec:
  type: LoadBalancer
  ports:
  - port: 4000
    targetPort: 4000
```

---

## コスト試算

### Phase 1 (現在)

| 項目 | 月額 |
|------|------|
| VPS (Hetzner CX22) | €4.15 ($4.50) |
| Domain (optional) | $1.00 |
| **合計** | **$5.50/月** |

### Phase 2 (中規模)

| 項目 | 月額 |
|------|------|
| VPS (Hetzner CX32) | €8.21 ($9.00) |
| Pool (Render, 無料枠 or $7) | $0-7.00 |
| Explorers (HF Spaces) | **無料** |
| Domain | $1.00 |
| **合計** | **$10-17/月** |

### Phase 3 (大規模)

| 項目 | 月額 |
|------|------|
| VPS Cluster (×2) | €16.42 ($18.00) |
| Managed PostgreSQL (DO) | $15.00 |
| Managed Redis (DO) | $10.00 |
| Pool (Kubernetes, ×3) | $21.00 |
| CDN (Cloudflare) | **無料** |
| **合計** | **$64/月** |

---

## セキュリティ設定

### Firewall (ufw)

```bash
# VPS 初期設定
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 4000/tcp   # Pool (公開)
sudo ufw enable
```

### Rate Limiting (nginx)

Pool の前段に nginx を置く場合:

```nginx
# /etc/nginx/sites-available/sphere-pool
limit_req_zone $binary_remote_addr zone=pool_limit:10m rate=30r/m;

server {
    listen 80;
    server_name pool.sphere.example.com;

    location / {
        limit_req zone=pool_limit burst=5;
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### SSL/TLS (Let's Encrypt)

```bash
# Certbot インストール
sudo apt install certbot python3-certbot-nginx

# 証明書取得 (Pool のみ)
sudo certbot --nginx -d pool.sphere.example.com
```

---

## デプロイ手順

### Phase 1: VPS セットアップ

```bash
# 1. VPS に SSH 接続
ssh root@vps-ip

# 2. Docker インストール
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 3. Docker Compose インストール
apt install docker-compose-plugin

# 4. Sphere リポジトリ取得
git clone https://github.com/username/sphere.git /opt/sphere
cd /opt/sphere/docker_compose_sphere_v1

# 5. 環境変数設定
cp .env.example .env
nano .env  # NODE_ENV=production 設定

# 6. サービス起動
docker compose --profile core up -d
docker compose --profile agent up -d

# 7. Firewall 設定
ufw allow 4000/tcp
ufw enable
```

### Phase 2: Explorers UI (HF Spaces)

```bash
# 1. Hugging Face Spaces 作成
# https://huggingface.co/new-space

# 2. リポジトリクローン
git clone https://huggingface.co/spaces/{username}/sphere-explorers
cd sphere-explorers

# 3. Explorers コピー
cp -r ../sphere/explorers/* .

# 4. DEMO_MODE 設定
echo "DEMO_MODE=true" > .env

# 5. requirements.txt 確認
# gradio, requests, plotly

# 6. Push
git add .
git commit -m "Initial deployment"
git push
```

---

## モニタリング

### ヘルスチェック

```bash
# Pool
curl http://vps-ip:4000/health

# Sphere (SSH tunnel 経由)
ssh -L 3001:localhost:3001 user@vps-ip
curl http://localhost:3001/health

# Digestor
ssh -L 5000:localhost:5000 user@vps-ip
curl http://localhost:5000/health
```

### ログ確認

```bash
# 全サービスのログ
docker compose logs -f

# 特定サービス
docker compose logs -f periphery
docker compose logs -f pool-service
docker compose logs -f digestor
```

---

## バックアップ戦略

### PostgreSQL (毎日バックアップ)

```bash
# /opt/sphere/backup.sh
#!/bin/bash
docker exec sphere-postgres pg_dump -U sphere sphere > /opt/backups/sphere-$(date +%Y%m%d).sql
find /opt/backups -name "sphere-*.sql" -mtime +7 -delete
```

### Phi-Agent Data (毎日バックアップ)

```bash
# /opt/sphere/backup-data.sh
#!/bin/bash
tar -czf /opt/backups/phi-agent-data-$(date +%Y%m%d).tar.gz \
  /var/lib/docker/volumes/phi-agent-data/_data/
find /opt/backups -name "phi-agent-data-*.tar.gz" -mtime +7 -delete
```

### Cron 設定

```bash
# crontab -e
0 2 * * * /opt/sphere/backup.sh
0 3 * * * /opt/sphere/backup-data.sh
```

---

## トラブルシューティング

### Pool が応答しない

```bash
# コンテナ状態確認
docker compose ps

# ログ確認
docker compose logs pool-service

# 再起動
docker compose restart pool-service
```

### Sphere が起動しない

```bash
# PostgreSQL 接続確認
docker compose exec periphery node -e "console.log(process.env.DATABASE_URL)"

# Redis 接続確認
docker compose exec periphery node -e "console.log(process.env.REDIS_URL)"

# 再ビルド
docker compose build periphery
docker compose up -d periphery
```

### Digestor が digest しない

```bash
# eval-log.jsonl 確認
docker compose exec digestor cat /app/data/eval-log.jsonl | wc -l

# MIN_EVALS 確認 (default 50)
docker compose exec digestor printenv MIN_EVALS

# 手動実行
docker compose exec digestor sh -c "ONCE=1 node /app/dist/digestor.js"
```

---

## 関連ドキュメント

- `docs/DEVELOPER_GUIDE.md` — 全体アーキテクチャ
- `docker_compose_sphere_v1/README.md` — Docker Compose 設定
- `reports/SPHERE_ECOSYSTEM_DESIGN.md` — サービス分離設計

---

*Last updated: 2026-02-11*
