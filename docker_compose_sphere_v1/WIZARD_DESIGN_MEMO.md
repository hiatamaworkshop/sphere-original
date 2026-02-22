# Sphere Data Wizard - 大量データ処理装置
**Date**: 2026-02-01
**Status**: Discussion / Design Phase

---

## 概要

外部サービスがSphereにデータを流し込む際の**ウィザード形式プログラム**。
新規開発者がAPIを通じてSphereのコンフィグデータを取得し、
外部サービスが自動で座標モデル・データスキーマを読み込む仕組み。

---

## 本質：ウィザードとは「聖域化」である

### Wizardの真の役割

```
Wizard作成 = SanctuaryBundle生成 = 聖域の凍結
```

Wizardでデータを準備してSphereに投入する行為は、
単なる「データベース初期化」ではない。

**それは「聖域」を作ることに他ならない。**

### 3層構造における位置づけ

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Journey: Tutorial → Sanctuary → Core → Return       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Tutorial（練習）                                           │
│    - 評価は破棄                                             │
│    - SanctuaryBundleを使用                                  │
└─────────────────────────────────────────────────────────────┘
                              │ 共有
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Sanctuary（聖域）  ◀━━━ Wizardが作るのはココ              │
│    - ReadOnly（評価不可）                                   │
│    - SanctuaryBundle = 凍結されたスナップショット           │
│    - オフライン・ポータブル動作可能                         │
│    - CleanerFish不在（代謝が止まっている）                  │
└─────────────────────────────────────────────────────────────┘
                              │ 遷移
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Core（ライブ）                                             │
│    - 評価が受肉される                                       │
│    - tick による代謝                                        │
│    - RefDB + ProjDB（ライブ）                               │
└─────────────────────────────────────────────────────────────┘
```

### SanctuaryBundle とは

```typescript
interface SanctuaryBundle {
  version: number;           // バージョン
  frozenAt: number;          // 凍結時刻
  signature: string;         // 署名（改ざん検証）
  sourceCore: string;        // ソースCore識別子

  nodes: SanctuaryNode[];    // 凍結されたノード群

  metadata: {
    nodeCount: number;
    relicCount: number;      // Relic（永続の知恵）
    amberCount: number;      // Amber（結晶化した知識）
    activeCount: number;     // Active（凍結時点のアクティブ）
    description?: string;
  };
}
```

**SanctuaryBundle = 自己完結した ROM イメージ**
- ネットワーク接続不要
- ローカルで完全動作
- USB / ダウンロード配布可能
- 組み込み・エッジデバイス対応

### RefDB / ProjDB の新解釈

```
┌─────────────────────────────────────────────────────────────┐
│  ReferenceDB（不変層）                                       │
│    - Relic ノード（永続、先人の知恵）                        │
│    - 受肉済みノードの実データ（payload, vector）             │
└─────────────────────────────────────────────────────────────┘
            │
            │ スナップショット抽出
            ▼
┌─────────────────────────────────────────────────────────────┐
│  SanctuaryBundle  ◀━━━ Wizardの成果物                      │
│    - RefDB + ProjDB からの抽出                               │
│    - Relic + 選定された Amber/Active                        │
│    - 署名付き、凍結、改ざん不可                              │
└─────────────────────────────────────────────────────────────┘
```

### 聖域凍結の社会的意義

**1. 新参者への公平性**
```
誰もが同じ基盤から始められる
先に来た者だけが有利にならない
= 「共通の出発点」
```

**2. 評価の検証可能性**
```
「あの時、我々は何を価値あるとしたか」の証拠
後から検証可能な「基準」
= ある時点での合意の記録
```

**3. 探索の自由**
```
評価が反映されない = 失敗を恐れずに探索できる
「まず知ってから判断」を可能に
= 知識への敷居を下げる
```

**4. 知恵の継承**
```
成熟した聖域 = 「その時代の知恵の結晶」
後続世代が成熟状態からスタートできる
= 車輪の再発明を防ぐ
```

**5. 分岐と多様性**
```
凍結された聖域は Fork/Merge の対象になる
異なるコミュニティが独自の Core を育てる
= 知識の多様な進化を許容
```

### 本質

```
聖域の凍結とは:

  「今この瞬間の合意」を
  「未来の誰か」のために
  保存すること

