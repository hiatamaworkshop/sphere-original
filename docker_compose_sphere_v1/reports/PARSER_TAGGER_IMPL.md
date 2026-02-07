# Parser & Tagger 実装案

Sphere Project - 座標モデル実装

---

## 1. 責務の明確化

### Parser と Tagger は別のタイミングで動作する

| コンポーネント | タイミング | 入力 | 出力 | 用途 |
|--------------|-----------|------|------|------|
| **Parser** | **探索前** | Agent's request | 初期座標 | Agent の開始位置決定 |
| **Tagger** | **帰還時** | Discovery tags | ノード座標 | 発見物の配置決定 |

```
┌─────────────────────────────────────────────────────────────┐
│  探索前 (Dive Entry)                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Agent Request (Ticket + Mission)                            │
│    │                                                         │
│    ▼                                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Parser                                              │    │
│  │    │                                                 │    │
│  │    ├── mission → tags に分解                        │    │
│  │    │   "clustering algorithms" →                    │    │
│  │    │   ["clustering", "algorithm", "machine-learning"]   │
│  │    │                                                 │    │
│  │    ▼                                                 │    │
│  │  Embedding Model (Sentence-BERT)                    │    │
│  │    │                                                 │    │
│  │    ▼                                                 │    │
│  │  initialPosition: vector[384]                       │    │
│  └─────────────────────────────────────────────────────┘    │
│    │                                                         │
│    ▼                                                         │
│  SphereContext.spawn(initialPosition)                        │
│    │                                                         │
│    ▼                                                         │
│  Agent explores from this position...                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  帰還時 (Incarnation Pipeline)                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ExperienceCapsule                                           │
│    │                                                         │
│    ▼                                                         │
│  Membrane → Gatekeeper                                       │
│    │                                                         │
│    ▼                                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Tagger                                              │    │
│  │    │                                                 │    │
│  │    ├── discovery.tags を vectorize                  │    │
│  │    │   ["k-means", "convergence", "O(n)"]           │    │
│  │    │                                                 │    │
│  │    ▼                                                 │    │
│  │  Embedding Model (Sentence-BERT) ← 共通モデル       │    │
│  │    │                                                 │    │
│  │    ▼                                                 │    │
│  │  nodePosition: vector[384]                          │    │
│  └─────────────────────────────────────────────────────┘    │
│    │                                                         │
│    ▼                                                         │
│  Packer → Bookkeeper → SphereNode                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**共通点**: 両者とも同じ Embedding Model を使用
**相違点**: Parser は探索開始時、Tagger は帰還処理時

---

## 2. Parser 実装（探索前）

Parser はエージェントの**探索開始時**に使用される。
Request と Quest を解析し、2つの座標を決定する。

### 2.0 Request と Quest の分離

**重要**: Request と Quest は異なる座標を持つ可能性が高い。

```
Request: "データベースについて調べたい"     → 広い領域
Quest:   "PostgreSQL の JSONB パフォーマンス" → 狭い特定領域

→ 座標が全く異なる！
```

| 項目 | 説明 | 用途 |
|-----|------|------|
| `initialPosition` | Request 由来 | spawn 位置（どこから出発） |
| `questVector` | Quest 由来 | 探索目標（どこへ向かう） |

### 2.0.1 Entry Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Agent Entry Flow                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. クエスト閲覧                                                 │
│     └── Agent がクエスト一覧を見る                               │
│                                                                  │
│  2. 受諾決定                                                     │
│     └── Quest を選択、Request も確定                             │
│                                                                  │
│  3. パーサー（バッチ処理）                                       │
│     ┌─────────────────────────────────────────────┐             │
│     │  embedBatch([request, quest])                │             │
│     │      ↓                                       │             │
│     │  [initialPosition, questVector]              │             │
│     └─────────────────────────────────────────────┘             │
│     └── 1回の API 呼び出しで両方取得                             │
│                                                                  │
│  4. 琥珀ショーケース                                             │
│     └── initialPosition 周辺のノードをプレビュー                 │
│                                                                  │
│  5. チュートリアル世界                                           │
│     └── Dive 開始                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.0.2 処理フロー

```
Quest 受諾後:
    │
    ├── request: "データベースについて調べたい"
    ├── quest:   "PostgreSQL JSONB パフォーマンス"
    │
    ▼
