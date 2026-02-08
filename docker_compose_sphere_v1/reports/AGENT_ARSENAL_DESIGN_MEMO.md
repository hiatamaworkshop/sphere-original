# エージェント武器庫 — 設計リファレンス

**日付**: 2026-02-08
**状態**: 設計道具（未確定部分あり、変更許容）

---

## 原則

```
高速化はマシンパワーに依存する — 安易なハックは不要
重要なのは:
  1. 性格付与のための知見を貯めること
  2. 武器 (16bit flags + metrics フィルタリング演算器) の種類と特徴を把握すること
  3. LLM が推論する箇所を限定するアプローチ (FastGate) の発展
```

---

## 1. 知覚可能な情報（入力次元）

### エージェントが見えるもの

| 次元 | 型 | ソース | 可視API | ノイズ |
|------|-----|--------|---------|--------|
| heat (h) | 整数 | metrics | sense/focus | ±10% |
| weight (w) | 整数 | metrics | sense/focus | ±10% |
| decay (d) | 整数 | metrics | sense/focus | ±10% |
| distance | 連続 | 空間位置 | sense/focus | なし |
| timestamp | epoch | 作成時刻 | sense/focus | なし |
| flags (16bit) | ビットフィールド | flg | sense/focus | なし |
| tags[] | 文字列配列 | L1 | scan/sense | なし |
| summary | 文字列 | L2 | sense | なし |
| content | 文字列 | L3 | focus only | なし |
| kind | 列挙 | 状態 | sense/focus | なし |
| 磁場 | 384Dベクトル+強度 | GlobalField | move時 | なし |

### エージェントが見えないもの

| 次元 | 理由 |
|------|------|
| TTL (残り寿命) | ゲーミング防止 |
| 正確な agent 位置 | 集計値のみ |
| focus 回数 | 量子化レベルのみ |
| 減衰レート内部値 | d + flags から間接的に推測のみ |

### 導出可能な指標

エージェントが知覚情報から計算できるもの:

| 指標 | 式 | 意味 |
|------|-----|------|
| freshness | `1 / (1 + age_ms / 3600000)` | 新しさ (0-1) |
| stability | `w × (1 - d/1000)` | 安定度 |
| novelty | `1 / (w + 1)` | 未知度 |
| volatility | `h × (d / 1000)` | 揮発性 |
| heat_density | `h / (w + 1)` | 注目対重量比 |
| inverse_value | `d / (w + 1)` | 逆価値密度 |

---

## 2. 16bit フラグ — 現状と設計空間

### ⚠️ フラグは未確定部分が多い。変更許容。

### 3つの層

```
┌─ 静的 (Tagger: tags → キーワードマッチで付与) ──────────────┐
│  0x0001  Authority     権威性      decay ×0.95             │
│  0x0002  Freshness     新鮮さ      heat ×1.2               │
│  0x0004  Catalyst      触媒        (物理効果なし)           │
│  0x0008  Ephemeral     一時的      decay ×1.5              │
│  0x0010  Sticky        粘着性      TTL減衰 ×0.8            │
│  0x0020  Volatile      揮発性      TTL減衰 ×1.3            │
│  0x0400  Spectral      精製済み    (物理効果なし)           │
│  0x0800  Constellation クラスタ    (物理効果なし)           │
│  0x1000  UserMarked    ユーザー重要 (物理効果なし)          │
│  0x2000  SystemCore    システム基盤 (物理効果なし)          │
├─ 動的 (Arbiter: metrics 閾値で自動設定) ───────────────────┤
│  0x0040  Hot           高熱        h > 150 で付与           │
│  0x0080  Frozen        凍結        代謝全停止               │
│  0x4000  Compressed    圧縮済み    Fossil化時               │
│  0x8000  Candidate     候補        Ascension冷却中          │
├─ 死んでいるもの (linkCounts 未供給) ──────────────────────┤
│  0x0100  Hub           ハブ        静的Taggerのみ生存       │
│  0x0200  Isolated      孤立        同上                     │
└────────────────────────────────────────────────────────────┘
```

### 物理効果マトリクス

```
             decay_rate  heat_boost  weight   ttl_decay  代謝
Authority    ×0.95       -           -        -          -
Freshness    -           ×1.2        -        -          -
Ephemeral    ×1.5        -           -        -          -
Sticky       -           -           -        ×0.8       -
Volatile     -           -           -        ×1.3       -
Hub          -           -           ×1.1     -          -
Frozen       -           -           -        -          全停止
```