変化し続ける世界で
変わらない基準点を作ること

それは図書館であり
博物館であり
憲法である
```

---

## 初期データ設定 vs 聖域化：似て非なる概念

### 二つの操作

| 操作 | 方向 | 入力 | 出力 |
|------|------|------|------|
| **初期データ設定** | 外 → 内 | 外部データ（CSV等） | SanctuaryBundle |
| **聖域化** | 内 → 外 | 成熟したCore | SanctuaryBundle |

### 図解

```
┌─────────────────────────────────────────────────────────────────────┐
│  【初期データ設定】                                                  │
│                                                                      │
│  [外部データ]                                                        │
│      │                                                              │
│      │  Wizard処理                                                  │
│      │  (変換 → 検証 → Embedding)                                  │
│      │                                                              │
│      ▼                                                              │
│  [SanctuaryBundle] ─────→ 新規Sphere誕生                           │
│                                                                      │
│  ※「先人の知恵」を持ち込む                                          │
│  ※ Coreはまだ存在しない                                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  【聖域化】                                                          │
│                                                                      │
│  [成熟したCore]                                                      │
│      │                                                              │
│      │  スナップショット抽出                                        │
│      │  (凍結 → 署名 → パッケージ)                                 │
│      │                                                              │
│      ▼                                                              │
│  [SanctuaryBundle] ─────→ 配布・Fork・継承                         │
│                                                                      │
│  ※「育てた知恵」を凍結する                                          │
│  ※ Coreは継続稼働                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 共通点

| 観点 | 共通 |
|------|------|
| **成果物** | SanctuaryBundle（同一形式） |
| **データ構造** | SanctuaryNode[]（同一スキーマ） |
| **署名・検証** | 同じプロセス |
| **利用形態** | オフライン・ポータブルROM |
| **配布可能性** | USB/ダウンロード/Fork対象 |
| **Wizard使用** | どちらもWizardを経由 |

### 相違点

| 観点 | 初期データ設定 | 聖域化 |
|------|---------------|--------|
| **データの起源** | 外部（CSV、API、他システム） | 内部（自身のCore） |
| **Coreの状態** | 存在しない（これから作る） | 成熟済み（継続稼働） |
| **知恵の性質** | 先人の知恵（inherited） | 育てた知恵（cultivated） |
| **時間軸** | Sphere誕生前 | Sphere成熟後 |
| **主な目的** | 「立ち上げ」 | 「継承・配布」 |

### 本質的な違い

```
初期データ設定:
  「誰かが蓄積した知恵」を
  「新しいSphere」に持ち込む

  = 知恵の「移植」

聖域化:
  「自分たちが育てた知恵」を
  「未来の誰か」のために凍結する

  = 知恵の「結晶化」
```

### ライフサイクルにおける位置

```
      初期データ設定
            │
            ▼
┌───────────────────────┐
│    Sphere 誕生        │
│    (SanctuaryBundle)  │
└───────────────────────┘
            │
            │ エージェント活動
            │ 評価の蓄積
            │ 代謝と成長
            ▼
┌───────────────────────┐
│    Core 成熟          │
│    (RefDB + ProjDB)   │
└───────────────────────┘
            │
            │ 聖域化
            ▼
┌───────────────────────┐
│    SanctuaryBundle    │
│    (凍結スナップ)     │
└───────────────────────┘
            │
            ├──→ 配布（他者へ）
            ├──→ Fork（派生Sphere）
            └──→ 継承（次世代へ）
```

### なぜ同じ形式なのか？

```
SanctuaryBundle という統一形式は:

  「どこから来た知恵か」を問わない

  - 先人から受け継いだものも
  - 自分たちで育てたものも

  同じ「聖域」として尊重される

  これにより:
  - 知恵の出自による差別がない
  - 継承と創造が等価に扱われる
  - 多様な知恵が同じ土俵で共存できる
```

