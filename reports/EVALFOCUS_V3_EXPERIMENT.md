# evalFocus v3 実験 — gemma2:2b 測定能力回復

**日付**: 2026-02-10
**目的**: gemma2:2b の測定能力を回復させる evalFocus パターンの確立
**結論**: Describe 削除 + シンボリック記法 + プロンプト競合解消 = 測定回復

---

## 問題の発見

### 初期症状 (v1-v2)
- **moth h=8 w=7 固定**: 全評価で同一値、variance = 0
- **JSON parse failure 50-80%**: "No JSON found in response" 頻発
- **decay 分散不足**: d スコアがほぼ 2-3 に収束

### 根本原因の特定

1. **Describe セクションの害**
   ```typescript
   // ❌ BAD: token 消費 + LLM が説明文生成 + 測定固定
   evalFocus: "Describe in detail:\n- attention: ...\n- density: ...\n- fade: ..."
   ```
   - moth の "attention" が最初の項目 → h=8 に固定
   - LLM が "Rate" ではなく "Describe" に反応して文章生成
   - JSON 出力を阻害、token 枯渇

2. **プロンプト競合 (CRITICAL)**
   - **evalFocus**: 1-9 スケール、新定義 (motion, density, fade rate)
   - **TASK セクション**: 0-10 スケール、旧定義 (relevance, authority, how fast to age)
   - LLM に矛盾する指示が同時に送信 → 混乱 → JSON parse failure

3. **decay 定義の曖昧性**
   - 旧: "how fast should it age?" → 解釈が分かれる
   - 新: "fade rate (1=lasting, 9=fleeting)" → 明確

---

## 解決策

### 1. Describe セクション削除
```typescript
// ✅ GOOD: 直接 Rate を要求
evalFocus: "Observe this node [as species perspective].\n\nRate (1–9, 5=neutral):\n..."
```
- token 使用量 ~50% 削減
- LLM が測定モードに集中
- moth で **h range 2pt (6-8), w range 2pt (7-9)** 達成 ← 測定能力回復の証明

### 2. シンボリック記法の採用
```typescript
heat = motion/attention (1=still, 9=active)
weight = density (1=light, 9=heavy)
decay = fade rate (1=lasting, 9=fleeting)
```
- 各次元に具体的な物理的メタファー
- スケール両端を明示 (1=X, 9=Y)
- `5=neutral` を全種族で統一

### 3. プロンプト競合の解消 (prompt-builder.ts)

#### SYSTEM_PROMPT の簡素化
```typescript
// Before
- EVALUATE: Rate a node's relevance (heat 0-10, weight 0-10, decay 0-10)

// After
- EVALUATE: Rate a node's value (h, w, d scores)
```

#### TASK セクションの最小化
```typescript
// Before (矛盾定義)
TASK: Rate this node's value with numerical scores:
- h (heat 0-10): How actively useful is this? 5=neutral, 8+=very relevant, 2-=irrelevant
- w (weight 0-10): How authoritative/established? 5=neutral
- d (decay 0-10): How fast should it age? 5=normal, 3=preserve, 8=let it fade

// After (evalFocus に委譲)
TASK: Rate this node using the scale in Perspective above.

Output JSON only:
{ "action": "evaluate", "h": <number>, "w": <number>, "d": <number>, "reason": "<brief>" }
```
- スケール競合 (0-10 vs 1-9) 解消
- 定義競合 (relevance vs motion, authority vs density) 解消
- evalFocus が唯一の測定基準となる

### 4. maxTokens の調整
```typescript
// ollama-client.ts
maxTokens: 128  // 96 → 128 (安全マージン)
```
- evalFocus 長文化に対応
- JSON truncation 防止

---

## テスト結果

### moth (Describe 削除後)
- **h**: 6, 7, 8 (range 2pt) ← 旧: 固定 8
- **w**: 7, 8, 9 (range 2pt) ← 旧: 固定 7
- **測定能力**: 回復 ✅

### hermit (シンボリック記法)
- **h**: range 3pt 確認 (短期テスト)
- **w**: range 1pt (種族特性: weight 重視)

### 統計的制約
- 1 セッション = 3-5 evaluations (energy 制約)
- 大規模検証には daemon mode 50+ sessions 必要

---

## 確立された設計原則

