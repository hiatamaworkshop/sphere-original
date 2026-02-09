# 極端 Loadout テスト結果 — パラメータ限界の探索

**日付**: 2026-02-08
**環境**: phi3:mini (CPU), periphery localhost:3001, energy=100

---

## 全 Loadout 比較 (既存 + 極端4種)

| | **balanced** | **scholar** | **scout** | **moth** | **hermit** | **wanderer** | **sniper** |
|---|---|---|---|---|---|---|---|
| Walk mode | explore | deep | explore | hot | deep | explore | hot |
| minCycles | 3 | 5 | 2 | 2 | 4 | 1 | 1 |
| energySensitivity | 1.0 | 0.5 | 2.5 | 1.5 | 0.3 | 0.1 | 3.0 |
| returnVector | 均等 | authority | relevance | heat偏重 | auth+pres | **[0,0,0,0]** | hitRate偏重 |
| **Cycles** | 3 | 5 | 3 | **2** | 4 | 5 | **2** |
| **Duration** | 69.7s | 78.7s | 59.6s | **23.9s** | 53.1s | 52.6s | **15.5s** |
| Examined | 3 | 4 | 3 | 1 | 4 | 4 | 1 |
| Evaluations | 2 | 4 | 3 | 1 | 4 | 4 | 1 |
| Heat delta | +8 | +8 | +9 | +0 | +9 | +4 | +0 |
| **Final energy** | 66 | 3 | 63 | 84 | 42→? | **3** | 66 |
| 帰還要因 | 満足+圧 | 圧+満足 | 満足+圧 | **圧のみ** | 圧+満足 | **圧のみ** | **圧のみ** |

---

## 核心的発見: energySensitivity が支配的

### 帰還の 2 要素

```
finalProb = baseProbability(satisfaction) + energyPressure(sensitivity)
```

**既存 Loadout (balanced/scholar/scout)**: 両方がバランスよく効いている
**極端 Loadout**: energySensitivity が一方的に支配する

| Loadout | base | energy | 支配要因 |
|---------|------|--------|---------|
| moth (sens=1.5) | 0% | 49% → 帰還 | **energy** |
| hermit (sens=0.3) | 41% | 46% → 帰還 | 混合 |
| wanderer (sens=0.1) | 0% (常にゼロ) | 74% @ energy=3 | **energy** (極限) |
| sniper (sens=3.0) | 0% | 70% @ energy=66 | **energy** (即時) |

### 発見 1: energySensitivity の支配域

```
sensitivity >= 2.0  → returnVector はほぼ無意味（圧力が即座に支配）
sensitivity <= 0.3  → returnVector が機能するが、最終的に圧力が追いつく
sensitivity 0.5-1.5 → 両方が意味を持つ「スイートスポット」
```

### 発見 2: returnVector=[0,0,0,0] は有効な人格

wanderer は「何を見ても満足しない」探索者。しかしシステムは破綻しない。
エネルギー物理法則が最終安全装置として機能する。
→ **returnVector をゼロにしても、エネルギー枯渇 → expelled → returnOnExpelled が成果を保全**

### 発見 3: moth と sniper の失敗パターン

moth (heat偏重) も sniper (hitRate偏重) も、**体験を十分に積む前にエネルギー圧に負けて帰還した**。

問題は weights ではなく energySensitivity:
- moth: sensitivity=1.5 → 熱いノードを探す前に圧で撤退
- sniper: sensitivity=3.0 → 1 発撃つ前に圧で撤退

**修正仮説**: moth/sniper は energySensitivity を下げれば設計意図通りに動く可能性がある

---

## Delta Profile 観測

### wanderer の entropy 推移（最も長い観測）

```
Cycle 2: Δ=[h:0, w:0, p:0, hit:0, nov:-1]           entropy=1.000 (データ不足)
Cycle 3: Δ=[h:+0.20, w:0, p:-0.10, hit:+0.50, nov:-0.50] entropy=1.000 (データ不足)
Cycle 4: Δ=[h:0, w:0, p:0, hit:0, nov:-0.33]          entropy=0.307 (収束開始)
Cycle 5: (mock skip, no new delta)                      entropy=0.245 (さらに収束)
```

**同じ評価結果 (h=5,w=6,d=3) の繰り返しで entropy が下がる** — 設計通り。
wanderer は多様な体験をしていないのではなく、Sphere の内容が均質だった。

