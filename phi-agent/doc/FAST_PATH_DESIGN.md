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

## 採用候補

### 案1: FastGate — ローカルスコアリング層

**概要**: phi 呼び出しを 3回/cycle → 1回/cycle に削減

**現状の問題**:
```
1 cycle = 3 phi calls × ~25s = ~75s
→ 300s timeout で 4 cycles が限界
```

**FastGate 適用後**:
```
1 cycle = 1 phi call × ~25s = ~25s
→ 300s timeout で 12 cycles 可能
```

**置き換え対象**:

| ステップ | 現状 | FastGate |
|----------|------|----------|
| focus 対象選択 | phi (~25s) | ローカルスコアリング (0ms) |
| evaluate | phi (~25s) | phi (~25s) — **変更なし** |
| move 方向選択 | phi (~25s) | ヒューリスティック (0ms) |

**focus 対象選択 — スコアリング関数**:
```
score = keywordMatch(query, tags+summary) × 10
      + heat × 0.5
      + weight × 0.3
      - distance × 2
```
sense 結果に tags/summary/heat/weight/distance が既にある → phi 不要

**move 方向 — ヒューリスティック**:
```
eval.h >= 7 → "deep"  (良い発見 → 同じ領域を深掘り)
eval.h >= 5 → "hot"   (普通 → 活発な領域へ)
eval.h <  5 → "explore" (外れ → 別の領域へ)
```

**変更ファイル**: phi-agent のみ (Sphere 側変更なし)
- 新規: `src/fast-gate.ts`
- 変更: `src/agent.ts` (exploreCycle の phi 呼び出しを FastGate に差し替え)

### 案2: Prefetch — phi 推論中の I/O 重ね合わせ

**概要**: phi が推論している間に次サイクルの Sphere 操作を先行実行

**現状 (直列)**:
```
phi eval(25s) → [idle] → move(50ms) → sense(50ms) → pick → focus(50ms) → phi eval(25s) → ...
                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                 この ~150ms が phi 間の空白時間
```

**Prefetch 適用後**:
```
phi eval(25s) ──────────────────────────────────────┐
  └─ 裏で: move → sense → pick → focus (次ノード準備) │
phi 完了 → eval 送信 → 即座に次の phi eval 開始 ←──────┘
```

**仕組み**: Node.js async I/O の活用
```typescript
const evalPromise = ollama.generate(evalPrompt);  // phi 開始 (await しない)
await sphere.move(step, moveMode);                 // 裏で Sphere 操作
const nextNodes = await sphere.sense(radius);
const nextTarget = fastGate.pick(nextNodes);
const nextDetail = await sphere.focus(nextNodes[nextTarget].id);
const evalResponse = await evalPromise;            // phi 結果回収
```

**トレードオフ**:
- move 方向が「前回の eval 結果」ベース (1サイクル遅延)
- 案1 (FastGate) との併用が前提
- 実装がやや複雑 (exploreLoop のリファクタ必要)

**効果**: phi 間の空白時間 ~150ms → 0ms (体感差は小さいが、構造的に正しい)

### 案3: EvalLoop — 記憶 + 満足度帰還モデル

**概要**: 案1 の FastGate を包含しつつ、セッション内記憶と帰還判断を追加

**サイクル**:
```
move(算出済み) → sense → pick(ローカル) → focus → phi eval → 記憶 + 算出 + move判定
                                                  ↑ 唯一の phi 呼び出し
```

**3つの柱**:

**1. レイヤー記憶 (SessionMemory)**
- 各 cycle の eval 結果 (h, w, d, nodeId) を phi-agent 側に蓄積
- セッション内で「何を見たか」「何が良かったか」を覚える
- pick の精度向上: 過去に低評価だったタグ領域を避ける等
```typescript
interface SessionMemory {
  evals: { nodeId: string; h: number; w: number; tags: string[] }[];
  totalScore: number;      // 累積スコア
  cycleCount: number;
}
```

**2. 算出ベースの move 判定 (computeNextMove)**
- phi 不要。直前の eval 結果から即算出:
```
h >= 7 → "deep"   (良い発見 → 深掘り)
h >= 5 → "hot"    (普通 → 活発な領域へ)
h <  5 → "explore" (外れ → 別の領域へ)
```
- 将来: SessionMemory を参照して重複領域を避ける

**3. 満足度ベースの帰還 (shouldReturn)**
- 確率的 return: スコア蓄積に応じて帰還確率が上昇
```
satisfaction = totalScore / (cycleCount × 10)
returnProb  = sigmoid(satisfaction - threshold)

例: 5 cycles, totalScore 35 → satisfaction 0.7 → returnProb ~30%
例: 8 cycles, totalScore 60 → satisfaction 0.75 → returnProb ~50%
```
- 原則: エージェントが満足するまで探索を続けられる
- 最低 cycles 保証 (例: 3 cycles は必ず探索)
- energy 枯渇 / expelled → 即 return (エラーではない)

**expelled のグレースフル処理** (Sphere 側、後回し):
- expelled でもエラーにせず体験カプセルを正常回収
- phi-agent 側: SessionMemory を AutoCapsule に含める
- Sphere 側: expelled 時の pipeline 処理を保証

**案1 との違い**:
| | 案1 (FastGate) | 案3 (EvalLoop) |
|--|---------------|---------------|
| phi 呼び出し | 1回/cycle | 1回/cycle (同じ) |
| 記憶 | なし | SessionMemory |
| 帰還判断 | cycles/energy のみ | 満足度ベース |
| 学習 | なし | 過去 eval で pick 精度向上 |

**変更ファイル**: phi-agent のみ (Sphere 側変更なし)
- 新規: `src/fast-gate.ts` (pick + computeNextMove + shouldReturn + SessionMemory)
- 変更: `src/agent.ts` (exploreLoop/exploreCycle のリファクタ)

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
