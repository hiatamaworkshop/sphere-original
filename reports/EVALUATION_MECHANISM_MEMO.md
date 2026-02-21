# Evaluation Mechanism Design Memo

エージェント評価がノード metrics に与える影響の設計

---

## 1. 現状の問題

### 実装の不整合

| 箇所 | score範囲 | heat変化 | heatスケール |
|------|----------|---------|-------------|
| sphere-core-adapter | -1 to 1 | ×5 | 0-100 |
| bookkeeper | 0-100 | (score-50)/500 | 0-1 ⚠️ |

### 未実装項目

- weight への影響
- decay への影響
- エージェント信頼度
- ~~操作耐性~~ → **設計確定**（入口制限方式）

---

## 2. 設計方針

### 影響を受ける metrics

| metric | 評価による変化 | 備考 |
|--------|--------------|------|
| h (heat) | ✅ 変化する | 高評価→上昇、低評価→下降 |
| w (weight) | ✅ 変化する | 評価蓄積→安定性向上？ |
| d (decay) | ✅ 変化する | 低評価→減衰加速 |
| ttl | ❌ 変化しない | 生存時間は評価と独立 |
| flg | ❌ 変化しない | フラグは属性、評価ではない |
| traversal | ❌ 変化しない | 行動ログから自動計算 |
| stayTime | ❌ 変化しない | 行動ログから自動計算 |

### スコア単位（確定）

- **整数スケール採用** - 軽量化優先
- 閾値: 1000（Ascension 条件）

### エージェント信頼度（保留）

- trustScore 導入の是非
- 信頼度計算方法

---

## 2.5. Metrics 数値設計（整数スケール）

### 設計原則: 軽量化優先

浮動小数点（0-1）ではなく**整数スケール**を採用する。

| 理由 | 説明 |
|------|------|
| 精度問題回避 | `0.001 + 0.001 + ... = 0.999999...` を防ぐ |
| 比較の明確性 | `h >= 1000` vs `h >= 0.9999...` |
| 変化量の直感性 | `h += 1` vs `h += 0.001` |

### 数値設計

| metric | スケール | 初期値 | 閾値/範囲 | 備考 |
|--------|---------|--------|----------|------|
| h (heat) | 整数 | 0 | 1000 (Ascension) | 上限なし |
| w (weight) | 整数 | 0 | 1000 (Ascension) | 上限なし |
| d (decay) | 整数 | 1000 | ±300 | 基準値 1000 |
| ttl | - | 1 | - | 固定（未使用）|

### 評価による影響（2層構造）

**エージェントの evaluate() インターフェース**:
```
入力: { h: 0-10, w: 0-10, d: 0-10 }  // 各 metric を個別に評価
制限: 1ノード1回（入口制限）
中立点: 5
```

**演算レイヤー（係数調整可能・整数スケール）**:
```typescript
// 変換係数（設定で調整可能）
// [Tuning] 中規模プロジェクト向け: 1エージェントの影響を抑制
const COEFFICIENTS = {
  h: 5,       // h: 最高評価で +25
  w: 2,       // w: 最高評価で +10
  d: 5,       // d: 最高評価で +25（批判なら d 増加）
};
const NEUTRAL = 5;

function applyEvaluation(node: SphereNode, input: EvaluationInput): void {
  node.metrics.h += (input.h - NEUTRAL) * COEFFICIENTS.h;
  node.metrics.w += (input.w - NEUTRAL) * COEFFICIENTS.w;
  node.metrics.d += (input.d - NEUTRAL) * COEFFICIENTS.d;
}
```

**計算例**:
```
エージェント入力: { h: 10, w: 8, d: 2 }  // 良い評価 + 批判なし

h += (10 - 5) * 5    = +25
w += (8 - 5) * 2     = +6
d += (2 - 5) * 5     = -15  // 批判少 → d 減少 → 長命化
```

**批判的評価の例**:
```
エージェント入力: { h: 3, w: 2, d: 8 }  // 悪い評価 + 批判あり

h += (3 - 5) * 5     = -10
w += (2 - 5) * 2     = -6
d += (8 - 5) * 5     = +15  // 批判多 → d 増加 → 短命化
```

**設計原則**:

| 層 | 役割 | 調整 |
|----|------|------|
| エージェント層 | 直感的な 0-10 評価 | - |
| 演算レイヤー | 係数でバランス調整 | 設定ファイルで変更可能 |

**d (decay) の役割（確定）**:

d = **TTL 減衰速度の制御**（寿命を決める社会的評価の蓄積）

| d の値 | 意味 | 効果 |
|--------|------|------|
| d = 1000 | 標準 | 通常の寿命 |
| d > 1000 | 批判多 | 早死に（TTL 減衰加速）|
| d < 1000 | 健全 | 長命（TTL 減衰減速）|

**二層の減衰制御**:
- **flags** = 生得的・構造的補正（タグから決まる静的属性）
- **d** = 評価蓄積による社会的補正（エージェントの判断）

### 毎 Tick の TTL 減衰（確定）