### hermit の entropy 推移

```
Cycle 2: entropy=1.000
Cycle 3: entropy=1.000
Cycle 4: entropy=0.157 (急落 — h=10,w=9 で高品質ノード発見後にパターン収束)
```

Scholar テストと同様、高品質ノード発見後に entropy が急落。
「もう十分に良いものを見つけた」状態を entropy が正確に捉えている。

---

## パラメータ設計への示唆

### 1. energySensitivity の有効範囲

| 範囲 | 挙動 | 用途 |
|------|------|------|
| 0.1-0.3 | 圧力ほぼ無し → expelled リスク高 | 意図的な極限テスト |
| 0.5-1.0 | 満足度と圧力が共存 | **通常の人格設計** |
| 1.5-2.0 | 圧力が早期に効く → 短期探索 | 偵察型 |
| 2.5+ | 圧力が支配的 → returnVector 無意味 | **設計として破綻** |

**結論**: energySensitivity は **0.3 - 2.0** が有効範囲。
それ以外は物理的に帰還が決まり、人格（returnVector）が機能しない。

### 2. returnVector の極端値

| パターン | 挙動 | 有用か |
|---------|------|--------|
| [0,0,0,0] | 満足度ゼロ → 圧力のみで帰還 | 有用（極限探索） |
| [1,0,0,0] | relevance のみ → h が高ければ帰る | 有用（明確な目的） |
| [0,0,0,1] | hitRate のみ → 連続ヒットで帰る | 有用だが不安定（初回ヒットで確率跳ね上がり） |
| [0.25,0.25,0.25,0.25] | 完全均等 → balanced と同等 | 有用（基準線） |

### 3. weights は正常に機能している

moth の pick は flags:0x0040 (Hot) ノードを正しく選択。
hermit は flags:0x0000 の重いノードを正しく選択。
**weights の設計は問題なし。帰還が早すぎるだけ。**

---

## 修正提案

moth と sniper を修正して再テストする価値がある:

```
moth (修正):     energySensitivity 1.5 → 0.8, minCycles 2 → 3
sniper (修正):   energySensitivity 3.0 → 1.2, minCycles 1 → 2
```

---

## v2 再テスト結果 (sensitivity 緩和後)

### moth v2 (sensitivity 1.5 → 0.8, minCycles 2 → 3)

| | v1 | v2 |
|---|---|---|
| Cycles | 2 | **4** |
| Duration | 23.9s | **52.3s** |
| Evals | 1 | **4** |
| Heat delta | +0 | **+9** |
| 帰還要因 | 圧のみ (49%) | base 36% + 圧 74% = **100%** |

- Cycle 1: h=9 Hot ノードに突進 → base=84% だが minCycles=3 で保護
- Cycle 4: h=10,w=9 発見 → base+圧 = 100% で帰還
- **成功**: 蛾が灯りに吸い寄せられて成果を持ち帰った

### sniper v2 (sensitivity 3.0 → 1.2, minCycles 1 → 2)

| | v1 | v2 |
|---|---|---|
| Cycles | 2 | **3** |
| Duration | 15.5s | **39.8s** |
| Evals | 1 | **3** |
| Heat delta | +0 | **+4** |
| 帰還要因 | 圧のみ (70%) | 圧のみ (**64%**) |

- Cycle 2: h=9, w=10 のヒットを捕捉（v1 では撃つ前に撤退していた）
- **構造的問題**: hitRate = 1/3 = 0.33 → dot=0.40 → base=0%
- hitRate 偏重 (0.8) の returnVector は**全ヒットが h>=7 でないと base が上がらない**
- 現在の Sphere 内容密度では hitRate > 0.5 は困難 → sniper は常に energy 駆動帰還

### v2 の教訓

| 知見 | 内容 |
|------|------|
| sensitivity 緩和 | moth/sniper ともに成果が劇的に改善 |
| moth は成功 | 設計意図通り: 熱いノードを選び、熱を感じたら帰る |
| sniper は構造的課題 | hitRate 0.8 は Sphere 密度に依存。疎なら常に base=0% |
| minCycles の重要性 | moth Cycle 1 で base=84% → minCycles=3 が暴発を防いだ |

### sniper の改善方向

