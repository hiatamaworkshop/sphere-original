# 作業メモ — モデル比較テスト

**作成日**: 2026-02-09
**状態**: ベースラインデータ保存完了、qwen2.5:0.5b テスト準備完了

---

## 現在の状態

✅ **完了したこと:**
1. ベースラインデータを `test-results/baseline-llama3.2-1b/` に保存
   - eval-log-docker.jsonl (93 sessions)
   - gen-001.json (世代1アーカイブ)
   - species-profile.json
   - summary.md (統計サマリー)
2. phi-agent イメージを再ビルド（num_ctx の変更を削除、純粋なモデル入れ替え）
3. Explorers UI に qwen2.5:0.5b, phi3.5:mini を追加（Model ドロップダウン）
4. テスト用ディレクトリ構造を作成
   - `test-qwen2.5-0.5b/` (空)
   - `test-phi3.5-mini/` (空)

🔧 **現在の設定:**
- phi-agent: Docker イメージ最新 (num_ctx チューニングなし)
- Explorers: http://localhost:7860 で稼働中
- Sphere: Docker Compose で periphery + renalCore 稼働中
- Ollama: host.docker.internal:11434 でアクセス可能

---

## 次にやること

### Phase 1: qwen2.5:0.5b テスト

**目的**: 0.5B モデルで種族性が保たれるか、速度はどうか

**手順:**

1. **モデルを pull**:
   ```bash
   ollama pull qwen2.5:0.5b
   ```
   約 350MB、数分で完了

2. **Explorers UI でテスト実行** (http://localhost:7860):
   - Model: `qwen2.5:0.5b` を選択
   - Species: `balanced` で 1回実行
   - Query: `knowledge exploration` (デフォルト)
   - ⏱️ **実行時間を計測** （開始〜完了まで）
   - 📊 **Summary を記録**: avgH, avgW, avgD, サイクル数

3. **3種族で追加テスト** (種族性の確認):
   - `hunter` — heat seeker (avgH が高いはず)
   - `hermit` — stability seeker (avgD が高いはず)
   - `scholar` — weight lover (avgW が高いはず)
   - 各1回ずつ実行、Summary を記録

4. **結果を保存**:
   ```bash
   # phi-agent/data/ ディレクトリで実行
   cp eval-log.jsonl test-results/test-qwen2.5-0.5b/
   # 最新の評価データのみ抽出（4セッション分）
   tail -4 eval-log.jsonl > test-results/test-qwen2.5-0.5b/eval-log-qwen-test.jsonl
   ```

5. **summary.md を作成**:
   ```bash
   # test-results/test-qwen2.5-0.5b/summary.md
   # balanced, hunter, hermit, scholar の avgH/avgW/avgD を記録
   # 実行時間、種族差の有無、スコアの妥当性を評価
   ```

### Phase 2: 比較分析

**比較メトリクス:**

| メトリクス | baseline (llama3.2:1b + phi3:mini) | qwen2.5:0.5b | 判定 |
|-----------|-----------------------------------|--------------|------|
| 実行時間 | ~1分 | ??? | ⏱️ |
| avgH 範囲 | 5.2-6.6 | ??? | 📊 |
| avgW 範囲 | 5.5-7.7 | ??? | 📊 |
| avgD 範囲 | 3.5-4.0 | ??? | 📊 |
| hunter の avgH | ~6.0 | ??? | 🧬 |
| scholar の avgW | 7.71 | ??? | 🧬 |
| hermit の avgD | ~4.0 | ??? | 🧬 |

**判定基準:**
- ✅ **合格**: 実行時間 <40秒 AND 種族差が維持 (hunter > balanced の avgH など)
- ⚠️ **要検討**: 実行時間は速いが種族差が消失 → evalFocus の調整が必要
- ❌ **不合格**: スコアが異常 (全て 10 または 0) → モデルが指示を理解していない

### Phase 3: phi3.5:mini テスト（オプション）

qwen2.5:0.5b の結果次第で実施:
- qwen が ✅ → phi3.5:mini も試す
- qwen が ⚠️ or ❌ → 別の最適化を検討（num_ctx 削減、evalFocus 簡素化）

---

## 重要な注意点

### 🚨 チューニングは後回し

- **今回**: 純粋なモデル入れ替えのみ（num_ctx などのチューニングなし）
- **理由**: 変数を1つに絞る → 何が効いたか明確になる
- **後**: モデル確定後に num_ctx 512 などの最適化を適用

### 📁 データ保存のルール

- **eval-log.jsonl**: テスト後すぐにバックアップ（上書きされるため）
- **summary.md**: 必ず作成（数値だけでなく所感も記録）
- **ファイル名**: モデル名を含める（例: eval-log-qwen-test.jsonl）

### 🧬 種族性の確認方法

**最低限の確認:**
- hunter の avgH > balanced の avgH （heat chaser の証拠）
- scholar の avgW > balanced の avgW （weight lover の証拠）

**理想的な確認:**
- 全9種族でテスト → gen-002.json を生成 → Generations タブで可視化

---

## トラブルシューティング

### ケース1: "No structured data found"
- phi-agent のログを確認: `docker logs <container-id>`
- Ollama が応答しているか: `curl http://host.docker.internal:11434/api/tags`
- モデルが pull されているか: `ollama list`

### ケース2: スコアが全て 10 or 0
- モデルが JSON format 指示を無視している
- 対策: evalFocus を簡素化、または format:json を削除してパーサーで抽出

### ケース3: 実行が途中で止まる
- Ollama のメモリ不足
- 対策: 他のモデルを停止、Docker のメモリ制限を確認

---

## 参考ファイル

- `test-results/baseline-llama3.2-1b/summary.md` — ベースライン統計
- `test-results/README.md` — テストプロトコル
- `MEMORY.md` — プロジェクト全体の設計判断ログ
- `reports/DATA_ACCUMULATION_20260209.md` — 過去のデータ蓄積セッションの知見

---

## 次のセッションで最初に確認すること

1. Docker Desktop が起動しているか
2. Sphere (periphery) が稼働しているか: `docker ps | grep periphery`
3. Explorers が稼働しているか: `docker ps | grep explorers`
4. Ollama が応答するか: `curl http://localhost:11434/api/tags`
5. qwen2.5:0.5b が pull されているか: `ollama list | grep qwen2.5:0.5b`

すべて OK なら Phase 1 のステップ 2 から開始。

---

**最終更新**: 2026-02-09 20:30
**次のアクション**: `ollama pull qwen2.5:0.5b` → Explorers でテスト実行