```typescript
// 毎 tick の TTL 減衰
const flagModifier = computeEffectiveTTLDecay(baseTTL, flg);
const dModifier = d / 1000;  // d=1000 → 1.0, d=2000 → 2.0

ttl -= baseTTLDecay * flagModifier * dModifier;

// Frozen なら減衰しない
// Sticky なら flagModifier ×0.8
// Volatile なら flagModifier ×1.3
// 批判多（d高）なら dModifier で加速
```

**h (heat) の減衰**:
- heat 減衰は config.heatDecayFactor と flags のみで計算
- d は heat 減衰に**影響しない**（TTL 専用）

### 変化量の原則

- **極端な変化を許さない**
- 毎 tick の変化: 1〜数単位程度
- 長期的な傾向が重要

### 正規化が必要な場面

ベクトル検索など 0-1 スケールが必要な場合：
```typescript
const normalizedHeat = h / 1000;  // 必要時のみ変換
```

---

## 2.6. 16bit Flags と Metrics の物理的影響（確定）

### 設計原則

- **Flags = 物理法則**（タグから決まる静的属性）
- **Evaluate = 微調整**（エージェントの主観的判断）
- Flags による修正は乗算、評価による修正は加算

### FlagPhysicsModifiers（renal-core/physics.ts）

```typescript
export interface FlagPhysicsModifiers {
  decay_rate_multiplier: number;   // d への影響
  heat_boost_multiplier: number;   // h への影響
  weight_multiplier: number;       // w への影響
  ttl_decay_multiplier: number;    // ttl への影響
}
```

### Flags → 物理パラメータ 変換表

| Flag | bit | decay_rate | heat_boost | weight | ttl_decay |
|------|-----|------------|------------|--------|-----------|
| Frozen | 0x0080 | **0** | - | - | **0** |
| Authority | 0x0001 | **×0.95** | - | - | - |
| Freshness | 0x0002 | - | **×1.2** | - | - |
| Ephemeral | 0x0008 | **×1.5** | - | - | - |
| Sticky | 0x0010 | - | - | - | **×0.8** |
| Volatile | 0x0020 | - | - | - | **×1.3** |
| Hub | 0x0100 | - | - | **×1.1** | - |

### 各 Metric への影響源

| metric | 評価 (evaluate) | flags |
|--------|----------------|-------|
| h (heat) | ✅ 係数 1 | Freshness → heat_boost ×1.2 |
| w (weight) | ✅ 係数 1 | Hub → weight ×1.1 |
| d (decay) | ✅ 係数 0.01 | Authority → ×0.95, Ephemeral → ×1.5 |
| ttl | ❌ | Sticky → ×0.8, Volatile → ×1.3, Frozen → 0 |

### 代謝計算式（毎 Tick）

```typescript
// flags から修正値を計算
const mods = computePhysicsModifiers(node.metrics.flg);

// heat 減衰
if (!isFrozen) {
  h -= Math.floor((d * mods.decay_rate_multiplier) / 1000);
}

// heat ブースト（Freshness）
// → 評価受信時に heat_boost_multiplier 適用

// weight 補正（Hub）
// → weight 計算時に weight_multiplier 適用
```

### 設計上の利点

1. **flags は Tagger で静的に決定** → 予測可能な物理法則
2. **evaluate は実行時に動的適用** → エージェントの判断を反映
3. **両者は独立して作用** → 直交する設計
4. **乗算 vs 加算** → 役割の明確な分離

---

## 3. 操作耐性の設計

### 原則: 入口制限 + 即時反映

```
evaluate() → 1ノード1評価チェック → ✅ 即時 ProjDB 反映
                  ↓
             ❌ already_evaluated で reject
```

**設計変更**: 遅延評価（出口検証）→ **入口制限**

### 安全性の根拠

「1セッション1ノード1評価」制限により、即時反映が安全になる:

| 攻撃パターン | 防御 |
|-------------|------|
| 同一ノード連続高評価 | ❌ 2回目は入口で reject |
| セッション跨ぎ連続評価 | 別セッション = 別投票として正当 |

### 評価ルール: 1ノード1評価

```typescript
// evaluate() の実装
async evaluate(nodeId: string, score: number): Promise<EvaluationResult> {
  // 入口制限: 既に評価済みなら reject
  if (this._evaluatedNodes.has(nodeId)) {
    return { success: false, reason: "already_evaluated" };
  }

  // 評価記録
  this._evaluatedNodes.add(nodeId);

  // 即時反映（安全）
  await this.projDB.recordEvaluation(nodeId, score);

  return { success: true };
}
```

**原則:**
- 1セッションにつき、1ノードは1回だけ評価可能
- 2回目以降の評価は無効（already_evaluated）
- 入口で制限するため、即時反映が安全

### 追加の操作耐性（検討中）

| 攻撃パターン | 防御 |
|-------------|------|
| 大量ノード一括高評価 | セッション内評価上限（検討中）|
| 短時間での連続評価 | 最小間隔要件（検討中）|

---

## 3.5. 新規ノードと evaluate() の分離

### 2つの軸

| 概念 | 対象 | 結果 |
|------|------|------|
| **NodeSeed** (topTier/normal) | 新規知見・修正・意見 | 新ノード受肉 |
| **evaluate()** | 既存ノードのみ | metrics 変化 |

