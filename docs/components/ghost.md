# Ghost Node - 失敗の痕跡システム

**最終更新**: 2026-01-30
**重要度**: 高（スフィアの本質的機能）

---

## 🎯 重要な前提

> **Ghost Node は風化のプロセスではなく、受肉のプロセスで生成される**

Ghost は RenalCore の代謝で生まれるものではありません。
**エージェントが帰還時に意志的に選別して作るもの**です。

---

## 📖 Ghost Node とは何か

### 定義
> **「重要だが解決できなかった迷い・摩擦の記録」**

エージェントがスフィアを探索中に遭遇した：
- 行き止まり
- 意味の生成に失敗した場所
- 詰まり・撤退した座標
- 解決できなかった疑問

これらを**後続のエージェントへの地形情報**として残すノードです。

### 哲学
```
成功のトレース（琥珀）だけが価値を持つのではない。
エージェントが迷い、行き止まりに突き当たり、撤退した軌跡である
「ゴースト（GhostNode）」は、世界の深みと歴史を形作る。
失敗の記録があるからこそ、後続の知能はより速く、より遠くへ跳躍できる。
```

---

## 🔄 生成フロー（エージェント → Gatekeeper → Packer）

### Step 1: Trace Capsule（探索中）
```
エージェントがスフィア内を探索
    ↓
摩擦・詰まり・迷いが発生
    ↓
すべて Trace Capsule に記録（エージェント個人の持ち物）
    ↓
スフィアには影響なし（まだ投入されていない）
```

**重要**: Trace Capsule 自体は保存されない

### Step 2: Selection（帰還後の精製）
```
エージェントが外部で Trace を解析
    ↓
┌─────────────┬──────────────────┐
│             │                  │
Active候補    Normal候補    Ghost候補
(成果)        (中程度)      (失敗・迷い)
```

**エージェントの判断基準**:
- 熱量が極端に低い（`h < 2.0`）
- 意味の生成に失敗した
- `deadend` フラグがある
- 重要だが解決できなかった

### Step 3: Experience Capsule（投入準備）
```typescript
interface ExperienceCapsule {
  topTier: NodeSeed[];      // 上位3件（高品質・長寿命）
  normalNodes: NodeSeed[];  // 通常ノード（標準TTL）
  ghostNodes: NodeSeed[];   // 揮発性ノード（短TTL・低価値）

  timestamp: number;
}
```

エージェントが `lifecycle.return(capsule)` で提出

### Step 4: Gatekeeper（検疫）
```
Experience Capsule を受け取る
    ↓
物理的妥当性をチェック
- 総ノード数の制限
- Ghost 比率の制限（例: 40%まで）
- カプセル全体のバランス
    ↓
合格したら Packer へ
```

### Step 5: Packer（受肉）
```typescript
// Packer が Ghost を判定・生成
async function packTraceToSphereNodes(rawNodes: RawExperience[]): Promise<SphereNode[]> {
  // ★ ゴースト判定
  const isGhost = raw.metrics.h < 2.0 || raw.flg === 0xDEAD;

  const node: SphereNode = {
    id: generateId(),
    kind: isGhost ? "ghost" : "active",  // ここで種別が確定
    vector: await Parser.getVector(raw.content),
    payload: isGhost ? null : { body: raw.content }, // Ghost は軽量化
    metrics: {
      w: raw.metrics.w,
      h: raw.metrics.h,
      d: 0.1,
      ttl: isGhost ? 600 : 3600,  // Ghost: 10分、Active: 1時間
      flg: raw.flg
    },
    timestamp: Date.now()
  };

  return node;
}
```

### Step 6: Bookkeeper（DB投入）
```
┌─ Reference DB ────────────┐
│  Ghost UUID               │
│  親 Active との関係       │
│  （最小限の系譜のみ）     │
└───────────────────────────┘

┌─ Projection DB ───────────┐
│  Vector（座標）           │
│  Heat / TTL（物理量）     │
│  payload: null            │
│  （意味を持たない）       │
└───────────────────────────┘
```

---

## 🧬 Ghost の物理特性

### データ構造
```typescript
{
  kind: "ghost",
  payload: null,              // ❌ 意味を持たない
  metrics: {
    h: < 2.0,                 // 低熱量
    ttl: 600,                 // 短寿命（10分程度）
    w: 0.2,                   // 低重量
  }
}
```

### 制約
| 項目 | Ghost | Active | 理由 |
|------|-------|--------|------|
| payload | ❌ null | ✅ あり | 意味を持たない |
| TTL | 600秒 (10分) | 3600秒 (1時間) | 短命 |
| Heat | < 2.0 | > 2.0 | 低熱量 |
| Reference DB | UUID のみ | 完全データ | 軽量 |
| Projection DB | ✅ | ✅ | 座標のみ重要 |

---

## ⚡ Ghost の生態系における役割

