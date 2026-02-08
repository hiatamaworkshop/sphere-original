# 極端 Loadout テスト結果 — パラメータ限界の探索

**日付**: 2026-02-08
**環境**: phi3:mini (CPU), periphery localhost:3001, energy=100

---

## 全 Loadout 比較 (既存 + 極端4種)

| | **balanced** | **scholar** | **scout** | **moth** | **hermit** | **kamikaze** | **sniper** |
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
| kamikaze (sens=0.1) | 0% (常にゼロ) | 74% @ energy=3 | **energy** (極限) |
| sniper (sens=3.0) | 0% | 70% @ energy=66 | **energy** (即時) |

### 発見 1: energySensitivity の支配域

```
sensitivity >= 2.0  → returnVector はほぼ無意味（圧力が即座に支配）
sensitivity <= 0.3  → returnVector が機能するが、最終的に圧力が追いつく
sensitivity 0.5-1.5 → 両方が意味を持つ「スイートスポット」
```

### 発見 2: returnVector=[0,0,0,0] は有効な人格

kamikaze は「何を見ても満足しない」探索者。しかしシステムは破綻しない。
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

### kamikaze の entropy 推移（最も長い観測）

```
Cycle 2: Δ=[h:0, w:0, p:0, hit:0, nov:-1]           entropy=1.000 (データ不足)
Cycle 3: Δ=[h:+0.20, w:0, p:-0.10, hit:+0.50, nov:-0.50] entropy=1.000 (データ不足)
Cycle 4: Δ=[h:0, w:0, p:0, hit:0, nov:-0.33]          entropy=0.307 (収束開始)
Cycle 5: (mock skip, no new delta)                      entropy=0.245 (さらに収束)
```

**同じ評価結果 (h=5,w=6,d=3) の繰り返しで entropy が下がる** — 設計通り。
kamikaze は多様な体験をしていないのではなく、Sphere の内容が均質だった。

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

## 関連

- `phi-agent/doc/LOADOUT_TEST_RESULTS.md` — 既存 Loadout テスト
- `reports/LOADOUT_DESIGN_MEMO.md` — Loadout 設計
- `reports/AGENT_ARSENAL_DESIGN_MEMO.md` — 武器庫設計リファレンス
- `reports/DELTA_PROFILE_DESIGN_PRINCIPLES.md` — Delta Profile 設計原則
