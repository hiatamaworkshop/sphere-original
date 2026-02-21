# Deployment Lessons — Render + HF Spaces (2026-02-13)

**Branch**: `hf-deploy` (temporary deployment)
**Objective**: External demo site — Sphere Core (Render) + Explorers (HF Spaces)
**Result**: Deployed successfully with documented limitations

---

## 疎結合の課題・学び

### 1. **URL 処理のロバスト性不足**

**問題**: `SPHERE_URL` の末尾スラッシュで 404 エラー
- `https://sphere-original.onrender.com/` → URL 構築時にダブルスラッシュ
- phi-agent の URL 構築ロジックが末尾スラッシュを想定していない

**疎結合の観点**:
- URL 構築ロジックが複数箇所に散在している可能性
- 環境変数を受け取る側で normalize すべき

**改善案**:
```typescript
// sphere-client.ts または config.ts
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');  // 末尾スラッシュ削除
}

const SPHERE_URL = normalizeUrl(process.env.SPHERE_URL || 'http://localhost:3001');
```

**優先度**: 高

---

### 2. **外部 API エンドポイントのハードコード**

**問題**: HF Inference API の URL 変更で動作停止
- `https://api-inference.huggingface.co` → `https://router.huggingface.co`
- `API_BASE` がハードコードされていた

**疎結合の観点**:
- 外部 API の URL は変更される可能性がある
- 環境変数化すべきだった

**改善案**:
```typescript
// hf-client.ts
const API_BASE = process.env.HF_API_BASE || "https://router.huggingface.co/v1/chat/completions";
```

**優先度**: 中

---

### 3. **UI 内のリンクが環境依存**

**問題**: sphere-ui の Explorers リンクが `localhost:7860` にハードコード
- デプロイ環境（ローカル/Render/HF）ごとに手動で変更が必要

**疎結合の観点**:
- UI が外部サービスの URL を決め打ちしている
- 環境変数または設定ファイルで管理すべき

**改善案 A** (ビルド時生成):
```javascript
// sphere-ui/public/config.js (ビルド時に生成)
window.SPHERE_CONFIG = {
  explorersUrl: process.env.EXPLORERS_URL || 'http://localhost:7860'
};
```

**改善案 B** (サーバー側注入):
```html
<!-- periphery が UI 提供時に環境変数を注入 -->
<script>
  const EXPLORERS_URL = '{{EXPLORERS_URL}}';  // サーバー側テンプレート
</script>
```

**優先度**: 中

---

### 4. **Dockerfile の役割分離は成功、しかし検証不足**

**良かった点**:
- `Dockerfile` (Explorers) vs `Dockerfile.standalone` (Sphere Core) の分離
- 役割が明確

**問題**:
- Render で間違った Dockerfile を指定して 5 日間気づかなかった
- ファイル名だけに依存する設計（人的ミスが起きやすい）

**疎結合の観点**:
- ビルド設定の検証機構がない
- README や CI でチェックすべき

**改善案**:
- Dockerfile にコメントで用途を明記（既にある）
- CI で意図したサービスがビルドされるか検証
- 各 Dockerfile の先頭に環境変数の期待値を記載

**優先度**: 低

---

### 5. **世代データの固定化 — 疎結合の良い例**

**成功例**:
- Digestor を省略しても Explorers は動く
- gen-005, gen-011 を bundle して read-only 化
- Digestor の有無に依存しない設計

**疎結合の観点**:
- Digestor は「生成プロセス」、Explorers は「消費プロセス」
- 完全に分離されている

---

## 技術的な実装詳細

### HF Inference API 移行 (2026-02-13)

**変更内容**:

1. **エンドポイント変更**:
   - 旧: `https://api-inference.huggingface.co/models/{model}`
   - 新: `https://router.huggingface.co/v1/chat/completions`

2. **リクエストフォーマット** (OpenAI 互換):
   ```typescript
   // 旧
   {
     inputs: "...",
     parameters: {
       max_new_tokens: 128,
       temperature: 0.4,
       return_full_text: false
     }
   }

   // 新 (OpenAI 互換)
   {
     model: "google/gemma-2-2b-it",
     messages: [{ role: "user", content: "..." }],
     max_tokens: 128,
     temperature: 0.4
   }
   ```

3. **レスポンスフォーマット**:
   ```typescript
   // 旧
   [{ generated_text: "..." }]

   // 新 (OpenAI 互換)
   {
     choices: [
       { message: { content: "..." } }
     ]
   }
   ```

**実装場所**: `phi-agent/src/hf-client.ts`

---

### LLM 抽象化レイヤー

**実装**:

1. **Interface 定義** (`phi-agent/src/llm-client.ts`):
   ```typescript
   export interface LlmClient {
     generate(prompt: string, system?: string): Promise<string>;
     generateText(prompt: string, system?: string, maxTokens?: number): Promise<string>;
     isAvailable(): Promise<boolean>;
     readonly modelName: string;
   }
   ```

