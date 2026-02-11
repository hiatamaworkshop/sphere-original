# Daemon Test Batch Protocol — 生態系循環の検証設計

**Date**: 2026-02-11
**Status**: Conceptual Design
**Depends on**: `SPECIES_MEMORY_CALIBRATION_EXPERIMENT.md`, `MODEL_DEPLOYMENT_STRATEGY.md`, `SPHERE_ECOSYSTEM_DESIGN.md`

---

## 目的

Sphere 生態系が **閉じた循環** として機能することを、制御された条件下で検証する。

検証対象:
1. **種族分化**: 同一環境で異なる Loadout が異なる行動・評価パターンを生むか
2. **Digestor 代謝**: eval-log → scoring → pruning → species-profile → FastGate bias の循環が回るか
3. **環境応答**: wave injection (新規ノード群投入) に対して種族ごとに異なる反応を示すか
4. **世代進化**: gen-N → gen-N+1 で species-profile が変化し、行動に反映されるか

**検証しないもの** (別テスト):
- ActiveBus の種族間通信 (並列実行が必要 → Cycle B)
- ナラティブ品質 (gemma2:2b 専用テスト)
- Flag 体系の新旧差異 (16bit 改修後に検証)

---

## 実務制約

| 制約 | 値 | 影響 |
|------|-----|------|
| phi3:mini 推論速度 | ~60s/cycle | 15min phase = ~15 cycles |
| Ollama 並列 | 不可 (3.8B モデル) | 種族は順次実行 |
| 投入データ | メトリクス指定不可 | tags で間接制御 (Tagger → flags → 物理効果) |
| Digestor 最小間隔 | 設定可 (テスト用 5min) | 本番 3h → テスト 5min |

### モデル選定理由: phi3:mini

| 要件 | phi3:mini | llama3.2:1b | gemma2:2b |
|------|-----------|-------------|-----------|
| h 測定 | range 2-6 | range 0.9 | species 固定 (スタンプ) |
| w 測定 | range 1-6 | range 1.0 | range 3.1 |
| d 測定 | range 3-6 (クエリ依存) | range 4-9 (species memory 依存) | range 2-6 (不安定) |
| クエリ理解 | academic を低評価 | 未検証 | クエリ無視 |
| JSON 安定性 | 100% | 未検証 (大規模) | 75% |

**phi3:mini が唯一の「真の測定器」** — クエリに応じて全3次元が変動する。
種族分化の検証には、測定器自体が正確でなければ意味がない。

---

## テスト構造

### Cycle A: 測定精度・種族分化テスト (phi3:mini sequential)

```
┌─ Phase 0: Setup (5min) ─────────────────────────────┐
│  Sphere 起動確認                                      │
│  Digestor interval = 5min (テスト用)                  │
│  既存ノード数・状態記録                               │
│  species-profile 初期状態 snapshot                    │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌─ Phase 1: 3種族 sequential (45min) ─────────────────┐
│                                                       │
│  moth    15min (~15 cycles) + query rotation          │
│       ↓                                               │
│  scholar 15min (~15 cycles) + query rotation          │
│       ↓                                               │
│  hermit  15min (~15 cycles) + query rotation          │
│                                                       │
│  → Digestor 自動実行 (5min interval, 計 ~9回)        │
│  → eval-log snapshot #1                              │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌─ Phase 2: Wave injection (5min) ────────────────────┐
│  10-15 nodes 投入 (tags で性質を制御)                │
│                                                       │
│  Group A: ["trending", "viral", "2026"]              │
│           → TemporalShort → decay×1.3                │
│                                                       │
│  Group B: ["academic", "peer-reviewed", "reference"] │
│           → Authority → decay×0.95                   │
│                                                       │
│  Group C: ["note", "casual", "memo", "brief"]         │
│           → Sparse (低密度, ghost=5min TTL)          │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌─ Phase 3: 反応観測 (45min) ─────────────────────────┐
│                                                       │
│  moth    15min → TemporalShort に flagBias 1.5      │
│       ↓           → Group A/C に強く反応するか？     │
│  scholar 15min → Authority に flagBias 1.8           │
│       ↓           → Group B を優先するか？           │
│  hermit  15min → Authority 1.8 + TemporalLong 1.5   │
│                   → Group B に偏り、A/C を避けるか？ │
│                                                       │
│  → eval-log snapshot #2                              │
│  → species-profile snapshot                          │
│  → generation archive 確認                           │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌─ Phase 4: 収集・分析 (5min) ────────────────────────┐
│  eval-log diff (snapshot #1 vs #2)                   │
│  species-profile 変化量                              │
│  generation archive (gen-N+1 生成確認)               │
│  wave nodes の被評価回数・評価値比較                 │
└──────────────────────────────────────────────────────┘

合計: ~105min / cycle
```

