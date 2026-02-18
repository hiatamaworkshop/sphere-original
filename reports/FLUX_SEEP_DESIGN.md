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

## 完了済みの変更（2026-02-18 Seep 実装）

### DecompositionResult に position 追加

- `periphery/src/cleaner-fish/cleaner-fish.ts` — `position: number[]` フィールド追加
  - `decompose()` → `fossilNode.vector` を返却
  - `evaporate()` → 空配列（flux なし）

### fluxPool + processFluxSeep()

- `periphery/src/bookkeeper/bookkeeper.ts`:
  - `fluxPool: Map<string, { position: number[], amount: number }>` — 疎な Map
  - `applyDecomposition()` — position 受け取り、fluxPool にエントリ追加
  - `processFluxSeep()` — 毎 observation サイクル実行
    - `queryNearby(position, N=3, radius=1.0, sampleRatio=0.3)` で近傍サンプル
    - SystemCore / environment ノードは対象外
    - `node.TTL += pool.amount × SEEP_RATE`
    - `pool.amount *= SEEP_DECAY` (自然蒸発)
    - `pool.amount < SEEP_MIN_FLUX` → エントリ削除
  - `getStats()` — `fluxPoolSize` 追加

### Observation サイクルに統合

- `periphery/src/index.ts` — CleanerFish 処理後に `bookkeeper.processFluxSeep()` 呼び出し

### ビルド確認

- `renalCore` — tsc 通過
- `periphery` — tsc --noEmit 通過
- `digestor` — tsc --noEmit 通過

---

## 完了済みの変更（2026-02-18 Fossil SystemCore 修正 + ライブテスト）

### Fossil から SystemCore フラグ削除

- `periphery/src/cleaner-fish/cleaner-fish.ts` — `fossilize()` の flg から `NodeFlag.SystemCore` を除去
  - 修正前: `flg | Compressed | SystemCore` — heat/TTL 凍結 → 永遠に PROTECTED → decompose 不可
  - 修正後: `flg | Compressed` — heat/TTL が自然減衰 → protectionThreshold 以下で decompose 可能
  - Fossil は風化すべき存在。Relic と違い永続する理由がない

### ライブテスト結果（dev プリセット、phi-agent 稼働中）

観測データ（tick は 1秒間隔）:

| tick | 状態 | 備考 |
|------|------|------|
| 0-120 | ghost=39, fossil=0 | ghost の TTL 減衰中 |
| ~130 | ghost→fossil ×39 | TTL ≤ fossilizeTTL(100) で一斉 fossil 化 |
| 130-350 | fossil=39, PROTECTED | heat 減衰中（360→100、約 3.5 分） |
| ~360 | **decomposed=20** | protectionThreshold(100) 以下 → 分解、flux=~7000/node |
| 360 | **flux_seep pool=21 seeped=21 drip=7908.7** | 初回 seep — 近傍ノードへ TTL 滴下 |
| ~400 | decomposed=残り19 | pool=39 |
| 400-2100 | pool 減衰中 | drip: 11423→89→1.2→0.2 (指数減衰) |
| ~2140 | **evaporated=2** | pool < SEEP_MIN_FLUX(0.1) でエントリ消滅開始 |
| ~2260 | pool=0 | 全エントリ消滅、seep 停止 |

### 検証項目

- [x] decompose → fluxPool エントリ生成（position + amount）
- [x] processFluxSeep → 近傍ノード TTL に drip（queryNearby sampleRatio=0.3）
- [x] pool 自然蒸発（SEEP_DECAY=0.995 × SEEP_RATE drip で指数減衰）
- [x] pool < SEEP_MIN_FLUX → エントリ削除（自然消滅）
- [x] pool=0 → seep 停止（O(0) — 空の Map は即 return）

---

## 未実装（将来のステップ）

1. **パラメータチューニング** — SEEP_RATE, SEEP_RADIUS, SEEP_DECAY の実運用調整
2. **natural プリセットでの長期観測** — 数時間単位の flux 蓄積と TTL 変動の確認
