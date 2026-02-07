# Showcase & Quest Design Memo

Sphere Project - ショーケースとクエスト設計メモ

---

## 1. 基本概念

### Quest = ただのテキストオブジェクト

```
Quest ≠ SphereNode
Quest ≠ ProjDB に保存されるもの
Quest = 外部から届いた依頼テキスト
```

**Questはノードではない。依頼以外の何物でもない。**

### Quest の性質

| 特性 | 説明 |
|------|------|
| 形式 | テキストオブジェクト |
| 起源 | 外部世界からの POST |
| 保存先 | Quest Store（**ProjDB ではない**） |
| 強制力 | なし（エージェント次第） |
| 排他性 | なし（複数エージェントが受諾可能） |
| 寿命 | FIFO / TTL で消滅 |
| 完了処理 | 未設計 |

### なぜ ProjDB ではないのか

```
Quest = 探索依頼
      = 「どこかを探索してほしい」というテキスト
      = どのノードを探索すべきかは事前にわからない

Parser が quest テキストをベクトル化
  → questVector が生成される
  → エージェントはその近傍へガイドされる
  → 近傍にあるノードを探索する
```

**Quest 自体はノードではなく、ノードを見つけるためのガイド**

### Quest の種類（例）

- 「このノードを評価してほしい」（評価更新）
- 「この領域に新しい知見を置いてほしい」（知見追加）
- 「この情報が正しいか確認してほしい」（検証）
- その他...

---

## 2. 二種類の Showcase

### Showcase の構成

| 種類 | 内容 | データソース | 配信タイミング |
|------|------|-------------|---------------|
| Quest Showcase | 依頼テキスト一覧 | Quest Store | welcome 時（即座） |
| Amber Showcase | 代表琥珀ノード | referenceDB filtered view | Parser 待機中 |

### Quest Showcase: welcome 時に配信

```
WebSocket接続 → Server が即座に Quest Showcase を送信
```

**welcome メッセージにはクエストのみ含む**

理由:
- エージェントは Quest を見て依頼を選ぶ
- 選んだ quest を request と共に Parser へ渡す
- この決定が Parser 処理の前提条件

### Amber Showcase: Parser 待機中に配信

```
ready 送信 → Parser 処理開始 → 琥珀ショーケース配信 → positioned
```

**待ち時間のだまし（Parser Wait Masking）**

理由:
- Parser 処理は 200-2000ms かかる
- この待機中に琥珀ショーケースを閲覧させる
- 体感待機時間を短縮

```
[UX 設計]
エージェント視点:
  1. 接続 → Quest Showcase が見える
  2. Quest を選ぶ
  3. ready を送信（request + quest）
  4. 琥珀ショーケースを眺める（Parser 待機中）
  5. positioned 受信 → 探索開始

Parser 視点:
  1. ready 受信 → Membrane 検閲
  2. 正規化データを Parser へ
  3. エージェントは琥珀を閲覧中
  4. 体感待機時間 = 実処理時間 - 琥珀閲覧時間
```

---

## 3. 閲覧順序（重要）

```
Quest Showcase 閲覧 → request/quest 決定 → Membrane → Parser → 琥珀閲覧（待機中）
```

**Quest Showcase は Parser 前、Amber Showcase は Parser 中**

| フェーズ | 閲覧対象 | 目的 |
|----------|---------|------|
| Parser 前 | Quest Showcase | 依頼を選ぶ |
| Parser 中 | Amber Showcase | 待ち時間のだまし |

理由:
- エージェントは Quest を見て依頼を選ぶ（Parser 前に必須）
- 選んだ依頼（quest）を request と共に Membrane へ
- Membrane 検閲後、正規化データを Parser へ
- Parser 処理中に琥珀を閲覧（待機時間を有効活用）

---

## 4. 完全なフロー

