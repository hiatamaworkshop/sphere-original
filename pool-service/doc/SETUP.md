# Pool Service — Setup & Usage

**Date**: 2026-02-08
**Status**: スケルトン完成、E2E テスト通過

---

## 概要

外部データの品質管理ゲート。HTTP で受け付けたデータを LLM (温度計) + Weapon パイプラインでスコアリングし、
閾値を超えたものだけを Sphere の `POST /sphere/contribute` に投入する常駐サービス。

```
外部クライアント / RSS / バッチ
         │
    POST /ingest (標準JSON)
         │
    ┌────▼────┐
    │  Pool   │ :4000
    │ Service │
    └────┬────┘
         │  Membrane (sanitize + validate + field aliasing)
         │  Queue (FIFO, capacity: 100)
         │  Scorer A (LLM 温度計 → 4スコア → metrics)
         │  Coherence Floor (hard reject)
         │  Weapon Scorers (sentinel/curator/scout → weighted avg)
         │
    POST /sphere/contribute
         │
    ┌────▼────┐
    │ Sphere  │ :3001
    │(periph) │
    └─────────┘
```

## ファイル構成

```
pool-service/
├── src/
│   ├── index.ts          — HTTP サーバー + CLI
│   ├── types.ts          — 型定義 (PoolEntry, Config, Sphere 提出型)
│   ├── membrane.ts       — サニタイズ + バリデーション + フィールド変換
│   ├── tagger.ts         — タグ → 16bit フラグ (Sphere Tagger 軽量コピー)
│   ├── scorer-a.ts       — LLM 温度計 (ollama → 4スコア → metrics)
│   ├── weapon-scorers.ts — 3人格スコアラー (sentinel/curator/scout)
│   └── pool.ts           — FIFO キュー + スコアリングパイプライン
├── mock/
│   ├── mock_data.json    — EN テストデータ (62件)
│   └── mock_data.ts      — JP テストデータ (80件)
├── doc/
│   └── SETUP.md          — このファイル
├── package.json
└── tsconfig.json
```

## セットアップ

```bash
cd pool-service
npm install
npm run build
```

## 起動

```bash
# dev mode (watch)
npm run dev

# production
npm start

# カスタムオプション
npm start -- --port 4000 --sphere-url http://localhost:3001/sphere/contribute --ollama-url http://localhost:11434 --model phi3:mini
```

**依存サービス** (先に起動しておくこと):

| サービス | 用途 | デフォルト URL |
|----------|------|---------------|
| ollama | Scorer A (LLM 温度計) | `http://localhost:11434` |
| Sphere (periphery) | ノード投入先 | `http://localhost:3001/sphere/contribute` |

## API

### POST /ingest — 単一エントリ投入

**標準フォーマット** (推奨):
```json
{
  "title": "Attention Is All You Need",
  "body": "Transformer アーキテクチャは自己注意機構を用いて...",
  "tags": ["ML", "transformer", "attention"],
  "url": "https://arxiv.org/abs/1706.03762",
  "source": "arxiv-feed"
}
```

**レガシーフォーマット** (Sphere 内部名、後方互換):
```json
{
  "summary": "...",
  "content": "...",
  "ref_url": "...",
  "tags": [...]
}
```

Membrane が自動変換: `summary→title`, `content→body`, `ref_url→url`

**Response**:
- `202 { "status": "queued", "queueLength": 5 }` — 受理
- `400 { "error": "Membrane rejected", "details": [...] }` — 拒否

### POST /ingest/batch — バッチ投入

```json
[
  { "title": "...", "body": "...", "tags": [...] },
  { "title": "...", "body": "...", "tags": [...] }
]
```

**Response**: `202 { "status": "queued", "accepted": 8, "rejected": 2, "queueLength": 8 }`

標準/レガシーの混在も可。各エントリが独立に Membrane を通過する。

### GET /status — キュー状態

**Response**: `200 { "queueLength": 3, "processing": true }`

## フィールドマッピング