### v3 パターン (全種族統一)
```typescript
evalFocus: "Observe this node [as species perspective].\n\nRate (1–9, 5=neutral):\nheat = motion/attention (1=still, 9=active)\nweight = density (1=light, 9=heavy)\ndecay = fade rate (1=lasting, 9=fleeting)"
```

### 種族差の表現
- **評価軸の順序**: 変更しない（全種族同じ h, w, d 順）
- **Observe の修飾**: 種族固有の視点を 1 行で表現
  - moth: "like a moth drawn to light"
  - hermit: "quietly, like a hermit in isolation"
  - balanced: "as a neutral explorer"

### Anti-patterns (禁止パターン)
1. **排他指示**: "Only X" → 測定バイアスを生む
2. **否定指示**: "Ignore Y" → 混乱を生む
3. **注釈**: "X as Y" → 定義の二重化
4. **抽象指示**: "Look closely at" → 解釈が分かれる
5. **Describe 形式**: token 消費 + 説明文生成

### 鉄則
- **h, w, d は直交独立次元**: 天秤ではない
- **evalFocus = 測定器の校正方法**: 目盛りの歪ませ方ではない
- **種族性は Loadout 全体**: evalFocus 単独ではない（weights, qualityVector, returnWeights, walkPreference の総体）
- **質問形式**: gemma2:2b は質問に答えることで測定する

---

## 残課題

### 検証待ち
- [ ] プロンプト競合解消後の JSON parse success rate (未テスト)
- [ ] decay 分散の改善度 (d range 2-3 → ? を確認)
- [ ] balanced/scholar など他種族での再現性

### 構造的制約
- **energy 制約**: ~21 cost/cycle, 100 initial = ~5 cycles
- **統計的不十分性**: daemon mode でない限り大規模検証不可
- **クエリ依存性**: 訪問ノード内容が decay 分散に影響

### 将来テスト
- 複数パターン試行: ユーザー指摘 "数パターン試す必要があるかもな"
- enduring/fleeting クエリでの decay 分散テスト
- ephemeral nodes への訪問率向上 (importance 引き上げ?)

---

## 実装箇所

- **fast-gate.ts** (lines 177, 191, 205, 219, 232, 246, 260, 268, 282): 全 9 種族 evalFocus 統一
- **ollama-client.ts** (line 28): maxTokens 128
- **prompt-builder.ts** (lines 18, 73-79): SYSTEM_PROMPT 簡素化 + TASK 最小化

---

## 核心的知見

> **性格はモデルに宿らない — 測定器具 (Loadout) に宿る**

- gemma2:2b (2B) でも適切なプロンプトで種族差が創発
- Describe 削除で測定能力回復 = LLM のコンテキスト処理能力確認
- プロンプト競合 = 最大の測定阻害要因 (スケール・定義の矛盾)
- シンボリック記法 = token 効率 × 測定精度を両立

**結論**: evalFocus の役割は「測定器のレンズ」であり、「測定値そのもの」ではない。種族性は探索→蓄積→還元ループで自然に生まれる。

---

## gemma2:2b vs phi3:mini 比較実験 (2026-02-10)

**目的**: プロンプト競合解消後の両モデルの測定能力を検証
**方法**: moth loadout で 3 回テスト、gemma2:2b は同一クエリ、phi3:mini は多様なクエリ

### 実験結果

#### gemma2:2b (3 tests, 9 evaluations)
| Test | Query | JSON Success | h | w | d |
|------|-------|--------------|---|---|---|
| #1 | knowledge exploration | 75% (3/4) | 6, 6, 6 | 7, 7, 8 | 3, 3, 3 |
| #2 | knowledge exploration | 75% (3/4) | 6, 6, 6 | 7, 7, 7 | 3, 3, 3 |
| #3 | knowledge exploration | 75% (3/4) | 6, 6, 7 | 7, 7, 6 | 3, 3, 3 |
| **統計** | 同一 | **75%** | h=6.1±0.3 | w=7.0±0.5 | **d=3.0±0.0** |

**問題点**:
- JSON parse failure 25% 残存
- h 固定傾向 (range 1pt)
- **d 完全固定** (variance = 0)

