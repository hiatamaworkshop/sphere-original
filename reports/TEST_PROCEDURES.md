# Sphere テスト起動手順 — 2026-02-19 (updated)

> **これが最新のテスト手順書です。** 旧ドキュメントは以下を参照。

| ドキュメント | ステータス | 内容 |
|------------|----------|------|
| **TEST_PROCEDURES.md** (本書) | **現行** | 統合テスト手順・デーモン運用 |
| [TEST_STARTUP_CHECKLIST.md](TEST_STARTUP_CHECKLIST.md) | 現行 (補助) | テスト開始前の落とし穴集 |
| [DAEMON_TEST_BATCH_PROTOCOL.md](DAEMON_TEST_BATCH_PROTOCOL.md) | 設計資料 | Cycle A/B バッチプロトコル設計 |
| [TESTING_MEMO.md](TESTING_MEMO.md) | アーカイブ | 歴史的テストログ (Section 1-16) |
| [LEGACY_TEST_ARCHIVE.md](LEGACY_TEST_ARCHIVE.md) | アーカイブ | 削除済みスクリプトの記録 |
| [README_TESTING.md](README_TESTING.md) | 廃止 | Phase 3 初期の Decay 観測ガイド |
| [TEST_RESULT_GHOST_FOCUS.md](TEST_RESULT_GHOST_FOCUS.md) | テスト結果 | Ghost/Fossil Focus Strategy (2026-02-03) |

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

ヘルスチェック通過まで ~30s。確認:

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

# 全158件を一括投入
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
| `-b, --behavior` | random / focused / distributed / boost | random |
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

process ゾンビがいないかチェックすること
```

---

## テストスクリプト一覧

| ファイル | npm スクリプト | 用途 |
|---------|--------------|------|
| `swarm-agent.ts` | `swarm` / `swarm:5` / `swarm:10` | 複数エージェント同時稼働 (主力) |
| `mock-observer.ts` | `observe` / `observe:fast` / `observe:heavy` | 代謝観測 (swarm + state polling) |
| `contribution.ts` | `contribute` / `contribute:batch` | ノード投入 |
| `explore-agent.ts` | `explore` | 単体エージェント全操作テスト |

| データファイル | 内容 |
|--------------|------|
| `mock_data.json` | 158件テストデータ (140 factual + 18 misinformation) |
| `wave-injection.json` | フラグ期待値付きデータ (Tagger 検証) |
| `relics.json` | コアノード 10件 (flags=0x2000) |

---

## 典型的なテストフロー

```
1. docker compose up -d periphery          # インフラ起動
2. contribution.js batch                    # 158件投入
3. swarm-agent.ts -n 5                      # 5エージェントで代謝テスト
4. docker compose --profile agent up -d     # デーモンエージェント起動
5. docker compose logs -f periphery         # Sanctification 観測
```

---

## 7. 中〜長時間デーモンテスト (2026-02-19 追記)

### 7.1 現在のシステム状態

2026-02-18 の Flux Seep 実装 + Fossil SystemCore 修正により、
代謝サイクルの全段階が稼働している:

```
Active → Ghost → Fossil → Decompose → Flux Seep → 近傍 TTL 加算 → Pool 消滅
```

**BroadcastRenderer** (`phi-agent/src/broadcast-renderer.ts`) も実装済み。
phi-agent ログに `== BROADCAST START ==` が出力されること。

### 7.2 periphery ログの確認ポイント (代謝全段階)

```bash
docker compose logs -f periphery 2>&1 | grep -E "CleanerFish|Bookkeeper|RenalCore|Sanctification|Dormancy"
```

**正常動作で出るログ:**

```
# 代謝テレメトリ (毎 tick)
[RenalCore] tick=N nodes=X active=A amber=0 fossil=F ghost=G relic=R flux=X.X