### 種族選定理由: moth + scholar + hermit

| 種族 | 戦略 | flagBias 特徴 | 期待される反応差 |
|------|------|--------------|-----------------|
| **moth** | 注目追従 | temporalShort(1.5), insightful(1.5) | trending/viral に集中 |
| **scholar** | 権威重視 | authority(1.8), temporalLong(1.3), dense(1.3) | academic に集中 |
| **hermit** | 安定深掘り | authority(1.8), temporalLong(1.5), soothing(1.3) | academic に偏り + 短命を回避 |

3種族は **直交的な戦略** を持つ。同一環境に対して異なる反応を示すことが、種族分化の証明になる。

scholar と hermit は Authority に共通するバイアスを持つが、walkPreference (scholar=deep, hermit=deep) と returnWeights の差が行動を分ける。

---

### Cycle B: ActiveBus テスト (llama3.2:1b parallel, gen-005 以降)

**前提条件**: Cycle A を数回繰り返し、species-profile が安定した後。

```
Phase 0: species-profile を Cycle A から継承
Phase 1: 2-3種族 parallel (15min)
          llama3.2:1b × 3 containers
          (1B モデルなら Ollama 並列に耐える可能性)
Phase 2: Bus 計測
          emit count / recv count / species 間の非対称性
          moth (温度源) → hermit (吸収者) の方向性確認
```

llama3.2:1b は species memory 搭載で d 測定可能 (range 4-9)。
phi3:mini より 43% 高速 (32s vs 56s) で並列向き。

**Cycle B の主目的**: 種族間の情報伝播パターン — 物理法則 (ActiveBus) を経由して種族が影響し合うか。

---

## Wave Injection 設計

### 原則: メトリクスは指定しない

投入データは tags + summary + content のみ。h, w, d は Sphere のデフォルト値で入る。
**これは制約ではなく利点** — 本番パイプライン (Tagger → Packer → Bookkeeper) そのものをテストできる。

### データファイル

**`services/periphery/src/mock/wave-injection.json`** — 15 nodes, 3 capsules (batch mode)

```bash
# 投入コマンド (Phase 2 で実行)
curl -X POST http://localhost:3001/sphere/contribute \
  -H "Content-Type: application/json" \
  -d @services/periphery/src/mock/wave-injection.json
```

### Group A: Trending (5 nodes) — TemporalShort ターゲット

| # | tier | summary (先頭) | tags | 期待 flags |
|---|------|---------------|------|-----------|
| 1 | top | AI breakthrough 2026... | trending, viral, 2026, AI | 0x0001 (TemporalShort) |
| 2 | top | Room-temperature quantum... | breaking, new, quantum, 2026 | 0x0001 (TemporalShort) |
| 3 | normal | Global dance challenge... | viral, trending, fresh, social-media | 0x0001 (TemporalShort) |
| 4 | normal | Hot debate erupts over AI... | hot, current, controversial, debate | 0x0401 (TemporalShort+Provoking) |
| 5 | normal | Latest framework release... | latest, new, update, fresh | 0x0001 (TemporalShort) |

**物理効果**: decay×1.3 (短命方向)
**FastGate bias**: moth 1.5× boost, hunter 1.3× boost

### Group B: Academic (5 nodes) — Authority + Dense + TemporalLong ターゲット

