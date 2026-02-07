# RenalCore リファクタリングメモ

**日付**: 2026-01-31
**Phase**: 3.x (設計原則の適用)

---

## 1. 問題点

RenalCore が `node.kind`（意味的カテゴリ）を参照していた。

```typescript
// 設計違反: 意味的カテゴリで判定
if (node.kind === "amber" || node.kind === "relic" || node.kind === "plankton") {
  continue;
}
```

### 設計原則（renalcore.md より）

```
RenalCore responsibilities:
- Periodic Tick
- Apply decay to metrics only
- Evaporate nodes when ttl <= 0
- Never inspect semantic content  ← kind を見てはいけない

RenalCore must NOT:
- Generate new nodes
- Create links
- Infer relations
```

### Core Schema（正しい設計）

```
for each tick:
  for each node in ProjectionDB:
    node.metrics.ttl -= node.metrics.d * loadFactor  ← ノード固有の減衰係数
    node.metrics.h   *= decayFactor

    if node.metrics.ttl <= 0:
      evaporate(node)
```

---

## 2. 修正内容

### 2.1 processDecay: kind チェック削除

```typescript
// Before
if (hasFlag(node, NodeFlag.Frozen)) continue;
if (node.kind === "amber" || node.kind === "relic" || node.kind === "plankton") continue;

// After
// Frozen フラグがある場合は代謝を停止
// Note: relic, amber, environment 等は Frozen フラグで管理
//       kind ではなく flags で物理を決定する（設計原則）
if (hasFlag(node, NodeFlag.Frozen)) {
  continue;
}
```

### 2.2 processAscension: Frozen フラグ設定

```typescript
// Amber へ結晶化
node.kind = "amber";
node.metrics.flg |= NodeFlag.Frozen;  // 代謝停止（Decay対象外）← 追加
this.dirtySet.add(node.id);
```

### 2.3 processErosion: Frozen フラグ解除

```typescript
// Amber → Active へ退行
node.kind = "active";
node.metrics.flg &= ~NodeFlag.Frozen;  // 代謝再開（Decay対象に）← 追加
this.dirtySet.add(node.id);
```

---

## 3. 設計原則の整理

### RenalCore の責務分離

| 処理 | kind 参照 | flags 参照 | 理由 |
|------|----------|-----------|------|
| Decay（物理演算） | ❌ | ✅ | 純粋な物理。メトリクスのみ |
| Ascension（状態遷移） | ✅ | ✅ | 遷移元を知る必要がある |
| Erosion（状態遷移） | ✅ | ✅ | 遷移元を知る必要がある |

### フラグと状態の同期

```
Active → Amber:  +NodeFlag.Frozen（代謝停止）
Amber → Active:  -NodeFlag.Frozen（代謝再開）
```

### Frozen フラグの意味

| ノード種別 | Frozen フラグ | 説明 |
|-----------|--------------|------|
| Relic | ✅ | 永続（生成時に付与） |
| Amber | ✅ | 結晶化（昇天時に付与） |
| Environment | ✅ | 環境（生成時に付与） |
| Active | ❌ | 活性（代謝対象） |
| Ghost | ❌ | 痕跡（代謝対象） |
| Fossil | ❌ | 化石（代謝対象） |

---

## 4. 関連修正（同日実施）

### 4.1 ReferenceRecord.kind の修正

**問題**: `kind: "relic"` が「不朽の原典ノード（SphereNode.kind）」と混同される

**修正**: `"relic"` → `"source"`

```typescript
// types.ts
export interface ReferenceRecord {
  id: string;              // ProjDBとの連携キー（コンテンツハッシュ）
  timestamp: number;
  kind: "amber" | "source"; // source=初期記録, amber=昇天済み
  // ...
}
```

### 4.2 用語の区別

| 用語 | 意味 | 使用場所 |
|------|------|----------|
| SphereNode.kind: "relic" | 不朽の原典ノード（座標の楔） | ProjDB |
| ReferenceRecord.kind: "source" | 受肉時の初期記録 | RefDB |
| ReferenceRecord.kind: "amber" | 昇天により永続化された記録 | RefDB |

---

## 5. 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `renalCore/src/renalcore.ts` | processDecay: kind チェック削除 |
| `renalCore/src/renalcore.ts` | processAscension: +Frozen フラグ |
| `renalCore/src/renalcore.ts` | processErosion: -Frozen フラグ |
| `renalCore/src/core/types.ts` | ReferenceRecord.kind: "relic" → "source" |
| `periphery/src/bookkeeper/bookkeeper.ts` | kind: "source" に更新 |
| `periphery/src/packer/packer.ts` | コメント更新（用語明確化） |

---

## 6. TODO

