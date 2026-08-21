# WalkMode の勾配計算を絶対値から相対値へ

2026-08-21

`move(mode)` の `deep` / `fresh` が設計意図どおりに動いていなかった。
原因は `d` (decay coefficient) を定数 1000 で正規化していたこと。

関連: `DESIGN_ENERGY_REFUND_20260821.md` (同日、同じ「仕様が複数箇所に分裂」型の欠陥)

---

## 発端

`/nodes/metrics` を見ると 180ノード中 178ノードの `decay` が 1000 のまま動かない。
「稼働していないスフィアなので仕方がない」で済む話だったが、
その定数を割り算の分母に使っている箇所があった。

## `decay` (`metrics.d`) の正体

**時間では変化しない。** `RenalCore.processDecay()` が毎 tick 書き換えるのは
`ttl` / `h` / `w` / `immuneMod` / `flux` の5つだけで、
renalCore のソース全体に `metrics.d` への参照は **1件も無い**。

`d` に書き込むのは periphery の2箇所のみ。

| 場所 | 契機 |
|---|---|
| `bookkeeper.ts` `applyEvaluations()` | `d = max(0, d + (eval.d - neutral) × 5)` — **評価時のみ** |
| `bookkeeper.ts` `resetMetrics` | メトリクスのリセット |

初期値 1000 は `packer.standardDecayCoefficient`
(`sphere.config.json` / `types/config.ts` の双方に定義)。
誰も評価しなければ 1000 のまま動かない。これは仕様どおり。

時間で減る「寿命」は `ttl` の方で、こちらは decay preset に従って正常に減っている。

```
[RenalCore] decay node=c5d1ec72 ttl=86392.4 heat=498.951 weight=99.9
```

TTL は `normal: 86400` (1日) / `top: 172800` (2日) 起点。
稼働中の preset は `archive × intensity=0.5` (alpha=0.5)。

> `ttl` という残量と `d` という係数があり、API が後者を "decay" と呼んでいる。
> 「decay が減らない」と見えるのはこの命名の食い違い。

## 欠陥

`sphere-context.ts` の `calculateFieldDirection()` は `d` を定数 1000 で割っていた。

```ts
fresh: weight = h × (d / 1000)
deep:  weight = w × max(0, 1 - d / 1000)
```

`d = 1000` を代入すると、

| mode | 式の帰結 | 症状 |
|---|---|---|
| `fresh` | `h × 1.0` | **`hot` と完全に同一**。モードが1つ消えている |
| `deep` | `w × 0` | 全ノード weight 0 → `totalWeight === 0` → **`generateRandomUnitVector` に落ちる** |

`deep` は「安定して評価された方向」を名乗りながら、実質 `random` だった。

### 実測

可視8ノードのうち6ノードが `d = 1000`。旧式と新式を同じデータで並べる。

```
  id       kind    d     |  旧fresh   旧deep  |  新fresh    新deep     hot
  565b5138 active  1000  |    517.0    0.000  |   1162.3     50.7   517.0
  32ecdcaf active  1000  |    434.4    0.000  |    325.8    143.6   434.4
  9072f479 active  1000  |    504.8    0.000  |   1135.8     53.9   504.8
  c5d1ec72 active  1000  |    450.0    0.000  |   1012.4     50.6   450.0
  6938b22b fossil   985  |    479.7    0.811  |    243.5     54.1   487.0
  fbf7dcf3 active  1000  |    480.4    0.000  |   1080.4     49.7   480.4
  a78d0a5a active  1000  |    454.6    0.000  |    341.0     43.8   454.6
  9cef886b active   970  |    467.1    3.519  |    120.4    175.9   481.5
```

- 旧 `fresh` は `hot` 列と数値が完全に一致している。
- 旧 `deep` は非ゼロが2件だけ。合計重み 4.33 のうち **81% が d=970 の1ノード、
  19% が `fossil`** (崩れかけのノード)。全ノードが未評価なら 0 になり random 化する。
