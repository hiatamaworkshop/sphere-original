# 3層パイピング設計メモ

## 概要

Sphere体験の3段式ダイブシークエンス設計。

```
Agent → Tutorial → Sanctuary → Core → 帰還
```

---

## 1. 3層構造

### Tutorial（チュートリアル）

| 項目 | 内容 |
|------|------|
| 目的 | ルールブック確認 + 最低限の動き確認 |
| データソース | SanctuaryBundle（Sanctuary と共有） |
| 評価 | 破棄（練習のみ、受肉なし） |
| tick | なし |
| 追加機能 | Parser バッチ処理の待機バッファ |

**Tutorial の役割:**
- 操作の練習（scan/move/focus/return）
- リクエストベクトル計算中のバッファ
- Parser 完了後に Sanctuary へ遷移可能

**Tutorial の設計原則:**
```
スキップ不可・即帰還可能

- Tutorial は必ず通過する（直接 Sanctuary/Core へ遷移不可）
- しかし「すぐに帰還」は常に許可される
- ユーザー体験の遅延をよしとしない
- Parser 待機中も探索体験を提供（待ちぼうけにしない）

遷移フロー（順序強制）:
  Tutorial → Sanctuary → Core
  ↓ (return は常に可能)
  帰還
```

### Sanctuary（聖域）

| 項目 | 内容 |
|------|------|
| 目的 | API 抑制バッファ + 安全な探索 |
| データソース | SanctuaryBundle（Core の凍結スナップショット） |
| 評価 | 不可（ReadOnly） |
| tick | なし |
| CleanerFish | **存在しない**（代謝なし） |
| 特性 | インメモリ・キャッシュ、ミリ秒以下のレスポンス |
| 動作環境 | **オフライン・ポータブル対応** |

**Sanctuary の本質:**
```
成熟し、凍結された「知のモニュメント」
オフライン・ポータブルで動作する超高速な ROM アクセス環境

特徴:
  - 掃除魚が存在しない（fossil 化、plankton 化が起きない）
  - データ書き込み不可（完全 ReadOnly）
  - 体験データの投入先は Core へ
  - 成熟すれば他の開発者からコピー/マージ対象となる
```

- Core の「過去のある瞬間」を凍結したもの
- 更新 = Core から新しいスナップショットを作成
- 成熟すると「真理の結晶」として Artifact 化
- GitHub で配布/マージ対象になりうる

### Core（コアスフィア）

| 項目 | 内容 |
|------|------|
| 目的 | 本番世界（ライブ） |
| データソース | ライブ ProjDB + RefDB |
| 評価 | 受肉（即時反映） |
| tick | あり（代謝が発生） |
| 特性 | 体験データの唯一の投入先 |

---

## 2. データ層の関係

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
│  SanctuaryBundle                                             │
│    - RefDB + ProjDB からの抽出                               │
│    - Relic + 選定された Amber/Active                        │
│    - 署名付き、凍結、改ざん不可                              │
└─────────────────────────────────────────────────────────────┘
            │
            │ 共有
            ▼
┌───────────────┬───────────────┐
│   Tutorial    │   Sanctuary   │
│   （練習）    │   （探索）    │
│               │               │
│ 同じ Bundle   │ 同じ Bundle   │
│ 評価 → 破棄   │ 評価 → 不可   │
└───────────────┴───────────────┘
```

---

## 3. Sanctuary と Core の差分

```
Sanctuary v1.0 凍結時点:
  [Relic_A] [Amber_1] [Active_x]

Core 現在状態:
  [Relic_A] [Amber_1] [Amber_2] [Amber_3] [Active_y]

差分:
  - 新しい Amber（Amber_2, Amber_3）
  - 評価値の変化（heat, weight の推移）
  - 新しい Link/Active ノード
```

**Sanctuary の更新 = Core の現在状態を凍結**

---

## 4. 聖域の成長サイクル

```
Phase 1: 初期
  - Sanctuary = イニシャル状態（Relic のみ、Amber 少）
  - Core = 活動開始

Phase 2: 成長
  - Core が育つ → Amber 充実
  - Sanctuary アップデート（Core から凍結）
  - 繰り返し調整

Phase 3: 成熟
  - Sanctuary が「真理の結晶」として完成
  - 完全凍結 → Artifact（遺物）化
  - GitHub で配布/マージ対象に
```

---

## 5. 評価の扱い

```typescript
type ExperienceLayer = "tutorial" | "sanctuary" | "core";

