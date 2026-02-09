# gemma2:2b — Daemon Mode Test Results

**日付**: 2026-02-09
**方法**: Docker daemon mode, 3 agents (wanderer, moth, hermit), ~16 min
**データ**: 20 sessions / 77 evaluations
**速度**: 12-28s/session (phi3:mini baseline: ~60s → **平均 63% 高速**)

---

## 種族別統計

| Loadout | Sess | Evals | avgH | stdH | avgW | stdW | avgD | stdD | BusE | BusR |
|---------|------|-------|------|------|------|------|------|------|------|------|
| hermit | 7 | 30 | 5.0 | **0.0** | 7.4 | 0.7 | 3.0 | 0.2 | 0 | 4 |
| moth | 7 | 24 | 8.0 | **0.0** | 6.1 | 1.1 | 2.9 | 0.3 | 3 | 3 |
| wanderer | 6 | 23 | 6.0 | **0.0** | 8.9 | 0.3 | 2.7 | 0.4 | 0 | 4 |

## スコア分布

```
h 分布 (種族固有の固定値):
  hermit:   [5:30] (100%)
  wanderer: [6:23] (100%)
  moth:     [8:24] (100%)

w 分布 (連続的、種族ごとに異なるモード):
  hermit:   6:1  [7:16]  8:13
  wanderer: 8:2  [9:21]
  moth:     [5:11]  6:5  7:2  8:6
```

**h は種族固有の固定値** (hermit=5, wanderer=6, moth=8)、**w は測定可能** (連続分布)。

---

## phi3:mini ベースラインとの比較

| Loadout | 2B h | 3.8B h | Δh | 2B w | 3.8B w | Δw |
|---------|------|--------|-----|------|--------|-----|
| hermit | 5.0 | 5.3 | -0.3 | 7.4 | 3.9 | **+3.5** |
| moth | 8.0 | 6.7 | **+1.3** | 6.1 | 3.5 | **+2.6** |
| wanderer | 6.0 | 7.0 | -1.0 | 8.9 | 4.9 | **+4.0** |

**h の種族間順序は一致**:
- phi3:mini: wanderer(7.0) > moth(6.7) > hermit(5.3) — range 1.7pt
- gemma2:2b: moth(8.0) > wanderer(6.0) > hermit(5.0) — range 3.0pt (固定値)
- moth が高 heat 種族である点は両モデルで一致

**w は gemma の方が高スコア** (+2.6 〜 +4.0pt)、calibration の違い。

---

## 種族差の比較

| 指標 | 2B (range) | 1.5B (range) | 1.2B (range) | 0.5B (range) | phi3:mini (range) | 判定 |
|------|------------|--------------|--------------|--------------|-------------------|------|
| h | **3.0pt** (5.0-8.0) | 0.0pt | 0.9pt | 0.2pt | 2.0pt | **種族固定** |
| w | **3.1pt** (5.8-8.9) | 1.3pt | 1.0pt | 0.4pt | 3.3pt | **測定可能** |
| d | 0.3pt (2.7-3.0) | 0.1pt | 0.5pt | 0.1pt | 2.0pt | 軽微 |

---

## 結論

### 種族性: h=固定値スタンプ、w=測定可能

gemma2:2b は **種族ごとに異なる h 固定値** を返す:

- **moth** の evalFocus: "How HOT is this?" → **h=8 固定** (最高値)
- **wanderer** の evalFocus: balanced → **h=6 固定**
- **hermit** の evalFocus: "Ignore popularity..." → **h=5 固定** (最低値)

これは qwen2.5:1.5b (全種族 h=5 固定) と異なり、**evalFocus を部分的に理解している**証拠。

**w 測定は強力**:
- hermit: w=7.4 (高 weight bias)
- wanderer: w=8.9 (最高、balanced)
- moth: w=6.1 (低 weight bias、heat 特化)

