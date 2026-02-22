# Arbiter 設計メモ

**日付**: 2026-01-31
**Phase**: 3.x（責務分離の再設計）

---

## 1. 背景と問題

### 1.1 RenalCore の設計原則

```
RenalCore responsibilities:
- Periodic Tick
- Apply decay to metrics only
- Evaporate nodes when ttl <= 0
- Never inspect semantic content  ← kind を見てはいけない
```

### 1.2 問題点

RenalCore が以下の状態遷移を担当していた：

- `processAscension()`: Active → Amber
- `processErosion()`: Amber → Active
- `processFossilization()`: Amber → Fossil

これらは `node.kind` を参照するため、設計原則に違反。

### 1.3 Kingfisher の役割

Kingfisher は「観測者（Detector）」として設計されている：

```typescript
/**
 * [Role] 水面を見下ろし、状態変化を検出する
 * [Principle] RenalCore が物理を実行し、Kingfisher が遷移を観測
 */
```

観測者に遷移実行の責務を持たせるのは不適切。

---

## 2. 解決策: Arbiter の導入

### 2.1 Arbiter（審判者）とは

「昇天と風化を裁定し、状態遷移を執行する審判者」

### 2.2 Arbiter の責務

| 責務 | 詳細 |
|------|------|
| Ascension 判定 | Heat/Weight 閾値 → Active → Amber |
| Erosion 判定 | Heat 低下 → Amber → Active |
| Fossilization 判定 | Heat 枯渇 → Amber → Fossil |
| フラグ同期 | 遷移時に Frozen フラグを付与/解除 |

### 2.3 配置

**Periphery** 内に配置（Bookkeeper と近い役割）

```
periphery/src/
├── bookkeeper/    ← DB永続化
├── kingfisher/    ← 状態検出
├── arbiter/       ← 状態遷移（NEW）
├── packer/        ← カプセル解体
├── gatekeeper/    ← 検疫
└── ...
```

---

## 3. 責務分離（最終形）

### 3.1 コンポーネント責務

| コンポーネント | 配置 | 責務 | kind参照 |
|---------------|------|------|----------|
| **RenalCore** | renalCore/ | 物理演算（TTL/Heat減衰、蒸発トリガー） | ❌ |
| **Kingfisher** | periphery/ | 状態変化の検出・報告 | ✅（観測のみ） |
| **Arbiter** | periphery/ | 状態遷移の判定・執行 | ✅ |
| **CleanerFish** | periphery/ | 蒸発ノードの後処理（プランクトン化） | ✅ |
| **Bookkeeper** | periphery/ | DB永続化 | - |

### 3.2 実行フロー

```
1. kingfisher.snapshot()      ← 状態記録
2. renalCore.tick()           ← 純粋物理のみ（TTL/Heat減衰）
3. arbiter.judge(projDB)      ← 状態遷移を執行
4. kingfisher.diff()          ← 変化を検出
5. bookkeeper.sync()          ← DB反映
```

### 3.3 協調関係

```
Kingfisher ──検出報告──→ Arbiter ──遷移結果──→ Bookkeeper
     ↑                      │                      │
     └──── ProjDB ←─────────┴──────────────────────┘
```

---

## 4. RenalCore の純粋化

### 4.1 削除すべきメソッド

```typescript
// RenalCore から削除
processAscension()    → Arbiter へ移動
processErosion()      → Arbiter へ移動
processFossilization() → Arbiter へ移動（存在する場合）
```

### 4.2 残すべきメソッド

```typescript
// RenalCore に残す
processDecay()        // TTL/Heat の減衰（Frozen フラグのみ参照）
evaporateNode()       // TTL <= 0 のノードを蒸発
```

### 4.3 Core Schema（設計原則）

```
for each tick:
  for each node in ProjectionDB:
    if node.flags & Frozen: continue    ← kind ではなく flags
    node.metrics.ttl -= node.metrics.d * loadFactor
    node.metrics.h   *= decayFactor

    if node.metrics.ttl <= 0:
      evaporate(node)
```

