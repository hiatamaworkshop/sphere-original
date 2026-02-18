# Sphere テスト起動手順 — 2026-02-18

## 前提

- 作業ディレクトリ: `docker_compose_sphere_v1/`
- Docker Desktop が起動済みであること
- テストスクリプトは `services/periphery/src/mock/` に配置

---

## 1. インフラ起動

```bash
# periphery + 依存 (redis, postgres, minio)
docker compose up -d periphery
```

ヘルスチェック通過まで ~60s。確認:

```bash
docker compose ps
# periphery が healthy であること
```

---

## 2. ノード投入

Sphere にテストデータを投入する。エージェントテストの前に実行。

```bash
# 10件 (デフォルト)
docker compose exec periphery node dist/mock/contribution.js

# 全153件を一括投入
docker compose exec periphery node dist/mock/contribution.js batch

# N件を指定
docker compose exec periphery node dist/mock/contribution.js 50

# Wave モード: 時間差投入 (50件, 3秒間隔)
docker compose exec periphery node dist/mock/contribution.js wave 50 3000
```

フラグ検証用データ (Tagger テスト):

```bash
curl -X POST http://localhost:3001/sphere/contribute \
  -H 'Content-Type: application/json' \
  -d @services/periphery/src/mock/wave-injection.json
```

---

## 3. デーモンテスト (phi-agent)

LLM エージェントによるデーモン稼働テスト。

```bash
# Agent レイヤー全起動 (ollama, phi-agent, digestor, pool-service, explorers)
docker compose --profile agent up -d

# phi-agent のみ起動 (他が起動済みの場合)
docker compose --profile agent up -d phi-agent

# 複数エージェント同時稼働
docker compose --profile agent up -d --scale phi-agent=3
```

ログ確認:

```bash
docker compose logs -f phi-agent
docker compose logs -f periphery
```

### 確認ポイント

```
# Sanctification (10秒間隔の観測)
[Sanctification] epoch=N cycle=M
  Hard=✓/·(confidence/thr=xxx bl=xxx)
  Soft=✓/·(xxx) Meta=✓/·(sus=xxx rec=xxx)

# Metabolic Auto-Mode 切替
[Sanctification] Metabolic mode: natural → archive (Hard=xxx baseline=xxx)

# Dormancy (ニューロン駆動)
[Dormancy] Entering hibernation — neuron observed 6 consecutive zero-agent ticks
[Dormancy] Waking up — agent connected

# Festival (聖域化後)
[Sanctification] Epoch N — festival begins (window=30)
[Sanctification] Festival ended — resuming normal observation
```

---

## 4. Swarm テスト (複数エージェント・主力)

LLM 不要の mock エージェント群。代謝・ドメイン・並行性テストに使用。

```bash
# 3エージェント (デフォルト)
docker compose exec periphery npx tsx src/mock/swarm-agent.ts

# 5エージェント
docker compose exec periphery npx tsx src/mock/swarm-agent.ts -n 5

# 10エージェント、バッチ5、バッチ間3秒
docker compose exec periphery npx tsx src/mock/swarm-agent.ts -n 10 -B 5 -D 3000

# トピック集中型
docker compose exec periphery npx tsx src/mock/swarm-agent.ts -n 5 -t "量子力学"

# 分散探索型
docker compose exec periphery npx tsx src/mock/swarm-agent.ts -n 5 -b distributed
```

### Swarm オプション

| フラグ | 説明 | デフォルト |
|-------|------|-----------|
| `-n, --count` | エージェント数 | 3 |
| `-B, --batch` | バッチサイズ | 5 |
| `-D, --batch-delay` | バッチ間隔 (ms) | 3000 |
| `-b, --behavior` | random / focused / distributed | random |
| `-t, --topic` | 集中トピック (behavior=focused に自動設定) | — |
| `-d, --duration` | エージェント最大稼働時間 (ms) | 30000 |
| `-i, --interval` | バッチ内スポーン間隔 (ms) | 100 |

### 出力

- リアルタイムステータス (3秒ごと): Active/Completed/Failed、ノード発見数、評価数
- 最終レポート: Entry Pipeline Timing (Ticket/Connect/Positioned/Total)、エージェント別詳細

---

## 5. 単体エージェントテスト (explore-agent)

全操作の詳細デバッグ用。sense/focus/evaluate/move/warp/scan/レイヤー遷移を順次テスト。

```bash
# ランダムクエリ (mock_data.json から選択)
docker compose exec periphery npx tsx src/mock/explore-agent.ts

# クエリ指定
docker compose exec periphery npx tsx src/mock/explore-agent.ts --query "量子力学"

# 高速モード (Tutorial レイヤーのみ)
docker compose exec periphery npx tsx src/mock/explore-agent.ts --fast

# 人間観測モード (1秒間隔)
docker compose exec periphery npx tsx src/mock/explore-agent.ts --slow
```

---

## 6. 停止

```bash
# Agent レイヤーのみ停止
docker compose --profile agent down

# 全停止
docker compose down

# 全停止 + ボリューム削除 (クリーンリセット)
docker compose down -v
```

---

## テストスクリプト一覧

| ファイル | npm スクリプト | 用途 |
|---------|--------------|------|
| `swarm-agent.ts` | `swarm` / `swarm:5` / `swarm:10` | 複数エージェント同時稼働 (主力) |
| `contribution.ts` | `contribute` / `contribute:batch` | ノード投入 |
| `explore-agent.ts` | `explore` | 単体エージェント全操作テスト |

| データファイル | 内容 |
|--------------|------|
| `mock_data.json` | 153件テストデータ (16bit flag coverage) |
| `wave-injection.json` | フラグ期待値付きデータ (Tagger 検証) |
| `relics.json` | コアノード 10件 (flags=0x2000) |

---

## 典型的なテストフロー

```
1. docker compose up -d periphery          # インフラ起動
2. contribution.js batch                    # 153件投入
3. swarm-agent.ts -n 5                      # 5エージェントで代謝テスト
4. docker compose --profile agent up -d     # デーモンエージェント起動
5. docker compose logs -f periphery         # Sanctification 観測
```