# CleanerFish GC サイクル
[CleanerFishPool] hunger=X.XX preyTTL<=N candidates: ghost=G fossil=F decompose=D
[CleanerFish:fish-0] fossilized node=XXXX ghost→fossil ttl=N
[CleanerFish] PROTECTED fossil=XXXX h=XXX w=XXX threshold=100
[CleanerFish:fish-0] decomposed node=XXXX fossil→decompose flux=NNNN

# Bookkeeper: decompose + flux seep
[Bookkeeper] decomposed nodes=N cells=N pool=N
[Bookkeeper] flux_seep pool=N seeped=N drip=X.X evaporated=N

# Sanctification + Auto-Mode
[Sanctification] Metabolic mode: natural → archive
```

### 7.3 代謝タイムライン目安

| プリセット | Ghost→Fossil | Fossil PROTECTED 解除 | Decompose→Seep | Pool 消滅 |
|-----------|-------------|---------------------|---------------|----------|
| **dev** (alpha=30) | ~2分 | ~3.5分 | 即時 | ~30分 |
| **natural** (alpha=3) | ~20分 | ~35分 | 即時 | ~5時間 |
| **archive** (alpha=1) | ~60分 | ~100分 | 即時 | ~15時間 |

**注意**: metabolicAutoMode=true (デフォルト) の場合、
Sanctification Neuron がエージェント活動量に基づいてプリセットを自動切替する。
エージェント不在時は archive に収束する。
→ sphere.config.json の preset 設定が無視される場合がある。

### 7.4 既知の落とし穴

#### DAEMON 放置トラップ

**phi-agent を DAEMON=true で起動したまま放置すると、Digestor が自律的に世代を進め続ける。**

実例 (2026-02-10〜17):
- gen-011 まで手動テスト → コンテナを停止せず放置
- 8日間で gen-012〜050 が自律生成 (39世代)
- sniper 種が全評価の 41% を占めるまで偏重

**テスト後は必ずデーモンを停止すること:**

```bash
docker compose --profile agent down
# または phi-agent だけ
docker compose stop phi-agent
```

#### metabolicAutoMode による preset 上書き

`sphere.config.json` で `decay.preset: "dev"` に設定しても、
`sanctification.metabolicAutoMode: true` の場合、Sanctification Neuron が自動で
archive (最も遅い減衰) に切り替えることがある。

**対策**: テスト用に特定プリセットを固定したい場合は `metabolicAutoMode: false` にする。
テスト後は `true` に戻すこと。

**確認**: periphery ログで `[Sanctification] Metabolic mode:` を grep。

#### イメージの鮮度

コードを変更したら **必ず `docker compose build periphery`** が必要。
`docker compose up -d` だけでは既存イメージを使い回すので変更が反映されない。

renalCore のソースを変更した場合は `docker compose build periphery` で renalCore + periphery
両方リビルドされる (Dockerfile のマルチステージ)。

### 7.5 推奨運用: 短時間セッション × 複数回

**phi-agent を連続稼働させず、1日に数回・1時間程度ずつ回す。**

```bash
# 起動
docker compose --profile agent up -d phi-agent