---

## ユースケース

| 操作 | 説明 |
|------|------|
| **新規Sphere生成** | 初期データ群のベクトル付与 → SanctuaryBundle生成 |
| **聖域化** | 成熟Core → スナップショット → SanctuaryBundle生成 |
| **Sphereマージ** | 複数SanctuaryBundle統合 → 新座標モデル → 統合Bundle |
| **Modelアップグレード** | 既存Bundle → 新Model → 全再Embedding → 新Bundle |

---

## Wizardフロー（6ステップ）

```
┌─────────────────────────────────────────────────────────────┐
│  SPHERE DATA WIZARD                                         │
│  ─────────────────                                          │
│                                                             │
│  Step 1: Schema    [✓] スフィアのデータ形式取得              │
│  Step 2: Model     [✓] Embedding Model確認/DL               │
│  Step 3: Validate  [✓] 持ち込みデータ検証                    │
│  Step 4: Embed     [▶] ベクトル付与バッチ処理  ████░░ 67%   │
│  Step 5: Package   [ ] {RefDB, ProjDB}生成                  │
│  Step 6: Deploy    [ ] Bookkeeper統合                       │
│                                                             │
│  [セーブポイント: step4_checkpoint_20240201.json]           │
│                                                             │
│  [ Cancel ]                    [ Pause ] [ Resume ]         │
└─────────────────────────────────────────────────────────────┘
```

### Step詳細

| Step | 名称 | 処理内容 | 長時間処理 |
|------|------|----------|-----------|
| 1 | Schema | API経由でSphereのデータスキーマ取得 | No |
| 2 | Model | Embedding Modelの確認・ダウンロード | Maybe |
| 3 | Validate | 持ち込みデータの形式検証 | No |
| 4 | Embed | ベクトル付与バッチ処理 | **Yes** |
| 5 | Package | {RefDB, ProjDB}セット生成 | Maybe |
| 6 | Deploy | Bookkeeperに渡して統合処理 | No |

---

## セーブポイント設計（重要）

Step 4が長時間処理になるため、**中断・再開**が必須。

```typescript
interface WizardCheckpoint {
  // === 進捗状態 ===
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;

  // === Step 4 途中経過（最も長い処理）===
  embedProgress?: {
    totalRecords: number;
    processedRecords: number;
    lastProcessedId: string;
    partialOutput: string;  // 途中までの結果ファイルパス
  };

  // === 取得済み設定 ===
  schema: SphereSchema;
  modelId: string;
  modelPath: string;

  // === タイムスタンプ ===
  startedAt: number;
  lastSavedAt: number;
}
```

### チェックポイント保存タイミング
- Step完了時
- Step 4: N件ごと（例: 1000件）
- 明示的なPause操作時

---

## データフロー

```
[User Data]
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  WIZARD                                                      │
│                                                              │
│  [Step 1] GET /sphere/schema ──────────────────────────────┐ │
│                                                             │ │
│  [Step 2] Download Model (if needed)                        │ │
│           - Xenova/all-MiniLM-L6-v2                         │ │
│           - or specified model                              │ │
│                                                             │ │
│  [Step 3] Validate Records                                  │ │
│           - tags: string[]                                  │ │
│           - summary: string                                 │ │
│           - content?: string  (v3: "payload")               │ │
│           - flags: number                                   │ │
│                                                             │ │
│  [Step 4] Batch Embedding ──────────────────────────────── │ │
│           - tags → vector (384dim or configured)            │ │
│           - Save checkpoint every N records                 │ │
│                                                             │ │
│  [Step 5] Generate DBs                                      │ │
│           - RefDB: nodes with vectors                       │ │
│           - ProjDB: evaluation/projection data              │ │
│                                                             │ │
│  [Step 6] POST /sphere/upstream ────────────────────────── │ │
│           - Bookkeeper integration                          │ │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
[Live Sphere]
```

---

## オフライン・アップグレード・ジョブ

