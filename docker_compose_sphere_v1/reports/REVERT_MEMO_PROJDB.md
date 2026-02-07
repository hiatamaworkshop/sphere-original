# Revert Memo: ProjDB 正規化作業

**Date**: 2026-02-03
**Target Commit**: `b56e141` (DBに混在問題発覚直す)

## 問題の経緯

### 発端
ProjDB に完全な SphereNode が保存されており、RefDB との分離が不完全だった。

### 誤った修正
ProjDB から `summary` を削除し、`tags` のみ残した。
これにより：
- sense() で summary が返せなくなった
- focus() で RefDB への追加クエリが必要になった

### 正しい設計

```
SphereNode (入力)
    │
    ├─→ RefDB: 完全保存（アーカイブ）
    │     payload: { summary, tags, links, ref_url, sourceNodeId, ... }
    │
    └─→ ProjDB: 高速アクセス用（フィルタ済み）
          payload: { summary, tags }  ← links, ref_url は除外
```

| DB | 保存内容 | 用途 |
|---|---|---|
| **ProjDB** | summary + tags + metrics | sense/focus 高速アクセス |
| **RefDB** | 完全な payload | アーカイブ、詳細取得 |

| 操作 | 返す内容 | 取得元 |
|---|---|---|
| **sense()** | summary + tags | ProjDB |
| **focus()** | summary + tags + links + ref_url | ProjDB + RefDB |

## Git 状態

```
a43ec55 調整              ← 現在 (問題あり)
6ee3976 エラー対処
b56e141 DBに混在問題発覚直す  ← 戻り先
4cb5d7c swarm 成功
```

### 未コミットの変更（保持すべきもの）

1. **explore-agent.ts** の修正：
   - 重複識別子エラー修正（query, tags）
   - RulebookConstraints 型更新

2. **reports/** の作業メモ

### 破棄すべき変更

1. **bookkeeper.ts**: ProjDB から summary 削除（誤り）
2. **sphere-core-adapter.ts**: sense() から summary 削除（誤り）
3. **gateway.ts**: NearbyNode から summary 削除（誤り）

## 作業手順

1. explore-agent.ts の修正を別ファイルに退避
2. `git checkout b56e141 -- services/periphery/src/bookkeeper/bookkeeper.ts`
3. `git checkout b56e141 -- services/periphery/src/gateway/sphere-core-adapter.ts`
4. `git checkout b56e141 -- services/periphery/src/types/gateway.ts`
5. Bookkeeper を正しく修正：`payload: { summary, tags }` のみ保存
6. explore-agent.ts の修正を再適用
7. テスト実行

## 正しい Bookkeeper.ingest() の修正

```typescript
// === Phase 2: ProjDB (Body) ===
// [Design] ProjDB stores summary + tags for fast access
// Links, ref_url, etc. are only in RefDB
const projectedNode: SphereNode = {
  id: node.id,
  kind: node.kind,
  vector: node.vector,
  payload: {
    summary: node.payload?.summary,
    tags: node.payload?.tags,
    // links, ref_url, sourceNodeId は除外（RefDB のみ）
  },
  metrics: node.metrics,
  linkMeta: node.linkMeta,
  timestamp: node.timestamp,
};
await this.projectionRepo.set(node.id, projectedNode);
```

## 確認項目

- [ ] sense() が summary + tags を返す
- [ ] focus() が ProjDB から summary を取得（RefDB 追加クエリ不要）
- [ ] focus() が RefDB から links, ref_url を取得
- [ ] explore-agent.ts の修正が保持されている
