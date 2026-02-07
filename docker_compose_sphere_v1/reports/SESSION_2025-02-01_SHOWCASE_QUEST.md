# Session Memo: Showcase & Quest 設計

**日付**: 2025-02-01
**作業内容**: Showcase と Quest システムの設計確定

---

## 完了した設計

### 1. Quest システム

- Quest = テキストオブジェクト（ノードではない）
- Quest Store に保存（ProjDB ではない）
- Parser が questVector を生成 → エージェントを近傍へガイド
- FIFO / TTL で消滅

### 2. 二種類の Showcase

| 種類 | 配信タイミング | 用途 |
|------|---------------|------|
| Quest Showcase | welcome 時（即座） | 依頼を選ぶ |
| Amber Showcase | Parser 待機中 | 待ち時間のだまし |

### 3. フロー確定

```
welcome (Quest) → ready → Membrane検閲 → Parser
                              ↓
                       amber_showcase (待機中)
                              ↓
                          positioned
```

### 4. Amber Cache 設計

| 枠 | デフォルト | 用途 |
|----|------------|------|
| Showcase | 30 (config) | 配信用（固定） |
| Dynamic | 70 (config) | focus 高速化（FIFO） |
| 合計 | 100 | ~50KB |

- サイズは `PeripheryConfig.amberCache` で設定（ハードコード禁止）
- Showcase ノードへの focus → 必ずキャッシュヒット
- Dynamic = Showcase 外の琥珀用

---

## 成果物

- [SHOWCASE_QUEST_DESIGN_MEMO.md](./SHOWCASE_QUEST_DESIGN_MEMO.md) - v6 確定

---

## 未実装（次のステップ）

| 項目 | 優先度 |
|------|--------|
| Quest Store 実装 | 高 |
| welcome メッセージ実装 | 高 |
| Amber Cache 実装 | 高 |
| amber_showcase メッセージ実装 | 高 |
| ready/positioned メッセージ実装 | 高 |
| POST /quest エンドポイント | 中 |
| Quest 完了判定ロジック | 低 |

---

## 設計上の重要ポイント

1. **Quest は ProjDB に保存しない** — 探索依頼であり、ノードではない
2. **Membrane 検閲 → Parser** — 正規化データをベクトル化
3. **Amber Showcase は Parser 待機中** — 待ち時間のだまし
4. **Showcase ノード = 人気ノード = focus キャッシュ済み** — 自然な最適化
5. **ID 指定アクセスの価値** — Agent は amber_showcase で ID を受け取っている
   - move/focus 時に ID 指定 → O(1) 確定ヒット
   - DB クエリ不要
   - `Map<nodeId, AmberCacheEntry>` でインデックス化推奨
6. **ID 指定移動 = ワープ → 制限対象** — 空間を無視した瞬間移動
   - 通常移動（座標指定）と本質的に異なる
   - Rulebook に warp 制限の追加が必要
   - **決定**: showcaseExempt=false（例外なし）、toward は制限対象外
