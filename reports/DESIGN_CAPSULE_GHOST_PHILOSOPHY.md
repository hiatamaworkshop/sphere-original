# Design: Capsule Ghost Philosophy

**Date**: 2026-02-04
**Status**: Concept

## 概要

Capsule の Ghost 枠は「捨てノード」ではなく、**エージェントの未練・残念**を表現する。

## Capsule 構成

```
ExperienceCapsule (10 枠)
├── TopTier (2):  最大の発見 - 「これが私の成果だ」
├── Normal (5):   補足知識 - 「これも見つけた」
└── Ghost (3):    未練 - 「ここに行きたかった」
```

## Ghost の定義

### 従来の理解（誤）

```
Ghost = 価値の低い発見
      = システムが自動分類
      = 捨てノード
```

### 新しい解釈（正）

```
Ghost = エージェントの未練・残念
      = エージェント自身が選択
      = 未踏の思念
```

## Ghost の本質

```
Ghost とは:
├── 「見えたが行けなかった場所」
├── 「探りたかったが energy が足りなかった」
├── 「Quest には関係ないが気になった」
├── 「時間切れで諦めた方向」
└── 「次回こそ行きたい」
```

**Ghost = 距離ではなく、未練**

## 選択の主体

| 項目 | 選択者 | 意味 |
|---|---|---|
| TopTier | Agent | 「これが私の成果だ」|
| Normal | Agent | 「これも発見した」|
| Ghost | **Agent** | 「ここに行きたかった」|

すべてエージェントが選択する。Server は検証と記録のみ。

## 実装への影響

### Agent 側

```typescript
interface GhostSeed {
  // 未踏地点の情報
  tags: string[];           // 方向性（ベクトル化される）
  summary: string;          // 「何が見えたか」

  // 未練の理由
  reason?: "energy" | "time" | "distance" | "priority";

  // 既存ノードへの参照（見えた Ghost/Fossil）
  sourceNodeId?: string;
}
```

### Agent の思考

```typescript
// 探索終了時
function selectGhosts(): GhostSeed[] {
  const ghosts: GhostSeed[] = [];

  // 1. 見たが行けなかった高 heat ノード
  for (const node of sensedButNotFocused) {
    if (node.heat > threshold && energy < focusCost) {
      ghosts.push({
        summary: `見えた: ${node.summary}`,
        tags: node.tags,
        reason: "energy",
        sourceNodeId: node.id,
      });
    }
  }

  // 2. 時間切れで諦めた方向
  if (remainingTime < 10) {
    ghosts.push({
      summary: `探索途中: ${currentDirection}`,
      tags: currentTags,
      reason: "time",
    });
  }

  // 3. nearbyGhosts で見つけた復活候補
  for (const ghost of discoveredGhosts) {
    ghosts.push({
      summary: `幽霊を発見: ${ghost.summary}`,
      tags: ghost.tags,
      reason: "priority",  // Quest優先で後回しにした
      sourceNodeId: ghost.id,
    });
  }

  return ghosts.slice(0, 3);  // max 3
}
```

## メタファー

```
探検家が帰還するとき:

「ここに金鉱を見つけた」     → TopTier
「この周辺にも鉱脈がある」   → Normal
「あの山の向こうも気になる」 → Ghost
「でも時間がなくて行けなかった」
```

## Ghost の価値

1. **次の Agent への道標**
   - 「あの方向に何かある」という情報
   - 未探索領域の可視化

2. **Sphere の地図化**
   - Ghost が多い領域 = 興味深いが未開拓
   - 探索優先度の決定に使える

3. **Quest マッチング**
   - 「この Ghost の方向に興味があるなら行ってみて」
   - Agent 間の連携

## Server の処理

```typescript
// return-handler.ts
async processReturn(autoCapsule, proposedCapsule) {
  if (proposedCapsule) {
    // Agent が選んだ Ghost をそのまま受け入れる
    // Ghost の「理由」は検証しない（主観的なもの）
    // 内容の妥当性のみ Gatekeeper で検証
  }
}
```

## 関連ファイル

- `services/periphery/src/types/capsule.ts` - NodeSeed 型
- `services/periphery/src/gateway/return-handler.ts` - Capsule 処理
- `services/periphery/src/mock/explore-agent.ts` - Agent 実装例

## 備考

- Ghost は「失敗」ではなく「未達」
- 未達を記録することで、Sphere 全体の探索効率が上がる
- エージェントの「意志」を尊重する設計
