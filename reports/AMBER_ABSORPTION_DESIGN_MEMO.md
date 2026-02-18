# 琥珀化における「巻き込み」設計メモ

**作成日**: 2026-02-03
**ステータス**: 設計確定 - 実装待ち

---

## 1. 設計概要

### タイミング

```
Candidate 登録 → 冷却期間 → 成功判定
                              ↓
                    ★ 結晶化処理 ★
                              ↓
                    Amber 昇格 + Frozen
```

### 本質的定義

```
琥珀 = 結論 + 優れた意見群（賛成/反対問わず）
     = 本体（summary, tags, vector）
     + absorbed（スコア上位の関連ノード + 賛成度指標）
```

**注意**: 「熱を吸収」は**比喩**。実体は「優れたソースと意見を集約した情報構造」。

---

## 2. 確定事項

| 項目 | 決定 |
|------|------|
| タイミング | 冷却期間成功後（事前プールなし） |
| 近傍の定義 | **Vector 距離**（cosine distance） |
| 削除対象 | active + ghost |
| 選出対象 | **active のみ**（ghost は削除のみ） |
| 選出基準 | **h + w スコア上位**（琥珀化と同じロジック） |
| 賛成度指標 | **supportRatio = h / (h + d)**（0-1） |
| metrics 継承 | **選出上位ノードの平均 h, w × 0.1 を琥珀に加算** |
| d の継承 | **しない**（Frozen で意味なし） |
| 吸収後の処理 | **ProjDB から削除**（RefDB には残る） |
| 原則 | **反対意見でも優れていれば高スコア** |
| 実装箇所 | Arbiter.checkCandidates() 内 |

---

## 3. 選出と継承のロジック

### 選出と指標の分離

| 要素 | 計算式 | 意味 |
|------|--------|------|
| **選出基準** | `h + w` | 優れた意見かどうか（品質） |
| **supportRatio** | `h / (h + d)` | 賛成寄りか反対寄りか（態度） |

### 処理対象

| 対象 | 選出 | 平均算出 | 削除 |
|------|------|----------|------|
| **active** | ✅ | ✅（上位のみ）| ✅ |
| **ghost** | ❌ | ❌ | ✅ |

### 例

| ノード | h | w | d | スコア | supportRatio | 解釈 |
|--------|---|---|---|--------|--------------|------|
| A | 800 | 400 | 200 | 1200 | 0.80 | 優れた賛成意見 |
| B | 700 | 500 | 700 | 1200 | 0.50 | 優れた中立/議論的意見 |
| C | 600 | 400 | 1200 | 1000 | 0.33 | 優れた反対意見 |
| D | 200 | 100 | 800 | 300 | 0.20 | 低品質（選出されない）|

---

## 4. データ構造

### CrystallizationRecord

```typescript
interface CrystallizationRecord {
  id: string;
  score: number;        // h + w（選出基準）
  supportRatio: number; // h / (h + d)（0-1）
}
```

### CrystallizationData

```typescript
interface CrystallizationData {
  absorbed: CrystallizationRecord[];  // 統一選出（スコア上位）
  totalCount: number;                  // 吸収したノード総数
  totalHeat: number;                   // 吸収した熱量総計（ログ用）
}
```

### AmberRecord 拡張

```typescript
interface AmberRecord {
  // ... 既存フィールド ...

  // L3: 議論の結晶履歴
  crystallization?: {
    absorbed: CrystallizationRecord[];
    totalCount: number;
    totalHeat: number;
  };
}
```

---

## 5. 実装設計

### absorbAndCrystallize()

```typescript
/**
 * 昇天確定時に近傍ノードを吸収・削除
 *
 * [Design] 冷却期間成功後に実行
 *   - 近傍 = vector 距離が absorptionRadius 以内
 *   - 削除対象 = active, ghost（amber, link は除外）
 *   - 選出対象 = active のみ（ghost は削除のみ）
 *   - 選出 = h + w スコア上位（琥珀化と同じロジック）
 *   - 継承 = 選出上位ノードの平均 h, w × factor を琥珀に加算
 *   - 吸収後は ProjDB から削除（RefDB には残る）
 *
 * [Principle] 反対意見でも優れていれば高スコア
 */
private absorbAndCrystallize(
  node: SphereNode,
  projDB: Map<string, SphereNode>
): CrystallizationData | null {
  if (!this.config.absorptionEnabled) return null;

  const activeNodes: SphereNode[] = [];  // 選出対象
  const ghostNodes: SphereNode[] = [];   // 削除のみ

  // 1. 近傍ノード収集
  for (const other of projDB.values()) {
    if (other.id === node.id) continue;

    const distance = cosineDistance(node.vector, other.vector);
    if (distance > this.config.absorptionRadius) continue;

    if (other.kind === "active") {
      activeNodes.push(other);
    } else if (other.kind === "ghost") {
      ghostNodes.push(other);
    }
  }

  const allNearby = [...activeNodes, ...ghostNodes];
  if (allNearby.length === 0) return null;

  // 2. スコア上位を選出（active のみ）+ supportRatio 算出
  const topNodes = activeNodes
    .map(n => ({
      node: n,
      score: n.metrics.h + n.metrics.w,
      supportRatio: n.metrics.h / (n.metrics.h + n.metrics.d || 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, this.config.maxAbsorbedNodes);

  // 3. 結晶化レコード生成
  const absorbed = topNodes.map(t => ({
    id: t.node.id,
    score: t.score,
    supportRatio: t.supportRatio,
  }));

  // 4. 選出上位ノードのみから平均算出 → 琥珀に継承
  if (topNodes.length > 0) {
    const avgH = topNodes.reduce((sum, t) => sum + t.node.metrics.h, 0) / topNodes.length;
    const avgW = topNodes.reduce((sum, t) => sum + t.node.metrics.w, 0) / topNodes.length;
    const factor = this.config.absorptionFactor ?? 0.1;
    node.metrics.h += avgH * factor;
    node.metrics.w += avgW * factor;
    // d は継承しない（Frozen で意味なし）
  }

  // 5. 吸収元ノードを削除（ProjDB のみ）
  for (const n of allNearby) {
    projDB.delete(n.id);
  }

  const totalHeat = allNearby.reduce((sum, n) => sum + n.metrics.h, 0);

  console.log(
    `[Arbiter] crystallization: active=${activeNodes.length} ghost=${ghostNodes.length} ` +
    `selected=${absorbed.length} heat=${totalHeat.toFixed(2)}`
  );

  return {
    absorbed,
    totalCount: allNearby.length,
    totalHeat,
  };
}
```

