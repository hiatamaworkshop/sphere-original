# Embedding Model 選定メモ

Sphere Project - Parser (Vectorizer) のモデル検討

---

## 1. 現状

### 1.1 実装状況

```
services/periphery/src/parser/
├── parser.ts              # Parser クラス（IEmbeddingProvider使用）
└── embedding-provider.ts  # IEmbeddingProvider インターフェース + MockEmbeddingProvider
```

**インターフェース（既に抽象化済み）**:
```typescript
interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
```

**現行**:
- `MockEmbeddingProvider`: ランダム1536次元ベクトル
- 設定: `embeddingProvider: "mock"`, `vectorDimension: 1536`

### 1.2 次元数の影響

| 次元数 | ベクトルサイズ | 100万ノード | 備考 |
|-------|--------------|------------|------|
| 384 | 1.5 KB | 1.5 GB | 軽量モデル向け |
| 768 | 3 KB | 3 GB | 標準モデル向け |
| 1536 | 6 KB | 6 GB | OpenAI等 |
| 3072 | 12 KB | 12 GB | 大規模モデル |

---

## 2. 選定基準

### 2.0 絶対制約: API ベースモデル禁止

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️  重要制約: ローカルモデルのみ使用可                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ❌ 禁止:                                                        │
│     - OpenAI text-embedding-ada-002 / text-embedding-3-*        │
│     - Cohere embed-v3                                           │
│     - Voyage AI                                                 │
│     - その他 API 呼び出しを必要とするモデル                      │
│                                                                  │
│  ✅ 許可:                                                        │
│     - @xenova/transformers (ローカル ONNX)                      │
│     - ort (ONNX Runtime)                                        │
│     - Rust ort (将来)                                           │
│                                                                  │
│  理由:                                                           │
│     - 人間世界の資源を無駄にしない                               │
│     - Sphere は自己完結したエコシステムであるべき                │
│     - 外部依存を最小化                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Sphere 固有の要件

| 要件 | 理由 | 影響 |
|-----|------|------|
| **多言語対応** | 多様なコンテンツ | モデル選択 |
| **低レイテンシ** | リアルタイム受肉 | ローカル推奨 |
| **高スループット** | 100k+ノード/日 | バッチ処理必須 |
| **コスト制約** | 長期運用 | API課金回避 |
| **オフライン動作** | インフラ独立 | **ローカル必須** |

### 2.2 品質要件

| 要件 | 説明 |
|-----|------|
| 意味的類似性 | 類似概念が近傍座標に配置される |
| 多言語対応 | 複数言語の混在に対応 |
| ドメイン汎用性 | 特定分野に偏らない |

---

## 3. モデル候補

### 3.1 ローカルモデル（推奨）

#### A. multilingual-e5-small/base/large

| バリアント | 次元 | サイズ | 速度 | 品質 |
|-----------|-----|-------|------|------|
| small | 384 | 118MB | 高速 | 良好 |
| base | 768 | 278MB | 中速 | 優秀 |
| large | 1024 | 560MB | 低速 | 最高 |

**メリット**:
- 多言語対応
- Apache 2.0 ライセンス
- 高品質な意味表現

**推奨**: `multilingual-e5-base` (768次元)

#### B. sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2

| 項目 | 値 |
|-----|-----|
| 次元 | 384 |
| サイズ | 118MB |
| 速度 | 高速 |
| ライセンス | Apache 2.0 |

**メリット**:
- 軽量・高速
- 多言語対応
- 広く検証済み

#### C. intfloat/multilingual-e5-small

| 項目 | 値 |
|-----|-----|
| 次元 | 384 |
| サイズ | 118MB |
| 品質 | MTEBで高評価 |

**メリット**:
- 最新のE5系列
- 384次元で高品質
- ストレージ効率

### 3.2 APIモデル（非推奨）

| プロバイダ | モデル | 次元 | 料金 |
|-----------|-------|-----|------|
| OpenAI | text-embedding-3-small | 1536 | $0.02/1M tokens |
| OpenAI | text-embedding-3-large | 3072 | $0.13/1M tokens |
| Cohere | embed-multilingual-v3 | 1024 | $0.10/1M tokens |
| Voyage | voyage-multilingual-2 | 1024 | $0.12/1M tokens |

**非推奨理由**:
- 継続コスト
- レイテンシ
- オフライン不可
- API依存

---

## 4. 実装パターン

### 4.1 推奨構成

```
┌─────────────────────────────────────────────────────────────┐
│  Parser (TypeScript)                                         │
│  └── IEmbeddingProvider                                      │
│       ├── MockEmbeddingProvider (開発/テスト)               │
│       ├── OnnxEmbeddingProvider (推奨: ローカル推論)        │
│       └── ApiEmbeddingProvider (フォールバック)             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 ONNX Runtime 実装案

```typescript
// OnnxEmbeddingProvider
import * as ort from 'onnxruntime-node';

export class OnnxEmbeddingProvider implements IEmbeddingProvider {
  private session: ort.InferenceSession | null = null;
  private tokenizer: any; // tokenizers-wasm or similar

  constructor(
    private modelPath: string,
    private tokenizerPath: string
  ) {}

  async initialize(): Promise<void> {
    this.session = await ort.InferenceSession.create(this.modelPath);
    // tokenizer initialization...
  }