外部 API は世界の標準的なフィールド名を使用。Sphere 内部名への変換は `submitToSphere()` の一箇所のみ。

| 外部 (Pool API) | 内部 (PoolEntry) | Sphere (NodeSeed) | 説明 |
|-----------------|-----------------|-------------------|------|
| `title` | `title` | `summary` (L2) | 見出し |
| `body` | `body` | `content` (L3) | 本文 |
| `url` | `url` | `ref_url` (L4) | 出典 URL |
| `tags` | `tags` | `tags` (L1) | タグ (共通) |
| `source` | `source` | — | 投入元識別子 |

## Membrane バリデーション

| 項目 | 条件 |
|------|------|
| title | 必須、文字列、sanitize 後 5文字以上、最大 500文字 |
| body | 必須、文字列、sanitize 後 10文字以上、最大 50,000文字 |
| tags | 必須、配列、sanitize 後 1個以上、最大 20個 (各50文字) |
| url | 任意、http/https のみ、無効なら除去 (エントリ自体は通す) |

sanitize: HTML/script 除去、タブ→空格、連続空白圧縮、改行正規化、タグ小文字化+重複除去

## スコアリングパイプライン

```
Membrane → Queue → Scorer A (LLM) → Coherence Floor → Weapons → Accept/Reject → Sphere
```

### Scorer A (LLM 温度計)

ollama に固定プロンプトを送り、4次元スコアを取得:
- `authority` (権威性 0-1)
- `novelty` (新規性 0-1)
- `coherence` (整合性 0-1)
- `catalyst` (触媒性 0-1)

スコアから初期 metrics を算出:
- `heat = 50 + (authority + catalyst) × 25`
- `weight = 50 + (authority + novelty) × 25`
- `decay = 50 × (1 - coherence)`
- flags: authority>0.6→Authority, catalyst>0.5→Catalyst, novelty>0.5→Freshness

### Coherence Floor

`coherence < 0.3` → 即拒否 (他スコアに関係なく)

### Weapon Scorers

3つの人格が独立にスコアリング (0ms、LLM 不要):

| Scorer | 投票重み | 特徴 |
|--------|---------|------|
| sentinel | 0.5 | バランス型、w/d 均等 |
| curator | 0.3 | 保存重視、authority+sticky 高感度 |
| scout | 0.2 | 多様性重視、catalyst+freshness 高感度 |

`score = base(w, d) × flagGate × ratioMod`

加重平均が加重閾値を超えたら accept → Sphere に提出。

## テスト (curl)

```bash
# 標準フォーマット
curl -X POST http://localhost:4000/ingest \
  -H "Content-Type: application/json" \
  -d '{"title":"Test entry","body":"This is a test body with enough content.","tags":["test","pool"]}'

# レガシーフォーマット
curl -X POST http://localhost:4000/ingest \
  -H "Content-Type: application/json" \
  -d '{"summary":"Legacy test","content":"Using old Sphere field names still works.","tags":["test"]}'

# バッチ
curl -X POST http://localhost:4000/ingest/batch \
  -H "Content-Type: application/json" \
  -d '[{"title":"Entry 1","body":"First test entry body text.","tags":["a"]},{"title":"Entry 2","body":"Second test entry body text.","tags":["b"]}]'

# ステータス確認
curl http://localhost:4000/status
```

## 設計ドキュメント

- `phi-agent/doc/INTAKE_POOL_DESIGN.md` — 設計全体
- `reports/COUPLING_LAYER_DESIGN_MEMO.md` — 責務分離の原則

## Phase ロードマップ

- [x] Phase 1: Flat Pool (Scorer A + Weapon, FIFO)
- [x] 標準フィールド名化 (title/body/url)
- [x] Membrane (sanitize + validate + legacy alias)
- [x] E2E テスト通過 (2026-02-08)
- [ ] Phase 2: Vectorized Pool (embedding dedup, adaptive threshold)
- [ ] Phase 3: Docker 化 (docker-compose サービス追加)