2. **実装クラス**:
   - `OllamaClient` (既存)
   - `HfInferenceClient` (新規)

3. **Factory 関数** (`phi-agent/src/index.ts`):
   ```typescript
   function createLlmClient(): LlmClient {
     const backend = process.env.LLM_BACKEND || "ollama";
     if (backend === "huggingface") {
       return new HfInferenceClient();
     }
     return new OllamaClient();
   }
   ```

**効果**:
- ✅ バックエンドの切り替えが環境変数のみで可能
- ✅ agent.ts は LLM 実装に依存しない
- ✅ 将来的に他のプロバイダー（Anthropic, OpenAI など）追加が容易

---

### Subprocess Executor (HF Spaces)

**変更**: Docker executor → Node.js subprocess

**理由**:
- HF Spaces で nested Docker は複雑
- Node.js + Python の multi-stage build で両方を含める

**実装** (`explorers/executor_subprocess.py`):
```python
def execute_phi_agent(loadout, query, sphere_url, model, evaluate=True, timeout=300):
    env = {
        "LOADOUT": loadout,
        "SPHERE_URL": sphere_url,
        "SPHERE_WS": ws_url,
        "LLM_BACKEND": "huggingface",
        "HF_TOKEN": os.environ.get("HF_TOKEN"),
        "HF_MODEL": model,
        "EVALUATE": "true" if evaluate else "false",
        "RESPONSE": "true",
    }
    cmd = ["node", "/app/phi-agent/dist/index.js", query, "--cycles", "3"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
    return result.stdout
```

---

## デプロイ構成

### Render (Sphere Core)
- **Dockerfile**: `Dockerfile.standalone`
- **Branch**: `hf-deploy`
- **URL**: https://sphere-original.onrender.com
- **構成**: renalCore + periphery + sphere-ui (standalone)
- **データ**: Volatile (再起動時にリセット、mock_data.json から復元)

### HF Spaces (Explorers + phi-agent)
- **Dockerfile**: `Dockerfile` (root)
- **Branch**: `hf-deploy:main` (HF Git)
- **URL**: https://huggingface.co/spaces/HiatamaWorkshop/sphere-original
- **構成**: Python (Gradio) + Node.js (phi-agent) multi-stage build
- **データ**: Fixed gen data (gen-005, gen-011) read-only

---

## 制限事項と対応

### 無料枠モデルの JSON 出力不安定

**問題**: `HuggingFaceTB/SmolLM3-3B` が JSON フォーマットで応答しない
- 結果: `h=undefined w=undefined d=undefined`
- エージェント評価が失敗

**対応**: UI に正直な制限事項を記載
```markdown
⚠️ Known Limitation: The free-tier model (SmolLM3-3B) does not reliably output JSON,
so evaluations may fail (h=undefined). However, Sphere navigation works correctly —
agents successfully sense, focus, and move through the ecosystem.
For full functionality with reliable evaluations, run phi-agent locally with Ollama.
```

**動作確認できた部分**:
- ✅ Sphere 物理エンジン
- ✅ FastGate (Loadout による選択の違い)
- ✅ Navigation (sense/focus/move)
- ✅ エネルギー消費
- ❌ LLM Evaluation (JSON 不安定)

---

## 改善案サマリー

| 課題 | 改善策 | 優先度 | 実装場所 |
|------|--------|--------|----------|
| URL 末尾スラッシュ処理 | `normalizeUrl()` 関数追加 | 高 | `sphere-client.ts` |
| 外部 API URL ハードコード | `HF_API_BASE` 環境変数化 | 中 | `hf-client.ts` |
| UI リンクの環境依存 | `EXPLORERS_URL` 環境変数 + サーバー側注入 | 中 | `periphery` + `sphere-ui` |
| Dockerfile 検証不足 | CI チェック + 用途明記 | 低 | `.github/workflows/` |

---

## hf-deploy ブランチの主要コミット

1. `895f9d8` - Deploy: HF Spaces + Render dual deployment setup
2. `1a74c7d` - Fix Dockerfile: install devDependencies for TypeScript build
3. `8241ecc` - Fix HF Inference API endpoint URL
4. `348fbfe` - Migrate to HF OpenAI-compatible chat completions API
5. `6e32ca4` - Update Explorers link to HF Spaces URL
6. `5beb80e` - Fix model list to free tier only
7. `07e2389` - Add honest limitation notice to UI

---

## 結論

**成功した部分**:
- デプロイインフラの分離（Render/HF Spaces）
- LLM 抽象化による柔軟性
- 正直な制限事項の開示

**学んだこと**:
- 環境変数の normalize が重要
- 外部 API のハードコードは避けるべき
- UI の環境依存リンクは設定ファイルで管理
- 無料枠モデルの制約を正直に開示することの重要性

**持ち帰るべき修正**:
- URL normalize 関数（優先度: 高）
- HF API 対応コード（将来的に有用）
- 環境変数による設定の外部化パターン
