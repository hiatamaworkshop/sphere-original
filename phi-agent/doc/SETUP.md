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

1. ✅ **session timeout 延長** (2026-02-08 完了)
   - `sphere.config.json` に `periphery.session.ttlSeconds: 300` を追加
   - GatewayServer → SphereContext への config 経路を実装
   - 変更箇所: `sphere.config.json`, `gateway-server.ts`, `server.ts`
   - 設計原則: phi-agent は完全に外部サービスとして Gateway 経由で接続
   - **180秒 → 300秒 (5分) に延長** (CPU推論対応)

2. ✅ **num_predict 削減** (2026-02-08 完了)
   - `ollama-client.ts:28` → `maxTokens: 256 → 64`
   - phi の応答は JSON のみ (action, index, h, w, d, reason) → 64 tokens で十分
   - **推論時間 ~4倍改善見込み** (100秒/回 → 25秒/回)

3. **expelled 後の再接続ロジック**
   - `agent.ts` の `exploreLoop()` で expelled を検知 → 再 connect
   - `sphere-client.ts` で expelled イベント受信時に running フラグを維持
   - 再接続には新しい ticket が必要 (/dive/request → token → WS)

## ファイル構成 (Claude 新規セッション用)

```
phi-agent/                          # トップレベル (sphere-ui と同列)
├── doc/
│   ├── SETUP.md                    # ← このファイル
│   └── FAST_PATH_DESIGN.md         # Fast Path アーキテクチャ (設計思想)
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

## 実装完了事項

### session timeout 延長 (2026-02-08)

**問題**: CPU 推論が遅く (100秒/回)、デフォルトの 180秒で expelled

**解決策**: config による timeout 延長 (300秒)

**変更箇所**:
1. `sphere.config.json:91-95` — `periphery.session` セクション追加
   ```json
   "session": {
     "ttlSeconds": 300,
     "warningBeforeEndSeconds": 30
   }
   ```

2. `gateway-server.ts` — sessionConfig/energyConfig を受け取り SphereContext に渡す
   - コンストラクタに optional パラメータ追加
   - `createSphereContext()` 呼び出し時に渡す

3. `server.ts` — GatewayServer 作成時に `this.config.session` を渡す

**設計原則**:
- phi-agent は**完全に外部サービス**として扱う
- Gateway が唯一の入口 (カップリングの作法)
- config 経由で制御 (コード変更なしで調整可能)

**config 読み込み経路**:
```
sphere.config.json
  → server.ts (this.config: PeripheryConfig)
  → GatewayServer (sessionConfig)
  → SphereContext (this._sessionTtl)
