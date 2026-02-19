# Sanctuary Sphere — 設計メモ

作成日: 2026-02-19

---

## 体験フロー概要

```
Tutorial Sphere
  ↓ (エージェントが貢献し、スフィアが成熟)
Sanctification (聖域化)
  ↓ (amber ノードが聖域スナップショットとして刻まれる)
Sanctuary Sphere (聖域スフィア)
  ↓ (外部エージェント / psi-agent が聖域内を探索)
Core Sphere (コアスフィア) ← まだ未設計
```

現状: Tutorial→Sanctification の部分が実装進行中。Sanctuary→Core の接続は未設計。

---

## Sanctuary Sphere の実装方針

### 基本方針: 単一 DB + フィルター層

物理的なDB分離は行わない。同一の referenceDB を使い、FastGate のフィルターで
「聖域モードのセッションには amber ノードのみを見せる」。

### 実装コンポーネント

#### 1. Sanctuary Snapshot (聖域スナップショット)

**タイミング**: 聖域化発火 → `sanctificationNeuron.reset()` 呼び出し直後

**処理** (`index.ts` の `// TODO: Sanctuary snapshot` 部分):
```typescript
// 現在の amber ノードを referenceDB でフラグ付き保存
for (const [id, node] of referenceDB.entries()) {
  if (node.kind === "amber") {
    node.sanctuaryEpoch = currentEpoch;  // epoch N の刻印
    referenceDB.set(id, node);
  }
}
console.log(`[Sanctuary] Snapshot taken: epoch=${currentEpoch}, amberCount=${N}`);
```

**特性**:
- 聖域化時点の amber が永続的に刻まれる
- 次のエポックで別の amber が生まれても今の聖域に入らない
- 因果保全: 聖域は過去の成果の確定的な記録

#### 2. ReferenceDB の型拡張

```typescript
interface ReferenceNode {
  // 既存フィールド...
  sanctuaryEpoch?: number;  // 何番目の聖域化で刻まれたか (未設定=通常ノード)
}
```

#### 3. FastGate フィルター (聖域モード)

セッションが sanctuaryMode=true の場合:
```typescript
// explore / scanL1 / sense での結果を制限
const results = referenceDB.filter(node =>
  node.sanctuaryEpoch !== undefined &&
  node.sanctuaryEpoch === session.sanctuaryEpoch
);
```

#### 4. Dive Ticket の拡張

```typescript
interface DiveTicket {
  // 既存フィールド...
  sanctuaryMode?: boolean;   // 聖域フィルターを適用するか
  sanctuaryEpoch?: number;   // 対象エポック (省略時=最新)
}
```

エージェント接続時にチケットを確認し、FastGate がモードを適用する。

---

## 動的トグル

セッション単位でフィルターを切り替える。

- **外部エージェント**: Dive Ticket 発行時に `sanctuaryMode: true` を指定
- **psi-agent**: 起動時の環境変数 or 設定で `SANCTUARY_MODE=true`
- **切り替え**: 次のセッション/接続で別の Dive Ticket を使えばモードが変わる

---

## 現在の実装状況

| 項目 | 状態 | 備考 |
|------|------|------|
| Sanctification Neuron (三者合意) | ✓ 実装済み | Hard/Soft/Meta |
| Amber 昇格 (Arbiter) | ✓ 実装済み | scoreThreshold=1100 |
| Festival period | ✓ 実装済み | Soft buffer 再充填 |
| **Sanctuary Snapshot** | △ TODO のみ | `// TODO` コメントあり |
| **ReferenceDB sanctuaryEpoch** | ✗ 未実装 | 型拡張が必要 |
| **FastGate 聖域フィルター** | ✗ 未実装 | |
| **Dive Ticket sanctuaryMode** | ✗ 未実装 | |
| Core Sphere | ✗ 未設計 | |

---

## 未解決の設計課題

### Core Sphere とは何か

Tutorial Sphere で生まれた聖域を「核」として、Core Sphere では何が変わるのか未定義。

候補の方向性:
- 聖域 amber が「知識の種」としてさらに深い探索の出発点になる
- Core では通常エージェントは入れず、psi-agent のみが探索できる
- 聖域スフィアを複数重ねてコアに近づくほど純化される（階層的聖域）

### 聖域降格

一度聖域化した amber が後に評価で降格 (erode) した場合、
その amber の `sanctuaryEpoch` フラグはどうするか。
- 案A: フラグは維持（歴史的記録として不変）
- 案B: フラグを除去（現在の聖域からは除籍）

→ 聖域の「過去の確定的な記録」という性質を考えると案A が自然。
ただし Bookkeeper での amber 昇格/降格処理と整合させる必要がある。

### 複数エポックの可視性

エポック3の聖域にアクセスするエージェントは、
エポック1・2の amber も見えるべきか、最新のみか。

→ デフォルトは最新エポックのみ。過去エポックへのアクセスはオプション。

---

## 実装優先度

1. **Sanctuary Snapshot** — 聖域化が動作するようになったら最初に実装
2. **ReferenceDB 型拡張** — Snapshot と同時
3. **FastGate フィルター** — Snapshot の次
4. **Dive Ticket 拡張** — FastGate フィルターの後
5. **Core Sphere 設計** — 聖域化が 2〜3 回実績を積んでから