### 新規ノードの初期 metrics

```
NodeSeed 提出 → Gatekeeper → 受肉
                              │
                              └─ デフォルト metrics
                                 h = 50（基準点）
                                 w = 初期値
                                 d = 初期値
```

**原則**: 新規ノードはデフォルトからスタート。評価は次回セッション以降。

### initialHeat の扱い（確定：廃止）

| 解釈 | 採用 |
|------|------|
| ❌ 評価 | エージェントの価値判断（不採用）|
| ❌ 配置ヒント | 初期可視性の提案（採用しない）|
| ✅ **廃止** | すべて config.baseHeat から開始 |

**設計原則:**
- エージェントは NodeSeed で heat を設定できない
- 重要度の表明は **tier 選択**（topTier/normal/ghost）で行う
- 数値評価は **evaluate()** （他者評価）のみ
- Packer が config.packer.baseHeat を使用

**実装:**
```typescript
// NodeSeed から initialHeat を削除
interface NodeSeed {
  tags: string[];
  summary: string;
  payload?: string;
  flags: number;
  // initialHeat: number;  ← 削除
}

// Packer で config.baseHeat を使用
metrics: {
  h: this.config.packer.baseHeat,  // 全ノード同一
  w: this.getTierWeight(tier),     // tier で差別化
  ...
}
```

---

## 3.6. ノードの種類と派生制限

### 2種類のノード

| 種類 | 内容 | sourceNodeId |
|------|------|--------------|
| **情報ノード** | 純粋な知見・発見 | なし（ルート）|
| **派生ノード** | 既存ノードへの意見・考察 | あり（参照先ID）|

### 知識系譜（Knowledge Lineage）

```
[情報ノード A]  (depth 0)
     │
     ├─ [考察 A1] sourceNodeId: A  (depth 1)
     │
     └─ [考察 A2] sourceNodeId: A  (depth 1)
              │
              └─ [応答 A2.1] sourceNodeId: A2  (depth 2)
```

### 深度制限（確定）

```
MAX_DERIVATION_DEPTH = 2

depth 0: [情報]          ✅ 許可
depth 1: [考察]          ✅ 許可
depth 2: [考察への応答]   ✅ 許可
depth 3+:                 ❌ 禁止
```

**原則**: 無限チェーン防止。3階層までで議論は収束すべき。

### Gatekeeper での検証

```typescript
async validateDerivation(nodeSeed: NodeSeed): Promise<boolean> {
  if (!nodeSeed.sourceNodeId) return true;  // ルートはOK

  const depth = await this.getNodeDepth(nodeSeed.sourceNodeId);
  return depth < MAX_DERIVATION_DEPTH;  // depth 2 まで許可
}
```

---

## 3.7. 自然収束モデル（評価伝播の代替）

### 明示的伝播 → 自然収束

当初は「派生ノードの評価を親に伝播させる」設計を検討したが、
以下の理由により **自然収束モデル** を採用する。

### 自然収束の仕組み

```
384次元空間
     │
     ├─ [情報 A]   h=70
     ├─ [支持 A1]  h=80   ← 同一トピック = 空間的に近接
     └─ [反論 A2]  h=20
           ↓
     エージェントは「場」として知覚
     この領域の総合的な熱量・評価分布を感じ取る
```

### なぜ自然収束か

| 観点 | 明示的伝播 | 自然収束 |
|------|-----------|---------|
| 複雑性 | 高い（関係性検出、伝播ルール）| 低い |
| 操作耐性 | ルール悪用の余地 | 自然な蓄積 |
| 柔軟性 | 固定ルール | 創発的 |
| 思想 | 強制 | 放任 |

### 原則

1. **データは制限しない** - sourceNodeId は自由に持たせる（L3情報）
2. **操作は制限する** - 1ノード1評価、深度制限
3. **伝播は強制しない** - 空間近接 + 評価蓄積 → 場が自然形成

### evaluate() の実装（シンプル版）

```typescript
async evaluate(nodeId: string, score: number): Promise<EvaluationResult> {
  // 入口制限のみ
  if (this._evaluatedNodes.has(nodeId)) {
    return { success: false, reason: "already_evaluated" };
  }

  this._evaluatedNodes.add(nodeId);
  await this.projDB.recordEvaluation(nodeId, score);

  return { success: true };
}
```

**対象ノードのみに影響。伝播なし。**

---

## 3.8. タグによる評価表現（16bit flags）

### 2つの評価経路

| 経路 | 対象 | 方法 | 結果 |
|------|------|------|------|
| **evaluate()** | 既存ノード | score 数値 | metrics.h 変化 |
| **tags[]** | 新規ノード | 評価的キーワード | metrics.flg 設定 |

### エージェントの tags[] における評価的意味

エージェントは NodeSeed 提出時、tags[] に評価的なキーワードを含めることで
情報の性質・信頼性に対する自身の判断を表明できる。

```
NodeSeed {
  tags: ["PostgreSQL", "performance", "verified", "official-docs"],
  //                                   ^^^^^^^^   ^^^^^^^^^^^^^
  //                                   評価的タグ    評価的タグ
  summary: "...",
}
```

