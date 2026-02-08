# Fast Path Design — Sphere-Driven Coupling

> **核心思想**: LLM は賢い脳ではなく琥珀生成器。判断主体は Sphere。phi は材料供給。

---

## 問題: CPU 推論のボトルネック

現状 (2026-02-08):
- phi3:mini CPU 推論: ~100秒/回 (num_predict=256)
- num_predict=64 に削減: ~25秒/回 (推定)
- 1 cycle (sense → 推論 → focus → 推論): ~50秒

**限界**: どれだけ最適化しても、phi を呼ぶたびに数十秒かかる。

---

## 解決策: Fast Path アーキテクチャ

```
input (embedding)
  ↓
sphere fast gate
├─ Level 0: 完全キャッシュ (similarity > 0.90) → 即リターン (phi 不要)
├─ Level 1: combo shortcut (A→B→C replay) → 即リターン
├─ Level 2: cheap heuristic (cosine/keyword/regex/decision tree) → 0.5ms
└─ Level 3: phi (最後の手段) → ollama.generate()
```

### Level 0: 完全キャッシュ

```typescript
input embedding
  ↓
nearest amber similarity > 0.90
  → 即リターン (キャッシュヒット)

phi 呼ばない。
```

**効果**: これだけで体感 10倍速。

### Level 1: Combo Shortcut (Graph Reinforcement)

過去の成功パターンを記憶:
```
A → B → C (過去の探索経路)
```

同じ文脈で A を検出したら:
```
即 replay: A → B → C
```

**Graph Reinforcement**: 繰り返し使われる経路が強化される。

### Level 2: Cheap Heuristic

phi の代わりに軽量判断:
- **cosine similarity**: ベクトル距離のみで判定
- **keyword matching**: タグ・summary の単純マッチ
- **regex**: パターンベース抽出
- **decision tree**: 事前学習済みルール

**処理時間**: Node 側で 0.5ms

### Level 3: phi (最後の手段)

上記すべてで判断できなかった場合のみ:
```typescript
ollama.generate()
```

**phi は最後の最後**。

---

## 統計的効果 (推定)

```
7割: fast path (Level 0-2)
2割: combo (Level 1)
1割: phi (Level 3)
```

**体感**: 爆速
**特性**: 学習が進むほど高速化 (キャッシュ蓄積 + combo 形成)

---

## CPU 環境向け追加最適化

### 1. num_predict 削減 (✅ 実装済み)

```typescript
maxTokens: 64  // 思考させない
```

phi に長文生成させない。

### 2. temperature 削減 (未実装)

```typescript
temperature: 0.2  // 探索させない (現状: 0.3)
```

確定的な応答を優先。

### 3. streaming 即打ち切り (未実装)

```typescript
ollama API で streaming: true
  ↓
最初の数 token を見て:
  "あ、これは既存琥珀だ"
  → abort (途中キャンセル)
```

**ollama API は途中キャンセル可能**。

---

## 設計原則

### スフィアが急がせる実体

```
判断主体 = Sphere (fast gate)
材料供給 = phi (琥珀生成器)
```

phi は「賢い脳」ではない。
**琥珀を生成する器**。

判断は Sphere が行う:
- キャッシュヒット判定
- combo 検出
- heuristic 適用

phi を「最後の手段」に押し込める。

### なぜこれが速いか

1. **空間的局所性**: 同じ領域を探索することが多い → キャッシュヒット率高
2. **時間的局所性**: 最近見たノードを再訪することが多い → combo 有効
3. **確率的収束**: 探索が進むと新規判断が減る → heuristic で十分

**GPUなしでも"速く見える"理由**: ほとんどの判断が Sphere 内で完結する。

---

## 実装ロードマップ

### Phase 1: Fast Gate 基盤

- [ ] `CouplingCache` — embedding → amber の最近傍キャッシュ
- [ ] similarity threshold 設定 (0.90)
- [ ] cache hit 時の即リターン

### Phase 2: Combo Shortcut

- [ ] `ComboGraph` — 探索経路の記録 (A→B→C)
- [ ] combo hash 設計 (path signature)
- [ ] replay ロジック

### Phase 3: Cheap Heuristic

- [ ] keyword matcher (tags + summary)
- [ ] cosine distance gate (threshold 設定)
- [ ] heuristic decision tree

