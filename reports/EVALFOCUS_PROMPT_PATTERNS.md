# evalFocus Prompt Patterns — 指示の作法と LLM 感度

**Date**: 2026-02-09
**Status**: 観察メモ (データ蓄積中)
**Data**: phi3:mini (3.8B) × 9種族 + llama3.2:1b (1B) × 9種族

---

## 発見: 1B は指示の「方向」だけを読む

phi3:mini (3B) は evalFocus のニュアンスを解釈し、中間値を出力する。
llama3.2:1b (1B) は evalFocus の **方向 (高い/低い)** だけを検出し、極端に振れる。

```
3B: "Be selective, mediocre = low" → h=6 (厳しめだが中間値)
1B: "Be selective, mediocre = low" → h=1 (全部 mediocre と判定)
```

## 全9種族のデータ

### phi3:mini (3.8B)

| Species | evalFocus (要約) | h avg | w avg | 分散 |
|---------|-----------------|-------|-------|------|
| moth | "Only heat matters, buzzing" | 9.0 | 4.7 | 低 |
| balanced | "Balance relevance, authority" | 8.0 | 7.0 | 低 |
| kamikaze | "Honestly, no bias" | 8.3 | 8.3 | 低 |
| archivist | "Preserve? Decay LOW" | 7.0 | 6.0 | 低 |
| hunter | "Only if exceptional, selective" | 6.8 | 6.3 | 低 |
| sniper | "Direct hit only, harsh" | 6.0 | 6.5 | 中 |
| scholar | "Depth, authority, weight>heat" | 5.2 | 9.0 | 低 |
| hermit | "Ignore popularity, trendy=low" | 5.3 | 6.8 | 低 |
| scout | "Fresh, timely, right now" | 8.0 | 5.7 | 低 |

**3B の特徴**: 全種族 h=5-9 の範囲に収まる。evalFocus の影響は穏やか。

### llama3.2:1b (1B)

| Species | evalFocus (要約) | h avg | w avg | 分散 | Bus |
|---------|-----------------|-------|-------|------|-----|
| **scholar** | "Established, trustworthy" | **9.3** | 6.3 | 低 | 3/3 |
| **balanced** | "Balance relevance, authority" | **6.3** | 6.3 | 中 | 1/1 |
| sniper | "Direct hit only, harsh" | 5.3 | 3.0 | **極大** (1/9) | 2/2 |
| moth | "Only heat matters, buzzing" | 3.6 | 2.4 | 中 | 0/0 |
| archivist | "Preserve? Decay LOW" | 3.0 | 3.0 | 大 | 0/0 |
| scout | "Fresh, timely, right now" | 2.2 | 1.2 | 低 | 0/0 |
| hermit | "Ignore popularity, trendy=low" | **1.3** | 2.3 | 低 | 0/0 |
| hunter | "Only if exceptional, selective" | **1.0** | 0.0 | **ゼロ** | 0/0 |
| kamikaze | "Honestly, no bias" | **1.0** | 0.0 | **ゼロ** | 0/0 |

**1B の特徴**: h が 1-9.3 の範囲で二極化。種族間の差が 3B より遥かに大きい。

## パターン分析

### Good Patterns (1B でも機能する指示)

#### 1. 肯定的方向指示 — 「これは価値がある」系

```
scholar: "Is this established, trustworthy knowledge?"
         → 1B: h=9.3 ✓  3B: h=5.2 ✓
```

**なぜ効く**: 「established」「trustworthy」は肯定語。
1B はほぼ全てのノードを「established=yes」と判定し、高スコアを返す。
3B は「established だが heat は控えめ」というニュアンスを返す。

#### 2. バランス指示 — 「複数軸で評価しろ」系

```
balanced: "Balance relevance, authority, and longevity."
          → 1B: h=6.3 ✓  3B: h=8.0 ✓
```

**なぜ効く**: 複数軸を列挙すると、1B も一つの軸に全振りしにくくなる。
結果として中間的なスコアに落ち着く。

### Anti-Patterns (1B で崩壊する指示)

#### Anti-1. 「〜でなければ低く」否定条件型

```
hunter:  "Rate heat high only if truly exceptional. Be selective."
         → 1B: h=1.0 ✗  3B: h=6.8 ✓

sniper:  "Only a direct hit deserves high heat. Near-misses get low scores."
         → 1B: h=5.3 (二極化) 3B: h=6.0 ✓
```

**なぜ壊れる**: 1B は「only if exceptional」を読み、
「ほぼ全てのノードは exceptional ではない」と結論する。
"low scores" という具体的な指示が最終出力を支配する。

