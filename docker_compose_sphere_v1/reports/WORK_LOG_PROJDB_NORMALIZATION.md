# Work Log: ProjDB Normalization (v2)

**Date**: 2026-02-03
**Status**: Complete
**Base Commit**: b56e141

## 設計意図

```
SphereNode (入力)
    │
    ├─→ RefDB (魂/アーカイブ): 完全保存
    │     payload: { summary, tags, links, ref_url, sourceNodeId, crystallization }
    │     snapshot: { vector, weight, heat, decay, flags }
    │
    └─→ ProjDB (体/高速アクセス): フィルタ済み
          payload: { summary, tags } のみ
          metrics, vector, linkMeta は保持
```

| DB | 保存内容 | 用途 |
|---|---|---|
| **RefDB** | 完全な payload (links, ref_url, sourceNodeId 等) | アーカイブ、詳細取得 |
| **ProjDB** | summary + tags + metrics | sense/focus 高速アクセス |

| 操作 | 返す内容 | 取得元 |
|---|---|---|
| **sense()** | summary + tags | ProjDB |
| **focus()** | summary + tags (ProjDB) + links, ref_url (RefDB) | 両方 |

## 修正内容

### 1. Bookkeeper.ingest() - ProjDB への書き込み正規化

**File**: `services/periphery/src/bookkeeper/bookkeeper.ts`

```typescript
// === Phase 2: ProjDB (Body) ===
// [Design] ProjDB stores summary + tags for fast access (sense/focus)
// Links, ref_url, sourceNodeId are RefDB-only (archive)
const projectedNode: SphereNode = {
  id: node.id,
  kind: node.kind,
  vector: node.vector,
  payload: {
    summary: node.payload?.summary,
    tags: node.payload?.tags,
  },
  metrics: node.metrics,
  linkMeta: node.linkMeta,
  timestamp: node.timestamp,
};
await this.projectionRepo.set(node.id, projectedNode);
```

Link ノードも同様に正規化:
```typescript
// [Design] Link nodes: no payload in ProjDB (linkMeta preserved for warp)
const projectedLink: SphereNode = {
  id: linkNode.id,
  kind: linkNode.kind,
  vector: linkNode.vector,
  payload: undefined,  // Link nodes have no summary/tags
  metrics: linkNode.metrics,
  linkMeta: linkNode.linkMeta,
  timestamp: linkNode.timestamp,
};
await this.projectionRepo.set(linkNode.id, projectedLink);
```

### 2. NearbyNode 型の更新 - summary + tags

**File**: `services/periphery/src/types/gateway.ts`

```typescript
export interface NearbyNode {
  id: string;
  distance: number;
  summary: string;     // From ProjDB
  heat: number;
  weight: number;
  timestamp: number;
  kind: NodeKind;
  flags: number;
  tags?: string[];     // From ProjDB
}
```

### 3. sense() の修正 - summary + tags を返す

**File**: `services/periphery/src/gateway/sphere-core-adapter.ts`

```typescript
nearbyNodes.push({
  id: node.id,
  distance: addNoise(distance, this.config.noiseFactor),
  // [Design] summary + tags from ProjDB for fast sense()
  summary: node.payload?.summary ?? "(no summary)",
  heat: addNoise(node.metrics.h, this.config.noiseFactor),
  weight: addNoise(node.metrics.w, this.config.noiseFactor),
  timestamp: node.timestamp,
  kind: node.kind,
  flags: node.metrics.flg,
  tags: node.payload?.tags,
});
```

### 4. focus() の修正 - ProjDB + RefDB 連携

**File**: `services/periphery/src/gateway/sphere-core-adapter.ts`

```typescript
// === Fetch detailed payload from RefDB ===
// [Design] ProjDB has summary + tags only; RefDB has links, ref_url, sourceNodeId
const refRecord = await this.referenceRepo.get(nodeId);
const refPayload = refRecord?.payload;

// Build L3 links array based on node kind
let links: string[] | undefined;
if (node.kind === "link" && node.linkMeta) {
  links = [node.linkMeta.source_id, node.linkMeta.target_id];
} else if (refPayload?.links && Array.isArray(refPayload.links)) {
  links = refPayload.links;
}

return {
  id: node.id,
  distance: addNoise(distance, this.config.noiseFactor),
  // [Design] summary + tags from ProjDB (fast access)
  summary: node.payload?.summary ?? (node.kind === "link" ? "(path)" : "(no summary)"),
  heat: addNoise(node.metrics.h, this.config.noiseFactor),
  weight: addNoise(node.metrics.w, this.config.noiseFactor),
  timestamp: node.timestamp,
  kind: node.kind,
  flags: node.metrics.flg,
  tags: node.payload?.tags ?? [],
  payload: node.payload?.summary,
  // [Design] L3 references from RefDB (archive)
  sourceNodeId: refPayload?.sourceNodeId,
  ref_url: refPayload?.ref_url,
  links,
};
```

### 5. explore-agent.ts - 型定義と表示更新

**File**: `services/periphery/src/mock/explore-agent.ts`

```typescript
interface NearbyNode {
  id: string;
  distance: number;
  summary: string;    // From ProjDB via sense()
  heat: number;
  weight: number;
  timestamp: number;
  kind: string;
  flags: number;
  tags?: string[];
}

// 表示コード
nearby.slice(0, 3).forEach((node, i) => {
  const heatBar = "█".repeat(Math.min(10, Math.floor(node.heat / 10)));
  const tagsStr = node.tags?.slice(0, 3).join(", ") || "(no tags)";
  console.log(`  ${i + 1}. [${node.kind.padEnd(8)}] ${heatBar.padEnd(10, "░")} ${node.summary.slice(0, 30)}...`);
  console.log(`     Tags: ${tagsStr}`);
});
```

### 6. sphere-context.ts - mock データ更新

**File**: `services/periphery/src/gateway/sphere-context.ts`

mock データに summary を追加。

## 関連ファイル

- `services/periphery/src/bookkeeper/bookkeeper.ts` - DB コントローラ
- `services/periphery/src/types/gateway.ts` - NearbyNode, NodeDetail 定義
- `services/periphery/src/gateway/sphere-core-adapter.ts` - sense(), focus() 実装
- `services/periphery/src/gateway/sphere-context.ts` - mock データ
- `services/periphery/src/mock/explore-agent.ts` - テスト用エージェント

## 確認項目

- [x] Bookkeeper が ProjDB に summary + tags のみ保存
- [x] sense() が ProjDB から summary + tags を返す
- [x] focus() が ProjDB から summary、RefDB から links/ref_url を取得
- [x] TypeScript コンパイル成功（既存の LinkCandidate エラーは別問題）
- [x] explore-agent.ts の型定義と表示を更新

## 既存エラー（今回の修正とは無関係）

```
src/arbiter/arbiter.ts: LinkCandidate, CrystallizationData
src/pulse/pulse-broadcaster.ts: LinkCandidate, linkCandidates
```

これらは `@sphere/renal-core` のエクスポート問題。

## 次のタスク候補

- [ ] Ghost/Fossil の focus コスト = 0 実装
- [ ] LinkCandidate, CrystallizationData のエクスポート修正（renal-core）
- [ ] 実機テスト（explore-agent で sense/focus 動作確認）
