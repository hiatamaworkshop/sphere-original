# 修正メモ: Membrane 役割の設計誤り

作成日: 2026-02-01

---

## 問題の概要

IncarnationPipeline（受肉パイプライン）に Membrane が含まれているが、これは設計誤りである。

## 現状

### pipeline.ts のフロー
```
Capsule → Membrane → Gatekeeper → Tagger → Packer → Bookkeeper
```

### Membrane の実装内容
- 禁止パターンフィルタ（summary の内容検閲）
- 正規化（trim, flags範囲制限）
- **バグ**: `schemaVersion`, `evaluations` を返り値から落としている

### Gatekeeper の実装内容
- カプセル構造検証（ノード数制限）
- サイズ検証（payload, summary長）
- heat 範囲検証（0-100）

---

## 問題点

### 1. 役割の混在
Membrane.ts のヘッダーに「API Gateway / Request Normalizer」と書いてあるが、実際は ExperienceCapsule のデータ検閲をしている。

### 2. パイプラインの位置がおかしい
受肉パイプラインは **データ変換プロセス** である：
```
ExperienceCapsule → [検証] → [ベクトル化] → [ノード構築] → [DB保存]
```

来訪者サニタイズ（Membrane の本来の役割）は **HTTPレイヤ** で行うべき：
```
HTTP Request → [Membrane: 認証/Rate Limit/IP] → Controller → Pipeline
```

### 3. データ欠損バグ
Membrane.sanitize() が `schemaVersion` と `evaluations` を落としている。

---

## Membrane の本来の役割

### 接続フロー（divingExperience.md 準拠）
```
Agent 接続
    ├── ルールブック・常設情報の閲覧（先に学ぶ）
    ↓
Agent がエントリーリクエストを作成（ルールに従って）
    ↓
Membrane による検疫（ルール準拠チェック）
    ↓
Parser がリクエストをベクトル変換（384次元）
    ↓
SphereContext 生成 → Agent へ手渡し
```

### 設計思想
```
1. エージェントは GET /rulebook でルールブックを取得
2. エージェントはルールブックに従ってリクエストを作成
3. Membrane は「ルールブックに従っているか」をチェック
4. Parser がリクエストをベクトル化（初期位置決定）
5. 不正なデータは拒絶するが、ムヤミに来訪者を拒絶しない
```

### Membrane の検閲対象（ルールブック準拠チェック）
- 適切なタグ分解が出来ているか
- 構造がルールブックの仕様に合っているか
- エージェントが「理解して」データを作ったか

### Membrane がやらないこと
- 認証・Rate Limit（→ 別途ミドルウェアで実装）
- 恣意的なコンテンツ拒絶
- IP制限等のセキュリティ（→ ミドルウェア）

---

## 来訪者リクエストの実態

### WebSocket Agent Messages (gateway-server.ts)
```typescript
type AgentMessage =
  | { type: "sense"; requestId: string; radius?: number }
  | { type: "focus"; requestId: string; nodeId: string }
  | { type: "evaluate"; requestId: string; nodeId: string; score: number }
  | { type: "move"; requestId: string; intent: MoveIntent }
  | { type: "return"; requestId: string; capsule?: ExperienceCapsule };
```

### 各フィールドの性質
| フィールド | 型 | 検証内容 |
|-----------|-----|---------|
| requestId | string | UUID形式 |
| radius | number | 正の数、上限あり |
| nodeId | string | UUID形式 |
| score | number | -1.0 〜 1.0 |
| intent | MoveIntent | dx/dy/dz, toNode等 |
| capsule | ExperienceCapsule | **Membrane + Gatekeeper で検証** |

---

## 正しい設計

| コンポーネント | レイヤ | 対象 | 責務 |
|---------------|--------|------|------|
| Middleware | Express/WS | Request | 認証、Rate Limit、IP制限（セキュリティ） |
| Membrane | Gateway | AgentMessage | ルールブック準拠チェック（タグ分解等） |
| Gatekeeper | Pipeline | ExperienceCapsule | 構造検証、サイズ制限 |

---

## 修正方針

### Phase 1: パイプラインから現 Membrane を除去 ✅ 完了
1. ✅ `pipeline.ts` から Membrane 呼び出しを削除
2. ✅ `index.ts` から Membrane インスタンス生成を削除（パイプライン用）
3. ✅ 現在の「禁止パターンフィルタ」は削除（恣意的拒絶のため）

### Phase 2: Membrane を本来の役割に再設計 ✅ 完了
1. ✅ **ルールブック準拠チェッカー** として再実装
2. ✅ チェック項目:
   - タグが適切に分解されているか
   - NodeSeed の構造がルールブックに準拠しているか
   - summary の形式が適切か
3. ✅ Gateway レイヤで呼び出し（AgentMessage 処理時）

### Phase 2.5: EntryRequest フロー統合 ✅ 完了
1. ✅ `EntryRequest` 型定義 (`types/gateway.ts`)
2. ✅ `ENTRY_CONSTRAINTS` をルールブックに追加 (`rulebook/index.ts`)
3. ✅ Membrane に `validateEntry()` 追加
4. ✅ Gateway **3段階フロー**実装:
   - `pending` → EntryRequest 待機
   - `processing` → Parser 変換中（**チュートリアル/琥珀閲覧可能**）
   - `active` → フルダイブ開始