7 flags が物理効果を持つ。残り 7 flags はシグナルのみ。

### 空きビット

| ビット | 状態 |
|--------|------|
| 0x0040 (bit 6) | Hot — 使用中 |
| ~~bit 10~~ | **空き** |
| ~~bit 11~~ | **空き** |

2ビット空き。将来のフラグ追加に使用可能。

### フラグ設計の考察

**物理効果ありフラグ (7)**: Sphere の物理法則を構成する。変更はシステム全体に影響。
**シグナルのみフラグ (7)**: エージェントの判断材料のみ。自由に再定義可能。

```
変更コスト:
  物理効果あり → 高 (RenalCore, Arbiter, 全テストに影響)
  シグナルのみ → 低 (Tagger のキーワード + FastGate の weights のみ)
  空きビット   → 自由 (新規フラグ追加)
```

---

## 3. フィルタリング演算器 — 種類と特徴

### 現行: 線形結合 (FastGate v1)

```
score = Σ(flag_bit_i × flag_weight_i)     ← 離散シグナル (0 or weight)
      + Σ(metric_j × metric_weight_j)     ← 連続シグナル
      + keyword_match × keyword_bonus      ← テキストシグナル
```

**特性**:
- 単純、高速 (0ms)、説明可能
- Loadout の weights 変更だけで人格が変わる
- **実証済み**: balanced/scholar/scout で人格分離を確認
- **弱点**: 非線形な関係を捉えられない

### 設計空間 — 未実装の演算器候補

| 演算器 | 式の例 | 特性 | 用途 |
|--------|--------|------|------|
| **閾値フィルタ** | `if h < T: skip` | 最低基準、前処理 | 低品質ノード排除 |
| **比率演算** | `h / (w + 1)` | 2変数の関係を捉える | 「注目されているが軽い」ノード検出 |
| **逆価値密度** | `d / (w + 1)` | 脆弱性の指標 | 保全価値の低いノード検出 |
| **フラグ組合せ** | `Authority & !Ephemeral` | 論理フィルタ | 「信頼できて安定」なノード限定 |
| **差分最大化** | `\|node - prev\|` | 多様性追求 | 同じ種類のノードを避ける |
| **空間散逸** | `max(dist from visited)` | 未踏領域優先 | 探索の網羅性 |
| **entropy重み** | `entropy(Δ) × score` | 驚き加味 | 予測不能な体験を優先 |
| **時系列減衰** | `score × e^(-age/τ)` | 鮮度バイアス | 古いノードの重み減衰 |

### 演算器の組合せ可能性

```
Pipeline 型:
  filter(閾値) → score(線形結合) → rerank(比率演算)

並列型:
  score_A(線形結合) + score_B(比率演算) → 重み付き合計

切替型:
  if entropy > 0.5: score(差分最大化)
  else: score(線形結合)
```

### 優先度の考え方

```
現行の線形結合は 14 次元の連続人格空間を持つ。
5 presets は代表点に過ぎない。
→ 演算器の「種類」を増やす前に、既存空間の探索が先。

ただし、以下は検討価値あり:
  - 閾値フィルタ (ghost/fossil 除外) → 実装コスト低、即効性あり
  - フラグ組合せ (Candidate 除外) → evaluate しても凍結中で無駄
```

---

## 4. 磁場の影響

### 磁場 = 移動バイアス（武器ではないが環境圧）

```
direction = modeDirection × (1 - fieldWeight) + globalField × fieldWeight
```

| MoveMode | fieldWeight | 意味 |
|----------|-------------|------|
| flow | 1.0 | 完全に磁場に従う |
| hot | 0.5 | 半分磁場 |
| fresh | 0.5 | 半分磁場 |
| deep | 0.5 | 半分磁場 |
| explore | 0.3 | 自律的 |
| random | 0.0 | 磁場無視 |

### エネルギーと磁場

```
fatigueFactor = 1 - (energy / maxEnergy)
adjustedFieldWeight = baseWeight + fatigueFactor × 0.3

→ 疲労すると磁場に流される
→ Scout (explore, 0.3) と Scholar (deep, 0.5) で影響度が違う
```

### Loadout への統合可能性

現在 `walkPreference` は MoveMode を指定するだけ。
磁場感受性そのものを Loadout パラメータにする案:

```typescript
// 現行
walkPreference: "deep"  // → fieldWeight = 0.5 (固定)

// 案: fieldSensitivity を追加
fieldSensitivity: 0.7   // Scholar: 磁場に敏感（深い場所へ誘導されやすい）
fieldSensitivity: 0.1   // Scout: 磁場をほぼ無視（自分の意志で動く）
```

