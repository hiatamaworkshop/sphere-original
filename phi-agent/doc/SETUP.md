# phi-agent Setup & Notes

## ollama

- **ローカルインストール**: `winget install Ollama.Ollama` (v0.15.4)
- **実行ファイル**: `C:\Users\kazuh\AppData\Local\Programs\Ollama\ollama.exe`
- **data dir**: `C:\Users\kazuh\.ollama` — モデルファイル格納先
- **モデル**: `phi3:mini` (2.2 GB)
- **API**: `http://localhost:11434`

### Docker 移行時

```bash
# ローカルのモデルデータをそのまま使える
docker run -v ~/.ollama:/root/.ollama -p 11434:11434 ollama/ollama

# docker-compose では ollama-models ボリュームにマウント済み
docker-compose --profile agent up
```

### モデル管理

```bash
ollama list              # インストール済みモデル一覧
ollama pull phi3:mini    # モデル pull (~2.3GB)
ollama run phi3:mini "Say hello"  # 対話テスト
```

## ポート構成

| 環境 | HTTP (periphery) | WebSocket (gateway) | ollama |
|------|-------------------|---------------------|--------|
| ローカル dev | 3001 | **8081** (別ポート) | 11434 |
| Docker / デプロイ | 3001 | **3001** (HTTP同一) | 11434 |

- `PORT` 環境変数がセットされていると同一ポートモード (production)
- ローカル dev では `sphere.config.json` の `wsPort: 8081` が使われる
- phi-agent のデフォルト: `SPHERE_WS=ws://localhost:8081` (dev用)
- Docker 環境では `SPHERE_WS=ws://periphery:3001` で上書き

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| OLLAMA_HOST | http://localhost:11434 | ollama API URL |
| OLLAMA_MODEL | phi3:mini | 使用モデル |
| SPHERE_URL | http://localhost:3001 | periphery HTTP URL |
| SPHERE_WS | ws://localhost:8081 | gateway WebSocket URL |

## 実行

```bash
# ローカル開発 (periphery + ollama が起動済み前提)
cd phi-agent
npm install
npx tsx src/index.ts "AI safety"              # デフォルト 10 cycles
npx tsx src/index.ts "metabolism" --cycles 3   # 3 cycles
npx tsx src/index.ts --quiet                   # ログ抑制

# ollama 単体テスト
npx tsx src/ollama-client.ts
```

## 初回テスト結果 (2026-02-08)

- phi3:mini CPU 推論: ~100秒/回 (GPU なし)
- Cycle 1: sense(15 nodes) → phi が focus 対象選択 → evaluate 試行
- Cycle 2: expelled (session timeout — 推論時間が長すぎる)
- 合計 323秒 / 3 cycles, evaluations = 0

### 既知の問題

1. **session timeout**: CPU 推論が遅く、gateway の maxSessionDuration に引っかかる
2. **evaluate 未達**: expelled される前に evaluate リクエストが通らない
3. **推論速度**: CPU で phi3:mini は ~100秒/推論。GPU で劇的改善見込み

### 次のステップ (優先順)

1. **session timeout 延長**
   - `sphere-context.ts:68` → `DEFAULT_SESSION_TTL = 180` (秒)
   - `sphere.config.json` に `session.ttlSeconds` を追加して config 化すべき
   - CPU推論 ~100秒/回 × 3回/cycle = ~300秒必要 → 最低 600秒 に延長
   - `sphere-context.ts:211` で `sessionConfig?.ttlSeconds ?? DEFAULT_SESSION_TTL` として読んでいる
   - `sphere-context.ts:196` の `PeripheryConfig["session"]` 型定義も要確認

2. **num_predict 削減** (推論速度改善)
   - `ollama-client.ts:28` → `maxTokens: 256` (= num_predict)
   - phi の応答は JSON のみ (action, index, h, w, d, reason) → 64 tokens で十分
   - 推論時間は token 数にほぼ比例 → 256→64 で ~4倍速

3. **expelled 後の再接続ロジック**
   - `agent.ts` の `exploreLoop()` で expelled を検知 → 再 connect
   - `sphere-client.ts` で expelled イベント受信時に running フラグを維持
   - 再接続には新しい ticket が必要 (/dive/request → token → WS)

## ファイル構成 (Claude 新規セッション用)

```
phi-agent/                          # トップレベル (sphere-ui と同列)
├── doc/
│   └── SETUP.md                    # ← このファイル
├── src/
│   ├── index.ts                    # CLI エントリポイント
│   ├── agent.ts                    # メインループ (PhiAgent)
│   ├── ollama-client.ts            # ollama HTTP クライアント
│   ├── sphere-client.ts            # Sphere WebSocket クライアント
│   └── prompt-builder.ts           # プロンプト生成 + JSON パーサー
├── package.json                    # @sphere/phi-agent, ESM
├── tsconfig.json                   # NodeNext, ES2022
└── Dockerfile                      # node:20-alpine

docs/NEXT_PHASE_PHI_OLLAMA.md       # 設計構想・市場分析 (sphere-original 直下)
docker_compose_sphere_v1/
├── docker-compose.yml              # ollama + phi-agent は profile: agent
└── sphere.config.json              # session timeout ここに追加予定
```

## 関連コード (gateway 側)

session timeout を制御している箇所:
- `periphery/src/gateway/sphere-context.ts:68` — `DEFAULT_SESSION_TTL = 180`
- `sphere-context.ts:71` — `DEFAULT_WARNING_BEFORE_END = 30`
- `sphere-context.ts:211` — `sessionConfig?.ttlSeconds ?? DEFAULT_SESSION_TTL`
- `sphere-context.ts:1372-1384` — `setupTimers()` で expiry/warning タイマー設定
- config 経由: `sphere.config.json` → `periphery.session.ttlSeconds` (未定義、要追加)
