# コードクリーンアップ + Git 修復メモ — 2026-02-23

## 1. コードクリーンアップ

### phi-agent

| ファイル | 変更 | 理由 |
|---------|------|------|
| `agent.ts` | `scanL1(10)` → `scanL1()` (デフォルト半径) | 半径拡大は設計意図に反する。検出 0 件なら move (flow fallback) が正しい |
| `agent.ts` | `postRatio` → `currentRatio` | ループ先頭の `energyRatio` との混同防止 |
| `fast-gate.ts` | `text` → `searchText` | 汎用名すぎた。検索テキストであることを明示 |
| `fast-gate.ts` | species tag matching: exact → substring | クエリトークンは substring なのに species tag だけ exact だった。統一 |
| `fast-gate.ts` | `computeReturnDesire` + `feelingsDebug` → `computeFeelings` | 4D feelings 計算が 2 箇所に重複。単一メソッドに統合 |
| `fast-gate.ts` | stale TODO (Compressed/Candidate flags) 削除 | 実装済みフラグの TODO が残っていた |
| `fast-gate.ts` | orphan Arbiter コメント削除 | 未使用の参照コメント |

### digestor

| ファイル | 変更 | 理由 |
|---------|------|------|
| `scoring.ts` | `prune()` 確率クランプ: `Math.min(1, ...)` 追加 | threshold ≈ 0 の時に prob > 1.0 になるバグ |

### periphery

| ファイル | 変更 | 理由 |
|---------|------|------|
| `gateway-server.ts` | `processingConnections: 0` 削除 | 常に 0 を返すデッドフィールド |
| `server.ts` | `process.memoryUsage.rss()` → `process.memoryUsage().rss` | 型エラー (関数呼び出し漏れ) |
| `server.ts` | dead `/stats` エンドポイント削除 | 呼び出し元なし。`{service, uptime}` のみ返す無意味な重複 |
| `server.ts` | `/sphere/status` 統合エンドポイント追加 | 詳細は `UNIFIED_STATUS_ENDPOINT_20260223.md` |

### sphere-ui

| ファイル | 変更 | 理由 |
|---------|------|------|
| `app.js` | ダッシュボード polling: 2 fetch → 1 fetch (`/sphere/status`) | `/nodes/stats` + `/metrics` の重複 fetch を統合 |

---

## 2. Git 修復 — ollama-models 2GB blob 除去

### 症状

```
git push origin main
→ remote rejected: File ollama-models/models/blobs/sha256-633fc5... is 2075.36 MB
   exceeds GitHub's file size limit of 100.00 MB
```

### 原因

コミット `13f4399` (move fallback) で `ollama-models/` ディレクトリが誤ってコミットされた。

含まれていたファイル:
- `ollama-models/models/blobs/sha256-*` — Ollama LLM モデル blob (計 ~2GB)
- `ollama-models/id_ed25519` — SSH 秘密鍵 (セキュリティリスク)
- `ollama-models/models/manifests/` — モデルマニフェスト

### 対処

1. `.gitignore` に `ollama-models/` を追加
2. `backup/futurePreparation`, `backup/main` ブランチを作成 (安全網)
3. `git filter-branch --index-filter` で `futurePreparation` の 74 コミットから `ollama-models/` を除去
4. `main` を `origin/main` にリセット後、書き換え済み `futurePreparation` を再マージ
5. `.gitignore` コミットを両ブランチに追加
6. `git push origin main` — fast-forward push 成功
7. バックアップブランチ削除 + `git gc --prune=now` で旧 blob 回収

### 結果

- `origin/main` push 成功: `4208af6..9020975`
- `futurePreparation` の `origin` は未 push (次回 `--force-with-lease` 必要)
- ローカル GC 完了。2GB blob は回収済み

### 注意事項

- **SSH 秘密鍵 (`id_ed25519`) が履歴に含まれていた**: GitHub に push されていないため漏洩リスクは低いが、このキーが実運用で使われている場合はローテーション推奨
- `futurePreparation` を `origin` に push する際は `git push --force-with-lease origin futurePreparation` が必要 (履歴が書き換えられているため)
