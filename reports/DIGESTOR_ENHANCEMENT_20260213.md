# Digestor Enhancement (2026-02-13)

## 作業内容

### 1. configHash truncation バグ修正
- **問題**: eval-log.jsonl に書き込まれた `configHash` が Digestor の truncation サイクルで消失していた
- **原因**: `FlatEval` に `configHash` が含まれず、`rebuildEntries()` でグループに保存されなかった
- **修正箇所**:
  - `digestor/src/scoring.ts`: `FlatEval` に `configHash?: string` 追加
  - `digestor/src/digestor.ts`: `flatten()` で `configHash` を伝搬、`rebuildEntries()` のグループとエントリに含める

### 2. evaluation_consistency 実装
- **定義**: 同一ノードを異なるセッションで再評価した際の h/w/d スコアの一致度
- **目的**: センサー精度の定量化 — 「このエージェントの測定は信頼できるか？」
- **計算**: `score = 1 - meanStd / 4.0` (0=ランダム, 1=完全一致)
  - nodeId ごとに h/w/d の population stddev を算出
  - 2回以上評価されたノードのみ対象
  - 4.0 = 1-9 スケールでの実質最大標準偏差
- **実装場所**: `digestor/src/profiler.ts` の `aggregateGroup()`
- **ブレンドしない**: consistency はセンサー固有の指標 → 環境ブレンド (0.7/0.3) の対象外
- **出力**: `SpeciesEntry.evaluationConsistency` に格納
  ```json
  {
    "score": 0.90,
    "nodes": 2,
    "meanStdH": 0.25,
    "meanStdW": 0.75,
    "meanStdD": 0.25
  }
  ```
- **自動的に gen-NNN.json と species-profile.json に含まれる** (SpeciesEntry の一部)

### 3. gen-009 テスト結果
- 60 evaluations, 28 sessions, 8 species (hermit 不在)
- hunger=0.2 → 淘汰なし (60/60 survived)
- sphereHash=null (Periphery 未起動)
- consistency データ:
  - hunter: 0.90 (2 nodes) — 安定センサー
  - sniper: 0.79 (1 node) — w にブレあり
  - 他6種: revisited nodes なし (データ不足)

## 注意点・教訓

### ローカルテスト手順 (⚠️ 必読)
- **テスト手順は `TESTING_MEMO.md` Section 15 に記載済み**
- ポート: `PORT=3001` で same-port モード推奨 (デプロイ環境に合わせる)
- `--sessions N` フラグは**存在しない** — 数字がクエリとして解釈され QUERY_TOO_SHORT
- daemon 停止は手動 Ctrl+C のみ
- テスト終了時に必ず `Stop-Process -Name node -Force` でプロセス殺す
- 詳細: `docker_compose_sphere_v1/services/periphery/src/mock/TESTING_MEMO.md` Section 15

### Windows 環境でのコマンド実行
- **PowerShell env**: `$env:VAR='value'` (git-bash の `VAR=value cmd` は動かない場合がある)
- **bash (git-bash) env**: `VAR=value node script.js` (一行なら動く)
- **`set` + `&&` チェーン**: Windows cmd では環境変数が伝搬しないことがある
- **パス区切り**: バックスラッシュの `\\` エスケープが必要な場面あり (node -e 内)
- **taskkill**: git-bash の `/PID` がフラグ解釈されるため `cmd //c "taskkill /PID xxx /F"` が安全

### Digestor ローカル実行
```bash
# bash (git-bash) で one-shot 実行
cd digestor
DATA_DIR="../phi-agent/data" ONCE=1 MIN_EVALS=10 SPHERE_URL="http://localhost:3001" node dist/digestor.js
```
- `ONCE=1` を忘れると daemon ループに入り IO Gateway がポート 5000 を占有する
- 前回の Digestor プロセスが残っていると `EADDRINUSE :5000` で失敗する
- `MIN_EVALS` を下げないとスキップされる (default 50)

### evaluation_consistency の制約
- **revisited nodes が必要** — 同一ノードが2回以上評価されないと計算不能
- 60 evals では 8 種族中 2 種族のみ計測可能だった
- **200+ evals で全種族計測可能になる見込み** (daemon テストで確認予定)
- consistency はモデル×種族の組み合わせで意味が変わる
  - スタンプモデル (smollm, qwen 0.5b): consistency=1.0 になるが**意味がない** (常に同じ値)
  - 測定モデル (phi3:mini): 適度な consistency (0.7-0.9) が理想

### configHash の意味
- `loadout:model:evalFocus` の SHA256 先頭 12 文字
- 同一 configHash = 同一設定で取得された評価 → 再現性の追跡に使える
- truncation で消失するバグがあったが修正済み
