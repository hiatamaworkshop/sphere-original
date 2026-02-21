# Docker マルチエージェント作業ログ (2026-02-09)

## 完了タスク

### B. Docker Compose 統合 (前セッション)
- pool-service Dockerfile 作成
- pool-service に環境変数フォールバック追加 (CLI > env > defaults)
- phi-agent の container_name 削除 (--scale 対応)
- phi-agent-data ボリューム追加 (種族記憶永続化)

### F. マルチエージェント同時実行 (本セッション)
- phi-agent に環境変数サポート追加 (LOADOUT, QUERY, CYCLES, DAEMON, DAEMON_SLEEP_MS)
- デーモンモード実装 (run → sleep → repeat)
- LOADOUT=random でインスタンスごとに異なる性格
- `docker compose --profile agent up --scale phi-agent=3` で 3体同時稼働確認

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `phi-agent/src/index.ts` | 環境変数フォールバック、デーモンモード、ランダム loadout |
| `docker_compose_sphere_v1/docker-compose.yml` | periphery build context変更、環境変数追加、healthcheck修正 |
| `docker_compose_sphere_v1/services/periphery/Dockerfile` | マルチステージビルド、node:20-slim化 |
| `docker_compose_sphere_v1/services/.dockerignore` | 新規作成 — node_modules/dist 除外 |

## 踏んだ罠と対処

### 1. periphery が @sphere/renal-core を見つけられない
- **原因**: `"@sphere/renal-core": "file:../renalCore"` — Docker コンテキスト外
- **対処**: build context を `./services/periphery` → `./services` に拡大、Dockerfile で renalCore を先にビルド
- **構造**: `/renalCore` にビルド → `/app` で periphery の `file:../renalCore` が `/renalCore` に解決

### 2. コンテキスト 388MB 転送
- **原因**: host の node_modules が Docker コンテキストに含まれる
- **対処**: `services/.dockerignore` に `**/node_modules` `**/dist` を追加 → 7KB に軽量化

### 3. tsc not found
- **原因**: `npm ci --only=production` で TypeScript (devDependency) がインストールされない
- **対処**: マルチステージビルド — builder ステージで全依存 + ビルド、production ステージで --omit=dev

### 4. onnxruntime-node の glibc エラー
- **原因**: Alpine Linux は musl libc、onnxruntime-node は glibc 必須
- **対処**: `node:20-alpine` → `node:20-slim` (Debian ベース、glibc あり)
- **注意**: これは periphery のみの問題。phi-agent/pool-service は alpine のままで OK

### 5. healthcheck の curl 不在
- **原因**: node:20-slim には curl がない
- **対処**: Node.js の fetch API を使う healthcheck に変更
  ```yaml
  test: ["CMD-SHELL", "node -e \"fetch('http://localhost:3001/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))\""]
  ```
- start_period: 60s 追加 (embedding モデルロードに時間がかかる)

### 6. WebSocket 接続 200 エラー
- **原因**: `PORT` 環境変数未設定 → periphery が WS を別ポート 8081 で起動 → コンテナは 3001 のみ EXPOSE
- **対処**: `PORT: "3001"` を環境変数に追加 → same-port モード (HTTP と WS が同一ポート)
- **仕組み**: periphery の server.ts が `process.env.PORT` を検出すると `wsPort = 0` → HTTP サーバーに WS をアタッチ

## Docker 環境変数一覧

### periphery
| 変数 | 値 | 必須 | 説明 |
|------|-----|------|------|
| PORT | 3001 | YES | same-port モード (WS + HTTP) |
| SPHERE_CONFIG | /app/sphere.config.json | YES | 設定ファイルパス |
| NODE_ENV | production | YES | |

### phi-agent
| 変数 | 値 | 必須 | 説明 |
|------|-----|------|------|
| LOADOUT | random | NO | balanced/scholar/.../random |
| DAEMON | true | NO | デーモンモード |
| DAEMON_SLEEP_MS | 30000 | NO | セッション間スリープ |
| OLLAMA_HOST | http://ollama:11434 | YES | |
| SPHERE_URL | http://periphery:3001 | YES | HTTP API |
| SPHERE_WS | ws://periphery:3001 | YES | WebSocket |

### pool-service
| 変数 | 値 | 必須 | 説明 |
|------|-----|------|------|
| SPHERE_URL | http://periphery:3001/sphere/contribute | YES | |
| OLLAMA_URL | http://ollama:11434 | YES | |
| POOL_PORT | 4000 | NO | |

## 運用コマンド

```bash
# 基盤のみ (periphery + postgres + redis + minio + nginx)
docker compose up -d

# エージェント込み (ollama + phi-agent×3 + pool-service)
docker compose --profile agent up --scale phi-agent=3 -d

# ログ確認
docker logs docker_compose_sphere_v1-phi-agent-1 --tail 20
docker logs sphere-periphery --tail 20

# 停止
docker compose --profile agent down
```

## 未解決・要注意

1. **eval-log.jsonl 同時書き込み**: 3体の phi-agent が同じボリュームの同じファイルに書く。appendFileSync は OS レベルで atomic だが、JSONL 行が破損するリスクはゼロではない。実運用では要監視。
2. **ollama モデル初回ダウンロード**: phi3:mini (2.3GB) の初回 pull に数分かかる。3体が同時に pull を試みるが、ollama 側で重複を処理するので問題ない。
3. **version: '3.8' 警告**: docker-compose.yml の `version` は obsolete。削除すれば警告は消える。
