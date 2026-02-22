# Embedding バッチ処理の問題 (修正済み ✅)

> **発見日**: 2026-02-03
> **修正日**: 2026-02-03
> **関連ファイル**: `services/periphery/src/parser/embedding-provider.ts`
> **ステータス**: 修正済み - 真のバッチ処理を実装

---

## 問題概要 (修正前)

`LocalEmbeddingProvider.embedBatch()` が **見かけ上のバッチ処理** であり、
実際には逐次処理になっている。

---

## 旧実装 (修正前のコード)

```typescript
async embedBatch(texts: string[]): Promise<number[][]> {
  await this.ensureLoaded();

  const results: number[][] = [];
  for (const text of texts) {                    // ← 逐次 for ループ
    const output = await this.pipeline(text, {   // ← 1件ずつ呼び出し
      pooling: "mean",
      normalize: true,
    });
    results.push(Array.from(output.data as Float32Array));
  }

  return results;
}
```

**問題**: `this.pipeline(text)` を N 回呼び出しているため、
バッチサイズに関係なく処理時間は `N × (単一テキスト処理時間)` となる。

---

## 設計書との乖離 (PARSER_TAGGER_IMPL.md)

### 性能見積もり (Lines 275-279)

| 処理 | 時間 | 備考 |
|-----|------|------|
| Embedding (1 text) | ~5ms | all-MiniLM-L6-v2, CPU |
| Embedding (16 texts) | ~80ms | **バッチ処理** |

設計書では 16 texts を **80ms** で処理できると想定。
しかし現実装では 16 × 5ms = **80ms** ではなく、
pipeline 呼び出しのオーバーヘッドで **300-400ms** かかる可能性。

### 設計案 (Lines 427-436)

```typescript
async embedBatch(texts: string[]): Promise<number[][]> {
  // 並列処理（モデルによってはシーケンシャルの方が効率的な場合も）
  const results = await Promise.all(
    texts.map(text => this.embed(text))
  );
  return results;
}
```

これも `Promise.all` で並列に見えるが、同一 pipeline インスタンスへの
アクセスは実質逐次になる（内部で排他制御される）。

---

## 計測結果

| 設定 | 処理時間 | ノード数 | スループット |
|------|----------|----------|--------------|
| batchSize=8, flush=100ms | ~30秒 | 80 | ~2.6 nodes/s |
| batchSize=32, flush=5000ms | ~31秒 | 80 | ~2.6 nodes/s |

**バッチサイズを変更してもスループットが変わらない** = バッチ処理が機能していない。

---

## 新実装 (現在のコード)

transformers.js の pipeline は **配列入力** をサポート → これを採用:

```typescript
async embedBatch(texts: string[]): Promise<number[][]> {
  await this.ensureLoaded();

  // 全テキストを一括でモデルに渡す（真のバッチ処理）
  const outputs = await this.pipeline(texts, {
    pooling: "mean",
    normalize: true,
  });

  // 結果を分割（連続したメモリから切り出し）
  const results: number[][] = [];
  const dim = this.config.dimension;
  for (let i = 0; i < texts.length; i++) {
    const start = i * dim;
    results.push(Array.from(outputs.data.slice(start, start + dim)));
  }

  return results;
}
```

**期待される効果**:
- GPU/CPU のバッチ並列処理を活用
- pipeline 呼び出しのオーバーヘッド削減
- 理論上 3-5x のスループット向上

---

## 確認事項

1. **transformers.js のバッチ入力仕様**
   - `pipeline(texts: string[], options)` で配列を受け付けるか
   - 出力形式: 連結された Float32Array か、配列か

2. **メモリ使用量**
   - 大バッチ (32+ texts) でのメモリ増加
   - OOM リスクの評価

3. **互換性**
   - 現在のコードへの影響範囲
   - MockEmbeddingProvider との整合性

---

## 修正実施 (2026-02-03)

`LocalEmbeddingProvider.embedBatch()` を真のバッチ処理に修正した。

### 修正後のテスト結果

**小規模テスト (8 texts):**

| 方式 | 時間 | スループット |
|------|------|--------------|
| Sequential (旧) | 42ms | 5.3ms/text |
| Batch (新) | 27ms | 3.4ms/text |
| **Speedup** | **1.56x** | |

**ベクトル精度:**

| 比較 | コサイン類似度 |
|------|----------------|
| 同じテキスト (Individual vs Batch) | 0.989 - 0.993 |
| 異なるテキスト同士 | 0.07 - 0.27 |

→ 意味的検索には十分な精度

### 80 nodes テスト - chunkSize 変更で改善

**問題発見**: テストの chunkSize=3 は非現実的（実際は 8-10 nodes/capsule）

```
旧テスト (chunkSize=3):
  80 items / 3 = 27 capsules → 27回の pipeline 実行 → ~31秒

新テスト (chunkSize=10):
  80 items / 10 = 8 capsules → 8回の pipeline 実行 → ~11秒
```

**最終結果:**

| 設定 | カプセル数 | 時間 | スループット | 改善 |
|------|-----------|------|-------------|------|
| chunkSize=3 (旧) | 27 | ~31秒 | ~2.6 nodes/s | - |
| chunkSize=10 (新) | 8 | ~11秒 | ~5.0 nodes/s | **2.8x** |

**改善要因:**
1. パイプライン実行回数削減: 27回 → 8回
2. バッチあたりノード数増加: ~3 → ~7
3. 真のバッチ embedding が効果を発揮

### 残る最適化案

1. **Pipeline parallelization**: 複数カプセルの並列処理
2. **Streaming upload**: WebSocket 経由で連続投入

---

---

## 影響範囲 (修正済み ✅)

両方の Buffer が **同じ経路** を通る → 1箇所の修正で両方に効果:

```
┌─────────────────────────────────────────────────────────────────┐
│  EntryBuffer.flush()                                             │
│    ↓                                                             │
│  parser.vectorizeBatch(texts)  [parser.ts:28-30]                │
│    ↓                                                             │
│  provider.embedBatch(summaries)  [embedding-provider.ts:212]    │
│    ↓                                                             │
│  pipeline(texts[], ...)  ← ✅ 真のバッチ処理に修正済み          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  IncarnationBuffer.flush()                                       │
│    ↓                                                             │
│  parser.vectorizeBatch(texts)  [parser.ts:28-30]                │
│    ↓                                                             │
│  provider.embedBatch(summaries)  [embedding-provider.ts:212]    │
│    ↓                                                             │
│  pipeline(texts[], ...)  ← ✅ 真のバッチ処理に修正済み          │
└─────────────────────────────────────────────────────────────────┘
```

**修正完了 (2026-02-03):**

`LocalEmbeddingProvider.embedBatch()` を真のバッチ処理に変更。
両方の Buffer が自動的に恩恵を受ける。

---

## 参照

- `services/periphery/src/parser/embedding-provider.ts`
- `services/periphery/src/parser/buffer.ts` (EntryBuffer, IncarnationBuffer)
- `services/periphery/src/parser/parser.ts`
- `reports/PARSER_TAGGER_IMPL.md` (§2.0.4, §9)
- `services/periphery/docs/performance-bottleneck-analysis.md`
