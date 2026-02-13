# Delta Profile 設計原則

**日付**: 2026-02-08
**状態**: 設計原則確定、段階的実装

---

## 原則 1: 良し悪しを決めない

Loadout はノードを「良い/悪い」と判断しない。
代わりに **変化のパターン** だけを記録する。

```
記録するもの: Δ (行動前後の状態差分)
記録しないもの: 「この Δ は良い」
```

Scholar が depth を増やしやすい、Scout が novelty で振れる。
これは人間が後から名前をつけるだけ。システムは知らない。

---

## 原則 2: スカラーにしない

単一指標に潰さない。N 次元ベクトルのまま扱う。

```
NG: satisfaction = 0.68        ← 情報が潰れている
OK: Δ = [+0.3, -0.1, +0.5, 0, +0.2, -0.4]  ← 方向が残っている
```

指標を一つにすると「何を重視するか」が設計者の判断になる。
ベクトルのまま残せば、解釈は後からでも変えられる。

---

## 原則 3: 分布を見る

平均だけではなく、分布の形を見る。

```
mean(Δ)     → この装備は平均的にどう動くか
variance(Δ) → この装備はどれくらいブレるか
skewness    → 偏りの方向
kurtosis    → 極端な変化の頻度
```

同じ mean でも variance が違えば別の性格。
Scholar: mean=[+depth], variance=低 → 安定して深掘り
Scout: mean=[+novelty], variance=高 → 気まぐれだが新しいものを見つける

---

## 原則 4: 帰還は entropy で決める

```
現行: dot(S, R) > threshold → 「満足したか？」（目標依存）
提案: entropy(Δ) < threshold → 「まだ驚きがあるか？」（目標不要）
```

entropy が高い = Δ の分布が広い = まだ予測できない体験がある → 続ける
entropy が低い = Δ が収束した = もう新しい変化がない → 帰る

帰還条件が内容に依存しない。h=9 も h=2 も区別しない。
「変化のパターンが予測可能になったか」だけを問う。

---

## 原則 5: Loadout の性格は観測から浮かび上がる

設計者が「Scholar は深掘り型」と定義するのではない。
Scholar の Δ 分布を見たら、**結果として** depth 方向に偏っていた。

```
profile = { mean: Δ̄, variance: σ²(Δ) }
```

これが装備の性格。定義ではなく観測結果。

---

## 段階的移行

| 段階 | 内容 | 判定方法 |
|------|------|---------|
| 現行 | 4D satisfaction + dot product | `dot(S, R) + energyPressure` |
| 観測 | Δ 記録開始、既存判定と並行 | 既存のまま + ログ出力 |
| 切替 | entropy-based return 実装 | `entropy(Δ) + energyPressure` |
| 完成 | satisfaction 廃止 | entropy のみ |

---

## 関連

- `reports/LOADOUT_DESIGN_MEMO.md` — Loadout 設計（現行 satisfaction ベース）
- `reports/COUPLING_LAYER_DESIGN_MEMO.md` — 責務分離の原則