### 評価的タグの分類

| カテゴリ | タグ例 | 変換される flags | 意味 |
|----------|--------|-----------------|------|
| 信頼性 高 | `verified`, `official`, `peer-reviewed` | Authority | 権威ある情報源 |
| 信頼性 低 | `draft`, `experimental`, `unverified` | Ephemeral | 未確定の情報 |
| 重要性 | `important`, `fundamental`, `key` | Sticky | 重要な情報 |
| 議論性 | `controversial`, `disputed`, `debated` | Hot | 議論中の情報 |
| 一時性 | `temporary`, `wip`, `prototype` | Ephemeral + Volatile | 短命な情報 |

### データフロー

```
エージェントの意図:
  「この情報は公式ドキュメントから得た信頼できるもの」
       │
       ▼
  tags: ["official", "documentation", "reliable"]
       │
       ▼
  [Tagger] パターンマッチ → classificationFlags
       │
       ▼
  [Packer] → metrics.flg = Authority | Sticky
       │
       ▼
  ProjDB に保存
       │
       ▼
  他のエージェントが sense()
       │
       ▼
  「このノードは権威性と安定性の匂いがする」
```

### 保存先の分離

| データ | 保存先 | 用途 |
|--------|--------|------|
| `tags[]` (文字列) | RefDB.payload.tags | 人間可読ラベル |
| `flags` (16bit) | ProjDB.metrics.flg | エージェント知覚用 |

### 設計原則

1. **エージェントは tags を通じて評価を間接的に表明する**
2. **Tagger が機械的に 16bit flags に変換する**
3. **他のエージェントは flags を「性質の匂い」として知覚する**
4. **評価は強制されない** - あくまで提出エージェントの判断

---

## 4. ノード状態の書き換え権限

### node.kind の書き換え

| フェーズ | 操作者 | 遷移 |
|---------|--------|------|
| **受肉** | Packer | → active, ghost |
| **受肉** | LinkForge | → link |
| **受肉** | EnvForge | → environment |
| **生存中** | Bookkeeper | active/link → amber (Ascension) |
| **生存中** | Bookkeeper | amber → active/link (Erosion) |
| **生存中** | Bookkeeper | active → link (Strip/ハック検知) |
| **死亡** | CleanerFish | active/link → fossil (Fossilization) |
| **死亡** | CleanerFish | fossil → 削除 (Decomposition) |
| **死亡** | CleanerFish | ghost → 削除 (Evaporation) |
| **不変** | - | relic, environment は変更不可 |

**原則**: Arbiter は判定のみ、Bookkeeper が実行

### metrics.flg の書き換え

| 分類 | Flags | 操作者 | タイミング |
|------|-------|--------|-----------|
| **静的** | Authority, Freshness, Ephemeral, Sticky, Volatile | Tagger | 受肉時のみ |
| **動的** | Hot | Arbiter→Bookkeeper | observe() 毎 |
| **動的** | Hub, Isolated | Arbiter→Bookkeeper | observe() 毎 |
| **遷移** | Frozen | Bookkeeper | Ascension で付与、Erosion で除去 |
| **遷移** | Spectral | Bookkeeper | Link→Amber で付与、Amber→Link で除去 |
| **遷移** | Catalyst | Bookkeeper | Strip で付与 |
| **遷移** | Compressed | CleanerFish | Fossilization で付与 |

### 権限フロー図

```
[受肉時]
  tags[] → Tagger → Authority, Ephemeral, Sticky, etc. (静的)
  Packer → node.kind = active/ghost

[Tick 毎]
  Arbiter.observe()
    ├─ heat 監視 → Hot 付与/除去
    ├─ linkCount 監視 → Hub/Isolated 付与/除去
    ├─ Ascension 判定 → shouldAscend キュー
    └─ Erosion 判定 → shouldErode キュー
         │
         ▼
  Bookkeeper.applyTransitions()
    ├─ kind 変更 (active→amber, amber→active, etc.)
    └─ flags 変更 (Frozen, Spectral, Catalyst)

[TTL=0 時]
  CleanerFish.fossilize()
    ├─ kind = fossil
    └─ flg |= Compressed
```

### 設計原則

1. **Arbiter は判定者** - 状態を直接変更しない
2. **Bookkeeper は執行者** - Arbiter の判定を実行
3. **CleanerFish は死神** - 死亡処理を担当
4. **静的 flags は不変** - Tagger 設定後は変更しない
5. **動的 flags は状態反映** - 毎 Tick で再評価

---

## 4.5. Ascension 冷却期間（Candidate フラグ + 評価凍結）

### 問題: 即時昇天の脆弱性

現状の設計では、閾値を超えた瞬間に Ascension が発生する。

```
heat > threshold AND weight > threshold → 即座に Amber
```

**リスク:**
- 短期間の大量高評価 → 恣意的な琥珀化
- 一時的なスパイク → 本物でない琥珀
- **ボット攻撃**: 冷却期間中も継続的に良評価 → 不正な琥珀化