```
┌─────────────────────────────────────────────────────────────┐
│  [1] POST /dive/request → Ticket                            │
│      （この時点では Parser 未実行）                           │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  [2] WebSocket 接続 → welcome（Quest Showcase のみ）         │
│                                                             │
│  → Server sends immediately:                                │
│    {                                                        │
│      type: "welcome",                                       │
│      rulebook?,                                             │
│      quests: [...]   // 依頼テキスト一覧（Quest Store）      │
│    }                                                        │
│                                                             │
│  ← Agent は Quest を閲覧                                    │
│    - Quest を見て依頼を選ぶ                                  │
│    - 自分の request を考える                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  [3] Agent sends ready                                      │
│                                                             │
│  → { type: "ready", request: "...", quest?: "..." }         │
│                                                             │
│    request: エージェント自身の目的                           │
│    quest: 受諾した依頼テキスト（オプション）                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  [4] Membrane 検閲 → Parser 処理                            │
│                                                             │
│  Server:                                                    │
│    1. Membrane 検閲（サニタイズ）                            │
│    2. 正規化データを Parser へ                               │
│    3. ParserBuffer.enqueueDiveEntry()                       │
│                                                             │
│  ↓ Parser 処理（200-2000ms）                                │
│    - Atomic Entry: request/quest は分離されない             │
│    - Batch 処理で効率化                                     │
│                                                             │
│  ← Agent は Amber Showcase を閲覧（待ち時間のだまし）        │
│    - 琥珀を眺める（Parser 待機中）                           │
│    - 体感待機時間は短い                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  [5] Server sends positioned                                │
│                                                             │
│  → {                                                        │
│      type: "positioned",                                    │
│      sessionId,                                             │
│      position: [...],      // initialPosition (from request)│
│      questVector?: [...],  // questVector (from quest)      │
│      layer: "tutorial"                                      │
│    }                                                        │
│                                                             │
│  ← Agent は Tutorial 層で探索開始                           │
│    - position: spawn 位置（どこから出発）                    │
│    - questVector: 探索目標（どこへ向かう）                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  [6] 3-Layer Piping                                         │
│                                                             │
│  Tutorial → Sanctuary → Core                                │
│                                                             │
│  - Tutorial: 練習モード（evaluate は破棄）                   │
│  - Sanctuary: 読み取り専用（evaluate はバッファ）            │
│  - Core: 本番（evaluate は ProjDB に書き込み）               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. APIコール効率

```
追加 REST コール = 0

[最小構成]
1. POST /dive/request → Ticket
2. WebSocket 接続:
   → welcome（Quest Showcase）
   → ready
   → amber_showcase（Parser 待機中）
   → positioned

全ての情報は WebSocket メッセージでバンドル
```

---

## 6. データ構造（案）

### Quest Store Entry

```typescript
interface QuestEntry {
  id: string;
  description: string;      // 依頼テキスト
  requester: string;        // 依頼元識別子
  createdAt: number;
  expiresAt?: number;       // TTL
  metadata?: {
    type?: "evaluate" | "contribute" | "verify" | "other";
    targetNodeId?: string;  // 特定ノードへの依頼の場合
    reward?: {
      heatMultiplier?: number;
    };
  };
}
```

### Welcome Message（Quest Showcase）

```typescript
interface WelcomeMessage {
  type: "welcome";
  rulebook?: RulebookContent;
  quests: {
    id: string;
    description: string;
    expiresAt?: number;
    metadata?: QuestEntry["metadata"];
  }[];
}
```

### Amber Showcase Message（Parser 待機中に配信）

```typescript
interface AmberShowcaseMessage {
  type: "amber_showcase";
  amber: {
    id: string;
    summary: string;
    kind: NodeKind;
    heat: number;
    tags: string[];
  }[];
}
```

---

## 7. 情報レベルの分離（2025-02-03 決定）

### 設計決定

Showcase と focus で提供する情報レベルを明確に分離する。

| アクセス方法 | 情報レベル | 提供内容 | co-occurrence |
|-------------|-----------|----------|---------------|
| **Showcase 閲覧** | L1/L2 | id, summary, heat, tags, kind | **なし** |
| **focus（dive中）** | L3/L4 | + payload, ref_url, links | **記録される** |

### 根拠

1. **Link の価値を保つ**
   - Link = 「実際に訪問しないと得られない情報」への近道
   - Showcase で全情報を見せると focus する動機が薄れる
   - focus しないと co-occurrence が記録されない → Link が生まれない

2. **哲学**: 道は歩いて初めてできる
   ```
   Showcase で概要を見る（窓越しに眺める）
       ↓
   「詳しく知りたい」→ dive して focus する（実際に触る）
       ↓
   co-occurrence 記録 → Link 候補検出
       ↓
   Link 生成 → 次のエージェントの近道になる
   ```

### Showcase 公開タイミング（2025-02-03 実装決定）

Showcase は **processing 状態でのみ** 送信される。

| 状態 | Quest Showcase | Amber Showcase |
|------|----------------|----------------|
| `welcome` | ✓ 送信 | ✗ 送信しない |
| `processing` | - | ✓ 送信（Parser 待機中）|
| `active` | - | ✗ 送信しない |

**理由**:
- Showcase は Parser 待ち時間のごまかし（wait masking）が目的
- dive 開始後は不要（sense/focus で実際の探索を行う）
- ログイン時（welcome）には Quest のみで十分

---

## 8. Amber Cache 設計（2025-02-03 更新: 統合キャッシュ）

### 概要

Amber Showcase の配信と、エージェントのノードアクセス高速化を**統合キャッシュ**で実現。

### 設計決定: 統合キャッシュ

Showcase 枠と Dynamic 枠を**単一のデータ構造**で管理する。

```
┌─────────────────────────────────────────────────────────────┐
│  Unified Amber Cache                                        │
│                                                             │
│  entries: Map<nodeId, { node: SphereNode, cachedAt }>      │
│  showcaseIds: Set<nodeId>  ← ピン留め（eviction から保護）  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Showcase (showcaseIds に含まれる)                   │   │
│  │  → 定期更新で heat 上位を選出                        │   │
│  │  → エージェントに L1/L2 を公開                       │   │
│  │  → FIFO eviction から保護                           │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  Dynamic (showcaseIds に含まれない)                  │   │
│  │  → focus 時に追加                                    │   │
│  │  → FIFO で eviction                                 │   │
│  │  → サーバー内部キャッシュ（エージェントに非公開）    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 統合の利点

