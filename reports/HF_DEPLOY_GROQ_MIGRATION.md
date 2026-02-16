# hf-deploy: Groq API 移行

**Date**: 2026-02-16
**Goal**: デプロイ版 Explorers でエージェントの評価 (h/w/d) を正常動作させる
**Branch**: `hf-deploy`
**Status**: 実装完了・push 済み・動作確認待ち

---

## 問題と解決

- HF Inference API + SmolLM3-3B → JSON を返せない → `h=undefined`
- **解決**: Groq API に切り替え — `response_format: { type: "json_object" }` で JSON 強制

---

## 実施済み作業 (2026-02-16)

### コード変更

| ファイル | 変更内容 |
|---------|---------|
| `phi-agent/src/groq-client.ts` | **新規作成** — Groq API クライアント、`response_format` 対応 |
| `phi-agent/src/index.ts` | `createLlmClient()` に `groq` 分岐追加 |
| `phi-agent/src/llm-client.ts` | コメント更新 (GroqClient 追加) |
| `explorers/app.py` | モデルリスト Groq に差替、auto-wake on page load 追加 |
| `explorers/executor_subprocess.py` | 環境変数 `GROQ_API_KEY` / `GROQ_MODEL` に差替 |
| `Dockerfile` | `LLM_BACKEND=groq`, `GROQ_MODEL=llama-3.1-8b-instant`, gen-012 バンドル |

### コミット

- `c7636ea` — Switch LLM backend from HF Inference to Groq API
- `769e855` — Auto-wake Sphere on page load
- → HF Spaces (`hf` remote) に push 済み

### ローカルテスト結果

```
moth — 3 cycles, 3 evaluations, 9.0s
  Cycle 1: Multi-modal AI fusion    → h=8 w=9 d=2 ✅
  Cycle 2: Vector databases          → h=8 w=9 d=2 ✅
  Cycle 3: RLHF                      → h=8 w=7 d=2 ✅
  Narrative: 1205 chars ✅
  Species memory: persisted ✅
  ActiveBus: 3 emits / 3 recvs ✅
```

---

## デプロイ動作確認チェックリスト

```
□ HF Spaces のビルドが成功しているか (Docker build log)
□ GROQ_API_KEY が Secrets に登録されているか
□ SPHERE_URL が Render の URL を指しているか
□ ページを開いた時に Sphere が自動で起きるか (auto-wake)
□ Launch Agent で h/w/d が数値で返るか (not undefined)
□ Narrative が生成されるか
□ 70b モデル (llama-3.3-70b-versatile) でも動くか
□ Generations タブに gen-005, gen-011, gen-012 が表示されるか
```

---

## Groq API 仕様メモ

| 項目 | 値 |
|------|-----|
| API Base | `https://api.groq.com/openai/v1/chat/completions` |
| 認証 | `Authorization: Bearer $GROQ_API_KEY` |
| JSON 強制 | `response_format: { type: "json_object" }` |
| デフォルトモデル | `llama-3.1-8b-instant` (8B, 14,400 RPD, 6,000 TPM) |
| 大型モデル | `llama-3.3-70b-versatile` (70B, 1,000 RPD) |
| 無料枠 | 永続、カード不要 |
| Rate limit | 30 RPM — 1セッション(6 requests)は余裕 |

## トラブルシューティング

### h=undefined が出る場合
- `GROQ_API_KEY` が Secrets に正しく設定されているか
- `LLM_BACKEND=groq` が環境変数にあるか
- Groq API の rate limit (429) に当たっていないか → ログ確認

### Sphere に接続できない場合
- Render がスリープ中 → ページ開いて 60 秒待つ (auto-wake)
- `SPHERE_URL` が正しいか (末尾スラッシュなし)
- Render のサービスが stopped になっていないか (ダッシュボード確認)

### ビルドエラーの場合
- `gen-012.json` が存在するか (hf-deploy ブランチに存在するか確認)
- `phi-agent/package.json` の依存が変わっていないか

---

## 参照

- `DEPLOYMENT_LESSONS_20260213.md` — 前回のデプロイ教訓
- `DEPLOY_DESIGN_20260213.md` — デプロイ全体設計
- `TEST_STARTUP_CHECKLIST.md` — テスト開始前チェックリスト
