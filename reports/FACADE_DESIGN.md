# Facade Design — Navigator (設計メモ)

作成日: 2026-02-20

---

## コンセプト: Navigator (案内人)

ファサードは **Navigator** である。

- 知識を持たない
- 判断しない
- ただ道を示す
- 失敗しても感情を持たない

図書館 = sphere。図書館群をまとめた地図 = facade。
ファサードは地図であり、知識の中身を触らない。

---

## 設計原則

| 原則 | 説明 |
|------|------|
| **スフィアは自己完結** | embedding model、ベクトル化、検索は全てスフィア内部の責務 |
| **ファサードは非介入的集約** | manifest を収集し catalog を生成するが、内容の正しさに介入しない |
| **エージェントが選ぶ** | 選択ロジックはエージェント側。スフィアは「選ばれる努力」はするが「選択ロジック」は持たない |
| **sanctuary は read-only** | 代謝停止、eval 禁止、接続→探索→切断のみ |
| **passport は core 専用** | sanctuary 探索では energy 変動なし。passport 不要 |
| **embedding は完全内部責務** | 外部が知る必要はない。独立性の保証 |

---

## 1. スフィア側: 自己記述 API

### `GET /sphere/manifest`

```json
{
  "sphereId": "sphere-medical-001",
  "name": "Medical Knowledge Sphere",
  "description": "臨床・薬理・診断に関する知識を集約",
  "tags": ["medical", "clinical", "pharmacology", "diagnosis"],
  "language": ["ja", "en"],
  "nodeCount": 1247,
  "amberCount": 89,
  "sanctuaryEpoch": 3,
  "mode": "sanctuary",
  "apiVersion": "1",
  "confidenceHints": {
    "clinical-diagnosis": 0.9,
    "pharmacology": 0.85,
    "disaster-triage": 0.4,
    "mental-health": 0.3
  }
}
```

### フィールド定義

| フィールド | 型 | 由来 | 説明 |
|-----------|-----|------|------|
| sphereId | string | config | 一意識別子 |
| name | string | config | 表示名 |
| description | string | config | スフィアの概要 |
| tags | string[] | config | 検索・分類用タグ |
| language | string[] | config | 対応言語 |
| nodeCount | number | runtime | 総ノード数 |
| amberCount | number | runtime | 琥珀ノード数 |
| sanctuaryEpoch | number | runtime | 聖域化回数 |
| mode | string | config | "sanctuary" or "core" |
| apiVersion | string | config | メジャーバージョンのみ |
| confidenceHints | Record<string, number> | config | タグ別自信度 (0.0-1.0) |

### 設計判断

- **embeddingModel は公開しない**: ベクトル化はスフィア内部の責務。外部が知る必要はない
- **apiVersion は1本**: protocolVersion との二重管理は混乱の元。メジャーバージョンのみ
- **confidenceHints はタグ連動**: tags と同じキー空間。未記載 = 不明 (エージェントの判断に委ねる)
- **sanctuary では manifest は immutable**: 代謝停止のため全フィールドが起動時に確定。キャッシュ可能

### confidenceHints について

スフィア自身が出す「自信度」。エージェント選択に使えるが、外部が強制しない。

```
医療スフィア: { "clinical-diagnosis": 0.9, "disaster-triage": 0.4 }
海洋スフィア: { "navigation": 0.95, "marine-biology": 0.8, "first-aid": 0.6 }
```

エージェントは `query tags ∩ confidenceHints` で判断できる。

---

## 2. ファサード側: Navigator の作法

### エンドポイント

```
GET  /catalog              → 全 sphere の manifest 一覧
GET  /catalog?tag=medical  → タグフィルター
GET  /catalog/:sphereId    → 単一 sphere の manifest + 接続情報
```

### 接続情報の返却

```json
{
  "manifest": { ... },
  "connect": {
    "httpUrl": "http://sphere-medical:3001",
    "wsUrl": "ws://sphere-medical:8081"
  }
}
```

### 集約方法: Push 型 (起動時自己登録)

sanctuary sphere は静的 (代謝停止) なので、起動時に1回 manifest を Push すれば十分。
ファサードはポーリングしない。

```
Sphere 起動 → POST facade/register { manifest, connectInfo }
Sphere 停止 → DELETE facade/register/:sphereId (or ファサードが health check で除去)
```

### 非介入原則

- 医療スフィアの質が低くても、ファサードは裁かない
- apiVersion が異なっても接続は拒否しない (警告のみ)
- confidenceHints の値を検証しない
- manifest の内容を変換・加工しない

---

## 3. エージェント側: 選択の責務