Parser.parseDiveEntry(request, quest)
    │
    ├── embedBatch([request, quest])  ← 1回の呼び出し
    │
    ▼
{
  initialPosition: vector[384],  ← spawn 位置
  questVector: vector[384]       ← 探索目標
}
```

### 2.0.3 Atomic Entry バッチ処理

複数エージェントのリクエストを効率的にバッチ処理する際の設計原則。

**原則**: 1エージェントの Entry は分割不可の atomic unit

```
┌─────────────────────────────────────────────────────────────────┐
│  Atomic Entry 設計                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  問題: 複数エージェントのバッチ処理時に、誰のものかが混同       │
│        または request/quest が分断される危険                     │
│                                                                  │
│  解決: Entry を atomic unit として扱う                           │
│                                                                  │
│  Entry = {                                                       │
│    agentId: "agent-xyz",                                         │
│    texts: [request, quest],  // 1-2 items                        │
│  }                                                               │
│                                                                  │
│  バッチ処理ルール:                                               │
│    - MAX_TEXTS_PER_BATCH はテキスト数の上限（例: 16）            │
│    - Entry の途中でカットしない                                  │
│    - Entry を追加した結果、上限を超えそうなら                    │
│      → 現バッチを先に flush                                      │
│      → 新 Entry は次バッチへ                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**バッチ処理の例** (MAX_TEXTS_PER_BATCH = 8):

```
Buffer 状態:
  Entry A: [req, quest] → 2 texts
  Entry B: [req, quest] → 2 texts
  Entry C: [req, quest] → 2 texts
  ─────────────────────
  合計: 6 texts

Entry D: [req, quest] → 2 texts を追加しようとする
  → 6 + 2 = 8 ≤ MAX → OK、追加

Entry E: [req, quest] → 2 texts を追加しようとする
  → 8 + 2 = 10 > MAX → 先に flush、E は次バッチへ

結果: A,B,C,D が同時処理、E は次バッチ
      どのエージェントも分断されない
```

**実装クラス**:

| クラス | 用途 | 特徴 |
|-------|------|------|
| `ParserBuffer` | Dive Entry | Atomic Entry、agentId 追跡 |
| `TagBuffer` | Tagger | 単一テキスト、分断 OK |

```typescript
// ParserBuffer - Atomic Entry
const result = await parserBuffer.enqueueDiveEntry(
  agentId,    // 所有者
  request,    // 必須
  quest       // オプション
);
// → { agentId, request, quest, initialPosition, questVector }

// TagBuffer - 単一テキスト（Tagger 用）
const vector = await tagBuffer.enqueue(tagString);
// → number[]
```

### 2.0.4 Dual Timeout 設計

バッチ処理の待機時間を制御し、体験の遅延を最小化する。

**問題**: バッチサイズに達するまで待つと、低負荷時に遅延が蓄積

**解決**: 2つのタイムアウトで効率と応答性のバランスを取る

```
┌─────────────────────────────────────────────────────────────────┐
│  Dual Timeout 設計                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. idleTimeout (2000ms)                                        │
│     └── 最後の追加から N ms 無追加 → フラッシュ                 │
│     └── 低負荷時の応答性を確保                                  │
│                                                                  │
│  2. maxWaitTime (5000ms)                                        │
│     └── 最初のエントリから最大 N ms → 強制フラッシュ            │
│     └── 高負荷時でも遅延に上限を設ける                          │
│                                                                  │
│  3. maxTextsPerBatch (16)                                       │
│     └── テキスト数上限 → 即座にフラッシュ                       │
│     └── メモリ使用量を制限                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**タイムライン例**:

```
低負荷時 (idleTimeout が先に発火):
  t=0:     Entry A 追加 → idle開始, maxWait開始
  t=500:   Entry B 追加 → idle リセット
  t=1500:  Entry C 追加 → idle リセット
  t=3500:  idle 超過 (2000ms) → フラッシュ

  → 待機時間: 3500ms (A), 3000ms (B), 2000ms (C)

