# Turso DB Integration Memo

**実装日**: 2026-02-28
**実装者**: Claude (Opus 4.6)

---

## 1. 現状の実装

### 概要

Sphere の永続化レイヤーとして Turso (Edge SQLite) を導入。
3つの独立したストレージ層を構築した:

```
┌─────────────────────────────────────────────────────┐
│                 Turso (libSQL)                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ RefDB        │ │ ProjDB       │ │ Digestor     │ │
│  │ write-through│ │ periodic     │ │ dual-backend │ │
│  │ (逐次)       │ │ snapshot     │ │ (file/turso) │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ │
│                                                     │
│  Tables:                                            │
│  - reference_records   ← RefDB 逐次書き込み         │
│  - projection_state    ← ProjDB 30分スナップショット │
│  - eval_sessions       ┐                            │
│  - evaluations         │                            │
│  - narratives          ├─ Digestor IO Gateway       │
│  - trails              │                            │
│  - species_profiles    │                            │
│  - generations         ┘                            │
└─────────────────────────────────────────────────────┘
```

### 各層の設計

| 層 | パターン | 書込み頻度 | 読込み | 環境変数 |
|---|---|---|---|---|
| **RefDB** | Write-Through | 毎回 (create/markAsAmber/delete) | Map のみ (O(1)) | `REFDB_BACKEND=turso` |
| **ProjDB** | Periodic Snapshot | 30分ごと + shutdown 時 | 起動時に全復元 | (RefDB=turso なら自動) |
| **Digestor** | Dual-Backend | IO Gateway 受信時 | 直接 DB 読み | `STORAGE_BACKEND=turso` |

### テーブルスキーマ

**reference_records** (RefDB — ノードの魂):
```sql
CREATE TABLE reference_records (
  id TEXT PRIMARY KEY,          -- content hash
  timestamp INTEGER NOT NULL,
  kind TEXT NOT NULL,           -- active/amber
  payload TEXT NOT NULL,        -- JSON: tags, summary, content, links, ref_url
  snapshot TEXT NOT NULL,       -- JSON: vector[384], weight, heat, decay, flags
  raw_json TEXT NOT NULL        -- 完全な ReferenceRecord JSON (復元用)
);
```

**projection_state** (ProjDB — ノードの進化メトリクス):
```sql
CREATE TABLE projection_state (
  id TEXT PRIMARY KEY,          -- reference_records.id と同じ
  kind TEXT NOT NULL,           -- 現在の kind (ghost/fossil 等、進化後)
  h REAL NOT NULL,              -- heat (物理演算後)
  w REAL NOT NULL,              -- weight
  d REAL NOT NULL,              -- decay coefficient
  ttl REAL NOT NULL,            -- time-to-live
  flg INTEGER NOT NULL,         -- 16-bit flags
  stay_time REAL,               -- エージェント滞在時間
  immune_mod REAL,              -- 免疫修飾子
  updated_at INTEGER NOT NULL
);
```

### 起動時の復元フロー

```
1. TursoReferenceRepository.init()
   → reference_records テーブル作成
   → 全レコード → Map<id, ReferenceRecord> (RefDB 復元)

2. ProjectionSnapshot.restore(projectionMap, referenceMap)
   → projection_state から全メトリクスロード
   → referenceMap を走査:
     a. snapshot にメトリクスあり → RefDB 本体 + 進化メトリクスで SphereNode 構築
     b. snapshot になし → RefDB の初期スナップショットで SphereNode 構築 (誕生状態)
     c. RefDB になく snapshot にあり → 無視 (削除済み)
   → projectionMap (ProjDB) に全ノード投入

3. RenalCore が projectionMap を受け取り、物理演算を再開
```

**なぜ ProjDB に vector/payload を保存しないか**:
- RefDB の reference_records に raw_json として全データが存在
- 384次元ベクトル (1,536 bytes) × 50,000 ノード = ~75MB の二重保存を回避
- ProjDB snapshot はメトリクスのみ → 1ノード ~100 bytes → 50,000 ノードで ~5MB

---

## 2. 技術的注意点

### Write-Through の制約

```typescript
// TursoReferenceRepository.delete()
async delete(id: string): Promise<void> {
  this.store.delete(id);  // ← Map 先に削除
  await this.db.execute(   // ← Turso が失敗すると不整合
    "DELETE FROM reference_records WHERE id = ?", [id]
  );
}
```

- **Map → Turso の順序**: Map 側が先に成功し、Turso が失敗すると不整合
- **許容理由**: Sphere は非金融システム。再起動で Turso から復元するため、
  ランタイム中の Turso 障害は Map (メモリ) が正になる
- **改善案** (将来): Turso → Map 順序に反転。または batch transaction

### Snapshot の DELETE + INSERT 戦略

```
snapshot():
  1. DELETE FROM projection_state       ← 全消去
  2. batch INSERT (500件ずつ)           ← 全投入
```

