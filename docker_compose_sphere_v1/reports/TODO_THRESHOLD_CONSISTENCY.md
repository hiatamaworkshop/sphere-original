# TODO: 閾値整合性の調整（重要）

**作成日**: 2026-02-01
**優先度**: 高
**関連変更**: traversal/stayTime 減衰の追加

---

## 問題の概要

`traversal` と `stayTime` に減衰を追加したことで、既存の閾値設定との整合性が崩れた可能性がある。

### 変更内容
```typescript
// renalcore.ts - 追加された減衰
node.metrics.traversal *= (1 - 0.005);  // 毎Tick 0.5% 減衰
node.metrics.stayTime  *= (1 - 0.005);  // 毎Tick 0.5% 減衰
```

### 影響を受ける閾値

| 閾値 | 現在値 | 用途 | 要確認 |
|------|--------|------|--------|
| `linkTraversalThreshold` | 10 | リンクノード生成条件 | **要調整** |
| `linkStayTimeThreshold` | 5 | リンクノード生成条件 | **単位不明** |
| `hackTraversalThreshold` | 50 | 不正検出（高通過低滞在） | **要調整** |
| `hackStayRatioThreshold` | 0.1 | 不正検出（滞在率） | 比率なので影響小 |

---

## 定常状態解析

減衰がある場合、メトリクスは「加算」と「減衰」の平衡点に収束する。

### 計算式
```
定常状態 = 加算量 / 減衰率
```

### traversal の例

| 訪問頻度 | 加算/Tick | 定常状態 | linkThreshold(10) | hackThreshold(50) |
|----------|-----------|----------|-------------------|-------------------|
| 毎 54 Tick | 0.0185 | 3.7 | 未達 | 未達 |
| 毎 27 Tick | 0.037 | 7.4 | 未達 | 未達 |
| 毎 10 Tick | 0.1 | 20 | **到達** | 未達 |
| 毎 5 Tick | 0.2 | 40 | **到達** | 未達 |
| 毎 1 Tick | 1.0 | 200 | **到達** | **到達** |

### stayTime の例

- 単位: ms（推定）
- 30ms/Tick で滞在した場合の加算量は不明
- **単位と加算ロジックの確認が必要**

---

## 推奨調整案

### 1. linkTraversalThreshold
```
現在: 10
推奨: 5〜8
理由: 減衰により定常状態が低下。有意義なリンクを生成するには閾値を下げる必要あり
```

### 2. hackTraversalThreshold
```
現在: 50
推奨: 30〜40
理由: 減衰により高頻度訪問でないと到達不能。不正検出の感度を維持するため
```

### 3. linkStayTimeThreshold
```
現在: 5
問題: 単位が不明（ms? 秒? Tick数?）
TODO: stayTime の加算ロジックを確認し、単位を明確化
```

---

## 作業チェックリスト

- [ ] `linkTraversalThreshold` の調整（5〜8 を検討）
- [ ] `hackTraversalThreshold` の調整（30〜40 を検討）
- [ ] `stayTime` の単位と加算ロジックを確認
- [ ] `linkStayTimeThreshold` の適切な値を決定
- [ ] 調整後の動作テスト
- [ ] sphere.config.json の更新

---

## 関連ファイル

- [sphere.config.json](../sphere.config.json) - 閾値定義
- [renalcore.ts](../services/renalCore/src/renalcore.ts) - 減衰実装
- [RENALCORE_REFACTOR_MEMO.md](./RENALCORE_REFACTOR_MEMO.md) - 減衰追加の経緯

---

## 備考

この問題は「減衰なしで設計された閾値」と「減衰ありの新実装」の不整合である。
リンク生成や不正検出が期待通りに動作しない可能性があるため、本番運用前に調整が必要。

---

## 設計変更（2026-02-02）: Link 生成は共起ベースへ移行

### 結論

`linkTraversalThreshold` と `linkStayTimeThreshold` は **Link 生成には使用しない**。

### 理由

1. 個別ノードの traversal/stayTime は「そのノードがどれだけ通過されたか」を示す
2. Link は Amber 間の「関連性」を示すものであり、個別メトリクスでは測れない
3. 新設計: **セッション共起（Co-occurrence）** で Amber ペアの関連性を直接測定

### 新設計の概要

```
AutoCapsule.visits から Amber 訪問を抽出
    ↓
同一セッション内の Amber ペアを共起カウント
    ↓
共起回数が閾値を超えたペア → Link 候補
```

詳細: [TODO_LINK_NODE_EXTERNAL_GENERATION.md](./TODO_LINK_NODE_EXTERNAL_GENERATION.md) 参照

### 閾値の再分類

| 閾値 | 用途 | 状態 |
|------|------|------|
| `linkTraversalThreshold` | ~~Link 生成~~ | **廃止予定** |
| `linkStayTimeThreshold` | ~~Link 生成~~ | **廃止予定** |
| `hackTraversalThreshold` | 不正検出（Active→Link 降格） | **要調整** |
| `hackStayRatioThreshold` | 不正検出 | 比率なので影響小 |
| `linkCoOccurrenceThreshold` | Link 生成（共起ベース） | **新設** |
| `coOccurrenceDecayRate` | 共起カウント減衰 | **新設** |

### 残作業

- [ ] `hackTraversalThreshold` の調整（30〜40 を検討）
- [ ] 共起ベース Link 検出の実装
- [ ] 旧 `linkTraversalThreshold` / `linkStayTimeThreshold` を config から削除
