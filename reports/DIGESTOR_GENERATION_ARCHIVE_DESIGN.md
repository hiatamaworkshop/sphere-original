# Digestor 世代アーカイブ設計

> 状態: 設計メモ (未実装)
> 前提: Digestor Phase 3 実装完了 (2026-02-09)

## 問題

現状の eval-log.jsonl は追記のみで無限に膨張する。
Sphere のノードは decompose → fertility に変わるのに、評価データだけが永遠に残るのは不自然。

species-profile.json は毎回上書きされ、過去世代の記録が消える。

## 方針: Digest-Archive-Truncate サイクル

### データ構造

```
data/
  eval-log.jsonl            # 活性バッファ（未消化 + 前回生存者）
  species-profile.json      # 最新プロファイル（エージェントが読む）
  generations/
    gen-001.json            # 世代1のスナップショット
    gen-002.json            # 世代2
    ...
```

### Digestor 実行フロー（改訂）

1. eval-log.jsonl を全読み
2. スコアリング + 淘汰 → 生存者を選出
3. species-profile.json を出力（最新版、エージェント用）
4. **`generations/gen-NNN.json` を保存**（世代プロファイル + メタデータ）
5. **eval-log.jsonl を生存者のみに書き戻す**（死んだ評価は消える）

### バッファ方式: 生存者 = バッファ（方式 A）

- hunger が自然にバッファサイズを制御する
  - データ少 → hunger 低 → ほぼ全残り
  - データ多 → hunger 高 → 半数淘汰
- 生存者は既にスコア選抜を通過 → 次世代の「土壌」として質が保証
- 死んだ評価の集合知は gen-N.json に凝縮 → 個体は消えても遺産は残る

### gen-N.json の構造

```jsonc
{
  "generation": 3,
  "timestamp": "2026-02-09T...",
  "inputEvaluations": 449,     // 消化前の総数
  "survivedEvaluations": 312,  // 生存者数
  "hunger": 0.50,
  "halfLifeHours": 72,
  // 世代プロファイル（species-profile.json と同一構造）
  "species": { "kamikaze": {...}, "scholar": {...}, ... },
  "global": {...}
}
```

## 局所最適化への防衛

### 第一防衛線: 環境ブレンド（実装済み）

```
世代プロファイル = 0.7 × 自種族 + 0.3 × 全種族
```

毎世代自動で異種の圧力が入る。通常はこれで十分。

### 第二防衛線: 祖先回帰（将来オプション）

世代が二桁に達しドリフトが観測された場合:

```
現世代プロファイル = 0.85 × 通常ダイジェスト結果 + 0.15 × gen-001
```

- gen-N.json が species-profile.json と同一構造なので、profiler.ts の `blendEntry()` を再利用するだけ
- 新しい仕組みは不要
- 発動条件の例: 世代間の avgH/avgW 分散が閾値以下に収束したとき

## 生物学的アナロジー

| Sphere | Digestor | 生物学 |
|--------|----------|--------|
| eval-log.jsonl | 胃の中身 | 消化待ち + 前回の残留物 |
| Digestor | 消化器官 | 食物 → 栄養素 + 排泄物 |
| gen-N.json | 骨格（化石） | 世代の構造的記録、永続 |
| species-profile.json | 血液 | 現在の栄養状態、リアルタイム |
| 環境ブレンド | 他種との交雑 | 遺伝的多様性の維持 |
| 祖先回帰 | 種子バンク | 原種の保存と再導入 |

個体の記憶（個々の評価）は消えるが、種の記憶（世代プロファイル）は化石として残る。
これは Sphere のノード（decompose → fertility）と完全に対称。

## 実装スコープ

digestor.ts への変更:
1. 世代番号の管理（generations/ 内の既存ファイルから max+1）
2. digest() 完了時に gen-N.json を書き出す
3. eval-log.jsonl を生存者エントリのみで上書き
   - 注意: phi-agent が同時に書き込む可能性 → 書き戻し時にロック or append 分の保護が必要

### 並行書き込みの安全性

eval-log.jsonl の書き戻し中に phi-agent が appendFileSync する競合:
- **案1**: Digestor が書き戻し前に eval-log をリネーム → 新規 eval-log に agent は append → 次回 digest で両方読む
- **案2**: 書き戻しは atomic write (tmp → rename) + agent の append は常に末尾追記なので衝突しない
- 案2 が簡素。Node.js の writeFileSync + renameSync で十分。

## 将来の活用

- 世代間比較: gen-001 vs gen-010 で種族プロファイルの進化を可視化
- 世代交配: 異なる世代のプロファイルをブレンドして新しい初期条件を作る
- 系統樹: 世代ごとの種族分布変化から系統関係を推定