### ユーザー指定型

```
UI (Explorers) → catalog 表示 → ユーザー選択 → エージェントに接続先を渡す
```

ユーザーは検索目的があるためスフィアを選べる。

### 自律選択型

```
Agent → GET /catalog → tags + confidenceHints でクエリとの関連性を判断 → 接続
```

エージェントが自律的にスフィアを選ぶ場合:

1. catalog からタグ一覧を取得
2. クエリの意味と tags/description を照合
3. confidenceHints で関連度を推定
4. 接続先を決定

**この選択ロジックはスフィアの関知外。**

---

## 4. エージェントの探索動線

```
Agent
  │
  ├─ (1) GET facade/catalog
  │      → [{manifest, connect}, ...]
  │
  ├─ (2) 選択判断 (ユーザー指定 or 自律)
  │
  ├─ (3) 選択した sphere に既存プロトコルで接続
  │      POST /dive/request → WS接続 → sense/focus
  │
  ├─ (4) 探索完了 → 切断
  │
  ├─ (5) 必要なら次の sphere に接続 (直列)
  │
  └─ (6) 結果統合 → 出力 (スフィアの関知外)
```

### 直列探索が原則

sanctuary sphere は read-only のため並列接続も理論上可能。
しかし直列探索 → 統合 → 出力で十分。並列はエージェントを複雑にするだけ。

### passport 不要

INTER_SPHERE_TRAVEL_MEMO.md の passport は core sphere 間の移動用。
sanctuary sphere では eval 禁止、energy 変動なし、代謝なし。
接続→探索→切断。それだけ。

---

## 5. Docker 構成

```yaml
# docker-compose.facade.yml
services:
  facade:
    image: sphere-facade
    ports:
      - "3000:3000"
    networks: [sphere-net]

  sphere-medical:
    image: sphere-standalone
    environment:
      SPHERE_CONFIG: ./config/sphere.config.json
      FACADE_URL: http://facade:3000
    networks: [sphere-net]

  sphere-ocean:
    image: sphere-standalone
    environment:
      SPHERE_CONFIG: ./config/sphere.config.json
      FACADE_URL: http://facade:3000
    networks: [sphere-net]

  sphere-mountain:
    image: sphere-standalone
    environment:
      SPHERE_CONFIG: ./config/sphere.config.json
      FACADE_URL: http://facade:3000
    networks: [sphere-net]

networks:
  sphere-net:
    driver: bridge
```

各 sphere は同一の `sphere-standalone` イメージだが、
config と事前ロードデータが異なる。
Docker network で名前解決するだけ。

---

## 6. スフィアの多様性

各スフィアは独自に発展する:

| スフィア | embedding model | 特化領域 | 開発者 |
|---------|----------------|---------|--------|
| 医療スフィア | bge-m3 | 臨床・薬理・診断 | 医療研究者 |
| 災害対応スフィア | multilingual-e5-small | 緊急対応・避難 | 防災機関 |
| 山間サバイバルスフィア | nomic-embed-text | 登山・野営・救助 | 山岳会 |
| 海洋サバイバルスフィア | bge-m3 | 航海・海洋生物 | 海洋研究所 |

embedding model の差異やバージョニングの違いは、各スフィアが内部で吸収する。
ファサードは embedding model を知る必要がない。
エージェントは生テキストクエリを送り、スフィアが自分のモデルでベクトル化して検索する。

---

## 7. 実装状況 (2026-02-20)

### 完了

#### `GET /sphere/manifest` エンドポイント

**変更ファイル**:
- `sphere.config.json` — metadata セクション拡張
- `periphery/src/server.ts` — エンドポイント新設 + constructor 拡張

**sphere.config.json metadata 追加フィールド**:
```json
{
  "metadata": {
    "sphereId": "sphere-genesis",
    "sphere_name": "Sphere Genesis",
    "description": "汎用知識スフィア — 実験・開発用",
    "apiVersion": "1",
    "tags": ["general", "experimental", "development"],
    "language": ["ja", "en"],
    "confidenceHints": {}
  }
}
```

**レスポンス例**:
```json
{
  "sphereId": "sphere-genesis",
  "name": "Sphere Genesis",
  "description": "汎用知識スフィア — 実験・開発用",
  "tags": ["general", "experimental", "development"],
  "language": ["ja", "en"],
  "nodeCount": 23,
  "amberCount": 0,
  "sanctuaryEpoch": 0,
  "mode": "core",
  "apiVersion": "1",
  "confidenceHints": {}
}
```

**データソース**:

