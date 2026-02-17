# Testing Memo

Sphere Project - テスト・操作メモ

---

## 1. ファイル構成

```
sphere/ (ルートディレクトリ)
├── sphere.bat        # 統合CLI (Windows) ← メインで使用
├── sphere.sh         # 統合CLI (Unix)
├── sphere-test.bat   # 旧テストランナー
└── docker_compose_sphere_v1/
    └── services/periphery/src/mock/
        ├── contribution.ts   # テストデータ投入 (HTTP)
        ├── explore-agent.ts  # 3層探索エージェント (WebSocket)
        ├── swarm-agent.ts    # マルチエージェント群生成 (WebSocket)
        ├── resonance.ts      # スペクトルリンクテスト (HTTP)
        ├── mock_data.json    # テストデータ (153件, 16bit flag対応)
        └── test-embedding.ts # エンベディングテスト
```

---

## 2. テストの種類

### 2.1 HTTPベース（外部）

| スクリプト | コマンド | 用途 |
|-----------|---------|------|
| contribution | `npm run contribute` | テストデータ投入（15件選択） |
| contribution:batch | `npm run contribute:batch` | テストデータ全件投入（153件） |
| resonance | `npm run resonance` | スペクトルリンク形成テスト |

### 2.2 WebSocketベース（内部）

| スクリプト | コマンド | 用途 |
|-----------|---------|------|
| explore-agent | `npm run explore` | 3層探索（surface → mid → deep） |
| swarm-agent | `npm run swarm` | 複数エージェント同時探索（デフォルト3） |
| swarm-agent | `npm run swarm:5` | 5エージェント同時探索 |
| swarm-agent | `npm run swarm:10` | 10エージェント同時探索 |

---

## 3. 基本操作

### 3.0 統合CLI (sphere.bat)

`sphere/` ディレクトリから全操作を実行可能：

```batch
cd C:\...\sphere

.\sphere.bat start        # サーバ起動
.\sphere.bat stop         # サーバ停止
.\sphere.bat batch        # データ投入 (153件)
.\sphere.bat swarm 10     # 10エージェント
.\sphere.bat explore      # 3層探索
.\sphere.bat full         # batch + explore
.\sphere.bat help         # ヘルプ表示
```

### 3.1 サーバ起動

```batch
# 統合CLI (推奨)
.\sphere.bat start

# または手動
cd docker_compose_sphere_v1\services\periphery
npm run dev
```

起動後のサービス:
- HTTP: `http://localhost:3001`
- WebSocket: `ws://localhost:8081`

### 3.2 初期データ投入

```bash
cd services/periphery
npm run seed
```

3種類のカプセルが投入される:
- High-Heat: Amber昇華候補
- Medium-Heat: 通常減衰
- Low-Heat: Ghost化候補

### 3.3 外部観測テスト

```bash
# 単発探索
npm run agent

# 継続監視
npm run agent:watch

# 統計監視のみ
npm run observe
```

### 3.4 Diveテスト

```bash
npm run dive
```

フロー:
1. `POST /dive/request` → Ticket取得
2. `ws://localhost:8081?token=xxx` → 接続
3. sense → focus → evaluate → move
4. return(capsule) → 帰還

---

## 4. エンドポイント一覧

### 4.1 HTTP API

| メソッド | パス | 説明 |
|---------|-----|------|
| GET | `/` | Sphere情報 |
| GET | `/health` | ヘルスチェック |
| GET | `/nodes` | ノード一覧（heat順） |
| GET | `/nodes/stats` | ノード統計 |
| GET | `/nodes/:id` | 特定ノード取得 |
| POST | `/sphere/contribute` | 外部データ投稿 |
| GET | `/sphere/explore` | クエリ探索 |
| GET | `/rulebook` | エージェントルールブック |
| GET | `/schema` | データ形式仕様 |

### 4.2 Dive API

| メソッド | パス | 説明 |
|---------|-----|------|
| POST | `/dive/request` | Diveチケット発行 |
| GET | `/dive/validate/:token` | チケット検証（デバッグ用） |
| GET | `/dive/stats` | Dive統計 |

### 4.3 WebSocket Messages

```
Agent → Gateway:
  { type: "sense", requestId, radius? }
  { type: "focus", requestId, nodeId }
  { type: "evaluate", requestId, nodeId, score }
  { type: "move", requestId, intent }
  { type: "return", requestId, capsule? }

Gateway → Agent:
  { type: "ready", sessionId, position, remainingTime }
  { type: "senseResult", requestId, nodes }
  { type: "focusResult", requestId, node }
  { type: "moveResult", requestId, result }
  { type: "returnAck", requestId }
  { type: "warning", message }
  { type: "expelled", reason }
  { type: "error", requestId?, error }
```

---

## 5. テストシナリオ

### 5.1 基本動作確認

```bash
# 1. サーバ起動
start-sphere.bat  # オプション1（Peripheryのみ）

# 2. 初期データ投入
cd services/periphery
npm run seed

# 3. ノード確認
curl http://localhost:3001/nodes/stats

# 4. 外部観測
npm run agent
```

### 5.2 Dive動作確認

```bash
# 1. サーバ起動済みの状態で
npm run dive

# 期待される出力:
# - Ticket取得成功
# - WebSocket接続成功
# - sense → nodes一覧
# - focus → 詳細取得
# - move → 移動
# - return → Capsule提出
```

### 5.3 代謝確認

```bash
# 1. サーバ起動
start-sphere.bat

# 2. 統計監視開始（別ターミナル）
npm run observe

# 3. データ継続投入（別ターミナル）
npm run mock-bot

# 観察ポイント:
# - Ghost TTL減少 → 蒸発
# - 高heat維持 → Amber昇華
# - 無観測 → Fossil化
```

### 5.4 スペクトルリンク確認

```bash
# 1. サーバ起動
start-sphere.bat

# 2. Resonance投入
npm run resonance

# 観察ポイント:
# - 同クラスタノード生成
# - Amber昇華
# - Amber-Amber間リンク形成
```

---

## 6. 環境変数

| 変数 | デフォルト | 説明 |
|-----|----------|------|
| SERVER_URL | http://localhost:3001 | HTTPサーバURL |
| HTTP_URL | http://localhost:3001 | Dive用HTTP URL |
| WS_URL | ws://localhost:8081 | Dive用WebSocket URL |
| INTERVAL | 5000 | 監視間隔（ms） |
| AGENT_NAME | (ランダム) | エージェント名 |
| CLUSTER_ID | A | Resonanceクラスタ名 |