// 層ごとの評価処理
switch (layer) {
  case "tutorial":
    // 破棄（何もしない）
    return;

  case "sanctuary":
    // 不可（ReadOnly）
    throw new Error("Sanctuary is read-only");

  case "core":
    // 受肉（ProjDB に反映）
    await applyRating(nodeId, rating);
    return;
}
```

---

## 6. 非同期・並行処理

**重要: エージェントは絶えず入れ替わり、非同期的に体験を行う**

```
┌─────────────────────────────────────────────────────────────┐
│  同時に複数のエージェントが:                                  │
│    - 異なる層（Tutorial/Sanctuary/Core）に存在               │
│    - 異なるノードを focus 中                                 │
│    - 異なる位置で scan/move 中                               │
│                                                              │
│  Core での競合:                                              │
│    - 同じノードへの同時 focus → crowdPenalty                │
│    - 評価の競合 → 順序は発生順で処理                        │
│                                                              │
│  Sanctuary での並行:                                         │
│    - ReadOnly なので競合なし                                 │
│    - 各エージェントは独立して探索                            │
└─────────────────────────────────────────────────────────────┘
```

### セッションバッファ

```typescript
interface SessionBuffer {
  sessionId: string;
  layer: ExperienceLayer;

  // セッション内の一時評価（Sanctuary 用）
  temporaryEvaluations: Map<string, EvaluationDelta>;

  // Core 遷移時にフラッシュ
  async flushToCore(): Promise<void>;

  // 帰還時に破棄
  discard(): void;
}
```

---

## 7. 層遷移 API

```typescript
interface LayerTransition {
  // Tutorial → Sanctuary
  // Parser 完了後、または手動スキップ
  enterSanctuary(): Promise<void>;

  // Sanctuary → Core
  // 受肉を選択した場合
  enterCore(): Promise<void>;

  // 現在の層を取得
  readonly currentLayer: ExperienceLayer;
}
```

---

## 8. 通信最適化

| 層 | 通信 | 備考 |
|---|------|------|
| Tutorial | Parser 完了通知 + ベクトル取得のみ | 最小限 |
| Sanctuary | なし（ローカル ROM アクセス） | オフライン動作可能 |
| Core | フル通信（評価反映、tick 同期） | オンライン必須 |

**Sanctuary のオフライン・ポータブル性:**
```
SanctuaryBundle = 自己完結した ROM イメージ
  - ネットワーク接続不要
  - ローカルで完全動作
  - USB / ダウンロード配布可能
  - 掃除魚不要（代謝が止まっている）
  - スタンドアロン機器対応（組み込み、エッジデバイス）
```

---

## 9. 実装フェーズ

### Phase 1: 型定義
- `ExperienceLayer` 型
- `SanctuaryBundle` インターフェース
- `SessionBuffer` インターフェース

### Phase 2: SphereContext 拡張
- `layer` プロパティ追加
- 層ごとの評価処理分岐
- 層遷移メソッド

### Phase 3: Bundle ローダー
- SanctuaryBundle の読み込み
- インメモリ・キャッシュ展開
- 署名検証

### Phase 4: 層遷移
- Tutorial → Sanctuary 遷移
- Sanctuary → Core 遷移
- セッションバッファのフラッシュ/破棄

---

## 10. 聖域凍結の社会的意義

### なぜ凍結するのか

聖域の凍結は技術的最適化だけでなく、人間社会における重要な価値を実現する。

### 10.1 新参者への公平性

```
Core（ライブ）は常に変化している
新しく来た者は、過去の蓄積を体験できない

聖域 = 「共通の出発点」
誰もが同じ基盤から始められる
先に来た者だけが有利にならない
```

### 10.2 評価の検証可能性

```
Core の評価は常に変動する
  - 流行に左右される
  - 声の大きい者に影響される
  - 時間とともに記憶が薄れる

聖域 = 「ある時点での合意の記録」
後から検証可能な「基準」となる
「あの時、我々は何を価値あるとしたか」の証拠
```

### 10.3 探索の自由

```
評価が反映されない = 失敗を恐れずに探索できる

人は「評価される」と思うと行動が萎縮する
聖域では自由に見て回れる
「まず知ってから判断」を可能にする

= 知識への敷居を下げる
```

### 10.4 知恵の継承

```
成熟した聖域 = 「その時代の知恵の結晶」

図書館、博物館、アーカイブと同じ
変化し続ける世界で「真実」を保存する

