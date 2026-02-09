# Species Explorer UI — Design Document

> Stigmergic measurement apparatus for observing emergent personality in the Sphere

**作成日**: 2026-02-09
**ステータス**: 設計段階

---

## 概要

**Species Explorer UI** は、Sphere における種族 (Loadout) と LLM センサーの組み合わせによる創発的性格を観測するための最小限のインターフェースである。

### 目的

1. **性格の創発を実証する** — 1B パラメータの軽量 LLM でも、Loadout が異なれば行動が分化することを可視化
2. **種族特性を体験させる** — 9種の Loadout (balanced, scholar, scout, archivist, hunter, moth, hermit, wanderer, sniper) それぞれの知覚・行動パターンの違いを観測
3. **Digestor の代謝を透明化する** — 種族記憶がどのように蓄積・淘汰・還元されるかを概念レベルで提示
4. **Sphere の探索体験を外部化する** — 通常は内部で動く phi-agent の視点を、外部から観測できる窓を提供

### 非目的 (やらないこと)

- **コンテンツブラウザにしない** — Sphere のノード内容を検索・閲覧する UI ではない
- **FastGate/Feelings の再実装** — UI 側で探索ロジックを実装せず、全て phi-agent コンテナに委譲
- **直接的なノード操作** — inject 系や裏口 API を使わず、探索用エンドポイントのみ使用
- **複雑なダッシュボード** — ゴテゴテした機能を足さず、測定器具としての最小限を維持

---

## アーキテクチャ

### 基本構成

```
┌─────────────────────────────────────────────┐
│ Species Explorer UI                         │
│ (Hugging Face Space / Render)              │
│                                             │
│  [Model: llama3.2:1b]                      │
│  [Species: wanderer ▼]                     │
│  [Loadout 特性表示]                         │
│  [Execute Exploration →]                   │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ Real-time Cycle Viewer                │ │
│  │  Cycle 1: move → sense(3 nodes)       │ │
│  │    focus: abc123 [h:7, w:5, d:4]      │ │
│  │    feelings: [sat:0.3, stam:0.2...]   │ │
│  │  Cycle 2: ...                          │ │
│  └───────────────────────────────────────┘ │
└──────────────┬──────────────────────────────┘
               │
               │ docker run -e LOADOUT=wanderer \
               │            -e OLLAMA_MODEL=llama3.2:1b \
               │            -e SPHERE_URL=https://api.sphere.xxx \
               │            phi-agent
               ↓
┌──────────────────────────────────────────────┐
│ phi-agent (Docker コンテナ)                   │
│  - FastGate (perception)                    │
│  - Feelings (emotion-driven action)         │
│  - Loadout (personality vectors)            │
│  - species-profile.json (species memory)    │
└──────────────┬───────────────────────────────┘
               │
               │ HTTP (探索用 API のみ)
               │ /start-session, /move, /sense, /focus, /evaluate
               ↓
┌──────────────────────────────────────────────┐
│ Sphere API (Render: https://api.sphere.xxx) │
│  - Periphery (HTTP/WS endpoints)            │
│  - RenalCore (physics engine)               │
└──────────────────────────────────────────────┘

別プロセス (Docker volume 共有):
┌──────────────────────────────────────────────┐
│ Digestor (定期実行: 3時間ごと)                │
│  - eval-log.jsonl → scoring → pruning        │
│  - species-profile.json 生成                 │
│  - generations/gen-NNN.json アーカイブ        │
└──────────────────────────────────────────────┘
```

### 責務分離

| レイヤー | 責務 | 実装場所 |
|---------|------|---------|
| **UI** | ユーザー選択受付、結果表示、Docker 起動 | Hugging Face / Render (フロント) |
| **phi-agent** | FastGate, Feelings, Loadout (全探索ロジック) | Docker コンテナ |
| **Sphere API** | 物理法則、状態遷移、探索エンドポイント | Render (バックエンド) |
| **Digestor** | 種族記憶代謝 (scoring, pruning, archiving) | 別コンテナ (定期実行) |

**重要**: UI は phi-agent を起動して結果を受け取るのみ。探索ロジックは全て phi-agent に委譲。

---

## デプロイ構成

### サービス分離

