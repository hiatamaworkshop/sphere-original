# Parser 負荷テスト メモ

**作成日**: 2026-02-02
**対象**: LocalEmbeddingProvider (Xenova/all-MiniLM-L6-v2, 384次元)

---

## 1. テスト目的

Parser はシステム唯一のボトルネック候補。以下の3パスすべてで使用される:

| パス | メソッド | 待機者 | 重要度 |
|------|----------|--------|--------|
| ユーザー来訪 | `vectorize(query+tags)` | エージェント（待機中） | 高 |
| 受肉 | `vectorizeBatch(summaries)` | なし（Fire&Forget） | 中 |
| 移動 | `vectorizeTags(keyword)` | エージェント（待機中） | 高 |

---

## 2. 変更内容

```typescript
// Before (Mock - ノーコスト)
import { MockEmbeddingProvider } from "./parser/embedding-provider";
const embeddingProvider = new MockEmbeddingProvider();

// After (Local ONNX - 実コスト)
import { LocalEmbeddingProvider } from "./parser/embedding-provider";
const embeddingProvider = new LocalEmbeddingProvider();
```

---

## 3. テストシナリオ

### 3.1 単発テスト（ベースライン計測）

**目的**: 1件あたりの処理時間を計測

```bash
# サーバー起動（初回はモデルダウンロード ~50MB）
cd services/periphery
npm run dev

# 1件投入
npx tsx src/mock/contribution.ts 1
```

**観測ポイント**:
- `[LocalEmbeddingProvider] Model loaded in XXXms` - 初回ロード時間
- `[IncarnationParser] vectorized count=N dim=384` - ベクトル化完了
- 全体のレスポンス時間

### 3.2 バッチ効率テスト

**目的**: バッチ処理の効率を確認

```bash
# 10件投入
npx tsx src/mock/contribution.ts 10

# 50件投入
npx tsx src/mock/contribution.ts 50

# 全件投入 (60件)
npm run contribute:batch
```

**計測項目**:
- topTier 件数 × 処理時間
- バッチサイズ vs 合計時間の関係

### 3.3 同時接続テスト

**目的**: 複数クライアントからの同時アクセス

```bash
# 別ターミナルで並列実行
npx tsx src/mock/contribution.ts 10 &
npx tsx src/mock/contribution.ts 10 &
npx tsx src/mock/contribution.ts 10 &
```

**観測ポイント**:
- 応答時間の悪化度合い
- キューイング動作

### 3.4 WebSocket Entry テスト

**目的**: ユーザー来訪時のレイテンシ計測

```bash
# swarm エージェント起動
npm run swarm 3
```

**観測ポイント**:
- Entry → Ready までの時間
- ParserBuffer のバッチ動作

---

## 4. 期待値

### LocalEmbeddingProvider (all-MiniLM-L6-v2)

| 項目 | 期待値 | 備考 |
|------|--------|------|
| モデルロード | 1-5秒 | 初回のみ |
| 単発 embed | 10-50ms | CPU依存 |
| バッチ 10件 | 50-200ms | 並列化効果 |
| バッチ 50件 | 200-500ms | 線形に近い |

### バッファ設計との整合

| バッファ | 設計値 | テスト確認 |
|----------|--------|------------|
| ParserBuffer maxWait | 2000ms | これ以内に応答するか |
| TagBuffer maxWait | 30000ms | 余裕あり |

---

## 5. 結果記録

### 5.1 環境

- OS: Windows 11
- CPU: (ローカル環境)
- RAM: (ローカル環境)
- Node.js: v20.20.0

### 5.2 計測結果 (2026-02-02)

| テスト | 処理時間 | 備考 |
|--------|----------|------|
| モデルロード | **2505ms** | 初回のみ、以降はキャッシュ |
| 単発 1件 (topTier) | <100ms | 体感即時 |
| バッチ 10件 (topTier 2) | <200ms | 体感即時 |
| バッチ 29カプセル (topTier 18) | ~1-2秒 | 85ノード生成 |