# ~1時間後に停止
docker compose stop phi-agent
```

**理由**: Digestor の time_decay (HALF_LIFE=72h) は digest サイクル間に時間差がある前提で設計されている。
連続稼働で高速蓄積すると、同一サイクル内の評価が全て同程度の time_decay を持ち、
淘汰が balanced_qv (h/w/d スコア) のみに依存する「量の圧縮」になってしまう。

| 運用パターン | 1回あたりの蓄積 | hunger | time_decay 効果 | 淘汰の質 |
|-------------|---------------|--------|----------------|---------|
| 連続 3h 稼働 | ~360 evals | 0.39 | 4% 差 (ほぼ均一) | 低い |
| 1h × 3回/日 | ~120 evals | 0.20 | digest 間に数時間の間隔 | 高い |

間隔を空けることで古い評価が自然に減衰し、新しい評価が相対的に高スコアを得る。
これが Digestor の「自然淘汰」の本来の動作。

世代を急いで進めたい場合は `ONCE=1` で手動 digest:

```bash
MSYS_NO_PATHCONV=1 docker compose exec digestor /bin/sh -c "ONCE=1 node dist/digestor.js"
```

---

### 7.6 長時間稼働で予想されるエラーパターン

| 症状 | 推定原因 | 対処 |
|------|---------|------|
| Ollama 応答なし (120s+) | メモリ不足 / モデルアンロード | `docker compose restart ollama` |
| phi-agent WS 切断 | Periphery のセッションリーク | `docker compose restart phi-agent` |
| Digestor `Skip: N < 50 minimum evaluations` | 評価データ不足 | 正常。蓄積を待つ |
| flux_seep が一切出ない | fossil が decompose に到達していない | PROTECTED ログを確認。heat が protectionThreshold(100) 以上なら待つ |
| `pool=0` のまま変化なし | decompose が発生していない | ノード数が少なすぎる可能性。contribution.js batch で追加投入 |
| 全種族が同一ノードを選択 | Heat 蓄積フィードバックループ | 長時間稼働の自然現象。Sphere 再起動でリセット |
| sniper/特定種族への偏重 | Digestor 世代が進みすぎ | 意図的放置でなければ停止して確認 |

### 7.7 テスト後のデータ確認

```bash
# eval-log の行数 (phi-agent コンテナ内)
docker compose exec phi-agent wc -l /app/data/eval-log.jsonl

# 最新世代の確認
docker compose exec phi-agent ls -la /app/data/generations/

# species-profile の確認
docker compose exec phi-agent cat /app/data/species-profile.json | head -50

# periphery の統合ステータス (nodes, gateway, field, sanctification 等)
curl -s http://localhost:3001/sphere/status | jq
```

### 7.8 聖域化モニタリング — API・メトリクス一覧

琥珀化 → 聖域化の過程を観測するための操作リファレンス。

#### Sanctification (聖域化ステータス)

```bash
# 聖域化ニューロン全体の状態 (最重要)
curl -s http://localhost:3001/sanctification | jq

# ワンライナー要約
curl -s http://localhost:3001/sanctification | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log('epoch='+j.epoch,'cycle='+j.cycle,'amber='+j.hard.amberCount+'/'+j.hard.target,'velocity='+j.hard.velocity,'health='+j.soft.health.toFixed(4),'mode='+j.metabolicMode,'dormancy='+j.dormancy)})"
```

| フィールド | 意味 | 聖域化に必要な条件 |
|-----------|------|------------------|
| `hard.amberCount` | 琥珀ノード数 | `>= hard.target` (デフォルト 5) |
| `hard.velocity` | 琥珀増加速度 | > 0 で蓄積中 |
| `hard.fired` | ハード条件達成 | `true` |
| `soft.health` | スフィア健康度 | `>= soft.threshold` (デフォルト 0.4) |
| `soft.fired` | ソフト条件達成 | `true` |
| `meta.healthy` | メタ判定 | `true` |
| `meta.organicRatio` | 有機率 (agent 由来) | 高いほど良い |
| `metabolicMode` | 代謝プリセット | archive/natural/dev |
| `dormancy` | 休眠状態 | エージェント不在時 `true` |
| `festival` | 聖域化祭 | hard+soft+meta 全達成で `true` |

#### ノード状態

```bash
# ノード統計 (種別カウント)
curl -s http://localhost:3001/nodes/stats | jq

# ノード詳細メトリクス (heat/weight/flags 分布)
curl -s http://localhost:3001/nodes/metrics | jq

# 特定ノード詳細 (immuneMod 確認可能)
curl -s http://localhost:3001/nodes/<nodeId> | jq

# 琥珀ノードの一覧を手早く確認
curl -s http://localhost:3001/nodes/metrics | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);(j.nodes||[]).filter(n=>n.kind==='amber').forEach(n=>console.log(n.id.slice(0,8),'h='+n.heat.toFixed(1),'w='+n.weight.toFixed(1)))})"
```

#### 代謝テレメトリ (periphery ログ)

```bash
# RenalCore tick ログ (amber 数の変化を追跡)
docker compose logs -f periphery 2>&1 | grep "RenalCore.*tick="