- 新 `deep` の最大は `9cef886b` (d=970 = 可視集合で最も安定) で正しい。
  `fossil` は 54.1 で中位に落ち着いた。
- 新 `fresh` は `hot` と順位が異なる。`d` が横並びのときは timestamp 由来の
  新しさが差を作るので、`hot` と同一にはならない。

## 修正

`d` と `freshness` を **可視ノード集合内での相対位置** に変換してから使う。

```ts
function buildRelativeScale(values: number[]): (v: number) => number {
  // 全要素が同値 = その軸は情報を持たない → 常に 1.0
  // 下限 0.5 / 上限 1.5 で 0 を返さない → totalWeight が消えない
}

fresh: weight = h × decayScale(d) × freshScale(freshness)
deep:  weight = w × (2.0 - decayScale(d))
```

### 設計判断

1. **絶対値の閾値を勾配計算に焼き込まない。**
   `move` は「見えているものの中でどちらへ進むか」を決める操作なので、
   絶対スケールには意味がない。指標が baseline に張り付いていても壊れない。

2. **係数の下限を 0 にしない (0.5〜1.5)。**
   重みが 0 になると `totalWeight === 0` から random にフォールバックし、
   モードが黙って別物にすり替わる。0.5 を下限にすれば必ず勾配が返る。

3. **情報が無い軸は 1.0 (無影響) にする。**
   全ノードの `d` が同値なら `decayScale` は常に 1.0 を返し、
   `deep` は `w` の重心 = 素直な「安定性への勾配」に縮退する。
   これは正しい縮退であって、random 化とは違う。

4. **`fresh` に `freshness` (timestamp) を組み込んだ。**
   `VisibleNodeInfo.freshness` は sense() で計算済みだったが
   「legacy, for fallback」と書かれたまま**どこからも読まれていなかった**。
   `types/gateway.ts` は `fresh` を `Σ(freshness × vector)` と定義しており、
   この軸を使うのが本来の契約。`d` が横並びでも `hot` と別物になる。

5. **L1 scan 由来のノードを母集団から除外した。**
   `scan` は `heat: 0, weight: 0, decay: 0` のプレースホルダを `_visibleNodes` に
   入れる。これを相対スケールに含めると min が 0 に引きずられる。
   `VisibleNodeInfo.measured` を追加して sense 由来だけを使う。

## 併せて直した仕様分裂

`types/gateway.ts` の WalkMode 定義が実装とずれていた。
エネルギーのコスト表が4分裂していたのと同じ型の欠陥。

| 項目 | 型定義の記述 | 実装 |
|---|---|---|
| `fresh` | `Σ(freshness × vector)` | `h × (d/1000)` |
| `explore` | `Σ(distance × vector)` → 最遠ノードへ | `1/(w+1)` → 低 weight へ |
| `flow` の field | 0.7 | 1.0 |

実装と rulebook が一致していた `explore` / `flow` は**型定義の記述を実装に合わせた**。
`fresh` は上記のとおり実装側を契約に寄せた。

rulebook の `moveModes` には「fresh/deep は絶対閾値ではなく
sense した集合内での相対で重み付けする」旨を明記した。

## 検証

```bash
node sphere-dive-manual.mjs ./sphere-dive-plan.test-walkmode.mjs
```

- `[SphereContext] No valid nodes for field direction, falling back to random` が出ない
- `deep` / `fresh` / `hot` が別々の近傍へ着地する
- `deep` を2回走らせると同じ近傍に着く (random ではない)

既存の `test-refund` / `test-emitbus` にも回帰なし。

## 残件

- `d` の実レンジは 0〜2000 程度を想定しているが、評価が入らない限り 1000 から動かない。
  腐敗が進む世界を観測するには継続的な評価が要る (phi-agent を回すか、
  decay preset を `flow` / `dev` にして `ttl` 側の代謝を見る)。
- `explore` の `1/(w+1)` も絶対値だが、`w` は実際に時間で減衰するので縮退しない。
