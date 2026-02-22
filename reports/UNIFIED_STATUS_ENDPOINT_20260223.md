# 統合ステータスエンドポイント `/sphere/status` (2026-02-23)

## 背景

メトリクス系 API が散在していた:

| エンドポイント | 内容 | 問題 |
|------------|------|------|
| `GET /stats` | uptime のみ | **死エンドポイント** (呼び出し元ゼロ) → 削除済み |
| `GET /metrics` | uptime, nodeCount, agents, field, memory | 軽量だが nodes 詳細なし |
| `GET /nodes/stats` | kind 別カウント + 平均 | /metrics と nodeCount が重複 |
| `GET /nodes/metrics` | 全ノード個別リスト | 重い — デバッグ用 |
| `GET /sphere/snapshot` | 全状態 | Digestor 専用 (sphere_hash 計算) |

sphere-ui のダッシュボードは `/nodes/stats` + `/metrics` を毎5秒で **2回** fetch していた。

## 変更内容

### 1. `GET /sphere/status` — 統合エンドポイント追加

1回の fetch でスフィアの全サブシステム状態を返す:

```json
{
  "timestamp": "2026-02-23T12:00:00Z",
  "uptime": 3600,
  "gateway": { "pending": 0, "active": 2 },
  "nodes": {
    "total": 30,
    "byKind": { "active": 15, "amber": 5, "fossil": 3, "ghost": 2, "relic": 3, "environment": 2 },
    "averages": { "heat": 5.2, "weight": 120.3, "ttl": 800 }
  },
  "tickets": { "activeTickets": 1, "activeSessions": 2 },
  "bus": { "enabled": true, "currentMessages": 12, "totalMessages": 450, "subscribers": 2 },
  "field": { "intensity": 0.45, "volatility": 0.12, "dominantFlags": 8, "sampleCount": 30 },
  "sanctification": { "epoch": 3, "health": 0.82, "metabolicMode": "flow", "dormancy": false },
  "memory": { "heapUsedMB": 45.2, "rssMB": 120.5 }
}
```

**データソース:**

| セクション | ソース |
|-----------|--------|
| gateway | `GatewayServer.getStats()` |
| nodes | `projectionDB` 1回イテレーション |
| tickets | `TicketIssuer.getStats()` |
| bus | `ActiveBusLayer.getStats()` |
| field | `GlobalFieldLayer.getGlobalField()` |
| sanctification | `SanctificationNeuron.getStatus()` (要約) |
| memory | `process.memoryUsage()` |

bus, field, sanctification は未初期化時 `null` を返す。

### 2. `GET /stats` 削除

呼び出し元ゼロ。`/metrics` に機能が包含されている。
`/` のエンドポイント一覧と起動ログからも除去。

### 3. sphere-ui ダッシュボード統合

```javascript
// Before: 2 parallel fetches
const [stats, metrics] = await Promise.all([
  api('/nodes/stats'),
  api('/metrics')
]);

// After: 1 fetch
const s = await api('/sphere/status');
```

render 関数を `/sphere/status` のレスポンス形式に適合:
- `renderNodeDistribution(s.nodes)` — `counts` → `byKind` に変更
- `renderSystem(s)` — `metrics.agents` → `status.gateway.active`
- `renderField(s)` — `metrics.field` → `status.field`
- メモリ: `heapUsed / 1024 / 1024` → `heapUsedMB` (サーバー側で計算済み)

### 4. `/metrics` の `process.memoryUsage` 不整合修正

```typescript
// Before: 2つの異なる API を混用
rss: process.memoryUsage.rss(),      // standalone (Node 19.6+)
heapUsed: process.memoryUsage().heapUsed,  // object method

// After: 統一
rss: process.memoryUsage().rss,
heapUsed: process.memoryUsage().heapUsed,
```

## 設計判断

- **sanctification は要約のみ**: epoch, health, metabolicMode, dormancy の4値。
  フル詳細は `/sanctification` で取得（hard/soft/meta の全フィールド）
- **field の vector (384D) は除外**: ダッシュボードには不要。intensity/volatility で十分
- **bus の bufferSize は除外**: 設計情報（固定値）であり runtime status ではない
- **既存エンドポイントは残す**: `/metrics`, `/nodes/stats` は互換性のため維持

## 変更ファイル

| ファイル | 変更 |
|---------|------|
| `periphery/src/server.ts` | `/sphere/status` 追加, `/stats` 削除, memoryUsage 修正, 一覧更新 |
| `sphere-ui/public/app.js` | ダッシュボード polling を `/sphere/status` に統合 |

## 将来拡張

- `?detail=full` パラメータで全ノード個別メトリクスも含める（`/nodes/metrics` 統合）
- Prometheus 形式 (`format=prometheus`) 対応
- `sphere.config.json` で公開セクションを制御 (`metrics.enabled: ["nodes", "field", ...]`)