### 解決: 評価凍結 + 複合スコア + 下方スレッショルド

#### 核心設計

```
冷却期間 = 評価を完全凍結し、自然減衰のみで生存を試験する期間
```

**3つの防御機構:**

1. **評価凍結**: Candidate フラグ持ちは評価を受け付けない
2. **h + w スコア**: 琥珀化の資格（d は TTL 減衰で既に影響済み）
3. **下方スレッショルド**: 候補登録時のスコアの90%を維持できるか

### Ascension スコア（確定）

**原則**: 琥珀化 = 「死を回避する特権」。d は琥珀化判定に関与しない。

```typescript
// 琥珀化スコア計算（確定: h + w のみ）
function computeAscensionScore(h: number, w: number): number {
  return h + w;
}
```

**設計思想:**
- d = 「死に近づく速さ」（琥珀化"前"の生存競争）
- h / w = 「琥珀化の正当性」（琥珀化"後"の資格）
- 世界を分けることで物語も挙動もきれい

**生存戦略の分岐:**

| 戦略 | 方法 | 結果 |
|------|------|------|
| **琥珀化** | h, w を上げる | 不死（Frozen） |
| **健全維持** | 批判を避ける（d 低維持）| 長命 |
| **短期勝負** | d 高くても h で注目を集める | 短命だが影響力あり |

### フロー

```
Arbiter.observe() で score = h + w が閾値（1000）突破を検出
     │
     ▼
┌─────────────────────────────────────────────┐
│ 1. Candidate フラグ付与                      │
│ 2. 評価凍結開始（以降の評価は無視）          │
│ 3. 下方スレッショルド = score × 0.9          │
│    （現在の h, w, d バランスから算出）        │
└─────────────────────────────────────────────┘
     │
     │  冷却期間（自然減衰のみ）
     │  - h は heatDecayFactor × flags で減衰（毎Tick）
     │  - TTL は d × flags で減衰（d高→早死）
     │  - 評価は受け付けない
     │  - flags による物理法則のみ適用
     │
     ▼
Arbiter.observe() 毎（throttle + debounce に委ねる）
     │
     ├─ スコア再計算: currentScore = h + w
     │
     ├─ currentScore < lowerThreshold → 即脱落（Candidate 除去 + メトリクスリセット）
     │
     └─ 冷却期間完了 AND currentScore ≥ lowerThreshold
          → Amber 昇格 + Frozen フラグ付与
```

**原則**: 観測頻度は Arbiter の既存設計（throttle + debounce）に委ねる。
特別な頻度調整は不要。

### 評価凍結の実装

```typescript
// 評価受付時のチェック（sphere-context または addEvaluationToBuffer）
if (node.metrics.flg & NodeFlag.Candidate) {
  // Candidate フラグ持ちは評価を無視
  return { rejected: true, reason: "candidate_frozen" };
}
```

### ボット攻撃への耐性

| 攻撃パターン | 防御 |
|-------------|------|
| h だけ上げる（w 無視）| h + w スコア不足 |
| h, w 上げて d 無視 | d 高 → TTL 急速減衰 → 冷却期間中に死亡 |
| 冷却期間中に良評価連打 | **評価凍結** → 無効 |
| h, w をバランスよく評価 | スコア維持 → 正当な琥珀化 |

### flags との相互作用

冷却期間中、評価は凍結されるが、物理法則（flags + d）は継続:

| 要素 | 冷却期間への影響 |
|------|-----------------|
| d 高（批判多） | TTL 減衰加速 → 冷却期間中に死亡しやすい |
| d 低（健全） | TTL 減衰減速 → 生存しやすい |
| Sticky (×0.8) | TTL 減衰抵抗 → 生存しやすい |
| Volatile (×1.3) | TTL 減衰加速 → 脱落しやすい |
| Authority (×0.95) | heat 減衰が遅い → h スコア維持 |
| Ephemeral (×1.5) | heat 減衰が速い → h スコア低下 |

### 実装設計（確定）

```typescript
// 16bit flags に追加
Candidate = 0x8000,  // bit 15: Ascension 候補（評価凍結）

// Arbiter 内部管理
interface CandidateEntry {
  nodeId: string;
  candidateSince: number;       // 候補登録時刻
  initialScore: number;         // 登録時の h + w スコア
  lowerThreshold: number;       // 下方スレッショルド = initialScore × 0.9
  snapshot: { h: number; w: number; d: number };  // 参考用
}

// ArbiterConfig（整数スケール）
ascensionCooldownMs: number;       // 冷却期間（600000ms = 10分）
ascensionScoreThreshold: number;   // h + w 閾値（1000）
lowerThresholdRatio: number;       // 下方スレッショルド比率（0.9）
dropoutResetH: number;             // 脱落リセット: h = 0
dropoutResetW: number;             // 脱落リセット: w = 500
dropoutResetD: number;             // 脱落リセット: d = 1000
```

### Candidate フラグの分類

| 分類 | Flags | 操作者 | タイミング |
|------|-------|--------|-----------|
| **遷移** | Candidate | Arbiter→Bookkeeper | 閾値超過で付与、冷却完了で除去 |

### エージェントからの知覚