# Sanctification ニューロンの発火ログ
docker compose logs -f periphery 2>&1 | grep -E "Sanctification|festival|Dormancy"

# 免疫系 (immunity_spike の頻度・影響度)
docker compose logs periphery 2>&1 | grep "immunity_spike"

# CleanerFish (ghost→fossil→decompose 進行)
docker compose logs periphery 2>&1 | grep "CleanerFish"

# 代謝モード切替 (metabolicAutoMode=true 時のみ)
docker compose logs periphery 2>&1 | grep "Metabolic mode"
```

#### Digestor・エージェント

```bash
# eval-log の蓄積量
MSYS_NO_PATHCONV=1 docker compose exec digestor wc -l /app/data/eval-log.jsonl

# 世代一覧
MSYS_NO_PATHCONV=1 docker compose exec digestor ls -la /app/data/generations/

# species-profile 要約
MSYS_NO_PATHCONV=1 docker compose exec digestor cat /app/data/species-profile.json | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);Object.entries(j.species).forEach(([k,v])=>console.log(k,'evals='+v.evaluations,'avgH='+v.avgH.toFixed(1)))})"

# エージェント別 eval カウント
for a in hunter scholar balanced sniper moth; do echo -n "$a: "; docker logs sphere-agent-$a 2>&1 | grep -c "phi eval"; done
```

#### 全体ヘルスチェック

```bash
# 統合ステータス (推奨: 全サブシステムを1回で取得)
curl -s http://localhost:3001/sphere/status | jq

# ヘルス (軽量)
curl -s http://localhost:3001/health | jq

