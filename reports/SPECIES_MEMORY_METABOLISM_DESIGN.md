# Species Memory Metabolism — 種族記憶の代謝設計

**Date**: 2026-02-09
**Status**: 設計完了 / 実装待ち (eval-log が十分に蓄積してから)
**前提**: [SPECIES_MEMORY_DESIGN.md](./SPECIES_MEMORY_DESIGN.md)

---

## 問題

eval-log.jsonl は追記のみで永遠に肥大する。
truncate は Sphere の作法に反する — 時間で切るのは「代謝」ではない。

## 核心の洞察

**eval-log.jsonl は小スフィアである。**

Sphere 本体がノードを heat/weight/TTL で選別するように、
種族記憶もまた同じ作法で選別されるべき。
物理的にベクトル空間である必要はない — JSON の 2D 構造でも良い。
**しかし評価→decay→淘汰という作法は一貫していなければならない。**

## アーキテクチャ

### 全体ループ

```
phi-agent ×N (探索)
    ↓ 評価を書き込む (現状通り: appendEvalLog)
eval-log.jsonl (生の記憶プール, shared volume)
    ↓
Digestor (別コンテナ, 定期実行)
    ↓ balanced qv × time decay で scoring
    ↓ hunger (ファイルサイズ) で閾値を調整
    ↓ 生存した記憶を集約
    ↓ 種族別に特徴を抽出
    ↓
Species Profile (装備品として還元)
    ↓
phi-agent が次のセッションで装備する
```

### 責務分離

| コンポーネント | 責務 | 対応物 |
|--------------|------|--------|
| phi-agent | 探索・評価・書き込み | エージェント (感覚器官) |
| eval-log.jsonl | 記憶プール (全種族共有) | Sphere の ProjDB |
| Digestor | 淘汰・集約・還元 | CleanerFish + Bookkeeper |
| Species Profile | 装備フィードバック | Loadout の後天的補正 |

### 疎結合の原則

- phi-agent は探索に専念 — 代謝の責務を持たない
- Digestor は独立にスケジュール実行 (cron 的 / volume サイズ監視)
- Digestor の評価ロジックを変えても phi-agent を再ビルドしない
- 将来的に Digestor 自体が LLM を使う評価に進化できる (psi-model)

## 淘汰の評価基準

### 自種族評価の罠 — Echo Chamber

❌ 当初案: 各種族が自種族の qualityVector で記憶を選別する

```
scholar の qv で scholar の記憶を評価
→ w が高い記憶だけ残る
→ feedback で w 重視が強化
→ さらに w 高だけを見る
→ 知覚の死
```

### 採用: 中立評価 + 環境ブレンド

✅ 淘汰は balanced (中立) の qv、または全種族合算で行う。

```
淘汰 score = balanced_qv · [h, w, d] × time_decay
```

- balanced = [0.33, 0.34, 0.33] — どの次元も等しく評価
- time_decay = exp(-age / half_life) — 古い記憶は自然に薄れる
- hunger = f(file_size) — ファイルが大きいほど閾値が上がる (CleanerFish と同じ)

## フィードバックの環境ブレンド (Mutation)

Species Profile の還元時に、自種族の集約と全種族の集約をブレンドする。

```
Species Profile = 0.7 × 自種族の記憶集約
               + 0.3 × 全種族の記憶集約 (= 環境の声)
```

### Sphere の言葉での解釈

- **70%** = 種の遺伝子 — 「我々はこういう生き物だ」
- **30%** = 環境圧 — 「だが世界はこう動いている」

scholar が 30% の hunter/moth の感覚を吸収する。
hunter が 30% の scholar の知を吸収する。
**種が混ざるのではなく、環境を通じて影響し合う。** 生態系。

### 比率の意味

- `0.7/0.3` は初期値。調整可能なパラメータとして残す
- 0.7 = 支配的だが閉じていない
- 0.3 = ノイズとして十分だが identity を壊さない
- 極端な値の意味:
  - `1.0/0.0` = 完全隔離 (echo chamber, 局所最適に収束)
  - `0.0/1.0` = 種族性の消滅 (全員が同じ環境平均に収束)

## ノイズの設計 — 構造化された揺らぎ