### Phase 4: phi Streaming Abort

- [ ] ollama streaming モード対応
- [ ] 既存琥珀判定 (最初の数 token)
- [ ] abort ロジック

---

## 技術要素

### Fast Gate の具体コード

```typescript
class SphereFastGate {
  cache: Map<string, AmberCache>;  // embedding hash → amber
  combo: ComboGraph;                // A→B→C paths
  heuristic: DecisionTree;          // cheap rules

  async decide(input: number[]): Promise<Action | null> {
    // Level 0: cache hit?
    const cached = this.cache.nearestNeighbor(input, threshold=0.90);
    if (cached) return cached.action;  // 即リターン

    // Level 1: combo shortcut?
    const combo = this.combo.match(input);
    if (combo) return combo.replay();  // 即リターン

    // Level 2: heuristic?
    const heuristic = this.heuristic.eval(input);
    if (heuristic.confidence > 0.7) return heuristic.action;

    // Level 3: phi 必要
    return null;  // → ollama.generate()
  }
}
```

### Combo Hash 設計

```typescript
interface ComboPath {
  signature: string;  // hash(A.embedding + B.embedding + C.embedding)
  path: string[];     // [nodeId_A, nodeId_B, nodeId_C]
  count: number;      // 使用回数
  lastUsed: number;   // timestamp
}

class ComboGraph {
  paths: Map<string, ComboPath>;

  record(path: string[]) {
    const sig = hash(path.map(id => getEmbedding(id)));
    this.paths.set(sig, { signature: sig, path, count: 1, lastUsed: Date.now() });
  }

  match(input: number[]): ComboPath | null {
    for (const [sig, combo] of this.paths) {
      const similarity = cosine(input, getEmbedding(combo.path[0]));
      if (similarity > 0.85) return combo;
    }
    return null;
  }
}
```

### phi Streaming Abort 実装

```typescript
async generateWithAbort(prompt: string): Promise<string> {
  const stream = await ollama.generate({ prompt, stream: true });
  let accumulated = "";
  let tokenCount = 0;

  for await (const chunk of stream) {
    accumulated += chunk.response;
    tokenCount++;

    // 最初の 10 tokens で判定
    if (tokenCount === 10) {
      const embedding = await embed(accumulated);
      const cached = this.cache.nearestNeighbor(embedding, threshold=0.85);
      if (cached) {
        stream.abort();  // 途中キャンセル
        return cached.content;  // キャッシュから返す
      }
    }
  }

  return accumulated;
}
```

---

## メトリクス設計

### 追跡すべき指標

```typescript
interface FastPathMetrics {
  total: number;           // 総リクエスト数
  cacheHits: number;       // Level 0 ヒット数
  comboHits: number;       // Level 1 ヒット数
  heuristicHits: number;   // Level 2 ヒット数
  phiCalls: number;        // Level 3 (phi 呼び出し)
  avgLatency: number;      // 平均レイテンシ
  phiAvgLatency: number;   // phi 平均レイテンシ
}
```

**目標**:
```
phiCalls / total < 0.15  // phi 呼び出しは 15% 以下
avgLatency < 100ms       // 平均 100ms 以下
```

---

## 設計上の注意

### Sphere に判断を移す

```
❌ phi に「どのノードを選ぶべきか」と聞く
✅ Sphere が候補を絞り、phi に「このノードの評価は？」と聞く

❌ phi に「次の行動は？」と聞く
✅ Sphere が fast gate で判断、phi は最終確認のみ

❌ phi を判断主体にする
✅ phi を琥珀生成器として扱う
```

### キャッシュの陳腐化対策

- **TTL**: キャッシュに有効期限を設定 (例: 10分)
- **LRU**: 最近使われていないエントリを削除
- **Sphere 側の代謝**: Amber が decompose されたらキャッシュも削除

---

## まとめ

**Fast Path の本質**:
- LLM を「最後の手段」に押し込める
- 判断主体を Sphere に移す
- 学習が進むほど高速化する

**次の実装**:
1. CouplingCache (Level 0)
2. ComboGraph (Level 1)
3. phi streaming abort (Level 3 最適化)

**期待効果**:
- 体感 10倍速
- GPU なしでも実用的な応答速度
- スフィアの「代謝」が phi を急がせる構造