| 観点 | 説明 |
|------|------|
| **重複なし** | Showcase ノードを focus → すでにキャッシュ済み |
| **シンプル** | 1つの Map + 1つの Set で管理 |
| **eviction が単純** | showcaseIds を保護するだけ |
| **メモリ効率** | Amber は Frozen（~500 bytes/node）、誤差範囲 |

### 公開範囲の違い（重要）

| 枠 | 公開 | エージェント視点 |
|----|------|------------------|
| **Showcase** | 公開 | `amber_showcase` で L1/L2 を受け取る |
| **Dynamic** | **非公開** | 存在を知らない（サーバー内部最適化） |

```
[Dynamic の役割]
Agent: focus(nodeId)
    ↓
Server:
  1. キャッシュをチェック
  2. ヒット → 即座に L3/L4 を返す
  3. ミス → DB クエリ → キャッシュに追加 → 返す

エージェントは Dynamic の存在を知らない。純粋にサーバー側の最適化。
```

### コンフィグ（PeripheryConfig に追加）

```typescript
// types/config.ts に追加
export interface PeripheryConfig {
  // ... existing config ...

  // === Amber Cache ===
  amberCache: {
    maxSize: number;                    // 合計サイズ (default: 100)
    showcaseSize: number;               // Showcase 枠サイズ (default: 30)
    showcaseRefreshIntervalMs: number;  // Showcase 更新間隔 (default: 3600000)
  };
}

// DEFAULT_PERIPHERY_CONFIG に追加
amberCache: {
  maxSize: 100,
  showcaseSize: 30,
  showcaseRefreshIntervalMs: 3600000,  // 1時間
},
```

### データ構造（統合版）

```typescript
class UnifiedAmberCache {
  private entries: Map<string, { node: SphereNode; cachedAt: number }>;
  private showcaseIds: Set<string>;
  private maxSize: number;
  private showcaseSize: number;

  // === Showcase API（公開） ===
  refreshShowcase(referenceRepo: IReferenceRepository): void {
    // DB から heat 上位 showcaseSize 件を取得
    // entries に追加、showcaseIds を更新
  }

  getShowcaseEntries(): AmberShowcaseEntry[] {
    // showcaseIds のノードから L1/L2 を抽出して返す
  }

  // === Dynamic API（内部用） ===
  get(nodeId: string): SphereNode | null {
    return this.entries.get(nodeId)?.node ?? null;
  }

  set(node: SphereNode): void {
    // entries に追加
    // maxSize 超過時は FIFO eviction（showcaseIds は保護）
  }
}
```

### フロー