1. **Relic ノード生成時**: Frozen フラグを付与する処理の確認
2. **Environment ノード生成時**: Frozen フラグを付与する処理の確認
3. ~~**node.metrics.d の活用**: 現在 `alpha * loadFactor` を使用しているが、設計書では `d * loadFactor` を推奨。~~ → **完了** (2026-02-01)
4. ~~**Hack Detection の意味的検査**: `payload.summary.length` を参照していた。~~ → **完了** (2026-02-01)
5. **【重要】閾値整合性の調整**: traversal/stayTime 減衰追加に伴い、リンク生成・不正検出の閾値を見直す必要あり → **詳細: [TODO_THRESHOLD_CONSISTENCY.md](./TODO_THRESHOLD_CONSISTENCY.md)**
6. **【重要】Link Node 外部生成化**: renalCore から Link 生成機能を削除し、Observatory 経由に変更 → **詳細: [TODO_LINK_NODE_EXTERNAL_GENERATION.md](./TODO_LINK_NODE_EXTERNAL_GENERATION.md)**
7. **【重要】Pulse 送信の移動**: renalCore から Periphery へ移動（tick = 生体能力、Pulse = 外部通信）

---

## 8. 2026-02-01 追加修正

### 8.1 Decay 係数の修正

**変更前:**
```typescript
const effectiveTTLDecay = computeEffectiveTTLDecay(
  this.config.alpha * loadFactor,  // グローバル定数
  node.metrics.flg
);
```

**変更後:**
```typescript
const baseDecay = node.metrics.d * loadFactor;  // ノード固有の減衰係数
const effectiveTTLDecay = computeEffectiveTTLDecay(
  baseDecay,
  node.metrics.flg
);
```

**理由:** 設計原則に従い、ノード固有の減衰係数 `d` を使用。

---

### 8.2 Hack Detection の意味的検査削除

**変更前:**
```typescript
// パターン2: 意味のない要約を持つ偽装リンク
const summaryLength = node.payload?.summary?.length || 0;
const isFakeLinkWithShortSummary = (
  summaryLength > 0 &&
  summaryLength < this.config.minPayloadLength &&
  t > this.config.hackTraversalThreshold
);
return isPassthrough || isFakeLinkWithShortSummary;
```

**変更後:**
```typescript
// metrics のみで判定（意味的検査は Gatekeeper の責務）
return (
  t > this.config.hackTraversalThreshold &&
  s / t < this.config.hackStayRatioThreshold
);
```

**理由:**
- renalCore は物理量（metrics）のみを参照すべき
- 意味的検査（要約長など）は Gatekeeper の責務
- 設計原則「Never inspect semantic content」に準拠

---

### 8.4 Traversal / StayTime 減衰の追加

**問題:** `traversal` と `stayTime` が累積のみで減衰せず、長期運用で閾値が意味をなさなくなる

**追加コード:**
```typescript
// Traversal / StayTime の減衰（最近の行動を重視）
if (node.metrics.traversal !== undefined) {
  node.metrics.traversal *= (1 - this.config.traversalDecayFactor);
}
if (node.metrics.stayTime !== undefined) {
  node.metrics.stayTime *= (1 - this.config.traversalDecayFactor);
}
```

**コンフィグ:**
```json
"decay": {
  "traversalDecayFactor": 0.005  // 1Tick で 0.5% 減衰
}
```

**減衰率の選定理由:**
- `heatDecayFactor: 0.02` より緩やか（熱より持続性がある）
- 1000 Tick（≈17分）で約 1/150 に減衰
- 「最近の道」が重視される設計

---

### 8.3 Spatial Hash Grid 設計文書の格下げ

**変更:** `PHASE4_AGENT_SPATIAL_DESIGN.md` のステータスを「将来検討」に変更

**理由:**
- 現在のノード規模（< 10,000）では不要
- 必要時は pgvector HNSW インデックスで対応可能
- 設計の先走りを整理

---

## 7. 補足: 軽量・高速動作の原則

> renalCore は極めて軽量かつ高速に動作しなければならない

- `kind` 文字列比較より `flags` ビット演算の方が高速
- 状態遷移時にフラグを同期することで、Decay ループでの条件分岐を削減
- `computeEffectiveTTLDecay` 内でも `NodeFlag.Frozen` チェックで即座に `return 0`

---

## 9. 2026-02-01 設計決定: Link Node 外部生成化

### 9.1 原則の確定