| # | tier | summary (先頭) | tags | 期待 flags |
|---|------|---------------|------|-----------|
| 1 | normal | Sapir-Whorf hypothesis... | academic, peer-reviewed, research, linguistics | 0x0090 (Authority+Dense) |
| 2 | normal | Information entropy... | theory, fundamental, mathematics, formal | 0x0012 (TemporalLong+Dense) |
| 3 | normal | Category theory unifies... | reference, standard, theory, rigorous | 0x0090 (Authority+Dense) |
| 4 | normal | Stability of complex... | academic, research, stable, timeless | 0x0092 (Authority+Dense+TemporalLong) |
| 5 | normal | Distributed consensus... | peer-reviewed, research, official, comprehensive | 0x0090 (Authority+Dense) |

**物理効果**: decay×0.95 (Authority), weight×1.2 (Dense), ttl_decay×0.7 (TemporalLong)
**FastGate bias**: scholar authority 1.8× + dense 1.3×, hermit authority 1.8× + temporalLong 1.5×

### Group C: Ephemeral (5 nodes) — Sparse ターゲット

| # | tier | summary (先頭) | tags | 期待 flags |
|---|------|---------------|------|-----------|
| 1 | normal | Quick thought on attention... | note, casual, thought | 0x0020 (Sparse) |
| 2 | normal | Brief comparison of caching... | memo, brief, overview | 0x0020 (Sparse) |
| 3 | ghost | Short sketch of event-driven... | note, simple, short | 0x0020 (Sparse) |
| 4 | ghost | Anecdotal observation about... | casual, light, anecdotal | 0x0020 (Sparse) |
| 5 | ghost | Initial musings on randomness... | memo, thought, intro | 0x0020 (Sparse) |

**物理効果**: なし (Sparse は物理効果を持たない)
**FastGate bias**: なし (どの種族も Sparse にバイアスなし)
**tier 効果**: ghost → TTL=300s (5min), w=50。normal → TTL=86400s (24h), w=100

### 検証ポイント

投入後に `GET /nodes/metrics` で確認すべきこと:
1. 各 Group のノードが正しい flags を持っているか
2. Group A ノードの heat が Group B より速く減衰するか (decay×1.3 vs ×0.95)
3. Group B ノードの weight が他より高いか (weight×1.2)
4. Group C ghost ノードが 5min 以内に消滅するか

### tags 選定の注意点

- **"experimental"** は Tagger にマッチしない (パターン未登録)
- **"draft"**, **"wip"** も Tagger にマッチしない
- **"mathematics"** は Dense にマッチしない ("mathematical" はマッチ)
- Sparse トリガー: `casual, light, brief, anecdotal, simple, short, note, memo, thought, overview, intro, summary`
- tags は全て **小文字** で Tagger の regex に通る (case-insensitive)

---

## Query Rotation 設計

### 必要性

phi3:mini の d 測定はクエリに依存する (実証済み):
- 単一クエリ "knowledge exploration" → d=3 固定
- 多様なクエリ → d=3-6 分散

**単一クエリのデーモンは測定能力を殺す。**

### クエリプール案

13 クエリ、Temporal/Density/Cognitive の 3 次元を網羅:

```
# Temporal dimension
"trending viral social media"          → TemporalShort 活性化
"fundamental mathematics theorem"       → TemporalLong 活性化
"seasonal patterns annual cycle"        → TemporalCyclic 活性化

# Density dimension
"deep theory information density"       → Dense 活性化
"casual conversation random thoughts"   → Sparse 活性化
"cross-disciplinary fusion concept"     → Composite 活性化
"official standard specification"       → Authority 活性化

# Cognitive dimension
"surprising insight discovery"          → Insightful 活性化
"ambiguous contradictory confusing"     → Confusing 活性化
"controversial debate provocative"      → Provoking 活性化
"calm stable reliable soothing"         → Soothing 活性化

# Mixed
"knowledge exploration"                 → ベースライン (既存データとの比較用)
"journey through information space"     → 汎用 (ナラティブ向き)
```