---

## 7. トラブルシューティング

### 7.1 接続エラー

```
Error: connect ECONNREFUSED
```
→ サーバが起動していない。`npm run dev` を実行。

### 7.2 Ticket取得失敗

```
Ticket request failed: Rate limit exceeded
```
→ レート制限（10/分/IP）に達した。60秒待つ。

### 7.3 WebSocket接続失敗

```
WebSocket error: Invalid token
```
→ Ticketが期限切れ（300秒）。再取得する。

---

## 8. マルチエージェントテスト（Swarm）

### 8.1 概要

複数エージェントを同時生成し、並列探索の影響を観測するテスト。

```bash
# 基本実行（デフォルト3エージェント）
npm run swarm

# エージェント数指定
npx tsx src/mock/swarm-agent.ts -n 5

# 振る舞いパターン指定
npx tsx src/mock/swarm-agent.ts -n 5 -b focused -t "AI"

# sphere-test コマンド
./sphere-test.sh swarm 5
sphere-test.bat swarm 5
```

### 8.2 振る舞いパターン

| パターン | 説明 |
|---------|------|
| `random` | ランダムな評価（デフォルト） |
| `focused` | 特定トピックのノードを優先評価 |
| `distributed` | 各エージェントが異なるエリアを探索 |

### 8.3 CLIオプション

| オプション | 説明 | デフォルト |
|-----------|------|----------|
| `-n, --count` | エージェント数 | 3 |
| `-b, --behavior` | 振る舞いパターン | random |
| `-t, --topic` | フォーカストピック | - |
| `-d, --duration` | 最大探索時間(ms) | 20000 |
| `-i, --interval` | 生成間隔(ms) | 1000 |

### 8.4 レート制限設定

`ticket-issuer.ts` の `DEFAULT_TICKET_CONFIG`:

```typescript
rateLimit: {
  maxPerMinute: 30,    // 1分あたりの最大チケット数/IP
  maxConcurrent: 10,   // 同時接続数/IP
}
```

> **Note**: テスト用に緩和済み（元: maxConcurrent=3）

### 8.5 出力メトリクス

```
┌─────────────────────────────────────────────────┐
│             Swarm Test Results                  │
├───────────────────────────┬─────────────────────┤
│ Total Agents              │ 5                   │
│ Completed                 │ 5                   │
│ Failed                    │ 0                   │
│ Total Nodes Discovered    │ 150                 │
│ Total Evaluations         │ 180                 │
│ Total Heat Delta          │ +145.32             │
│ Duration                  │ 25.4s               │
└───────────────────────────┴─────────────────────┘
```

---

## 9. Observatory-Forge 連携

### 9.1 概要

Observatory が異常検知時に Periphery の Forge API を呼び出し、Environmental Node を生成する。

```
Observatory (UDP 41234)
    ↓ Pulse 受信・統計分析
    ↓ 異常検知 (Z-score > threshold)
    ↓
POST /sphere/forge/environmental
    ↓ 認証: X-Service-Id, X-Service-Secret
    ↓
NodeForge.forgeEnvironmental()
    ↓
projectionDB に環境ノード配置
```

### 9.2 エンドポイント

| Endpoint | 用途 | 認証 |
|----------|------|------|
| `POST /sphere/forge/environmental` | 環境ノード生成 | 必須 |
| `POST /sphere/forge/link` | リンクノード生成 | 必須 |

### 9.3 認証設定

**Periphery側** (`config.ts`):
```typescript
externalServices: {
  allowed: [{
    id: "observatory",
    name: "Pulse Observatory",
    secret: process.env.OBSERVATORY_SECRET || "observatory-secret-key",
    allowedEndpoints: ["forge/link", "forge/environmental"],
  }],
}
```

**Observatory側** (`observatory.config.json`):
```json
{
  "observatory": {
    "forgeAuth": {
      "serviceId": "observatory",
      "serviceSecret": "observatory-secret-key"
    }
  }
}
```

### 9.4 異常タイプのマッピング

| Observatory検出 | Forge AnomalyType | 説明 |
|----------------|-------------------|------|
| `a` + `drop` | `attractant_drop` | プランクトン密度低下 |
| `r` + `spike` | `repellent_spike` | Ghost 過多 |
| `d` + `drop` | `density_drop` | 実体密度低下 |
| `f` + `drop` | `flow_drop` | 流動性低下 |

### 9.5 EnvironmentalRequest 形式

```typescript
{
  anomalyType: "attractant_drop" | "repellent_spike" | "density_drop" | "flow_drop",
  severity: number,        // Z-score の絶対値
  signal: { a, r, d, f },  // 検出時の信号値
  suggestedAction: string  // "inject" | "adjust" | "alert"
}
```

### 9.6 テスト手順

1. Periphery 起動: `.\sphere.bat start`
2. Observatory 起動: `cd sphere-observatory && npm start`
3. データ投入: `.\sphere.bat batch`
4. Swarm で活動を発生: `.\sphere.bat swarm 10`
5. Observatory ログで異常検知・Forge 呼び出しを確認

### 9.7 トラブルシューティング

| エラー | 原因 | 対処 |
|--------|------|------|
| `404` | 旧エンドポイント `/sphere/submit` を使用 | Observatory 再ビルド |
| `401` | 認証ヘッダー不足 | `forgeAuth` 設定確認 |
| `403` | シークレット不一致 | 両側の `secret` を一致させる |
| `not mapped to forge type` | 未対応の異常組み合わせ | 正常動作（スキップ） |

---

## 10. 今後のテスト追加予定

| 項目 | 優先度 | 状態 |
|-----|-------|------|
| 複数同時Dive | 中 | **実装済** (swarm-agent.ts) |
| Observatory-Forge連携 | 高 | **実装済** (2026-02-01) |
| 切断猶予テスト | 中 | 未実装 |
| projectionDB時系列モニタ | 中 | 未実装 |
| 負荷テスト | 低 | 未実装 |
| E2Eテスト | 低 | 未実装 |

---

## 11. インフラ（保留）