# メトリクス (uptime, nodeCount, agents, field, memory)
curl -s http://localhost:3001/metrics | jq
```

#### API エンドポイント一覧 (2026-02-23)

| エンドポイント | Rate Limit | 用途 |
|------------|-----------|------|
| **情報・監視** | | |
| `GET /` | なし | Sphere 概要 + 全エンドポイント一覧 |
| `GET /health` | なし | ヘルスチェック (`{ status: "ok" }`) |
| `GET /sphere/status` | 120/min | **統合ステータス** (gateway, nodes, tickets, bus, field, sanctification, memory) |
| `GET /sanctification` | 120/min | 聖別ニューロン全詳細 (hard/soft/meta) |
| `GET /metrics` | なし | 軽量メトリクス (uptime, nodeCount, agents, field, memory) |
| **ノード観測** | | |
| `GET /nodes/stats` | 120/min | kind 別カウント + heat/weight/ttl 平均 |
| `GET /nodes/metrics` | 120/min | 全ノード個別メトリクス (heat 順) |
| `GET /nodes/:id` | 120/min | 単一ノード詳細 |
| `GET /sphere/snapshot` | 120/min | 全状態スナップショット (Digestor sphere_hash 用) |
| **カタログ・探索** | | |
| `GET /sphere/manifest` | 120/min | Facade カタログ向け自己記述 |
| `GET /sphere/explore?q=&limit=&radius=` | 30/min | ベクトル検索 (クエリ → 近傍ノード) |
| **入力** | | |
| `POST /sphere/contribute` | 10/min | 外部データ投入 (ExperienceCapsule) |
| `POST /sphere/forge/environmental` | 10/min | Environmental ノード生成 (要認証) |
| **ガイダンス** | | |
| `GET /rulebook` | なし | エージェントルールブック |
| `GET /schema` | なし | データフォーマット仕様 |
| **ダイブ** | | |
| `POST /dive/request` | なし | Dive Ticket 発行 |
| `GET /dive/validate/:token` | なし | チケット検証 (デバッグ) |
| `GET /dive/stats` | なし | チケット統計 |
| **クエスト** | | |
| `POST /quest` | 30/min | クエスト投稿 (外部検証リクエスト) |
| `GET /quest/stats` | なし | クエスト統計 |

**Digestor (IO Gateway, port 5000):**

| エンドポイント | 用途 |
|------------|------|
| `GET /health` | ヘルスチェック |
| `POST /evaluations` | eval 受付 (phi-agent → eval-log.jsonl) |
| `POST /narratives` | narrative 受付 |
| `GET /narratives?limit=&loadout=&type=` | narrative 一覧 |
| `GET /narratives/:id` | 単一 narrative |
| `GET /species` | 全種族プロファイル |
| `GET /species/:name/profile` | 単一種族プロファイル |
| `GET /generations` | 世代一覧 |
| `GET /generations/:id` | 単一世代 |
| `GET /stats` | eval-log 集計 |

---

### 7.9 関連ドキュメント

| ドキュメント | 内容 |
|------------|------|
| `TEST_STARTUP_CHECKLIST.md` | 起動前の落とし穴 9項目 (ビルド順序、WS ポート、LOADOUT=random 等) |
| `DAEMON_TEST_BATCH_PROTOCOL.md` | Cycle A/B 設計、Wave Injection、成功基準 |
| `TESTING_MEMO.md` | 歴史的アーカイブ (Section 14-16 にデータ蓄積・expression 実験の詳細) |
| `FLUX_SEEP_DESIGN.md` | Flux Seep 設計 + ライブテスト結果 (2026-02-18) |
| `PHASE4_AGENT_SPATIAL_DESIGN.md` Section 13 | 空間システム現状棚卸し (2026-02-19) |

---

## 8. ローカルデーモンテストの注意事項 (2026-02-20 追記)

phi-agent をホスト側 (Docker 外) でデーモン起動する場合の落とし穴。

### 8.1 Ollama CPU 推論とデーモン数

Ollama が **GPU なし (CPU only)** で動作している場合、同時デーモン数に厳しい制限がある。

| モデル | size_vram | 1リクエスト | 同時限界 |
|--------|----------|-----------|---------|
| `phi3:mini` (3.8B) | 0 (CPU) | 30-60秒 | **1体** (2体以上でハング) |
| `qwen2.5:0.5b` (0.5B) | 0 (CPU) | 5-10秒 | **2-4体** |
| GPU 搭載時 | >0 | <1秒 | 5+体 |

**確認方法:**
```bash
curl -s http://localhost:11434/api/ps | jq '.models[0].size_vram'
# 0 → CPU only。デーモン数を制限すること
```

**CPU 環境での推奨:**
- `OLLAMA_MODEL=qwen2.5:0.5b` を指定 (phi3:mini は遅すぎる)
- 同時デーモンは **最大4体** (CPU 輻輳回避)

### 8.2 ゾンビプロセス問題

`pkill -f "tsx.*daemon"` は **tsx 親プロセスのみ** を殺す。
子の **node プロセスがゾンビとして残り続け**、Ollama へのリクエストが蓄積する。

**症状:** デーモンを再起動するたびに node プロセスが増殖、Ollama 輻輳で全デーモンがフリーズ。

**正しい殺し方:**
```bash
# tsx + 子 node プロセスを全て殺す (VS Code の node は除外)
ps aux | grep "/c/nvm4w/nodejs/node" | grep -v grep | grep -v "Code" | awk '{print $1}' | while read pid; do kill $pid 2>/dev/null; done
```

**確認:**
```bash
ps aux | grep "/c/nvm4w/nodejs/node" | grep -v grep | grep -v "Code" | wc -l
# 0 であること
```

### 8.3 ローカルデーモン起動テンプレート

```bash
cd phi-agent

# 環境変数
export SPHERE_WS=ws://localhost:3001
export RESPONSE=false
export DAEMON_SLEEP_MS=3000
export OLLAMA_MODEL=qwen2.5:0.5b

