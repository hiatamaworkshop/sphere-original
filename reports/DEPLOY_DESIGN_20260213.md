# Deploy Design — Demo Site (2026-02-13)

## 目的

外部ユーザー向けデモサイト。エージェントをスフィアに送り込み、ジェネレーションシステムを体感する場。

---

## 配置

| 場所 | サービス | 理由 |
|------|---------|------|
| **Render** | Sphere Core (standalone) | 安定した API 提供。スリープしてもエージェントが叩けば起きる |
| **HF Spaces** | Explorers + phi-agent | AI モデル実行環境として優秀。能動的に活動を開始できる |

**コンセプト**: エージェントが目覚めると、同時にスフィア宇宙が誕生する

---

## Render 側 — Sphere Core

### 構成
- Dockerfile.standalone ベース（既存）
- Periphery + RenalCore (in-memory, DB なし)
- デフォルトデータで毎回起動（データ揮発 OK — 実験場）

### 環境変数
```
NODE_ENV=production
SPHERE_CONFIG=./config/sphere.config.json
PORT=7860  # Render が割り当て
```

### スリープ復帰
- 無料プランは 15 分無通信でスリープ
- 復帰に 30 秒〜1 分
- **対策**: Explorers 側で初回リクエスト時に ping を送る（目覚まし）
- タイムアウト設定を長めに (60 秒)

### 変更点（hf-deploy ブランチ）
- 既存 Dockerfile.standalone をほぼそのまま使用
- sphere.config.json の調整（デモ向けデータ量など）

---

## HF Spaces 側 — Explorers + phi-agent

### 構成
- **Explorers** (Python/Gradio): UI + エージェント実行制御
- **phi-agent** (Node.js): Sphere 内探索・評価
- **固定 gen データ**: gen-005, gen-011 等を同梱
- **LLM**: HF Inference API (Ollama 不要)

### ポート
- HF Spaces は 7860 のみ公開
- Explorers (Gradio) が 7860 を占有

### 実行モード
- **単発実行のみ** — daemon 禁止
- ユーザーが種族・クエリを選択 → エージェント 1 セッション実行 → 結果表示
- Digestor 不要 — 固定 gen データで Generations タブ表示

### LLM 差し替え: Ollama → HF Inference API

**現在** (OllamaClient):
```
POST http://ollama:11434/api/generate
body: { model, prompt, system, stream: false, format: "json" }
response: { response: string }
```

**差し替え** (HfInferenceClient):
```
POST https://api-inference.huggingface.co/models/{model_id}
Authorization: Bearer $HF_TOKEN
body: { inputs: prompt, parameters: { max_new_tokens, temperature } }
response: [{ generated_text: string }]
```

#### 実装方針
1. `phi-agent/src/hf-client.ts` を新規作成
   - OllamaClient と同じインターフェース (generate, generateText, isAvailable)
   - fetch ベース（追加依存ゼロ）
2. `phi-agent/src/index.ts` で環境変数 `LLM_BACKEND` に応じて切り替え
   - `LLM_BACKEND=ollama` → OllamaClient（既存、ローカル開発用）
   - `LLM_BACKEND=huggingface` → HfInferenceClient（デプロイ用）
3. 環境変数:
   - `HF_TOKEN` — 無料アカウントで取得可能
   - `HF_MODEL=google/gemma-2-2b-it` (or `meta-llama/Llama-3.2-1B-Instruct`)

#### 注意点
- **JSON format 強制なし**: HF Inference API に Ollama の `format: "json"` 相当がない
  - phi-agent の `parseAction()` にフォールバック解析がある（JSON 抽出）
  - プロンプトで "respond in JSON only" を強調する必要あり
- **rate limit**: 無料枠は制限あり
  - 単発実行のみなのでデモ用途には十分
  - 連続アクセス防止を Explorers UI 側で制御
- **レスポンス速度**: Ollama ローカルより遅い
  - gemma-2-2b: 数秒〜10 秒程度
  - UI にローディング表示必須

### 固定 gen データ

Digestor を動かす代わりに、ローカルで生成済みの gen データを同梱:

```
phi-agent/data/generations/
  gen-005.json  ← 初期世代
  gen-011.json  ← Phase 2 完了後
```

- Explorers の Generations タブでドロップダウン選択
- species-profile.json も固定版を同梱（gen-011 ベース）
- eval-log.jsonl は空 or 最小限（デモ実行分のみ蓄積、揮発 OK）

