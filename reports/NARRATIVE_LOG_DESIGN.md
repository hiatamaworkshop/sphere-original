# Narrative Log — エージェントの言葉を蓄積・代謝・配信する

**Date**: 2026-02-11
**Status**: Design (構想段階)
**Context**: IO Gateway 実装完了を受けて、次の蓄積対象を設計する

---

## 背景

エージェントは帰還時に独白 (return response) を生成する。
探索中に出会ったノード群を振り返り、種族の声 (SPECIES_VOICE) で語る。

**現状: 生成して捨てている。** stdout に表示するだけで永続化されない。

これは Sphere の作法に反する。情報は蓄積され、評価され、淘汰されなければならない。

---

## 二つのデータストリーム

| ストリーム | タイミング | 内容 | 現状 |
|-----------|-----------|------|------|
| **リアルタイム独白** | 探索中 (各サイクル) | フラグメント — 反応の断片 | 未実装 (stream=true, 将来) |
| **帰還レスポンス** | セッション終了時 | ナラティブ — 体験の振り返り | 実装済み (response=true, stdout のみ) |

この二つは **同一ストレージに同居する**。
type フィールドで区別すれば十分。

```jsonl
{"type":"stream","loadout":"moth","timestamp":1234,"nodeId":"abc","fragment":"...","cycle":3}
{"type":"return","loadout":"moth","timestamp":1240,"duration":60000,"narrative":"...","encounters":[...],"feelings":{...}}
```

---

## eval-log との対比

| 層 | eval-log (既存) | narrative-log (構想) |
|---|---|---|
| **蓄積** | phi-agent → POST /evaluations | phi-agent → POST /narratives |
| **内容** | nodeId + h,w,d + tags (数値) | narrative text + encounters + feelings (テキスト) |
| **目的** | 内部フィードバック (species-profile) | 外部配信 (Observatory) |
| **評価** | エージェント自身 (即時、探索中) | 未定 (後述) |
| **代謝** | Digestor (balanced_qv × time_decay → prune) | Digestor (同一パイプライン) |
| **消費者** | phi-agent (次セッションの知覚バイアス) | Observatory, 外部 UI, 人間 |

eval-log = 測定値 (フェロモン)。
narrative-log = 解釈 (壁画)。

目的が違うから別ファイル。だが代謝の原理は同じ。

---

## 核心: ナラティブも評価される

> Sphere の流儀に従えば、情報体は評価されなければならない。

narrative-log のエントリは「テキストという情報体」であり、
それ自体がスコアリングの対象になる。

### 評価者の候補

| 評価者 | 方式 | 備考 |
|--------|------|------|
| **常駐エージェント** | narrative を読んで h/w/d を付ける daemon | eval-log のエージェントと同構造。対象が Sphere ノードではなくナラティブ |
| **人間** | Observatory 経由のフィードバック (like/dislike, rating) | 外部世界からの評価圧。人間が面白いと思った独白は生き残る |
| **両方** | スコアの出処が違うだけで、同じ次元に落ちる | ブレンド比率は Digestor が決める |

**評価者が誰かは未定。だが代謝の仕組みは既に存在する。**

Digestor の `computeScore(h, w, d, age, halfLife)` → `prune()` → `buildProfile()` は
入力が eval-log か narrative-log かを問わない。

### スコアリングの問い

テキストに h/w/d を付けるとして、各次元は何を意味するか?

- **h (heat)**: ナラティブの関心度。読んで面白いか、共有したいか
- **w (weight)**: ナラティブの密度。洞察があるか、中身があるか
- **d (decay)**: ナラティブの寿命。すぐ古くなるか、長く読めるか

これは Sphere ノードの h/w/d と**同じ物理量**をテキストに適用したもの。
ノードの物理法則がナラティブにも適用される — Sphere のフラクタル構造。

---

## アーキテクチャ選択

### A案: Sphere にマッピング (完全)

ナラティブを Sphere ノードとして受肉させる。
実際に Sphere 内に narrative ノードが生まれ、他のノードと同じ物理法則で生き死にする。

