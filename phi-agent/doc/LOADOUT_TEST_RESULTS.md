# Loadout テスト結果 — 人格分離の実証

**日付**: 2026-02-08
**環境**: phi3:mini (CPU), periphery localhost:3001, energy=100

---

## 全 Loadout 比較

| | **Balanced** | **Scholar** | **Scout** |
|---|---|---|---|
| Walk mode | explore | deep | explore |
| minCycles | 3 | 5 | 2 |
| energySensitivity | 1.0 | 0.5 | 2.5 |
| **Cycles** | **3** | **5** | **3** |
| **Duration** | 69.7s | 78.7s | **59.6s** |
| Examined | 3 | 4 (+1 mock) | 3 |
| Evaluations | 2 | 4 | 3 |
| Heat delta | +8 | +8 | +9 |
| **Final energy** | **66** | **3** | **63** |
| Return prob (final) | 86% | 100% | 100% |

---

## 性格の差

### Scholar — 粘る

- minCycles=5 で最低 5 cycle 滞在
- energySensitivity=0.5 → exponent=2.0 → energy=42 でもたった 58% の帰還圧
- **energy を 3 まで使い切った** — 最後に Lambda calculus (h=9) を掘り当てて帰還
- 「自分の意思で帰る」よりも「もう一つ見たい」が勝つ性格

### Scout — 即帰還

- minCycles=2 で最短滞在
- energySensitivity=2.5 → exponent=0.4 → energy=84 で既に 48% の帰還圧
- Cycle 1 で base 72% + energy 48% = **100%** (minCycles で保護)
- 59.6s で最速。十分見たら帰る

### Balanced — 中庸

- 全パラメータが中間値
- energy pressure も中庸 (55% at energy=66)
- 3 cycle で帰還。無難だが特徴がない

---

## Delta Profile 観測

### Scholar の entropy 変動

```
Cycle 2: Δ=[h:-0.40, w:+0.00, p:+0.20, hit:-1.00, nov:-1.00] entropy=1.000
Cycle 3: Δ=[h:-0.20(±0.28), w:+0.00(±0.00), p:+0.10(±0.14)] entropy=1.000
Cycle 4: mock skip → entropy=0.176 (急落 — パターン収束)
Cycle 5: Lambda calculus h=9 → entropy=0.428 (復帰 — 新しい驚き)
```

**発見**: entropy の急落→復帰は「もう驚きがない」→「まだある」の遷移を正確に捉えている。
設計原則 4 (entropy-based return) の実用性を示唆。

### データ不足の問題

- 2-3 deltas では entropy は常に 1.000 (十分なデータがない)
- `n < 3` のとき entropy=1.0 を返す設計は正しい（データ不足時は続行）
- 有意な entropy 変動には 4+ cycles 必要 → Scholar 以上の滞在が前提

---

## 結論

**同じ Sphere、同じ phi、同じノード群 — Loadout を変えただけで全く別の人格。**

- 再学習ゼロ
- モデル非依存
- 完全に説明可能（全パラメータが物理的意味を持つ）

知能は Sphere に無い。知能は Agent (LLM) に無い。知能は Coupling にある。

---

## evalFocus — 評価プロンプトの人格化 (2026-02-08)

### 概要

Loadout に `evalFocus: string` を追加。phi への評価プロンプトに性格固有の視点を注入。
同じノードを見ても「何を重視して評価するか」が変わる。

```
scholar: "Judge this node's depth and authority. Prioritize weight over heat."
moth:    "How HOT is this? Only heat matters."
sniper:  "Score harshly — only a direct hit deserves high heat."
```

### Scholar vs Moth 比較テスト

**同じ Sphere、同じノード群** に対する反応:

| | Scholar | Moth |
|---|---|---|
| 典型的 h | **5** (neutral) | **10** (max) |
| 典型的 w | **9** (high auth) | **9** (high) |
| 典型的 d | **6** (moderate) | **2** (preserve) |
| reason | "Authoritative knowledge" | "Extremely hot" |
| Heat delta (4 cycles) | **0** | **+10** |

**結論**: 同じノードに対して scholar は権威性を認めつつ heat は控えめ (neutral)、
moth は熱狂的に最高評価を与える。**phi の判断そのものが性格で変わる** — 実証済み。

### 全 evalFocus 一覧

| Loadout | evalFocus |
|---------|-----------|
| balanced | 全体的な価値をバランス良く |
| scholar | 深さと権威性。weight > heat |
| scout | 鮮度と即時性。古い情報は decay 高く |
| archivist | 保存すべきか？decay を低く、weight で archival 価値判断 |
| hunter | 高価値ターゲットか？厳格に。凡庸なものは低評価 |
| moth | 熱さのみ。明るく活発 = 高評価。冷たい = 低評価 |
| hermit | 人気を無視。重く安定した知識のみ |
| kamikaze | バイアスなし。見たままを測定 |
| sniper | 直撃のみ高評価。ニアミスは低評価 |

