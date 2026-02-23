# Tuning Ledger — 調整係数台帳 (2026-02-20)

全調整パラメータの現在値・根拠・変更履歴を一箇所にまとめる。
「何をなぜ変えたか」が追えなくなることを防ぐ。

---

## 1. Decay (代謝速度)

**場所**: `sphere.config.json` → `renal_core.decay`
**適用**: `services/periphery/src/index.ts` (初期組立 + auto-mode switch の2箇所)

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `preset` | `"archive"` | 基本プリセット (heat半減期 ~2h) |
| `decayIntensity` | **0.5** | プリセット値への全局乗数。1.0=等倍, 0.5=半減 |

### 実効値 (archive × 0.5)

| 係数 | プリセット値 | × intensity | 実効値 | 半減期 |
|------|------------|-------------|--------|--------|
| alpha (TTL線形) | 1.0 | × 0.5 | 0.5 | — |
| heatDecayFactor | 0.0001 | × 0.5 | 0.00005 | ~4時間 |
| weightDecayFactor | 0.00005 | × 0.5 | 0.000025 | ~8時間 |
| fluxDecayRate | 0.0002 | × 0.5 | 0.0001 | ~2時間 |
| minLoadFactor | 0.05 | **適用外** | 0.05 | — |

**変更理由**: 間欠運用（エージェント不在時間が長い）で eval gain が decay に負ける問題。
半減にすることで heat 半減期を ~2h → ~4h に延伸。

**注意**: `minLoadFactor` は負荷閾値であり減衰速度ではないため intensity を適用しない。

---

## 2. Ascension (琥珀化閾値)

**場所**: `sphere.config.json` → `periphery.arbiter.ascension`
**適用**: `services/periphery/src/arbiter/arbiter.ts` observe()

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `scoreThreshold` | 1100 | 基本閾値 (h + w) |
| `referenceNodeCount` | 1000 | allostatic 基準ノード数 |
| `thresholdFloor` | **0.8** | 最小 ratio (← 0.6 から変更) |
| `thresholdCap` | 3.0 | 最大 ratio |
| `cooldownMs` | 300000 | 候補→琥珀 冷却期間 (5分) |
| `lowerThresholdRatio` | 0.85 | cooldown 中の下限 (initialScore × 0.85) |

### Allostatic 公式

```
ratio = clamp(sqrt(activeNodes / referenceNodeCount), floor, cap)
effectiveThreshold = scoreThreshold × ratio
```

### 現状の sphere (20 active nodes) での実効値

```
sqrt(20 / 1000) = 0.141 → clamp(0.141, 0.8, 3.0) = 0.8
effectiveThreshold = 1100 × 0.8 = 880
```

| ノード種別 | 初期 score (h+w) | 880 との差 | 必要 eval 回数 (概算) |
|-----------|-----------------|-----------|---------------------|
| top-tier | 800 | +80 必要 | 2-3 回 |
| normal | 600 | +280 必要 | 8-10 回 |

**変更履歴**:
- floor=0.6 → **0.8** (2026-02-20): top-tier が投入直後に即 candidate になる問題。
  880 にすることで最低 2-3 eval が必要。

**cooldown 中の dropout 条件**:
- `lowerThreshold = initialScore × 0.85`
- 例: score=880 で登録 → lowerThreshold=748。5分間で h が 132 以上 decay すれば dropout。
- archive×0.5 での heat decay: 5min (300tick) で h×(1-0.00005)^300 ≈ h×0.985 → 約1.5% decay。
  h=500 なら ~7.5 decay。**dropout しにくい** → cooldown は形式フィルタに近い。

---

## 3. Soft Neuron (聖域化ソフト判定)

**場所**: `services/periphery/src/sanctification/sanctification-neuron.ts` SoftNeuron class

### Vitality 構成

| 成分 | 重み | 計算 | 目的 |
|------|------|------|------|
| activeHealth | 0.45 | `1 - abs(livingRatio - 0.5) × 2` | 生存比率 40-60% がピーク |
| **flexibilityHealth** | 0.25 | `active / (active + amber)` | 剛性検知（琥珀蓄積防御） |
| populationHealth | 0.30 | `min(1, totalNodes / 15)` | 最低人口要件 |