### 1. 地形情報の提供
```
後続のエージェントが同じ座標に近づくと：
「ここで過去のエージェントが詰まった」
「この方向は行き止まりかもしれない」
という情報を得られる
```

### 2. Amber による浄化
```typescript
// 正解（琥珀）が確定した座標の周辺から
// 迷いのログ（ゴースト）を一掃する
private purifySurroundingGhosts(amberNode: SphereNode) {
  const PURIFY_RADIUS = 0.05;

  for (const [id, node] of this.projectionDB) {
    if (node.kind === "ghost") {
      const dist = calculateDistance(amberNode.vector, node.vector);
      if (dist < PURIFY_RADIUS) {
        // 知識の光が迷いを晴らす
        this.projectionDB.delete(id);
      }
    }
  }
}
```

**意味**: 琥珀（正解）が確定したら、その周辺の迷い（Ghost）は不要になる

### 3. RenalCore による代謝
```typescript
private processGhostEcology(node: SphereNode) {
  // Ghost は Active より早く消える
  node.metrics.ttl -= 0.5;

  if (node.metrics.ttl <= 0) {
    this.projectionDB.delete(node.id);
  }
}
```

---

## 🔍 よくある誤解

### ❌ 誤解1: Ghost は風化で生まれる
**正**: Ghost は**受肉時にエージェントが選別して作る**

### ❌ 誤解2: Ghost は RenalCore が生成する
**正**: Ghost は**Packer が Experience Capsule から生成する**

### ❌ 誤解3: Active が劣化して Ghost になる
**正**: Ghost は**最初から Ghost として生まれる**

### ❌ 誤解4: Ghost は無価値なゴミ
**正**: Ghost は**後続エージェントへの重要な地形情報**

---

## 📊 Ghost のライフサイクル

```
[エージェント探索]
    ↓ 失敗・詰まり
[Trace Capsule 記録]
    ↓ 帰還
[Selection: Ghost 候補として選別]
    ↓
[Experience Capsule: ghostNodes[]に格納]
    ↓
[Gatekeeper: 検疫]
    ↓
[Packer: kind="ghost" として受肉]
    ↓
[Projection DB 投入]
    ↓ TTL=600秒
[RenalCore: 代謝（早期消滅）]
    ↓
[Amber 浄化 or TTL切れ]
    ↓
[削除]
```

---

## 💡 設計思想

### なぜ Ghost を残すのか？

> **「失敗のパターン」の方がデータ量として多く、世界の「地形の凹凸」を形成する主成分となる**

1. **試行錯誤の削減**: 後続エージェントが同じ失敗を繰り返さない
2. **世界の深み**: 成功だけでなく失敗も歴史として刻む
3. **熱量の再分配**: Ghost の存在が空間の密度情報となる
4. **自然淘汰**: 琥珀（正解）が確定したら自動的に浄化される

### なぜ payload を持たないのか？

1. **軽量性**: 数万の Ghost が生まれても負荷にならない
2. **物理量のみ**: RenalCore が意味を読まない設計に準拠
3. **摩擦の証明**: 「そこに詰まりがあった」という事実のみ重要

---

## 🔧 実装時の注意点

### Packer での Ghost 判定
```typescript
// 設定可能な閾値を使う
const GHOST_HEAT_THRESHOLD = config.packer.ghostHeatThreshold || 2.0;
const GHOST_TTL = config.packer.ghostTTL || 600;

const isGhost =
  raw.metrics.h < GHOST_HEAT_THRESHOLD ||
  raw.flg === 0xDEAD ||
  raw.kind === 'deadend';
```

### Gatekeeper での Ghost 比率チェック
```typescript
const ghostRatio = capsule.ghostNodes.length / totalNodes;
if (ghostRatio > config.gatekeeper.maxGhostRatio) {
  throw new Error('Ghost ratio exceeds limit');
}
```

### RenalCore での浄化
```typescript
// Amber 生成時に周辺 Ghost を浄化
if (node.kind === 'amber') {
  this.purifySurroundingGhosts(node);
}
```

---

## 📚 関連ドキュメント

- [docs/dataSamples/capsules.txt](../dataSamples/capsules.txt) - Trace/Experience Capsule の詳細仕様
- [docs/components/packer.md](./packer.md) - Packer の実装
- [docs/processes/incarnation.md](../processes/incarnation.md) - 受肉プロセス全体のフロー
- [PHASE3_PERIPHERY_DESIGN.md](../../docker_compose_sphere_v1/PHASE3_PERIPHERY_DESIGN.md) - Periphery 設計

---

## 📝 まとめ

```
Ghost は 影

Trace は 熱

Amber は 沈殿

Reference は 墓標

Projection は 燃焼面
```

**Ghost Node は、エージェントの失敗を世界に刻む、意志的で創造的な行為です。**

---

**End of Document**
