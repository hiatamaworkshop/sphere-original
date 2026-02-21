# 磁場モデル実装メモ

**作成日**: 2026-02-06
**ステータス**: 次セッションで実装予定

---

## 概要

GlobalAmbientField（全体磁場レイヤー）の実装。
ノード全体のメトリクスの統計的分布から算出される「気候」。

---

## 確定事項

### 1. 実装場所
- **Periphery 内** で完結（Observatory 外部化しない）
- Singleton パターンで共有

### 2. 更新トリガー
- **tick ベース**（Arbiter と同様の n tick 毎）
- スフィア全体の傾向を見るだけなので低頻度で十分

### 3. 2層構造（グラデーション設計）

| メソッド | 磁場 | 用途 |
|----------|------|------|
| scanL1() | Global Field | 全体の気候（広範囲スキャン時） |
| sense() | Local Field | 局所の気圧（近傍ノードから計算） |

**設計意図**: scan → sense のグラデーションで価値を出す

### 4. 琥珀の heat = 0（重要）
- **琥珀は冷えた状態**であるべき
- 現在の実装は琥珀化時に heat を足している → **要修正**
- 理由: 琥珀の heat が高いと Active ノードの活性が見えなくなる
- 琥珀は weight（重力）中心、Active は heat（熱量）中心

### 5. 空の Sphere
- **ゼロベクトル**を返す
- ノードがメトリクスベースで磁場を発生させる設計

### 6. サンプリング対象
- **kind による除外なし**（全ノード対象）
- Ghost/Fossil はメトリクスが低いので影響小
- 琥珀化の調整が適切になれば問題なし
- Environment ノードは未実装として無視

### 3. データ構造

```typescript
interface GlobalAmbientField {
  updatedAt: number;        // 最終更新時刻
  vector: number[];         // 384次元の「平均的な風向き」
  intensity: number;        // 磁場の強さ（0..1）
  volatility: number;       // 空間の入れ替わり速度（Decayの逆数）
  dominantFlags: number;    // 16bitフラグの論理和
}
```

### 4. 計算式

**Strength（各ノード）:**
```
strength = sigmoid(h + w) * (1 - d)
```

**Direction（エージェント視点）:**
```
direction = normalize(nodeVec - agentVec)
```

**サンプリング数:**
```
N = targetLoad / (agentCount × 384)
```
- エージェント増加 → 1体あたりの観測密度低下
- 全体の計算負荷は一定

### 5. Harvesting（抽出）

サンプルされた N 個のノードから:
- **Direction**: N 個のノード位置ベクトルの重心
- **Strength**: 各ノードの strength の平均
- **Flags**: 各ノードの 16bit flags を Bitwise OR

### 6. 合成比率

```typescript
const field =
  localField.scale(0.7)      // 局所の影響
  .add(globalField.scale(0.1))  // 全体の気候
  .add(agent.chaos.scale(0.2)); // 自身の状態
```

---

## 禁止事項

- ❌ 空間グリッド分割
- ❌ 永続化（揮発性データのみ）
- ❌ 気候図的なグラデーション

---

## 後回し（メモのみ）

### Agent Move と磁場の関係

**move(step, mode) の設計:**
- mode によって磁場への感受性が変わる
- 体力低下 → 磁場の影響増大（流れに身を任せる）

```typescript
type MoveMode = "explore" | "flow" | "warp";

move(step: number, mode: MoveMode): void {
  // mode による基本比率
  const baseRatio = MODE_RATIOS[mode];

  // 体力による調整: 疲労 → 磁場の影響増大
  const fatigueFactor = 1 - (this.energy / this.maxEnergy);
  const adjustedFieldWeight = baseRatio.field + fatigueFactor * 0.3;

  const direction =
    localField.scale(adjustedFieldWeight * 0.7)
    .add(globalField.scale(adjustedFieldWeight * 0.1))
    .add(chaos.scale(1 - adjustedFieldWeight));

  this.position += normalize(direction) * step;
}
```

**MoveMode 一覧:**
| mode | field比率 | chaos比率 | 用途 |
|------|-----------|-----------|------|
| `explore` | 0.3 | 0.7 | 自律探索（意志優位） |
| `flow` | 0.7 | 0.3 | 流れに乗る（磁場優位） |
| `warp` | 0.0 | 0.0 | リンク経由ジャンプ（磁場無視） |

**物理的解釈:**
```
残り体力 高 → 自分の意志で泳ぐ（chaos 優位）
残り体力 低 → 流れに身を任せる（field 優位）
```

### Agent Chaos（内部状態）

エージェントの行動によって体力が可変 → 行動原理（性格）が変わる。

```typescript
agent = {
  energy,       // 残り体力
  curiosity,    // 好奇心
  saturation,   // 満足度
  momentum,     // 慣性（直前の行動方向）
  chaosSeed     // ランダム種
}

chaos =
  randomNoise * saturation +
  momentum * 0.3 +
  fatigueVector;
```

**設計思想**: エージェントの行動が内面を表現し、それが次の行動のバイアスとして影響する。

### CleanerFish 接続

磁場の `intensity` → CleanerFish の `fieldIntensity` として渡す。
- intensity 高 → 「夏」 → CleanerFish 活発化
- intensity 低 → 「冬」 → CleanerFish 休眠

---

## 実装ステップ

### Phase 0: 琥珀 heat 修正（前提作業）
琥珀化時に heat を足す現在の実装を修正:
- 琥珀化時: `h = 0` に固定（冷却）
- weight のみ統合

```typescript
// 修正前（現在）
amber.metrics.h = child1.h + child2.h;  // ❌ 熱を足している

// 修正後
amber.metrics.h = 0;  // ✅ 琥珀は冷えている
amber.metrics.w = child1.w + child2.w;  // weight のみ統合
```

### Phase 1: GlobalFieldLayer クラス作成
```
periphery/src/field/global-field-layer.ts
```

```typescript
class GlobalFieldLayer {
  private currentField: GlobalAmbientField;

  // バックグラウンド更新
  update(projDB: ProjectionRepository): void;

  // エージェントが参照（DBアクセスなし）
  getGlobalField(): GlobalAmbientField;
}
```

### Phase 2: Local Field 計算（sense用）
```typescript
// sense() でヒットしたノードから計算
function computeLocalField(
  agentPosition: number[],
  nearbyNodes: SphereNode[]
): LocalField;
```

**グラデーション設計**:
- `scanL1()`: Global Field を返す（広範囲・荒い）
- `sense()`: Local Field を返す（局所・詳細）

### Phase 3: SphereContext 統合

```typescript
// ctx.getField() で磁場取得
interface FieldInfo {
  global: GlobalAmbientField;
  local?: LocalField;  // scanL1後のみ
}
```

### Phase 4: CleanerFish 接続（後日）

---

## 関連ファイル

- [cleaner-fish.md](../services/periphery/src/cleaner-fish/cleaner-fish.md) - 磁場接続の設計
- [議論まとめ.txt](../../docs/議論まとめ.txt) - 磁場モデルの議論ログ

---

## 設計の美学

1. **計算の分離**: エージェント数とノード数が計算負荷から切り離される
2. **ノード汚染の防止**: 磁場は揮発性データ、DB に書き込まない
3. **知能の演出**: エージェントは「なんとなく熱い方へ」流れるだけで、高度な意思決定に見える

---

*次セッションで Phase 1 から開始*