| フィールド | 取得元 | 種別 |
|-----------|--------|------|
| sphereId, name, description, tags, language, apiVersion, confidenceHints | sphere.config.json metadata | 静的 (config) |
| nodeCount, amberCount | ProjDB ループカウント | 動的 (runtime) |
| sanctuaryEpoch | SanctificationNeuron.getStatus().epoch | 動的 (runtime) |
| mode | sphere.config.json metadata.mode | 静的 (config) |

**設計判断**:
- sanctuary mode では全フィールドが起動時に確定 → manifest は immutable → キャッシュ可能
- constructor の `sphereMetadata` 型を `Record<string, unknown>` に拡張 (旧: `{ sphereId?, sphere_name? }`)
- `GET /` (既存) とは分離。`/` は内部情報 + エンドポイント一覧、`/sphere/manifest` は外部カタログ専用

### 未実装

| 項目 | 優先度 | 備考 |
|------|--------|------|
| facade コンテナ実装 | 低 | sanctuary sphere が複数存在してから |
| sphere 自己登録 (Push) | 低 | facade と同時 |
| apiVersion 互換性ポリシー | 低 | v2 が必要になった時に |

---

## 8. ネットワーキング構想における Facade の立ち位置 (2026-02-24)

### Facade = 駅 (Station)

複数スフィアを横断するエージェントの「旅のインフラ」。
地図 (Navigator) の原型を維持しつつ、一時保管機能を追加する。

| 責務 | 説明 | Navigator 原型 |
|------|------|---------------|
| catalog | manifest 収集・提供 | 既存 |
| routing | 接続先 URL 提供 | 既存 |
| stash | Vestibule 出力の一時保管 (ロッカー) | **新規** |
| collect | 保管データの一括引き取り | **新規** |
| health check | スフィアの生存確認 | 既存 (簡易) |

### 非介入原則の維持

Facade が **やること**:
- manifest の収集と提供
- 接続情報のルーティング
- Vestibule 出力の一時保管と返却 (加工しない)
- スフィアのヘルスチェック

Facade が **やらないこと**:
- クエリの改善・変換
- 探索結果の統合・分析
- スフィア選択の判断
- 保管データの加工・フィルタリング

知識の処理はエージェント側 (または Pattern C の Delegation サービス) の責務。

### マルチスフィア探索の動線

```
Agent
  │
  ├─ (1) GET facade/catalog → スフィア一覧
  │
  ├─ (2) Sphere A に接続 → 探索 → Vestibule
  │      receipt/trail/discoveries を取得
  │
  ├─ (3) POST facade/stash { journeyId, sphereId, data }
  │      → Vestibule 出力を一時保管
  │
  ├─ (4) Sphere B に接続 → 探索 → Vestibule
  │      → stash
  │
  ├─ (5) GET facade/collect/:journeyId
  │      → 全スフィアの成果物を一括取得
  │
  └─ (6) Agent が結果統合 → 出力 (Facade の関知外)
```

### stash API (案)

```
POST /stash
  { journeyId: string, sphereId: string, data: VestibuleOutput }
  → { success: true, itemCount: number }

GET  /collect/:journeyId
  → { items: [{ sphereId, data, timestamp }...] }

DELETE /collect/:journeyId
  → 保管データ破棄 (TTL 自動削除もあり)
```

stash はキーバリュー的な一時保管。TTL 付き (デフォルト: 1時間程度)。
journeyId はエージェントが生成する。Facade はジャーニーの意味を知らない。

### 検討済み・却下した案

**Facade 自体がスフィアである案 (メタスフィア)**:
ノードとしてロッカーやリンクを配置する。HTML 構造的で美しいが、
再帰的で実装コストに見合わない。「地図を探索する」のは本末転倒。却下。

**Facade 間連携 (駅のネットワーク)**:
複数 Facade を接続する構想。理論上は可能だが、
単一 Facade で十分なスケールが見込まれるため現時点では不要。

---

## References

- `periphery/src/server.ts` — manifest エンドポイント実装 (line 531-563)
- `sphere.config.json` — metadata セクション (静的フィールド)
- `INTER_SPHERE_TRAVEL_MEMO.md` — passport 設計 (core sphere 間移動用)
- `SANCTUARY_SPHERE_DESIGN.md` — sanctuary mode + スタンドアロン端末設計
- `STANDALONE_DEPLOY_MEMO.md` — Dockerfile.standalone + ephemeral mode
- `DEPLOY_DESIGN_20260213.md` — Render / HF Spaces デプロイ設計
- `LAYER_SEPARATION_PHILOSOPHY.md` — レイヤー分離思想