| サービス | プラットフォーム | URL 例 | 責務 |
|---------|------------|--------|------|
| **Sphere API** | Render | `https://api.sphere.xxx` | 探索 API 提供 |
| **Species Explorer UI** | Hugging Face Space | `https://huggingface.co/spaces/user/species-explorer` | UI 提供 |
| **phi-agent** | Docker (UI から起動) | — | 探索ロジック実行 |
| **Digestor** | Docker (Sphere 側で定期実行) | — | 代謝処理 |

### CORS 設定

UI と Sphere API は別オリジン。Sphere API 側で CORS ヘッダー設定が必要:

```typescript
// Periphery 側
app.use(cors({
  origin: ['https://huggingface.co', 'https://your-ui-domain.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 環境変数

**UI (起動側)**:
- `SPHERE_URL` — Sphere API の URL (例: `https://api.sphere.xxx`)
- `OLLAMA_HOST` — Ollama サービスの URL (phi-agent 側から見える)

**phi-agent (コンテナ起動時に渡す)**:
- `LOADOUT` — 種族名 (例: `wanderer`, `scholar`, ...)
- `OLLAMA_MODEL` — モデル名 (初期は `llama3.2:1b` のみ)
- `SPHERE_URL` — Sphere API の URL
- `OLLAMA_HOST` — Ollama の URL
- `DAEMON` — `false` (1回のみ実行)
- `DAEMON_SLEEP_MS` — 不要

---

## UI コンポーネント

### 1. Model Selector

初期バージョンでは **llama3.2:1b のみ**。将来拡張用に UI は用意。

```
┌─────────────────────────┐
│ Model: llama3.2:1b  ▼   │  (disabled, 固定)
└─────────────────────────┘
```

### 2. Species Selector

9種の Loadout から選択。

```
┌─────────────────────────────────────────┐
│ Species: wanderer ▼                     │
│                                         │
│ • balanced    — Generalist explorer    │
│ • scholar     — Deep reader, weight>heat│
│ • scout       — Quick surveyor          │
│ • archivist   — Preservationist         │
│ • hunter      — Heat seeker             │
│ • moth        — Heat generator          │
│ • hermit      — Stability seeker        │
│ • wanderer    — Exhaustive explorer     │
│ • sniper      — Selective evaluator     │
└─────────────────────────────────────────┘
```

### 3. Loadout Characteristics Display

選択した種族の特性を可視化。武器 (Weapon) は選べないが、その種族がどんな値観を持つかを表示。

```
┌─────────────────────────────────────────────────┐
│ wanderer — Exhaustive Explorer                 │
├─────────────────────────────────────────────────┤
│ Quality Vector:  [0.3, 0.3, 0.3, 0.3]          │
│   (均等 — バイアスなし)                          │
│                                                 │
│ Return Weights:  [0.0, 0.0, 1.0, 0.0]          │
│   (stamina のみで判断 — 体力が尽きるまで探索)    │
│                                                 │
│ Walk Preference: hot (熱い領域を追う)            │
│                                                 │
│ Min Cycles: 1 (すぐには帰らない)                 │
│                                                 │
│ Eval Focus: "Rate honestly. No bias."          │
└─────────────────────────────────────────────────┘
```

### 4. Execute Button

探索を開始。内部で phi-agent コンテナを起動。

```
┌─────────────────────────┐
│ Execute Exploration →   │
└─────────────────────────┘
```

クリック後、ボタンは disabled になり "Exploring..." 表示。

### 5. Real-time Cycle Viewer

phi-agent からの出力をストリーミング表示。WebSocket or SSE で実装。

```
┌───────────────────────────────────────────────────────┐
│ Session: wanderer × llama3.2:1b                      │
│ Energy: 78 / 100                                      │
│ Cycles: 2 / ?                                         │
├───────────────────────────────────────────────────────┤
│ Cycle 1:                                              │
│   move(5, "hot") → location: [127, -34, 8]           │
│   sense(radius=20) → 3 nodes discovered              │
│     - abc123: [psychology, cognition] h:6 w:5        │
│     - def456: [linguistics, theory] h:8 w:4          │
│     - ghi789: [algorithm, graph] h:5 w:7             │
│   focus → abc123 (picked by FastGate)                │
│   evaluate → h:7, w:5, d:4                           │
│     reason: "Highly relevant to cognitive patterns"  │
│   feelings: [sat:0.35, frust:0.0, stam:0.22, ...]   │
│   bus emit: (none)                                    │
│                                                       │
│ Cycle 2:                                              │
│   move(5, "hot") → location: [132, -29, 10]          │
│   sense(radius=20) → 4 nodes discovered              │
│   ...                                                 │
└───────────────────────────────────────────────────────┘
```

