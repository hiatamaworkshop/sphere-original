# 動的サンプルサイズ - 作業メモ

*作成日: 2026-02-06*
*更新日: 2026-02-06 (設計変更)*

## 概要

サンプルサイズの動的調整を **2つのレイヤー** で実装。

| レイヤー | 対象 | 調整方式 |
|---------|------|----------|
| GlobalField | 共有気候 | パーセンテージベース (20%+) |
| sense/scanL1 | 個別知覚 | エージェント数ベース |

## 設計思想

**GlobalField** = 共有リソース、精度が重要
- 更新頻度: 10秒〜1分に1回
- エージェント数に依存しない
- 最低 20% のノードをサンプル

**sense/scanL1** = 個別操作、頻発
- 更新頻度: エージェントのアクションごと
- エージェント数が増えると負荷増大
- `limit = baseLimit / sqrt(agentCount)` でスロットリング

## 実装

### 1. GlobalField (パーセンテージベース)

```typescript
// field/global-field-layer.ts
const percentMin = Math.floor(allNodes.length * this.config.minSamplePercent);
const sampleSize = Math.min(
  Math.max(percentMin, this.config.minSampleSize),
  this.config.maxSampleSize,
  allNodes.length
);
```

### 2. SphereCoreAdapter (エージェント数ベース)

```typescript
// gateway/sphere-core-adapter.ts
private agentCount: number = 1;

setAgentCount(count: number): void {
  this.agentCount = Math.max(1, count);
}

private getDynamicLimit(baseLimit: number): number {
  // sqrt scaling: 4 agents → 50%, 9 agents → 33%
  return Math.max(5, Math.floor(baseLimit / Math.sqrt(this.agentCount)));
}
```

### 3. 接続 (index.ts)

```typescript
server.setOnAgentCountChange((count: number) => {
  renalCore.updateAgentCount(count);   // Dormancy 用
  coreAdapter.setAgentCount(count);    // sense/scanL1 スロットリング
});
```

## データフロー

```
GatewayServer.connections.size
        │
        ▼
notifyAgentCountChange()
        │
        ▼
server.setOnAgentCountChange(callback)
        │
        ├──► renalCore.updateAgentCount()    (Dormancy)
        └──► coreAdapter.setAgentCount()     (sense/scanL1)
                    │
                    ▼
              getDynamicLimit() で limit 計算
```

## 設定 (sphere.config.json)

```json
{
  "field": {
    "minSamplePercent": 0.2,
    "minSampleSize": 10,
    "maxSampleSize": 500
  }
}
```

## ログ出力

```
[GlobalField] update: nodes=1000 samples=200 (20.0%) intensity=0.450 volatility=0.230 flags=0x12
                                              ^^^^^^
                                              サンプル割合表示
```

## 関連ファイル

- [global-field-layer.ts](./global-field-layer.ts) - GlobalField 実装
- [types.ts](./types.ts) - FieldConfig 定義
- [../gateway/sphere-core-adapter.ts](../gateway/sphere-core-adapter.ts) - sense/scanL1 実装
- [../index.ts](../index.ts) - 接続部分

---

## 補足: なぜ 2 レイヤーに分けたか

**GlobalField**: 共有気候
- 1分に1回でも十分
- エージェント増加で精度を下げるべきではない
- → パーセンテージベース (常に 20%+ サンプル)

**sense/scanL1**: 個別知覚
- エージェントごとに頻発
- 100エージェントが同時 sense → サーバー負荷爆発
- → sqrt(agentCount) でスロットリング