nginx設定は `infra/nginx.conf.example` に保存済み。
テスト完了後、本番化時に適用を検討。

```
infra/
└── nginx.conf.example   # プロキシ設定（Rate Limit, WS対応）
```

---

## 13. テスト実行時の注意事項 (2026-02-12)

### 13.1 SystemCore 汚染とサーバ再起動

**問題**: `seedSphere()` はサーバ起動時に `mock_data.json` を読み込む。mock_data を修正しても、**サーバを再起動しない限り旧データが Sphere に残る**。

| 症状 | 原因 |
|------|------|
| SystemCore ノードが大量に存在 | 旧 mock_data のタグ (`model`, `architecture`, `system` 等) が SystemCore regex にマッチ |
| 修正済みタグが反映されない | サーバ起動後に mock_data.json を修正した |
| ノードが不死化 (decay=0, ttl_decay=0) | SystemCore フラグの物理効果 |

**対処**: mock_data.json 修正後は **必ずサーバ再起動**。

```batch
# Periphery 再起動 (projectionDB はメモリ上なのでリセットされる)
.\sphere.bat stop
.\sphere.bat start
```

### 13.2 WS ポートの確認

| 環境 | HTTP | WebSocket | 推奨 |
|------|------|-----------|------|
| ローカル dev (`npm run dev`) | 3001 | **8081** | テスト非推奨 |
| **同一ポートモード** (`PORT=3001`) | 3001 | **3001** | **テスト推奨** |
| Docker / デプロイ | 3001 | **3001** | 本番 |

**ローカルテストは同一ポートモードを使う** (Section 15.1 参照)。
デプロイ環境では複数ポートを使えないため、同一ポート動作を確認すること。

```powershell
# 同一ポートモード (推奨)
$env:SPHERE_WS='ws://localhost:3001'

# npm run dev で起動した場合のみ
$env:SPHERE_WS='ws://localhost:8081'
```

**判別方法**: Periphery 起動ログで `same port` / `separate port` を確認。

### 13.3 Windows 環境変数の罠

Windows cmd の `set` は**同一コマンドチェーン内**でしか有効にならない場合がある。
phi-agent 実行時は **bat ファイル経由**が安全。

```batch
@echo off
cd /d "%~dp0phi-agent"
set SPHERE_URL=http://localhost:3001
set SPHERE_WS=ws://localhost:3001
set OLLAMA_HOST=http://localhost:11434
set OLLAMA_MODEL=phi3:mini
set LOADOUT=moth
set EVALUATE=true
set RESPONSE=true
node dist/index.js "knowledge exploration"
```

> `set VAR=value && command` 形式は `&&` 前後のスペースで値が汚染される場合がある。

### 13.4 テスト前チェックリスト

```
□ Periphery 起動確認     curl http://localhost:3001/health
□ Ollama 起動確認        curl http://localhost:11434/api/tags
□ WS ポート特定          curl http://localhost:8081/ (応答なし→3001)
□ ノード数確認           curl http://localhost:3001/nodes/stats
□ phi-agent ビルド       cd phi-agent && npm run build
□ mock_data 修正後       → サーバ再起動
□ SystemCore 確認        /nodes/metrics で flags に 0x2000 が含まれないこと
```

### 13.5 テスト結果の読み方

**eval-log.jsonl** (phi-agent/data/):
```jsonl
{"loadout":"moth","model":"phi3:mini","query":"...","evaluations":[{"nodeId":"...","h":8,"w":9,"d":5,"tags":[...]}],"busEmits":2,"busRecvs":4}
```

**確認ポイント**:

| 項目 | 正常 | 異常 |
|------|------|------|
| h/w/d 分散 | 値にばらつきあり | 全評価で同じ値 (スタンプ) |
| d 測定 | phi3:mini: d=0-6+ | d=3 完全固定 (gemma2:2b without species memory) |
| JSON 成功率 | phi3:mini: 90%+ | 連続 parse failure |
| Bus | h>=8 でのみ emit | 全評価で emit (h 固定高値) |
| Feelings 遷移 | sat→camp, stale→leap | 同一行動のみ |

### 13.6 既知の制限

- **単一クエリでは d 測定能力を判別不能** — クエリ多様性が必須
- **species-profile.json 依存**: 初回実行時はプロファイルなし → Digestor 実行後に精度向上
- **Narrative 途中切断**: maxTokens 128 のため長文は末尾が切れる (仕様)
- **API エンドポイント**: `/nodes` は 404。正しくは `/nodes/metrics` (ノード一覧) / `/nodes/stats` (統計)

---

## 14. データ蓄積テスト手順 (gen-006〜, 2026-02-12)

### 14.1 概要

9種族を3並列×3ラウンドで蓄積テストを実施する。
モデルは **llama3.2:1b** (内部評価用、species memory calibration 済み)。
各ラウンド後に Digestor を手動起動し、世代を刻む。

| ラウンド | 種族 | 所要時間 |
|---------|------|---------|
| R1 | balanced, scholar, scout | 約20分 |
| R2 | archivist, hunter, moth | 約20分 |
| R3 | hermit, wanderer, sniper | 約20分 |

**1ラウンド = テスト10分 + データ投入10分**
**合計: 約60分 (3ラウンド) + Digestor 3回**

### 14.1.5 テスト前清掃手順 (CRITICAL)

**新しいテストを開始する前に必ず実行**

```batch
:: Step 1: 全 node プロセスを停止
powershell -Command "Stop-Process -Name node -Force -ErrorAction SilentlyContinue"

:: Step 2: Periphery 再ビルド (設定変更があれば)
cd /d "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1\services\periphery"
npm run build

:: Step 3: Periphery 起動 (新しいウィンドウ)
powershell -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd \"C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1\services\periphery\"; npm run dev' -WindowStyle Normal"

:: Step 4: 10秒待機後、確認
timeout /t 10 /nobreak
curl http://localhost:3001/health
curl http://localhost:3001/dive/stats
```

**期待される出力:**
```
{"status":"ok","service":"periphery"}
{"activeTickets":0,"activeSessions":0}
```

**activeSessions が 0 でない場合**: Periphery を再起動 (Step 1-3 を再実行)

**理由**: 前回テストの session が解放されず、rate limit (maxConcurrent) に引っかかる可能性がある。

---

### 14.2 前提条件

