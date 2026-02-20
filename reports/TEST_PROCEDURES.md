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

# periphery のスナップショット
curl http://localhost:3001/nodes/stats
curl http://localhost:3001/metrics
```

### 7.8 関連ドキュメント

| ドキュメント | 内容 |
|------------|------|
| `TEST_STARTUP_CHECKLIST.md` | 起動前の落とし穴 9項目 (ビルド順序、WS ポート、LOADOUT=random 等) |
| `DAEMON_TEST_BATCH_PROTOCOL.md` | Cycle A/B 設計、Wave Injection、成功基準 |
| `TESTING_MEMO.md` | 歴史的アーカイブ (Section 14-16 にデータ蓄積・expression 実験の詳細) |
| `FLUX_SEEP_DESIGN.md` | Flux Seep 設計 + ライブテスト結果 (2026-02-18) |
| `PHASE4_AGENT_SPATIAL_DESIGN.md` Section 13 | 空間システム現状棚卸し (2026-02-19) |