### 5.3 所見

**結論: LocalEmbeddingProvider は十分に高速**

1. **モデルロード (2.5秒)**: 初回のみ。サーバー起動時にウォームアップ可能
2. **ベクトル化**: 体感即時。バッファ設計の maxWait (2秒) 以内に収まる
3. **バッチ効率**: 29カプセル/85ノードが1-2秒で完了

**ボトルネック評価:**
- IN側 (ユーザー来訪): **未テスト** - ParserBuffer 経由、maxWait 2秒以内が目標
- OUT側 (受肉): **問題なし** - バッファなし（直接 vectorizeBatch 呼び出し）、体感即時

**注意**:
- 受肉プロセスは本来バッファを持ちバッチ処理すべき設計だが、現状は IncarnationParser が直接 `parser.vectorizeBatch()` を呼び出している
- `buffer.ts` に `TagBuffer` という定義があるが **未使用の死んだコード**（名前も不適切）
- 受肉用バッファを実装する場合は `IncarnationBuffer` 等の適切な名前で新規作成すべき

**受肉用バッファの設計指針** (将来実装時):
- **目的**: ノード位置特定用ベクトル付与のバッチ効率化
- **サイズ**: 5〜6エージェント分 ≈ 30個程度（大きすぎない）
- **タイムアウト**: 数秒（長く待たない）
- **理由**:
  - 待ちすぎるとパイプラインが詰まる
  - 後段のDB（ProjDB/RefDB）への負荷も考慮
- **思想**: スループット最大化ではなく、適度なバッチで流れを止めない

**推奨:**
- 本番環境でも LocalEmbeddingProvider で十分
- モデルウォームアップをサーバー起動時に追加検討

---

## 6. 次のアクション

テスト結果に基づき:

- [ ] 許容範囲内 → 本番適用可能
- [ ] 遅い → バッファ設定調整
- [ ] 非常に遅い → GPU対応 or 外部API検討

---

## 7. EntryBuffer 構想 (2026-02-02)

### 7.1 命名の整理

| 現在の名前 | 問題点 | 提案 |
|-----------|--------|------|
| `ParserBuffer` | 何のパーサー？混乱 | `EntryBuffer` |
| `IncarnationBuffer` | OK（受肉用バッファ） | そのまま |

### 7.2 バッファ一覧

| バッファ | タイミング | 待機者 | 設計思想 |
|----------|-----------|--------|----------|
| **EntryBuffer** | エージェント来訪 | エージェント（同期） | 応答性優先 |
| **IncarnationBuffer** | 受肉（帰還後） | なし（Fire&Forget） | スループット優先 |

### 7.3 エージェント入場フロー

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 0: POST /dive/request → チケット取得                      │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: ws://localhost:8081?token=xxx → pending状態           │
│           → "welcome" 送信                                       │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: Agent sends "entry" → Membrane.validate()              │
│           → 成功 → processing状態 → "processing" 送信           │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: ベクトル化（★EntryBuffer投入ポイント★）               │
│                                                                  │
│  現状: parser.vectorize() 直接呼び出し ← 問題                   │
│  正解: EntryBuffer.enqueueDiveEntry() ← Membrane直後に投入      │
│                                                                  │
│  [タイミング] Membrane検証成功 → 即座にバッファ投入              │
│  [理由] 他エージェントのEntryとバッチ化できる可能性              │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 4: active状態 → "positioned" 送信 → Dive開始              │
└─────────────────────────────────────────────────────────────────┘
```

### 7.4 現状の問題

```
設計（PARSER_TAGGER_IMPL.md）:
  Membrane.validate() → EntryBuffer.enqueueDiveEntry() → バッチ処理

実装（gateway-server.ts:396）:
  Membrane.validate() → parser.vectorize() → 個別処理 ← バッファ未使用！
