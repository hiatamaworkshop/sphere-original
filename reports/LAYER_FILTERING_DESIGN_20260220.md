# レイヤーフィルタリング設計メモ — 2026-02-20

## 背景

エージェントのスフィア体験は Tutorial → Sanctuary → Core の三層構造。
しかし現状は Core のみが動作し、全エージェントが ProjDB に直接アクセスしている。

---

## 2つの独立した関心事

### 1. 聖域の物理書き出し (SanctuaryBundle)

- スフィアが人間に返す**成果物**の永続化
- 静的DB / ポータブル / オフライン動作
- スタンドアロン端末、フォーク文化、AI訓練フィールド等の全活用の土台
- 聖域化に付随する実装 — 準備済み、いつでも着手可能

### 2. ランタイムのレイヤーフィルタリング

- エージェント体験としての三層を、コアスフィア1つのフィルタリングで表現
- **本メモの主題**

---

## 設計方針: スフィアの物理法則として実装

### Explorers との分離

元々レイヤー制御は Explorers (UI/サービス) 内の議論だった。
しかし外部エージェント (phi-agent 等) も直接スフィアに接続するため、
レイヤー制御は**スフィアサーバ側** (SphereContext レベル) に置く。

```
Explorers: 体験の演出 (FastGate, Weapons, UI)
────────────────────────────────────────────────
Sphere:    アクセス制御 (layer → kind フィルタ + eval 権限)
```

三層の本質は「何が見えて、何ができるか」のアクセス制御。
これは FastGate や Weapons の概念ではなく、スフィアの物理法則。
図書館の閲覧室・書庫・研究室のように、スフィア自身が持つべき深度別のアクセス権。

### 物理的実態

```
┌─────────────────────────────────┐
│         Core Sphere (ProjDB)    │  ← 唯一の物理的実態
│   active / amber / relic / ...  │
└──────────┬──────────────────────┘
           │
    ┌──────┼──────────────────┐
    │  SphereContext フィルタ  │
    ├──────┼──────────────────┤
    │      │                  │
    ▼      ▼                  ▼
 Tutorial  Sanctuary         Core
 (限定表示  (amber+relic     (フィルタなし
  eval破棄)  のみ, ReadOnly)  フルアクセス)
```

---

## レイヤー定義

| | 見えるノード | eval | focus 対象 | tick/代謝 |
|---|---|---|---|---|
| tutorial | amber + relic | 破棄 (黙って捨てる) | amber + relic のみ | なし |
| sanctuary | amber + relic | 不可 (拒否) | amber + relic のみ | なし |
| core | 全ノード | 受肉 (即時反映) | 全ノード | あり |

---

## 実装ポイント

### 1. クエリ結果のフィルタ (scan/sense/move の応答)

```typescript
// SphereContext 内の共通フィルタ
private filterByLayer(nodes: SphereNode[]): SphereNode[] {
  if (this.layer === "core") return nodes;
  // tutorial / sanctuary: amber + relic のみ
  return nodes.filter(n => n.kind === "amber" || n.kind === "relic");
}
```

### 2. eval の権限制御 (evaluate 呼び出し時)

```typescript
switch (this.layer) {
  case "tutorial":  // 黙って破棄
  case "sanctuary": // 拒否 or バッファ
  case "core":      // 受肉
}
```

### 3. メソッド可用性制御 (将来)

フィルタリングだけでなく、レイヤーによっては特定メソッド自体を実行不可にする。
見えないノードには focus できない → focus できないものには evaluate が発生しない。
エージェントのエネルギー消耗を防ぐ。

```
              scan  sense  move  focus        evaluate  return
tutorial:      o     o     o    amber/relic    x(破棄)   o
sanctuary:     o     o     o    amber/relic    x(拒否)   o
core:          o     o     o    全ノード        o(受肉)   o
```

experience-layer.ts の LAYER_CHARACTERISTICS に capability mask を含める。

### 4. 層遷移

- Tutorial → Sanctuary: Parser 完了時に自動遷移
- Sanctuary → Core: エージェント選択 or スフィア制御
- Return: どの層からでも常に可能

### エージェント負荷: ゼロ

- エージェントの API は変わらない (scan, sense, move, focus, evaluate, return)
- スフィア側の応答が層によって異なるだけ
- エージェントから見れば「同じ操作をしている」
- コード変更不要

---

## ランタイムフィルタと物理書き出しの分離

### 2つの「聖域」を混同しない

