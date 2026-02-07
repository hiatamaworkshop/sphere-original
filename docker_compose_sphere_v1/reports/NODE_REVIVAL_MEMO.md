# Fossil Revival ロジック実装

**日付**: 2026-02-06
**状態**: 実装完了

## 設計思想

- h×w 積: 単発評価では達成不可（両メトリクス必要）
- d 安定性ゲート: 複数回「安定」と評価された証拠
- 保護閾値: h+w >= 100 で CleanerFish から保護

## 閾値 (sphere.config.json `arbiter.revival`)

```json
{
  "threshold": 2500,        // h × w
  "dThreshold": 800,        // d <=
  "protectionThreshold": 100 // h + w for decompose protection
}
```

## 復活に必要な評価回数

約8回 (h=10, w=10, d=0 評価で)

| 評価回数 | h | w | d | h×w | 復活? |
|---------|---|---|---|-----|-------|
| 5回 | 125 | 60 | 875 | 7,500 | 不可 (d>800) |
| 8回 | 200 | 80 | 800 | 16,000 | **可** |

*評価係数: h×5, w×2, d×5 (neutral=5)*

## 実装箇所

| ファイル | 変更内容 |
|---------|---------|
| `arbiter.ts` | `shouldRevive()` + `TransitionQueue.shouldRevive[]` |
| `bookkeeper.ts` | Revival 処理 (TTL=86400 リセット) |
| `cleaner-fish.ts` | `shouldProtect()` で decompose 保護 |
| `index.ts` | config 読み込み、transitionThresholds 設定 |

## TTL 扱い

- Fossil 化時: TTL 継続減少（凍結しない）
- 復活時: TTL = 86400 (normal tier) にリセット
- h, w, d は維持（評価の蓄積は資産）

## 復活フロー

```
Fossil (TTL 継続減少)
    ↓ Agent が nearbyGhosts で発見
    ↓ ExperienceCapsule.evaluations で評価
Bookkeeper.applyEvaluations()
    ↓ h++, w++, d--
Arbiter.observe()
    ↓ h×w >= 2500 && d <= 800 → shouldRevive
Bookkeeper.applyTransitions()
    ↓ kind = "active", TTL = 86400
Active (通常代謝再開)
```

## 関連メモ

- `cleaner-fish/cleaner-fish.md` に詳細設計あり