### Explorers UI の調整

- **Docker executor 廃止**: HF Spaces 内で Docker-in-Docker は不可
  - phi-agent を直接 subprocess (Node.js) で実行
  - または Python から phi-agent の API を HTTP で呼ぶ
- **モデル選択**: HF Inference API 対応モデルリストに変更
  - gemma-2-2b-it, Llama-3.2-1B-Instruct 等
- **Sphere URL**: 環境変数 `SPHERE_URL=https://xxx.onrender.com`
- **WebSocket**: `SPHERE_WS=wss://xxx.onrender.com` (Render は wss 対応)

---

## ブランチ戦略

```
futurePreparation (開発主線)
       ↓ merge
hf-deploy (デプロイ専用)
       ↓ 独自の削減・修正
   push → HF Spaces / Render
```

### hf-deploy での削除対象
- pool-service/ — デモ不要
- docker_compose_sphere_v1/ の大半 — nginx, redis, postgres, minio 設定
- digestor/ — 固定 gen データで代替
- .bat ファイル群 — Windows ローカル開発用
- reports/ — デプロイに不要（容量削減）

### hf-deploy での変更対象
- `phi-agent/src/hf-client.ts` — 新規 (HF Inference API クライアント)
- `phi-agent/src/index.ts` — LLM_BACKEND 切り替え
- `phi-agent/src/ollama-client.ts` — 残す（ローカル互換）
- `explorers/app.py` — Docker executor → subprocess 実行に変更
- `explorers/Dockerfile` — phi-agent の Node.js 環境を同梱
- Dockerfile.standalone — Render 用、調整のみ

### 新規作成
- `Dockerfile.hf` — HF Spaces 用 (Python + Node.js multi-stage)
- 固定 gen データファイル

---

## 接続フロー

```
[外部ユーザー]
     ↓ ブラウザ
[HF Spaces: Explorers (Gradio)]
     ↓ 種族・クエリ選択 → "Run" ボタン
[phi-agent (subprocess)]
     ↓ SPHERE_URL (HTTPS)        ↓ HF Inference API
[Render: Sphere Core]      [HF: gemma-2-2b-it]
     ↓                           ↓
  sense/focus/evaluate        h,w,d 評価生成
     ↓
[結果表示: サイクルログ + 評価 + feelings]
```

---

## Render スリープ対策

```python
# Explorers 起動時 or ユーザーアクション時
async def wake_sphere():
    """Render が寝ていたら起こす"""
    try:
        r = requests.get(f"{SPHERE_URL}/health", timeout=90)
    except requests.Timeout:
        # 初回タイムアウトは想定内（コールドスタート）
        pass
```

- ユーザーがページを開いた時点で ping を送る
- 「Sphere が起動中です...」のローディング表示
- phi-agent 側のタイムアウトも 60 秒に延長

---

## コスト

| リソース | コスト |
|---------|--------|
| Render (free tier) | $0 — 750 時間/月、スリープあり |
| HF Spaces (free tier) | $0 — CPU basic、永続ストレージなし |
| HF Inference API (free tier) | $0 — rate limited |
| HF Token | $0 — 無料アカウント |

**全て無料で実現可能**

---

## 作業順序（hf-deploy ブランチ）

1. futurePreparation → hf-deploy マージ
2. 不要ファイル削除（pool-service, .bat, reports 等）
3. `hf-client.ts` 実装 + LLM_BACKEND 切り替え
4. 固定 gen データ同梱
5. Explorers UI 調整（Docker executor → subprocess）
6. `Dockerfile.hf` 作成（Python + Node.js）
7. Dockerfile.standalone 調整（Render 用）
8. ローカルテスト（LLM_BACKEND=huggingface）
9. push → デプロイ確認

---

## 130 コミット差分の主な追加機能（移植対象）

| 機能 | デモでの扱い |
|------|------------|
| 16bit Flag System | 有効（Sphere Core に含まれる） |
| Species Memory | 固定 gen データで体験 |
| evaluation_consistency | Generations タブで表示 |
| daemon re-random | デモ不要（単発実行） |
| expression (hex template) | 有効（評価結果に含まれる） |
| ActiveBus | 有効（Sphere Core に含まれる） |
| 4D Feelings | 有効（phi-agent に含まれる） |
| configHash | 有効（追跡用） |