高負荷時 (maxWaitTime が先に発火):
  t=0:     Entry A 追加
  t=1900:  Entry B 追加 → idle リセット
  t=3800:  Entry C 追加 → idle リセット
  t=5000:  maxWait 超過 → 強制フラッシュ

  → 待機時間: 5000ms (A), 3100ms (B), 1200ms (C)
  → 最大待機は常に 5000ms 以下
```

**パフォーマンス見積もり**:

| 処理 | 時間 | 備考 |
|-----|------|------|
| Embedding (1 text) | ~5ms | all-MiniLM-L6-v2, CPU |
| Embedding (16 texts) | ~80ms | バッチ処理 |
| idleTimeout | 2000ms | 設定可能 |
| maxWaitTime | 5000ms | 設定可能 |

| シナリオ | 待機時間 | 合計レイテンシ |
|---------|---------|---------------|
| 低負荷（単独エントリ） | ~2000ms | ~2005ms |
| 中負荷（数エントリ） | ~2000-3000ms | ~2020-3040ms |
| 高負荷（連続エントリ） | ~5000ms | ~5080ms |

**設定値**:

```
┌─────────────────────────────────────────────────────────────────┐
│  ParserBuffer vs TagBuffer: 設計原則の違い                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ParserBuffer (Dive Entry):                                     │
│    - エージェントが待機する（同期）                              │
│    - 遅延 = UX 低下                                             │
│    → 応答性優先                                                 │
│                                                                  │
│  TagBuffer (Tagger):                                            │
│    - エージェントは待たない（非同期）                            │
│    - Capsule 提出 → エージェント離脱 → 後で処理                 │
│    - 遅延 = UX に無影響                                         │
│    → スループット優先（バッファ大きくても OK）                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```typescript
// ParserBuffer (Dive Entry) - 応答性優先
// エージェントは spawn 前に待機するため、遅延を最小化
{
  maxTextsPerBatch: 16,   // テキスト数上限
  idleTimeoutMs: 2000,    // 無追加でフラッシュ
  maxWaitTimeMs: 5000,    // 最大待機時間
}

// TagBuffer (Tagger) - 効率重視設計
// [理由] エージェントは Tagger 完了を待たない（非同期）
//        → バッファが大きくても UX に影響なし
//        → スループット最大化が正解
{
  batchSize: 32,          // 大きなバッチで効率化
  idleTimeoutMs: 5000,    // 5秒待機でより多く集約
  maxWaitTimeMs: 30000,   // 30秒 - 急ぐ必要なし、エージェントは去った
}
```

### 2.1 共通インターフェース

Parser と Tagger は同じ EmbeddingProvider を共有する。

**重要制約: ローカルモデルのみ使用可**

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️  API ベース Embedding 禁止                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ❌ 禁止:                                                        │
│     - OpenAI text-embedding-ada-002                             │
│     - Cohere embed-v3                                           │
│     - その他 API 呼び出しを必要とするモデル                      │
│                                                                  │
│  ✅ 許可:                                                        │
│     - @xenova/transformers (ローカル ONNX)                      │
│     - ort (ONNX Runtime)                                        │
│     - その他ローカル実行可能なモデル                             │
│                                                                  │
│  理由: 人間世界の資源を無駄にしない                              │
│        Sphere は自己完結したエコシステムであるべき               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```typescript
// embedding/embedding-provider.ts
export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getDimension(): number;
}
```

### 2.2 LocalEmbeddingProvider（新規）