### checkCandidates() への統合

```typescript
// 冷却期間完了チェック
const elapsed = now - entry.candidateSince;
if (elapsed >= this.config.ascensionCooldownMs) {
  // ★ 結晶化処理（成功確定後）★
  const crystallization = this.absorbAndCrystallize(node, projDB);

  // 以降は既存処理...
  queue.flagUpdates.push({
    node,
    add: 0,
    remove: NodeFlag.Candidate,
  });
  queue.shouldAscend.push(node);
  toRemove.push(nodeId);
}
```

---

## 6. 設定

### sphere.config.json

```json
"ascension": {
  "cooldownMs": 600000,
  "scoreThreshold": 1000,
  "lowerThresholdRatio": 0.9,
  "dropoutReset": { "h": 0, "w": 500, "d": 1000 },

  "_comment_absorption": "Crystallization on successful ascension",
  "absorptionEnabled": true,
  "absorptionRadius": 0.3,
  "absorptionFactor": 0.1,
  "maxAbsorbedNodes": 5
}
```

### パラメータ説明

| パラメータ | 型 | 説明 | 推奨値 |
|-----------|-----|------|--------|
| `absorptionEnabled` | boolean | 結晶化機能の有効/無効 | true |
| `absorptionRadius` | number | 近傍判定の cosine distance 閾値 | 0.3 |
| `absorptionFactor` | number | metrics 継承係数（選出上位の平均 × この値） | 0.1 |
| `maxAbsorbedNodes` | number | 結晶化レコードの最大保存数 | 5 |

---

## 7. 実装計画

1. **ArbiterConfig に設定追加**
   - absorptionEnabled, absorptionRadius, absorptionFactor, maxAbsorbedNodes

2. **cosineDistance 関数**（既存を利用 or 追加）

3. **absorbAndCrystallize() 実装**

4. **checkCandidates() 修正**
   - 昇天確定後に absorbAndCrystallize() 呼び出し

5. **AmberRecord 型拡張**
   - crystallization フィールド追加

6. **sphere.config.json 更新**

---

## 8. 設計原則との整合

| 原則 | 整合性 |
|------|--------|
| payload を読まない | ✅ ID と metrics のみ |
| 物理法則の執行 | ✅ 近傍検索 + metrics 計算 |
| 意味論的判断禁止 | ✅ vector 距離のみで判定 |

---

## 9. 実装完了サマリ

### 実装ファイル

| ファイル | 変更内容 |
|----------|----------|
| `renalCore/src/core/types.ts` | CrystallizationRecord, CrystallizationData 型追加、ReferenceRecord.payload.crystallization 追加 |
| `periphery/src/arbiter/arbiter.ts` | ArbiterConfig に absorption 設定追加、absorbAndCrystallize() 実装、TransitionQueue.crystallizations 追加 |
| `periphery/src/bookkeeper/bookkeeper.ts` | applyTransitions() で吸収ノード削除、recordAscensions() で crystallization データ保存 |
| `periphery/src/repository/interfaces.ts` | IReferenceRepository.delete(), markAsAmber() に crystallization パラメータ追加 |
| `periphery/src/repository/map-reference.repository.ts` | delete(), markAsAmber() 実装更新 |
| `periphery/src/index.ts` | config loader に absorption 設定追加 |
| `sphere.config.json` | ascension.absorption セクション追加 |

### データフロー

```
Arbiter.monitorCandidates()
    ↓ 冷却期間完了
absorbAndCrystallize(node, projDB)
    ├─ 近傍ノード収集（cosineDistance ≤ radius）
    ├─ active: h+w スコア上位を選出 → absorbed[]
    ├─ ghost: 削除のみ
    └─ 琥珀に metrics 継承（avg(h,w) × factor）
    ↓
TransitionQueue.crystallizations.set(nodeId, result)
    ↓
Bookkeeper.applyTransitions()
    ├─ ProjDB.delete(absorbedNodeIds)
    ├─ RefDB.delete(absorbedNodeIds)
    └─ RefDB.markAsAmber(nodeId, snapshot, crystallization)
```

---

作成日: 2026-02-03
更新日: 2026-02-03
ステータス: **実装完了**