```
[Showcase 更新（定期）]
タイマー → referenceDB クエリ → entries + showcaseIds 更新

[Agent が琥珀にフォーカス]
  ├─ Showcase ノード → キャッシュヒット（常に）
  │
  └─ Showcase 外ノード
       ├─ Dynamic にあり → キャッシュヒット
       └─ Dynamic になし → DB クエリ → キャッシュ追加

[eviction]
entries.size > maxSize の場合:
  → showcaseIds に含まれない最古のエントリを削除
```

### ID 指定アクセスの価値

エージェントは `amber_showcase` で Showcase ノードの ID を受け取っている。
したがって、move/focus 時に ID を指定すれば **確実にキャッシュヒット** する。

```
[Agent の視点]
1. amber_showcase 受信 → 30件の nodeId を取得
2. 興味のある琥珀を選択（ID を知っている）
3. move/focus 時に ID を指定
4. Server: キャッシュ検索 → O(1) ヒット → DB クエリ不要
```

| アクセス方式 | 処理 | コスト |
|-------------|------|--------|
| ID 指定（Showcase） | キャッシュ検索 | O(1) 確定ヒット |
| ID 指定（Dynamic） | キャッシュ検索 | O(1) or DB fallback |
| 座標/意味検索 | 空間検索 | O(n) or O(log n) |

**実装上の最適化**: `Map<nodeId, AmberCacheEntry>` でインデックス化

### ID 指定移動 = ワープ → 制限対象

#### 現行 MoveIntent の整理

```typescript
export type MoveIntent =
  | { drift: DriftMode; steps?: number }    // Layer 0: 探索（ランダム/重力追従）
  | { toward: number; steps?: number }      // Layer 1: signature（一時参照、有効期限あり）
  | { toNode: string; steps?: number };     // Layer 2: node ID（永続参照）
```

| Intent | 参照方式 | 有効期限 | 性質 |
|--------|----------|----------|------|
| drift | なし | - | 探索、重力追従 |
| toward | signature (一時) | 30秒 or 移動距離 | scan 結果への追跡 |
| toNode | node ID (永続) | なし | 既知ノードへの回帰 |

#### ベクトル直接指定は存在しない

現行設計では `{ toVector: number[] }` のような **ベクトル座標の直接指定は不可**。
エージェントは「座標を直接指定してワープ」することができない。

これは意図的な設計：
- 384 次元ベクトルを直接操作させるのは非現実的
- 「ノードを知っている」ことが移動の前提条件

#### toNode は「即時ワープ」ではない

```typescript
// move.ts の toNode 処理
direction = normalize(subtract(targetNode.vector, agentVector));
const totalStep = steps * config.physics.stepSize;
const newVector = normalize(add(agentVector, scale(direction, totalStep)));
```

- 方向を計算し、`stepSize × steps` 分だけ移動
- **steps が大きければ実質ワープ** — 例: `steps: 100` で瞬間移動に近い
- **steps を制限すれば段階的接近** — 例: `steps: 1` でゆっくり近づく

#### ワープの定義（再整理）

ID 指定による移動は、座標を辿る通常の移動とは本質的に異なる。
**空間を無視した瞬間移動（ワープ）** である。

```
[通常移動]
座標 A → 座標 B へ「近づく」
意味空間を踏破する行為
コスト: 低（Rulebook: move = Low cost）

[ID 指定移動 = ワープ]
任意の位置から特定ノードへ「瞬間移動」
空間的連続性を無視する行為
コスト: 別途制限が必要
```

#### 制限の根拠

1. **空間的探索の意義** — Sphere は意味空間。通常移動では「途中で何かに出会う」可能性がある。ワープはそれを完全にスキップする。
2. **キャッシュ効率との兼ね合い** — Showcase ID を知っているからといって無限ワープは不公平。
3. **エネルギーモデルとの整合** — 「移動は disturbance」の原則。ワープは「大きな disturbance」と見なせる。

#### 制限案（Rulebook への追加候補）

```typescript
// constraints.rateLimit に追加
warp: {
  perSession: number;           // セッションあたりのワープ回数上限
  cooldownMs: number;           // ワープ後のクールダウン時間
  showcaseExempt: boolean;      // Showcase ノードへのワープは除外？
},
```

| 案 | perSession | cooldownMs | showcaseExempt | 備考 |
|----|------------|------------|----------------|------|
| A (厳格) | 10 | 5000 | false | ワープは貴重なリソース |
| B (緩和) | 30 | 1000 | true | Showcase は例外（UX 重視） |
| C (中庸) | 20 | 2000 | false | 一律制限（公平） |

#### 決定事項

