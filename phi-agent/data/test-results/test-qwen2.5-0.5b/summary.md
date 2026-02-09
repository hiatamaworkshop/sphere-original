# qwen2.5:0.5b — Daemon Mode Test Results

**日付**: 2026-02-09
**方法**: Docker daemon mode, 3 agents (wanderer*, moth, hermit), ~18 min
**データ**: 54 sessions / 168 evaluations
**速度**: 32-34s/session (phi3:mini baseline: ~60s → **47% 高速**)

*wanderer は loadout リネーム影響で "balanced" として記録

---

## 種族別統計

| Loadout | Sess | Evals | avgH | stdH | avgW | stdW | avgD | stdD | BusE | BusR |
|---------|------|-------|------|------|------|------|------|------|------|------|
| balanced(=wanderer) | 18 | 56 | 7.3 | 2.3 | 5.9 | 1.9 | 3.5 | 0.7 | 38 | 72 |
| hermit | 18 | 57 | 7.5 | 1.8 | 6.3 | 1.9 | 3.5 | 0.8 | 36 | 67 |
| moth | 18 | 55 | 7.4 | 2.2 | 6.1 | 2.1 | 3.6 | 0.9 | 32 | 54 |

## スコア分布

```
h 分布 (全種族で h=8 に集中):
  balanced: 0:3  2:1  3:1  5:4  6:4  [8:26]  9:16  10:1
  hermit:   0:1  2:1  4:1  5:7  6:1  [8:36]   9:9  10:1
  moth:     0:2  2:2  3:1  5:5  6:1  [8:26]  9:17  10:1

w 分布 (全種族で w=7 に集中):
  balanced: 0:3  2:3  5:7  6:11  [7:32]
  hermit:   0:2  1:1  2:1  3:1  5:9  6:3  [7:37]  9:1  10:2
  moth:     0:4  2:1  3:2  5:4  6:6  [7:37]  10:1
```

## phi3:mini ベースラインとの比較

| Loadout | 0.5B h | 3B h | Δh | 0.5B w | 3B w | Δw |
|---------|--------|------|-----|--------|------|-----|
| wanderer→balanced | 7.3 | 7.0 | +0.3 | 5.9 | 4.9 | +1.0 |
| hermit | 7.5 | 5.3 | **+2.2** | 6.3 | 3.9 | **+2.4** |
| moth | 7.4 | 6.7 | +0.7 | 6.1 | 3.5 | **+2.6** |

## 種族差の比較

| 指標 | 0.5B (range) | phi3:mini (range) | 比率 |
|------|-------------|-------------------|------|
| h | 7.3-7.5 (**0.2pt**) | 5.0-7.0 (2.0pt) | **10x 縮小** |
| w | 5.9-6.3 (**0.4pt**) | 3.5-6.8 (3.3pt) | **8x 縮小** |
| d | 3.5-3.6 (**0.1pt**) | 3.0-5.0 (2.0pt) | **20x 縮小** |

## 結論

### 種族性: 消失

qwen2.5:0.5b は evalFocus の指示を事実上無視している。全種族が同一の「安全」スコアパターン
(h≈8, w≈7, d≈3.5) に収束する。

- **hermit** の evalFocus: "Ignore popularity... Weight and low decay matter" → **効果なし** (w=6.3 vs balanced 5.9, 差 0.4pt)
- **moth** の evalFocus: "How HOT is this? Only heat matters" → **効果なし** (h=7.4 vs balanced 7.3, 差 0.1pt)

phi3:mini では moth の h が wanderer に次いで2番目に高く、hermit の w が scholar に次いで高かった。
0.5B ではこの分化が完全に消失している。

### スコア分布: 二峰性

h 分布は h=8 にモード (全評価の 52%) があり、h=0-3 に散在する異常値がある。
これはモデルが「デフォルト回答」と「パース失敗/混乱」の二択になっていることを示す。
phi3:mini の連続的で種族ごとに異なる分布とは対照的。

### 速度: 優秀

32-34s/session は phi3:mini (60s) の **47% 高速**。
しかし種族性が消失しているため、Sphere のエコシステムにとっての価値は限定的。

### 判定

| 基準 | phi3:mini | qwen2.5:0.5b | 判定 |
|------|-----------|-------------|------|
| 種族差 (h range) | 2.0pt | 0.2pt | **FAIL** |
| 種族差 (w range) | 3.3pt | 0.4pt | **FAIL** |
| 種族差 (d range) | 2.0pt | 0.1pt | **FAIL** |
| 実行速度 | ~60s | ~33s | **PASS** |
| JSON安定性 | OK | OK | PASS |

**qwen2.5:0.5b は Sphere の感覚器官としては不適格。**
LLM は交換可能な感覚器官だが、0.5B は感度が低すぎて種族の「個性」を表現できない。

---

## 次のステップ

1. **llama3.2:1b を daemon mode で再テスト** — 手動テスト vs Docker daemon で +8.7 の差があった。正しい方法で再検証が必要
2. **phi3:mini を引き続きベースラインとして使用** — 種族差が明確、Sphere のエコシステムとして機能
3. **1B-2B 帯の他モデル** — gemma2:2b, qwen2.5:1.5b など中間サイズの候補

---

**テスト方法**: TEST_PROTOCOL.md に準拠 (daemon mode, 3 agents, 50+ sessions)
**データ保存**: eval-log.jsonl (54 sessions, 168 evaluations)
