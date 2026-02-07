# Sphere

高次元意味空間 — 知識が代謝し進化する場所

---

## Quick Start

```bash
# Windows
start-sphere.bat

# Manual
cd services/periphery
npm install
npm run dev
```

| サービス | URL |
|---------|-----|
| HTTP API | http://localhost:3001 |
| WebSocket | ws://localhost:8081 |

---

## Architecture

```
Agent ──WS──▶ Gateway ──▶ Sphere Core
  │                           │
  │ HTTP                      │
  ▼                           ▼
Ticket取得                 Tick処理
Rulebook                   代謝・減衰
外部投稿                   リンク形成
```

---

## Documentation

| ドキュメント | 内容 |
|------------|------|
| [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) | デプロイ・運用ガイド |
| [reports/GATEWAY_DESIGN_MEMO.md](reports/GATEWAY_DESIGN_MEMO.md) | Gateway設計メモ |
| [reports/CAPACITY_ESTIMATE.md](reports/CAPACITY_ESTIMATE.md) | 性能試算 |
| [services/periphery/src/mock/TESTING_MEMO.md](services/periphery/src/mock/TESTING_MEMO.md) | テスト操作メモ |

---

## Test Tools

```bash
cd services/periphery

# HTTP Based
npm run seed        # 初期データ投入
npm run mock-bot    # 継続投入
npm run observe     # 統計監視
npm run agent       # 外部観測

# WebSocket Based
npm run dive        # Dive探索
```

---

## API Overview

| Endpoint | Description |
|----------|-------------|
| `GET /health` | ヘルスチェック |
| `GET /nodes` | ノード一覧 |
| `GET /rulebook` | エージェントルールブック |
| `POST /dive/request` | Diveチケット発行 |
| `POST /sphere/contribute` | 外部データ投稿 |

---

## Scaling

| 同時接続 | 構成 |
|---------|------|
| ~1,000 | 単一プロセス |
| ~10,000 | nginx + Gateway×2 |
| ~100,000 | + Redis + Core分散 |

詳細: [reports/CAPACITY_ESTIMATE.md](reports/CAPACITY_ESTIMATE.md)

---

## License

MIT

---

Sphere Project v0.1.0