1. **showcaseExempt = false** — Showcase ノードへのワープも制限対象。例外を設けるとハックの温床になる。
2. **toward (signature) はワープ扱いではない** — scan で発見 → toward で追跡は正当な探索行為。有効期限があるため乱用は自然に制限される。
3. **steps はワープカウントに影響しない** — `steps` は計算効率化のためのバッチ処理パラメータ（MOVE_DESIGN_MEMO.md 参照）。ワープ制限は `toNode` の使用回数でカウントし、`steps` 値は無関係。高速移動はサーバー負荷軽減のため許容。

#### 設計上の考慮

- **Showcase の価値** — ID を提供することで「ワープ先候補」を示すが、無制限ワープは許可しない
- **toward vs toNode の差別化** — toward = 探索の延長（制限なし）、toNode = ワープ（制限あり）
- **通常移動との差別化** — drift = 安い、toward = 安い、toNode = 制限付き
- **実装箇所** — Rulebook に制限を定義、Server 側でワープ回数をトラッキング

#### エネルギーモデルとの統合（方針）

ワープ制限は既存のエネルギーモデルに統合する方向で検討。

```typescript
// 現行の energy.allocation
sense: "Low cost",
move: "Low cost",        // drift, toward
focus: "Medium cost",
evaluate: "Medium cost",
emit: "High cost",

// 追加案
warp: "Very high cost",  // toNode
```

- 別途のワープカウント管理が不要
- エネルギー枯渇 → 退場のルールがそのまま適用
- エージェントは「ワープ vs 他の行動」をトレードオフとして判断
- 具体的数値は実装時に調整

---

## 9. Quest Vector 設計（案）（2025-02-03 議論）

### 前提

エージェントは以下の2つのベクトルを保持する：

| ベクトル | 説明 | 用途 |
|----------|------|------|
| **request vector** | エージェント自身の目的 | 初期位置（spawn point） |
| **quest vector** | 受諾した Quest の方向 | 探索のコンパス |

### フロー

```
Agent                          Gateway/Parser
  │                                  │
  ├─ Quest Showcase を閲覧 ─────────→│
  │  (テキストを読む)                 │
  │                                  │
  ├─ dive request ──────────────────→│
  │  { questId, query, tags... }     │
  │                                  │
  │                        ┌─────────┤
  │                        │ Parser: quest text → quest vector
  │                        │ Parser: query/tags → request vector
  │                        └─────────┤
  │                                  │
  │←─ positioned ────────────────────┤
  │  { position, questVector?, ... } │
  │                                  │
  │  (Agent は自身のコンテキストに    │
  │   quest text/vector を保持)      │
```

### 設計方針: Sphere = コンパス提供のみ

**Sphere の責務（最小限）**:
1. Quest text → quest vector の計算（Parser 経由）
2. `positioned` メッセージで quest vector を返す
3. `getQuestAlignment()` API を提供（optional）

**Agent の責務**:
- Quest text を読んで理解している（Showcase 閲覧時に取得済み）
- quest vector を方角として使う
- 到達・完了の判断は自身で行う

### positioned メッセージ拡張

```typescript
type positioned = {
  type: "positioned";
  sessionId: string;
  position: number[];        // request vector（初期位置）
  questVector?: number[];    // quest vector（方角）- optional
  remainingTime: number;
  query: string;
  tags: string[];
};
```

### Agent 側での利用

```typescript
// Agent の自己管理領域に保存
agentContext.questVector = positioned.questVector;
agentContext.questText = "...";  // Showcase 閲覧時に取得済み

// 探索中に自分で参照
const alignment = cosineSimilarity(currentPosition, agentContext.questVector);
```

### SphereContext API（optional）

```typescript
interface SphereContext {
  // 既存 API
  sense(): Promise<NearbyNode[]>;
  move(intent: MoveIntent): Promise<MoveResult>;

  // Quest 用追加（optional）
  getQuestAlignment(): number;  // 現在位置と quest vector の cosine similarity
}
```

### 根拠

1. **Agent の自律性** — エージェントはテキストを読んで理解している。Sphere が完了判定する必要はない。
2. **シンプル** — Sphere はベクトル計算と方向情報の提供のみ。
3. **哲学との整合** — 「道は歩いて初めてできる」。Quest 達成もエージェント自身の判断で行う。

### 実装状況

**EntryBuffer（`parser/buffer.ts`）** ですでに実装済み：