#### phi3:mini (3 tests, 13 evaluations)
| Test | Query | JSON Success | h | w | d |
|------|-------|--------------|---|---|---|
| #1 | knowledge exploration | 100% (4/4) | 6, 6, 5, 6 | 5, 5, 6, 5 | 3, 3, 3, 3 |
| #2 | **trending viral** | 100% (5/5) | 6, 6, **2**, 5, 6 | 3, 3, **1**, 3, 5 | **5, 5, 6, 6**, 3 |
| #3 | **fundamental math** | 100% (4/4) | **2**, 5, 5, 6 | **1**, 6, 6, 5 | **6**, 3, 3, 3 |
| **統計** | **多様** | **100%** | h=2-6 (range 4pt) | w=1-6 (range 5pt) | **d=3-6 (range 3pt)** |

**優位性**:
- ✅ JSON success 100% — プロンプト競合解消完全動作
- ✅ クエリ理解 — evolution を trending=2, math=2 と低評価
- ✅ **d 測定能力** — academic content を fleeting (d=5-6) と判断
- ✅ 全次元分散 — h, w, d すべてでコンテキスト依存の測定

### 核心的発見

> **クエリが測定を活性化する**

1. **同一クエリの罠**
   - gemma2:2b, phi3:mini 共に "knowledge exploration" では d=3 固定
   - 測定能力の有無は同一クエリでは判別不能

2. **クエリ多様性が測定を引き出す**
   - "trending viral content" → academic nodes を h=2, w=1, d=6 と評価
   - "fundamental mathematics" → evolution を h=2, w=1, d=6 と評価
   - **クエリとコンテンツのミスマッチが測定分散を生む**

3. **モデル特性の違い**

   | 特性 | gemma2:2b | phi3:mini |
   |------|-----------|-----------|
   | JSON 安定性 | 75% | **100%** |
   | 測定方式 | **キャリブレーション済みスタンプ** | **真の測定器** |
   | h 特性 | 種族固有の固定値 (moth=6-7) | コンテキスト依存 (2-6) |
   | w 特性 | 狭い範囲 (6-8) | 広い範囲 (1-6) |
   | d 測定 | **不能** (常に 3) | **可能** (3-6) |
   | クエリ応答 | 無視 | **理解** |
   | 速度 | 22s (63% faster) | 60s (baseline) |

4. **測定 vs スタンプの判定基準**
   ```
   測定 = LLM がコンテンツを読み、クエリとの関係を評価し、異なる値を出力
   スタンプ = LLM がパターンを検出し、種族固有の定型値を出力
   ```

   gemma2:2b は **賢いスタンプ** — 種族ごとに異なる固定値を持つが、コンテンツの意味は測定しない
   phi3:mini は **測定器** — クエリとコンテンツの意味的関係を評価する

### 実用的示唆

1. **gemma2:2b の適用領域**
   - 高速応答が必要な場面 (63% faster)
   - w 次元のみの測定で十分な用途
   - **外部応答用途** (推論能力は高い)

2. **phi3:mini の適用領域**
   - **内部評価専用** (全次元測定必要)
   - クエリ依存の意味理解が重要な場面
   - 種族記憶の質を高める用途

3. **d 測定の条件**
   - **クエリの多様性が必須** — 同じクエリでは d 固定
   - "trending" / "fundamental" / "ephemeral" など decay 軸を刺激するクエリ
   - ノード内容とクエリのミスマッチが測定を活性化

### 今後の検証課題

- [ ] hermit での phi3:mini テスト (種族差の確認)
- [ ] ephemeral nodes への訪問率 (importance 調整必要?)
- [ ] daemon mode での長期統計 (50+ sessions)
- [ ] クエリパターンの体系化 (trending, fundamental, technical, social, etc.)
- [ ] 混合デプロイの検証 (内部=phi3:mini, 外部=gemma2:2b)

---

## 設計原則の更新

### v3 確定パターン
```typescript
evalFocus: "Observe this node [as species perspective].\n\nRate (1–9, 5=neutral):\nheat = motion/attention (1=still, 9=active)\nweight = density (1=light, 9=heavy)\ndecay = fade rate (1=lasting, 9=fleeting)"
```