```

**原因**: `parserBuffer` は index.ts で作成されているが、GatewayServer に注入されていない

### 7.5 修正案

```typescript
// index.ts
const entryBuffer = new EntryBuffer(parser, { ... });

// GatewayServer に注入
const gatewayServer = new GatewayServer({
  entryBuffer,  // ← 追加
  ...
});

// gateway-server.ts
// Before:
const initialVector = await this.parser.vectorize(queryForVectorization);

// After:
const entry = await this.entryBuffer.enqueueDiveEntry(
  sessionId,
  queryForVectorization,
  quest  // optional
);
const initialVector = entry.initialPosition;
```

### 7.6 EntryBuffer 設計値

```typescript
{
  maxTextsPerBatch: 16,   // テキスト数上限
  idleTimeoutMs: 200,     // 応答性重視（短い）
  maxWaitTimeMs: 2000,    // 最大待機（エージェントが待つので短く）
}
```

**思想**: エージェントは spawn まで待つ → 遅延 = UX 低下 → 応答性優先

### 7.7 TODO (2026-02-02 完了)

- [x] `ParserBuffer` → `EntryBuffer` にリネーム
- [x] GatewayServer に EntryBuffer を注入
- [x] gateway-server.ts で `enqueueDiveEntry()` を使用
- [x] WebSocket テスト（swarm）で動作確認

**結果**: 動線 OK、エージェントが正常に位置を取得

### 7.8 projectTo3D 廃止 (2026-02-02 完了)

**変更内容**:
- `gateway-server.ts`: `projectTo3D` 関数を削除
- `positioned` メッセージで 384次元ベクトルをそのまま送信
- `position: Vector` → `position: number[]` に変更

**修正ファイル**:
- `gateway-server.ts`: 3D投影を削除、フルベクトル送信
- `swarm-agent.ts`: 384次元ベクトル対応（表示は先頭3成分×100）

**残作業** (必要に応じて):
- [ ] `sphere-context.ts` の内部 `_position: Vector` → `number[]`
- [ ] `types/gateway.ts` の `Vector` 使用箇所を `number[]` に統一
- [ ] 移動ロジック（dx, dy, dz）の 384次元対応

### 7.9 evaluate 廃止 (2026-02-02)

**設計原則**: Heat/Metrics は受肉時にのみ反映される

```
❌ evaluate() → Dive中に動的Heat付与 (廃止)
✅ Incarnation → Capsule処理時に metrics 設定
```

**理由**:
- エージェントが「評価」するのではない
- エージェントの体験が「受肉」(Incarnation) することで新ノードになる
- 新ノードの初期 metrics は受肉処理で決定

**エージェント操作**:
| 操作 | 役割 | Heat影響 |
|------|------|----------|
| `sense()` | 周囲ノード発見 | なし |
| `focus()` | ノード詳細取得 | なし |
| `move()` | 位置移動 | なし |
| `return()` | Capsule送信→受肉 | ★受肉結果として反映 |

**修正ファイル**:
- `explore-agent.ts`: evaluate() を空実装に変更
- `swarm-agent.ts`: 同様（必要に応じて）

---

## 8. コマンド一覧

```bash
# サーバー起動
cd services/periphery && npm run dev

# 単発テスト
npx tsx src/mock/contribution.ts 1
npx tsx src/mock/contribution.ts 10
npx tsx src/mock/contribution.ts 50

# バッチテスト
npm run contribute:batch

# WebSocket テスト
npm run swarm 3