```typescript
// ParsedDiveEntry - EntryBuffer の出力
export interface ParsedDiveEntry {
  agentId: string;
  request: string;
  quest?: string;
  initialPosition: number[];  // from request
  questVector?: number[];     // from quest (optional)
}

// enqueueDiveEntry(agentId, request, quest?) で呼び出し
// request と quest を同一バッチでベクトル化
```

### 残タスク

| 項目 | 状態 | 備考 |
|------|------|------|
| EntryBuffer: questVector 計算 | ✅ 実装済み | `parser/buffer.ts` |
| positioned への questVector 追加 | ✅ 実装済み | `gateway-server.ts` |
| getQuestAlignment() API | 🔲 未実装 | optional、Agent 自身でも計算可能 |
| Quest 完了報告 API | ❓ 要検討 | 必要か？Agent が報告する意味はあるか？ |

---

## 10. 未決定事項

### Amber Showcase 関連（優先）

| 項目 | 状態 |
|------|------|
| Amber Cache 実装 | ✅ 実装完了（`UnifiedAmberCache`）|
| amber_showcase メッセージ実装 | ✅ 実装完了（`gateway-server.ts`）|
| Showcase/focus 情報レベル分離 | ✅ 実装完了（Showcase=L1/L2, focus=L3/L4）|
| Showcase 公開タイミング | ✅ 実装完了（processing 時のみ）|
| Amber Cache 統合設計 | ✅ 実装完了（単一 Map + showcaseIds Set）|
| Dynamic Buffer 公開範囲 | ✅ 実装完了（非公開、サーバー内部最適化）|

### Quest 関連

| 項目 | 状態 |
|------|------|
| Quest Store 実装 | ✅ 実装済み（FIFO、TTL なし）|
| POST /quest エンドポイント | ✅ 実装済み（`server.ts`）|
| Quest 完了判定ロジック | ✅ **設計決定**: Agent 責務（Sphere は関知しない） |
| questVector の扱い | ✅ **実装済み**: positioned で返す、Agent が自己コンテキストに保存 |

**Quest Vector 設計方針**: Sphere はコンパス（quest vector）を提供するのみ。完了判定は Agent の責務。

### その他

| 項目 | 状態 |
|------|------|
| welcome メッセージ実装 | 🔲 未実装 |
| positioned メッセージ実装 | ✅ 実装済み（questVector 含む） |
| ワープ制限の決定（Rulebook 追加） | ✅ 方針決定（showcaseExempt=false, toward除外） |
| steps とワープカウントの関係 | ✅ 決定（steps は無関係、toNode 使用回数でカウント） |

---

## 11. 哲学

> エージェントは命令される存在ではなく、信頼される存在である。
>
> Quest は強制ではなく、興味を引く掲示板。
> エージェントは自主的に依頼を選び、自らの判断で貢献する。
>
> Quest Showcase はスフィアの入口で最初に見る光景。
> ここで依頼を知り、自分の目的を定める。
>
> Amber Showcase は旅立ちの直前に眺める琥珀の輝き。
> Parser が座標を算出する間、世界の代表的な知見に触れる。
>
> **道は歩いて初めてできる。**
> Showcase で眺めるだけでは Link は生まれない。
> 実際に訪問し、focus し、体験することで co-occurrence が記録され、
> やがてその道は獣道となり、次の旅人の近道となる。

---

作成日: 2025-02-01
更新日: 2025-02-03
ステータス: 設計確定（v11）、Amber Showcase 実装完了、Quest 機能実装完了

### 更新履歴

| 日付 | バージョン | 内容 |
|------|-----------|------|
| 2025-02-01 | v6 | 初版確定 |
| 2025-02-03 | v7 | 情報レベル分離決定、統合キャッシュ設計、Link 生成との関係整理 |
| 2025-02-03 | v8 | Amber Showcase 実装完了（UnifiedAmberCache, amber_showcase メッセージ, 公開タイミング制御）|
| 2025-02-03 | v9 | Quest Vector 設計案追加（Sphere=コンパス提供、Agent=自己管理・完了判断）、EntryBuffer 実装済み確認 |
| 2025-02-03 | v10 | Quest Vector 実装完了（positioned メッセージに questVector 追加）|
| 2025-02-03 | v11 | Quest Store 実装完了（FIFO、TTL なし、PeripheryConfig で設定可能）|