- **中断リスク**: DELETE 後 INSERT 前にクラッシュすると空テーブル
- **許容理由**: ProjDB は RefDB から再構築可能。空テーブルでも RefDB 初期状態で復帰
- **改善案** (将来): 一時テーブルに INSERT → RENAME (atomic swap)

### libsql/client バージョン

- 現在: `@libsql/client ^0.14.0`
- periphery と digestor の両方に依存追加済み
- Docker build 時に `npm install` で自動解決

### Turso 接続情報

- **URL**: 環境変数 `TURSO_URL` (必須、turso バックエンド使用時)
- **Token**: 環境変数 `TURSO_AUTH_TOKEN` (認証用)
- **接続先**: 同一 Turso DB を RefDB, ProjDB, Digestor が共有
- **接続数**: 3 (RefDB client, ProjDB snapshot client, Digestor client)

---

## 3. フォーク時の DB パッケージング

### 問題

現状、DB 接続は各サービスのソースコードと環境変数に散在している:

```
periphery/src/index.ts         → REFDB_BACKEND, TURSO_URL, TURSO_AUTH_TOKEN
periphery/src/repository/      → TursoReferenceRepository, ProjectionSnapshot
digestor/src/storage.ts        → STORAGE_BACKEND, TURSO_URL, TURSO_AUTH_TOKEN
digestor/src/db-storage.ts     → DbStorage (テーブルスキーマ内蔵)
docker-compose.yml             → 環境変数の配線
.env / .env.example            → 値の設定
```

フォークプロジェクトが Sphere を使うとき、**毎回この配線を手動で再現する**必要がある。

### あるべき姿: DB Config Layer

`sphere.config.json` に DB 設定を集約する。
各サービスは config から接続情報を取得する。

```json
{
  "metadata": {
    "sphereId": "lifelog-sphere",
    "forked_from": "sphere-original"
  },
  "persistence": {
    "backend": "turso",
    "turso": {
      "url": "${TURSO_URL}",
      "authToken": "${TURSO_AUTH_TOKEN}"
    },
    "refdb": {
      "mode": "write-through",
      "enabled": true
    },
    "projdb": {
      "mode": "periodic-snapshot",
      "snapshotIntervalObservations": 180,
      "enabled": true
    },
    "digestor": {
      "mode": "dual-backend",
      "enabled": true
    }
  }
}
```

**現状との差分**:
- 環境変数 `REFDB_BACKEND`, `STORAGE_BACKEND` → `persistence.backend` に統合
- 各層の有効/無効を config で制御
- スナップショット間隔も config 化

**なぜ今やらないか**:
- 現状の環境変数方式で動作している
- フォークが発生した時点で需要が確定する
- 過剰設計を避ける (config 層のパーサーとバリデーションが必要になる)

### フォーク時の最小手順 (現状)

```bash
# 1. Turso で新しい DB を作成 (Web Dashboard or CLI)
turso db create lifelog-sphere --group ap-northeast-1

# 2. 接続情報を取得
turso db tokens create lifelog-sphere

# 3. .env に設定
TURSO_URL=libsql://lifelog-sphere-username.turso.io
TURSO_AUTH_TOKEN=eyJ...

# 4. バックエンド選択
REFDB_BACKEND=turso      # RefDB write-through
STORAGE_BACKEND=turso     # Digestor DB mode

# 5. docker compose up
# → テーブルは各サービスが init() で自動作成
```

**フォーク DB は完全に分離される**:
- sphere-original と lifelog-sphere は別の Turso DB
- テーブルスキーマは同一 (同じコードが init() する)
- データは完全に独立

---

## 4. ライフログスフィア フォーク時の DB 設計イメージ

### ライフログ固有のデータモデル

ナレッジスフィアとの差異:

| | Knowledge Sphere | Lifelog Sphere |
|---|---|---|
| ノード内容 | 知識テキスト (長文) | 感情テキスト (短文) + ライフログ KV |
| payload.content | 数百文字〜数千文字 | 数十文字〜数百文字 |
| メトリクス意味 | h=honesty, w=worth, d=danger | h=resonance, w=depth, d=intensity |
| 投入頻度 | バッチ + エージェント生成 | ユーザーアクティブ投入のみ |
| ノード数規模 | 数万〜数十万 | 数百〜数千 (ユーザー単位) |
| vector 空間 | 知識ドメイン全域 | 感情 + 生理状態の表現空間 |

### テーブル使い回しの判断

**そのまま使えるテーブル**:

| テーブル | 理由 |
|---|---|
| `reference_records` | ノード構造は同一 (id, payload, snapshot, vector)。内容が違うだけ |
| `projection_state` | メトリクス (h, w, d, ttl, flg) は物理層。ドメイン非依存 |
| `eval_sessions` | セッション記録の構造は同一 |
| `evaluations` | h/w/d スコアの記録。意味が変わるだけで構造は同一 |
| `species_profiles` | 種族記憶。loadout 名が変わるかもしれないが構造は同一 |
| `generations` | Digestor の世代管理。そのまま |