### 実装方式

`QUERY_FILE` 環境変数 → JSONL or テキストファイルから順次読み込み:

```
# queries.txt (1行1クエリ、デーモンが順に使用)
trending viral social media
fundamental mathematics theorem
seasonal patterns annual cycle
...
```

デーモンはセッション開始ごとに次のクエリを取得 (round-robin)。

---

## 成功基準

### Phase 1 (種族分化)

| 指標 | 成功条件 |
|------|---------|
| h 分散 | 種族間で平均 h に 1.0pt 以上の差 |
| w 分散 | 種族間で平均 w に 1.5pt 以上の差 |
| d 分散 | クエリローテーションで d range 3pt 以上 |
| Digestor | gen-N+1 が生成される |
| species-profile | 種族ごとに avgH/avgW/avgD に差異 |

### Phase 3 (環境応答)

| 指標 | 成功条件 |
|------|---------|
| wave 反応差 | moth が Group A を多く訪問、scholar が Group B を多く訪問 |
| 評価値差 | Group A の平均 h > Group B の平均 h (moth による) |
| 短命ノード | Group C が Phase 3 後半で decompose または低 TTL |

### Cycle B (ActiveBus)

| 指標 | 成功条件 |
|------|---------|
| emit 非対称性 | moth の emit count > hermit の emit count |
| recv 影響 | hermit が moth の emit を受信後、行動変化の兆候 |

---

## 運用手順リファレンス (2026-02-11 確認済み)

### Sphere 起動

**Sphere 系のみ (periphery + インフラ):**
```bash
cd docker_compose_sphere_v1
docker compose up periphery
# → postgres, redis, minio, periphery が起動
# → port 3001 (HTTP + WS)
```

**Agent Cluster 込み (全サービス):**
```bash
docker compose --profile agent up
# → 上記 + ollama, phi-agent, digestor, pool-service, explorers
# → phi-agent: daemon=true, sleep=30s, model=phi3:mini, loadout=random
```

**phi-agent 単体 (ホスト実行、テスト用):**
```bash
cd phi-agent && npm run build
SPHERE_URL=http://localhost:3001 SPHERE_WS=ws://localhost:3001 \
OLLAMA_HOST=http://localhost:11434 OLLAMA_MODEL=phi3:mini \
LOADOUT=moth DAEMON=true DAEMON_SLEEP_MS=30000 \
node dist/index.js "trending viral"
```

### Seed Data (起動時自動投入)

**ファイル**: `services/periphery/src/mock/mock_data.json` — **155 items**
**内容**: 雑学系カジュアルノード ("Rubber duck debugging", "Capybara social diplomacy" 等)
**環境変数**: `SEED_DATA_PATH` で差し替え可能 (未指定時は mock_data.json)

| tier | 条件 (importance) | h (heat) | w (weight) | d (decay) | TTL |
|------|-------------------|----------|-----------|-----------|-----|
| top | >= 0.85 | 750 | 300 | 1000 | 172800 (48h) |
| normal | >= 0.50 | 750 | 100 | 1000 | 86400 (24h) |
| ghost | < 0.50 | 750 | 50 | 1000 | 300 (5min) |

**重要**: h, w, d は全ノード同一のデフォルト値。Tagger が tags から flags を付与し、flags の物理効果で差が生まれる。

### API エンドポイント (テスト用)

**状態確認:**
```bash
# 起動確認
curl http://localhost:3001/health
# → {"status":"ok","service":"periphery"}

# ノード数 + 稼働時間
curl http://localhost:3001/metrics
# → {"uptime":..., "nodeCount":..., "agents":..., "field":{...}}

# 種類別統計 + 平均メトリクス
curl http://localhost:3001/nodes/stats
# → {"counts":{"active":N,"ghost":N,...}, "averages":{"heat":..,"weight":..,"ttl":..}}
```