---

## 感情駆動の行動選択 (2026-02-08)

### 概要

固定パイプライン (move→sense→focus→eval) を廃止。
4D feelings の支配的な感情に応じてサイクルの行動パターンを分岐。

| Action | 条件 | 挙動 | Energy コスト |
|--------|------|------|--------------|
| standard | 支配的感情なし (<0.5) | move→sense→focus→eval | ~21 |
| camp | satisfaction 支配 | sense→focus→eval (移動なし) | ~16 |
| leap | frustration/staleness 支配 | 大移動→sense→focus→eval | ~21+ |
| scout | stamina 支配 | move→sense のみ | ~8 |

### Balanced テスト (8 cycles)

```
Cycle 1: [standard] — 初回、感情なし
Cycle 2: [camp]     — sat=0.55 → 良い場所、留まって再探索
Cycle 3: [camp]     — sat=0.54 → 引き続き周辺で探索
Cycle 4: [camp]     — sat=0.60 → Shannon の情報理論 h=9 発見!
Cycle 5: [leap]     — stale=0.69 > sat=0.58 → 飽きた、大移動
Cycle 6: [scout]    — stam=0.93 → 疲労、sense のみ (energy 節約)
```

**結果**: 6 cycles, 5 evals, heat delta +4, 97.9s

**行動パターン**: camp→camp→camp→leap→scout
- 良い場所を見つけたら留まる (camp)
- パターンが収束したら大移動 (leap)
- エネルギーが残り少なくなったら偵察のみ (scout)

### 設計の意味

感情がサイクル構造を変えることで:
1. **camp**: 同じ場所で別ノードを見つけられる — 密な領域の活用
2. **leap**: 移動距離 0.5-0.6 で新領域を発見 — 停滞の打破
3. **scout**: focus(10) + eval(3) = 13 energy を節約 — 延命
4. 性格が feelings を形作り → feelings が行動を選択 → 行動が体験を変える → 体験が feelings を更新

**パイプラインが固定でなくなったことで、agent は「判断して行動する」存在になった。**

---

## v4 テスト — evalFocus + 感情駆動行動選択 (2026-02-08)

### 全 Loadout 比較

| | **archivist** | **hunter** | **moth** | **sniper** |
|---|---|---|---|---|
| Walk | deep | hot | hot | hot |
| minCycles | 4 | 3 | 3 | 2 |
| Quality | [0.2,0.3,0.4,0.1] | [0.3,0.2,0.1,0.4] | [0.8,0,0,0.2] | [0.1,0.1,0,0.8] |
| Return | [0.2,0.1,0.3,0.4] | [0.5,0.2,0.2,0.1] | [0.5,0.1,0.2,0.2] | [0.5,0.3,0.1,0.1] |
| **Cycles** | **6** | **7** | **4** | **7** |
| **Duration** | 120.2s | 45.0s | **55.8s** | 45.9s |
| Examined | 6 | 3 | 4 | 3 |
| Evals | 4 | 3 | **4** | 3 |
| Heat delta | 0 | +4 | **+20** | +1 |
| 行動パターン | camp×3→leap×2 | std×3→**scout×4** | camp×3 | std×3→**scout×4** |
| 帰還 | staleness(0.94) | energy切れ | sat+stale(62%) | energy切れ |

### archivist — 保存的な評価者

```
evalFocus: "Should this knowledge be preserved?"
典型的 eval: h=5, w=6, d=3 ("Relevant but not at peak")
```

- 全 eval で d=3 (preserve) — evalFocus の「decay を低く」が反映
- heat は neutral (h=5) — 保存すべきかは認めるが興奮しない
- 行動: camp×3 (sat=0.53-0.56) → leap×2 (staleness=0.92-0.94)
- staleness 偏重 returnWeights [0.2,0.1,0.3,0.4] が機能: Cycle 5 で desire=0.731

**成功**: 静かに保存価値を判断する司書。熱くならず、飽きたら帰る。

### hunter — Scout トラップ

```
evalFocus: "Is this a high-value target? Be selective."
典型的 eval: h=5 (凡庸) / h=9 (1回のみ)
```

- Cycle 3 で h=9 ヒット → sat=0.52。しかし stamina=0.58 > sat → **scout 突入**
- scout は focus/eval しない → データ更新なし → stamina が永続的に支配
- Cycle 4-7: 全て scout。**4 cycles 分の energy (32) を偵察だけに消費**
- 結果: 7 cycles 中 3 evals のみ、Heat delta +4

**問題**: chooseAction() が生の感情値で比較 → sat が低い Loadout は scout に嵌まる

### moth — 完璧な蛾

```
evalFocus: "How HOT is this? Only heat matters."
全 eval: h=10 (4/4 cycles)
```