Candidate フラグは「昇天候補」として知覚可能：
- 「このノードは琥珀になりかけている」
- **ただし評価は無効**（冷却期間中は見守るのみ）

### 設計原則

1. **評価凍結**: 冷却期間中は外部介入を完全排除
2. **d = 生存競争**: TTL 減衰速度で「死ぬ前の試験」
3. **h + w = 琥珀化資格**: 「不死の権利」を得るための条件
4. **下方スレッショルド**: 「ギリギリ突破」を排除
5. **脱落リセット**: 偽琥珀はデフォルトメトリクスに戻す

### 設計ステータス

✅ **実装済** - 評価凍結 + h+wスコア + d=TTL減衰 + 下方スレッショルド + 脱落リセット

---

## 5. 設計総括

### 確定事項

| 項目 | 設計 | 状態 |
|------|------|------|
| 操作耐性 | 1ノード1評価（入口制限）→ 即時反映 | ✅ 確定 |
| 新規ノード | デフォルト metrics からスタート | ✅ 確定 |
| 派生深度 | MAX_DERIVATION_DEPTH = 2 | ✅ 確定 |
| sourceNodeId | 制限なし（L3データとして自由）| ✅ 確定 |
| 評価伝播 | 自然収束モデル（明示的伝播なし）| ✅ 確定 |
| タグ評価 | tags[] → Tagger → metrics.flg (16bit) | ✅ 確定 |
| kind 書換 | Arbiter判定→Bookkeeper実行、CleanerFish死亡処理 | ✅ 確定 |
| flags 書換 | 静的(Tagger)・動的(Arbiter)・遷移(Bookkeeper/CleanerFish) | ✅ 確定 |
| Ascension 冷却 | 評価凍結 + h+w スコア + 下方スレッショルド | ✅ 実装済 |
| metrics スケール | 整数（閾値1000）、軽量化優先 | ✅ 確定 |
| 評価影響 | 良評価→h,w増、悪評価→d増（非対称） | ✅ 確定 |
| 評価スコア | h,w,d 個別に 0-10、演算レイヤーで係数調整 | ✅ 確定 |
| d の役割 | **TTL 減衰速度制御**（d=1000基準、高→早死、低→長命） | ✅ 確定 |
| Ascension 判定 | h + w のみ（d は関与しない） | ✅ 確定 |
| 16bit flags物理影響 | h←Freshness, w←Hub, d←Authority/Ephemeral, ttl←Sticky/Volatile | ✅ 確定 |
| Gateway evaluate() | リスト蓄積 → return時バッチ反映 | ✅ 実装済 |

### 設計原則

1. **データは制限しない** - 系譜情報、参照関係は自由
2. **操作は制限する** - 評価回数、派生深度
3. **伝播は強制しない** - 場の形成は自然収束に委ねる
4. **軽量化を優先する** - 整数スケール、微小変化

### 保留事項

- エージェント信頼度

### 試算が必要な項目

| 項目 | 検討内容 | 依存関係 |
|------|---------|---------|
| 冷却期間 (ascensionCooldownMs) | N tick で何 h 減衰するか | tick 間隔、d 基準値 |
| 閾値 | h,w >= 1000 は妥当か | 評価頻度、減衰速度 |

**試算例**:
```
前提:
  tick 間隔: 1000ms (1秒)
  d 基準値: 1000
  modifier: 1.0 (フラグなし)
  H_COEF: 5, W_COEF: 2, D_COEF: 5

毎 tick 減衰: h -= 1000 * 1.0 / 1000 = 1

topTier 初期状態:
  h = 100 (baseHeat), w = 800 (tierWeight)
  h + w = 900 → あと 100 で Ascension 候補

最高評価 (h=10, w=10) の効果:
  h += 25, w += 10 → 合計 +35/評価

候補到達まで:
  (1000 - 900) / 35 ≈ 3回の最高評価

冷却期間 600秒 (10分) = 600 tick:
  h が 600 減少（減衰のみ）
  → 冷却期間中に h=100 → 十分なマージン必要
  → 候補になるには h ≈ 700+ を推奨
```

---

## 6. 評価経路の設計

### 設計原則: 蓄積 → バッチ反映

```
[核心]
リアルタイム ProjDB 反映は不要
セッション中は evaluate() リストを蓄積するだけ
return 時に一括で ProjDB 反映
```

### データフロー

```
セッション中:
  Gateway evaluate(nodeId, h, w, d)
    → SphereContext 内のリストに蓄積
    → ProjDB 書き込みなし

return 時:
  ExperienceCapsule
    ├── topTier[], normalNodes[], ghostNodes[]  → 受肉プロセス
    │                                              ↓
    │                                           Packer → NodeForge → ProjDB
    │
    └── evaluations[]  → 並列処理（受肉とは別経路）
                          ↓
                       Bookkeeper.applyEvaluations() → ProjDB
```

### 評価の格納先

| フェーズ | 格納先 | 備考 |
|---------|--------|------|
| セッション中 | SphereContext._sessionBuffer | リスト蓄積 |
| return 時 | ExperienceCapsule.evaluations[] | カプセルに含める |
| 処理後 | ProjDB | 直接反映（受肉不要）|

