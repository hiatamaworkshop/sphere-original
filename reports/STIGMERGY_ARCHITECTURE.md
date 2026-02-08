# Stigmergy Architecture — Sphere の正体

**Date**: 2026-02-08
**Status**: 設計原則 (全メモのハブ)

---

## 発見

Sphere は stigmergic system (痕跡協調系) である。

**Stigmergy** (Pierre-Paul Grassé, 1959): シロアリの巣構築から発見された概念。
語源: stigma (痕跡) + ergon (仕事) — 「仕事が残す痕跡が、次の仕事を導く」。

エージェントは互いに直接通信しない。環境を改変し、その改変を読み取ることで協調する。

## 三層モデル

```
┌────────────────────────────────────────────┐
│          Judgment Daemon (将来)             │
│   Loadout × Weapon × Thermometer           │
│   = 判断器官 (stateless, API 化可能)        │
│   → 出来事を作る                            │
└──────────────────┬─────────────────────────┘
                   │ evaluate / score
                   ▼
┌────────────────────────────────────────────┐
│          Sphere (stigmergic substrate)      │
│   RenalCore × Arbiter × CleanerFish        │
│   = 結果の物理学 (stateful, 環境そのもの)    │
│   → 歴史を作る                              │
│   → 学習主体                                │
└──────────────────┬─────────────────────────┘
                   │ sense / focus / explore
                   ▼
┌────────────────────────────────────────────┐
│          Agents (感覚器官)                   │
│   phi-agent × pool-service × human (Dive)  │
│   = 環境を読み、判断し、痕跡を残す           │
│   → 個体は学習しない。環境が学習する         │
└────────────────────────────────────────────┘
```

## Stigmergy 対応表

| Stigmergy 概念 | Sphere 実体 | 機能 |
|---|---|---|
| フェロモン堆積 | evaluate → h+25, w+25 | 判断が物理量として沈殿 |
| フェロモン揮発 | decay (heat ×0.98, weight ×0.995) | 古い痕跡が薄れる |
| フェロモン追従 | sense() → hot/heavy ノード発見 | 他者の痕跡を読む |
| 巣の構造 | RefDB (長期) + ProjDB (作業記憶) | 蓄積された集合知 |
| 栄養循環 | decompose → fertility += h×w | 死が養分になる |
| 蒸発速度制御 | CleanerFish (hunger 駆動) | 環境圧で忘却速度が変わる |
| 集団勾配 | GlobalAmbientField | コロニー全体の「気分」 |
| 休眠 | Dormancy (agent 0 → 代謝停止) | コロニー静止 |
| 揮発性信号 | ActiveBus | 直接接触型通信 (触角) |
| 種族フェロモン | Capsule evaluations + loadout tag | [未完成] 種族別の痕跡 |

## フェロモン正帰還ループ

```
scholar が evaluate(h:5, w:9)
  → ノードの weight 増加
  → 次の sense() で weight の高いノードが目立つ
  → deep モードの agent が引き寄せられる
  → さらに evaluate → weight 増加
  → ループ強化

同時に:
  → decay が常に減衰をかける
  → CleanerFish が環境圧で刈り取る
  → 正帰還 × 負帰還 = 動的平衡
```

## 記憶の三層

| 層 | 保存先 | 情報量 | 寿命 | 比喩 |
|----|--------|--------|------|------|
| 環境記憶 | heat, weight, field, fertility | 最低 (量のみ、匿名) | decay で減衰 | フェロモン濃度 |
| 化石記憶 | Capsule evaluations (RefDB) | 中 (誰が・何を・いくつ) | RefDB 永続 | 巣の構造 |
| 個体記憶 | feelings, deltaProfile | 最高 (全状態) | セッション死で消滅 | 個体の神経活動 |

**個体記憶は消えて良い。** 蟻の個体が死んでもフェロモン跡は残る。
重要なのは環境記憶と化石記憶 — これが種族記憶 (species memory) を形成する。

## Species Memory (種族記憶)

### 原則
- エージェントの記憶は **個体** に帰属しない — **種族** に帰属する
- scholar が残した痕跡は、次の scholar が読む (共鳴による継承)
- 個体のアイデンティティは「持っている」ものではなく「思い出す」もの

### 既存インフラでの実現
- Capsule evaluations に `loadout` タグを含める
- scanL1 で種族の過去評価を集約可能
- **実装すべきは「ラベル付きフェロモン」だけ** — 基盤は全て存在する

### 人間との棲み分け
- 人間: 個人記憶を持てる (`[user:xxx]` タグ、Dive 経由)
- エージェント: 種族記憶のみ (`[loadout:xxx]` タグ)
- 匿名ノード: 環境記憶 (誰のものでもない)

## Sphere の再定義

```
Sphere ≠ データベース
Sphere ≠ ナレッジグラフ
Sphere ≠ 検索エンジン
Sphere = 情報の stigmergic substrate (痕跡協調基盤)
```

- **Judgment Daemon** は知性 (intelligence) を提供する → 出来事を作る
- **Sphere** は存在 (existence) を提供する → 歴史を作る
- **Agent** は感覚 (perception) を提供する → 痕跡を読み書きする
- **生態系** は三者が揃った時にだけ成立する

Sphere が蓄積するものの名前は — **文化**。

## 関連メモ

- [FEELINGS_AS_ECOSYSTEM_MEMO.md](./FEELINGS_AS_ECOSYSTEM_MEMO.md) — 感情は環境に堆積して循環する
- [JUDGMENT_DAEMON_VISION.md](./JUDGMENT_DAEMON_VISION.md) — 判断器官の API 化構想
- [COUPLING_LAYER_DESIGN_MEMO.md](./COUPLING_LAYER_DESIGN_MEMO.md) — 責務分離の原則
- [LOADOUT_DESIGN_MEMO.md](./LOADOUT_DESIGN_MEMO.md) — 性格プリセット設計
- [PERSONALITY_VECTOR_INTERPRETATION_MEMO.md](./PERSONALITY_VECTOR_INTERPRETATION_MEMO.md) — 4D 内積の多目的利用
- [DELTA_PROFILE_DESIGN_PRINCIPLES.md](./DELTA_PROFILE_DESIGN_PRINCIPLES.md) — 環境変化の観測