```

**関連コード**:
- `periphery/src/gateway/sphere-context.ts:68` — `DEFAULT_SESSION_TTL = 180` (fallback)
- `sphere-context.ts:211` — `sessionConfig?.ttlSeconds ?? DEFAULT_SESSION_TTL`
- `sphere-context.ts:1372-1384` — `setupTimers()` で expiry/warning タイマー設定
- `types/config.ts:99-104` — `PeripheryConfig["session"]` 型定義

### num_predict 削減 (2026-02-08)

**問題**: CPU 推論が遅い (~100秒/回) → cycle 完了まで時間がかかる

**解決策**: ollama の num_predict を削減 (256 → 64 tokens)

**変更箇所**:
- `phi-agent/src/ollama-client.ts:28` — `maxTokens: 256 → 64`

**根拠**:
- phi の応答は JSON のみ: `{"action": "focus", "index": 3, "h": 800, "w": 700, "d": 1200, "reason": "..."}`
- reason フィールドも短文で十分 → 64 tokens で余裕
- 推論時間は token 数にほぼ比例 → **256→64 で ~4倍速**

**期待効果**:
- 推論時間: ~100秒/回 → ~25秒/回
- 1 cycle (sense + 推論 + focus + 推論): ~200秒 → ~50秒
- 300秒 timeout 内で 5+ cycles 実行可能

### evaluate JSON パース修正 (2026-02-08)

**問題**: phi が markdown コードブロック ` ```json ... ``` ` で返すため JSON パース失敗

**解決策**: markdown strip + balanced brace extraction

**変更箇所**:
1. `prompt-builder.ts` — `parseAction()` 改善
   - markdown コードブロック除去: ` ```json ` / ` ``` ` → strip
   - `extractBalancedJson()` — ネストした `{ }` に対応 (reason フィールド内の braces)
   - フォールバック: simple regex (legacy compatibility)

2. `prompt-builder.ts` — `evaluateNode()` プロンプト改善
   - "TASK:" セクション追加 (明示的指示)
   - "Output format (JSON only, no markdown):" — markdown 禁止を明記
   - Example 追加: `{"action":"evaluate","h":8,"w":7,"d":4,"reason":"..."}`

**テスト結果** (2026-02-08):
```
✅ evaluate 成功: h=9 w=10 d=5
✅ Evaluations: 1 (初回 0 → 修正後 1)
✅ Heat delta: +4
✅ AutoCapsule 生成: 2 nodes 投入
✅ Pipeline 正常動作
```

### FastGate (EvalLoop) 実装 (2026-02-08)

**問題**: phi 呼び出し 3回/cycle (~75s) → 300s timeout で 4 cycles が限界

**解決策**: FastGate — ローカルスコアリング + ヒューリスティックで phi 呼び出しを 1回/cycle に削減

**変更箇所**:
1. `src/fast-gate.ts` (新規) — 16bit flag スコアリング + SessionMemory + 満足度帰還
2. `src/agent.ts` — EvalLoop アーキテクチャに書き換え
3. `src/sphere-client.ts` — NearbyNode 型拡張 (flags, kind, decay, tags) + throttle (350ms)
4. `src/prompt-builder.ts` — null ガード (content/tags/summary)
5. `src/ollama-client.ts` — temperature 0.3→0.2

**アーキテクチャ**:
```
1 cycle = move(heuristic) → sense → pick(FastGate, 0ms) → focus → phi eval(~25s) → record + compute
                                                                    ↑ 唯一の phi 呼び出し
```

| ステップ | 旧 | 新 (FastGate) |
|----------|-----|---------------|
| focus 対象選択 | phi (~25s) | 16bit flag + keyword + metrics (0ms) |
| evaluate | phi (~25s) | phi (~25s) — 変更なし |
| move 方向選択 | phi (~25s) | h >= 7→deep, h >= 5→hot, else→explore (0ms) |

**テスト結果** (2026-02-08):
```
旧: 2 cycles / 245s, 0 evaluations
新: 5 cycles / 117.8s, 4 evaluations
   ✅ ~23.6s/cycle (phi 1回のみ)
   ✅ FastGate 16bit flag scoring 動作確認 (Hot, Hub+Hot, Freshness)
   ✅ phi eval JSON パース成功 (h=5~9, w=3~8, d=3~6)
   ⚠️ Cycle 2: ghost/fossil ノード (mock data) を掴んだ
   ⚠️ Cycle 5: expelled (evaluate timeout) — session 300s 以内だがエネルギー枯渇付近
```

**既知の問題**:
1. **ghost/fossil フィルタ未実装**: sense 結果に ghost/fossil が含まれ、focus すると mock data が返る
   - 対策: FastGate.pickFocusTarget で kind === "ghost" | "fossil" をスキップ
   - 本番ではこれらが 16bit flags (Frozen=0x0080, Compressed=0x4000) に反映される可能性あり
2. **ローカル energy 消費が速い**: 100 → ~21/cycle → 5 cycle で枯渇
   - Sphere 側のエネルギーとは別 (SphereClient 内の近似値)
3. **expelled タイミング**: evaluate 送信中に expelled → timeout error