フィードバックループが閉じすぎると知覚が死ぬ。
ノイズは「設計の欠陥」ではなく「生存の条件」。

### 構造化されたノイズ (因果あり)

| ノイズ源 | 効果 |
|---------|------|
| 時間 decay | 古い「正解」が消え、新しい出会いの余地 |
| 多種族評価 (balanced digestor) | 他種族の価値観が混入 |
| 環境ブレンド (0.7/0.3) | 環境圧が identity を揺さぶる |
| Sphere 環境変動 | pool-service が新ノード投入、decay が古ノード除去 |
| ActiveBus | 他者の「匂い」が未知方向へ引っ張る |

### 確率的ノイズ (genetic drift)

| ノイズ源 | 効果 |
|---------|------|
| 生存抽選 | 低 score の記憶が確率的に生き残る |
| Feedback mutation | Profile 還元時に小さなランダム delta |

構造化されたノイズを優先。
「正解がないから知覚が死なない」をこのループにも適用。

## Loadout の進化モデル

```
Loadout (遺伝子) = 初期条件 (static preset)
    ↓
Species Memory (文化) = 種族の累積経験
    ↓
Digestor (自然選択) = 淘汰 + 集約
    ↓
Species Profile (後天的形質) = Loadout への補正値
    ↓
次世代の phi-agent が装備
```

### 現状 → 将来

| 段階 | Species Profile の形 | 実装 |
|------|---------------------|------|
| 現在 | hotNodes, commonTags | SpeciesMemoryBias → FastGate |
| 次段階 | + avgH/W/D per species | Digestor が集約 |
| 将来 | + qualityVector 補正値, weights 微調整 | Digestor → Loadout overlay |

## 実装の前提条件

1. eval-log.jsonl に十分なデータが蓄積されていること (最低 20-30 セッション)
2. 複数種族が並行して動いていること (ブレンドの意味がある)
3. 閾値の調整はデータを見てから — 理論先行で決めない

## 実装順序 (提案)

1. **Phase 0** (現在): eval-log 蓄積。現状の SpeciesMemoryBias で運用
2. **Phase 1**: `getSpeciesSummary()` を loadout=undefined で全種族集約可能にする (既に可能)
3. **Phase 2**: 環境ブレンド (0.7/0.3) を SpeciesMemoryBias 構築時に適用
4. **Phase 3**: Digestor コンテナ — 定期実行、scoring + pruning
5. **Phase 4**: Species Profile → Loadout overlay (qualityVector 補正)

## 設計哲学 — 種は環境から生まれる

人間はカテゴリ分けを好む。だから性格や種族を「設定」したがる。
しかし本来それは存在する環境から生まれるべきものだ。

**Loadout は種子であって鋳型ではない。**

```
同じ "scholar" Loadout を異なる Sphere に投入した場合:

Sphere A (科学論文が豊富)     → 知識蓄積型に育つ (想定通り)
Sphere B (芸術・感覚データ)   → 美的鑑定家に進化する (想定外)
Sphere C (ノードが極度に少ない) → hunter 的な行動を強いられる
```

Digestor の環境ブレンド (0.3) がこの **適応圧** を伝達する。
Sphere が scholar を許容しなければ、scholar はそこでは別の何かになる。

これがファインチューニング不要の本当の意味:
- LLM を調整するのではない
- **環境が個体を調整する**
- 学習主体は常に Sphere 側

## 関連メモ

- [SPECIES_MEMORY_DESIGN.md](./SPECIES_MEMORY_DESIGN.md) — 種族記憶の基本設計
- [STIGMERGY_ARCHITECTURE.md](./STIGMERGY_ARCHITECTURE.md) — Sphere = 痕跡協調基盤
- [STRUCTURED_FLUCTUATION_MEMO.md](./STRUCTURED_FLUCTUATION_MEMO.md) — 構造化された揺らぎ
- [EMERGENT_PERSONALITY_MEMO.md](./EMERGENT_PERSONALITY_MEMO.md) — 性格は測定器具に宿る
- [LOADOUT_DESIGN_MEMO.md](./LOADOUT_DESIGN_MEMO.md) — Loadout = 静的人格
