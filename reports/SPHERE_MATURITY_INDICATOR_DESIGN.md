# Sphere Maturity Indicator — パラメータ地獄からの脱出

**Date**: 2026-02-20
**Status**: Design (構想段階)
**Context**: Allostatic Ascension Threshold 実装時に浮上した設計課題

---

## 問題

スフィアの「成熟度」に依存するパラメータが各サブシステムに散在している。
機能が増えるたびに referenceNodeCount 的なパラメータが増殖し、整合性の維持が困難になる。

### 現状のパラメータ群

| サブシステム | パラメータ | 依存先 | 本質 |
|-------------|-----------|--------|------|
| Arbiter ascension | referenceNodeCount | activeNodes | スフィア規模 |
| Sanctification Hard | INITIAL_TARGET, ESCALATION | amber count | 目標 amber 数 |
| Sanctification Soft | MIN_POPULATION (30) | total nodes | 最低規模 |
| Sanctification Meta | METABOLIC_EMA_ALPHA | churn rate | 活性の学習率 |
| decay preset | archive/natural/flow | 手動 or allostatic | 代謝速度 |

全て「スフィアがどれだけ成熟しているか」の異なる断面。

---

## 提案: maturity ∈ [0, 1]

### 導出元

Sanctification の **Soft Neuron** は既に `vitality` (0-1) を内部計算している:

```
vitality = activeHealth × 0.45 + relicHealth × 0.25 + populationHealth × 0.30
```

これは事実上の maturity indicator だが、Sanctification Neuron の内部に閉じている。

### 公開 API

```typescript
// SanctificationNeuron (or dedicated SphereState module)
get maturity(): number {
  return this.soft.health;  // 0-1, already computed every observation
}
```

### 各サブシステムの応答関数

maturity を入力として、各サブシステムが独自の応答関数を持つ:

```
effectiveAscensionThreshold = baseThreshold × f(maturity)
decayPreset = g(maturity)
windowSize = h(maturity)
```

パラメータは「入力値の referenceNodeCount」ではなく「応答関数 f() の係数」になる。

#### 例: Allostatic Threshold

```
// Before (暫定): referenceNodeCount + sqrt scaling
effectiveThreshold = scoreThreshold × sqrt(activeNodes / referenceNodeCount)

// After (maturity統合):
effectiveThreshold = scoreThreshold × (maturityFloor + (1 - maturityFloor) × maturity)
// maturity=0.2 (young) → threshold ≈ base × 0.36
// maturity=1.0 (mature) → threshold = base × 1.0
```

referenceNodeCount が消える。maturity 一本で閾値が決まる。

---

## スフィアの規模感 (設計前提)

| 規模 | ノード数 | 特徴 |
|------|---------|------|
| 極小 | ~100 | 試験・プロトタイプ。amber 容易であるべき |
| 小規模 | ~1,000 | 閾値が baseline に到達。効果が出始める |
| 中規模 | ~10,000 | 閾値が上昇。amber は選ばれたノードのみ |
| 大規模 | ~100,000+ | 上限キャップ。amber は希少 |

現行の sqrt scaling (ref=1000) はこの感覚に合わせた暫定実装。
maturity 統合時にはこの規模感を vitality の数値レンジにマッピングする。

---

## 実装ロードマップ

### Phase 0 (現在)
- [x] Allostatic threshold: sqrt scaling + referenceNodeCount=1000
- 暫定だが機能する

### Phase 1 (次)
- [ ] Soft.vitality を SanctificationNeuron から公開 (getter)
- [ ] /sanctification API に maturity フィールド追加
- [ ] Arbiter が maturity を参照するオプション追加

### Phase 2 (将来)
- [ ] decay preset の allostatic 切替を maturity ベースに統合
- [ ] Packer の初期パラメータ (baseHeat 等) を maturity で調整
- [ ] sphere.config.json から referenceNodeCount 系パラメータを段階的に廃止

---

## 注意点

- vitality は観測窓 (windowSize=30, ~5分) の移動平均。瞬時値ではない。
- スフィア起動直後は vitality=0 (バッファ未充填)。floor が必要。
- Festival 期間中は vitality がリセットされる。この期間の maturity をどう扱うか。
- maturity が全システムに伝播するため、Soft Neuron のバグが全体に影響するリスク。

---

## References

- `arbiter.ts` — Allostatic Ascension Threshold (現行実装)
- `sanctification-neuron.ts` — Soft Neuron vitality 計算
- `SPHERE_ECOSYSTEM_DESIGN.md` — 全体アーキテクチャ
