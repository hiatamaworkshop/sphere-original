# Design: Energy Refund on Post-Charge Failure — 課金後失敗時のエネルギー返金

**Date**: 2026-08-21
**Status**: 実装済み・実測検証済み
**関連**: [DESIGN_GHOST_FOSSIL_FOCUS.md](./DESIGN_GHOST_FOSSIL_FOCUS.md) (2026-02-03),
[NODE_STATE_PERCEPTION_DESIGN.md](./NODE_STATE_PERCEPTION_DESIGN.md) (2026-02-09)

---

## 背景 — 3年越しで塞がっていなかった穴

2026-02-09 の `NODE_STATE_PERCEPTION_DESIGN.md` は、この問題を明確に認識していた。

> しかし focus() は Ghost を拒否する (L3 アクセス不可)。
> **結果、エネルギーを消費して失敗する — これは設計意図ではない。**

しかし当時の修正は **phi-agent 側の FastGate** に入った。

```typescript
// fast-gate.ts pickFocusTarget()
if (n.kind === "ghost" || n.kind === "fossil") continue;
```

エージェントが ghost を選ばないようにしただけで、**サーバは今も課金していた**。
phi-agent はこの穴を踏まないが、それ以外のクライアントは全て踏む。
同じ文書が掲げていた原則 —

> **focus 可否は Sphere が決める** — カップリング層はスコアリングだけ

— の、反対側に修正が入っていたことになる。

## なぜ「エラー時に返金」案が当時決まらなかったのか

**引っ掛けるエラーが存在しなかったから**である。修正前の `focus()` はこう動いていた。

```
consumeEnergy("focus")     → 先頭で10引く
coreAdapter.focus()        → ghost なので null が返る
  ↓ else 分岐
mockFocus(nodeId)          → 偽ノードを捏造して返す
```

`mockFocus` は `kind: "active"` / `heat: 50` / `weight: 0.7` / `decay: 500` を
ハードコードして返していた。つまり **失敗が失敗として返っていなかった**。
クライアントには `focusResult` が成功として届き、中身は捏造された定数だった。

返金を掛ける先の error path が無いので、返金案は着地しようがなかった。

## 「読み取りエラーの判定が重い」への回答

2026-02-03 の懸念は「focus() は RefDB クエリを伴う」というものだったが、
これは *focus を実行する* コストであって、*focus 可能か判定する* コストではない。
`this._visibleNodes` に kind が既に載っており、実際に直後の layer guard で使われている。
**判定に DB 往復は不要**であり、この懸念は現行実装には当たらない。

## 設計決定

### 1. エネルギー加算経路を1本に統一する

`enterCore()` にベタ書きされていた回復処理を `restoreEnergy()` に切り出し、
返金と共有する。`Math.min(initial, ...)` のクランプが既にあり、
返金で初期値を超えない性質がそのまま使える。

```typescript
private restoreEnergy(amount: number, reason: string): void
private refundEnergy(action: keyof typeof DEFAULT_ENERGY.costs, reason: string): void
```

`refundEnergy` は `consumeEnergy` と同じ式で層倍率を掛け直す。
**Sanctuary で5引かれたなら5返す (10ではない)。**

### 2. focus は「課金する殻」と「本体」に分ける

事前チェック方式 (guard を `consumeEnergy` の前に持ち上げる) は採らなかった。
失敗条件を全て事前に知っている必要があり、guard が増えるたびに同じ間違いが再発するため。

```typescript
async focus(nodeId) {
  if (!this.consumeEnergy("focus")) throw ...;
  try {
    return await this.focusInner(nodeId);
  } catch (e) {
    this.refundEnergy("focus", e.message);
    throw e;
  }
}
```

**今後 `focusInner` に guard を追加しても自動的に返金対象になる**のがこの形の狙い。

### 3. mockFocus への捏造フォールバックを塞ぐ

adapter がある状態で `coreAdapter.focus()` が `null` を返したら throw する。
`mockFocus` は「adapter 無し = モックモード」専用に限定し、文言も実態に合わせた。

エネルギー課金より**こちらの実害が大きい**。捏造された heat/weight を
本物として読み取る事故が起き得る (実際に起きかけた)。

### 4. 追い出しの取り消し

`consumeEnergy` はエネルギーが 0 以下になるとセッションを追い出す。
残り10で ghost に focus すると「0で追い出し → 返金で10」という順序が起こるため、
`_expelledByEnergy` フラグを持ち、返金でエネルギーが正に戻ったら追い出しを取り消す。

### 5. error 応答に energy を載せる

`{ type: "error", requestId, error, energy }`。
これが無いとエージェント側が返金を観測できず、修正が存在しないのと同じになる。

### 6. evaluate の値域検証は課金より前

値域外 (h/w/d が 0-10 の外) は要求そのものが不正なので、
「払わせてから返す」ではなく最初から払わせない。返金の対象にしない。

## 変更点

| ファイル | 変更 |
|---|---|
| `gateway/sphere-context.ts` | `restoreEnergy` / `refundEnergy` 追加、`_expelledByEnergy` 追加 |
| | `enterCore()` のインライン回復を `restoreEnergy` に置換 |
| | `focus()` を殻と `focusInner()` に分割、try/catch で返金 |
| | adapter が null を返したら throw (mockFocus フォールバック廃止) |
| | `mockFocus()` の文言をモックモード用に修正 |
| | `warp()` の `not_found` / `no_vector` で返金 |
| | `move()` の `no_visible_nodes` で返金 |
| | `evaluate()` の値域検証を課金より前へ移動 |
| `gateway/gateway-server.ts` | `error` 応答に `energy` を追加、`sendError` に引数追加 |

## 検証 (2026-08-21 実測)

`sphere-dive-plan.test-refund.mjs` を `sphere-dive-manual.mjs` で実行。

```
scan  → ghost 6938b22b を発見
warp  → -15 (99 → 84)
sense → -3  (84 → 81)  ghost が sense 結果に入る
focus(ghost) →
  [SphereContext] ⚡ focus: -10 energy (81 → 71, layer=core)
  [SphereCore] focus_rejected: ghost cannot be focused directly
  [SphereContext] ⚡ energy +10 (71 → 81) — refund: focus — Node 6938b22b… cannot be focused
  → client: {"type":"error", "error":"Node 6938b22b… cannot be focused …", "energy":81}
focus(active) → -10 (81 → 71)   ← 返金後の残量から正しく引かれている
```

proximity guard (sense していないノード) と存在しない ID でも返金を確認済み。

## 残件

- `sense` / `scanL1` には課金後の失敗経路が無いため未対応 (現状で正しい)
- `moveIntent()` は未確認。同型の穴がある可能性がある
- `emitBus` は未確認
- 2026-02-09 に FastGate へ入れた ghost/fossil 除外は、サーバ側が正しく
  失敗を返すようになったため**カップリング層の責務としては不要**になった。
  ただしエネルギーの無駄撃ちを避ける最適化としては依然有効なので残置。