```typescript
// parser/local-embedding-provider.ts
import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';

export interface LocalEmbeddingConfig {
  modelId: string;           // e.g., "Xenova/all-MiniLM-L6-v2"
  dimension: number;         // 384 or 768
  cacheDir?: string;         // モデルキャッシュディレクトリ
  quantized?: boolean;       // 量子化モデルを使用するか
}

export const DEFAULT_LOCAL_CONFIG: LocalEmbeddingConfig = {
  modelId: "Xenova/all-MiniLM-L6-v2",
  dimension: 384,
  quantized: true,
};

export class LocalEmbeddingProvider implements IEmbeddingProvider {
  private extractor: FeatureExtractionPipeline | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private config: LocalEmbeddingConfig = DEFAULT_LOCAL_CONFIG) {}

  /**
   * モデル初期化（遅延ロード）
   */
  async initialize(): Promise<void> {
    if (this.extractor) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log(`[Parser] Loading model: ${this.config.modelId}...`);

      this.extractor = await pipeline(
        'feature-extraction',
        this.config.modelId,
        { quantized: this.config.quantized }
      );

      console.log(`[Parser] Model loaded: ${this.config.dimension}-dim`);
    })();

    return this.initPromise;
  }

  /**
   * 単一テキストを埋め込み
   */
  async embed(text: string): Promise<number[]> {
    await this.initialize();

    const output = await this.extractor!(text, {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(output.data as Float32Array);
  }

  /**
   * バッチ埋め込み
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.initialize();

    // 並列処理（モデルによってはシーケンシャルの方が効率的な場合も）
    const results = await Promise.all(
      texts.map(text => this.embed(text))
    );

    return results;
  }

  /**
   * 次元数を取得
   */
  getDimension(): number {
    return this.config.dimension;
  }
}
```

### 2.3 Parser クラス（探索開始用）

```typescript
// parser/parser.ts
import type { IEmbeddingProvider } from "../embedding/embedding-provider";

export interface ParserConfig {
  provider: "mock" | "local";
  vectorDimension: number;
  modelId?: string;
}

export interface ParsedDiveEntry {
  request: string;
  quest?: string;
  initialPosition: number[];  // from request
  questVector?: number[];     // from quest (optional)
}

export class Parser {
  constructor(
    private provider: IEmbeddingProvider,
    private config: ParserConfig
  ) {}

  /**
   * Dive Entry 処理（メイン API）
   *
   * [用途] Quest 受諾後、Dive 直前に呼び出し
   * [効率] Request と Quest をバッチ処理（1回の API 呼び出し）
   *
   * @param request - Agent のリクエスト原文
   * @param quest - Quest 内容（オプション）
   */
  async parseDiveEntry(request: string, quest?: string): Promise<ParsedDiveEntry> {
    // バッチ構築
    const texts = [request];
    if (quest) texts.push(quest);

    // 1回の embedBatch で処理
    const vectors = await this.provider.embedBatch(texts);

    return {
      request,
      quest,
      initialPosition: vectors[0],
      questVector: quest ? vectors[1] : undefined,
    };
  }

  /**
   * ミッション文字列からタグを抽出（内部用）
   *
   * [Strategy] 単語分解 + ストップワード除去 + 正規化
   */
  private extractTags(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s\u3040-\u30ff\u4e00-\u9faf]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 1);

    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "about", "for", "with", "and", "or", "but", "in", "on", "at",
      "to", "of", "it", "this", "that", "which", "what", "how",
      "について", "したい", "する", "ある", "いる", "など"
    ]);

    return words.filter(w => !stopWords.has(w));
  }

  /**
   * タグ配列を座標ベクトルに変換（Tagger 共有用）
   */
  async vectorizeTags(tags: string[]): Promise<number[]> {
    const tagString = tags.join(" ");

    if (tagString.trim().length === 0) {
      return new Array(this.config.vectorDimension).fill(0);
    }

    return this.provider.embed(tagString);
  }

  /**
   * バッチ処理（Tagger 用）
   */
  async vectorizeTagsBatch(tagArrays: string[][]): Promise<number[][]> {
    const tagStrings = tagArrays.map(tags => tags.join(" "));
    return this.provider.embedBatch(tagStrings);
  }

  getVectorDimension(): number {
    return this.config.vectorDimension;
  }
}
```

### 2.4 Provider Factory

```typescript
// embedding/provider-factory.ts
import { IEmbeddingProvider, MockEmbeddingProvider } from "./embedding-provider";
import { LocalEmbeddingProvider, LocalEmbeddingConfig } from "./local-embedding-provider";

export type ProviderType = "mock" | "local";

export interface ProviderFactoryConfig {
  type: ProviderType;
  local?: LocalEmbeddingConfig;
}

export function createEmbeddingProvider(config: ProviderFactoryConfig): IEmbeddingProvider {
  switch (config.type) {
    case "mock":
      return new MockEmbeddingProvider();

    case "local":
      return new LocalEmbeddingProvider(config.local);

    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}
```