```
選択肢 A: hitRate 閾値を下げる → returnVector [0.2, 0.2, 0.0, 0.6]
選択肢 B: hit 条件を h>=5 に緩和 → SessionMemory の _hits 条件変更
選択肢 C: sniper の設計を「1 good hit → 即帰還」に変更
           → shouldReturn() 内で直近 eval の h >= 8 なら即 true
```

選択肢 C は FastGate の汎用構造を壊すため非推奨。A が最も簡単。

---

## v3 結果 — 4D 感情システム (energySensitivity 廃止後)

### アーキテクチャ変更

```
旧: returnDesire = satisfaction + energyPressure    ← energy が支配的
新: returnDesire = feelings · returnWeights          ← 全次元が 0-1 で統一

feelings = [satisfaction, frustration, stamina, staleness]
  satisfaction: quality profile × quality vector (S·Q)
  frustration:  miss rate (h<5 比率)
  stamina:      1 - energyRatio (体力消耗)
  staleness:    1 - entropy (飽き / 予測可能性)
```

### 全 Loadout 比較 (v3 = 4D feelings)

| | **moth** v1 | **moth** v3 | **hermit** v1 | **hermit** v3 | **wanderer** v1 | **wanderer** v3 | **sniper** v1 | **sniper** v3 |
|---|---|---|---|---|---|---|---|---|
| returnWeights | N/A | [0.5,0.1,0.2,0.2] | N/A | [0.2,0.1,0.1,0.6] | N/A | [0.0,0.0,1.0,0.0] | N/A | [0.5,0.3,0.1,0.1] |
| **Cycles** | 2 | **5** | 4 | **5** | 5 | **4** | 2 | **5** |
| **Duration** | 23.9s | **161.3s** | 53.1s | **63.8s** | 52.6s | **52.7s** | 15.5s | **67.2s** |
| Evals | 1 | **5** | 4 | **5** | 4 | **3** | 1 | **5** |
| Heat delta | +0 | **0** | +9 | **+8** | +4 | **+4** | +0 | **+9** |
| 帰還要因 | 圧のみ | **energy切れ** | 圧+満足 | **staleness** | 圧のみ | **stamina 52%** | 圧のみ | **energy切れ** |

### moth v3 分析

```
returnWeights: [0.5, 0.1, 0.2, 0.2] (satisfaction + stamina + staleness)
qualityVector: [0.8, 0.0, 0.0, 0.2] (heat 偏重)
```

- Cycle 1: sat=0.40, stam=0.16 → desire=0.232 → 0%
- Cycle 4: sat=0.40, stam=0.79, stale=0.90 → desire=0.538 → 8%
- Cycle 5: sat=0.40, stam=1.00, stale=0.92 → desire=0.583 → 17%
- **energy 切れで終了** (minCycles=3 で保護後、エネルギーが先に枯渇)

**v1 との比較**: 旧システムでは 2 cycles で圧力帰還。新システムでは 5 cycles まで粘る。
energy が支配しなくなった。ただし **phi が h=5 ばかり返しているため satisfaction が上がらない**。
moth の heat 偏重 qualityVector [0.8,0,0,0.2] は h が高くないと sat が低い → 帰還しない。

### hermit v3 分析

```
returnWeights: [0.2, 0.1, 0.1, 0.6] (staleness 偏重 = 飽きたら帰る)
qualityVector: [0.0, 0.6, 0.4, 0.0] (weight + preservation 重視)
```

- Cycle 1: h=9 発見 → sat=0.56, stale=0.00 → desire=0.128 → 0%
- Cycle 4: stale=0.85 → desire=0.715 → **43%** (帰還試行)
- Cycle 5: stale=0.79, stam=1.00 → desire=0.696 → **39%** → **帰還**

**成功**: hermit は staleness 駆動で帰還。「同じパターンが続いたから飽きた」。
scholar と同じ構造だが、qualityVector が異なるため**何に満足するか**が異なる。

### wanderer v3 分析

```
returnWeights: [0.0, 0.0, 1.0, 0.0] (stamina のみ)
qualityVector: [0.3, 0.3, 0.3, 0.3] (均等)
```

- Cycle 1: stam=0.16 → desire=0.160 → 0%
- Cycle 3: stam=0.55 → desire=0.550 → 10%
- Cycle 4: stam=0.76 → desire=0.760 → **52%** → **帰還**

