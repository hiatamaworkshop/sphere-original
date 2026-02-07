# Issue: ProjDB Payload Duplication

**Date**: 2026-02-03
**Status**: Open
**Priority**: High (Architecture)

## 問題概要

ProjDB に payload が含まれており、RefDB との分離設計が不完全。

## 設計意図

```
RefDB (魂/原典):
  - id, timestamp, kind
  - payload: { summary, tags, links, ref_url, crystallization }
  - snapshot: { vector, weight, heat, decay, flags }

ProjDB (体/投影):
  - id, kind, vector
  - metrics: { w, d, h, ttl, flg }
  - tags のみ許可（sense で軽量に知覚可能にするため）
  - payload は持たない
```

**ID連携**: sense() で id を取得 → focus(id) で RefDB から詳細取得

## 現状の実装

```typescript
// Bookkeeper.ingest() - 両方に payload が入る
await this.referenceRepo.create(refRecord);      // payload あり
await this.projectionRepo.set(node.id, node);    // node.payload も含む（重複）
```

ProjDB が完全な SphereNode を保存しており、payload が重複。

## 影響範囲

| コンポーネント | 影響 |
|---------------|------|
| `SphereNode` | ProjDB 用の軽量型が未定義 |
| `Bookkeeper.ingest()` | 完全な node を ProjDB に保存 |
| `MapProjectionRepository` | `Map<string, SphereNode>` で全データ保持 |
| `gateway.ts` NearbyNode | summary を含む（sense で公開すべきでない） |

## 修正方針

### Option A: ProjDB 用軽量型を定義

```typescript
// 新規型: ProjDB 専用
interface ProjectedNode {
  id: string;
  kind: NodeKind;
  vector: number[];
  tags?: string[];        // sense で知覚可能
  metrics: {
    w: number;
    d: number;
    h: number;
    ttl: number;
    flg: number;
  };
  linkMeta?: LinkMeta;
  timestamp: number;
  // payload は含まない
}
```

### Option B: Gateway 層でフィルタ

- ProjDB は SphereNode のまま
- sense() の戻り値から payload を除外
- 実装変更は最小限

## 関連ファイル

- `services/renalCore/src/types/sphere_node.ts` - SphereNode 定義
- `services/periphery/src/bookkeeper/bookkeeper.ts` - ingest 処理
- `services/periphery/src/repository/map-projection.repository.ts` - ProjDB 実装
- `services/periphery/src/types/gateway.ts` - NearbyNode 定義

## 備考

- tags は ProjDB に残す（sense で知覚可能にするため）
- summary, links, ref_url は RefDB のみ
- focus コスト: active/amber=10, ghost/fossil=0.5（別 issue）
