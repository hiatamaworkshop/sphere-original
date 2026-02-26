# DB Persistence — 永続化設計

**Status**: 検討中 (2026-02-26)
**関連**: `TRAJECTORY_ANALYSIS_DESIGN.md`, `LEARNED_WEIGHT_DESIGN.md`

---

## 現状

```
全データがファイルベース:
  eval-log.jsonl        — JSONL 追記 (読み取りは全走査)
  narrative-log.jsonl   — JSONL 追記
  trail-log.jsonl       — JSONL 追記 (新設予定)
  species-profile.json  — JSON 上書き
  generations/gen-NNN   — JSON ファイル群

スフィアノード:
  完全インメモリ (再起動で消失)
```

---

## 設計方針

### スフィアエンジンはインメモリのまま

```
decay, heat propagation, energy, TTL
→ 全て物理シミュレーションとしてメモリ上で実行
→ DB に移すと物理の粒度がクエリ遅延に縛られる

DB の役割は:
  - バックアップ / リストア (snapshot)
  - ログの蓄積と検索
  - 解析結果の永続化

スフィア物理の代替ではない。
```

---

## 永続化対象の一覧

### Digestor 管轄 (IO Gateway 経由)

| データ | 現状 | DB 化 | サイズ見積 |
|---|---|---|---|
| eval-log | JSONL | テーブル化 | ~1KB/session, 中 |
| narrative-log | JSONL | テーブル化 | ~2KB/entry, 中 |
| trail-log | JSONL (新設) | テーブル化 | ~15KB/session (384D waypoints), **大** |
| species-profile | JSON | テーブル化 | ~5KB/species, 小 |
| generations | JSON files | テーブル化 | ~10KB/gen, 小 |

### Sphere Core 管轄

| データ | 現状 | DB 化 | 備考 |
|---|---|---|---|
| ノード (vector, energy, TTL...) | インメモリ | snapshot のみ | 定期バックアップ → 起動時リストア |
| Sanctification 候補 | インメモリ判定 | snapshot に含む | Sanctification 後のノードも |

### Facade 管轄

| データ | 現状 | DB 化 | 備考 |
|---|---|---|---|
| セッション状態 | インメモリ | 不要 | 短命。DB にする意味がない |

### Observatory 管轄

| データ | 現状 | DB 化 | 備考 |
|---|---|---|---|
| 解析結果 | 計算のみ | 不要 | Digestor から再計算可能 |
| Pulse 統計 | 移動窓 | 不要 | リアルタイム処理、永続化不要 |

### ライフログアプリ (Flutter / 別プロジェクト)

| データ | 保存先 | 備考 |
|---|---|---|
| 投稿履歴 (nodeId + timestamp) | ローカル SQLite | |
| ライフログ KV キャッシュ | ローカル SQLite | |
| species-profile キャッシュ | ローカル SQLite | オフライン起動用 |

---

## DB 候補の比較

### 検討した選択肢

| 候補 | 特徴 | 無料枠 | 判定 |
|---|---|---|---|
| **Neon** (Serverless Postgres) | ブランチ機能、標準 Postgres | 0.5GB | 堅実だが枠が窮屈 |
| **Supabase** (Postgres + Realtime) | pgvector, Realtime | 500MB, 1週間スリープ | 機能過剰、スリープが問題 |
| **Turso** (Edge SQLite / LibSQL) | 軽量, 多DB, Embedded Replicas | 9GB, 500 DB | **第一候補** |

### Turso を第一候補とする理由

```
1. スフィアの思想との親和性
   - 軽量・独立・分散 (CleanerFish 的)
   - ユーザーごと / 種族ごとに DB を分離可能 (500 DB)
   - Embedded Replicas → サーバーローカルにコピー (低遅延)

2. 実用面
   - 9GB 無料枠 → trail-log の蓄積に十分な余裕
   - SQLite ベース → Digestor ワンショットで直接読み書き可能
   - 384D ベクトルは BLOB 保存 (DB 内 vector 演算は不要)

3. トレードオフ
   - vector 型ネイティブサポートなし → スフィアは自前で空間演算するので問題ない
   - pgvector の誘惑はあるが、Sphere の空間演算は DB に依存しない設計
```

### フォールバック: Neon

```
Turso に問題がある場合の代替。
標準 Postgres なので何でもできる。
0.5GB 制限は trail-log の waypoints を積極的に truncate すれば対応可能。
```

---

## テーブル設計 (Turso / SQLite 想定)

### eval_sessions

```sql
CREATE TABLE eval_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loadout TEXT NOT NULL,
  model TEXT,
  query TEXT,
  timestamp INTEGER NOT NULL,
  duration INTEGER,
  config_hash TEXT,
  bus_emits INTEGER,
  bus_recvs INTEGER
);
```

### evaluations

```sql
CREATE TABLE evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES eval_sessions(id),
  node_id TEXT NOT NULL,
  h REAL NOT NULL,
  w REAL NOT NULL,
  d REAL NOT NULL,
  tags TEXT,           -- JSON array
  expression BLOB      -- float32 array (optional)
);
CREATE INDEX idx_eval_loadout ON evaluations(session_id);
CREATE INDEX idx_eval_node ON evaluations(node_id);
```

### narratives

```sql
CREATE TABLE narratives (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,   -- 'return' | 'stream'
  loadout TEXT NOT NULL,
  model TEXT,
  query TEXT,
  timestamp INTEGER NOT NULL,
  duration INTEGER,
  narrative TEXT NOT NULL,
  encounters TEXT,      -- JSON array
  feelings TEXT,        -- JSON object
  broadcast TEXT        -- JSON array
);
```