### スコア形式（統一済）

```typescript
interface NodeEvaluation {
  nodeId: string;
  h: number;  // 0-10, neutral=5
  w: number;  // 0-10, neutral=5
  d: number;  // 0-10, neutral=5
  context?: string;
}
```

### 🔶 要対応: Gateway evaluate() の更新

**目的**: リアルタイム ProjDB 書き込み → リスト蓄積に変更

```typescript
// 現状: 即時 ProjDB 書き込み
evaluate(nodeId, score) → SphereCoreAdapter.evaluate() → ProjDB

// 変更後: リスト蓄積のみ
evaluate(nodeId, h, w, d) → _sessionBuffer.evaluations.push() → (return 時に反映)
```

**変更対象ファイル**:
- `types/gateway.ts` - インターフェース (score → h, w, d)
- `membrane/membrane.ts` - 検証 (score → h, w, d)
- `gateway/gateway-server.ts` - ハンドラ
- `gateway/sphere-context.ts` - 蓄積ロジックに変更
- `gateway/sphere-core-adapter.ts` - evaluate() 削除または deprecated

---

## 7. 実装計画

（上記確定事項に基づき、順次実装予定）

---

## 8. 初期値設計とテスト方法

### 新規ノードの初期 heat（確定）

**設計原則**: ノードは「冷たく」生まれ、エージェントの評価で温まる

```
config.packer.baseHeat = 100  // 全ノード同一ベースライン
↓
エージェントが訪問・評価 (evaluate())
↓
heat が徐々に上昇
↓
h + w >= 1000 で Ascension 候補
```

**根拠**:
- エージェントは initialHeat を設定できない（廃止）
- 重要度は tier 選択で表明
- topTier + tierWeight(800) = 900 → 即座に候補にはならない
- 評価による有機的な成長が必要

### Tier Weight の意味

| Tier | Weight | 初期スコア (h + w) | 意味 |
|------|--------|-------------------|------|
| topTier | 800 | 100 + 800 = 900 | あと少しで候補 |
| normal | 500 | 100 + 500 = 600 | 評価必要 |
| ghost | 200 | 100 + 200 = 300 | 大きな成長必要 |

### Ascension 候補ドロップアウトのテスト方法

**目的**: 冷却期間中の減衰・脱落挙動を確認

**方法1: config.baseHeat を一時的に上げる**
```typescript
// config.ts を一時的に変更
packer: {
  baseHeat: 900,  // テスト用に高く設定
  ...
}
```

**方法2: tierWeights を調整して即座に候補になるようにする**
```typescript
packer: {
  baseHeat: 100,
  tierWeights: {
    top: 950,  // 100 + 950 = 1050 > 1000
    ...
  }
}
```

**方法3: evaluate() API でノードの heat を上げる**
```bash
# エージェントとして接続し、高評価を連続投入
# evaluate(nodeId, { h: 10, w: 10, d: 5 })
```

**観察ポイント**:
- Candidate 登録からドロップアウトまでの時間
- 下方スレッショルド（90%）による脱落
- ドロップアウト後のメトリクスリセット

### 将来の検討: 動的閾値

Sphere の成熟度に応じて Ascension 閾値を変化させる案:

```typescript
// 例：既存 Amber 数に応じて閾値上昇
const baseThreshold = 1000;
const amberCount = getAmberCount();
const dynamicThreshold = baseThreshold + (amberCount * 50);
```

- 若い Sphere: 琥珀になりやすい（開拓者を増やす）
- 成熟した Sphere: 競争激しく、選ばれし者だけ

**ステータス**: 検討中（現時点では固定閾値）

---

## 9. 代謝休止（Dormancy）

### 設計原則

「観察者のいない宇宙は時間が進まない」

エージェントが接続していない状態が続くと、ノードは代謝により消滅していく。
これを防ぐため、代謝を一時停止する「休止モード」を導入する。

### 休止条件

```
エージェント接続数 = 0
  ↓
N秒間継続
  ↓
代謝休止（Dormancy）発動
```

### 休止中の挙動

| 機能 | 休止中 | 備考 |
|------|--------|------|
| Tick（代謝サイクル） | ⏸ 停止 | TTL減衰なし |
| Forge（ノード生成） | ✅ 継続可能 | Observatory からの生成 |
| Pulse（統計収集） | ✅ 継続可能 | 監視は継続 |
| 評価反映 | ⏸ 停止 | エージェント不在 |

### 実装場所

**RenalCore** の `metabolize()` 内で判定：

```typescript
// RenalCore
private lastAgentActivity: number = Date.now();
private isDormant: boolean = false;
private readonly DORMANCY_THRESHOLD_MS = 60000; // 60秒

public updateAgentCount(count: number): void {
  if (count > 0) {
    this.lastAgentActivity = Date.now();
    this.isDormant = false;
  }
}

public metabolize(): void {
  // 休止判定
  const elapsed = Date.now() - this.lastAgentActivity;
  if (elapsed > this.DORMANCY_THRESHOLD_MS) {
    if (!this.isDormant) {
      console.log(`[RenalCore] Entering dormancy (no agents for ${elapsed}ms)`);
      this.isDormant = true;
    }
    return; // 代謝スキップ
  }

  // 通常の代謝処理...
}
```