# 起動 (4体、2秒間隔でスタガー)
for i in 1 2 3 4; do
  nohup npx tsx src/index.ts --loadout random --daemon > /tmp/daemon${i}.log 2>&1 &
  sleep 2
done

# 停止 (ゾンビ対策込み)
ps aux | grep "/c/nvm4w/nodejs/node" | grep -v grep | grep -v "Code" | awk '{print $1}' | while read pid; do kill $pid 2>/dev/null; done
```

### 8.4 batch 投入は不要 (小規模テスト時)

`docker compose up -d` で起動すると **初期シードノード (158件 + relic 10件)** が自動投入される。
ascension テストでは `contribution.js batch` による追加投入は **不要**。
158ノードに eval が分散するため、threshold 突破には十分な評価密度が必要。

---

## 9. 調整係数一覧 (2026-02-20)

詳細: `TUNING_LEDGER_20260220.md`

### 9.1 現在の調整値サマリ

| 係数 | 値 | 変更日 | 変更理由 |
|------|-----|--------|---------|
| `decayIntensity` | **0.5** | 02-20 | 間欠運用で eval gain が decay に負ける → 半減 |
| `thresholdFloor` | **0.8** | 02-20 | top-tier (score=800) が即 candidate になる → 880 に引き上げ |
| Soft: `relicHealth` → `flexibilityHealth` | active/(active+amber) | 02-20 | relic count は不変定数 → 情報量ゼロ。琥珀蓄積検知に置換 |

### 9.2 係数間の依存チェーン

```
decayIntensity (代謝速度)
    ↓  eval gain vs decay のバランスが変わる
effectiveThreshold (ascension 閾値)
    ↓  candidate 出現頻度が変わる
amber 蓄積速度
    ↓  flexibilityHealth が反応する
Soft neuron health
```

**警告**: `decayIntensity` と `thresholdFloor` を同時に変える場合、
`effectiveThreshold - 初期score` の差分が eval 数回分に収まることを確認すること。

### 9.3 現在の実効値 (158 active nodes, archive × 0.5)

| 項目 | 値 |
|------|-----|
| effectiveThreshold | 880 (= 1100 × 0.8) |
| top-tier 初期 score | 800 (h=500 + w=300) → **+80 必要 (2-3 eval)** |
| normal 初期 score | 600 (h=500 + w=100) → **+280 必要 (8-10 eval)** |
| heat 半減期 | ~4 時間 (archive 0.0001 × 0.5) |
| weight 半減期 | ~8 時間 (archive 0.00005 × 0.5) |
| Soft vitality (amber=0) | ~0.85 |
| cooldown 中の decay | ~1.5% / 5min → **dropout しにくい** |

---

## 10. 代謝観測テスト — Mock Observer (2026-02-21)

### 10.1 概要

LLM 不要の mock エージェント群を断続的に wave 投入しながら、
スフィアの代謝状態 (candidate → cooldown → amber → sanctification) を
リアルタイムにポーリング・記録するツール。

`swarm-agent.ts` のラッパーとして `mock-observer.ts` が
SwarmController を wave 単位で断続起動し、合間に `/nodes/stats` + `/sanctification` + `/nodes/metrics` を定期取得する。

### 10.2 起動方法

**重要**: `src/` はコンテナ内に存在しない (Dockerfile は `dist/` のみコピー)。
ホスト側から実行し、`WS_URL` を指定する。

```bash
cd services/periphery

# デフォルト: 10 waves × 2 boost agents, 45s間隔, 9分トータル
WS_URL=ws://localhost:3001 npx tsx src/mock/mock-observer.ts

# 短縮テスト: 3 waves, 2分間
WS_URL=ws://localhost:3001 npx tsx src/mock/mock-observer.ts --fast

# 重負荷: 20 waves × 3 agents, 30s間隔, 15分トータル
WS_URL=ws://localhost:3001 npx tsx src/mock/mock-observer.ts -W 20 -n 3 -w 900 --wave-delay 30000