---

## 3. Tagger 実装（帰還時）

Tagger はエージェントの**帰還時**に使用される。
ExperienceCapsule 内の発見物（NodeSeed）を処理し、ノード座標を決定する。

```
ExperienceCapsule
    │
    ▼
Membrane → Gatekeeper (validation)
    │
    ▼
Tagger.tagCapsule()
    │
    ├── topTier: discovery.tags → vector (座標あり)
    ├── normal: タグ付けのみ (座標なし)
    ├── ghost: タグ付けのみ (座標なし)
    │
    ▼
TaggedCapsule → Packer → Bookkeeper → SphereNode
```

### 3.1 設計判断

```typescript
// topTier のみ vectorize（計算コスト最適化）
// - topTier: 高価値・長寿命 → 座標精度が重要
// - normal/ghost: 短命・低価値 → 座標は不要
```

### 3.2 Tagger 実装

```typescript
// tagger/tagger.ts
import type {
  ExperienceCapsule,
  TaggedCapsule,
  TaggedNodeSeed,
  NodeSeed,
} from "../types/capsule";
import type { Parser } from "../parser/parser";

/**
 * 空ベクトル（非 topTier 用）
 */
const EMPTY_VECTOR: number[] = [];

export class Tagger {
  constructor(private parser: Parser) {}

  /**
   * Capsule 内のノードにタグを付与し、topTier のみ vectorize
   *
   * [Design]
   * - topTier: 高価値 → vectorize (座標を持つ)
   * - normal/ghost: 軽量 → vectorize しない (座標なし)
   *
   * [Rationale]
   * - vectorize は計算コストが高い
   * - normal/ghost は短命なので座標精度は重要度低
   */
  async tagCapsule(capsule: ExperienceCapsule): Promise<TaggedCapsule> {
    // === TopTier: Vectorize ===
    const topTier = await this.tagAndVectorize(
      capsule.topTier,
      "top",
      0
    );

    // === Normal: No vectorization ===
    const normal = this.tagOnly(
      capsule.normalNodes,
      "normal",
      capsule.topTier.length
    );

    // === Ghost: No vectorization ===
    const ghost = this.tagOnly(
      capsule.ghostNodes,
      "ghost",
      capsule.topTier.length + capsule.normalNodes.length
    );

    console.log(
      `[Tagger] Tagged: ${topTier.length} top (vectorized), ` +
      `${normal.length} normal, ${ghost.length} ghost`
    );

    return { topTier, normal, ghost };
  }

  /**
   * タグ付け + ベクトル化（topTier 用）
   */
  private async tagAndVectorize(
    seeds: NodeSeed[],
    tier: "top",
    rankOffset: number
  ): Promise<TaggedNodeSeed[]> {
    if (seeds.length === 0) return [];

    // バッチ vectorize
    const tagArrays = seeds.map(seed => seed.tags);
    const vectors = await this.parser.vectorizeTagsBatch(tagArrays);

    return seeds.map((seed, i) => ({
      ...seed,
      tier,
      rank: rankOffset + i,
      vector: vectors[i],
    }));
  }

  /**
   * タグ付けのみ（normal/ghost 用）
   */
  private tagOnly(
    seeds: NodeSeed[],
    tier: "normal" | "ghost",
    rankOffset: number
  ): TaggedNodeSeed[] {
    return seeds.map((seed, i) => ({
      ...seed,
      tier,
      rank: rankOffset + i,
      vector: EMPTY_VECTOR,
    }));
  }
}
```

---

## 4. 設定

### 4.1 sphere.config.json 変更

```json
{
  "periphery": {
    "embedding": {
      "provider": "local",
      "vectorDimension": 384,
      "modelId": "Xenova/all-MiniLM-L6-v2",
      "quantized": true,
      "batchSize": 10,
      "flushTimeoutMs": 100
    }
  }
}
```

**Note**: `embedding` は Parser と Tagger の両方で共有される。

### 4.2 config.ts 変更