5. ✅ Parser に `vectorizeTags()` 追加
6. ✅ Parser 変換の**非同期化**（Agent は待機中に sense 可能）

### Phase 2.6: 設計メモとの整合性修正 ✅ 完了
1. ✅ メッセージ名変更: `connected` → `welcome`, `ready` → `positioned`
2. ✅ EntryRequest に `quest?` フィールド追加（Quest 応答用）
3. ✅ `welcome` メッセージに Quest Showcase 追加
4. ✅ Quest Showcase は Quest Store から取得（スタブ実装、TODO: Quest Store 実装）
   - Quest ≠ ProjDB node（Quest は別ストレージ）
5. ✅ Amber Showcase 設計確認
   - Dynamic 枠: `SphereCoreAdapter.amberCache` として実装済み（focus 時追加、FIFO eviction）
   - Showcase 枠: TODO - referenceDB から kind:"amber" をフィルタした固定枠
   - `amber_showcase` メッセージ: TODO - Parser 待機中に Showcase 枠の内容を送信

### Phase 3: セキュリティ用ミドルウェア（将来）
- 認証・Rate Limit は Express/WS ミドルウェアで実装
- Membrane とは別のコンポーネント
- IP制限、セッション管理等

---

## 修正済みファイル

### Phase 1
- `services/periphery/src/incarnation/pipeline.ts` - Membrane 除去
- `services/periphery/src/index.ts` - Membrane 除去

### Phase 2
- `services/periphery/src/membrane/membrane.ts` - ルールブック準拠チェッカーに書き換え
- `services/periphery/src/gateway/gateway-server.ts` - 2段階フロー実装

### Phase 2.5
- `services/periphery/src/types/gateway.ts` - EntryRequest, ParsedEntry 型追加
- `services/periphery/src/rulebook/index.ts` - ENTRY_CONSTRAINTS 追加
- `services/periphery/src/parser/parser.ts` - vectorizeTags() 追加
- `services/periphery/src/server.ts` - Parser を GatewayServer に注入

### Phase 2.6
- `services/periphery/src/types/gateway.ts` - EntryRequest に quest? フィールド追加
- `services/periphery/src/gateway/gateway-server.ts` - メッセージ名変更、Quest Showcase 追加

---

## 新しい接続フロー（3段階）

```
Agent 接続 (token)
    ↓
Gateway: token 検証 → "welcome" 送信 [state: pending]
    │       { rulebookUrl, quests: QuestShowcase }
    │
    ├── Agent: Quest Showcase 閲覧（パーサー使用前に可能）
    │
    ↓
Agent: GET /rulebook → ルールブック取得
    ↓
Agent: EntryRequest 送信 { query, tags, quest? }
    ↓
Membrane: validateEntry() → ルールブック準拠チェック
    ↓
Gateway: "processing" 送信 [state: processing]
    │
    ├── Agent: amber_showcase 受信（TODO: Showcase 枠から配信）← 待機中に閲覧可能
    │
    ↓ (非同期)
Parser: vectorize(query + tags) → 384次元ベクトル
    ↓
SphereContext 生成 (初期位置付き)
    ↓
Gateway: "positioned" 送信 { position, remainingTime } [state: active]
    ↓
Agent: sense/focus/move/evaluate/return（フルダイブ）
```

### 3段階の接続状態

| 状態 | 許可される操作 | 説明 |
|------|--------------|------|
| `pending` | `entry` のみ | EntryRequest 待ち |
| `processing` | `sense` のみ | Parser 変換中、チュートリアル/琥珀閲覧可 |
| `active` | 全操作 | フルダイブ（探索・干渉・帰還） |

---

## 参照

- `pipeline.ts:9` - フローコメント
- `membrane.ts:5-6` - 役割定義
- `gatekeeper.ts:4` - Capsule Validator
- `gateway-server.ts` - 2段階接続フロー

---

ステータス: **Phase 1, 2, 2.5, 2.6 完了** / Phase 3 未着手

---

## 設計整合性確認（SHOWCASE_QUEST_DESIGN_MEMO.md との照合）

### Quest / Amber の保存先とフロー

