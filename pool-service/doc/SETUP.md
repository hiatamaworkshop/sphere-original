# Pool Service — Setup

**Date**: 2026-02-08
**Status**: スケルトン作成済み、未稼働

---

## 概要

外部情報の品質管理プール。LLM (温度計) + Weapon パイプラインでノードをスコアリングし、
閾値を超えたものだけを Sphere の `POST /sphere/contribute` に投入する。

## 構成

```
pool-service/
├── src/
│   ├── index.ts      — HTTP サーバー (POST /ingest, GET /status)
│   ├── types.ts      — データ型定義、Config
│   ├── tagger.ts     — タグ → 16bit フラグ変換 (Sphere Tagger の軽量コピー)
│   ├── scorer-a.ts   — LLM 温度計 (固定プロンプト → 4スコア)
│   └── pool.ts       — FIFO キュー + スコアリングループ
├── doc/
│   └── SETUP.md      — このファイル
├── package.json
└── tsconfig.json
```

## セットアップ

```bash
cd pool-service
npm install
npm run build
```

## 実行

```bash
# dev mode (watch)
npm run dev

# production
npm start

# options
npm start -- --port 4000 --sphere-url http://localhost:3001/sphere/contribute --model phi3:mini
```

## API

| Method | Path | 説明 |
|--------|------|------|
| POST | /ingest | エントリを Pool に追加 |
| GET | /status | キュー状態を返す |

### POST /ingest

```json
{
  "source": "rss-feed",
  "tags": ["ML", "transformer"],
  "summary": "Attention Is All You Need の要約",
  "content": "Transformer アーキテクチャは...",
  "ref_url": "https://arxiv.org/abs/1706.03762"
}
```

Response: `202 { "status": "queued", "queueLength": 5 }`

## 依存サービス

| サービス | 用途 | デフォルト |
|----------|------|-----------|
| ollama | Scorer A (LLM 温度計) | http://localhost:11434 |
| Sphere (periphery) | ノード投入先 | http://localhost:3001/sphere/contribute |

## 設計ドキュメント

- `phi-agent/doc/INTAKE_POOL_DESIGN.md` — 設計全体
- `phi-agent/doc/COUPLING_LAYER_PHILOSOPHY.md` — 設計哲学
- `phi-agent/doc/LLM_AS_JUDGMENT_ELEMENT.md` — LLM 判断素子原則

## Phase ロードマップ

- [x] Phase 1: Flat Pool (Scorer A のみ、FIFO)
- [ ] Phase 2: Multi-Scorer (B/C/D with Loadout + Weapon)
- [ ] Phase 3: Vectorized Pool (embedding dedup, adaptive threshold)