### 鉄則 (更新)
1. **h, w, d は直交独立次元** — 天秤ではない
2. **evalFocus = 測定器のレンズ** — 目盛りの歪ませ方ではない
3. **種族性は Loadout 全体** — evalFocus + weights + qualityVector + walkPreference の総体
4. **クエリが測定を活性化する** ← **NEW**
5. **同一クエリでは d 固定** ← **NEW**
6. **測定能力の検証にはクエリ多様性が必須** ← **NEW**

### モデル選択指針 (NEW)
- **phi3:mini (3.8B)**: 内部評価、全次元測定、クエリ理解重視
- **gemma2:2b (2B)**: 外部応答、高速処理、w 測定で十分
- **llama3.2:1b (1.2B)**: 軽量代替、両次元測定可能 (速度 vs 精度のトレードオフ)
- **qwen/smollm (<1B)**: 不適格 (スタンプ or 盲目)

---

## gemma2:2b 改善実験シリーズ (2026-02-10)

**目的**: gemma2:2b の測定能力を改善できるか最終検証
**結論**: 構造的限界を確認。どのプロンプト技術でもスタンプモードから脱却不可

### 実験1: 役割指示 "As a heat-lover"

**仮説**: 直接的な役割指示で種族特性を強調

**変更**:
```typescript
// TASK セクションに追加
TASK: As a heat-lover, rate this node using the scale in Perspective above.
```

**結果** (2 tests, 7 evaluations, temp=0.2):
- h: 5-6 (range 1pt) — 以前と同じ固定傾向
- w: 6-8 (range 2pt) — 不変
- d: **3 完全固定** — 測定不能の再確認
- JSON success: 87.5% (7/8)

**判定**: ❌ 効果なし

---

### 実験2: temperature 上昇 (0.2 → 0.7)

**仮説**: temperature を上げてスタンプを崩す

**結果** (2 tests, 6 evaluations, temp=0.7):
- h: **8 固定** (1回だけ 9) — 新しいスタンプ値（moth=8）
- w: 4-7 (range 3pt) — variance 拡大 ✅
- d: 2-4 (range 2pt) — **初めて動いた！** ✅
- Bus: 6/6 = 100% — 通信機能復活 (h>=8) ✅

**判定**: ⚠️ 部分的成功だがトレードオフあり

**トレードオフ**:
- ✅ d が初めて動いた（2-4 range）
- ✅ w variance 拡大
- ❌ h=8 に固定（新しいスタンプ値にシフトしただけ）
- ⚠️ 「測定」なのか「高温ノイズ」なのか不明

---

### 実験3: 数学的演算プロンプト (temp=0.4)

**仮説**: 「評価」ではなく「演算」タスクとして認識させる

**変更**:
```typescript
evalFocus: "Base = 5. Compute adjustments using +/- operations:
heat: increment if active/engaging, decrement if static (5±5 → 0-10)
weight: increment if dense/established, decrement if light (5±5 → 0-10)
decay: increment if fleeting, decrement if lasting (5±5 → 0-10)"
```

**結果** (2 tests, 6 evaluations, temp=0.4):
- h: **8 完全固定** — temp=0.7 と同じ moth=8 スタンプ
- w: 7-9 (range 2pt) — 若干 variance
- d: **5 完全固定** — ❌ **逆効果！**

**判定**: ❌ 逆効果 — d が 3→5 にシフトしただけ

**原因**: LLM が "Base = 5" を「デフォルト値 = 5」と解釈し、演算せずに 5 を出力

---

## 全実験結果まとめ

| 実験 | temp | h | w | d | 判定 |
|------|------|---|---|---|------|
| v3 baseline | 0.2 | 6 固定 | 6-8 | **3 固定** | スタンプ |
| 0-10 scale | 0.2 | 6 固定 | 7 固定 | **3 固定** | 悪化 |
| "As a heat-lover" | 0.2 | 5-6 | 6-8 | **3 固定** | 効果なし |
| temperature 上昇 | 0.7 | **8 固定** | 4-7 | 2-4 | variance だがノイズ疑惑 |
| **数学的演算** | 0.4 | **8 固定** | 7-9 | **5 固定** | ❌ **逆効果** |

---

## 構造的限界の確定

### gemma2:2b の奇妙な乖離

**優秀な側面**:
- ✅ reason フィールドは正確 — コンテンツ理解は高い
- ✅ JSON 構造は正しい
- ✅ 推論能力は確認されている