```
□ Periphery 起動確認     curl http://localhost:3001/health
□ Ollama 起動確認        curl http://localhost:11434/api/tags
□ llama3.2:1b 存在確認   curl http://localhost:11434/api/tags で llama3.2:1b が表示
□ WS ポート特定          curl http://localhost:8081/ (応答あり→8081, なし→3001)
□ phi-agent ビルド       cd phi-agent && npm run build
□ digestor ビルド        cd digestor && npm run build
□ ノード数確認           curl http://localhost:3001/nodes/stats
□ 現在の世代確認         phi-agent/data/generations/ の最新 gen-NNN を確認
□ eval-log 状態確認      phi-agent/data/eval-log.jsonl の行数確認
```

### 14.3 クエリセット

測定能力の検証にはクエリ多様性が必須。以下のクエリを3並列で分散させる。

```
Q1: "knowledge exploration"        (汎用)
Q2: "trending viral discussions"   (ephemeral 寄り)
Q3: "fundamental mathematics"      (timeless 寄り)
Q4: "emerging technology trends"   (temporal mixed)
Q5: "philosophical foundations"    (dense, authority)
Q6: "creative art movements"       (cognitive, insightful)
```

各エージェントに異なるクエリを割り当てて d 測定の分散を促す。

### 14.4 テスト実行 — ラウンド1 (balanced, scholar, scout)

#### Step 1: Sphere へデータ投入 (10分)

```batch
cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original"
.\sphere.bat batch
```

153件のノードが投入される。投入後、ノード数を確認:

```batch
curl http://localhost:3001/nodes/stats
```

#### Step 2: 3並列エージェント実行 (10分)

**ターミナル1 — balanced:**
```batch
cd /d "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
set SPHERE_URL=http://localhost:3001
set SPHERE_WS=ws://localhost:8081
set OLLAMA_HOST=http://localhost:11434
set OLLAMA_MODEL=llama3.2:1b
set LOADOUT=balanced
set EVALUATE=true
set RESPONSE=true
node dist/index.js "knowledge exploration" --daemon --sleep 30000
```

**ターミナル2 — scholar:**
```batch
cd /d "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
set SPHERE_URL=http://localhost:3001
set SPHERE_WS=ws://localhost:8081
set OLLAMA_HOST=http://localhost:11434
set OLLAMA_MODEL=llama3.2:1b
set LOADOUT=scholar
set EVALUATE=true
set RESPONSE=true
node dist/index.js "fundamental mathematics" --daemon --sleep 30000
```

**ターミナル3 — scout:**
```batch
cd /d "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
set SPHERE_URL=http://localhost:3001
set SPHERE_WS=ws://localhost:8081
set OLLAMA_HOST=http://localhost:11434
set OLLAMA_MODEL=llama3.2:1b
set LOADOUT=scout
set EVALUATE=true
set RESPONSE=true
node dist/index.js "trending viral discussions" --daemon --sleep 30000
```

**10分経過後**: 全ターミナルで **Ctrl+C** で停止。

#### Step 3: 中間確認

```batch
:: eval-log の行数確認 (増えているはず)
powershell -Command "(Get-Content 'phi-agent\data\eval-log.jsonl').Count"

:: 直近のエントリ確認 (loadout, model, evaluations 件数)
powershell -Command "Get-Content 'phi-agent\data\eval-log.jsonl' | Select-Object -Last 3"
```

**異常チェック**:
- h/w/d が全評価で同じ値 → **スタンプ (即停止)**
- JSON parse failure が連発 → **プロンプト競合 (即停止)**
- evaluations が空配列 → **接続エラー (WS ポート確認)**

### 14.5 テスト実行 — ラウンド2 (archivist, hunter, moth)

Step 1 のデータ投入を再実行 (既存ノードの減衰分を補充):

```batch
.\sphere.bat batch
```

Step 2 と同様に3ターミナルを開き、以下を変更:

| ターミナル | LOADOUT | クエリ |
|-----------|---------|--------|
| 1 | archivist | "philosophical foundations" |
| 2 | hunter | "emerging technology trends" |
| 3 | moth | "creative art movements" |

10分経過後 Ctrl+C。中間確認を実施。

### 14.6 テスト実行 — ラウンド3 (hermit, wanderer, sniper)

Step 1 のデータ投入を再実行:

```batch
.\sphere.bat batch
```

Step 2 と同様に3ターミナルを開き:

| ターミナル | LOADOUT | クエリ |
|-----------|---------|--------|
| 1 | hermit | "knowledge exploration" |
| 2 | wanderer | "trending viral discussions" |
| 3 | sniper | "fundamental mathematics" |

10分経過後 Ctrl+C。中間確認を実施。

### 14.7 Digestor 手動起動

各ラウンド完了後、または全ラウンド完了後に実行。

```batch
cd /d "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\digestor"
set DATA_DIR=..\phi-agent\data
set ONCE=1
node dist/digestor.js
```

**期待される出力:**
```
[digestor] Starting — one-shot, half_life=72h, min_evals=50
[digestor] Source: ..\phi-agent\data\eval-log.jsonl
[digestor] Output: ..\phi-agent\data\species-profile.json
[digestor] Read N sessions, M evaluations
[digestor] Hunger: X.XX (M evals)
[digestor] Survived: S/M (XX%)
[digestor] Profile written: K species, S surviving evals
[digestor] Generation NNN archived
[digestor] eval-log truncated: T sessions
  balanced: XX evals, h=X.X w=X.X d=X.X, N nodes, T tags
  scholar: ...
  (各種族のサマリ)
[digestor] One-shot complete.
```

**確認ポイント:**
- `Hunger` が 0.3〜0.6 の範囲か (低すぎ→淘汰なし、高すぎ→小種族絶滅)
- `Survived` が 50%〜80% か
- 全9種族が species 一覧に表示されるか
- `generations/gen-NNN.json` が新規作成されたか

**異常時:**
- `Skip: N < 50 minimum evaluations` → 評価数不足。テストを追加で実施
- 特定種族が欠落 → MIN_PER_SPECIES (20) 未満。その種族のセッションを追加
- Hunger > 0.8 → 評価が多すぎ。正常動作だが小種族の生存率に注意

### 14.8 結果検証

#### 世代ファイル確認