```typescript
// types/config.ts
export interface PeripheryConfig {
  // ...
  embedding: {
    provider: "mock" | "local";
    vectorDimension: number;
    modelId?: string;
    quantized?: boolean;
    batchSize: number;
    flushTimeoutMs: number;
  };
  // ...
}
```

---

## 5. 依存パッケージ

```json
{
  "dependencies": {
    "@xenova/transformers": "^2.17.0"
  }
}
```

### 5.1 インストール

```bash
cd services/periphery
npm install @xenova/transformers
```

### 5.2 モデルダウンロード

初回実行時に自動ダウンロード。または事前に:

```bash
# キャッシュディレクトリを指定して事前ダウンロード
npx transformers-cli download Xenova/all-MiniLM-L6-v2
```

---

## 6. 初期化フロー

```typescript
// index.ts での初期化例
import { createEmbeddingProvider } from "./embedding/provider-factory";
import { Parser } from "./parser/parser";
import { Tagger } from "./tagger/tagger";

async function initializePipeline(config: PeripheryConfig) {
  // 1. Embedding Provider 作成（Parser と Tagger で共有）
  const provider = createEmbeddingProvider({
    type: config.embedding.provider,
    local: {
      modelId: config.embedding.modelId || "Xenova/all-MiniLM-L6-v2",
      dimension: config.embedding.vectorDimension,
      quantized: config.embedding.quantized ?? true,
    },
  });

  // 2. Provider 初期化（モデルロード）
  if (provider instanceof LocalEmbeddingProvider) {
    await provider.initialize();
    console.log("[Periphery] Embedding model loaded");
  }

  // 3. Parser 作成（探索開始時に使用）
  const parser = new Parser(provider, {
    provider: config.embedding.provider,
    vectorDimension: config.embedding.vectorDimension,
    modelId: config.embedding.modelId,
  });

  // 4. Tagger 作成（帰還時に使用）
  const tagger = new Tagger(parser);

  return { parser, tagger };
}

// === 使用例 ===

// 探索開始時: Parser でエージェントの初期位置を決定
async function handleDiveEntry(agentMission: string) {
  const { tags, initialPosition } = await parser.parseRequest(agentMission);
  console.log(`[Parser] Agent spawn at: ${initialPosition.slice(0, 3)}...`);
  return SphereContext.spawn(initialPosition);
}

// 帰還時: Tagger で発見物のノード座標を決定
async function handleIncarnation(capsule: ExperienceCapsule) {
  const taggedCapsule = await tagger.tagCapsule(capsule);
  console.log(`[Tagger] Tagged ${taggedCapsule.topTier.length} discoveries`);
  return packer.pack(taggedCapsule);
}
```

---

## 7. 使用例

### 7.1 EmbeddingProvider 単体テスト

```typescript
const provider = new LocalEmbeddingProvider({
  modelId: "Xenova/all-MiniLM-L6-v2",
  dimension: 384,
});

await provider.initialize();

// 単一埋め込み
const vec1 = await provider.embed("clustering k-means optimization");
console.log(`Vector dimension: ${vec1.length}`);  // 384

// 類似度計算
const vec2 = await provider.embed("machine learning classification");
const similarity = cosineSimilarity(vec1, vec2);
console.log(`Similarity: ${similarity}`);
```

### 7.2 Parser（Dive Entry）

```typescript
// Quest 受諾後の処理
const request = "データベースについて調べたい";
const quest = "PostgreSQL JSONB パフォーマンス";

// バッチ処理で両方のベクトルを取得（1回の呼び出し）
const entry = await parser.parseDiveEntry(request, quest);

console.log(entry.initialPosition.length);  // 384 - spawn 位置
console.log(entry.questVector?.length);     // 384 - 探索目標

// Session に保存
const session: AgentSession = {
  request: entry.request,
  quest: entry.quest,
  initialPosition: entry.initialPosition,
  questVector: entry.questVector,
  createdAt: Date.now(),
  expiresAt: Date.now() + SESSION_TTL,
};

// エージェントを spawn
const agent = await sphereContext.spawn({
  position: entry.initialPosition,
  target: entry.questVector,  // 探索方向のヒント
});
```