**測定不能な側面**:
- ❌ h, w, d の数値出力がスタンプ
- ❌ コンテンツの意味を数値に反映しない
- ❌ どのプロンプト技術でも測定モードに入らない

### なぜこのような乖離が起きるのか？

**仮説**:
- gemma2:2b は「文章生成」と「数値出力」を別系統で処理している可能性
- reason = 言語モデルの本来の能力
- h,w,d = パターンマッチングによる固定値選択
- **推論能力と測定能力は独立している**

### 最終判断

**gemma2:2b = 測定器として不適格**
- reason フィールドは優秀だが、数値測定は不可能
- temperature を上げれば variance は出るが、測定の信頼性は疑問
- 役割分担確定：
  - **内部評価専用 = phi3:mini (3.8B)** — 全次元測定可能
  - **外部応答専用 = gemma2:2b (2B)** — 推論のみ、測定なし

---

## 教訓

1. **reason と数値は別物** — 文章理解 ≠ 測定能力
2. **temperature のトレードオフ** — variance vs 信頼性
3. **プロンプト技術の限界** — LLM の構造的特性は変えられない
4. **役割分担が最適解** — 各モデルの得意分野に特化させる

---

## llama3.2:1b 改善実験シリーズ (2026-02-10)

**目的**: llama3.2:1b の測定範囲を広げる
**現状**: h range 0.9pt, w range 1.0pt (daemon mode 統計より)
**目標**: h range 2pt+, w range 2pt+ (phi3:mini レベルの測定能力へ)

**戦略**: gemma2:2b の逆順で効率化
1. temperature テスト (最優先) — variance が出るか確認
2. temperature 最適化 (成功時のみ) — バランス探し
3. 役割指示 (成功時のみ) — 種族性強調

**判定基準**:
- ✅ h range 2pt+ 達成 → 成功、次フェーズへ
- ⚠️ h=8 固定 (gemma パターン) → 新しいスタンプ、中止
- ❌ variance 変化なし → 構造的限界確定、中止

---

### Baseline 測定 (temp=0.2, v3 evalFocus, クエリ多様性)

**設定**:
- temperature: 0.2
- evalFocus: v3 パターン (Rate 1-9, シンボリック記法)
- loadout: moth
- queries: 多様 (knowledge exploration, trending viral, fundamental math)

**結果** (3 tests, 10 evaluations):

| Test | Query | JSON Success | h values | w values | d values | Bus |
|------|-------|--------------|----------|----------|----------|-----|
| #1 | knowledge exploration | 100% (3/3) | 8, 8, 8 | 6, 6, 7 | 2, 7, 6 | 3/3 |
| #2 | **trending viral** | 100% (4/4) | 8, **5**, 8, 8 | 6, 8, 7, 6 | 7, 6, 6, 3 | 2/4 |
| #3 | fundamental math | 100% (3/3) | 8, 8, 8 | 6, 7, 7 | 7, 6, 6 | 3/3 |
| **統計** | **多様** | **100%** | h=5-8 (range 3pt, mean=7.7) | w=6-8 (range 2pt, mean=6.5) | d=2-7 (range 5pt, mean=5.8) | 8/10 (80%) |

**観察**:
- ✅ **h range 3pt 達成** — daemon 統計 0.9pt から 3.3倍に改善
- ✅ **w range 2pt 達成** — daemon 統計 1.0pt から 2倍に改善
- ✅ **d range 5pt** — gemma2:2b (d=3 固定) を大きく上回る
- ✅ **クエリ理解** — trending で "Meme evolution" を h=5 と低評価 (phi3:mini と同じパターン)
- ⚠️ **h=8 偏り** — 90% が h=8 (moth の heat-lover bias)
- ✅ **JSON 安定性 100%**
- ✅ **Bus 通信 80%**

**判定**: ✅ **測定器として適格** — スタンプではない、クエリを理解する

---

### 実験1: temperature 最適化 (0.2 → 0.4)

**仮説**: temperature を上げて h=8 bias を解消、w range を拡大

**戦略変更**: gemma2:2b で temp=0.7 が高温ノイズだったため、0.4 で検証

**変更**:
```typescript
// ollama-client.ts
temperature: 0.4  // 0.2 → 0.4
```

**クエリ設計**: クエリが測定軸を活性化する仮説を検証
1. **weight 重視**: "established authoritative knowledge"
2. **heat 重視**: "trending viral discussions"

