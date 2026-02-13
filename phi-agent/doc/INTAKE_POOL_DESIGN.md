# Intake Pool — 設計メモ

**Date**: 2026-02-08
**Status**: 設計確定、未実装

---

## 1. 問題: 投入品質のボトルネック

Sphere には受肉パイプライン (incarnation pipeline) が実装済みで、外部からのノード投入も `POST /sphere/contribute` で受け付ける。しかし **投入前の品質判断** が欠けている。

現状の選択肢とその限界:

| 方式 | 問題 |
|------|------|
| 人間が判断 | 疲労・気分・一貫性なし、スケールしない |
| LLM に推論させる | ブラックボックス、再現性なし、コスト高 |
| ルールベース | 柔軟性なし、境界ケースに弱い |

**答え: LLM を計測器として使い、判断は数学で行う。**

---

## 2. LLM = 温度計、裁判官ではない

### 核心原則

LLM は **固定プロンプト → 4スコア (JSON)** を返すだけの計測器。

```
LLM への入力: ノードの content + summary + tags (固定プロンプト)
LLM からの出力: { authority, novelty, coherence, catalyst } (各 0.0-1.0)
最終判断: dot(scores, intakeWeights) > threshold
```

- LLM は「このノードを入れるべきか」を問われない
- LLM は「このノードの authority は何点か」だけ問われる
- 判断 (入れる/入れない) は内積とスカラー閾値で決定論的に行われる

### なぜ温度計か

```
温度計の性質:
  - 固定スケールで計測する (0.0-1.0)
  - 計測結果に意見を持たない
  - 交換可能 (別の温度計でも同じ)
  - 壊れても系は崩壊しない (計測をやり直せばいい)

LLM スコアラーの性質:
  - 固定 JSON で返す (4次元)
  - スコアに判断を含まない
  - 交換可能 (phi3 → GPT-4 → 専用分類器)
  - 壊れても Pool が溜まるだけ (Sphere は無傷)
```

### 将来の交換可能性

LLM は計測器に過ぎないため、以下に置き換え可能:

- 小型モデル (phi3:mini 等)
- 専用分類器 (fine-tuned BERT 等)
- ルールベース + embedding hybrid
- 人間のラベリング (バッチ処理)

**インターフェースは常に `{ authority, novelty, coherence, catalyst }` の 4 スコア。**

---

## 3. Score-to-Flag ブリッジ — 連続値から 16bit へ

LLM の連続スコアと Sphere の 16bit フラグ体系を接続する。

### マッピング

| LLM スコア | 閾値例 | Sphere Flag | 用途 |
|-----------|--------|-------------|------|
| authority > 0.6 | 0.6 | Authority (0x0001) | Weapon の flagBias.authority に作用 |
| catalyst > 0.5 | 0.5 | Catalyst (0x0002) | Weapon の flagBias.catalyst に作用 |
| novelty > 0.5 | 0.5 | Freshness (0x0004) | Weapon の flagBias.freshness に作用 |
| coherence | — | フラグなし | Intake 閾値として使用 |

### coherence の役割

coherence は Sphere フラグに変換されない。投入判断の基準値として機能:

```
coherence < 0.3 → reject (支離滅裂なノードを弾く)
coherence ≥ 0.3 → 他のスコアとともに総合判断へ
```

### 間接結合

LLM スコア → フラグ変換 → Weapon の flagBias が反応。LLM と Weapon は直接通信しない。

```
LLM (計測) → [閾値変換] → 16bit flags → Tagger → Sphere ノード
                                              ↓
Weapon (評価) ← flagBias ← flags を読む ← Sphere ノード
```

LLM が設定したフラグを、後日 Sphere の Tagger が書き換えることもある。**LLM のフラグは初期状態のシード**であり、最終状態ではない。

---

## 4. Multi-Scorer アーキテクチャ

### Weapon の問題と解決

Pool のエントリは Sphere に投入前のため、物理メトリクス (heat, weight, decay) が存在しない。Weapon の stateBias/ratioBias が機能しない。

**解決: Scorer A が初期メトリクスを付与する。**

### パイプライン