# トピック集中
WS_URL=ws://localhost:3001 npx tsx src/mock/mock-observer.ts -b focused -t "量子力学"
```

### 10.3 WS ポートに関する注意

Docker 内の periphery は `PORT=3001` が設定されている。
server.ts は `PORT` が設定されている場合 WS を HTTP と同一ポート (3001) で起動する。
`sphere.config.json` の `wsPort: 8081` は **Docker 外ローカル開発時のみ有効**。

```
Docker環境: WS_URL=ws://localhost:3001  (PORT 環境変数 → 同一ポート)
ローカル開発: WS_URL=ws://localhost:8081 (デフォルト)
```

### 10.4 Observer オプション

| フラグ | 説明 | デフォルト |
|-------|------|-----------|
| `-W, --waves` | swarm wave 数 | 10 |
| `--wave-delay` | wave 間隔 (ms) | 45000 |
| `-w, --watch` | 観測トータル時間 (秒) | 540 |
| `-p, --poll` | 状態ポーリング間隔 (秒) | 5 |
| `-n, --agents` | wave あたりのエージェント数 | 2 |
| `-b, --behavior` | random / focused / distributed / boost | boost |
| `-d, --duration` | エージェント最大稼働時間 (ms) | 20000 |
| `--fast` | 短縮モード (3 waves, 2min) | — |

### 10.5 `boost` behavior

swarm-agent.ts に追加された新行動パターン。
全 sensed ノードを `h=9, w=8, d=2` で集中評価し、ノードを amber 候補に押し上げる。

| behavior | 評価対象 | eval スコア | 移動方式 | 用途 |
|----------|---------|-----------|---------|------|
| random | ランダム 1ノード | h=3-8, w=5 | random/hot/explore | 汎用テスト |
| focused | 最高 heat 1ノード | h=8, w=7, d=3 | hot | 特定領域集中 |
| distributed | ランダム 1ノード | h=7, w=6, d=5 | explore | 均等カバレッジ |
| **boost** | **全 sensed ノード** | **h=9, w=8, d=2** | **explore** | **amber 生成・代謝観測** |

### 10.6 出力フォーマット

#### リアルタイムログ

```
   0s [pre        ] active=20 amber=0 cand=0 h=400 w=167 | H:N(0/5) S:N(0.78) M:Y(0.000) mode=archive
  50s [wave-2     ] active=20 amber=0 cand=1(+1) h=412(+12) w=170 | H:N(0/5) S:N(0.80) M:Y(0.000) mode=archive
 331s [wave-7     ] active=20 amber=0 cand=1 h=433 w=176 | H:N(0/5) S:Y(0.85) M:Y(0.000) mode=archive
