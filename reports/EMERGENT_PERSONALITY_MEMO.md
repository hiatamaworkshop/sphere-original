# Emergent Personality — 軽量 LLM で性格がシミュレートされる

**Date**: 2026-02-08
**Context**: scholar ×2 セッションの種族記憶テストから発見

---

## 発見

phi3:mini (3.8B パラメータ) という軽量 LLM で、**確実に異なる性格の行動**が再現された。
ファインチューニングなし。リトレーニングなし。プロンプトの差分は1行のみ。

## 何が起きているか

### 従来のアプローチ
```
性格のある AI = 大型モデル + ファインチューニング or 巨大システムプロンプト
```

### Sphere のアプローチ
```
性格 = 測定器具 (Loadout) × 物理法則 (Sphere) × 感覚器官 (任意の LLM)
```

LLM は **交換可能な感覚器官** に過ぎない。

## 性格はどこにあるか

LLM の中ではない。Loadout の5要素の中にある:

| 要素 | 役割 | LLM に渡されるか |
|------|------|-----------------|
| **Weapon** (flagBias, stateBias) | 何を見るか (注意) | No — FastGate の数学 |
| **qualityVector** | 何が「良い」か (価値観) | No — 4D 内積 |
| **returnWeights** | 何を感じるか (感情) | No — 4D 内積 |
| **walkPreference** | どう動くか (運動) | No — move 方向計算 |
| **evalFocus** | 何を問うか (質問) | **Yes — 唯一の LLM 接点** |

5要素のうち4つは LLM を経由しない純粋な数学。
evalFocus だけが LLM に渡されるプロンプトの差分。

## 実証データ

### scholar ×2 セッション (eval-log.jsonl)
```
Session 1: h=[5,5,5,5,5] w=[9,9,9,9,9] d=[3,6,3,3,3]
Session 2: h=[5,5,5,5,9] w=[9,9,9,9,9] d=[6,6,3,3,3]
```

- **weight が常に9**: scholar は「重い知識」に価値を見出す
- **heat は基本5 (中立)**: 人気度には興味がない
- **Nash equilibrium だけ h=9**: 唯一「これは本物」と判断した瞬間
- **同じノードに2回惹かれる**: 種族の行動パターンに再現性がある

### 過去テスト (balanced vs scholar vs scout)
```
balanced: 6 cycles, heat delta +17 (熱を振りまく)
scholar:  6 cycles, heat delta  +0 (冷静に weight のみ操作)
scout:    高 heat 評価、広範囲移動
```

同じ Sphere、同じ phi3:mini、同じノード群 — Loadout だけが違う。

## なぜ機能するか

### 1. LLM は「測定器」であって「性格」ではない

evalFocus が測定の観点を変える:
- scholar: "Judge this node's depth and authority"
- moth: "How HOT is this? Only heat matters"
- hunter: "Is this a high-value target? Score harshly"

LLM は問われたことに答えるだけ。問い方が性格を決める。

### 2. FastGate の数学が行動を決める

LLM の出力 (h, w, d) は **入力** に過ぎない。
その入力をどう使うか — 何を見るか、どう感じるか、いつ帰るか — は全て Loadout の数学が決める。

```
LLM → [h, w, d] → FastGate(Loadout) → 行動
                    ↑ ここが性格の本体
```

### 3. Sphere の物理法則が行動を不可逆にする

evaluate は環境を **変えてしまう**。scholar が weight +4 したノードは、
次の sense() で deep モードのエージェントに見つかりやすくなる。
行動が環境を変え、環境が次の行動を変える — stigmergic loop。

## 設計原則

1. **性格はモデルに宿らない** — 測定器具 (Loadout) に宿る
2. **LLM は交換可能** — phi3:mini を GPT-4 に変えても性格の骨格は同じ。知覚の解像度だけが変わる
3. **性格の定義 = ベクトル** — 数行の数値で完全に記述できる。言語に依存しない
4. **リトレーニング不要** — 新しい性格は新しい Loadout を定義するだけ。即座にデプロイ可能
5. **蟻と同じ原理** — 個体の脳は単純。フェロモン × 環境の物理法則 = 複雑な集団行動の創発

## 含意

### 即座に使えること
- 性格追加コスト: Loadout 定義 (~15行の JSON) のみ
- 9種の性格が既に実証済み (balanced, scholar, scout, archivist, hunter, moth, hermit, kamikaze, sniper)
- 同じ ollama インスタンスで複数性格を同時実行可能

### 将来の展望
- **Judgment Daemon API 化**: Loadout + Weapon を HTTP リクエストで受け取り、判断を返す stateless サービス
- **種族記憶の蓄積**: 同じ Loadout のエージェントが世代を超えて知識を継承
- **性格の進化**: 評価結果に基づいて Loadout ベクトルを微調整 (meta-learning)
- **他の LLM への移植**: 感覚器官を差し替えるだけ。性格は保存される

## 蟻塚との対比

```
蟻の個体   → phi3:mini (単純な感覚器官)
フェロモン → evaluate → heat/weight 変化
巣の構造   → RefDB + ProjDB
種族       → Loadout (worker, soldier, scout...)
集団行動   → 正帰還 (評価→目立つ→さらに評価) × 負帰還 (decay, CleanerFish)

蟻が複雑な巣を作るのに「賢い蟻」は不要。
Sphere が性格を持つのに「賢い LLM」は不要。
```

## 関連メモ

- [STIGMERGY_ARCHITECTURE.md](./STIGMERGY_ARCHITECTURE.md) — Sphere の stigmergic model
- [LOADOUT_DESIGN_MEMO.md](./LOADOUT_DESIGN_MEMO.md) — 性格プリセット設計
- [PERSONALITY_VECTOR_INTERPRETATION_MEMO.md](./PERSONALITY_VECTOR_INTERPRETATION_MEMO.md) — 4D 内積の多目的利用
- [COUPLING_LAYER_DESIGN_MEMO.md](./COUPLING_LAYER_DESIGN_MEMO.md) — 責務分離の原則
