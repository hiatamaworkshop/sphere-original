# モデル比較テスト — 正しいテスト手順

**作成日**: 2026-02-09
**教訓**: 単発セッションでの判断は無意味。daemon mode で蓄積して統計を取る。

---

## 原則

1. **daemon mode で蓄積** — 1セッションの 3-5 評価で種族差は判断できない
2. **--scale で並列** — 複数エージェントが同時に動くことで Sphere 内の相互作用も再現
3. **LOADOUT=random** — 全9種族がランダムに割り当てられ、偏りなくデータが集まる
4. **十分な時間** — 最低 30 分、理想は 50 分以上
5. **統計で判断** — 種族別の平均値とサンプルサイズで比較

---

## ❌ 間違った方法（今回やってしまったこと）

```bash
# 1種族ずつ1回だけ実行 → サンプル 3-5 評価
docker run --rm ... -e LOADOUT=balanced -e DAEMON=false phi-agent:latest
docker run --rm ... -e LOADOUT=hunter   -e DAEMON=false phi-agent:latest
```

### なぜ間違いか

- 1セッション = 3-5 評価 → 分散が大きすぎて平均が安定しない
- Sphere 内に他エージェントがいない → Bus 通信・相互作用がない
- ノード選択が固定的 → 同じノードばかり評価してしまう
- 環境差（Docker vs ローカル）でスコアが大きく変わることが実証済み
  - 手動テスト: 1B hunter h=1.0
  - Docker daemon: 1B hunter h=9.7
  - **同じモデル・同じ Loadout でも環境で +8.7 の差**

---

## ✅ 正しい方法

### 前提

| 項目 | 条件 |
|------|------|
| Sphere | docker compose で periphery + renalCore が稼働中 |
| Ollama | テスト対象モデルが pull 済み |
| phi-agent イメージ | 最新ビルド済み |
| eval-log.jsonl | テスト前にバックアップ or クリア |

### Step 1: テスト前のデータ保全

```bash
# 現在の eval-log をバックアップ
cp phi-agent/data/eval-log.jsonl phi-agent/data/eval-log-backup-$(date +%Y%m%d%H%M).jsonl

# テスト用にクリア（既存データの影響を排除したい場合）
# > phi-agent/data/eval-log.jsonl
```

**判断**: 既存データを残すか空にするかはテスト目的による
- **モデル純粋比較**: 空にする（他モデルのデータが混ざらない）
- **環境込みの比較**: 残す（species memory の影響も含めてテスト）

### Step 2: docker-compose でモデルを指定して daemon 起動

```bash
cd docker_compose_sphere_v1

# 方法 A: 環境変数で上書き
OLLAMA_MODEL=qwen2.5:0.5b docker compose up --scale phi-agent=3 -d

# 方法 B: docker-compose.yml の environment を直接変更
# phi-agent サービスの OLLAMA_MODEL を変更
```

**確認事項**:
- `DAEMON=true` が設定されているか
- `LOADOUT=random` が設定されているか
- `OLLAMA_MODEL` が正しいか
- phi-agent が sphere-network 内にいるか

### Step 2.5: Digestor の設定

Digestor は eval-log.jsonl を定期的に代謝する独立コンテナ。`--profile agent` で自動起動する。

**テスト時の設定**:
```yaml
# docker-compose.yml の digestor サービス
environment:
  - DIGEST_INTERVAL_MS=300000   # テスト時: 5分 (本番: 10800000 = 3h)
  - HALF_LIFE_HOURS=72          # 記憶の半減期
  - MIN_EVALS=50                # この閾値未満は代謝スキップ
  - MIN_PER_SPECIES=20          # 小種族保護 (この数以下は淘汰免除)
```

**代謝サイクル** (6ステップ):
1. eval-log.jsonl 読み込み → 全評価をフラット化
2. スコアリング: `balanced_qv [0.33, 0.34, 0.33] × time_decay (exp(-age/72h))`
3. 淘汰 (prune): hunger に基づく生存抽選 (閾値以下でも最低 5% の生存確率)
4. プロファイル生成: 種族集計 + 環境ブレンド (0.7×自種族 + 0.3×全種族)
5. 世代アーカイブ: `generations/gen-NNN.json` に保存
6. eval-log truncation: 生存者のみに書き戻し (atomic write: tmp→rename)

**テスト時の注意**:
- `MIN_EVALS=50` → 評価数が 50 未満なら代謝はスキップされる
- テスト開始直後は Digestor は何もしない (データ不足)
- 30 分 (~90 evals) で最初の代謝が発動する
- **gen-NNN.json が最も信頼できる統計ソース** — eval-log は truncation で縮小するため
- Explorers の Generations タブで gen-NNN.json を可視化できる

