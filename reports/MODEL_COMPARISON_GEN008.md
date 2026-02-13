# Model Comparison: llama3.2:1b vs gemma2:2b (gen-008 calibration)

**Date**: 2026-02-13
**Species Memory**: gen-008 (330 surviving evals, 8 species, hunger=0.37)
**Loadout**: scout (both models)
**Query**: "cats"
**Sphere**: ローカル dev (ws://localhost:3001), wave 投入あり

---

## 1. テスト条件

| 項目 | llama3.2:1b | gemma2:2b |
|------|-------------|-----------|
| セッション数 | 8 | 4 |
| 評価数 | 30 | 13 |
| 平均速度 | **32s** | 40s |
| EVALUATE | fake | fake |
| SYSTEM_PROMPT | concise English (max 40 words) | 同左 |
| num_predict | 128 | 128 |

---

## 2. 同一ノード比較

### quantum/thought-experiment/physics (Schrödinger's Cat)

| Model | h | w | d |
|-------|---|---|---|
| llama | 9, **10**, **10**, 9, 9, 8, 8, 9 | 9, 8, 8, 9, 9, 9, 9, 8 | 6, **0**, 6, 6, **2**, 7, 7, 6 |
| gemma | 8, 8, 8, 8 | 9, 9, 9, 7 | 3, 3, **6**, 3 |

- llama d=0: 量子物理学を ephemeral と判定 (ノイズ)
- gemma d=6: "novelty might be fleeting" (理由あり)

### nature/chemistry/sensation (Petrichor)

| Model | h | w | d |
|-------|---|---|---|
| llama | 9, 8, 8, 8, 8, **10**, 8, 8 | 8, 9, 9, 9, 9, 8, 9, **3** | 7, 7, 6, 6, 4, 7, 7, **0** |
| gemma | 8, 8, 8, 8 | 7, 9, 9, 9 | 3, 3, 3, **4** |

- llama w=3: 同一ノードの他セッションは w=8-9 (突発外れ値)
- llama d=0: nature/chemistry を ephemeral と判定 (ノイズ)
- gemma d=4: "ephemeral nature of scent-based knowledge" (理由あり)

### psychology/cognition/bias (Baader-Meinhof Phenomenon)

| Model | h | w | d |
|-------|---|---|---|
| llama | 9, 9, **10**, 8 | 9, 6, **10**, 9 | 7, 3, **0**, 7 |
| gemma | **1** | 9 | 2 |

- llama: h=8-10 (query "cats" との無関係性を無視)
- **gemma h=1**: "doesn't directly address 'cats'" — クエリとの不一致を認識して低評価

---

## 3. 次元別分析

### h (heat/attention)

| Model | Range | 傾向 |
|-------|-------|------|
| llama | 8-10 | スタンプ (高値固定) |
| gemma | **1-8** | **h=1 出現** (query 不一致で低値 = 測定) |

- 両モデルとも Sphere の実際の heat (30-50) を無視して高値を出す傾向
- ただし gemma は query 関連性で h を変動させる兆候あり (h=1)

### w (weight/authority)

| Model | Range | 傾向 |
|-------|-------|------|
| llama | 3-10 | 9 固定 + 突発外れ値 (w=3, w=6) |
| gemma | 7-9 | 安定、"overused" で w=7 に低下 |

- llama の外れ値は前後セッションと矛盾 (ノイズ)
- gemma の w=7 は "likely overused" という理由と整合

### d (decay/longevity) — 最重要次元

| Model | Range | d=0 出現 | 傾向 |
|-------|-------|---------|------|
| llama | 0-7 | **5回** (学術ノードに出現) | レンジは広いがノイズ |
| gemma | 2-6 | **0回** | レンジは狭いが信号 |

- llama d=0 for: quantum physics, math theory, psychology → 学術コンテンツに ephemeral は不適切
- gemma d=6 for: "novelty might be fleeting", d=4 for: "ephemeral nature of scent" → 理由と整合

---

## 4. 評価コメント品質

### gemma2:2b — クエリ意識・内容理解あり

| Node | Score | Comment (抜粋) |
|------|-------|---------------|
| Petrichor | h=8 w=7 d=3 | "relevance to **'cats'**, but the content is relatively shallow" |
| Schrödinger | h=8 w=9 d=3 | "unique perspective on the **'cat in a box'** thought experiment" |
| Turing | h=8 w=9 d=4 | "might **not be directly relevant to 'cats'**" |
| Baader-Meinhof | **h=1** w=9 d=2 | "**doesn't directly address 'cats'**... lacks direct relevance" |
| Schrödinger | h=8 w=9 **d=6** | "its **novelty might be fleeting**" |
| Schrödinger | h=8 **w=7** d=3 | "likely **overused**" |
| Petrichor | h=8 w=9 **d=4** | "**ephemeral nature of scent-based knowledge**" |

- スコアとコメントが一致
- クエリ "cats" との関連性を繰り返し言及
- コメント長: 20-40 words (128 token 以内、調整不要)

### llama3.2:1b — コメント未取得 (run-chk.ps1 のログ形式では reason 切れ)

- 評価ログの reason フィールドは短縮されている
- ただし d=0 の reason を見る限り、内容との矛盾が多い

---

## 5. 発見事項

### 5.1 Sphere の実 heat を両モデルとも無視

- prompt-builder.ts line 71: `Current heat: ${node.heat}` を LLM に渡している
- Sphere の平均 heat=30-50 の時に h=8-10 を出力
- h/w は「内容の印象」であり、Sphere 物理量の測定ではない
- d だけが content-dependent な変動を示す唯一の次元

### 5.2 gen-008 Species Memory による gemma 改善

| 時期 | gemma d 傾向 |
|------|-------------|
| gen-005 以前 | d=3 完全固定 (スタンプ) |
| gen-008 | d=2-6 (変動あり、理由と整合) |

- Species memory calibration が d 測定能力を活性化
- llama の d 変動は gen-008 以前から存在したが、ノイズだった可能性

### 5.3 従来結論の修正

**旧 (gen-005 時点)**:
```
phi3:mini (3D測定) > llama3.2:1b (2D+calibrated) > gemma2:2b (stamp)
```

**新 (gen-008 時点)**:
```
測定品質: gemma2:2b (理由ある変動) > llama3.2:1b (ノイジーな変動)
速度:     llama3.2:1b (32s) > gemma2:2b (40s)
コメント: gemma2:2b (クエリ意識、内容理解) >> llama3.2:1b
```

---

## 6. heat 減衰速度の問題 (付記)

テスト中に Sphere の heat が急速に減衰:
```
09:37  heat=647
09:39  heat=287
09:41  heat= 98
09:43  heat= 43
```

- 5分で heat が 1/15 に減衰
- wave 投入 (38-43 nodes) で一時回復
- モデル比較テストには影響なし (両モデルとも実 heat を無視するため)
- 本番運用時には sphere.config.json の decay preset 調整が必要

---

## 7. 次のステップ

- [ ] llama3.2:1b の reason フィールドを詳細取得して比較
- [ ] 異なるクエリ ("fundamental mathematics", "trending viral") での比較
- [ ] phi3:mini + gen-008 での再ベースライン測定
- [ ] デプロイ戦略の再検討 (内部=gemma? 外部=gemma? llama の役割再定義)
- [ ] heat 減衰プリセット調整 (本番用)

---

*Created: 2026-02-13*
*Test data: phi-agent/data/eval-log.jsonl (throwaway, gen-008 calibration phase)*
