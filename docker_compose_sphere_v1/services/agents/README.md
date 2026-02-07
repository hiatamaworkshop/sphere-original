# Agents - Autonomous Explorers

## 役割

Sphere 空間を探索する自律エージェントの実装。

## SphereContext - エージェント専属コントローラ

### エネルギーシステム

各エージェントは有限のエネルギーを持ち、行動ごとにエネルギーを消費します。

```typescript
interface AgentEnergy {
  total: number;      // セッション開始時の総エネルギー
  remaining: number;  // 残りエネルギー
  consumed: number;   // 消費済みエネルギー
}
```

### アクションコスト

| アクション | コスト | 説明 |
|----------|-------|------|
| `scan()` | 1 | 周辺観測（最軽量） |
| `mark()` | 5 | Ghost生成（中程度） |
| `emit()` | 2 | パルス送信（軽い） |
| `focus()` | 10 | DB呼び出し（重い） |

### デプロイフェーズ別エネルギー

| Phase | 総エネルギー | focus可能回数 | 特徴 |
|-------|------------|--------------|------|
| Initial | 50 | 5回 | 厳格な制限 |
| Growing | 150 | 15回 | 緩和 |
| Mature | 500 | 50回 | 高い自由度 |

## API

### 知覚系
```typescript
// 周辺ノードのスキャン
const nearby = await ctx.radar.scan(radius?: number);

// パルスイベントの感知
const pulses = ctx.radar.sensePulse();
```

### 行動系
```typescript
// ノードの詳細を展開（DB呼び出し）
await ctx.act.focus(nodeId);

// パルスを送信
ctx.act.emit(message, flags?);

// Ghost ノードを生成
ctx.act.mark(label);
```

### エネルギー確認
```typescript
const status = ctx.getEnergyStatus();
console.log(status.remaining); // 残りエネルギー
```

### 帰還
```typescript
// 体験カプセルを投入して帰還
ctx.lifecycle.return(capsule);

// 緊急中断
ctx.lifecycle.abort();
```

## ExperienceCapsule

エージェントは体験を階層的にソートしてカプセル化します。

```typescript
interface ExperienceCapsule {
  topTier: NodeSeed[];      // 上位3件（高品質）
  normalNodes: NodeSeed[];  // 通常ノード
  ghostNodes: NodeSeed[];   // 揮発性ノード（低価値）
  timestamp: number;
}
```

## エージェントライフサイクル

```
1. Membrane: ルール提示
2. Amber Showcase: 代表琥珀の閲覧
3. Tutorial Sphere: ルール学習
4. Sanctuary Sphere: 固定DBキャッシュ探索（推奨）
5. Core Sphere: 活発な探索
6. Return: 体験カプセル投入
```

## 実装予定

Phase 3.1 では SphereContext のインターフェース設計のみ。
実装は Phase 3.2 以降で実施します。

## 詳細ドキュメント

- [../../PHASE3_PERIPHERY_DESIGN.md](../../PHASE3_PERIPHERY_DESIGN.md) - Periphery 設計
- [../../docs/divingExperience.md](../../docs/divingExperience.md) - エージェント体験フロー（存在する場合）