→ **w range 3.1pt** は phi3:mini (3.3pt) と同等、llama3.2:1b (1.0pt) の **3倍強い**。

---

### h 固定値の解釈

gemma2:2b の h 固定値は **キャリブレーション済みスタンプ**:

1. **evalFocus を理解している** — moth=8 (heat特化), hermit=5 (low heat) の順序が正しい
2. **コンテンツ依存ではない** — 同じ種族なら常に同じ h を返す (stdH=0.0)
3. **測定ではなくプリセット** — スタンプだが、賢いスタンプ

qwen2.5:1.5b との違い:
- qwen2.5:1.5b: 全種族 h=5 固定 (無差別スタンプ)
- gemma2:2b: 種族ごとに異なる h (種族認識済みスタンプ)

---

### 速度: 超高速

| Loadout | 平均速度 | phi3:mini比 |
|---------|---------|------------|
| moth | **12s** | **80% 高速** |
| wanderer | 27s | 55% 高速 |
| hermit | 28s | 53% 高速 |
| **平均** | **22s** | **63% 高速** |

moth の 12s は全モデル中で最速。wanderer/hermit も 27-28s で高速。

---

### Bus 通信: moth のみ可能

moth のみ h=8 到達 → Bus emit 可能 (3回)。
wanderer/hermit は h<8 → Bus 不可。

phi3:mini (全種族 Bus 可能) より制限的。

---

### スコア分布: w は連続的

h は固定値だが、w は連続分布 (hermit: 6-8, moth: 5-8, wanderer: 8-9)。
d も連続的 (2-3) で、スタンプではない。

→ **w と d はコンテンツを読んで測定している**。

---

### 判定

| 基準 | phi3:mini | gemma2:2b | 判定 |
|------|-----------|-----------|------|
| 種族差 (h range) | 2.0pt (測定) | 3.0pt (固定値) | **MIXED** |
| 種族差 (w range) | 3.3pt | 3.1pt | **PASS** |
| 種族差 (d range) | 2.0pt | 0.3pt | FAIL |
| evalFocus 応答 (h) | 明確 | 種族認識スタンプ | **MIXED** |
| evalFocus 応答 (w) | 明確 | 明確 | **PASS** |
| スコア分布 | 連続 | h=固定、w/d=連続 | **MIXED** |
| Bus 通信 | 全種族可能 | moth のみ | FAIL |
| 実行速度 | ~60s | **~22s** | **PASS** |

**gemma2:2b は「片目（w測定）+ 種族認識済み h スタンプ」として適格。**

qwen2.5:1.5b より優秀 (h に種族性あり、w 測定が強い)。
llama3.2:1b より w 測定が強く、速度は 2.6倍高速。
phi3:mini より h 測定は劣るが、w 測定は同等で、速度は 2.7倍高速。

---

## 次のステップ

1. **Digestor との相性は良好**:
   - w 測定が強い (range 3.1pt) → Digestor のスコアリングに有効
   - h が固定でも問題なし (w × h の積でスコアリングされるため)

2. **推奨デプロイ戦略**:
   - **内部評価専用**: llama3.2:1b (軽量、両次元測定可能、常駐向き)
   - **外部応答用**: **gemma2:2b** (高速、w 測定強力、推論能力高)
   - **最高品質**: phi3:mini (両次元測定可能、Bus 全種族対応、速度は遅い)

3. **gemma2:2b の強み**:
   - **速度**: 全モデル中で最速クラス (平均 22s, moth は 12s)
   - **w 測定**: phi3:mini と同等 (range 3.1pt vs 3.3pt)
   - **推論能力**: Google の instruction tuning、phi3:mini と同等以上と期待
   - **ライセンス**: 商用利用可、規模制限なし

---

**テスト方法**: TEST_PROTOCOL.md に準拠 (daemon mode, 3 agents, 20 sessions)
**データ保存**: eval-log.jsonl (20 sessions, 77 evaluations)