**注目**: 旧システムでは 5 cycles まで粘った (energySensitivity=0.1 で圧力ほぼゼロ)。
新システムでは stamina=1-energyRatio が returnWeights[2]=1.0 と直結。
stamina 0.76 で desire=0.76 → prob=52%。**旧システムより早く帰っている**。

これは正しい挙動: wanderer は「体力だけで判断する」設計。
旧システムの energySensitivity=0.1 は「圧力を無視する」だったが、
新システムの returnWeights=[0,0,1,0] は「体力**のみ**で判断する」— 意味が異なる。

### sniper v3 分析

```
returnWeights: [0.5, 0.3, 0.1, 0.1] (satisfaction + frustration)
qualityVector: [0.1, 0.1, 0.0, 0.8] (hitRate 偏重)
```

- Cycle 1: h=9 → hitRate=1.0 → sat=0.95 → desire=0.491 → 0% (minCycles=2)
- Cycle 2: h=5 → hitRate=0.5 → sat=0.53 → desire=0.302 → 0%
- Cycle 4: h=9 → hitRate=0.5 → sat=0.53 → desire=0.414 → 0%
- Cycle 5: h=5 → hitRate=0.4 → sat=0.45 → desire=0.396 → 0%
- **energy 切れで終了**

**v1 との劇的改善**: 旧では 2 cycles で energySensitivity=3.0 に支配されて撤退。
新システムでは stamina の weight が 0.1 → energy は desire に 10% しか寄与しない。
**sniper が撃ち続けられるようになった**。

**残る課題**: satisfaction が閾値 (desire > 0.5) を超えない。
hitRate 偏重 (0.8) だが hitRate=0.4 → sat=0.45 → desire≈0.4 → prob=0%。
sniper は「十分に当てたら帰る」設計だが、現在の Sphere では hitRate が上がりにくい。

---

## v3 の総合知見

### energySensitivity 廃止の効果

| 指標 | 旧 (additive energy) | 新 (4D feelings) |
|------|------|------|
| moth | 2 cycles (圧力支配) | 5 cycles (粘る) |
| hermit | 4 cycles (混合) | 5 cycles (staleness 駆動) |
| wanderer | 5 cycles (圧力ほぼゼロ) | 4 cycles (stamina 直結) |
| sniper | 2 cycles (圧力支配) | 5 cycles (粘る) |

**結論**: energy が一方的に支配することがなくなった。各 Loadout の returnWeights が意図通りに機能している。

### 4D 感情の次元ごとの支配力

| 次元 | 観測された効果 | 代表 Loadout |
|------|-------------|-------------|
| satisfaction (sat) | hitRate 偏重で閾値に届かないケースあり | sniper |
| frustration (frust) | 0 (現在のテストでは h<5 がほぼ発生しない) | 全て |
| stamina (stam) | returnWeights で weight を変えれば線形に制御可能 | wanderer (1.0), sniper (0.1) |
| staleness (stale) | Cycle 4 以降で急上昇、scholar/hermit の帰還をトリガー | hermit |

### 未活性な次元: frustration

全テストで frustration = 0。phi が h<5 を返すことが稀なため。
**今後 Sphere の内容密度が上がれば活性化する可能性がある**。

### returnWeights の設計指針 (v3 実証済み)

```
stamina 重み 1.0 → energy 直結、体力のみで判断 (wanderer)
stamina 重み 0.1 → energy ほぼ無視、他の次元で判断 (sniper)
staleness 重み 0.6 → Cycle 4+ で飽き駆動帰還 (hermit, scholar)
satisfaction 重み 0.5 → 高品質ノード連続で帰還 (sniper, 閾値注意)
frustration 重み 0.3 → 現在は不活性（将来の密度次第）
```

---

## 関連

- `phi-agent/doc/LOADOUT_TEST_RESULTS.md` — 既存 Loadout テスト
- `reports/LOADOUT_DESIGN_MEMO.md` — Loadout 設計
- `reports/AGENT_ARSENAL_DESIGN_MEMO.md` — 武器庫設計リファレンス
- `reports/DELTA_PROFILE_DESIGN_PRINCIPLES.md` — Delta Profile 設計原則
- `reports/PERSONALITY_VECTOR_INTERPRETATION_MEMO.md` — 性格ベクトル解釈メモ
