# PostgreSQL - Reference DB

## 役割

- Reference DB（参照データベース）
- ノードの構造データ（座標、メタデータ、リンク）を保存
- pgvector 拡張によるベクトル検索

## データ構造

### 主要テーブル

#### sphere_nodes
- id (UUID, Primary Key)
- position (vector(384)) - ノードの座標
- weight (float) - ノードの重み
- decay (float) - 減衰係数
- heat (float) - 熱量
- ttl (float) - 残存時間
- flags (int) - 16bit フラグ
- state (enum) - active, amber, fossil, ghost, plankton
- created_at (timestamp)
- updated_at (timestamp)

#### spatial_fields
- id (UUID, Primary Key)
- grid_position (vector(384))
- fertility (float)
- plankton_count (int)

#### spectral_links
- source_id (UUID, FK)
- target_id (UUID, FK)
- flow (float)
- weight (float)

## 拡張機能

- **pgvector**: ベクトル類似度検索
  - インデックス: HNSW または IVFFlat
  - 距離関数: コサイン類似度

## 開発環境の設定

- PostgreSQL 16 + pgvector
- ユーザー: sphere_user
- データベース: sphere_db
- パスワード: 環境変数 `POSTGRES_PASSWORD`

## Phase 3 での位置づけ

Phase 3 初期実装では**インメモリ Map** を使用します。
PostgreSQL への移行は Phase 3.2 以降で実施します。

### マイグレーションパス
1. Phase 3.1: インメモリ Map（現在）
2. Phase 3.2: SQLite（開発環境）
3. Phase 3.3: PostgreSQL（本番環境）
