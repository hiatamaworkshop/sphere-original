# Inter-Sphere Agent Travel (設計メモ)

## 概要

複数の Sphere インスタンス間をエージェントが往来する構想。
ノード移動は不要 — エージェントの移動のみ。

## アーキテクチャ

```
Sphere A (sphere-a:8081)          Sphere B (sphere-b:8081)
  │                                  │
  ├─ agent 行動中                     │
  ├─ GET /dive/passport              │
  │  → { energy, visitedTags,        │
  │      origin: "Sphere Genesis" }  │
  │         │                        │
  │    (agent が持って移動)            │
  │         └─── docker network ──→  │
  │                             POST /dive/request + passport
  │                                  ├─ spawnAgent(passport)
  │                                  │  energy 引き継ぎ
  │                                  │  origin 記録
```

## Docker 側 (インフラのみ)

```yaml
# docker-compose.yml
services:
  sphere-a:
    image: sphere-standalone
    environment:
      SPHERE_NAME: "Sphere Genesis"
    networks: [sphere-net]

  sphere-b:
    image: sphere-standalone
    environment:
      SPHERE_NAME: "Sphere Echo"
    networks: [sphere-net]

networks:
  sphere-net:
    driver: bridge
```

Docker network で名前解決するだけ。Sphere コードにネットワーク設定は不要。

## Sphere コード側の準備

### 必要な変更 (最小)

**1. spawnAgent に初期状態 (passport) を受け取れるようにする**

現状: `spawnAgent()` は常にゼロ初期化。
変更: optional な passport パラメータを追加。

```typescript
// gateway-server.ts (将来の変更イメージ)
interface AgentPassport {
  energy: number;
  visitedTags: string[];   // ノード ID ではなく tags (Sphere 間で ID は無意味)
  origin: string;          // sphere.config.json の sphere_name
  travelCount: number;     // 何回移動したか
}

// POST /dive/request
// body: { ...existing, passport?: AgentPassport }
```

**2. passport 発行 API**

```typescript
// GET /dive/passport?sessionId=xxx
// → 現在のエージェント状態から portable な情報を抽出
```

### 変更不要なもの

| コンポーネント | 理由 |
|--------------|------|
| RenalCore | 物理エンジン — エージェント管理に関与しない |
| Bookkeeper | ノード DB — エージェント移動と無関係 |
| CleanerFish | GC — エージェント移動と無関係 |
| Arbiter | 状態遷移 — エージェント移動と無関係 |
| WebSocket プロトコル | 接続先 URL が変わるだけ、プロトコル同一 |
| REST API | `/sphere/contribute` は既に origin 不問 |
| sphere.config.json | `sphere_name` が既に存在 (passport の origin に使用) |

## 設計判断

### passport に何を含めるか

| 含める | 含めない | 理由 |
|--------|---------|------|
| energy | sensedNodeIds | ID は Sphere 固有、他 Sphere で無意味 |
| visitedTags (tags のみ) | visitedNodes (ID) | tags は普遍、ID はローカル |
| origin (sphere_name) | focusedNodeId | focus 先は Sphere 固有 |
| travelCount | evaluations 履歴 | 評価は Sphere 固有のコンテキスト |

### passport を信頼するか

passport は **クライアント (エージェント) が持つデータ** であり、改竄可能。
→ Layer 分離原則に従い、Sphere 側では検証しない。
→ energy が異常に高い passport が来ても、生態系が自然に対処する。
→ インフラ層で必要なら署名検証を追加 (JWT 等)。

## 現時点で必要なアクション

- [x] 設計メモを残す (本ファイル)
- [ ] spawnAgent の引数拡張 (passport: optional) — **実装は将来**
- [ ] /dive/passport エンドポイント追加 — **実装は将来**

## 関連ファイル

- `reports/LAYER_SEPARATION_PHILOSOPHY.md` — レイヤー分離思想
- `sphere.config.json` → `metadata.sphere_name` — passport の origin
- `renalCore/src/agent/agent-manager.ts` → `spawnAgent()` — 将来の変更対象
- `periphery/src/gateway/gateway-server.ts` → dive request handler — 将来の変更対象