```batch
:: 最新の世代ファイルを確認
powershell -Command "Get-Content 'phi-agent\data\generations\gen-006.json' | ConvertFrom-Json | Select-Object generation,inputEvaluations,survivedEvaluations,hunger"
```

#### 種族別サマリ確認

```batch
:: species-profile.json を読む
powershell -Command "(Get-Content 'phi-agent\data\species-profile.json' | ConvertFrom-Json).species | Format-Table"
```

#### 測定品質の確認基準

| 項目 | 正常 (llama3.2:1b + species memory) | 異常 |
|------|--------------------------------------|------|
| h range | 種族ごとに異なる平均、range 1pt+ | 全種族同値 |
| w range | 種族ごとに異なる平均、range 1pt+ | 全種族同値 |
| d range | range 2pt+ (species memory 効果) | d 完全固定 |
| 種族間分散 | 3クラスタ以上 (heat生産/weight蓄積/中央) | 全種族同傾向 |
| Bus emit | moth, hunter で多い (h>=8) | 全種族均一 |

### 14.9 中止基準

以下のいずれかに該当したら即座にテストを中止:

1. **スタンプ検出**: 3セッション連続で h/w/d が同一値
2. **JSON parse failure 連発**: 5回連続で LLM 出力が解析不能
3. **Sphere 接続断**: WebSocket が切断され再接続しない
4. **Ollama 応答なし**: LLM 推論が 120秒以上返らない
5. **eval-log 書き込み失敗**: ファイルが空 or 減少している

### 14.10 テスト後の整理

```batch
:: eval-log のバックアップ (テスト前に取得推奨)
copy phi-agent\data\eval-log.jsonl phi-agent\data\eval-log-backup-YYYYMMDD.jsonl

:: narrative-log の確認
powershell -Command "(Get-Content 'phi-agent\data\narrative-log.jsonl').Count"
```

2/12
開発者による手動テストのログ
これを確認せよ
"C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\run-chk.ps1"
GEN008　までは　手動テストの後Digestor によりデータを更新してある
その後、下位モデルの挙動を確認するために run-chk を作成、実施
データの汚染を防ぐため、保存場所を回避してある、以降のテストでは
Digest 対象は所定の場所へ、仮チェックは同様に退避させてからテストする

そして　テストの結果、なんと以前はスタンプ傾向があった
Gemma の方が GEN008には適切に対応している様子が観察された、
一度 CLAUDE も作動させ、確認せよ。
だからと言って、Gemma > llama3.2:1b　と結論するわけではないが、多角的に挙動を把握する必要がある、ナラティブ面では相変わらず
gemma が優秀なようだ

ねんのため、Digestor の最新データプールも確認し、
手動テストの結果を把握した上で議論せよ

推論時の評価出力文字数　も　128程度が良いらしいが、これもチェックしてみてくれ　速度と関係するかを確認すべきだ

---

## 15. phi-agent daemon テスト手順 (2026-02-13)

### 15.1 ポート設定 — 混乱の根本原因

**デプロイ環境 (Docker/Fly.io 等) では複数ポートを使えない。**
そのため Periphery に `PORT` 環境変数で同一ポートモードが存在する。

| 環境 | HTTP | WebSocket | Periphery 起動方法 |
|------|------|-----------|-------------------|
| **ローカル dev** (`npm run dev`) | 3001 | **8081** (別ポート) | `npm run dev` (PORT 未設定) |
| **同一ポートモード** | 3001 | **3001** (同一) | `PORT=3001 node dist/index.js` |
| **Docker / デプロイ** | 3001 | **3001** (同一) | `PORT=3001` (docker-compose で設定) |

**ローカルでテストする際は同一ポートモードを使う** (デプロイ環境と一致させる):

```powershell
# Periphery 起動 (同一ポートモード)
cd docker_compose_sphere_v1\services\periphery
$env:PORT='3001'
$env:SPHERE_CONFIG='..\..\sphere.config.json'
node dist/index.js
```

**phi-agent 側は常に `SPHERE_WS=ws://localhost:3001`:**

```powershell
$env:SPHERE_URL='http://localhost:3001'
$env:SPHERE_WS='ws://localhost:3001'
```

> **注意**: `npm run dev` で起動した場合は WS が 8081 になる。
> 起動ログの `[GatewayServer] WebSocket ...` 行で実際のポートを確認すること。

### 15.2 テスト前: クリーンスタート手順

```powershell
# Step 1: 全 node プロセスを停止
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# Step 2: ポート解放確認
netstat -ano | findstr ":3001"
# → 出力なしなら OK。残っていれば taskkill /PID <PID> /F

# Step 3: Periphery 起動 (同一ポートモード)
cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1\services\periphery"
$env:PORT='3001'
$env:SPHERE_CONFIG='C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1\sphere.config.json'
node dist/index.js

# Step 4: 起動確認 (別ターミナル)
curl http://localhost:3001/health
# → {"status":"ok","service":"periphery"}

curl -X POST http://localhost:3001/dive/request -H "Content-Type: application/json" -d "{}"
# → {"success":true,"ticket":{"token":"..."}}
```

**起動ログで確認するべき行:**
```
[GatewayServer] WebSocket attached to HTTP server (same port)  ← 同一ポートモード
[PeripheryServer] WebSocket Gateway: ws://localhost:3001 (same port)
```

`[GatewayServer] WebSocket server listening on port 8081` と出たら **PORT 未設定**。やり直す。

### 15.3 phi-agent daemon テスト実行

#### CLI フラグ一覧 (存在するもの)

| フラグ | 説明 | 例 |
|--------|------|-----|
| `--daemon` | デーモンモード (無限ループ) | |
| `--sleep N` | セッション間隔 (ms) | `--sleep 5000` |
| `--cycles N` | 1セッションの最大サイクル数 | `--cycles 3` |
| `--loadout NAME` | 種族指定 | `--loadout moth` |
| `--quiet` | デバッグログ抑制 | |
| `--response` | narrative 生成 | |
| `--no-evaluate` | 評価なし (観察のみ) | |

> **⚠️ `--sessions` フラグは存在しない。**
> `--sessions 6` と書くと `6` がクエリとして解釈され `QUERY_TOO_SHORT` で全セッション失敗する。
> デーモンは手動 Ctrl+C で停止する。

#### 単一セッション テスト (動作確認用)

