# ルールブック vs 実装の乖離 (TODO)

> **発見日**: 2026-02-03
> **ステータス**: 要検討

---

## 不一致項目

### 1. セッション時間 ✅ 完了

| 箇所 | 値 |
|------|-----|
| **config** (`types/config.ts`) | `session.ttlSeconds: 180` (3分) |
| **ルールブック** (`rulebook/index.ts:573`) | `maxDurationSeconds: 180` |
| **実装** (`sphere-context.ts`) | config から取得 (デフォルト: 180秒) |

**対応完了** (2026-02-03):
- [x] `types/config.ts` に `session` セクション追加
- [x] `sphere-context.ts` で SESSION_TTL を config から取得
- [x] ルールブックの値を 180 に修正

---

### 2. レート制限 → エネルギー消費方式 ✅ 完了

**対応完了** (2026-02-03):
- [x] `types/config.ts` に `energy` セクション追加
- [x] `sphere-context.ts` にエネルギー管理実装
- [x] 各アクションでエネルギー消費
- [x] `lowEnergy` イベント (10%) 実装
- [x] エネルギー枯渇で強制退場

**設定** (`config.energy`):
```typescript
{
  initial: 100,
  warningThreshold: 10,  // 10% で警告
  costs: { sense: 2, move: 5, focus: 10, warp: 15, evaluate: 3 }
}
```

**対応完了** (2026-02-03):
- [x] ルールブックの `rateLimit` セクションを `energy` セクションに置換
- [x] focusPerMinute / warpPerMinute 等の時間ベースの制限を削除

---

### 3. scan() vs sense() ✅ 方針決定

| メソッド | 戻り値 | 用途 |
|---------|--------|------|
| `sense()` | `NearbyNode[]` | 詳細情報（heat, weight, timestamp） |
| `scan()` | `ScanResult[]` | 量子化情報（distance: near/mid/far, signature） |

**決定**:
- `scan()` は **deprecated**
- `sense()` で統一

**TODO**:
- [ ] `sphere-context.ts` の `scan()` に deprecated コメント追加
- [ ] `divingExperience.md` を `sense()` に統一

---

### 4. emit() 未実装 ⚠️

| 箇所 | 記載 |
|------|------|
| ルールブック (`actions.allowed`) | `emit` として記載 |
| ルールブック (`energy.allocation`) | `emit: "High cost. Broadcasting consumes significant energy."` |
| divingExperience.md | `ctx.emit()` - 「Co-presence（未実装）」 |

**状態**: ルールブック本体には「未実装」の明記なし

**TODO**:
- [ ] ルールブックに `emit` は未実装と明記
- [ ] または実装する

---

## 方針決定済み (2026-02-03)

- **セッション時間**: ✅ 180秒、config から取得 → **実装完了**
- **scan() vs sense()**: scan() deprecated、sense() で統一
- **移動API**: ✅ `move(step, mode)` で統一 → **実装完了**
  - `move(step, mode)` がメインAPI (旧 randomWalk からリネーム)
  - `randomWalk()` は deprecated (move へのエイリアス)
  - `moveIntent()` は deprecated (旧 move(intent) からリネーム)
  - 例: `move(0.3, "random")`, `move(0.5, "hot")`, `move(0.2, "explore")`
- **行動制限**: ✅ エネルギー消費方式 → **実装完了**
  - `ctx.energy` プロパティで残エネルギー確認
  - 各アクションでコスト消費: sense(2), move(5), focus(10), warp(15), evaluate(3)
  - 10% で `lowEnergy` イベント発火
  - 0% で強制退場 (`expelled`)

---

## 一致確認済み項目 ✅

| 項目 | ルールブック | 実装 |
|------|------------|------|
| sense() | ✅ | `sphere-context.ts:211-245` |
| move(step, mode) | ✅ 5種 | `sphere-context.ts:588-669` (旧 randomWalk) |
| warp(nodeId) | ✅ | `sphere-context.ts:509-573` |
| focus(nodeId) + 可視性制約 | ✅ | `sphere-context.ts:275-323` |
| signature 30秒 / 0.5距離 | ✅ | `move.ts:56-58` |
| move(dx,dy,dz) deprecated | ✅ | 両方で記載 |
| evaluate() バッファ蓄積 | ✅ | `sphere-context.ts:365-414` |
| enterSanctuary / enterCore | ✅ | `sphere-context.ts:915-962` |

---

## 関連ファイル

- `src/rulebook/index.ts` - ルールブック定義
- `src/gateway/sphere-context.ts` - SphereContext 実装
- `src/gateway/move.ts` - 移動システム
- `reports/divingExperience.md` - 探索体験ドキュメント
- `docs/DEVELOPER_GUIDE.md` - 開発者ガイド

---

## 優先度

1. ~~**中**: SESSION_TTL を config から取得 + ルールブック修正~~ ✅ 完了
2. ~~**低**: `randomWalk()` → `move(step, mode)` リネーム~~ ✅ 完了
3. ~~**低**: エネルギー管理実装~~ ✅ 完了
4. ~~**低**: rateLimit → energy 置換~~ ✅ 完了
5. **低**: scan() deprecated 化、emit 明記
6. **低**: fossil/ghost の focus コスト = 1 (内容乏しいノードは安価に閲覧可能)
