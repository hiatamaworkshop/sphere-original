# CleanerFish Patrol 実装メモ

## 問題
- TTL <= 0 のノードがクリーンアップされない
- Arbiter.diff() は「遷移」のみ検出 (`prevState.ttl > 0 && node.metrics.ttl <= 0`)
- サーバー再起動やキャパシティ超過で「取りこぼし」が発生

## 解決策: CleanerFish Patrol

### 設計思想
- **定期スイープではない** - CleanerFishの自律的な巡回として実装
- **補助動作** - 5分に1回の低頻度実行で負荷を抑制
- **公平性** - ランダム開始位置でイテレーションバイアス回避
- **早期終了** - 50ノード上限で O(n) フルスキャンを回避

### 実装 (index.ts:189-238)

```typescript
const PATROL_INTERVAL = 30; // 30観測 ≈ 5分
const MAX_PREY_PER_PATROL = 50;

patrolCounter++;
const shouldPatrol = patrolCounter % PATROL_INTERVAL === 0;

if (shouldPatrol) {
  const allNodes = Array.from(projectionDB.values());
  const startIdx = Math.floor(Math.random() * allNodes.length);
  const prey: typeof allNodes = [];

  // ランダム位置から巡回、50ノード見つけたら即終了
  for (let i = 0; i < allNodes.length && prey.length < MAX_PREY_PER_PATROL; i++) {
    const node = allNodes[(startIdx + i) % allNodes.length];
    if (node.metrics.ttl <= 0 &&
        !["relic", "amber", "environment"].includes(node.kind)) {
      prey.push(node);
    }
  }

  if (prey.length > 0) {
    cleanerFishPool.process(prey, getCellId);
    // fossilization / decomposition 適用
  }
}
```

### 計算量
- 従来: O(total_nodes) 毎tick
- 改善: O(min(stale_nodes, 50)) × 5分に1回

### 動作確認ログ
```
[CleanerFish:fish-0] evaporated ghost=cd54d3d9
[Bookkeeper] decomposed nodes=10 cells=1
```

## 関連ファイル
- `src/index.ts` - パトロール実装
- `src/cleaner-fish/cleaner-fish.ts` - CleanerFish本体
- `src/arbiter/arbiter.ts` - 遷移検出（diff）

## 設定値
| パラメータ | 値 | 説明 |
|-----------|-----|------|
| PATROL_INTERVAL | 30 | 30観測ごと（≈5分） |
| MAX_PREY_PER_PATROL | 50 | 1回の最大処理数 |
| observationInterval | 10 | 10 tick ごとに観測 |

## 補足
- RenalCore の tick/stats ログはコメントアウト済み (`node_modules/@sphere/renal-core/dist/renalcore.js`)
- 本番環境では renal-core パッケージを再ビルドする必要あり
