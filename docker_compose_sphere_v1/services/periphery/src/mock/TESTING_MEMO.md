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

作成日: 2025-01-31
更新日: 2026-02-01

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