---

## 5. Arbiter 設計案

### 5.1 インターフェース

```typescript
/**
 * Arbiter: 状態遷移の審判者
 *
 * [Role] 昇天と風化を裁定し、状態遷移を執行する
 * [Principle] RenalCore が物理を実行し、Arbiter が遷移を裁定
 */
export class Arbiter {
  /**
   * ProjDB を走査し、状態遷移を執行
   */
  judge(projDB: Map<string, SphereNode>): JudgmentResult;
}

export interface JudgmentResult {
  ascended: SphereNode[];   // Active → Amber
  eroded: SphereNode[];     // Amber → Active
  fossilized: SphereNode[]; // Amber/Active → Fossil
}
```

### 5.2 遷移条件

| 遷移 | 条件 |
|------|------|
| Active → Amber | `heat > ASCENSION_HEAT` && `weight > ASCENSION_WEIGHT` |
| Amber → Active | `heat < EROSION_HEAT`（風化） |
| * → Fossil | `heat < FOSSIL_HEAT`（枯渇） |

### 5.3 フラグ同期

```typescript
// Ascension: Active → Amber
node.kind = "amber";
node.metrics.flg |= NodeFlag.Frozen;  // 代謝停止

// Erosion: Amber → Active
node.kind = "active";
node.metrics.flg &= ~NodeFlag.Frozen; // 代謝再開
```

---

## 6. 実装完了（2026-01-31）- 第2版

### 6.1 設計変更: キューイングパターン

**変更理由**: 責務分離の徹底
- Arbiter は「判定のみ」を担当（node.kind を変更しない）
- Bookkeeper が「実行」を担当（node.kind を変更 + DB永続化）
- Fossilization は CleanerFish が担当（Arbiter の責務外）

**変更理由**: RefDB への過剰アクセス防止
- Arbiter の判定をパルスタイミングに合わせる（バッチ処理）

### 6.2 ファイル構成

| ファイル | 内容 |
|----------|------|
| `periphery/src/arbiter/arbiter.ts` | Arbiter クラス（判定 + 検出） |
| `periphery/src/arbiter/index.ts` | エクスポート |
| ~~`periphery/src/kingfisher/`~~ | **削除** - Arbiter に統合 |

### 6.3 変更したファイル

| ファイル | 変更内容 |
|----------|----------|
| `renalCore/src/renalcore.ts` | 状態遷移メソッド削除 |
| `periphery/src/index.ts` | Arbiter 統合、パルスタイミング化 |
| `periphery/src/bookkeeper/bookkeeper.ts` | `applyTransitions()` 追加 |

### 6.4 実行フロー（最終版）

```typescript
// periphery/src/index.ts (heartbeat loop)

// 毎 tick
renalCore.tick(loadFactor);  // 物理演算（Decay のみ）

// パルスタイミング（observationInterval ごと）
if (shouldObserve) {
  const queue = arbiter.observe(projDB, { isPaused });  // 判定のみ
  await bookkeeper.applyTransitions(queue);              // 実行
  const changes = arbiter.diff(snapshot, projDB);        // 検出
  // CleanerFish 処理...
}
```

### 6.5 Arbiter の最終設計

```typescript
export class Arbiter {
  // 判定: TransitionQueue を返す（実行しない）
  observe(projDB, { isPaused }): TransitionQueue {
    return {
      shouldAscend: [...],  // Active/Link → Amber
      shouldErode: [...],   // Amber → Active
      shouldStrip: [...],   // Active → Link（ハック検知）
    };
  }

  // 検出: 事後の変化を検出
  diff(before, projDB): StateChanges { ... }
}
```

### 6.6 Bookkeeper の追加メソッド

```typescript
// Arbiter のキューを受け取り、状態遷移を実行
async applyTransitions(queue: TransitionQueue): Promise<void> {
  // 1. Ascension: Active/Link → Amber (+Frozen)
  // 2. Erosion: Amber → Active (-Frozen)
  // 3. Strip: Active → Link (+Catalyst)
  // 4. recordAscensions() → RefDB 更新
}
```