- **全ノードに h=10** を与える — evalFocus が完全に機能
- 行動: 全て camp (sat=1.0 が常に支配) — 明るい場所から動かない
- Heat delta +20 (4 cycles) — Sphere を最も加熱する Loadout
- Cycle 4 で staleness=0.90 が蓄積 → desire=0.808 → 62% で帰還

**成功**: 灯りに集まり、全てを熱く評価し、飽きたら帰る。設計意図通り。

### sniper — Scout トラップ (hunter と同型)

```
evalFocus: "Score harshly — only a direct hit deserves high heat."
典型的 eval: h=5-6 ("Relevant but not a direct hit")
```

- 3 cycles で h=5,5,6 → sat=0.11 (hitRate=0 で satisfaction 極低)
- Cycle 4: stamina=0.66 > sat=0.11 → scout 突入 → 以後永久 scout
- evalFocus は機能 (厳格に低スコア) だが、**低 satisfaction が scout を誘発**

**問題**: hunter と同じ構造。sniper の「厳しい評価」が自分自身を scout に追い込む。

---

## Scout トラップ — 構造的バグ

### 発生条件

```
1. chooseAction() で stamina (1-energyRatio) > 0.5 かつ他の感情より大きい
2. scout は focus/eval をスキップ → 新しいデータが生まれない
3. staleness/satisfaction が凍結 → stamina が単調増加で永続支配
4. → 無限 scout ループ
```

### 影響マトリクス

| Loadout | sat 水準 | scout トラップ | 理由 |
|---------|---------|---------------|------|
| balanced | 0.55 | なし | sat > stam で camp に入る |
| scholar | — | なし | staleness が先に支配 |
| archivist | 0.53 | **なし** (ギリギリ) | staleness 0.92 が先行 |
| hunter | 0.52 | **発生** | sat ≈ stam、stam が僅差で勝つ |
| moth | 1.00 | なし | sat が常に支配 |
| sniper | 0.11 | **発生** | sat が極端に低い |

### 修正案

```
A: scout 連続回数制限 (maxConsecutiveScout = 1)
   → scout 後は強制 standard。最もシンプル。

B: chooseAction() にも personality weight を適用
   → feelings × actionWeights で評価。elegant だが新パラメータ追加。

C: scout の閾値を引き上げ (stamina > 0.8 に)
   → scout 発動が遅延。問題を緩和するが根本解決ではない。
```

**推奨**: A (scout 連続制限)。scout は「1回の息継ぎ」であるべきで「永久待機」ではない。

---

## Loadout 分類と運用モード (2026-02-08)

### 4 類型

| 役割 | 代表 | Sphere への機能 | 健全性 |
|------|------|----------------|--------|
| **ヒーター** (加熱器) | moth | ノードを活性化、生態系の点火役 | 機能的 |
| **アセッサー** (評価者) | balanced | 平均的な評価で温度を正規化 | 機能的 |
| **キュレーター** (管理者) | archivist, scholar | 保存価値を判断、d を低くして延命 | 機能的 |
| **ハンター** (狩人) | sniper, hunter | 厳選して高スコアのみ | scout trap で機能不全 |

### 2つの運用モード

| モード | 目的 | 適合類型 |
|--------|------|---------|
| **来訪者** (visitor) | データを見つけて capsule にして帰る | balanced, scholar, archivist |
| **常駐者** (resident) | 環境の温度・保存・淘汰を調整し続ける | moth (加熱), archivist (保存) |

### 設計思想との整合

Sphere の目的は「データと向き合い、知見を推論に活かす」こと。
早期撤退系 (scout, kamikaze) は来訪者としても常駐者としても中途半端。

- **scout**: balanced の早帰り版。独自の機能がない
- **kamikaze**: stamina のみで判断。バイアスがないが、知見も生まない
- **hermit**: scholar と構造的に近い (staleness 駆動 + deep walk)

→ これらは「例」として保持するが、実用的な代表は **balanced / scholar / archivist / moth + sniper (修正後)** の 5 つ。

---

## 次の検証

- [x] archivist / hunter のテスト → **完了** (hunter に scout トラップ発見)
- [x] 行動パターンの性格差 → **完了** (moth=camp, archivist=camp→leap, hunter/sniper=scout トラップ)
- [ ] scout トラップ修正後の hunter/sniper 再テスト
- [ ] 同一 Loadout で異なるモデル → Delta Profile が変わらないことを確認
- [ ] より多い cycle (10-20) での entropy 収束パターン
- [ ] evalFocus が Delta Profile に与える影響の定量比較

---

## 関連

- `reports/LOADOUT_DESIGN_MEMO.md` — Loadout 設計
- `reports/DELTA_PROFILE_DESIGN_PRINCIPLES.md` — Delta Profile 設計原則
- `reports/PERSONALITY_VECTOR_INTERPRETATION_MEMO.md` — 性格ベクトル解釈メモ
- `doc/FAST_PATH_DESIGN.md` — FastGate アーキテクチャ
- `doc/EXTREME_LOADOUT_TEST_RESULTS.md` — 極端 Loadout テスト