座標再計算（Sphereマージ、Modelアップグレード）は**全データ再Embedding**が必要。
安全のため**オフラインジョブ**として定義。

```
[Live Sphere v1] ──────────────────────────────────→
                         │
                    [Export RefDB]
                         │
                         ▼
              ┌──────────────────────┐
              │  OFFLINE JOB        │
              │  - New Model DL     │
              │  - Re-embed ALL     │  ← 時間かかる
              │  - Generate RefDB   │
              │  - Generate ProjDB  │
              └──────────────────────┘
                         │
                         ▼
[Live Sphere v2] ◀──── Deploy ────────────────────→
```

### ジョブ種別

| Job Type | Trigger | 処理内容 |
|----------|---------|----------|
| `sphere_init` | 新規Sphere作成 | 初期データ → {RefDB, ProjDB} |
| `sphere_merge` | 複数Sphere統合 | RefDB群 → 新Model → 統合RefDB |
| `model_upgrade` | Embedding更新 | 既存RefDB → 新Model → 新RefDB |

---

## API設計（案）

### 統一エンドポイント設計

初期データ設定と聖域化（差分更新）は**同一エンドポイント**で処理。
外部サービスは座標（vector）完成済みのデータを用意する。

```
┌─────────────────────────────────────────────────────────────┐
│  POST /sphere/upstream                                       │
│                                                              │
│  mode: "init"   → 空のSphereに初期投入                      │
│  mode: "update" → 既存Coreへの差分/マージ                   │
│                                                              │
│  どちらも同じ VectorizedRecord[] ストリームを受け取る       │
└─────────────────────────────────────────────────────────────┘
```

### Schema取得
```
GET /sphere/schema
Response: {
  schemaVersion: number,
  vectorDimension: number,
  modelId: string,
  seedRecordFormat: { ... },
  constraints: { ... }
}
```

### Upstream（統一データ投入）
```
POST /sphere/upstream
Headers:
  X-Service-Id: string
  X-Service-Secret: string
Body: {
  mode: "init" | "update",    // ← フラグのみで判断
  records: VectorizedRecord[] // 座標完成済みデータ
}
Response: {
  success: boolean,
  processed: number,
  errors?: string[]
}
```

### Downstream（SanctuaryBundle出力）
```
GET /sphere/downstream
Headers:
  X-Service-Id: string
  X-Service-Secret: string
Response: SanctuaryBundle  // 配布用凍結スナップショット
```

---

## SeedRecord形式

ExperienceCapsuleより平坦な形式（bulk用）。

```typescript
interface SeedRecord {
  // === 必須 ===
  tags: string[];           // → vectorized
  summary: string;          // L2: headline
  flags: number;            // 16-bit NodeFlag

  // === optional ===
  content?: string;         // L3: detail (v3: "payload")
  sourceNodeId?: string;    // knowledge lineage
  // Note: initialHeat removed in v4 — heat starts from config.baseHeat
  // Note: tier determined by importance field in source data
}
```

### JSONL形式（推奨）
```jsonl
{"tags":["AI","ethics"],"summary":"AI safety principles","content":"Detailed text here","flags":2,"importance":0.9}
{"tags":["physics","quantum"],"summary":"Quantum entanglement basics","flags":0,"importance":0.6}
```

---

## 外部サービス開発者向け：データ準備動線

外部サービス（Wizard）がSphereにデータを流し込む際の具体的な動線。

### 動線概要

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. SPHERE API から設定取得                                         │
│     GET /sphere/schema                                              │
│     └─→ vectorDimension, modelId, constraints を取得               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. ユーザーデータの準備（外部サービスの責務）                        │
│     - CSVやJSONから SeedRecord 形式に変換                           │
│     - constraints に従った検証                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. Embedding Model のダウンロード（外部サービスの責務）              │
│     - modelId に基づいてローカルにDL                                │
│     - 例: Xenova/all-MiniLM-L6-v2 (384dim)                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. ベクトル付与（外部サービスの責務）                                │
│     - tags → vector 変換（バッチ処理）                              │
│     - SeedRecord + vector = VectorizedRecord                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. SPHERE API へ投入                                               │
│     POST /sphere/upstream                                           │
│     └─→ Bookkeeper が受け取り、RefDB/ProjDB に統合                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Step 1: Schema取得（APIレスポンス例）