### 7.3 Tagger（帰還時）

```typescript
// エージェント帰還時のカプセル処理
const capsule: ExperienceCapsule = {
  topTier: [
    {
      tags: ["clustering", "k-means", "convergence", "optimization"],
      summary: "K-means converges in O(n*k*i*d)",
      payload: "Detailed explanation of convergence proof...",
      initialHeat: 80,
      flags: 0,
    },
  ],
  normalNodes: [...],
  ghostNodes: [...],
  timestamp: Date.now(),
};

const tagged = await tagger.tagCapsule(capsule);

// topTier は座標を持つ（発見物の配置先）
console.log(tagged.topTier[0].vector.length);  // 384

// normal/ghost は座標なし（軽量処理）
console.log(tagged.normal[0].vector.length);   // 0
console.log(tagged.ghost[0].vector.length);    // 0
```

---

## 8. 移行手順

| Step | 作業 | 影響 |
|------|------|------|
| 1 | `@xenova/transformers` インストール | package.json |
| 2 | `embedding/` ディレクトリ作成 | 新規ディレクトリ |
| 3 | `embedding/embedding-provider.ts` 実装 | 新規ファイル（共通 I/F） |
| 4 | `embedding/local-embedding-provider.ts` 実装 | 新規ファイル |
| 5 | `embedding/provider-factory.ts` 実装 | 新規ファイル |
| 6 | `parser/parser.ts` 修正（parseRequest 追加） | 既存ファイル |
| 7 | `tagger/tagger.ts` 修正（Parser 参照） | 既存ファイル |
| 8 | `sphere.config.json` 更新 | 設定変更 |
| 9 | 次元数変更 (1536 → 384) | 既存データ非互換 |

### 8.1 ディレクトリ構成

```
services/periphery/src/
├── embedding/                 # 共有 embedding インフラ
│   ├── embedding-provider.ts  # IEmbeddingProvider interface
│   ├── local-embedding-provider.ts
│   ├── mock-embedding-provider.ts
│   └── provider-factory.ts
├── parser/                    # 探索開始時処理
│   └── parser.ts              # parseRequest → initialPosition
├── tagger/                    # 帰還時処理
│   └── tagger.ts              # tagCapsule → TaggedCapsule
└── ...
```

### 8.2 後方互換性

```json
// Mock と Local を設定で切り替え可能
{
  "embedding": {
    "provider": "mock"    // 開発時（ランダムベクトル）
    // "provider": "local"   // 本番時（Sentence-BERT）
  }
}
```

---

## 9. 性能考慮

### 9.1 初期化コスト

| 項目 | 時間（目安） |
|-----|-------------|
| モデルダウンロード（初回） | 30-60秒 |
| モデルロード | 2-5秒 |
| 埋め込み（1文） | 10-50ms |
| 埋め込み（バッチ10文） | 50-200ms |

### 9.2 メモリ使用量

| モデル | メモリ |
|-------|--------|
| all-MiniLM-L6-v2 (量子化) | ~50 MB |
| all-MiniLM-L6-v2 (非量子化) | ~100 MB |
| all-mpnet-base-v2 | ~250 MB |

### 9.3 最適化オプション

```typescript
// 量子化モデルでメモリ・速度改善
{ quantized: true }

// WebGPU 対応（将来）
{ device: "webgpu" }
```

---

## 10. 今後の拡張

### 10.1 多言語対応

```json
{
  "embedding": {
    "modelId": "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
  }
}
```

### 10.2 品質向上

```json
{
  "embedding": {
    "modelId": "Xenova/all-mpnet-base-v2",
    "vectorDimension": 768
  }
}
```

### 10.3 Rust 移植

将来的に `ort` (ONNX Runtime) を使用した Rust 実装へ移行可能。
インターフェースは同一を維持。

### 10.4 大規模モデルでのスケーリング戦略

