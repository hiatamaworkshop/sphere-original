# Flux Seep — 対流因子による局所土壌モデル

## 2026-02-18 設計メモ

---

## 前提: Sphere は生態系である

エネルギーは外部から来て（Contribution）、観測結果として系外へ出る（Broadcast, Narrative, ログ）。
循環するのはノード（物質）であってエネルギーではない。

Sphere の空間は歴史を持つ。場所ごとの活動痕跡がノードの生存に影響する。

---

## Flux とは何か

**Flux = 対流因子。分解が起きた場所に沈殿する「かつてここに流れがあった」という記録。**

Flux は死体の栄養素ではない。分解の事実は個々のノードの価値を意味しない。
意味するのは「その場所で活動があった」こと——投入、評価、競争、淘汰の痕跡。

海洋の湧昇流（upwelling）に近い。豊かなのは死体そのものではなく、循環が活発であること。

### 旧概念との対応

| 旧 (fertility) | 新 (flux) |
|----------------|-----------|
| 栄養素 | 対流因子 |
| 死体が肥料になる | 活動痕跡が流れを示す |
| グローバル知覚ボーナス | 局所 TTL 染み出し |
| `getFertilityBonus()` | **削除済み** |
| `SpatialField.fertility` | `SpatialField.flux` |
| `fertilityDecayRate` | `fluxDecayRate` |
| `fertilityGain` | `fluxGain` |

---

## 生成: decompose → fluxGain

CleanerFish が Fossil を分解するとき:

```
fluxGain = fossilNode.metrics.h × fossilNode.metrics.w
```

この値が分解地点の SpatialField に加算される。（既存実装、変更なし）

---

## 消費: Flux Seep（染み出し）

### アルゴリズム

```
Bookkeeper サイクル（既存の 10 秒間隔）:

  fluxPool を走査（疎な Map、分解が起きた場所のみ）:
    if flux <= 0: skip

    // 近傍ノードをランダムに N 件サンプル（既存パターン踏襲）
    sample = sampleNearbyNodes(position, N=3)

    for each node in sample:
      drip = flux × SEEP_RATE     // 例: 0.02（pool の 2%）
      node.TTL += drip
      flux    -= drip

    flux *= DECAY                 // 自然蒸発 0.995
```

### 設計原則

1. **全走査しない** — ランダムサンプル N=3 件のみ。O(fluxPoints × N)
2. **恩恵ゼロのノードは正常** — サンプルに当たらなければ何も起きない
3. **TTL のみ変動** — h, w はエージェント評価で決まるべき。土壌が直接左右しない
4. **自然減衰** — 毎サイクル 0.5% 蒸発。使われなければ散逸する
5. **pool は疎な Map** — 分解イベントの座標にのみ生成。セルグリッド全走査ではない

### パラメータ

| 定数 | 値（初期） | 意味 |
|------|-----------|------|
| SEEP_RATE | 0.02 | pool の 2% を 1 ノードに滴下 |
| SAMPLE_N | 3 | サイクルあたりサンプル数 |
| DECAY | 0.995 | 毎サイクル 0.5% 蒸発 |

flux=1000 の場合、SEEP_RATE×N + DECAY で毎サイクル約 6.5% 減少。
20 サイクル（約 3 分）で半減。

### 痩せた土地の開拓

Flux がゼロの領域に投入されたノードは恩恵なし。
そのノードが死に、分解されて初めてその場所に flux が残る。
地衣類が溶岩台地に最初の土壌を作るのと同じ。**設計上、何もしない。**

---

## fluxPool の実装構想

```typescript
// 疎なマップ。分解イベントのたびにエントリが増える
fluxPool: Map<string, { position: number[], amount: number }>

// amount が閾値以下 → エントリ削除（自然消滅）
// 定常状態では数十〜数百エントリに収束
```

SpatialField の cellId ベースではなく、分解地点の position ベース。
ノード総数にもセル総数にも依存しない。

---

## 完了済みの変更（2026-02-18）

### リネーム: fertility → flux

全ソースファイルで完了。対象:

- `renalCore/src/core/types.ts` — SpatialField.fertility → flux
- `renalCore/src/types/stable_config.ts` — fertilityDecayRate → fluxDecayRate
- `renalCore/src/types/agent.ts` — SpatialFieldV2.fertility → flux
- `renalCore/src/types/sphere_node.ts` — コメント更新
- `renalCore/src/agent/agent-manager.ts` — 初期値
- `renalCore/src/renalcore.ts` — decay ロジック + ログ + コメント
- `periphery/src/cleaner-fish/cleaner-fish.ts` — fluxGain
- `periphery/src/bookkeeper/bookkeeper.ts` — applyDecomposition
- `periphery/src/gateway/sphere-core-adapter.ts` — getFertilityBonus() **削除**
- `periphery/src/config/decay-presets.ts` — 全プリセット
- `periphery/src/repository/interfaces.ts` — コメント
- `periphery/src/pulse/pulse-broadcaster.ts` — totalFlux
- `periphery/src/server.ts` — snapshot エンドポイント
- `periphery/src/index.ts` — config + setSpatialRepo 呼び出し削除
- `digestor/src/digestor.ts` — snapshot 型 + ログ
- `sphere.config.json` — fluxDecayRate

### 削除: エージェント知覚ボーナス

- `getFertilityBonus()` 削除
- `setSpatialRepo()` 削除
- sense() の fertility-boosted radius 削除
- ISpatialFieldRepository の import を adapter から削除

---

## 未実装（次のステップ）

1. **fluxPool の実装** — 疎な Map、Bookkeeper に統合
2. **sampleNearbyNodes()** — position ベースの近傍サンプリング
3. **Seep ロジック** — TTL 加算 + pool 減算
4. **テスト** — swarm-agent で flux 蓄積と TTL 変動を観測
