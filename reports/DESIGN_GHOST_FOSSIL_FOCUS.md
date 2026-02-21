# Design: Ghost/Fossil Focus Strategy

**Date**: 2026-02-03
**Status**: Implemented

## 背景

sense() が summary + tags を返すようになり、Ghost/Fossil に対して focus() を使う意味が薄れた。
また、focus() は RefDB クエリを伴うため、Ghost/Fossil 個別に focus するとコストがかかる。

## 設計決定

### Ghost/Fossil 直接 focus は不可

```typescript
focus(ghostNodeId) → Error: "Cannot focus on ghost/fossil nodes directly"
```

### Active ノード focus 時に周囲の Ghost/Fossil を添付

```typescript
interface FocusResult {
  // メインのフォーカス結果
  ...NodeDetail,

  // 範囲内の Ghost/Fossil を RefDB から取得して添付
  nearbyGhosts?: NodeDetail[]
}
```

## 理由

1. **DBコスト最適化**: 1回の focus で RefDB クエリを実行 → 周囲の Ghost/Fossil も同時取得
2. **メタファー**: "生きたノードに注目したら、周囲の幽霊も見える"
3. **公平性**: focus コストを払ったので、パース済みデータは全て返す

## データフロー

```
Agent                   Gateway                 ProjDB      RefDB
  │                        │                      │           │
  │── focus(activeId) ────→│                      │           │
  │                        │── get(activeId) ────→│           │
  │                        │←── SphereNode ───────│           │
  │                        │                      │           │
  │                        │── get(activeId) ────────────────→│
  │                        │←── ReferenceRecord ──────────────│
  │                        │                      │           │
  │                        │  [範囲内の Ghost/Fossil を検出]   │
  │                        │── getMany(ghostIds) ────────────→│
  │                        │←── ReferenceRecords ─────────────│
  │                        │                      │           │
  │←── FocusResult ────────│                      │           │
  │    { node, nearbyGhosts }                     │           │
```

## API 変更

### NodeDetail (変更なし)
```typescript
interface NodeDetail extends NearbyNode {
  payload?: string;
  tags: string[];
  ref_url?: string;
  sourceNodeId?: string;
  links?: string[];
}
```

### FocusResult (新規)
```typescript
interface FocusResult {
  node: NodeDetail;
  nearbyGhosts?: NodeDetail[];  // Ghost/Fossil のみ
}
```

## 実装タスク

- [x] focus() の戻り値を FocusResult に変更
- [x] Ghost/Fossil 直接 focus 時のエラーハンドリング
- [x] 範囲内 Ghost/Fossil の RefDB バッチ取得
- [x] explore-agent.ts のテスト更新

## 関連ファイル

- `services/periphery/src/gateway/sphere-core-adapter.ts` - focus() 実装
- `services/periphery/src/types/gateway.ts` - 型定義
- `services/periphery/src/mock/explore-agent.ts` - テスト用エージェント

## 備考

- Ghost/Fossil は ProjDB にも存在する（sense() で検出可能）
- RefDB には完全なデータが保存されている
- 復活メカニズムは別途検討（focus 以外のトリガー）
