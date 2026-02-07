# Move と磁場の設計メモ

**作成日**: 2026-02-06

---

## 概要

エージェントの `move()` に磁場（GlobalField）の影響を組み込む設計。
エージェントの「意志（mode）」と「環境の流れ（磁場）」の相互作用を表現。

---

## 最終設計

### 計算式

```
direction = modeDirection × (1 - fieldWeight) + globalField × fieldWeight
            ↑ エージェントの意志            ↑ 環境の流れ（ズレ）
```

### Mode 一覧

| mode | 重み計算 | fieldWeight | エージェントの性格 |
|------|----------|-------------|-------------------|
| **flow** | GlobalField | 1.0 | 従順（流れに身を任せる）|
| **hot** | h | 0.5 | 活発（熱いものに惹かれる）|
| **fresh** | h × (d/1000) | 0.5 | 好奇心（新鮮で揮発性の高いものを追う）|
| **deep** | w × (1-d/1000) | 0.5 | 慎重（安定したものを好む）|
| **explore** | 1/(w+1) | 0.3 | 開拓者（未知を探し、流れに逆らう）|
| **random** | ランダム | 0.0 | 気まぐれ（磁場無視）|

### パラメータ

- **step**: 移動距離（0.0-1.0）
- **mode**: どのメトリクスを重視するか
- **fieldWeight**: 磁場の影響度（mode によって決まる）

---

## 議論の経緯

### 1. 初期の誤解

最初は「mode によって磁場の影響度が変わる」という設計で、勾配方向と磁場方向を別々に計算して blend していた。

### 2. ユーザーの指摘

- 全ての mode で磁場の影響を受ける
- mode は「磁場のどの成分に引かれるか」を決める
- 「移動のズレを磁場の影響として残したい」

### 3. 最終理解

- **modeDirection**: エージェントの意志（visible nodes から計算）
- **globalField**: 環境の流れ（全体の centroid）
- **blend**: 意志と流れの相互作用

エージェントは mode を選ぶことで「自分の性格」を表現し、磁場の影響で「思ったところと違う方向に流される」体験ができる。

---

## explore の再設計

### 変更前
```typescript
weight = info.distance;  // 遠いものを好む
```

### 変更後
```typescript
weight = 1 / (info.weight + 1);  // 未知・未判定を好む
```

**理由**: 距離は `step` で制御するもの。explore は「未知を探索する開拓者」という性格を表す。

---

## 16bit flags の閾値方式

### 問題
単純な論理和（OR）だとノードが多いと全ビットが ON になる。

### 解決策
30%+ 閾値方式: 各ビットが 30% 以上のノードで立っていれば採用。

```typescript
const threshold = nodes.length * 0.3;
for (let bit = 0; bit < 16; bit++) {
  if (flagCounts[bit] >= threshold) {
    dominantFlags |= (1 << bit);
  }
}
```

Global と Local 両方に適用。

---

## 完了した作業

### ✅ decay を NearbyNode に追加 (2026-02-06)

fresh/deep の計算式を正確にするため、以下を実装完了:

```typescript
// 実装済み
fresh: weight = info.heat * (info.decay / 1000);      // h × d (d は 0-2000)
deep:  weight = info.weight * Math.max(0, 1 - info.decay / 1000);  // w × (1-d/1000)
```

### 変更箇所
1. ✅ `NearbyNode` に `decay` フィールド追加 (gateway.ts)
2. ✅ `sphere-core-adapter.ts` の `sense()` で `decay` を返す
3. ✅ `VisibleNodeInfo` に `decay` 追加 (sphere-context.ts)
4. ✅ `calculateFieldDirection()` の計算式を更新

---

## 関連ファイル

- [sphere-context.ts](./sphere-context.ts) - move(), calculateFieldDirection(), blendDirections()
- [global-field-layer.ts](../field/global-field-layer.ts) - GlobalField 計算
- [types.ts](../field/types.ts) - GlobalAmbientField, LocalField, FieldInfo
- [gateway.ts](../types/gateway.ts) - WalkMode, NearbyNode

---

## 設計の美学

> 自然とエージェントが磁場と自身の性格を意識できるような配慮

- エージェントは `getField()` で磁場を確認できる
- mode 選択が「自分の性格」の表現になる
- 磁場との blend が「環境との相互作用」を生む
- 流れに乗るか、逆らうか、その選択自体がエージェントの個性

---

*2026-02-06 作成*