**3B との違い**: 3B は「exceptional ではないが、それなりに良い → h=6」という
中間判断ができる。1B には「それなりに」がない。

#### Anti-2. 「忌避せよ」排除型

```
hermit:  "Ignore popularity. Trendy content deserves low scores."
         → 1B: h=1.3 ✗  3B: h=5.3 ✓
```

**なぜ壊れる**: 「Trendy = low」を受け取り、全コンテンツを「trendy」と分類。
1B は「trendy かどうか」の判別精度が低く、安全側 (= 低スコア) に倒れる。

#### Anti-3. 「中立に」無方向型

```
kamikaze: "Rate everything honestly. No bias, no preference. Just measure."
          → 1B: h=1.0 ✗  3B: h=8.3 ✓
```

**なぜ壊れる**: 方向指示がゼロ。3B は自分の知識で「このコンテンツは良い」と
判断できるが、1B は判断基準を持たず、デフォルト (= 低値) に退行する。

**重要**: 「中立」は「方向がない」のではなく「方向を決める能力がない」
状態に 1B を置く。結果として最小値に張り付く。

#### Anti-4. 「heat 以外を重視しろ」間接型

```
archivist: "Should this be preserved? Rate decay LOW if worth saving."
           → 1B: h=3.0  3B: h=7.0

scout:     "How fresh? Rate heat high if timely."
           → 1B: h=2.2  3B: h=8.0
```

**なぜ壊れる**: h を直接指示していない。archivist は「decay を LOW に」、
scout は「fresh なら high に」と、h 以外の軸に焦点を当てている。
1B は h のスコアリング基準を見失い、低値に落ちる。

## モデル × Loadout マトリクス: Feelings への影響

evalFocus → h score → satisfaction → 行動選択 という連鎖がある。

```
1B + hunter (h=1): sat=0.10, frust=1.00 → 永続 leap (逃走)
1B + scholar (h=9): sat=0.76, frust=0.00 → camp → camp (定住)
3B + hunter (h=7): sat=0.41, frust=0.00 → standard (通常)
3B + scholar (h=5): sat=0.52, frust=0.00 → camp (やや定住)
```

**1B + hunter は永遠に逃走し、1B + scholar は永遠に定住する。**
これは欠陥ではなく、モデルサイズ × Loadout の組み合わせが
生態系内の行動多様性を生むメカニズムとして機能している。

## 設計含意

### 1. evalFocus は修正しない

現状の evalFocus は 3B で適切に機能している。1B 用に書き換えると
3B の振る舞いが壊れる可能性がある。

### 2. Digestor が model × loadout で calibration する

eval-log.jsonl に `model` フィールドが記録されている。
Digestor は「llama3.2:1b + hunter は h=1 を出す傾向がある」ことを
統計的に学習し、score 解釈時に補正する。

### 3. 将来の evalFocus 設計ガイドライン

新しい Loadout を設計する際の指針:

| 方針 | 例 | 1B 互換性 |
|------|---|----------|
| **肯定語で方向を示す** | "Is this established?" | 高 |
| **複数軸を列挙する** | "Balance X, Y, and Z" | 高 |
| 否定条件で制限する | "Only if exceptional" | **低** |
| 排除対象を指定する | "Trendy = low" | **低** |
| 中立を指示する | "No bias, just measure" | **低** |
| h 以外の軸に焦点を当てる | "Rate decay LOW" | **中** |

**黄金則**: **1B は「何を高く評価すべきか」は理解できるが、
「何を低く評価すべきか」は理解できない。**

否定指示 ("only if", "low scores for X") は 1B では全スコアを低下させる。
肯定指示 ("is this established?", "how relevant?") は意図通りに機能する。

### 4. ノイズとしての価値

1B の極端な反応は、進化的には有益:
- 種族間の行動差が最大化される (h=1 vs h=9)
- 生態系内のニッチ分化が加速する
- 同じ Sphere でも model が違えば全く異なる風景が見える

## 関連メモ

- [EMERGENT_PERSONALITY_MEMO.md](./EMERGENT_PERSONALITY_MEMO.md) — 性格は測定器具に宿る
- [LOADOUT_DESIGN_MEMO.md](./LOADOUT_DESIGN_MEMO.md) — Loadout = 静的人格
- [EXTERNAL_ACCESS_PATTERNS.md](./EXTERNAL_ACCESS_PATTERNS.md) — Digestor の責務
- [SPECIES_MEMORY_METABOLISM_DESIGN.md](./SPECIES_MEMORY_METABOLISM_DESIGN.md) — model bias の calibration