```powershell
cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
$env:SPHERE_URL='http://localhost:3001'
$env:SPHERE_WS='ws://localhost:3001'
$env:OLLAMA_HOST='http://localhost:11434'
$env:OLLAMA_MODEL='gemma2:2b'   # or phi3:mini, llama3.2:1b
$env:LOADOUT='wanderer'
$env:EVALUATE='true'
$env:RESPONSE='false'
node dist/index.js "food" 2>&1 | Select-String "Using model|Connected|Cycles:|Duration:|Error:|FastGate|Focused|evaluation|phi-agent"
```

#### デーモン テスト (蓄積用)

```powershell
cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\phi-agent"
$env:SPHERE_URL='http://localhost:3001'
$env:SPHERE_WS='ws://localhost:3001'
$env:OLLAMA_HOST='http://localhost:11434'
$env:OLLAMA_MODEL='gemma2:2b'
$env:LOADOUT='random'          # セッションごとに種族再抽選
$env:EVALUATE='true'
$env:DEBUG='true'
node dist/index.js --daemon --sleep 5000 --cycles 3
# → Ctrl+C で停止
```

**LOADOUT=random**: セッションごとに異なる種族が自動選択される。
クエリは QUERY_POOL (18種) からランダムに割り当てられる (明示クエリ指定なしの場合)。

### 15.4 テスト後: プロセス停止

```powershell
# 全 node プロセスを停止
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# 確認
Get-Process node -ErrorAction SilentlyContinue
# → 出力なしなら OK
```

**テスト終了時には必ずプロセスを停止すること。**
Periphery の WS セッションがリークし、次回テストで rate limit (`maxConcurrent`) に引っかかる。

### 15.5 トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `QUERY_TOO_SHORT` | `--sessions N` を使った (存在しないフラグ) | `--sessions` を削除。数字がクエリになっている |
| `Connection timeout` | WS ポート不一致 | Periphery ログでポート確認。`SPHERE_WS` を合わせる |
| `AggregateError` | Periphery 未起動 or ポート占有 | `curl /health` で確認。プロセス停止→再起動 |
| `Error: listen EADDRINUSE` | ポートが使用中 | `netstat -ano \| findstr :3001` → `taskkill /PID <PID> /F` |
| 全セッションで `Error:` | Periphery が起動直後に落ちている | 背景プロセスのログを確認 |
| expression が全て `[0,0,0,0]` | 旧テンプレート or hex 解析失敗 | `prompt-builder.ts` で `"____"` テンプレートを確認 |
| Species profile が反映されない | Digestor 未実行 | `ONCE=1 node dist/digestor.js` で手動実行 |

### 15.6 Expression 実験テスト手順 (2026-02-13)

Expression = LLM の非言語的出力。hex `"____"` テンプレートで 4D nibble array (各 0-15) を取得。

```powershell
# 1. クリーンスタート (15.2 参照)
# 2. デーモン実行 (6セッション程度で Ctrl+C)
$env:OLLAMA_MODEL='gemma2:2b'   # 出力率 100%, a-f 偏向
# or
$env:OLLAMA_MODEL='phi3:mini'   # 出力率 70%, 均等分布, 0 使用あり

$env:LOADOUT='random'
node dist/index.js --daemon --sleep 5000 --cycles 3

# 3. 結果確認 — Bus emit の expression を抽出
# ログから:
#   [phi-agent] Bus emit: node=XXXXXXXX h=8 w=9 expr=[13,14,10,12] ...
# eval-log.jsonl から:
#   grep "expression" phi-agent\data\eval-log.jsonl

# 4. プロセス停止 (15.4 参照)
```

**モデル別 expression 特性 (2026-02-13 測定):**

| 指標 | gemma2:2b | phi3:mini |
|------|-----------|-----------|
| 出力率 | ~100% | 70% |
| ユニーク率 | 82% (9/11) | 74% (14/19) |
| ゼロ nibble | なし | あり (c000, cc00) |
| `"de"` プレフィクス | 45% | 11% |
| 分布 | a-f 偏向 (d 重心) | a-e 均等, 0 混在 |

---

作成日: 2025-01-31
更新日: 2026-02-17

---

## 16. docker-compose 統合環境テスト手順 (2026-02-17)

### 16.1 概要

ローカル dev から docker-compose 統合環境 (`docker_compose_sphere_v1/`) に移行後の
初回テスト手順と、発見された落とし穴をまとめる。

### 16.2 起動状態確認

```bash
cd docker_compose_sphere_v1
docker compose ps
# → periphery, postgres, redis, minio, nginx, ollama が healthy であること
```

**agent プロファイルのサービス** (digestor, pool-service, explorers, phi-agent) は
別途 `--profile agent` で起動する。

### 16.3 テスト前チェックリスト (docker-compose版)

```
□ 全コアサービス healthy  docker compose ps
□ periphery ヘルス確認    curl http://localhost:3001/health
□ ollama モデル確認       curl http://localhost:11434/api/tags
□ ノード数確認            curl http://localhost:3001/nodes/stats
□ 前回テストからのイメージ更新があれば rebuild 必須 (後述)
```

### 16.4 標準テストシーケンス

#### Step 1: イメージ再ビルド (コード変更時)

```bash
docker compose build periphery
docker compose up -d periphery
```

TypeScript のコンパイルエラーがある場合はここで止まる。修正→再ビルド。

#### Step 2: バッチデータ投入

```bash
docker compose exec periphery node dist/mock/contribution.js batch
# → "319 items → 253 nodes, 32 capsules" のような出力が出ればOK
```

#### Step 3: explore-agent テスト

```bash
docker compose exec periphery node dist/mock/explore-agent.js
# WS接続・sense/focus/evaluate が正常に動くことを確認
```

#### Step 4: phi-agent 起動・確認

```bash
docker compose --profile agent up -d phi-agent
docker compose logs --tail=60 phi-agent
# → "Positioned in Sphere" "FastGate pick" "phi eval" が出ることを確認
# → "== BROADCAST START ==" が出ることを確認
```

### 16.5 docker-compose 環境の WS ポート

**重要**: docker-compose の periphery は `PORT=3001` で起動するため、
HTTP と WebSocket が同じ port 3001 で動く (同一ポートモード)。