**追加が必要になりうるテーブル**:

```sql
-- ライフログスナップショット (ノード投入時点の生理データ)
-- App 側で管理するか、Sphere 側に持つかの設計判断が必要
CREATE TABLE IF NOT EXISTS lifelog_snapshots (
  node_id TEXT PRIMARY KEY REFERENCES reference_records(id),
  hr INTEGER,           -- heart rate
  hrv INTEGER,          -- heart rate variability
  sleep_total REAL,     -- hours
  steps INTEGER,
  skin_temp REAL,
  emotion_stamp INTEGER, -- 1-5 gradient
  raw_json TEXT          -- full snapshot
);
```

**ただし、この追加テーブルは Sphere コアの責務ではない**。
LIFELOG_SPHERE_DESIGN.md §6 の方針:

> ライフログ時系列はガジェットアプリの責務。われわれは保存しない。
> 保存するのは: テキスト + スタンプ + その時間帯のライフログスナップショット + sphereNodeId

つまり:
- **Sphere DB (Turso)**: ノード本体 + メトリクス (既存テーブルで十分)
- **App DB (別途)**: ライフログスナップショット + sphereNodeId のマッピング

### フォーク時の DB 分離パターン

```
sphere-original (Turso DB: sphere-original)
  ├── reference_records     ← 知識ノード
  ├── projection_state      ← 物理メトリクス
  ├── eval_sessions         ← エージェント評価
  └── ...

lifelog-sphere (Turso DB: lifelog-sphere)  ← 別 DB
  ├── reference_records     ← 感情ノード (同じスキーマ)
  ├── projection_state      ← 物理メトリクス (同じスキーマ)
  ├── eval_sessions         ← エージェント評価 (同じスキーマ)
  └── ...

lifelog-app (別ストレージ — SQLite/Turso/Firebase)
  ├── posts                 ← テキスト + emotion_stamp
  ├── lifelog_snapshots     ← 生理データスナップショット
  └── sphere_node_map       ← post_id ↔ sphereNodeId
```

**原則**: Sphere は「場」。何を入れるかは「投入者」(App/Agent) の責任。
Sphere DB にドメイン固有テーブルを追加しない。

---

## 5. DB Config 統合への道筋

### 段階的実装ロードマップ

**Phase 0 (現状)**: 環境変数で制御
```
REFDB_BACKEND=turso|map
STORAGE_BACKEND=turso|file
TURSO_URL=...
TURSO_AUTH_TOKEN=...
```
- 動作する。フォーク時は .env を書き換えるだけ
- 欠点: 設定が散在、config と環境変数の二重管理

**Phase 1 (フォーク発生時)**: sphere.config.json に `persistence` セクション追加
- `persistence.backend` で一括切替
- 各サービスは config から読み取り
- 環境変数はフォールバック

**Phase 2 (複数フォーク運用時)**: Wizard CLI
```bash
sphere-wizard init --name lifelog-sphere --from sphere-original
# → Turso DB 自動作成
# → .env 生成
# → sphere.config.json テンプレート生成
# → docker-compose.yml のパラメータ埋め込み
```

**Phase 3 (本格運用時)**: マイグレーション管理
- スキーマバージョン管理
- `sphere-wizard migrate` で安全なスキーマ更新
- Turso の DB branching 機能でステージング

### 今回やらないこと (意図的な先送り)

| やらないこと | 理由 |
|---|---|
| config 統合 | フォーク未発生。過剰設計 |
| Wizard CLI | 1回しかやらない操作を自動化するのは早い |
| マイグレーション管理 | スキーマが安定するまで不要 |
| DB connection pool | 現在の接続数 (3) で問題なし |
| batch delete for RefDB | 現在のノード数で個別 delete が問題にならない |

---

## 6. Turso 固有の注意点

### 無料枠

| リソース | 制限 |
|---|---|
| ストレージ | 9 GB |
| DB 数 | 500 |
| 月間行読み取り | 1B |
| 月間行書き込み | 25M |

50,000 ノードの Sphere で:
- RefDB: ~150MB (raw_json 含む)
- ProjDB snapshot: ~5MB
- Digestor: 数十MB (eval-log 依存)
- **合計**: 200-300MB → 9GB 枠に十分収まる

### リージョン

```bash
turso db create sphere-original --group ap-northeast-1
```
- 日本からのレイテンシ最小化
- フォーク DB も同リージョンに作成推奨

### batch API の制限

- 1 batch あたり最大ステートメント数: ~1000 (非公式)
- 現在の BATCH_SIZE = 500 は安全圏
- 50,000 ノードの snapshot: 100 batch × ~100ms = ~10秒

### エラーハンドリング

現在は全層で Turso エラーを try-catch していない (正常系のみ実装)。
本格運用時に追加すべき:
- Write-Through: Turso 障害時の Map-only フォールバック
- Snapshot: 失敗時のリトライ (次回 Patrol まで待つのが最安)
- Digestor: Turso → File フォールバック