```json
{
  "schemaVersion": 1,
  "vectorDimension": 384,
  "modelId": "Xenova/all-MiniLM-L6-v2",
  "seedRecordFormat": {
    "required": ["tags", "summary", "initialHeat", "flags"],
    "optional": ["payload", "sourceNodeId", "tier"]
  },
  "constraints": {
    "maxSummaryLength": 500,
    "maxPayloadBytes": 4096,
    "maxTagsPerNode": 10,
    "tagMaxBytes": 64,
    "heatRange": [0, 100],
    "validFlags": [0, 1, 2, 4, 8, 16, 32, 64]
  }
}
```

### Step 2: ユーザーデータの変換

**入力例（ユーザーが用意するCSV）:**
```csv
title,description,category,importance
AI安全性原則,AIシステムの安全な設計について,AI/倫理,high
量子もつれ入門,量子物理学の基礎概念,物理/量子,medium
```

**変換後（SeedRecord形式 JSONL）:**
```jsonl
{"tags":["AI","倫理","安全性"],"summary":"AI安全性原則","content":"AIシステムの安全な設計について","flags":2,"importance":0.9}
{"tags":["物理","量子","入門"],"summary":"量子もつれ入門","content":"量子物理学の基礎概念","flags":0,"importance":0.5}
```

**変換ロジック（外部サービスが実装）:**
- `category` → `tags`（スラッシュ区切りを配列に）
- `title` → `summary`
- `description` → `content` (v3: "payload")
- `importance` → 0.0-1.0 float（0.85+: topTier, 0.5-0.84: normal, <0.5: ghost）

### Step 3: Model ダウンロード

```typescript
// 外部サービス側の実装例
import { pipeline } from '@xenova/transformers';

const modelId = schema.modelId;  // "Xenova/all-MiniLM-L6-v2"

// 初回はダウンロード、2回目以降はキャッシュ利用
const embedder = await pipeline('feature-extraction', modelId);
```

### Step 4: ベクトル付与

```typescript
// 外部サービス側の実装例
interface VectorizedRecord extends SeedRecord {
  vector: number[];  // 384次元（modelIdに依存）
}

async function embedRecord(record: SeedRecord): Promise<VectorizedRecord> {
  // tags を結合してembedding
  const text = record.tags.join(' ');
  const output = await embedder(text, { pooling: 'mean', normalize: true });

  return {
    ...record,
    vector: Array.from(output.data)
  };
}

// バッチ処理（チェックポイント対応）
for (let i = checkpoint.processedRecords; i < records.length; i++) {
  const vectorized = await embedRecord(records[i]);
  outputFile.write(JSON.stringify(vectorized) + '\n');

  if (i % 1000 === 0) {
    saveCheckpoint({ processedRecords: i, ... });
  }
}
```

### Step 5: Sphere APIへ投入

```typescript
// 外部サービス側の実装例
const response = await fetch('http://sphere:3001/sphere/upstream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Service-Id': 'data-wizard',
    'X-Service-Secret': process.env.WIZARD_SECRET
  },
  body: JSON.stringify({
    source: 'stream',
    records: vectorizedRecords  // VectorizedRecord[]
  })
});
```

### 責務分担まとめ

| 責務 | 担当 | 備考 |
|------|------|------|
| Schema/Constraints定義 | **Sphere** | APIで提供 |
| ユーザーデータ変換 | **外部サービス** | CSV→SeedRecord等 |
| Embedding Model管理 | **外部サービス** | DL・キャッシュ |
| ベクトル付与処理 | **外部サービス** | バッチ処理 |
| チェックポイント管理 | **外部サービス** | 中断・再開 |
| データ受け入れ・統合 | **Sphere** | Bookkeeper |

### なぜSphere側でEmbeddingしないのか？