  async embed(text: string): Promise<number[]> {
    const tokens = await this.tokenize(text);
    const output = await this.session!.run({ input_ids: tokens });
    return this.meanPooling(output.last_hidden_state);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  private meanPooling(hiddenState: ort.Tensor): number[] {
    // Mean pooling implementation
  }
}
```

### 4.3 依存パッケージ

```json
{
  "dependencies": {
    "onnxruntime-node": "^1.17.0",
    "@xenova/transformers": "^2.16.0"
  }
}
```

または `@xenova/transformers` のみ（tokenizer + ONNX統合）:

```typescript
import { pipeline } from '@xenova/transformers';

export class TransformersEmbeddingProvider implements IEmbeddingProvider {
  private extractor: any = null;

  async initialize(): Promise<void> {
    this.extractor = await pipeline(
      'feature-extraction',
      'intfloat/multilingual-e5-small'
    );
  }

  async embed(text: string): Promise<number[]> {
    const output = await this.extractor(text, { pooling: 'mean' });
    return Array.from(output.data);
  }
}
```

---

## 5. 推奨構成

### 5.1 Phase 1 推奨

| 項目 | 選択 | 理由 |
|-----|------|------|
| モデル | `intfloat/multilingual-e5-small` | 軽量・高品質・多言語 |
| 次元 | 384 | ストレージ効率 |
| ランタイム | `@xenova/transformers` | 導入容易 |

**設定変更**:
```json
{
  "parser": {
    "embeddingProvider": "local",
    "vectorDimension": 384,
    "modelId": "intfloat/multilingual-e5-small"
  }
}
```

### 5.2 Phase 2+ 拡張

| フェーズ | 変更 |
|---------|------|
| Phase 2 | `multilingual-e5-base` (768次元) へアップグレード |
| Phase 3 | カスタムファインチューニング検討 |
| Phase 4 | Rust ONNX Runtime への移行 |

---

## 6. 移行計画

### 6.1 段階

| Step | 作業 | 影響 |
|------|------|------|
| 1 | `@xenova/transformers` インストール | 依存追加 |
| 2 | `LocalEmbeddingProvider` 実装 | コード追加 |
| 3 | 設定で切り替え | config変更 |
| 4 | 次元数変更 (1536 → 384) | データ構造変更 |
| 5 | テスト・検証 | 品質確認 |

### 6.2 後方互換性

```typescript
// sphere.config.json で切り替え
{
  "embedding": {
    "provider": "mock" | "local",  // ⚠️ "api" は禁止
    "vectorDimension": 384 | 768 | 1024,
    "modelId": "Xenova/all-MiniLM-L6-v2"
  }
}
```

既存の `IEmbeddingProvider` インターフェースは変更不要。

---

## 7. ベンチマーク予定

### 7.1 テスト項目

| 項目 | 測定内容 |
|-----|---------|
| 速度 | 単一embed時間、バッチembed時間 |
| メモリ | モデルロード後のメモリ使用量 |
| 品質 | 類似文検索精度、クラスタリング品質 |
| 多言語 | 複数言語での意味類似性 |

### 7.2 テストデータ

- Sphereの既存ノードsummary
- Wikipedia 抜粋（多言語）
- 技術文書サンプル

---

## 8. 決定事項

| 項目 | 決定 | 理由 |
|-----|------|------|
| モデル系列 | **Sentence-BERT (MiniLM / MPNet)** | 意味距離が素直、デバッグ容易 |
| 次元 | **384〜768** | 軽量、Redis/In-memory親和 |
| ランタイム | `@xenova/transformers` | Node.js統合 |

### 8.1 第一候補

| モデル | 次元 | 特徴 |
|-------|-----|------|
| `all-MiniLM-L6-v2` | 384 | 最軽量、高速 |
| `all-mpnet-base-v2` | 768 | 高品質、バランス |
| `paraphrase-multilingual-MiniLM-L12-v2` | 384 | 多言語対応 |

### 8.2 Sphere視点での利点

| 利点 | 説明 |
|-----|------|
| **差分ベクトル安定** | 琥珀A→琥珀B の意味距離が予測しやすい |
| **提出embedding安定** | エージェント提出が暴れにくい |
| **フォールバック容易** | 自動生成時に平均化しやすい |
| **ノイズ少** | spectral link判定が安定 |

### 8.3 方針

> 👉 まずこれで「迷路の形」を作る

1. MiniLM/MPNet で基本構造を構築
2. spectral link の動作確認
3. 必要に応じて多言語対応モデルへ切り替え

### 8.4 デプロイ時の柔軟性

開発者の環境・リソースに応じて、より高次元のモデルも選択可能。

| 環境 | 推奨次元 | モデル例 | メモリ目安 |
|-----|---------|---------|-----------|
| 軽量環境（デフォルト） | 384 | all-MiniLM-L6-v2 | ~50MB |
| 標準環境 | 768 | all-mpnet-base-v2 | ~250MB |
| 高性能環境 | 1024+ | bge-large-en-v1.5, e5-large | ~500MB+ |

**制約**:
- ローカル実行可能なモデルのみ（API 禁止は絶対）
- 次元数変更時は既存データと非互換
- 100万ノード時: 384次元=1.5GB、768次元=3GB、1024次元=4GB

```json
// 高性能環境の設定例
{
  "embedding": {
    "provider": "local",
    "modelId": "Xenova/bge-large-en-v1.5",
    "vectorDimension": 1024
  }
}
```

---

## 9. 参考リンク

- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) - モデル比較
- [intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small)
- [@xenova/transformers](https://github.com/xenova/transformers.js)
- [ONNX Runtime Node.js](https://onnxruntime.ai/docs/get-started/with-javascript.html)

---

ステータス: **決定済み** - Sentence-BERT系 (MiniLM/MPNet)
作成日: 2025-01-31
決定日: 2025-01-31