**ステータス**: 未検証。磁場の効果自体がまだ弱い（残課題: intensity → hunger 係数調整）

---

## 5. 帰還判定 — 2つのアプローチ

### 現行: Satisfaction Vector (4D dot product)

```
S = [avg_h/10, avg_w/10, 1-avg_d/10, hitRate]
returnProb = clamp((S·R - 0.5) × 2, 0, 1) + energyPressure
```

**特性**: 目標依存（returnVector R が「何に満足するか」を定義）
**実証済み**: balanced/scholar/scout で帰還タイミングが分離

### 提案: Entropy-based Return (Delta Profile)

```
if entropy(Δ) < threshold: return
```

**特性**: 目標不要（「まだ驚きがあるか？」だけを問う）
**観測結果**: Scholar Cycle 4 で entropy 0.176 → Cycle 5 で 0.428（パターン検出は機能）
**制約**: 4+ cycles で初めて有意（短期セッションでは使えない）

### 段階的移行

| 段階 | 判定方法 | 状態 |
|------|---------|------|
| 現行 | satisfaction + energy | ✅ 実装・実証済み |
| 観測 | 既存 + entropy ログ | ✅ 実装済み (observation only) |
| 切替 | entropy + energy | 未実装 |
| 完成 | entropy のみ | 未実装 |

---

## 6. 確定している知見

| 知見 | 根拠 |
|------|------|
| 線形結合だけで人格分離が成立する | 3 Loadout テスト (balanced/scholar/scout) |
| LLM推論を pick から排除 → 速度 2.5 倍 | FastGate v1 テスト (3回/cycle → 1回/cycle) |
| energySensitivity は「帰り方の美学」を表現する | Scholar energy=3, Scout energy=63 |
| entropy は 4+ cycles で有意になる | Scholar Cycle 4-5 で急落→復帰を観測 |
| evaluations は capsule → pipeline → bookkeeper で反映される | evaluations 消失バグ修正後に確認 |

---

## 7. 未検証の仮説

| 仮説 | 検証方法 | 優先度 |
|------|---------|--------|
| 比率演算 (h/w) が線形結合より表現力が高い | 同一環境で A/B 比較 | 低 (線形で十分かもしれない) |
| フラグ組合せパターンが人格分離に寄与する | フラグフィルタ追加前後の Delta Profile 比較 | 中 |
| 磁場感受性を Loadout 化すべき | fieldSensitivity パラメータ追加 + テスト | 低 (磁場効果自体が弱い) |
| entropy-based return が satisfaction より優れる | 並行動作 + 10+ cycles でのデータ蓄積 | 中 |
| 同一 Loadout + 異なるモデルで Delta Profile が一致する | phi3:mini vs 他モデルで同一テスト | 高 (カップリング本質の検証) |
| archivist / hunter が設計意図通りに動作する | テスト実施 | 中 |

---

## 8. 次に知見を貯めるべき領域

### 優先順

1. **同一 Loadout 複数回実行** — 統計的ベースライン (同じ条件で分散を測る)
2. **archivist / hunter テスト** — 残り 2 人格の分離確認
3. **モデル載せ替え** — 同一 Loadout で Delta Profile が変わるか
4. **ghost/fossil フィルタ** — 閾値フィルタの最小実装
5. **entropy-based return** — satisfaction との並行比較

### データ蓄積のフォーマット

```
loadout, model, cycles, duration, evals, heatDelta, finalEnergy,
satisfaction[4], deltaMean[5], deltaVariance[5], entropy
```

---

## 関連ドキュメント

- `reports/LOADOUT_DESIGN_MEMO.md` — Loadout 設計 (energySensitivity 詳細)
- `reports/COUPLING_LAYER_DESIGN_MEMO.md` — 責務分離の原則
- `reports/16BIT_FLAG_PATTERNS.md` — フラグキーワードパターン辞書
- `reports/EVALUATION_MECHANISM_MEMO.md` — 評価メカニズム (h,w,d 係数)
- `reports/MAGNETIC_FIELD_IMPLEMENTATION_MEMO.md` — 磁場モデル
- `reports/DELTA_PROFILE_DESIGN_PRINCIPLES.md` — Delta Profile 設計原則
- `phi-agent/doc/FAST_PATH_DESIGN.md` — FastGate アーキテクチャ
- `phi-agent/doc/LOADOUT_TEST_RESULTS.md` — Loadout テスト結果