1. **計算コスト**: 大量データのEmbeddingは重い処理
2. **Model柔軟性**: 外部サービスが最適なModelを選択可能
3. **オフライン処理**: Sphereは常時稼働、Wizardはバッチ実行
4. **責務分離**: Sphereは「受け入れ」、外部は「準備」

---

## DB設計：単一DB + フラグベース抽出

### 設計原則

```
Core（唯一の真実源）
  ├── RefDB: sanctuary フラグ付きノード（可変）
  └── ProjDB: インメモリ metrics（刻々と変動）
              ↓
       GET /sphere/downstream
       (sanctuary=true のみ抽出 + metrics凍結)
              ↓
       SanctuaryBundle（凍結スナップショット）
```

### サーバー上での cachedBundle

```
サーバーメモリ:
  - RefDB（永続）
  - ProjDB（インメモリ、ライブ）
  - cachedBundle（単一キャッシュ）← 全セッション共有

層による読取先:
  Tutorial/Sanctuary → cachedBundle（frozenMetrics）
  Core → RefDB + ProjDB（ライブ値）
```

**利点:**
- DB は 1組のみ（Core 用）
- Bundle は単一キャッシュ（セッションごとに複製しない）
- 層フラグで読取先を切替

---

## ProjDB データ定義と frozenMetrics

### ProjDB（ライブ）で保持

```typescript
interface ProjDBEntry {
  nodeId: string;

  // === 代謝に関わる指標 ===
  heat: number;       // 活性度
  weight: number;     // 重要度
  ttl: number;        // 残り寿命
  decay: number;      // 減衰率

  // === 行動追跡 ===
  traversal: number;  // 通過回数
  stayTime: number;   // 滞在時間累計

  // === 状態 ===
  flags: number;
  lastAccessed: number;
  createdAt: number;
}
```

### SanctuaryBundle に抽出（frozenMetrics）

```typescript
interface FrozenMetrics {
  weight: number;  // 凍結時点の重要度
  heat: number;    // 凍結時点の活性度
}
```

### 除外理由

| 指標 | 聖域で不要な理由 |
|------|------------------|
| `ttl` | CleanerFish不在、ノード消滅なし |
| `decay` | 代謝停止、減衰計算なし |
| `traversal` | 参照用（凍結値で十分） |
| `stayTime` | 参照用（凍結値で十分） |
| `lastAccessed` | 更新なし（ReadOnly） |

**効果:** Bundle サイズ大幅削減（metrics 2項目のみ）

---

## スケーラビリティ

### メモリ使用量試算

```
ノード 1件あたり:
  - vector: 384次元 × 4bytes = 1,536 bytes
  - id + payload + frozenMetrics: ~500 bytes
  - 合計: ~2KB / node

データ量別:
  10,000 nodes  → ~20MB
  100,000 nodes → ~200MB
  1,000,000 nodes → ~2GB
```

### 規模別戦略

| 規模 | 戦略 |
|------|------|
| ~100K nodes | 全 Bundle メモリ保持（現設計） |
| 100K~1M nodes | インデックス + 遅延ロード |
| 1M+ nodes | 階層キャッシュ + pagination |

**sanctuary フラグ選定**により Bundle サイズを抑制可能。

---

## 検討事項

- [ ] Step 4のバッチサイズ最適化（メモリ vs 速度）
- [ ] チェックポイントの保存場所（ローカル vs クラウド）
- [ ] エラーリカバリ戦略（retry回数、スキップポリシー）
- [ ] 進捗通知方式（WebSocket push vs polling）
- [ ] Sphereマージ時の重複ノード処理ポリシー
- [ ] Model互換性チェック（異なるdimension間の変換可否）
- [ ] cachedBundle 更新トリガー設計
- [ ] 大規模時の遅延ロード実装

---

## 参考

- `config_design.md`: Sphere設定全体の設計
- `services/periphery/src/types/capsule.ts`: ExperienceCapsule定義
- `services/periphery/src/types/config.ts`: PeripheryConfig定義
- `services/periphery/src/rulebook/index.ts`: 制約定義