**hunger 曲線**:
| 評価数 | hunger | 淘汰率 |
|--------|--------|--------|
| <200 | 0.2 | 軽い (ほぼ全生存) |
| 200-500 | 0.2-0.8 | 線形増加 |
| >500 | 0.8-1.0 | 激しい (小種族絶滅リスク) |

**モデル比較テストでの Digestor の役割**:
- eval-log を空にしてテスト開始 → Digestor は MIN_EVALS に達するまで待機
- 50 evals 超過後、最初の代謝で species-profile.json が生成される
- この profile が phi-agent の species memory bias に反映される
- **つまり**: 十分な蓄積後は Digestor のフィードバックループ込みの行動を観測できる

### Step 3: 蓄積を待つ

| 時間 | セッション目安 | 評価数目安 | 判断 |
|------|-------------|-----------|------|
| 10 分 | ~10 sess | ~30 evals | 最低限（傾向のみ） |
| 30 分 | ~30 sess | ~90 evals | 妥当（種族差の有無は判断可能） |
| **50 分** | **~50 sess** | **~150 evals** | **推奨（統計的に安定）** |

**モニタリング**:
```bash
# eval-log の行数を監視
wc -l phi-agent/data/eval-log.jsonl

# 直近の評価を確認
tail -5 phi-agent/data/eval-log.jsonl

# phi-agent のログを確認
docker logs --tail 20 <phi-agent-container-id>
```

### Step 4: 停止してデータ保存

```bash
# phi-agent のみ停止（Sphere は残す）
docker compose stop phi-agent

# データを保存
cp phi-agent/data/eval-log.jsonl phi-agent/data/test-results/test-<model-name>/eval-log.jsonl

# Digestor 生成物も保存 (重要: eval-log は truncation で縮小するが gen-NNN.json は不変)
cp phi-agent/data/species-profile.json phi-agent/data/test-results/test-<model-name>/species-profile.json
cp -r phi-agent/data/generations/ phi-agent/data/test-results/test-<model-name>/generations/

# Digestor も停止
docker compose stop digestor
```

**注意**: eval-log.jsonl は Digestor の truncation により生存者のみに縮小されている場合がある。
gen-NNN.json は truncation 前のスナップショットを含むため、元の統計を保持している。

### Step 5: 統計分析

**方法 A**: eval-log.jsonl から直接抽出 (truncation 前 or 短時間テスト):

```bash
# 種族別セッション数
cat phi-agent/data/eval-log.jsonl | python3 -c "
import sys, json
data = [json.loads(l) for l in sys.stdin]
from collections import Counter
c = Counter(d['loadout'] for d in data)
for k,v in c.most_common(): print(f'{k}: {v} sessions')
"

# 種族別平均スコア（evaluations を展開して集計）
# → summary.md に記録
```

**方法 B**: gen-NNN.json から抽出 (推奨 — Digestor 代謝後の正確な統計):

```bash
# 最新世代の species profile を読む
cat phi-agent/data/generations/gen-$(ls phi-agent/data/generations/ | sort | tail -1) | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'Generation: {data[\"generation\"]}')
print(f'Input: {data[\"inputEvaluations\"]} evals, Survived: {data[\"survivedEvaluations\"]}')
print(f'Hunger: {data[\"hunger\"]:.2f}')
print()
for name, sp in sorted(data['species'].items()):
    print(f'{name:12s}: {sp[\"evaluations\"]:3d} evals, h={sp[\"avgH\"]:.1f} w={sp[\"avgW\"]:.1f} d={sp[\"avgD\"]:.1f}')
"
```

**方法 C**: Explorers Generations タブ (GUI 可視化):
- `http://localhost:7860` → Generations タブ
- gen-NNN.json を自動読み込み、種族統計 + 世代進化を Plotly でグラフ化
- 視覚的にモデル間の種族差を比較できる

### Step 6: 比較判定

**比較表を埋める**:

| Loadout | sessions | evals | avgH | avgW | avgD | Bus E | Bus R |
|---------|----------|-------|------|------|------|-------|-------|
| (種族名) | | | | | | | |

**判定基準**:
- scholar の avgW が全体平均より高い → ✅ weight 重視の種族性あり
- wanderer/moth の avgH が全体平均より高い → ✅ heat 生産の種族性あり
- archivist の avgD が全体平均より低い → ✅ 保存的な種族性あり
- 差が 0.5 ポイント以上 → 統計的に意味がある（93 sessions のベースラインでは 0.5-2.0 の差）

---

## ベースライン（参照用）

### phi3:mini (3.8B) — 59 sessions, Docker daemon mode

DATA_ACCUMULATION_20260209.md より:

