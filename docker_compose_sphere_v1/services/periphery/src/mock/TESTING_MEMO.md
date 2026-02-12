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

| 環境 | HTTP | WebSocket |
|------|------|-----------|
| ローカル dev (`npm run dev`) | 3001 | **8081** |
| Docker / same-port モード | 3001 | **3001** |

phi-agent の `SPHERE_WS` を環境に合わせて設定すること。

```batch
# ローカル dev の場合
set SPHERE_WS=ws://localhost:8081

# Docker / same-port の場合
set SPHERE_WS=ws://localhost:3001
```

**判別方法**: `curl http://localhost:8081/` が応答すれば 8081、しなければ 3001。

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

---

作成日: 2025-01-31
更新日: 2026-02-12

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