---

## 7. 責務分離（最終版）

| コンポーネント | 責務 | node.kind 変更 |
|---------------|------|----------------|
| **RenalCore** | 物理演算（TTL/Heat 減衰） | ❌ |
| **Arbiter** | 監視 + 判定（キューイング） | ❌ |
| **Bookkeeper** | 遷移実行 + DB永続化 | ✅ |
| **CleanerFish** | Fossilization + Planktonization | ✅ |

---

## 8. 2軸システム (2026-02-06 追記)

### 8.1 TTL 軸 vs h+w 軸

```
        ↑ h+w (関心)
        │
 Amber  │ h+w >= 1000  ← Ascension
 Zone   │
        │ h+w >= 200   ← Revival (Ghost/Fossil → Active)
        │
        │ h+w >= 50    ← Protection (CleanerFish スキップ)
        ├─────────────────→ TTL (時間)
        │
 Decay  │ Ghost (TTL <= 500) → Fossil (TTL <= 100) → End
 Zone   │
```

### 8.2 責務の明確化

| 軸 | 方向 | 担当 |
|----|------|------|
| TTL | 減少 → Ghost → Fossil → End | CleanerFish |
| h+w | 増加 → Protection → Revival → Amber | Arbiter |

### 8.3 Revival (Ghost/Fossil → Active) - 設計

**トリガー**: Ghost/Fossil の h+w が REVIVAL_THRESHOLD (200) を超えた場合

```typescript
// arbiter.ts:observe() に追加予定
for (const node of projDB.values()) {
  // ... existing checks ...

  // Revival 判定
  if ((node.kind === "ghost" || node.kind === "fossil") &&
      node.metrics.h + node.metrics.w >= REVIVAL_THRESHOLD) {
    queue.shouldRevive.push(node);
  }
}
```

**TTL リセット**:
- 復活時に TTL をデフォルト値 (86400) にリセット
- h+w は維持（評価の蓄積は資産）
- 凍結 TTL を引き継ぐと即座に Ghost 化してしまうため

**閾値設計**:
```typescript
REVIVAL_THRESHOLD = 200;     // Ghost/Fossil → Active
PROTECTION_THRESHOLD = 50;   // CleanerFish からの保護のみ
ASCENSION_THRESHOLD = 1000;  // Active → Amber
```

### 8.4 実装箇所

| 箇所 | 変更内容 |
|------|----------|
| `arbiter.ts:observe()` | Ghost/Fossil の h+w 監視 → `queue.shouldRevive` |
| `bookkeeper.ts` | `applyRevival()` 追加: `kind=active`, `TTL=defaultTTL` |
| `cleaner-fish.ts` | `shouldProtect()` 追加: h+w >= 50 なら遷移スキップ |
| `sphere.config.json` | `revival` セクション追加 |

### 8.5 設計メモ

詳細は [cleaner-fish.md](../services/periphery/src/cleaner-fish/cleaner-fish.md) を参照。

---

## 9. TODO（残タスク）

1. [ ] 用語集（用語集.txt）に Arbiter を追加
2. [ ] テストの更新
3. [ ] Revival 判定ロジック追加 (observe)
4. [ ] Bookkeeper.applyRevival() 実装
5. [ ] CleanerFish に shouldProtect() 追加
6. [ ] diff() に revived 検出追加
7. [ ] config に revival セクション追加

---

## 10. 用語集への追加案

```
審判者 (Arbiter) 実装概念：State Transition Detector / Queue Manager
ProjDB を監視し、状態遷移の候補を判定・キューイングする審判者。
RenalCore が物理演算を実行した後、Heat/Weight の閾値に基づいて
昇天（→Amber）・風化（→Active）の候補を判定する。
実際の状態変更は Bookkeeper が実行する。
パルスタイミングで動作（バッチ処理）。
```