| 接続元 | 使う URL |
|--------|---------|
| phi-agent (コンテナ内) | `ws://periphery:3001` (docker-compose.yml で設定) |
| explore-agent (コンテナ内) | `ws://localhost:3001` (WS_URL 環境変数) |
| ホストから直接 | `ws://localhost:3001` |

**explore-agent の env var 名は `WS_URL`** (phi-agent の `SPHERE_WS` とは別)。
`docker-compose.yml` の periphery environment に設定済み:

```yaml
environment:
  PORT: "3001"
  WS_URL: ws://localhost:3001   # ← explore-agent 用
  SPHERE_WS: ws://localhost:3001
```

### 16.6 よくある落とし穴

#### contribution.ts の複数関数トラップ

`RawData` インターフェースを変更した場合、**3つの関数すべてを更新すること**:

- `contribute()` (単発)
- `contributeBatch()` (バッチ)
- `contributeWave()` (ウェーブ)

以前のバグ: `RawData` から `title?` / `payload?` を削除したが、
`contributeBatch` と `contributeWave` 内の `data.title` / `data.payload` が
残ったままで、Docker ビルド時に TypeScript コンパイルエラーが発生した。

#### Docker イメージの鮮度

コードを変更したら **必ず `docker compose build`** が必要。
`docker compose up -d` だけでは既存イメージを使い回すので変更が反映されない。

#### rate limit (3 actions/sec)

explore-agent が layer 遷移時に連続アクション (scan → warp test) を送ると
`Rate limit: max 3 actions/sec` エラーが出ることがある。これは既知の挙動で、
phi-agent は影響を受けない (非同期で await しながら動くため)。

#### Decay Preset とデプロイモードの関係 (2026-02-17)

**`NODE_ENV` (環境モード) と `decay.preset` (代謝性格) は独立した軸である。**

| 軸 | 意味 | 設定場所 |
|----|------|----------|
| `NODE_ENV=production` | 環境モード (ログ量、TTL倍率、最適化) | docker-compose.yml の environment |
| `decay.preset` | スフィアの代謝速度・性格 | sphere.config.json の `renal_core.decay.preset` |

**プリセット一覧 (2026-02-17 改訂):**

| Preset | Heat半減期 | alpha | 用途 | デプロイ例 |
|--------|-----------|-------|------|-----------|
| archive | ~2時間 | 1.0 | 図書館型、長期保存重視 | 知識蓄積が目的の本番環境 |
| natural | ~30分 | 3.0 | 汎用 (1〜3 agent 運用) | 標準的な本番・ステージング |
| flow | ~5分 | 10.0 | SNS型、高速回転 | 多エージェント・高頻度投入の本番 |
| dev | ~2分 | 30.0 | 開発用、ライフサイクル観測 | ローカル開発・CI |

**フォールバック** (preset 未指定時): `development → dev`, `production → natural`

**本番デプロイの選択指針:**
- "production だから archive" ではない。スフィアの運用目的に応じて選ぶ
- 少数 agent + 知識保存 → archive
- 汎用運用 → natural
- 高回転・多 agent → flow
- minLoadFactor に注意: archive=0.05 (最低5%稼働), natural/flow=0.1, dev=1.0 (常時フル)

**改訂経緯:** 旧 "balanced" プリセットは heatDecayFactor=0.01 (半減期 ~69秒) で速すぎた。
1 agent では wave 投入なしにノード維持が不可能。
全プリセットを半減期ベースで再設計し、"balanced" → "natural" に改名。"custom" プリセットは廃止。

#### DAEMON=true の放置トラップ (2026-02-17)

**phi-agent を `DAEMON=true` で起動したまま放置すると、Digestor が自律的に世代を進め続ける。**

実例:
- Feb 9 に gen-011 まで手動テスト → コンテナを停止せず放置
- Feb 10〜17 の間に gen-012〜050 が自律生成 (計 39 世代)
- sniper 種が全評価の 41% を占めるまで偏重、avgD が 1.8倍に膨張
- 旧コンテンツ (linguistics/DNS/math) が事実上 ghost 化

**テスト後は必ずデーモンを停止すること:**

```bash
docker compose --profile agent down
# または phi-agent だけ停止
docker compose stop phi-agent
```

**意図せず大量の世代が積み上がった場合の回復手順:**

1. `docker compose down` でコンテナ全停止
2. 一時コンテナで phi-agent-data を部分クリーン (意味ある世代のみ残す)
3. `sphere-postgres-data` など実データボリュームを削除
4. `docker compose up -d` 後に contribution.ts で mock data を再投入

#### Relic (原典ノード) 実装 (2026-02-17)

**Relic = スフィアに事前配置する不変の座標アンカー。10 本の Pillar が意味空間の骨格を形成する。**

| 項目 | 仕様 |
|------|------|
| データファイル | `periphery/src/mock/relics.json` (10 Pillars) |
| フラグ | `SystemCore (0x2000)` — 代謝完全停止 |
| kind | `"relic"` (Packer が SystemCore を検出して自動設定) |
| 初期 heat | baseHeat × 0.4 = **300** (控えめ、探索を支配しない) |
| 初期 weight | normal tier と同等 = **100** |
| 評価 | **案1: 評価は受け付けるが結果を適用しない** (bookkeeper の freeze guard) |
| TTL | top tier (172,800s) だが decay=0 なので実質無限 |

**10 Pillars:**
1. Logic (論理と数学) — syllogism, Boolean, Gödel
2. Physical Determinism (物理と因果) — Newton, thermodynamics, causality
3. Biological Archetypes (生命と進化) — central dogma, selection, homeostasis
4. Linguistic Roots (言語と構造) — generative grammar, etymology
5. Social Navigation (倫理と社会契約) — golden rule, justice
6. Economic Axioms (価値と交換) — supply/demand, Nash equilibrium
7. The Inner Self (実存と内省) — cogito ergo sum, know thyself
8. Esthetic Geometry (芸術と形式美) — golden ratio, color theory
9. Temporal Anchor (歴史と時間軸) — historical turning points, arrow of time
10. The Great Question (未知と問い) — P≠NP, hard problem of consciousness

**設計原則:**
- 「琥珀は時代と共に移ろうが、原典は星のように動かない」
- agent は Relic を focus (参照) できるが、evaluate の結果は Relic に反映されない
- Relic の heat=300 は Active の baseHeat=750 より低い。時間経過で Active が減衰すると Relic が相対的に浮かび上がる
- Relic データは `relics.json` で管理。mock_data.json とは独立したライフサイクル

