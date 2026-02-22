# Sphere Metabolism — 設計大枠メモ

作成日: 2026-02-19

---

## 位置づけ

スフィア全体の代謝速度を三者ニューロンのシグナルから調整する恒常性機構。

- **スフィアレベル**: 全ノードに影響する decay preset / 代謝速度の制御
- **ノードレベル (免疫系)**: ノードが自身の状態を加減する設計 → 別設計、別議論

両者は独立。スフィア代謝はグローバル気候、ノード免疫はローカル防衛。

---

## 命名

現在の `metabolicAutoMode` という名前は廃止方向。

- "auto" は「オプション機能」のニュアンス
- これはスフィアの**固有の恒常性機構**であり、on/off するものではない
- 候補: **`sphereMetabolism`** / **Metabolic Regulator** / Homeostasis Controller

---

## シグナル源

三者ニューロンの既存出力を流用する。専用指標は現時点では未実装。

| シグナル | 発生源 | 意味 |
|---------|--------|------|
| `suspicion` | Meta neuron | 汚染レベル。高いほど排除が必要 |
| `vitality` | Soft neuron | スフィアの健全性。低いほど保護が必要 |
| `progress` | Hard neuron | 目標接近度。高いほど amber 候補を保全すべき |

---

## 代謝フェーズ (3 状態)

```
            suspicion 高
               ↓
           [ Purge ]  ── time-lock (N サイクル強制維持)
               ↓ (lock 解除後)
           [ Steady ]  ← default
          ↗           ↘
  progress 高           vitality 低
  or festival 後        (スフィアが弱っている)
           ↓
         [ Archive ]
```

### Purge (排除期)
- preset: `flow`
- 汚染ノードを焼き払う
- **time-lock**: 一度 Purge に入ったら最低 N サイクル維持。suspicion が回復しても即抜けできない
- time-lock がないと「物量攻撃 → suspicion 回復待ち → 聖域化強制」のエクスプロイトが成立する

### Steady (通常代謝)
- preset: `natural`
- デフォルト状態。特に異常なし

### Archive (保全期)
- preset: `archive`
- amber 候補を守る (progress ≥ threshold)
- または vitality が低くスフィアが弱っているとき (消耗期の保護)

---

## 現状の `metabolicAutoMode` との差分

| 項目 | 現在 | 将来 |
|------|------|------|
| 存在形式 | boolean on/off フラグ | 常時動作するサブシステム |
| 切り替え条件 | 優先順リスト (if/else) | シグナル合成 (ゆるやか) |
| Purge 解除 | suspicion 回復で即解除 | time-lock で排除期を保証 |
| 命名 | `metabolicAutoMode` | `sphereMetabolism` |

---

## 設計方針 (ゆるやかで良い)

- 精密なグラデーション制御より「大きな状態変化を見落とさない」程度で十分
- シグナルは三者ニューロンの既存出力を再利用。専用の代謝指標は実績が積まれてから追加
- 中間モード (`guarded` 等) は eval rate 指標が整ってから検討 → `META_NEURON_GAPS_NOTE.md` 参照

---

## 実装優先度

| 項目 | 優先度 | 条件 |
|------|--------|------|
| 命名変更 (`sphereMetabolism`) | 低 | リファクタリング時 |
| time-lock の追加 | 中 | 免疫系設計後、tainted amber と合わせて |
| シグナル合成への移行 | 低 | 聖域化 2〜3 回実績後 |
| 専用代謝指標の追加 | 低 | eval rate 等が必要になってから |

---

## 関連ドキュメント

- `META_NEURON_GAPS_NOTE.md` — suspicion decay エクスプロイト、guarded モード検討
- `SANCTIFICATION_REDESIGN_20260219.md` — 三者ニューロン設計
- 免疫系設計メモ (未作成) — ノードレベルの自律防衛