```
外部情報
  ↓
スフィアノード形式 (NodeSeed: tags, summary, content)
  ↓
┌─────────────────────────────────────────────────────────┐
│ Tagger                                                  │
│  tags のキーワードマッチング → 16bit flags               │
│  (既存の tagger.ts のロジックをそのまま使用)              │
└─────────────────────────────────────────────────────────┘
  ↓ flags 付き NodeSeed
┌─────────────────────────────────────────────────────────┐
│ Scorer A (LLM 温度計)                                    │
│  固定プロンプト → { authority, novelty, coherence, catalyst } │
│  スコアから初期メトリクスを算出:                          │
│    heat = f(authority, catalyst)                         │
│    weight = f(authority, novelty)                        │
│    decay = f(coherence)                                  │
│  → これで Weapon が動作可能に                            │
└─────────────────────────────────────────────────────────┘
  ↓ flags + 初期メトリクス付き
┌─────────────────────────────────────────────────────────┐
│ Scorers B, C, D (性格付き評価者)                         │
│  各自 Loadout (性格) + Weapon (スコアリング) を装備       │
│  pickFocusTarget() と同じパイプライン:                    │
│    score = base × flagGate × stateGate × ratioMod       │
│  → 性格ごとに異なるスコアを返す                          │
│  → コンセンサス / 加重平均で最終判断                     │
└─────────────────────────────────────────────────────────┘
  ↓ 合格 → ExperienceCapsule として submit
┌─────────────────────────────────────────────────────────┐
│ POST /sphere/contribute                                 │
│  Gatekeeper → Parser → Tagger → Packer → Bookkeeper    │
│  (既存パイプライン、変更なし)                            │
└─────────────────────────────────────────────────────────┘
```

### Loadout の再利用

phi-agent で開発した Loadout 体系がそのまま Pool Scorer に使える:

- **qualityVector**: 何を「良い」と見なすかの 4D ベクトル
- **Weapon (flagBias, stateBias, ratioBias)**: 乗算スコアリング
- **pickFocusTarget()**: 同じ関数、同じ型、異なるコンテキスト

```
Sphere 探索: sense → pickFocusTarget → focus → evaluate
Pool 評価:   Pool → pickFocusTarget → threshold → submit or reject
```

### Scorer 構成例

| Scorer | Loadout | 役割 |
|--------|---------|------|
| A | なし (温度計) | 初期メトリクス付与、LLM 1回 |
| B | scholar | 権威性・深さ重視の評価 |
| C | scout | 新規性・多様性重視の評価 |
| D | archivist | 保存価値・長期性重視の評価 |

---

## 5. 三つの禁止事項 — Pool の純粋性

Pool のノードは Sphere に入る前の段階。以下を禁止:

| 禁止 | 理由 |
|------|------|
| **記憶を持たない** | Pool は一時的な待機場所。ノード間の関連を覚えない |
| **成長しない** | Pool 内でメトリクスが変化しない。評価は snapshot |
| **関係を結ばない** | Pool 内のノード同士にリンクを張らない |

これらは Sphere の中で起きるべきこと。Pool は「入り口の検問所」であり、生態系ではない。

---

## 6. 外部サービスとしてのデプロイ

### 原則: Sphere は LLM 駆動装置ではない

Pool Service は Sphere の外部プロセスとして稼働する。これは phi-agent と同じパターン。

```
phi-agent:   独立プロセス → WebSocket → Sphere (Gateway)
Pool Service: 独立プロセス → HTTP POST → Sphere (contribute endpoint)
```

### なぜ外部か

1. **LLM のスループットに Sphere を結合しない** — Scorer A が遅くても Sphere の tick/decay/CleanerFish は止まらない
2. **スケーラビリティ** — Pool Service を複数インスタンスにしても Sphere は 1 つのまま
3. **障害分離** — Pool Service がダウンしても Sphere は無傷。Pool が溜まるだけ
4. **Sphere の純粋性** — Sphere は「LLM が来たときに受け入れる」だけ。呼びに行かない

### アーキテクチャ図