### 休止からの復帰

```
エージェントが接続
  ↓
updateAgentCount(1+)
  ↓
isDormant = false
  ↓
次の Tick から代謝再開
```

**ステータス**: ✅ 実装済み

---

## 9. 16bit NodeFlag パターン辞書

> **詳細**: `reports/16BIT_FLAG_PATTERNS.md`
> **定義場所**: `services/periphery/src/tagger/tagger.ts`

### フラグ一覧

| Hex | Flag | 物理効果 | 設定元 |
|-----|------|----------|--------|
| 0x0001 | Authority | Decay ×0.95 | Tagger |
| 0x0002 | Freshness | Heat ×1.2 | Tagger / Packer |
| 0x0004 | Catalyst | Link形成促進 | Tagger |
| 0x0008 | Ephemeral | Decay ×1.5 | Tagger |
| 0x0010 | Sticky | TTL減衰 ×0.8 | Tagger |
| 0x0020 | Volatile | TTL減衰 ×1.3 | Tagger |
| 0x0040 | Hot | 動的表示 | Tagger / **Arbiter** |
| 0x0080 | Frozen | 代謝停止 | **Arbiter** |
| 0x0100 | Hub | 構造的重要性 | Tagger / **Arbiter** |
| 0x0200 | Isolated | 孤立ノード | **Arbiter** |
| 0x0400 | Spectral | 精製済み | Tagger |
| 0x0800 | Constellation | クラスタ所属 | Tagger |
| 0x1000 | UserMarked | ユーザー重要 | Tagger |
| 0x2000 | SystemCore | システム基盤 | Tagger |
| 0x4000 | Compressed | 圧縮済み | **Arbiter** |
| 0x8000 | Candidate | Ascension冷却中 | **Arbiter** |

### パターンキーワード（抜粋）

| Flag | キーワード例 |
|------|-------------|
| Authority | official, spec, documentation, research, paper, thesis, verified |
| Freshness | new, latest, breaking, update, 2024-2026, realtime, live |
| Catalyst | api, gateway, middleware, pipeline, interface, nexus |
| Ephemeral | draft, wip, experimental, prototype, beta, memo, note |
| Sticky | important, critical, essential, fundamental, stable, legacy |
| Volatile | unstable, changing, mutable, dynamic, flux, evolving |
| Hot | trending, viral, alert, emergency, hype, debate |
| Hub | overview, summary, guide, tutorial, index, handbook |
| Spectral | curated, best, recommended, elite, premium, insight |
| Constellation | cluster, group, bundle, package, suite, series |
| UserMarked | favorite, bookmark, starred, pinned, saved |
| SystemCore | system, config, kernel, infrastructure, framework, schema |

### フラグ合成フロー

```
NodeSeed.flags (agent指定)
     ↓
[Tagger] TAG_FLAG_PATTERNS マッチ → classificationFlags
     ↓
[Packer] tierFlags 合成
     ↓
flg = seedFlags | classificationFlags | tierFlags
     ↓
[Arbiter] 動的フラグ追加 (Hot, Hub, Isolated, etc.)
```

### 統一設定場所

`services/periphery/src/types/config.ts` の `nodeFlags` セクション

```typescript
nodeFlags: {
  tierFlags: { top: 0x0002, normal: 0x0000, ghost: 0x0000 },
  dynamicThresholds: {
    hotHeatThreshold: 80,       // heat > 80 → Hot
    hubLinkThreshold: 5,        // links > 5 → Hub
    isolatedLinkThreshold: 0,   // links == 0 → Isolated
  },
},
```

**ステータス**: ✅ 実装済み

---

作成日: 2025-02-03
更新日: 2026-02-03 (d=TTL減衰速度、Ascension=h+w、整数スケール統一、初期値設計追加、代謝休止実装、16bitフラグパターン辞書追加)
ステータス: **全項目実装完了**

### 実装済み項目
- 操作耐性（1ノード1評価）
- 新規ノード分離（デフォルトmetricsからスタート）
- 派生深度制限（MAX_DERIVATION_DEPTH=2）
- 自然収束モデル（明示的伝播なし）
- タグ評価（tags→Tagger→16bit flags）
- 書き換え権限（Arbiter判定→Bookkeeper実行）
- metrics整数スケール（h,w閾値1000、d基準1000）
- 評価2層構造（Agent 0-10 → 係数調整）
- **d = TTL減衰速度制御**（d高→早死、d低→長命）
- **Ascension = h + w のみ**（d は関与しない）
- Gateway evaluate()（リスト蓄積→return時バッチ反映）
- Ascension冷却期間（評価凍結+h+wスコア+下方スレッショルド+脱落リセット）
- **代謝休止（Dormancy）**（RenalCore 実装、エージェント不在60秒で休止）
- **評価係数調整**（h:5, w:2, d:5 - 中規模プロジェクト向け）
- **16bitフラグパターン辞書**（12パターン、統一config参照）