```
┌──────────────────────────────────────────────────────────┐
│  ランタイム聖域 (本メモの主題)                             │
│    = Core DB の現在状態から amber + relic をライブ抽出      │
│    = DB マーキング不要                                     │
│    = 聖域化イベント間のコアの「今」がそのまま聖域ビュー     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  物理聖域 (SanctuaryBundle)                                │
│    = 聖域化イベント発火時にスナップショットとして書き出し    │
│    = 凍結・署名付き・オフライン配布用                       │
│    = sanctuaryEpoch 等のメタデータはこちらの関心事           │
└──────────────────────────────────────────────────────────┘
```

### ランタイム聖域の動作原理

エージェントが体験する聖域スフィアは、**現在稼働中のコアスフィアのライブビュー**。

```
聖域化イベント発火 (t=0)
  ├→ SanctuaryBundle 書き出し (物理側: 凍結スナップショット)
  └→ Core はそのまま稼働し続ける
       │
       │  t=1分: ある amber が降格 → 聖域ビューから消える
       │  t=5分: 新 amber 誕生    → 聖域ビューに現れる
       │  ...
       │
次の聖域化イベント (t=N)
  ├→ 新しい SanctuaryBundle 書き出し
  └→ Core はそのまま稼働し続ける
```

- フィルタは常に `kind === "amber" || kind === "relic"` のみ
- DB にフラグ追加は不要（kind フィールドが既にフラグそのもの）
- 琥珀の降格・昇格はリアルタイムで聖域ビューに反映される
- エポック管理・DB マーキングはランタイムフィルタには無関係

### なぜこれで十分か

1. **琥珀 = 聖域の住人**: kind が amber であること自体が「聖域に属す」意味
2. **動的な正確性**: amber 降格は即座に聖域から除外 — 古い情報を見せない
3. **DB 拡張ゼロ**: 既存の kind フィールドだけで完結
4. **sanctuaryEpoch は物理書き出し側の管理**: 「何番目の聖域化で凍結されたか」は SanctuaryBundle のメタデータとして保持すれば良い

### 設計上の緊張: 聖域の「揺らぎ」

人間にとって聖域スフィアは「確たる情報の殿堂」であってほしい。
しかしランタイムモデルでは、コアの代謝によって琥珀が降格すれば聖域ビューからも消える。

```
人間の期待: 聖域 = 確立された評価、安定した知の結晶
実装の実態: 聖域 = Core の現在状態のライブフィルタ（揺らぐ）
```

この揺らぎは意図的なトレードオフとして受け入れる。
- **物理聖域 (SanctuaryBundle)** こそが「確たる情報」の役割を担う — 凍結・不変・配布可能
- **ランタイム聖域** はあくまで「今の Core が推す琥珀」の動的ビュー
- 人間が求める確実性は物理聖域が保証し、ランタイム聖域は探索の入口として機能する

将来的に、降格猶予期間（grace period）や聖域化直後のロック期間を設けることで
ランタイム聖域の安定感を高める余地はある。ただし現時点では過剰設計。

### 根底にある原則: 二つの世界

スフィアは開発者の手を離れた所で発展すべきものであり、
エージェントが使うスフィア世界と、人間が享受するスフィア世界は本質的に別物。

```
エージェントの世界 (ランタイム)     人間の世界 (成果物)
  動的・代謝する・揺らぐ              凍結・確定・配布可能
  スフィアが自律的に発展              人間がもしかしたら享受できる
  ランタイム聖域 = ライブフィルタ     物理聖域 = SanctuaryBundle
```

この分離が今回の設計議論で明確になった。
ランタイム側の設計（本メモ）は、スフィアの自律的発展を阻害してはならない。

---

## SphereContext の配線状況 (2026-02-20 実装)

### 実装済み

- `_layer: ExperienceLayer = "tutorial"` — 初期値 tutorial
- `evaluate()` — layer 対応済み。`handleLayerEvaluation()` で層別処理
- `enterSanctuary()` / `enterCore()` — 遷移メソッド実装済み
- `return()` — バッファの evaluations を capsule にマージ
- `sense()` — **filterByLayer() 挿入済み** ✅
- `scanL1()` — **filterByLayer() 挿入済み** ✅
- `scan()` — **filterByLayer() 挿入済み** ✅
- `focus()` — **layer kind ガード追加済み** ✅ (防御的チェック)
- `consumeEnergy()` — **LAYER_ENERGY_MULTIPLIER 適用済み** ✅
- `enterCore()` — **部分体力回復 (+30) 追加済み** ✅

### 新規追加した定数・メソッド