**ノード詳細:**
```bash
# 全ノード一覧 (heat 順ソート)
curl http://localhost:3001/nodes/metrics
# → {"total":N, "nodes":[{id, kind, heat, weight, decay, ttl, flags, summary},...]}

# 特定ノード
curl http://localhost:3001/nodes/<node-id>
# → SphereNode 全体 (vector, payload, metrics)

# ベクトル検索 (agent の sense と同等)
curl "http://localhost:3001/sphere/explore?q=trending+viral&limit=10&radius=0.5"
```

**flags の読み方** (nodes/metrics の flags フィールド):
```
flags: 0x0081 = Authority(0x80) | TemporalShort(0x01)
flags: 0x0010 = Dense(0x10)
flags: 0x0002 = TemporalLong(0x02)

ビットマスク:
  bits 0-3:  Temporal   (0x000F)
  bits 4-7:  Density    (0x00F0)
  bits 8-11: Cognitive  (0x0F00)
  bits 12-15: Special   (0xF000)
```

### Wave Injection (データ投入)

**エンドポイント**: `POST /sphere/contribute`
**schemaVersion**: **4** (capsule.ts: `CAPSULE_SCHEMA_VERSION = 4`)

```bash
# 単一投入
curl -X POST http://localhost:3001/sphere/contribute \
  -H "Content-Type: application/json" \
  -d '{
    "source": "test-wave",
    "capsule": {
      "schemaVersion": 4,
      "topTier": [{
        "tags": ["trending", "viral", "2026", "AI"],
        "summary": "AI breakthrough 2026: new paradigm in machine learning"
      }],
      "normalNodes": [{
        "tags": ["academic", "peer-reviewed", "linguistics"],
        "summary": "Sapir-Whorf hypothesis revisited: language shapes thought"
      }],
      "ghostNodes": [{
        "tags": ["draft", "wip", "experimental"],
        "summary": "Quick experiment notes on attention mechanisms"
      }],
      "evaluations": [],
      "timestamp": 1739270400000
    }
  }'

# バッチ投入
curl -X POST http://localhost:3001/sphere/contribute \
  -H "Content-Type: application/json" \
  -d '{
    "source": "test-wave",
    "batch": true,
    "capsules": [
      { "schemaVersion": 4, "topTier": [...], "normalNodes": [...], "ghostNodes": [], "evaluations": [], "timestamp": ... },
      { ... }
    ]
  }'
```

**投入後の確認**: `GET /nodes/metrics` で新ノードの flags を確認し、Tagger が正しく flags を付与したか検証。

### Daemon 制御

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `DAEMON=true` | false | 無限ループモード |
| `DAEMON_SLEEP_MS=30000` | 30000 | セッション間スリープ (ms) |
| `LOADOUT=moth` | balanced | 種族指定 (random で起動時ランダム) |
| `OLLAMA_MODEL=phi3:mini` | gemma2:2b | 使用モデル |
| `EVALUATE=true` | true | 測定+Sphere書き戻し |
| `RESPONSE=true` | false | 帰還時ナラティブ生成 |

**CLI:**
```bash
node dist/index.js --daemon --loadout moth "trending viral"
```

**停止:**
```bash
# Docker
docker compose --profile agent stop phi-agent
# ホスト実行
Ctrl+C (SIGINT → graceful shutdown)
```

**Digestor 間隔変更 (テスト用):**
```bash
# docker-compose.yml 内で or 環境変数で
DIGEST_INTERVAL_MS=300000  # 5分 (本番は 10800000 = 3時間)
```

### Tagger 実装状況 (2026-02-11 確認済み)

**結論: 新 3 層体系に対応済み。改修不要。**

`services/periphery/src/tagger/tagger.ts`:
- Temporal: TemporalShort (0x0001), TemporalLong (0x0002) — パターンあり
- Density: Dense (0x0010), Sparse (0x0020), Composite (0x0040), Authority (0x0080) — パターンあり
- Cognitive: Insightful (0x0100), Confusing (0x0200), Provoking (0x0400), Soothing (0x0800) — パターンあり
- Special: UserMarked (0x1000), SystemCore (0x2000) — パターンあり
- TemporalCyclic (0x0004): コメントアウト (将来用)