```

フィールド:
- `active`/`amber`/`cand` — ノード数 (delta 表示付き)
- `h`/`w` — 全ノード平均 heat/weight
- `H:` — Hard neuron (amber数/target)
- `S:` — Soft neuron (health)
- `M:` — Meta neuron (suspicion)
- `mode` — metabolic mode (natural/archive/flow)

色分け: amber 増 = 黄, candidate 増 = 水, heat 上昇 = 赤, heat 下降 = 青

#### 最終レポート

タイムライン、Start/End 比較、Sanctification Triangle 比較、Key Events を出力。

### 10.7 典型的なテストフロー

```
1. docker compose down -v && docker compose build periphery && docker compose up -d periphery
2. (ヘルスチェック + シードデータ投入完了を待つ: ~60s)
3. cd services/periphery
4. WS_URL=ws://localhost:3001 npx tsx src/mock/mock-observer.ts [options]
5. タイムラインで candidate → amber 遷移を確認
```

### 10.8 実測データ (2026-02-21, 20 active + 10 relic)

#### Run 1: 一斉投入 (3 waves × 5 agents, fast mode)

```
結果: 57 evals → avg heat 400→433 (+33), candidate 1件 (50s), amber 0件 (watch 不足)
Meta suspicion: 0.000 (免疫未発火)
```

#### Run 2: 一斉投入 (5 waves × 5 agents, 6min watch)

```
結果: ~100 evals → candidate 5件, amber 0件
原因: 全エージェント退出 → Dormancy 発動 → tick 停止 → cooldown チェック停止
```

#### Run 3: 断続投入 (10 waves × 2 agents, 45s 間隔, 9min)

```
結果: ~40 evals → candidate 1件 (331s), amber 0件
Meta suspicion: 0.000 (免疫未発火)
Soft: 0.77 → 0.85 (fired=true)
原因: 評価密度不足 (1ノードあたり ~2-4 evals, 必要 ~9 evals)
```

### 10.9 発見された制約

#### Dormancy トラップ

**全エージェント退出 → Dormancy → tick 全体スキップ → Arbiter.observe() 停止 → candidate cooldown チェック不能**

`index.ts:289`: `if (isDormant) return;` で tick 全体がスキップされる。
候補の cooldown 計測は `Date.now() - candidateSince` なので時間的には経過するが、
`monitorCandidates()` が呼ばれないため promotion 判定が実行されない。

**対策** (observer 側):
- Post-wave watch 中は keepalive agent (distributed, 1体) を接続し続ける
- 実装済み: wave 全完了後に残り時間分の keepalive を起動

#### 断続投入 vs 評価密度のトレードオフ

| 方式 | Meta 安全性 | 評価密度 | candidate 生成 |
|------|-----------|---------|---------------|
| 一斉 (5×5) | 低リスク (今回は免疫未発火) | 高 (~5 evals/node) | 5件/9分 |
| 断続 (10×2) | 安全 | 低 (~2 evals/node) | 1件/9分 |

candidate 登録には 1 ノードあたり ~9 evals が必要 (score 567 → threshold 880, +35/eval)。
断続投入でこの密度を達成するには:
- wave あたりのエージェント数を 3 に増やす
- wave 間隔を 30s に短縮 (45s → 30s)
- 総時間を 15 分以上に延長 (cooldown 5min + 観測余裕)

### 10.10 推奨パラメータ

| 目的 | 設定 | 想定時間 |
|------|------|---------|
| observer 動作確認 | `--fast` | 2分 |
| candidate 出現確認 | `-W 10 -n 3 --wave-delay 30000 -w 540` | 9分 |
| cooldown 通過 → amber 観測 | `-W 15 -n 3 --wave-delay 30000 -w 900` | 15分 |
| 聖域化到達 | `-W 20 -n 3 --wave-delay 30000 -w 1800` | 30分 |

**全ケースで `WS_URL=ws://localhost:3001` が必要** (Docker 環境)。

### 10.11 観測ポイント

| フェーズ | 観測対象 | 期待 |
|---------|---------|------|
| wave 中 | eval 蓄積 → heat/weight 上昇 | avg heat が上昇すること |
| wave 間 | candidate 登録 | effectiveThreshold (880) 突破ノードが出現 |
| cooldown (5min) | candidate 維持 or dropout | lowerThreshold (85%) を割らなければ amber 昇格 |
| amber 蓄積 | Hard neuron amberCount 増加 | target (5) に向かって蓄積 |
| Soft 反応 | flexibilityHealth 低下 | amber 増 → health 低下 |
| Meta 反応 | suspicion 変動 | churnRate/amberSlope で不正検知の有無 |
| mode 切替 | metabolicAutoMode | amber 蓄積 → archive mode に切替 |
| 聖域化 | festival | Hard+Soft+Meta 全条件達成で発火 |

### 10.12 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `mock/swarm-agent.ts` | `boost` behavior 追加、SwarmConfig 型拡張 |
| `mock/mock-observer.ts` | 新規: 代謝観測ラッパー (断続 wave + state polling + timeline) |
| `mock/index.ts` | observe, ObserverConfig のエクスポート追加 |
| `package.json` | `observe` / `observe:fast` / `observe:heavy` スクリプト追加 |