#### Species Memory の効果 (零記憶 vs Gen-011 比較, 2026-02-17)

**同一モデル (phi3:mini)、同一データで species-profile の有無だけを変えた比較実験。**

| 指標 | 零記憶 (13 sessions) | Gen-011 (7 sessions) | 差 |
|------|---------------------|---------------------|-----|
| avgH | 6.07 (±2.02) | **7.22 (±0.92)** | +1.15, 分散半減 |
| avgW | 6.69 (±1.89) | **7.59 (±0.68)** | +0.90, 分散 1/3 |
| avgD | 4.98 (±1.77) | **4.00 (±0.94)** | -0.98 (安定寄り) |
| Bus emits | 0 | 11 | 記憶が社会行動の前提 |
| ユニークノード | 26 | 20 | 重複わずか 7 |

**主要な知見:**

1. **評価の安定化**: 分散の半減は「LLM の出力が予測可能になった」ことを意味する。代謝系の閾値設計が信頼できるデータの上で初めて機能する
2. **探索空間の分割**: 共通ノード 7/33。species memory は空間自体を変える → 多 agent 運用での生態的ニッチ分化の基盤
3. **d-score 低下**: 記憶を持つ agent は世界を「より永続的」と知覚する。スフィアの時間感覚が agent の経験に依存する設計の実証
4. **Bus = 記憶 → 社会性**: h≥8 の閾値を超える安定した評価がないと Bus は発火しない。社会的相互作用は個の成熟が前提
5. **核心**: LLM 単体は知性ではない。profile + LLM の組み合わせが知性。軽量モデル + 適切なコンテクスト = 実用的な判断力

**種族設計への示唆:**

| 種族タイプ | species bias | learned_weight (将来) | 性格 |
|-----------|-------------|----------------------|------|
| 専門種 (hunter, sniper 等) | 強い | moderate | 種の個性が明確、個体差は微調整 |
| 汎用種 (balanced) | global average (環境平均) | **strong** | 出発点はニュートラル、個体経験が方向を決める |

balanced は「何もない空白」ではなく「未分化の幹細胞」。Digestor の global profile をベースラインに、
learned_weight でそのスフィア固有の最適な探索者に育つ。
人間にとっては「そのスフィアの内容を最もバランスよく把握している種族」として利用価値が高い。

**空間の三層構造 (将来像):**
```
Relic (不変座標) → 空間の骨格
  + species memory (種族文化) → 探索コリドー
    + learned_weight (個体経験) → 個の軌跡
      = スフィアに「地理」が生まれる
```

#### Core Sphere / Sanctuary Sphere 二層構想

**スフィアは初期から「代謝型 + 静的型」の二層として設計されている。**

```
Core Sphere (代謝型)              Sanctuary Sphere (聖域型)
┌──────────────────────┐          ┌──────────────────────┐
│ 投入 → 評価 → 淘汰    │          │                      │
│ 減衰 → ghost → 消滅   │ ──────→ │  固定された知識群      │
│ 昇格 → Amber → 結晶   │ snapshot│  decay なし            │
│ Relic = 座標アンカー   │          │  人間が直接活用        │
│ agent が代謝を回す     │          │  standalone 稼働       │
└──────────────────────┘          └──────────────────────┘
```

| 層 | 役割 | 代謝 | 利用者 |
|----|------|------|--------|
| Core Sphere | 知識の生成・淘汰・進化 | 常時稼働 | agent |
| Sanctuary Sphere | 代謝の結晶を保存・提供 | なし (静的) | 人間 |

**運用フロー:**
1. Core Sphere で agent が代謝を回す (評価・淘汰・結晶化)
2. Snapshotting で Core の成果を Sanctuary に移植
3. 人間は Sanctuary Sphere を standalone 環境として利用
4. Core に有用な更新があれば Sanctuary をアップデート

**思想:**
- 神髄は代謝にある。「データが消える」ことが価値の源泉
- しかし消滅への抵抗感は自然。Sanctuary Sphere がその安全弁
- Sanctuary は「バックアップ」ではなく「代謝の結晶」
- Core で生き残った知識だけが Sanctuary に入る資格を持つ

**現時点で対応する実装:**
- Digestor の世代アーカイブ (gen-NNN.json) = Snapshotting の原型
- species-profile.json = 種族進化の結晶
- Relic = Core/Sanctuary 両方に存在する不変座標
- Sanctuary Sphere 自体は未実装 (将来課題)

---

## 12. Git ブランチ整理 (2026-02-01)

### 12.1 実施内容

不要なローカルブランチを削除し、リポジトリを整理。

### 12.2 削除したブランチ (10個)

| ブランチ | 状態 | 理由 |
|---------|------|------|
| observatory | main にマージ済 | 機能統合完了 |
| phase3 | main にマージ済 | 古い開発ブランチ |
| phase4.6 | main にマージ済 | 古い開発ブランチ |
| phase5 | main にマージ済 | 古い開発ブランチ |
| phase5.2 | main にマージ済 | 古い開発ブランチ |
| phase5.3 | main にマージ済 | 古い開発ブランチ |
| phase5.4 | main にマージ済 | 古い開発ブランチ |
| phase5.5 | main にマージ済 | 古い開発ブランチ |
| renalCore-stable | main にマージ済 | 安定版ポイント不要 |
| renalCoreRecov | main にマージ済 | 復旧ブランチ不要 |

### 12.3 残したブランチ

| ブランチ | 理由 |
|---------|------|
| main | メインブランチ |
| phase5.6 | 現在の作業ブランチ (main と同一コミット) |
| phase5.6-stable | 未マージの安定版ポイント |

### 12.4 リモートブランチ

以下はリモートに残存（ローカル削除のみ実施）:
- `origin/main`
- `origin/phase5.5`
- `origin/withClaude`

### 12.5 コマンド履歴

```bash
# マージ済みブランチ確認
git branch --merged main

# 一括削除
git branch -d observatory phase3 phase4.6 phase5 phase5.2 phase5.3 phase5.4 renalCore-stable renalCoreRecov

# リモート追跡ありの場合は強制削除
git branch -D phase5.5
```