```
                       ┌─────────────┐
外部情報ソース ──────→ │ Pool Service │
(RSS, API, 手動)       │             │
                       │ ┌─────────┐ │
                       │ │ Tagger  │ │
                       │ ├─────────┤ │
                       │ │Scorer A │←── ollama / 外部 LLM
                       │ ├─────────┤ │
                       │ │Scorer B │ │
                       │ │Scorer C │ │  (Loadout + Weapon)
                       │ │Scorer D │ │
                       │ └─────────┘ │
                       │   ↓ 合格    │
                       └──────┬──────┘
                              │ HTTP POST (ExperienceCapsule)
                              ↓
                       ┌─────────────┐
                       │   Sphere    │
                       │ (contribute │
                       │  endpoint)  │
                       └─────────────┘
```

### Sphere 側の変更

**なし。** 既存の `POST /sphere/contribute` が ExperienceCapsule を受け付け、incarnation pipeline (Gatekeeper → Parser → Tagger → Packer → Bookkeeper) がそのまま処理する。

Pool Service が生成する ExperienceCapsule の NodeSeed.flags に Scorer のフラグ情報を載せれば、Sphere 側の Tagger がマージする (既存の `flags | existingFlags` ロジック)。

---

## 7. Pool Phase Evolution

段階的に複雑さを増す:

### Phase 1: Flat Pool (最小実装)

```
- 配列ベースの FIFO キュー
- Scorer A (LLM 温度計) 1 体のみ
- threshold 以上 → 即 submit
- threshold 以下 → 破棄
```

### Phase 2: Bucketed Pool

```
- スコア帯ごとにバケット分け
- 複数 Scorer (B, C, D) による多角評価
- コンセンサス判断 (majority vote / weighted average)
- 保留バケット (ボーダーライン) の定期再評価
```

### Phase 3: Vectorized Pool

```
- Pool 内ノードの embedding ベース重複検出
- 類似ノード群のクラスタリング → 代表ノードのみ submit
- Sphere の現在の温度分布を参照した適応的閾値
```

---

## 8. 既存パイプラインとの対応表

| 処理 | 既存実装 | Pool での位置 | 変更要否 |
|------|---------|-------------|---------|
| スキーマ検証 | Gatekeeper | Sphere 側 (既存) | なし |
| 384D ベクトル化 | Parser (all-MiniLM-L6-v2) | Sphere 側 (既存) | なし |
| タグ → フラグ変換 | Tagger (regex) | Pool Service + Sphere 側 | Pool 側に軽量コピー |
| 初期メトリクス | Packer (config 固定値) | Scorer A が算出 → Packer が最終設定 | なし |
| 重複排除 | Packer (SHA256 content-hash) | Sphere 側 (既存) | なし |
| DB 書き込み | Bookkeeper (RefDB + ProjDB) | Sphere 側 (既存) | なし |
| **品質評価** | **なし** | **Scorer A + B/C/D** | **新規** |

---

## 9. 設計原則まとめ

1. **LLM は計測器** — 固定プロンプトで 4 スコアを返すだけ。判断は数学
2. **判断は内積** — `dot(scores, intakeWeights) > threshold` で決定論的
3. **Scorer A が橋渡し** — LLM スコアを Sphere メトリクス空間に写像し、Weapon を有効化
4. **Loadout 再利用** — 探索で開発した性格体系が intake でもそのまま機能
5. **Pool は純粋** — 記憶・成長・関係なし。Sphere の入り口の検問所
6. **外部サービス** — Sphere の tick に LLM を結合しない。phi-agent と同パターン
7. **Sphere 無変更** — ExperienceCapsule で submit。incarnation pipeline はそのまま

---

## 関連

- `COUPLING_LAYER_PHILOSOPHY.md` — エージェント階層と設計原則
- `LLM_AS_JUDGMENT_ELEMENT.md` — LLM を判断素子として扱う設計
- `GHOST_FOSSIL_FILTER_DESIGN.md` — Ghost/Fossil 評価パス
- `FAST_PATH_DESIGN.md` — FastGate アーキテクチャ
- `reports/LOADOUT_DESIGN_MEMO.md` — Loadout 設計