| Loadout | Sess | h avg | w avg | d avg | 性格署名 |
|---------|------|-------|-------|-------|----------|
| wanderer | 13 | **7.0** | 4.9 | 4.5 | h最高、Bus最活発 |
| moth | 6 | **6.7** | **3.5** | 4.9 | heat特化、w最低 |
| scout | 6 | 6.5 | 4.4 | 4.1 | fresh重視 |
| hermit | 13 | 5.3 | 3.9 | 4.7 | 控えめ、Bus受信多 |
| balanced | 3 | 5.3 | 4.5 | 4.2 | 中庸 |
| hunter | 10 | 5.2 | 3.8 | 5.0 | selective、d高め |
| scholar | 4 | 5.0 | **5.7** | 4.3 | w最高 |
| archivist | 2 | 5.0 | **6.8** | **3.0** | w高、d最低(保存) |
| sniper | 2 | 5.0 | 4.3 | 4.8 | 厳格、均一 |

**種族差の証拠**:
- h: wanderer(7.0) vs sniper(5.0) → **差 2.0**
- w: archivist(6.8) vs moth(3.5) → **差 3.3**
- d: archivist(3.0) vs hunter(5.0) → **差 2.0**

---

## 注意事項

### 環境差の影響

同じ llama3.2:1b でも:
- **手動テスト (ローカル)**: hunter h=1.0, wanderer h=1.0
- **Docker daemon**: hunter h=9.7, wanderer h=10.0

→ **差 +8.7**。テスト環境を揃えなければ比較にならない。
→ 本番環境 (Docker daemon) でテストすべき。

### species memory の汚染

異なるモデルの評価データが eval-log.jsonl に混在すると:
- species profile が汚染される
- 次のモデルのテストに影響する

→ **モデル純粋比較**: テスト前に eval-log を空にする
→ **現実的運用テスト**: 混在を許容する（Digestor が calibrate する前提）

### Digestor と eval-log truncation

- Digestor は代謝時に eval-log.jsonl を **生存者のみに書き戻す** (truncation)
- テスト中に Digestor が動くと、eval-log の行数が減る (正常動作)
- **分析は gen-NNN.json を使う** — truncation 前の完全な統計が含まれる
- モデル純粋比較で eval-log を空にした場合、MIN_EVALS=50 まで Digestor は待機する
- species-profile.json は **環境ブレンド済み** (0.7×自種族 + 0.3×全種族) — agent はこれをそのまま使う
- Digestor の model field で将来的にモデル別 calibration が可能 (未実装)

### LOADOUT=random の特性

- コンテナ起動時に1回だけ決定
- daemon 内のセッション間では変わらない
- 3エージェント × random → 3種族が固定的に回り続ける
- **全9種族を網羅するには複数回の起動が必要**
  - 7 rounds × 3 agents = 21 agent 起動 → 9種族カバー

---

## 反省: 今回の誤り

### 何をやったか

1. `docker run --rm` で balanced/hunter/scholar/hermit を各1回実行
2. 各3-5評価の平均で「種族差がない」と判断
3. 0.5B は h≈8 収束、1B は h≈1.5 収束 → と報告

### 何が間違いだったか

1. **サンプルサイズ**: 3-5 評価では分散が大きすぎて平均が安定しない
2. **孤立実行**: 他エージェント不在で Bus 通信・相互作用がない
3. **daemon 不使用**: 種族記憶の蓄積・フィードバックループが機能しない
4. **環境差の無視**: Docker daemon vs 手動実行で h が +8.7 も異なる実績がある

### 正しくはどうすべきだったか

docker-compose で daemon=true, --scale 3, LOADOUT=random で 30-50 分回し、
蓄積された eval-log.jsonl の種族別統計で判断すべきだった。

---

## 関連ドキュメント

- `docs/reports/DATA_ACCUMULATION_20260209.md` — ベースライン蓄積の実績と方法
- `docs/reports/EVALFOCUS_PROMPT_PATTERNS.md` — 1B vs 3B の evalFocus 感度
- `docs/reports/SPECIES_MEMORY_METABOLISM_DESIGN.md` — Digestor 設計思想 (種族記憶の代謝)
- `docs/reports/DIGESTOR_GENERATION_ARCHIVE_DESIGN.md` — 世代アーカイブ設計
- `reports/MODEL_COMPARISON_PROTOCOL.md` — 比較プロトコル（判定基準）
- `phi-agent/doc/LOADOUT_TEST_RESULTS.md` — 過去の Loadout テスト結果
- `phi-agent/doc/EXTREME_LOADOUT_TEST_RESULTS.md` — 極端 Loadout テスト結果
- `digestor/src/scoring.ts` — スコアリング・hunger・淘汰の実装
- `digestor/src/profiler.ts` — 種族集計・環境ブレンドの実装

---

**最終更新**: 2026-02-09
**状態**: 手順確定、次回テストで適用
