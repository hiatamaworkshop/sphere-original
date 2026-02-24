# エージェント移動フォールバック修正メモ (2026-02-23)

## 背景

### 発覚した問題

phi-agent のデーモンテストで、エージェントが **9サイクル連続で sense=0**、
移動も全て失敗し、**1件も評価できない** 状態が発生。

```
Session 1 (moth, "cross-disciplinary connections"):
  9 cycles, all sense=0, 14 "Move failed" messages, 0 evaluations
```

### 根本原因

`basePerceptionRadius` が 2026-02-10 (commit `2fbcc2e`) に **0.8 → 0.3** に変更され、
sense の実効範囲が大幅に縮小した。

```
sense radius=1 → 実効距離 0.3 × 1 = 0.3（以前は 0.8）
```

これにより、クエリベクトル付近にノードが存在しない場合、
sense が 0 件を返し続ける状態が頻発するようになった。

### move の検証ロジック (sphere-context.ts L865-867)

```typescript
const needsVisibleNodes = mode !== "random" && mode !== "flow";
if (needsVisibleNodes && this._visibleNodes.size === 0) {
  console.log(`Move failed: mode=${mode} requires sense() first`);
  return { success: false, distance: 0, mode };
}
```

`explore`, `hot`, `deep`, `fresh` はすべて `visibleNodes > 0` が前提。
sense=0 の状態では gradient ベースの移動が全て失敗し、
エージェントはその場で動けなくなっていた。

### 2日前のコードでも再現

commit `78fd745` (2026-02-20) にロールバックしてテストしたが、
**全く同じ問題が再現** — 3層実装 (02-22) が原因ではなく、
`basePerceptionRadius` 変更以降ずっと潜在していたバグだった。

---

## 修正内容

### 1. scanL1 + warp クライアントメソッド追加 (`sphere-client.ts`)

サーバー側は `scan` (→scanL1) と `warp` メッセージを既にサポートしていたが、
phi-agent のクライアントに対応メソッドが **存在しなかった**。

```typescript
export interface ScanNode {
  id: string;
  distance: number;
  tags: string[];
  kind: string;
  flags: number;
}

async scanL1(radius?: number): Promise<ScanNode[]>  // cost: 1
async warp(nodeId: string): Promise<boolean>         // cost: 15
```

scanL1 は sense よりも広い検出範囲 (デフォルト radius=2.0) を持ち、
L1 データ (tags のみ、summary なし) を返す。コストも 1 (sense は 3)。

### 2. 種族メトリクスに基づく warp 先選定 (`fast-gate.ts`)

`pickWarpTarget(scanned: ScanNode[]): number` メソッドを追加。

スコアリング方式:
| 要素 | スコア | 意味 |
|------|--------|------|
| クエリトークンとのタグ一致 | +3/match | リクエストとの関連性 |
| 種族タグとの一致 | +2/match | 種族の知的傾向 |
| 種族ホットノード | +5 | 種族が好む場所 |
| 距離ペナルティ | -distance×10 | 近い方が有利 |

訪問済みノードはスキップ。全訪問済みの場合は最近傍にフォールバック。

### 3. scanAndWarp ヘルパー (`agent.ts`)

全てのフォールバック箇所で使用:

```
scanL1() → pickWarpTarget() → warp()
```

**適用箇所 (8箇所):**
- `tutorialExplore()`: nodes=0, no valid targets
- `sanctuaryExplore()`: nodes=0, no valid targets
- `standardCycle()`: nodes=0, all visited
- `liaisonExplore()`: nodes=0, all visited

### 4. gradient move 失敗フォールバック (`agent.ts`)

`explore`/`hot` 等の gradient move が失敗した場合、
`move(step, "flow")` にフォールバック。

```typescript
const moved = await this.sphere.move(moveStep, moveMode);
if (!moved) {
  await this.sphere.move(moveStep, "flow");
}
```

**適用箇所 (2箇所):**
- `standardCycle()` の初回移動
- `liaisonExplore()` の初回移動

### なぜ flow か

| モード | fieldWeight | 方向の決定 |
|--------|-------------|-----------|
| random | 0.0 | 完全ランダム（磁場無視） |
| **flow** | **1.0** | **GlobalField の重心方向（100% 磁場に従う）** |

GlobalField の重心 = 全ノードの `sigmoid(h+w) × (1-d/2000)` 重み付きセントロイド。
つまり **heat+weight が高い（＝価値のある）ノードが密集している方向** に向かう。

flow は visibleNodes を必要としない（GlobalField はスフィア全体から計算される）ため、
sense=0 でも常に動作する。磁場が未初期化 (intensity < 0.01) の場合のみランダムに退化。

---

## 修正結果

### Before (修正前)

```
Session: moth, "cross-disciplinary connections"
  9 cycles, 0 evaluations, 14 "Move failed" messages
  Duration: 9.6s (空回り)
```

### After (修正後)

```
Session: moth, "cross-disciplinary connections"
  Tutorial: sensed 3 relic nodes, focused 1
  Sanctuary: scan (layer filtering で 0、amber 不在のため)
  Core Cycle 1: sensed 2 → focus "Shannon's information theory" → eval h=6 w=7 d=4
  Core Cycle 2: all visited → scan+warp → [cryptography,security,mathematics] dist=0.44
  Core Cycle 3: scout sensed 2 nodes
  Core Cycle 4: all visited → scan+warp (unvisited なし、最近傍)
  4 cycles, 2 evaluations, +2 heat delta
  Duration: 98.7s (実際に探索・評価している)
```

---

## 変更ファイル

| ファイル | 変更 |
|---------|------|
| `phi-agent/src/sphere-client.ts` | `ScanNode` 型、`scanL1()`, `warp()` メソッド追加 |
| `phi-agent/src/fast-gate.ts` | `pickWarpTarget()` メソッド追加 |
| `phi-agent/src/agent.ts` | `scanAndWarp()` ヘルパー追加、全フォールバック置換、flow フォールバック |

サーバー側変更: **なし**（既にサポート済み）

---

## 教訓

1. **パラメータ変更の波及**: `basePerceptionRadius` の変更が
   エージェントの移動システム全体を機能不全にした。
   パラメータ変更時は関連するエージェント行動のテストが必須。

2. **サイレント失敗の危険性**: `move()` は `success: false` を返すが
   agent 側で戻り値を無視していた。サイレント失敗はバグの発見を遅らせる。

3. **クライアント・サーバー間のギャップ**: サーバーが scanL1/warp をサポートしていても、
   クライアントにメソッドがなければ使えない。API の両端を同時に確認すべき。

4. **フォールバックの品質**: random は最後の手段であるべき。
   flow (磁場追従) のように、世界の構造を尊重するフォールバックが望ましい。
