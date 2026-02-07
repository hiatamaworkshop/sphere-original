# エージェント評価制約の実装

**日付**: 2026-02-06
**状態**: 実装完了

## 設計思想

- 1ノード1評価: スパム防止
- 手持ちデータのみ評価可能: 未知のIDを直接操作させない

## 追加した制約

| 制約 | チェック | エラー reason |
|------|----------|---------------|
| 同一ID複数評価禁止 | `_evaluatedIds.has(nodeId)` | `already_evaluated` |
| 手持ちデータのみ | `_visibleNodes.has(nodeId)` | `not_in_possession` |

## 実装箇所

| ファイル | 変更内容 |
|----------|----------|
| `sphere-context.ts` | `_evaluatedIds: Set<string>` 追加、evaluate() に制約チェック追加 |
| `experience-layer.ts` | `EvaluationResult.reason` に新型追加 |

## 動作フロー

```
evaluate(nodeId)
  │
  ├─ _evaluatedIds.has(nodeId)?
  │   → true: return { success: false, reason: "already_evaluated" }
  │
  ├─ _visibleNodes.has(nodeId)?
  │   → false: return { success: false, reason: "not_in_possession" }
  │
  ├─ consumeEnergy()
  │
  ├─ handleLayerEvaluation()
  │
  └─ addEvaluationToBuffer() + _evaluatedIds.add(nodeId)
```

## 関連: _visibleNodes の管理

- `sense()`: `_visibleNodes` を更新（新しい近傍ノードで上書き）
- `focus()`: `_visibleNodes.has(nodeId)` をチェック
- `warp()`: `_visibleNodes.clear()` で初期化
- `move()`: `_visibleNodes.clear()` で初期化

## 同日の他の変更

### Amber heat リセット
- Ascension 時に `h = 100` にリセット（sense/scanL1 支配防止）
- heat 継承を削除（weight のみ継承）

---

## 解決済み: Amber 評価のパラドックス (2026-02-06)

**パラドックス**:
```
Amber: h = 100, Frozen = true
Erosion 条件: h < 100
Frozen = 評価も decay もなし
→ h は永遠に 100 のまま → Erosion 不可能
```

**解決策**: 案A採用 - Frozen = **decay停止のみ** (評価は受け付ける)
- 現行コードは applyEvaluations() で Candidate のみ除外、Frozen は除外しない
- 「琥珀の降格もエージェント評価に委ねる」= Sphere の原則

**Heat 管理** (bookkeeper.ts):
| 定数 | 値 | 目的 |
|------|-----|------|
| AMBER_DEFAULT_HEAT | 200 | Ascension 時の初期値 |
| AMBER_MAX_HEAT | 500 | 上限（sense/scanL1 支配防止）|
| erosionHeatThreshold | 100 | h < 100 で Erosion |

**フロー**:
```
Ascension: h = 200
    ↓
評価受付 (Frozen = decay停止のみ)
    ├─ 高評価 (h=10): h += 25 → max 500
    └─ 低評価 (h=0): h -= 25
    ↓
h < 100 → Erosion (Amber → Active)
```