**表示する情報** (L2 レベル):
- 各サイクルのアクション (`move`, `sense`, `focus`, `evaluate`)
- 発見したノードの nodeId, tags, h/w/d スコア (summary は省略可)
- FastGate で選択した理由 (optional)
- Feelings の状態
- Bus emit/recv (あれば)
- エネルギー残量

**表示しない情報** (L3/L4):
- ノードの content (本文) — これは Sphere 内部でのみアクセス可能
- sourceNodeId, ref_url — L4 メタデータ

### 6. Digestor Status Panel

```
┌───────────────────────────────────────────────────────┐
│ Species Memory Metabolism (Digestor)                 │
├───────────────────────────────────────────────────────┤
│ Last Digest: 2026-02-09 12:00 UTC (3 hours ago)      │
│ Next Digest: ~2026-02-09 15:00 UTC (in 30 min)       │
│                                                       │
│ Current Generation: 42                                │
│ Evaluations in Memory: 387                           │
│ Hunger Level: 0.48 (moderate pruning)                │
│                                                       │
│ [View Generation Archive →]                          │
└───────────────────────────────────────────────────────┘
```

**最小限の説明**:
- 3時間ごとに代謝が走る
- データが少ない (< MIN_EVALS) と実行されない
- Generation 番号と評価数のみ表示
- Archive は別ページで `gen-NNN.json` を可視化 (将来)

---

## データフロー

### 1. ユーザー操作 → phi-agent 起動

```typescript
// UI backend (例: FastAPI, Flask, or Node.js)
app.post('/api/explore', async (req, res) => {
  const { loadout, model } = req.body;

  // Docker コンテナを起動
  const result = await execAsync(`
    docker run --rm \
      -e LOADOUT=${loadout} \
      -e OLLAMA_MODEL=${model} \
      -e SPHERE_URL=${process.env.SPHERE_URL} \
      -e OLLAMA_HOST=${process.env.OLLAMA_HOST} \
      -e DAEMON=false \
      phi-agent:latest
  `);

  // 結果をパース (JSON Lines 形式を想定)
  const cycles = parsePhiAgentOutput(result.stdout);

  res.json({ cycles });
});
```

### 2. phi-agent → Sphere API

phi-agent は環境変数で受け取った `SPHERE_URL` に対して探索 API を叩く:

```typescript
// phi-agent/src/agent.ts (既存実装)
const sphereClient = new SphereClient(SPHERE_URL);

// Session start
const sessionId = await sphereClient.startSession({ energy: 100 });

// Exploration loop
await sphereClient.move(sessionId, { step: 5, mode: 'hot' });
const senseResult = await sphereClient.sense(sessionId, { radius: 20 });
const focusResult = await sphereClient.focus(sessionId, { nodeId: pickedId });
await sphereClient.evaluate(sessionId, { nodeId: pickedId, h, w, d });
```

使用するエンドポイント:
- `POST /start-session`
- `POST /move`
- `GET /sense`
- `GET /focus`
- `POST /evaluate`
- `POST /end-session` (optional, return 時)

### 3. 結果の UI 表示

phi-agent の stdout/stderr をパースして、サイクルごとの情報を抽出。

**出力例** (phi-agent が出す JSON Lines):
```jsonlines
{"type":"cycle","num":1,"action":"move","result":{"location":[127,-34,8]}}
{"type":"cycle","num":1,"action":"sense","result":{"nodes":[{"nodeId":"abc123","tags":["psychology"],"h":6,"w":5}]}}
{"type":"cycle","num":1,"action":"focus","nodeId":"abc123"}
{"type":"cycle","num":1,"action":"evaluate","nodeId":"abc123","h":7,"w":5,"d":4,"reason":"Relevant"}
{"type":"cycle","num":1,"feelings":{"satisfaction":0.35,"frustration":0.0,"stamina":0.22,"staleness":0.0}}
{"type":"session_end","reason":"return","cycles":3,"evaluations":3}
```

