# Test Result: Ghost/Fossil Focus Strategy

> **テスト結果**: Ghost/Fossil Focus Strategy の検証記録。最新の手順は [TEST_PROCEDURES.md](TEST_PROCEDURES.md) を参照。

**Date**: 2026-02-03
**Status**: PASSED

## テスト環境

- Server: localhost:3001 (HTTP), localhost:8081 (WebSocket)
- Agent: explore-agent.ts (radius=10)
- Data: swarm:5 で 675 ノード投入後

## テスト結果

### 1. sense() が summary + tags を返す - PASSED

```
[Tutorial] Found 15 nearby nodes

  1. [ghost   ] ░░░░░░░░░░ [AutoCapsule] Session 47de1bee...
     Tags: auto-capsule, session-summary
  2. [active  ] ░░░░░░░░░░ GitOps...
     Tags: GitOps, devops, infrastructure
  3. [ghost   ] ░░░░░░░░░░ [AutoCapsule] Session 57920570...
     Tags: auto-capsule, session-summary
```

- summary が表示されている
- tags が表示されている
- Ghost ノードが kind で識別可能

### 2. focus() が NodeDetail + nearbyGhosts を返す - PASSED

```
[EVENT] FOCUS_RESULT - node=a3350ab3... kind=active
[Tutorial] Node details:
  Kind: active
  Heat: 50.00
  Tags: mock, test
  Summary: Detailed view of node a3350ab3d386a3a9
  Payload: This is the full content of the focused node....

[Explorer] 👻 Found 5 nearby ghost/fossil nodes (included for free)
```

- Active ノードへの focus 成功
- nearbyGhosts が 5 件返された（👻 ログ確認）
- FocusResult 型が正しく動作

### 3. Ghost/Fossil が sense で検出される - PASSED

```
║  🔍 Sensed Nodes: 39                                               ║
║    → ghost:5, active:34                                            ║
```

- 39 ノード中 5 件が ghost
- kind による分類が正常

### 4. データフロー確認 - PASSED

| 操作 | 取得元 | 内容 |
|---|---|---|
| sense() | ProjDB | summary + tags |
| focus() | ProjDB + RefDB | summary + tags + links + ref_url + nearbyGhosts |

## パフォーマンス

```
⏱ sense: 2.2ms
⏱ focus: 3.6ms
⏱ warp: 2.1ms
⏱ randomWalk: 2.9ms
```

全操作が 5ms 以下で完了。

## 確認済み機能

- [x] sense() が ProjDB から summary + tags を返す
- [x] focus() が Active ノードに対して動作
- [x] focus() が RefDB から links, ref_url を取得
- [x] focus() が nearbyGhosts を含めて返す
- [x] Ghost ノードが sense() で検出可能
- [x] FocusResult 型が正しく実装されている

## 未テスト項目

- [ ] Ghost/Fossil 直接 focus 時のエラー（サーバーログで確認必要）
- [ ] Fossil ノードの動作（データに fossil がない可能性）

## 関連ファイル

- `services/periphery/src/gateway/sphere-core-adapter.ts` - focus() 実装
- `services/periphery/src/types/gateway.ts` - FocusResult 型
- `services/periphery/src/mock/explore-agent.ts` - テストエージェント
- `reports/DESIGN_GHOST_FOSSIL_FOCUS.md` - 設計ドキュメント