#### 現状アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│  現在: 単一 EmbeddingProvider を Parser/Tagger で共有           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐                      ┌─────────┐                   │
│  │ Parser  │ ──┐              ┌── │ Tagger  │                   │
│  │ (Dive)  │   │              │   │ (Return)│                   │
│  └─────────┘   │              │   └─────────┘                   │
│                ▼              ▼                                 │
│           ┌──────────────────────┐                              │
│           │  EmbeddingProvider   │  ← 共有（同一座標モデル）      │
│           │  (all-MiniLM-L6-v2)  │                              │
│           └──────────────────────┘                              │
│                                                                 │
│  [利点] 384次元・軽量 → 競合問題なし                            │
└─────────────────────────────────────────────────────────────────┘
```

#### 大規模モデル (768次元+) での課題

```
┌─────────────────────────────────────────────────────────────────┐
│  問題: 大規模モデルでの Parser/Tagger 競合                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  時間軸 →                                                       │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Parser:  ████░░░░░░░░░░████  (Dive Entry - エージェント待機)   │
│                      ↑                                          │
│                      │ BLOCKED!                                 │
│                      ↓                                          │
│  Tagger:  ░░░░████████░░░░░░  (Incarnation - 大バッチ処理)      │
│                                                                 │
│  [問題点]                                                       │
│  - Tagger の大バッチ処理中、Parser がブロックされる             │
│  - Parser = エージェント待機 → UX 直結                          │
│  - 768次元モデル: 埋め込み時間 3-5倍増加                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 提案: 優先度ベース Worker Thread 分離

```
┌─────────────────────────────────────────────────────────────────┐
│  将来: Worker Thread による優先度分離                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Main Thread                                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  ┌─────────┐         ┌─────────┐                        │    │
│  │  │ Parser  │         │ Tagger  │                        │    │
│  │  │ (Dive)  │         │ (Return)│                        │    │
│  │  └────┬────┘         └────┬────┘                        │    │
│  │       │                   │                             │    │
│  └───────┼───────────────────┼─────────────────────────────┘    │
│          │                   │                                  │
│          ▼                   ▼                                  │
│  ┌───────────────┐   ┌───────────────┐                          │
│  │ Worker HIGH   │   │ Worker LOW    │                          │
│  │ PRIORITY      │   │ PRIORITY      │                          │
│  ├───────────────┤   ├───────────────┤                          │
│  │ - 小バッチ    │   │ - 大バッチ    │                          │
│  │ - 即時処理    │   │ - 遅延許容    │                          │
│  │ - 応答性重視  │   │ - 効率重視    │                          │
│  │               │   │               │                          │
│  │ EmbedProvider │   │ EmbedProvider │  ← 同一モデル、別インスタンス │
│  │ (768d model)  │   │ (768d model)  │                          │
│  └───────────────┘   └───────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Worker 設計詳細

```typescript
// 将来の実装案

// === HIGH PRIORITY Worker (Parser 用) ===
interface ParserWorkerConfig {
  priority: "high";
  maxBatchSize: 4;        // 小バッチ = 即時処理
  idleTimeoutMs: 500;     // 短いタイムアウト
  maxWaitTimeMs: 2000;    // 最大待機時間も短く
}

// === LOW PRIORITY Worker (Tagger 用) ===
interface TaggerWorkerConfig {
  priority: "low";
  maxBatchSize: 64;       // 大バッチ = 高効率
  idleTimeoutMs: 10000;   // 長いタイムアウト（蓄積）
  maxWaitTimeMs: 60000;   // エージェント不在 = 急がない
}

// === 優先度制御 ===
// HIGH Worker が要求 → LOW Worker を一時停止
// GPU/CPU リソースを Parser に譲渡
```

#### スケーリング閾値の目安

| 次元数 | モデル例 | 分離の必要性 |
|--------|----------|--------------|
| 384    | all-MiniLM-L6-v2 | 不要（現状維持） |
| 512    | distiluse-base | 検討 |
| 768    | all-mpnet-base-v2 | 推奨 |
| 1024+  | 大規模特化モデル | 必須 |

#### 実装優先度

1. **Phase 1 (現在)**: 単一 Provider、384次元 → 十分
2. **Phase 2 (必要時)**: Worker Thread 分離の検討
3. **Phase 3 (大規模時)**: GPU 分離、優先度キュー実装

---

ステータス: 実装案
作成日: 2025-01-31