```
┌─────────────────────────────────────────────────────────────┐
│  Quest（依頼テキスト）                                        │
├─────────────────────────────────────────────────────────────┤
│  保存先: Quest Store（ProjDB ではない）                       │
│  起源: 外部 POST /quest                                      │
│  配信: welcome メッセージの quests フィールド                 │
│  タイミング: Parser 使用前（Agent が quest を選ぶため）        │
│                                                             │
│  フロー:                                                     │
│    POST /quest → Quest Store → welcome.quests               │
│    Agent が quest を選択 → EntryRequest { quest }            │
│    → ParserBuffer で quest テキストをベクトル化              │
│    → questVector として Agent にガイド提供                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Amber Cache（琥珀キャッシュ）= Dynamic Buffer                │
├─────────────────────────────────────────────────────────────┤
│  保存先: SphereCoreAdapter.amberCache（ONE storage）          │
│  実装: ✅ sphere-core-adapter.ts:99-168                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Showcase 枠 = Dynamic Buffer の部分配信              │   │
│  │   → amber_showcase メッセージで先頭 N 件を配信       │   │
│  │   → Parser 待機中の Agent が閲覧                     │   │
│  │   → 実装: 🔲 TODO                                    │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ キャッシュ用途                                       │   │
│  │   → focus() 時のキャッシュヒット高速化               │   │
│  │   → 後続 Agent が同じノードにアクセス → O(1)         │   │
│  │   → 実装: ✅ 完了                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [重要] 別の referenceDB クエリは不要                         │
│         Dynamic Buffer の中身を部分的に見せるだけ             │
└─────────────────────────────────────────────────────────────┘
```

### メッセージフロー（設計メモ準拠）

```
Agent 接続 (token)
    ↓
Gateway: "welcome" 送信
    │   { rulebookUrl, quests: Quest Store から取得 }
    │
    ├── Agent: Quest Showcase 閲覧（Parser 前に可能）
    │
    ↓
Agent: EntryRequest 送信 { query, tags, quest? }
    ↓
Membrane: validateEntry()
    ↓
Gateway: "processing" 送信
    │
    ├── Gateway: "amber_showcase" 送信（TODO: Showcase 枠から）
    │   Agent: 琥珀を眺める（Parser 待機中）
    │
    ↓ (非同期)
ParserBuffer: request + quest をバッチベクトル化
    ↓
SphereContext 生成
    ↓
Gateway: "positioned" 送信 { position, questVector?, remainingTime }
    ↓
Agent: フルダイブ開始
```

### 実装状況

| 機能 | 設計メモ | 実装 |
|------|---------|------|
| Quest Store | Quest 保存先 | ✅ gateway/quest-store.ts |
| POST /quest | Quest 投稿 API | ✅ server.ts |
| welcome.quests | Quest Showcase 配信 | ✅ gateway-server.ts |
| ParserBuffer.quest | Quest ベクトル化 | ✅ parser/buffer.ts |
| Dynamic Buffer | Amber キャッシュ | ✅ SphereCoreAdapter.amberCache |
| amber_showcase | Dynamic Buffer 部分配信 | 🔲 TODO |

### 関連ファイル

- `SHOWCASE_QUEST_DESIGN_MEMO.md` - 設計仕様
- `gateway/quest-store.ts` - Quest Store（依頼テキスト保存）
- `gateway-server.ts` - メッセージ送信、Quest Showcase 配信
- `sphere-core-adapter.ts` - Amber キャッシュ（Dynamic Buffer）
- `parser/buffer.ts` - ParserBuffer（quest ベクトル化）
- `server.ts` - POST /quest エンドポイント

---

## Dynamic Buffer 設計決定

### 背景（QUEST_REQUEST_MEMO.md より）

```
問題: focus() は負荷が高い

案1: 分離案
  ├── showCaseBuffer[30] 固定枠、代表琥珀、全公開OK
  └── focusBuffer[70] FIFO、focus時キャッシュ、非公開

案2: 統合案
  └── dynamicBuffer[100] 固定+可変を統合

結論: 「分けても良い　役割が違うから」
```

### 採用: 統合案（案2）

```
┌─────────────────────────────────────────────────────────────┐
│  Dynamic Buffer [100]                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Showcase 枠 [先頭30件]                               │   │
│  │   - referenceDB から初期ロード（代表琥珀）           │   │
│  │   - 時折入れ替え可能（showcase_refresh_rate）        │   │
│  │   - amber_showcase メッセージで全公開                │   │
│  │   - Parser 待機中 + 探索中に閲覧可能                 │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Focus 枠 [残り70件]                                  │   │
│  │   - focus() 時に追加（FIFO eviction）                │   │
│  │   - キャッシュヒット用（非公開）                     │   │
│  │   - 同じ琥珀への再 focus を高速化                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [利点]                                                     │
│    - ONE storage で管理シンプル                             │
│    - Showcase 枠も Focus でヒットすればキャッシュ活用       │
│    - 入れ替え可能で柔軟                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 実装方針

| 項目 | 内容 |
|------|------|
| ストレージ | `SphereCoreAdapter.amberCache` (既存) |
| Showcase 初期化 | サーバー起動時に referenceDB から kind:"amber" をロード |
| Showcase 更新 | `showcase_refresh_rate` で定期的に入れ替え |
| Focus 追加 | `focus()` 時に FIFO で追加（既存実装） |
| 配信 | `amber_showcase` メッセージで先頭30件を送信 |

### 現在の実装状況

| 機能 | 状態 |
|------|------|
| amberCache (FIFO) | ✅ 完了 |
| focus() キャッシュ | ✅ 完了 |
| Showcase 初期ロード | 🔲 TODO |
| Showcase 定期更新 | 🔲 TODO |
| amber_showcase 送信 | 🔲 TODO |