# サーバー停止
taskkill /F /IM node.exe
```

---

## 9. 未実装議題 (2026-02-02)

### 9.1 questVector と目的行動

**背景**:
- エージェントは `positioned` で初期位置を受け取る
- `position` = query + tags からベクトル化（スポーン位置）
- `questVector` = quest からベクトル化（目的地？）

**問題**: questVector をどう「向かえる指標」として解釈するか？

**選択肢**:

| 案 | 内容 | 利点 | 欠点 |
|----|------|------|------|
| A | questVector をそのまま返す | シンプル | LLM はベクトル演算できない |
| B | sense() に questRelevance スコア付与 | LLM でも使える | サーバー計算負荷 |
| C | quest テキストのみ + LLM判断 | 完全テキストベース | エージェント依存 |

**推奨**: B + C のハイブリッド
```typescript
positioned {
  position,
  questVector?,    // ベクトル演算可能なエージェント用
  quest,           // LLM 用テキスト
}

senseResult {
  nodes: [{ ..., questRelevance: 0.85 }]  // スコア付与
}
```

**保留理由**: 実装前に設計を固める必要あり

### 9.2 DynamicBuffer + AmberShowcase

**DynamicBuffer (SphereCoreAdapter.amberCache)**:
- focus() 時に動的に追加される Amber ノードキャッシュ
- FIFO で管理
- 現状: 基本実装あり

**AmberShowcase**:
- referenceDB から kind:"amber" をフィルタして提示
- welcome 時やチュートリアル層で表示
- 現状: TODO

**TODO**:
- [ ] AmberShowcase の実装（referenceDB クエリ）
- [ ] DynamicBuffer と Showcase の統合
- [ ] welcome メッセージに Showcase 含める

### 9.3 positioned 改善 (2026-02-02 完了)

- [x] `query`, `tags`, `quest` を positioned に含める
- [x] explore-agent.ts で REQUEST CONTEXT 表示
- [x] swarm-agent.ts でログ追加

### 9.4 focus を sense 結果に束縛 (2026-02-02)

**問題**: 現状の「まやかし」

```
sense() → 「node-abc が見えた」
focus("node-xyz") → 見えてないのに成功 ← まやかし
```

**原因分析**:
- `_embeddingVector` (384次元) と `_position` (3D) が分離
- `move(dx, dy, dz)` は `_position` のみ更新、`_embeddingVector` は不変
- `sense()` は常に同じ `_embeddingVector` で検索
- `focus(nodeId)` は ID 直接アクセス（位置無関係）

**段階的修正案**:

| 案 | 内容 | 効果 |
|----|------|------|
| 🅰 | 384次元で本当に動かす | 美しいが設計負荷高 |
| 🅱 | move 削除、sense→focus のみ | 探索エージェントでは成立 |
| 🅲 | focus を sense 結果に限定 | **最小変更で嘘が消える** |

**採用**: 🅲 → 🅱 → 🅰 の順で進める

**🅲 実装方針**:
```typescript
// SphereContextImpl
private visibleNodes: Set<string> = new Set();

// sense() - 可視ノードを記録
async sense(radius?: number): Promise<NearbyNode[]> {
  const nodes = await this.coreAdapter.sense(this._embeddingVector, r);
  this.visibleNodes.clear();
  for (const node of nodes) {
    this.visibleNodes.add(node.id);
  }
  return nodes;
}

// focus() - sense 結果のみ許可
async focus(nodeId: string): Promise<NodeDetail> {
  if (!this.visibleNodes.has(nodeId)) {
    throw new Error(`Node ${nodeId} not reachable - sense() first`);
  }
  // ... 既存処理
}
```

**効果**:
- 見えていないノードには触れない
- 距離・半径が意味を持つ
- 移動が sense 範囲を変えるために必要になる

**TODO** (2026-02-02 実装完了):
- [x] `sphere-context.ts` に `_visibleNodes: Set<string>` 追加
- [x] `sense()` で可視ノード記録
- [x] `focus()` に制約チェック追加
- [x] モックエージェントでテスト（move()検証追加）

**エージェント移動設計の詳細は別ドキュメント参照**:
→ `reports/MOVE_DESIGN_MEMO.md` セクション21「設計 vs 実装のギャップ」
