# hf-deploy マージプロトコル

`futurePreparation` (開発) → `hf-deploy` (デプロイ) へのマージ手順と注意事項。

---

## ブランチ構成

| ブランチ | 用途 | push 先 |
|---------|------|---------|
| `futurePreparation` | 開発 | `origin` (GitHub) |
| `hf-deploy` | デプロイ | `origin` + `hf` (HuggingFace Spaces) |
| `main` | production snapshot | `origin` |

## デプロイ先

| サービス | プラットフォーム | Dockerfile | ポート |
|---------|---------------|------------|--------|
| Sphere Core (standalone) | Render.com | `Dockerfile.standalone` | 3001 (default, Render は $PORT 動的) |
| Explorers + phi-agent | HuggingFace Spaces | `Dockerfile` (root) | 7860 |

---

## マージ手順

### 1. 準備

```bash
git stash  # 未コミットの変更を退避
git checkout hf-deploy
```

### 2. マージ (no-commit で中身を確認)

```bash
git merge futurePreparation --no-commit --no-ff
```

### 3. コンフリクト解消

#### hf-deploy で意図的に削除されたファイル → 削除を維持

```bash
git rm <conflicted-deleted-files>
```

典型的に削除されるもの:
- `docker_compose_sphere_v1/docker-compose.yml` (ローカル専用)
- `digestor/` (ローカル専用)
- `phi-agent/data/` (データファイル)
- `pool-service/` (ローカル専用)
- `reports/` の一部 (テスト系ドキュメント)
- `sphere.bat`, `sphere.sh`, `*.ps1` (ローカルスクリプト)

#### デプロイ固有ファイル → hf-deploy 版を維持

```bash
git checkout --ours explorers/app.py && git add explorers/app.py
```

**絶対に futurePreparation 版で上書きしてはいけないファイル:**

| ファイル | 理由 |
|---------|------|
| `explorers/app.py` | subprocess executor + Groq API (Docker executor ではない) |
| `explorers/executor_subprocess.py` | HF Spaces 用 (executor.py はローカル用) |
| `sphere-ui/public/index.html` | Explorers リンクが HF Spaces URL |
| `Dockerfile.standalone` | PORT=3001 (Render 用) |

**確認すべきポイント:**
- `index.html` 内の URL が `huggingface.co/spaces/...` であること (`localhost:7860` でないこと)
- `Dockerfile.standalone` の PORT が 3001 であること

### 4. ビルド検証

```bash
docker build -f Dockerfile.standalone -t sphere-standalone-test .
docker run --rm -d --name sphere-test -p 3001:3001 sphere-standalone-test
curl http://localhost:3001/health
docker logs sphere-test
docker stop sphere-test
```

確認事項:
- tsc 通過 (renalCore → periphery)
- health endpoint 応答
- RenalCore tick 稼働
- Sanctification neuron 動作 (Dormancy OK)
- Seed + Relic 投入完了

### 5. コミット & Push

```bash
git commit -m "Merge futurePreparation: <変更サマリ>"
git push origin hf-deploy
git push hf hf-deploy:main  # HuggingFace Spaces (main ブランチにマップ)
```

### 6. 開発ブランチに復帰

```bash
git checkout futurePreparation
git stash pop  # 退避した変更を復元
```

---

## 既知の罠

### .dockerignore がないとビルドが壊れる (2026-02-22)

**問題**: リポジトリルートに `.dockerignore` がないと、`Dockerfile.standalone` のビルドで
ホストの `node_modules/` (symlink含む) が Docker COPY でコンテナに混入し、
`@sphere/renal-core` の型解決が失敗する。

**原因**: `docker-compose` の periphery Dockerfile は `services/.dockerignore` で
`**/node_modules` と `**/dist` を除外しているが、standalone Dockerfile のビルドコンテキストは
リポジトリルートなので `services/.dockerignore` が効かない。

**対策**: ルートに `.dockerignore` を配置。ただし `phi-agent/data` は**全除外してはいけない**
（後述の罠を参照）:
```
**/node_modules
**/dist
.git
phi-agent/data/eval-log.jsonl
phi-agent/data/narrative-log.jsonl
reports
docs
*.md
*.ps1
*.bat
*.sh
.claude
```

