# hf-deploy: Groq API 移行計画

**Date**: 2026-02-15
**Goal**: デプロイ版 Explorers でエージェントの評価 (h/w/d) を正常動作させる
**Branch**: `hf-deploy`

---

## 現状の問題

- HF Inference API + SmolLM3-3B → JSON を返せない → `h=undefined w=undefined d=undefined`
- Navigation (sense/focus/move) は動く。**測定だけが死んでいる**

## 解決策: Groq API に切り替え

| 項目 | HF (現状) | Groq (移行先) |
|------|----------|--------------|
| JSON 強制 | ❌ なし | ✅ `response_format: {"type":"json_object"}` |
| モデル | SmolLM3-3B | llama-3.1-8b-instant (14,400 RPD) |
| API 形式 | OpenAI 互換 | OpenAI 互換 |
| 無料枠 | ✅ | ✅ カード不要、永続 |
| TPM | 不明 | 6,000 (短い評価リクエストなら十分) |

---

## 作業手順

### 1. Groq API キー取得

- https://console.groq.com/ でアカウント作成
- API キー発行 (HF Spaces の Secrets に `GROQ_API_KEY` として登録)

### 2. phi-agent/src/groq-client.ts 新規作成

`hf-client.ts` をベースに改修:

```typescript
// 変更点:
// 1. API_BASE: "https://api.groq.com/openai/v1/chat/completions"
// 2. Authorization: Bearer $GROQ_API_KEY
// 3. generate() に response_format: { type: "json_object" } を追加
// 4. model: process.env.GROQ_MODEL || "llama-3.1-8b-instant"
```

hf-client.ts との主な差分:
- `API_BASE` の URL
- `generate()` の body に `response_format` フィールド追加
- 環境変数名 (`GROQ_API_KEY`, `GROQ_MODEL`)
- `isAvailable()` は `https://api.groq.com/openai/v1/models` を叩く

### 3. phi-agent/src/index.ts 修正

`createLlmClient()` factory に groq 分岐追加:

```typescript
if (backend === "groq") {
  return new GroqClient();
}
```

### 4. explorers/app.py 修正

- モデルリスト: `llama-3.1-8b-instant`, `llama-3.3-70b-versatile`
- 環境変数: `LLM_BACKEND=groq`
- 制限事項の UI 表示を更新（SmolLM3 の警告を削除）

### 5. Dockerfile 修正

環境変数追加:
```
ENV LLM_BACKEND=groq
ENV GROQ_MODEL=llama-3.1-8b-instant
```
`GROQ_API_KEY` は HF Spaces の Secrets で設定

### 6. テスト

```bash
# ローカル確認
LLM_BACKEND=groq GROQ_API_KEY=xxx GROQ_MODEL=llama-3.1-8b-instant \
SPHERE_URL=http://localhost:3001 SPHERE_WS=ws://localhost:3001 \
node dist/index.js "knowledge exploration" --cycles 3

# 確認項目:
# - h/w/d が数値で返るか (not undefined)
# - JSON parse エラーが出ないか
# - response_format による強制が効いているか
```

---

## 注意点

- **hf-client.ts は残す** — HF API がJSON対応したら戻せるように
- **Groq の rate limit**: 30 RPM / 6,000 TPM — デモ単発実行なら余裕
  - 1セッション = 3 cycles × 2 LLM call (eval + action) = 6 requests
  - 30 RPM あれば 1 セッション完走可能
- **llama-3.1-8b**: ローカルテスト (llama3.2:1b) より大きいモデル → 測定品質も期待できる
- **70b モデルは RPD 1,000**: 選択肢としてUIに出すがデフォルトは 8b

## 参照

- `DEPLOYMENT_LESSONS_20260213.md` — 前回のデプロイ教訓
- `DEPLOY_DESIGN_20260213.md` — デプロイ全体設計
- `TEST_STARTUP_CHECKLIST.md` — テスト開始前チェックリスト