```typescript
// レイヤー別エネルギーコスト倍率
LAYER_ENERGY_MULTIPLIER = { tutorial: 0, sanctuary: 0.5, core: 1.0 }

// Core 進入時の体力回復量
CORE_ENTRY_ENERGY_RECOVERY = 30

// 聖域で可視の kind
SANCTUARY_VISIBLE_KINDS = Set(["amber", "relic"])

// 汎用フィルタ (sense/scan/scanL1 共通)
private filterByLayer<T extends { kind: string }>(nodes: T[]): T[]
```

### 未実装 (残件)

| コンポーネント | 状態 |
|---|---|
| 遷移トリガー接続 | **未実装** (Parser完了→sanctuary の自動遷移) |
| DB マーキング (ランタイム用) | **不要** — kind フィールドで完結 |
| SanctuaryBundle 書き出し | **別関心事** — 聖域化発火時の物理エクスポート |

---

## 整合性チェック (2026-02-20)

### 確認事項

- Bookkeeper は sanctify フラグを付与しない — Ascension で `kind = "amber"` にするのみ
- Erosion で `kind = "active"` に戻る — 特別なフラグ不要
- `index.ts` の tick 処理順序: `applyTransitions()` (erosion) → `sanctificationNeuron.observe()` (sanctify 判定)
  → **erosion が先、sanctify 判定が後** — snapshot 時点で降格済み

### エッジケース検証

| シナリオ | ランタイム聖域 | 物理聖域 (snapshot) |
|----------|---------------|-------------------|
| sanctify 発火直後 | amber+relic が見える | snapshot に含まれる |
| 発火後に amber A が erosion | A は即座に消える | 前回 snapshot には残る (正しい) |
| 発火後に新ノード D が amber 昇格 | D は即座に見える | 次回 snapshot まで含まれない (正しい) |
| erosion と sanctify がほぼ同時 | 問題なし | tick 順序で erosion が先 → 正しく除外 |

### 結論

- ランタイムも物理書き出しも `kind` フィールドだけで完結
- DB 拡張不要、sanctuaryEpoch 不要
- `// TODO: Sanctuary snapshot` 部分で `kind === "amber" \|\| kind === "relic"` 抽出のみで正しい

---

## 聖域スフィアネットワーキング構想 (2026-02-20)

### 動機

ジャンル特化した聖域スフィアを災害キットのように配置し、
軽量PCでスタンドアロン動作させる。Docker ネットワーキングで連結すれば
ジャンルをいくらでも繋げられる。

人間が必要とするのは単純な検索結果ではなく、
エージェントが意味空間を探索して紡ぎ出す「知見」である。

### Facade 方式 (実用案)

```
Agent → Facade Container → Sphere A (medical, embedding model X)
                         → Sphere B (agriculture, embedding model Y)
                         → Sphere C (civil-eng, embedding model Z)
```

- 各スフィアは現在と同じ独立サーバー（変更不要）
- Facade はスフィアレジストリ + クエリ中継 + 結果統合
- クエリ毎に各スフィアへ再接続 → Embedding Model の自由を保持
- 同一クエリでもスフィア毎にベクトル空間上の位置が異なる（正しい動作）

### Warp Link 方式 (将来案)

```
スフィア A 内のリンクノード → warp → スフィア B の意味空間に出現
```

- 同一 Embedding Model を前提とするスフィアクラスタ内で成立
- エージェントは「空間が繋がっている」自然な体験
- ジャンルの近いスフィア同士を繋ぐ時に有効

### 聖域コンテナの軽量化

```
コアスフィア:  Periphery + RenalCore + Arbiter + CleanerFish + Sanctification + PostgreSQL + Redis + MinIO
聖域スフィア:  検索API + ProjDB(ReadOnly) + RefDB(ReadOnly)
```

代謝不要、Arbiter 不要、CleanerFish 不要。sense / focus / scanL1 のみ。

### 今仕込める準備 (コスト小)

| 準備 | 内容 |
|------|------|
| `sphereId` | sphere.config.json に追加 |
| 聖域専用起動モード | metabolism 系スキップ |
| リンクノード kind | `NodeKind` に `"link"` 追加の余地 |

---

## 参考ドキュメント

- `reports/THREE_LAYER_PIPING_DESIGN.md` — 3層パイピング設計 (2026-01-31)
- `reports/SANCTUARY_SPHERE_DESIGN.md` — 聖域スフィア設計 (2026-02-19)
- `reports/divingExperience.md` — ダイブ体験フロー (2026-01-31)
- `docs/FOR_FUTURE_DEVELOPMENT.md` — 聖域スフィアの活用可能性リスト
- `src/types/experience-layer.ts` — 型定義・層特性
- `src/gateway/layer-transition.ts` — 遷移管理