UI はこれを受け取って表示。

---

## 技術スタック

### Frontend (Species Explorer UI)

**Option A: Hugging Face Spaces (Gradio/Streamlit)**
- **Gradio** (推奨) — シンプルな UI に最適、リアルタイム更新可能
- **Streamlit** — より自由度高い、カスタマイズ可能

**Option B: Custom Web App**
- **Frontend**: React / Svelte / Vue
- **Backend**: FastAPI (Python) or Express (Node.js)
- **Deploy**: Hugging Face Spaces (Dockerfile モード)

### Backend (phi-agent 起動)

UI から Docker コンテナを起動するため、バックエンドが必要:

```python
# FastAPI example
from fastapi import FastAPI
import subprocess
import json

app = FastAPI()

@app.post("/api/explore")
async def explore(loadout: str, model: str):
    result = subprocess.run([
        "docker", "run", "--rm",
        "-e", f"LOADOUT={loadout}",
        "-e", f"OLLAMA_MODEL={model}",
        "-e", f"SPHERE_URL={SPHERE_URL}",
        "-e", f"OLLAMA_HOST={OLLAMA_HOST}",
        "-e", "DAEMON=false",
        "phi-agent:latest"
    ], capture_output=True, text=True)

    # Parse JSON Lines output
    cycles = [json.loads(line) for line in result.stdout.strip().split('\n')]

    return {"cycles": cycles}
```

### phi-agent Output Format (新規実装)

既存の phi-agent に JSON Lines 出力モードを追加:

```typescript
// phi-agent/src/agent.ts
function logCycle(data: any) {
  if (process.env.OUTPUT_FORMAT === 'jsonl') {
    console.log(JSON.stringify(data));
  } else {
    // 既存のログ形式
    console.log(`[Cycle ${data.num}] ${data.action} → ${data.result}`);
  }
}
```

### Sphere API (既存)

変更不要。既に探索エンドポイントは実装済み。

---

## 表示データ仕様

### Access Level

Sphere には Access Level が存在:

| Level | 内容 | 可視メソッド |
|-------|------|-------------|
| L1 | tags | scanL1() |
| L2 | tags + summary | sense() |
| L3 | content | focus() |
| L4 | sourceNodeId, ref_url | focus() |

**UI で表示するのは L2 まで**:
- ✅ nodeId
- ✅ tags
- ✅ h/w/d スコア
- ✅ summary (optional — 短いものなら表示可)
- ❌ content (L3 — 表示しない)
- ❌ sourceNodeId, ref_url (L4 — 表示しない)

**理由**: Sphere は実験場であり、コンテンツそのものを持ち出すことは意図していない。UI は「エージェントが何を知覚したか」を示す測定器具であり、コンテンツブラウザではない。

### Feelings Display

4D Feelings をシンプルに可視化:

```
┌─────────────────────────────────────────┐
│ Feelings:                               │
│  Satisfaction: ████████░░ 0.35          │
│  Frustration:  ░░░░░░░░░░ 0.00          │
│  Stamina:      ██████████ 0.22          │
│  Staleness:    ░░░░░░░░░░ 0.00          │
│                                         │
│ Return Desire: ███░░░░░░░ 0.16 (0%)    │
└─────────────────────────────────────────┘
```

または数値のみ:

```
feelings: [sat:0.35, frust:0.00, stam:0.22, stale:0.00] → return:16%
```

---

## 設計原則

### 1. Stigmergic Measurement Apparatus

UI はコンテンツを見せるのではなく、**エージェントがどう知覚しているか**を測定する器具。

- 知覚 (sense) の結果 → 何を見つけたか
- 選択 (FastGate) → 何に注目したか
- 評価 (evaluate) → どう感じたか
- 感情 (feelings) → 次に何をしたいか

### 2. 最小限のインターフェース

ゴテゴテしない。必要な情報のみ。

- Species 選択
- Execute
- リアルタイム表示
- (optional) Digestor ステータス

**追加しない**:
- ノード検索
- グラフビジュアライゼーション (将来は可)
- 複雑なフィルタリング

### 3. Sphere UI のスタイルを踏襲