```
┌─────────────────────────────────────────────────────────────┐
│  Sphere は自ら何も生み出さない                              │
│  すべてのノードは外部から持ち込まれる                       │
│  Observatory が接続されていなければ、Link は生成されない    │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 責務の再定義

| コンポーネント | 責務 |
|---------------|------|
| **RenalCore** | tick = 生体能力（物理演算のみ） |
| **Arbiter** | 状態監視・判定（Link 候補検出を含む） |
| **Periphery** | 外部通信の窓口（Pulse 送信を担当） |
| **Observatory** | 外部監視 + ノード生成（Link/Environmental） |

### 9.3 renalCore から削除予定

```typescript
// 削除対象
- processLinkNodeGeneration()
- spawnLinkNode()
- computeLinkPosition()
- computeBranchingFactor()
- isBehavingAsLink()
- processPulseBroadcast()  // Periphery へ移動
- UDP socket 管理
```

### 9.4 Pulse 送信の移動

**理由:** tick は生体能力、Pulse は外部通信

```
Before: renalCore.tick() → 内部で Pulse 送信
After:  renalCore.tick() → getPulseData() → Periphery が送信
```

**詳細:** [TODO_LINK_NODE_EXTERNAL_GENERATION.md](./TODO_LINK_NODE_EXTERNAL_GENERATION.md)

---

## 10. 【重要】processGhostification() の削除

**日付**: 2026-02-01
**優先度**: 高

### 設計原則

```
┌─────────────────────────────────────────────────────────────┐
│  Ghost は Packer が生成する。RenalCore は遷移させない。      │
│  Ghost は投入された時から減衰するだけ。                      │
└─────────────────────────────────────────────────────────────┘
```

### 問題

`processGhostification()` が Active ノードを Ghost に遷移させている。
これはユーザーの設計意図に反する。

**ユーザーの明確化** (PHASE3_COMPLETION_MEMO.md より):
> "ghost はパッカーが生成し、投入された時から減衰するだけ
> renalcore が遷移させるとは思っていない"

### 現象

1. normalNodes (importance 0.5〜0.85) が `kind: "active"` として投入される
2. Dev モードで heat が急速に減衰 (20%/tick)
3. `heat < ghostHeatThreshold (0.5)` で Ghost に遷移
4. 結果: 本来 active であるべきノードが Ghost 化

### 解決策

**`processGhostification()` を削除する**

```typescript
// renalcore.ts - 削除対象
processGhostification() {
  // この関数全体を削除
}

// tick() から呼び出しも削除
tick(loadFactor) {
  // ...
  // this.processGhostification();  ← 削除
  // ...
}
```

### Ghost の正しいライフサイクル

```
ExperienceCapsule.ghostNodes[]
    ↓
Packer: tier="ghost" → kind: "ghost", TTL短縮
    ↓
RenalCore: Decay のみ（遷移なし）
    ↓
Evaporation: TTL ≤ 0 or heat < 0.01 で蒸発
```

### 関連設定（削除後は不要）

```json
// sphere.config.json - 削除候補
"thresholds": {
  "ghostHeat": 0.5  // ← processGhostification() 削除後は不要
}
```

### チェックリスト

- [x] `processGhostification()` 関数を削除 ✅ 2026-02-01
- [x] `tick()` からの呼び出しを削除 ✅ 2026-02-01
- [ ] `ghostHeatThreshold` 設定を削除（オプション）
- [ ] `ghostTTLMultiplier` 設定を削除（オプション）
- [ ] テスト: normalNodes が active のまま維持されることを確認

### 追加削除対象（デッドコード）✅ 完了

以下の関数は `tick()` から呼び出されなくなった（Periphery の Arbiter + Bookkeeper に移行済み）:

- [x] `processErosion()` - Arbiter.shouldErode() + Bookkeeper.applyTransitions() で処理 ✅ 2026-02-01
- [x] `processAscension()` - Arbiter.shouldAscend() + Bookkeeper.applyTransitions() で処理 ✅ 2026-02-01
- [x] `processLinkGeneration()` - 外部生成へ移行予定（NodeForge） ✅ 2026-02-01
- [x] `spawnLinkNode()`, `createLinkNode()`, `isLinkable()`, `computeBranchingFactor()` ✅ 2026-02-01
- [x] `isBehavingAsLink()`, `stripPayloadToLink()` - Arbiter.isBehavingAsLink() で処理 ✅ 2026-02-01
- [x] `computeDistance()` - isLinkable() とともに削除 ✅ 2026-02-01
- [x] `processEvaporation()` - CleanerFish (fossilize/decompose/evaporate) で処理 ✅ 2026-02-01
- [x] `addFertilityToCell()`, `getCellIdFromVector()` - processEvaporation() とともに削除 ✅ 2026-02-01
- [x] `processPulseBroadcast()` - PulseBroadcaster (Periphery) に移行 ✅ 2026-02-01
- [x] `generatePulsePacket()`, `broadcastPulse()` - PulseBroadcaster に移行 ✅ 2026-02-01
- [x] `initPulseSocket()`, `closePulseSocket()` - PulseBroadcaster に移行 ✅ 2026-02-01
- [x] `decaySpatialFields()` - processDecay() に統合 ✅ 2026-02-01