### trails

```sql
CREATE TABLE trails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  loadout TEXT NOT NULL,
  sphere_id TEXT,
  timestamp INTEGER NOT NULL,
  duration INTEGER,
  initial_query TEXT,
  action_counts TEXT,   -- JSON: { focus, move, warp, evaluate }
  -- summary (v1 指標、trajectoryDigest() でバッチ計算、常に保持)
  spread REAL,              -- normalized spread (mean_dist / max_dist)
  heat_bias REAL,           -- (mean_visit_heat - sphere_avg) / sphere_avg
  path_length REAL,         -- Σ|pos[i+1] - pos[i]|
  straightness REAL,        -- dist(first, last) / path_length
  revisit_rate REAL,        -- cosine_distance to previous centroid
  centroid BLOB             -- 384D float32
);
CREATE INDEX idx_trail_loadout ON trails(loadout);
CREATE INDEX idx_trail_agent ON trails(agent_id);
```

### trail_waypoints (分離 — 古いものから削除可能)

```sql
CREATE TABLE trail_waypoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trail_id INTEGER NOT NULL REFERENCES trails(id),
  seq INTEGER NOT NULL,
  node_id TEXT,
  position BLOB NOT NULL,  -- 384D float32
  heat REAL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX idx_wp_trail ON trail_waypoints(trail_id);
```

### species_profiles

```sql
CREATE TABLE species_profiles (
  loadout TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  evaluations INTEGER,
  avg_h REAL,
  avg_w REAL,
  avg_d REAL,
  hot_nodes TEXT,       -- JSON array
  common_tags TEXT,     -- JSON array
  eval_consistency TEXT, -- JSON object
  weight_delta TEXT,    -- JSON object
  trajectory_stats TEXT, -- JSON object
  updated_at TEXT NOT NULL
);
```

### generations

```sql
CREATE TABLE generations (
  generation INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  sphere_hash TEXT,
  input_evaluations INTEGER,
  survived_evaluations INTEGER,
  hunger REAL,
  half_life_hours REAL,
  sphere_snapshot TEXT, -- JSON object
  species TEXT,         -- JSON object (full species data)
  global_stats TEXT     -- JSON object
);
```

### sphere_snapshots (新規 — Core バックアップ用)

```sql
CREATE TABLE sphere_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  node_count INTEGER,
  nodes BLOB,           -- 全ノードの圧縮バイナリ
  metadata TEXT          -- JSON: heat distribution, flag distribution, etc.
);
```

---

## マイグレーション戦略

```
Phase 0: 現状維持 (JSONL + JSON ファイル)
  → trajectory の trail-log.jsonl 新設
  → 既存の仕組みで動作確認

Phase 1: Digestor に DB クライアント追加
  → IO Gateway の内部ストレージを DB に切り替え
  → 外部 API は変更なし (POST /evaluations, GET /species/... 等)
  → phi-agent / Observatory は何も変えなくて良い

Phase 2: Sphere snapshot の DB 保存
  → 定期的に Core のノード状態を DB に書き出し
  → 起動時に最新 snapshot からリストア

Phase 3: JSONL ファイルの廃止
  → IO Gateway が完全に DB ベースに
  → ファイルモードは fallback として残す (DIGESTOR_URL 未設定時)
```

### 重要: API は変えない

```
phi-agent は DIGESTOR_URL 経由で HTTP アクセス。
DB がバックエンドに入っても API は同じ。
影響を受けるのは Digestor の内部実装のみ。

POST /evaluations  → eval_sessions + evaluations テーブルに INSERT
POST /narratives   → narratives テーブルに INSERT
POST /trails       → trails + trail_waypoints テーブルに INSERT
GET  /species/:name/profile → species_profiles テーブルから SELECT
GET  /generations  → generations テーブルから SELECT
```

---

## データ量見積もり

```
前提: 1日あたりエージェント 50 セッション

eval_sessions + evaluations:
  50 sessions × ~1KB = ~50KB/日 → ~1.5MB/月

narratives:
  50 entries × ~2KB = ~100KB/日 → ~3MB/月

trails + trail_waypoints:
  50 sessions × ~15KB = ~750KB/日 → ~22MB/月
  waypoints のみ: ~20MB/月 (30日保持で ~600MB → truncate 必要)

species_profiles:
  ~10 species × ~5KB = ~50KB (上書き)

generations:
  1/3h × 8h稼働 ≈ 3/日 × ~10KB = ~30KB/日 → ~900KB/月

sphere_snapshots:
  4回/日 × ~500KB = ~2MB/日 → ~60MB/月

合計 (月): ~90MB
Turso 9GB 枠: ~100ヶ月分 (waypoints truncate 後)
Neon 500MB 枠: ~5ヶ月分 (waypoints 積極削除必要)
```

---

## trail_waypoints の管理

```
生 waypoints は最大のデータソース。
summary (4指標 + centroid + PCA1 + pathLength) を trails テーブルに持てば、
古い waypoints は削除しても解析には影響しない。

保持ポリシー:
  直近 30日: 全 waypoints 保持 (再計算、詳細分析用)
  30日以降: summary のみ保持、waypoints 削除

Digestor の digest() で TRAIL_RETAIN_DAYS 超過分を自動 truncate。
```