```
narrative → pool-service (or 直接 contribute) → Sphere node
                                                    ↓
                          通常の decay / evaluation / decompose
```

**利点**: 既存の全インフラがそのまま使える (物理, 評価, 可視化)
**欠点**: ナラティブの粒度が Sphere ノードと合わない可能性。ノードは情報の原子だが、ナラティブは解釈の複合体

### B案: 概念として落とし込む (独立)

narrative-log は Sphere の外にある別の蓄積。
だが代謝の原理 (score × time_decay → prune) は借用する。

```
narrative → POST /narratives → narrative-log.jsonl (Digestor 内)
                                       ↓
                          独自の digest cycle (同一パイプライン)
                                       ↓
                          GET /narratives ← Observatory
```

**利点**: ナラティブ固有の粒度・形式を保てる。Sphere を汚さない
**欠点**: 評価パイプラインを別途構築する必要がある (ただし Digestor の既存コードは再利用可能)

### 判断保留

どちらが正しいかはまだ分からない。
実装が近いのは B案 (IO Gateway + JSONL + Digestor)。
A案は conceptually elegant だが、ノードの粒度問題を解決してから。

---

## IO Gateway エンドポイント (構想)

```
POST /narratives              ← phi-agent が独白を投げる
GET  /narratives              ← 最新のナラティブ一覧 (Observatory 用)
GET  /narratives/:id          ← 単一ナラティブ
POST /narratives/:id/score    ← 評価を受け付ける (agent or human)
```

---

## データフロー

```
phi-agent (exploring, stream=true)
  │  リアルタイムフラグメント
  ▼
POST /narratives { type: "stream", fragment: "..." }
  │
phi-agent (returning, response=true)
  │  帰還ナラティブ
  ▼
POST /narratives { type: "return", narrative: "...", encounters: [...] }
  │
  ▼
narrative-log.jsonl (Digestor storage)
  │
  │  ← POST /narratives/:id/score { h, w, d, source: "agent"|"human" }
  │
  ▼
Digestor digest cycle (score × time_decay → prune → survived)
  │
  ▼
GET /narratives (survived only) ← Observatory / 外部 UI
```

---

## ストレージ構造 (構想)

```
Digestor data/
  ├── eval-log.jsonl              ← 既存: 評価ログ
  ├── species-profile.json        ← 既存: 種族プロファイル
  ├── generations/                ← 既存: 世代アーカイブ
  ├── narrative-log.jsonl         ← 新規: ナラティブログ
  └── narrative-scores.jsonl      ← 新規: ナラティブへのスコア (評価者 → Digestor)
```

narrative-log と narrative-scores を分離するのは、
eval-log で「評価者 = 被評価者」だった構造と区別するため。
ナラティブは「書いた者 ≠ 評価する者」。

---

## 未決事項

1. **評価者**: 常駐 agent? 人間? 両方? — 最初は人間評価 (Observatory) だけで十分かもしれない
2. **A案 vs B案**: Sphere マッピング vs 独立ストレージ — B案で開始、必要なら A案に昇格
3. **リアルタイム独白の生成方法**: stream=true 時に何を吐くか — evalFocus の応答の一部? 別途 prompt?
4. **代謝パラメータ**: narrative の halfLife は eval-log と同じ 72h か? もっと長い?
5. **容量見積もり**: 1 narrative ≈ 2KB (テキスト + メタデータ)。100 sessions/day × 2KB = 200KB/day。年間 73MB。eval-log より遥かに大きい

---

## References

- `RETURN_RESPONSE_DESIGN.md` — 帰還時応答生成の実装 (現行)
- `SPHERE_ECOSYSTEM_DESIGN.md` — IO Gateway, データ蓄積 = サービス境界
- `STIGMERGY_ARCHITECTURE.md` — Sphere = stigmergic substrate
- `SPECIES_MEMORY_METABOLISM_DESIGN.md` — Digestor の代謝パイプライン (eval-log 版)

---

**結論**: ナラティブは Sphere の中の Sphere。情報は生まれ、評価され、淘汰され、生き残ったものだけが外の世界に語られる。代謝の原理は既に手元にある。あとは配線するだけだ。
