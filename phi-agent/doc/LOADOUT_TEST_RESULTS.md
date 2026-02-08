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

## 次の検証

- [ ] archivist / hunter のテスト
- [ ] 同一 Loadout で異なるモデル → Delta Profile が変わらないことを確認
- [ ] より多い cycle (10-20) での entropy 収束パターン
- [ ] entropy-based return の実装切替（現行 satisfaction と並行）

---

## 関連

- `reports/LOADOUT_DESIGN_MEMO.md` — Loadout 設計
- `reports/DELTA_PROFILE_DESIGN_PRINCIPLES.md` — Delta Profile 設計原則
- `doc/FAST_PATH_DESIGN.md` — FastGate アーキテクチャ