**変更履歴**:
- `relicHealth` → **`flexibilityHealth`** (2026-02-20):
  relic count は初期固定値（不変）→ 情報量ゼロの定数バイアスだった。
  代わりに active/(active+amber) を導入し、物量攻撃（琥珀蓄積）への防御力を獲得。

### 現状の値 (amber=0, 20 active, 10 relic)

```
livingRatio = 20/30 = 0.667 → activeHealth = 1 - |0.667 - 0.5| × 2 = 0.667
flexibilityHealth = 20/20 = 1.0 (amber=0)
populationHealth = 30/15 = 1.0 (capped)
vitality = 0.667×0.45 + 1.0×0.25 + 1.0×0.30 = 0.850
```

API 観測値: health ≈ 0.84 (EMA 平均による遅延あり)

---

## 4. 初期ノードメトリクス (Packer)

**場所**: `sphere.config.json` → `periphery.packer`

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| baseHeat | 500 | 全ノード共通の基礎 h |
| tierWeights.top | 300 | top-tier の w |
| tierWeights.normal | 100 | normal の w |
| tierTTLs.top | 172800 | top TTL (48h) |
| tierTTLs.normal | 86400 | normal TTL (24h) |
| standardDecayCoefficient | 1000 | 初期 d 値 (減衰率ではない) |

**注意**: `standardDecayCoefficient` (d=1000) は名前に反して**減衰速度には無関係**。
ノードの初期 `metrics.d` 値として設定されるだけ。実際の減衰は decay preset が支配。

---

## 5. Dropout Reset (候補脱落時ペナルティ)

**場所**: `sphere.config.json` → `periphery.arbiter.ascension.dropoutReset`

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| h | 400 | cooldown 失敗時に h をリセット |
| w | 500 | cooldown 失敗時に w をリセット |
| d | 1000 | cooldown 失敗時に d をリセット |

---

## 6. 未変更だが注意すべきパラメータ

| パラメータ | 値 | 場所 | 備考 |
|-----------|-----|------|------|
| `metabolicAutoMode` | false | sanctification | false=固定preset。true=Hard基準で自動切替 |
| `dormancyThresholdMs` | 60000 | renal_core.dormancy | agent 0 で 60s 後に代謝休止 |
| `fossilHeat` | 0.5 | thresholds | fossil 化閾値 (h < 0.5) |
| `erosionHeat` | 100 | thresholds | amber→active 復帰閾値 |
| `amberHeat` / `amberWeight` | 1000 / 1000 | thresholds | Packer/Pulse 参照用 |

---

## 7. 係数間の依存関係

```
decayIntensity ──→ heat/weight の減衰速度
                      ↓
               eval gain vs decay のバランス
                      ↓
            effectiveThreshold (ascension floor) に到達可能か
                      ↓
               amber 蓄積速度
                      ↓
            flexibilityHealth (Soft neuron) の反応
```

**要注意**: decayIntensity を変えると ascension の難易度が連動して変わる。
両方同時に変えるときは effectiveThreshold と初期 score の差分を確認すること。

---

## 8. sense() heatFactor (2026-02-23)

**場所**: `services/periphery/src/gateway/sphere-core-adapter.ts` sense() 内

**現行**: **廃止済み** — heatFactor ロジックを完全削除。sense() は `perceptionRadius` のみで判定。

**変更履歴**:
- `h/1000, floor=0.5` → `h/500, floor=0.5` (02-23): 実ノード h=200-400 で全て floor に張り付く問題
- `h/500, floor=0.5` → `floor=1.0, ボーナス専用` (02-23): sense 基本範囲をペナルティなしに変更
- `floor=1.0, ボーナス専用` → **削除** (02-23): modeWeights 実装により検知補正はエージェント側に移管完了

**設計判断**: ヒートによる検知しやすさはエージェント側の関心事（種族特性・Weapon 補正）であり、
スフィアの物理法則として sense() にハードコードすべきでない。
Sphere は均一な知覚範囲を提供し、エージェントが moveMode (hot/deep/explore) で
どの方向に注意を向けるかを選択する。