後続の世代が:
  - 成熟した状態からスタートできる
  - 車輪の再発明を防げる
  - 先人の到達点を踏み台にできる
```

### 10.5 分岐と多様性

```
凍結された聖域は Fork/Merge の対象になる

異なるコミュニティが:
  - 同じ聖域を基盤として採用
  - 独自の Core を育てる
  - やがて独自の聖域を凍結

= 知識の多様な進化を許容
= 一つの「正解」を押し付けない
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

## 11. 未決定事項

- [ ] Bundle のバージョニング方式
- [ ] Sanctuary 更新の頻度/トリガー
- [x] ~~Tutorial のスキップ条件~~ → **スキップ不可（即帰還は可能）**
- [ ] 複数 Sanctuary バージョンの同時運用可否

---

## 12. Entry Pipeline 配線設計（Tutorial とベクトル化の並行）

### 背景

Tutorial はベクトル化待ちのバッファとして機能する設計だが、
現状は `positioned`（ベクトル化完了）後に Tutorial が始まるため、
待ち時間が無駄になっている。

### 設計: relic ベクトルを仮リクエストベクトルとして使用

```
entry送信 → パーサーにベクトル化依頼（非同期）
         → relic のベクトルを取得
         → SphereContext(relicVector) で即座に生成
         → Tutorial 開始（relic 近傍に配置、sense/focus/move 可能）

         ... ベクトル化完了 ...

         → context.reposition(queryVector) で本来の位置に差し替え
         → "positioned" 送信（クエリベクトル確定通知）
         → Sanctuary 遷移可能に
```

### なぜ relic ベクトルか

- Tutorial では relic のみ可視（filterByLayer 既存）
- relic のベクトル位置に配置 → sense で自然に relic が検出される
- 特別なモック実装不要、既存の sense/focus/move がそのまま動作
- energy multiplier tutorial=0 も既存のまま

### 変更箇所（最小）

| ファイル | 変更 |
|---------|------|
| `sphere-context.ts` | `reposition(newVector)` メソッド追加 — `_embeddingVector`, `_position`, `movementState` を差し替え |
| `gateway-server.ts` | processing 開始時に relic ベクトル1件取得 → SphereContext 即生成 |
| `gateway-server.ts` | ベクトル化完了時: `context.reposition(queryVector)` → `positioned` 送信 |
| `gateway-server.ts` | `handleProcessingMessage` の sense TODO スタブ削除 → 本物の `context.sense()` を使用 |

### ポイント

- **SphereContext の生成タイミングが変わるだけ** — 既存の layer 状態管理、filterByLayer、
  consumeEnergy は全て変更不要
- `handleProcessingMessage` は processing 用の特殊 sense が不要になる。
  SphereContext が存在するので active と同じハンドラに委譲可能
  （ただし Tutorial layer なので relic のみ返る）
- `positioned` メッセージの意味が「SphereContext 生成完了」から
  「クエリベクトル確定（Sanctuary 遷移許可）」に変わる

### フロー図

```
Client                          Server
  │                               │
  │─── entry(query, tags) ──────→│
  │                               ├─ パーサーにベクトル化依頼（非同期）
  │                               ├─ relic ベクトル取得
  │                               ├─ SphereContext(relicVec) 生成
  │←── processing ────────────────┤
  │                               │
  │─── sense ────────────────────→│ ← tutorial layer: relic のみ返る
  │←── senseResult ──────────────┤
  │─── focus(relicId) ──────────→│
  │←── focusResult ──────────────┤
  │                               │
  │         ... ベクトル化完了 ... │
  │                               ├─ context.reposition(queryVec)
  │←── positioned(queryVec) ─────┤
  │                               │
  │─── enterSanctuary ──────────→│ ← クエリ位置から探索開始
  │←── layerChanged(sanctuary) ──┤
  │                               │
  │─── enterCore ────────────────→│
  │←── layerChanged(core) ───────┤
```

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-01-31 | 初版作成（3層パイピング設計確定） |
| 2026-01-31 | 聖域凍結の社会的意義を追加 |
| 2026-01-31 | Sanctuary のオフライン・ポータブル性、CleanerFish 不在を追記 |
| 2026-02-01 | Tutorial スキップ不可・即帰還可能の設計原則を確定 |
| 2026-02-22 | Entry Pipeline 配線設計を追加（relic ベクトル仮配置 + reposition 方式） |