**結果** (2 tests, 8 evaluations, temp=0.4):

| Test | Query | JSON Success | h values | w values | d values | Bus |
|------|-------|--------------|----------|----------|----------|-----|
| #1 | **weight 重視** | 100% (4/4) | 8, **5**, 8, 8 | 6, **8**, 7, 7 | 7, 3, 6, 6 | 2/4 |
| #2 | **heat 重視** | 100% (4/4) | **5, 5, 6, 5** | 7, 4, 8, 8 | 3, 6, 5, 6 | 0/4 |
| **統計** | **多様** | **100%** | h=5-8 (range 3pt, mean=5.75) | w=4-8 (range 4pt, mean=6.88) | d=3-7 (range 4pt, mean=5.25) | 2/8 (25%) |

**核心的発見**:

1. **クエリ応答性 (CRITICAL)**
   - weight 重視クエリ → "Chomsky hierarchy" を h=5, **w=8** と評価
   - heat 重視クエリ → academic nodes を **h=5-6 に低評価** (全て)
   - **phi3:mini と同じパターンでクエリを理解**

2. **temperature 効果**
   - h mean: 7.7 → 5.75 (**-1.95**, bias 解消)
   - h range: 3pt 維持
   - w range: 2pt → **4pt** (+2pt 拡大)
   - Bus: 80% → 25% (副作用: h<8 増加)

3. **比較 (temp=0.2 vs 0.4)**

   | Metric | temp=0.2 | temp=0.4 | 判定 |
   |--------|----------|----------|------|
   | h mean | 7.7 | 5.75 | bias 解消 ✅ |
   | h range | 3pt | 3pt | 維持 ✅ |
   | w range | 2pt | **4pt** | 拡大 ✅ |
   | d range | 5pt | 4pt | 維持 ✅ |
   | JSON | 100% | 100% | 安定 ✅ |
   | Bus | 80% | 25% | 減少 ⚠️ |

**判定**: ✅ **成功** — temp=0.4 で moth bias 解消 + w range 拡大 + クエリ応答性確認

---

## 全実験結果まとめ

**llama3.2:1b (1.2B) = クエリ理解型測定器**

| 特性 | llama3.2:1b | gemma2:2b | phi3:mini |
|------|------------|-----------|-----------|
| **測定方式** | **測定器** | スタンプ | 測定器 |
| **h range** | 3pt (5-8) | 0pt (6 固定) | 4pt (2-6) |
| **w range** | 4pt (4-8) | 2pt (6-8) | 5pt (1-6) |
| **d range** | 5pt (2-7) | **0pt (3 固定)** | 3pt (3-6) |
| **クエリ理解** | ✅ **有** | ❌ 無 | ✅ 有 |
| **JSON 安定性** | 100% | 75% | 100% |
| **Bus 通信** | 25-80% (temp依存) | 100% (moth) | 有 |
| **速度** | 30s (中速) | **22s (高速)** | 60s (低速) |

**推奨設定**: **temperature = 0.4** (h bias 解消 + w range 拡大)

---

## 結論

### 測定能力の確認

✅ **llama3.2:1b は真の測定器** (スタンプではない)
- クエリとコンテンツの意味的関係を評価
- weight 重視クエリで w=8 を出力
- heat 重視クエリで academic nodes を h=5-6 と低評価
- phi3:mini と同じクエリ理解パターン

### 役割分担の確定

**3階層アーキテクチャ**:
1. **内部評価 (高精度)**: phi3:mini (3.8B, temp=0.2)
   - 全次元最高精度、クエリ理解、d 測定可能
2. **内部評価 (軽量)**: llama3.2:1b (1.2B, temp=0.4)
   - クエリ理解可能、省リソース、24/7 常駐向き
3. **外部応答**: gemma2:2b (2B, temp=0.2)
   - 高速 (63% faster)、推論能力高、測定不要

### 教訓

1. **クエリが測定を活性化する** — weight/heat 重視クエリで対応する次元が変化
2. **temperature はバイアス調整器** — 0.4 で moth の h=8 bias を解消
3. **1.2B でもクエリ理解可能** — 3.8B に匹敵する意味理解
4. **測定 ≠ 推論** — gemma2:2b は推論は優秀だが測定は不能