既存の Sphere UI (sphere-ui/) のデザイン言語を参考に:
- **白基調のミニマルデザイン** (bg: #fafafa, card: #ffffff)
- **シンプルな境界線** (1px solid #e0e0e0, 影なし)
- **サンセリフフォント** (-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto)
- **抑えめのアクセントカラー** (text: #000, accent: #3a3a3a)
- **状態色は明確に** (active: #4a90e2, amber: #d4a017, ghost: #7b68ee)
- **透明ベースのボタン** (border + hover 時に薄いグレー背景)
- **ID/データはモノスペース** (本文はサンセリフ)

### 4. 探索エンドポイントのみ使用

inject 系や裏口 API は使わない。公開された探索エンドポイントのみ:

```
✅ /start-session
✅ /move
✅ /sense
✅ /focus
✅ /evaluate
✅ /end-session

❌ /inject  (使わない)
❌ 直接 DB アクセス (しない)
```

---

## 将来拡張

### Phase 2: Multi-Model Support

llama3.2:1b に加えて:
- phi3:mini (3.8B)
- qwen2.5:0.5b (0.5B — 超軽量)
- GPT-4o-mini (API 経由)

モデルごとの evalFocus 感度の違いを可視化。

### Phase 3: Species Comparison

複数の種族を同時に走らせて、行動パターンを比較:

```
┌─────────────────────────────────────────┐
│ wanderer (h:7.0, w:4.9) — 13 emits     │
│ hermit   (h:5.3, w:3.9) — 19 recvs     │
│ scholar  (h:5.0, w:5.7) — deep walk    │
└─────────────────────────────────────────┘
```

### Phase 4: Generation Archive Viewer

Digestor の `generations/gen-NNN.json` を可視化:

- 世代ごとのスコア分布変化
- 種族ごとの進化曲線
- 淘汰圧 (hunger) の推移

### Phase 5: Bus Activity Visualization

ActiveBus の emit/recv を可視化:

- どの種族が温度源 (emit 多) か
- どの種族が匂い吸収者 (recv 多) か
- リアルタイムのフェロモン伝播

---

## 実装優先順位

### MVP (Minimum Viable Product)

1. **Species Selector** — 9種から選択
2. **Loadout 特性表示** — qualityVector, returnWeights, walkPreference
3. **Execute ボタン** — phi-agent 起動
4. **Real-time Cycle Viewer** — JSON Lines パース → 表示
5. **Model 固定** — llama3.2:1b のみ

### Phase 1.5 (MVP+)

6. **Digestor ステータス** — 最終実行時刻、次回予定、世代番号
7. **Feelings 可視化** — 4D ゲージ or 数値表示
8. **Bus emit/recv 表示** — サイクルごとの通信ログ

### Phase 2 (Enhancement)

9. **Multi-model 対応** — phi3:mini, qwen2.5:0.5b
10. **Species 比較モード** — 並列実行
11. **Generation Archive Viewer** — 世代推移グラフ

---

## 関連ドキュメント

- [COUPLING_LAYER_AND_DIGESTOR_GUIDE.md](../docs/COUPLING_LAYER_AND_DIGESTOR_GUIDE.md) — 全体アーキテクチャ
- [EMERGENT_PERSONALITY_MEMO.md](./EMERGENT_PERSONALITY_MEMO.md) — 性格創発の原理
- [LOADOUT_DESIGN_MEMO.md](./LOADOUT_DESIGN_MEMO.md) — Loadout 設計
- [SPECIES_MEMORY_METABOLISM_DESIGN.md](./SPECIES_MEMORY_METABOLISM_DESIGN.md) — Digestor 設計
- [EVALFOCUS_PROMPT_PATTERNS.md](./EVALFOCUS_PROMPT_PATTERNS.md) — 1B vs 3B の感度差
- [DATA_ACCUMULATION_20260209.md](./DATA_ACCUMULATION_20260209.md) — 実データ蓄積結果

---

## まとめ

Species Explorer UI は **測定器具** であり、**コンテンツブラウザではない**。

- Loadout (遺伝子) × LLM (感覚器官) × Sphere (環境) = 創発的性格
- UI は phi-agent を起動して観測するのみ。ロジックは実装しない
- 表示は L2 (summary) まで。content は持ち出さない
- 最小限、ゴテゴテしない、Sphere の哲学を踏襲

**次のステップ**: MVP 実装 (Gradio or FastAPI + React)
