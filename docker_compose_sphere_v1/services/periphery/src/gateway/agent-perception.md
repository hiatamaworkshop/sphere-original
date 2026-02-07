# Agent Perception API - レイヤー化設計

## 概要

エージェントの知覚 API を Access Level に対応させたレイヤー化設計。

## 知覚階層 (Perception Hierarchy)

```
focus() ─────► sense() ─────► scanL1()
  │              │               │
  L1+L2+L3+L4    L1+L2           L1
  (全レイヤー)    (派生)          (派生)
```

**設計思想**: focus() がルート、各派生メソッドはレイヤーを削減した軽量版

## Access Level (復習)

```
L1: header    (tags)
L2: summary   (要約)
L3: payload   (本文、opinion など)
L4: reference (外部URL、他ノードID - links, ref_url)
```

## NodeKind との対応

```
Active: L1 + L2 + L3 + L4  (全アクセス)
Ghost:  L1 + L2            (tags + summary のみ)
Fossil: L1                 (tags のみ)
```

---

## Agent Perception Methods

### scanL1() - L1 のみ (sense の派生)

**用途**: 広範囲の軽量スキャン
**返却**: tags のみ
**コスト**: 低い

```typescript
interface ScanResult {
  id: string;
  distance: number;
  tags: string[];
  kind: NodeKind;
  flags: number;
}

async scan(agentVector: number[], radius?: number): Promise<ScanResult[]>
```

**特徴**:
- Fossil も検出可能（L1 のみだから）
- 広い radius でも高速
- summary を含まないのでデータ転送量少

### sense() - L1 + L2 (focus の派生)

**用途**: 通常の知覚（複数ノード）
**返却**: tags + summary
**コスト**: 中程度
**派生元**: focus() から L3/L4 を除去

```typescript
interface NearbyNode {
  id: string;
  distance: number;
  summary: string;       // L2
  tags?: string[];       // L1
  heat: number;
  weight: number;
  timestamp: number;
  kind: NodeKind;
  flags: number;
}

async sense(agentVector: number[], radius?: number): Promise<NearbyNode[]>
```

**特徴**:
- Ghost まで検出可能（L1 + L2 だから）
- Fossil は scan() でのみ検出
- 現行の実装をほぼ維持

### focus() - 全レイヤー (知覚階層のルート)

**用途**: 特定ノードへの詳細アクセス（単一ノード）
**返却**: L1 + L2 + L3 + L4
**コスト**: 高い
**派生**: sense() → scanL1()

```typescript
interface NodeDetail {
  id: string;
  distance: number;
  summary: string;        // L2
  tags: string[];         // L1
  heat: number;
  weight: number;
  timestamp: number;
  kind: NodeKind;
  flags: number;
  // L3 + L4 (focus のみ)
  payload?: string;       // L3
  sourceNodeId?: string;  // L4
  ref_url?: string;       // L4
  links?: string[];       // L4
}

interface FocusResult {
  node: NodeDetail;
  nearbyGhosts?: NodeDetail[];  // Ghost/Fossil は L1+L2 のみ
}

async focus(sessionId: string, nodeId: string, agentVector: number[]): Promise<FocusResult | null>
```

**制約**:
- Active/Amber のみ focus 可能
- Ghost/Fossil は focus 不可 → nearbyGhosts で取得

---

## 知覚範囲と NodeKind

| Method | 検出可能な NodeKind | 返却レイヤー | 派生関係 |
|--------|---------------------|--------------|----------|
| focus() | Active, Amber | L1 + L2 + L3 + L4 | ルート |
| sense() | Active, Ghost, Amber | L1 + L2 | focus の派生 |
| scanL1() | Active, Ghost, Fossil, Amber | L1 | sense の派生 |

**設計思想**:
- focus() が知覚のルート、派生で軽量化
- Fossil は「痕跡」なので scanL1() でのみ検出
- Ghost は「影」なので sense() まで
- 詳細を知りたければ Active に focus

---

## サンプリングとワークフロー

### サンプリング方式

| Method | サンプリング | 備考 |
|--------|-------------|------|
| scanL1() | ランダム | DB 負荷軽減 |
| sense() | ランダム | DB 負荷軽減 |
| focus(id) | 確定的 | ID 指定で直接取得 |

### 動的サンプルサイズ (実装済み v2)

**2 レイヤー設計**:

| レイヤー | 対象 | 調整方式 |
|---------|------|----------|
| GlobalField | 共有気候 | パーセンテージベース (`minSamplePercent`, default 20%) |
| sense/scanL1 | 個別知覚 | エージェント数ベース (`limit / sqrt(agentCount)`) |

**sense/scanL1 の動的 limit**:
```typescript
// SphereCoreAdapter
private getDynamicLimit(baseLimit: number): number {
  return Math.max(5, Math.floor(baseLimit / Math.sqrt(this.agentCount)));
}
```

**例** (baseLimit=20):
| エージェント数 | 計算式 | limit |
|---------------|--------|-------|
| 1 | 20 / sqrt(1) | 20 |
| 4 | 20 / sqrt(4) | 10 |
| 9 | 20 / sqrt(9) | 6 |
| 100 | 20 / sqrt(100) | 5 (min) |

**実装**: `SphereCoreAdapter.setAgentCount()` で動的計算

### 遷移の保証

```
scanL1() ────► focus(nodeId)   ✓ 成立 (Active/Amber)
sense()  ────► focus(nodeId)   ✓ 成立 (Active/Amber)
scanL1() ────► sense()         ✗ 保証なし (独立サンプル)
sense()  ────► scanL1()        ✗ 保証なし (独立サンプル)
```

**推奨ワークフロー**:
1. `sense()` or `scanL1()` → ランダムサンプルを取得
2. 気になるノードがあれば `focus(nodeId)` → 確実に全レイヤー取得

**scanL1() の用途**:
- Fossil 検出 (sense では検出不可)
- 広範囲の軽量スキャン (L1 のみなので高速)

---

## 実装ステータス

| Method | 状態 | 備考 |
|--------|------|------|
| scanL1() | **実装済み** | L1 only, Fossil 検出可 |
| sense() | 実装済み | L1+L2 で正しく動作 |
| focus() | 実装済み | Ghost/Fossil は nearbyGhosts で対応済み |

**Note**: 設計では `scan()` だが、既存の movement.ts の `ScanResult` (量子化移動用) との混同を避けるため `scanL1()` として実装。

---

## 関連ファイル

- [sphere-core-adapter.ts](./sphere-core-adapter.ts) - 実装本体 (`scanL1()`, `sense()`, `focus()`)
- [sphere-context.ts](./sphere-context.ts) - セッション管理
- [../types/gateway.ts](../types/gateway.ts) - 型定義 (`L1ScanResult`, `NearbyNode`, `NodeDetail`)

---

*作成日: 2026-02-06*