### .dockerignore で phi-agent/data を全除外すると HF Spaces ビルドが壊れる (2026-02-22)

**問題**: `.dockerignore` に `phi-agent/data` を記載すると、HF Spaces の `Dockerfile`（ルート）が
`COPY phi-agent/data/species-profile.json` と `COPY phi-agent/data/generations/gen-*.json` に失敗する。

**背景**: ルートの `.dockerignore` は `Dockerfile.standalone` (Render用) と `Dockerfile` (HF用) の
両方に効く。Render は `phi-agent/data` を使わないが、HF Spaces はバンドルデータとして COPY する。

**原因**: ローカルではデータは bind mount で参照するため `.dockerignore` で除外しても問題ないが、
HF Spaces はコンテナ内に固定データを COPY する設計（read-only デモ用）。

**対策**: `phi-agent/data` を全除外せず、ランタイムログ（eval-log, narrative-log）だけを除外する。
species-profile.json と generations/ は hf-deploy ブランチにコミットされている必要がある。

### hf-deploy が削除したファイルの modify/delete コンフリクト

hf-deploy はデプロイに不要なファイルを大量に削除している。
`futurePreparation` でこれらのファイルが変更されると modify/delete コンフリクトが発生する。
基本方針: **削除を維持** (`git rm`)。

### Render の PORT

Render は `$PORT` 環境変数を動的に割り当てる。`Dockerfile.standalone` の `ENV PORT=3001` は
ローカルテスト用のデフォルト。Render 上では上書きされるので実害はない。

### HuggingFace Spaces の自動ビルド

`hf` remote の `main` ブランチに push すると自動的にビルドが開始される。
ビルド状況は https://huggingface.co/spaces/HiatamaWorkshop/sphere-original で確認。

---

## マージ対象の判断基準

| カテゴリ | マージする？ | 例 |
|---------|------------|-----|
| コアロジック (periphery/renalCore) | YES | arbiter, bookkeeper, sanctification |
| sphere.config.json | YES | 評価係数、免疫パラメータ |
| sphere-ui (ロジック変更) | YES | app.js のデータ処理改善 |
| sphere-ui (URL/リンク) | NO | index.html の Explorers リンク |
| explorers/ | NO | app.py, executor は deploy 固有 |
| docker-compose.yml | NO | ローカル専用 |
| reports/ | 判断 | 新しい設計ドキュメントは YES、テストメモは NO |
| phi-agent/data/ | NO | ランタイムデータ |

---

## LLM バックエンド構成

### ローカル vs デプロイの LLM 差異

| 環境 | LLM バックエンド | モデル | 設定場所 |
|------|---------------|--------|---------|
| ローカル (docker-compose) | Ollama | qwen2.5:0.5b / phi3:mini | `OLLAMA_MODEL` 環境変数 |
| HF Spaces (Explorers) | Groq API | llama-3.1-8b-instant | `Dockerfile` の ENV + HF Secrets |
| Render (Sphere Core) | なし（LLM不要） | — | — |

### Groq API 設定

HF Spaces の `Dockerfile` で設定:
```dockerfile
ENV LLM_BACKEND=groq
ENV GROQ_MODEL=llama-3.1-8b-instant
```

**GROQ_API_KEY** は HF Spaces の Settings → Repository secrets で設定する（Git に含めない）。
キーが未設定の場合、phi-agent の LLM 評価が失敗する（Sphere 接続・ナビゲーションは動作する）。

### LLM 抽象化レイヤー

phi-agent は `LlmClient` interface で LLM バックエンドを抽象化:
- `OllamaClient` — ローカル推論（docker-compose 環境）
- `HfInferenceClient` — HuggingFace Inference API
- Groq — HfInferenceClient の OpenAI-compatible モードで接続

切り替えは `LLM_BACKEND` 環境変数のみ。agent.ts はバックエンド実装に依存しない。

### Render (Sphere Core) に LLM は不要

Render の standalone Sphere は代謝エンジン（renalCore + periphery）のみ。
LLM 評価はエージェント側（HF Spaces の phi-agent）が行い、結果を Sphere API 経由で送信する。
Sphere Core は評価結果を受け取って処理するだけで、自身は推論しない。