`renalCore/src/core/types.ts`:
- `enum NodeFlag` — 新体系 (Temporal/Density/Cognitive/Special) で定義済み
- Hot (0x0008) は bits 0-3 内で reserved → Arbiter が動的付与

`sphere.config.json`:
- `flags.physicsModifiers` に TemporalShort, TemporalLong, Dense, Authority, SystemCore の物理効果定義済み

**旧体系 (Catalyst, Hub, Isolated) のコードは残っていない。**

### Wave Injection 用 tags → flags マッピング確認

| tags 例 | マッチする flag | 物理効果 |
|---------|----------------|---------|
| `["trending", "viral", "2026"]` | TemporalShort (0x0001) | decay×1.3 |
| `["academic", "peer-reviewed"]` | Authority (0x0080) | decay×0.95 |
| `["reference", "standard"]` | Authority (0x0080) | decay×0.95 |
| `["draft", "experimental"]` | Sparse (0x0020, "simple"/"note"はSparse) | — |
| `["theory", "formal", "rigorous"]` | Dense (0x0010) | weight×1.2 |
| `["timeless", "fundamental"]` | TemporalLong (0x0002) | ttl_decay×0.7 |
| `["controversial", "debate"]` | Provoking (0x0400) | FastGate scoring only |
| `["insight", "breakthrough"]` | Insightful (0x0100) | FastGate scoring only |

**注意**: "draft", "wip" は Tagger の Sparse パターンに含まれる (`note`, `memo`, `simple`, `brief` 等)。
"experimental" は Tagger にマッチしない (パターン未登録)。
wave injection の tags 選定時は tagger.ts のパターンを参照すること。

---

## 実装前提条件

| 優先度 | 項目 | 内容 | 状態 |
|--------|------|------|------|
| **P0** | Tagger 確認 | 新 flag 体系 (3層) に対応しているか | **完了 — 対応済み** |
| **P1** | query rotation | `QUERY_FILE` env → round-robin 読み込み | 未実装 (phi-agent 改修) |
| **P2** | test compose | phi3:mini + Digestor 5min の compose.test.yml | 未作成 |
| **P3** | wave injection data | `mock/wave-injection.json` (15 nodes, 3 groups) | **完了** |
| **P4** | snapshot script | eval-log + profile のタイムスタンプ付きコピー | 未作成 |
| **P5** | テストランナー | Phase 0-4 を自動実行する統合スクリプト | P1-P4 完了後 |

---

## 段階的アプローチ

### Step 1: 最小検証 (手動, ~30min)

Tagger 確認 + flag 改修後:
- 1 種族 (moth), 15min daemon, query rotation 手動
- eval-log 目視確認
- **目的**: パイプラインが壊れていないことの確認

### Step 2: 3 種族 sequential (半自動, ~60min)

- moth → scholar → hermit, 各 15min
- Digestor 5min interval
- eval-log + species-profile の diff
- **目的**: 種族分化の初期確認

### Step 3: Full Cycle A (自動, ~105min)

- Phase 0-4 の自動実行
- wave injection 込み
- **目的**: 生態系循環の完全検証

### Step 4: Cycle B (並列, ~30min)

- llama3.2:1b × 3 parallel
- ActiveBus 計測
- **目的**: 種族間通信の検証

---

## 参照

- `SPECIES_MEMORY_CALIBRATION_EXPERIMENT.md` — species memory による測定能力活性化
- `MODEL_DEPLOYMENT_STRATEGY.md` — phi3:mini = baseline, llama = 内部, gemma = 外部
- `SPHERE_ECOSYSTEM_DESIGN.md` — 循環と分離の全体設計
- `FLAG_SYSTEM_REDESIGN.md` — 16bit flag 3層構造 + Gate Type Architecture
- `QWEN25_SEQUENTIAL_EVALUATION_EXPERIMENT.md` — Sequential Evaluation Pattern

---

*このテストの本質: Sphere が「動くソフトウェア」ではなく「生きている生態系」であることを、制御された実験で証明する。*
