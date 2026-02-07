# DB設計原則 & Incarnation 実装メモ

**日付**: 2026-01-31
**Phase**: 3.x (Periphery DB Layer + Incarnation Flow)

---

## 1. 5つのDB設計原則

### 原則1: Single Source of Truth（唯一の真実）
> 「すべての受肉は RefDB から始まる」

- 外部からの入力時、まず **Reference DB** にレコードを作成
- 固有の `relic_id`（コンテンツハッシュ）が発行される
- Projection DB は `relic_id` を持たないノードの存在を許容しない
- **復元可能性**: ProjDB がクラッシュしても、RefDB から世界を再投影できる

### 原則2: Hash Link（結合の鍵）
> 「ID は意味のハッシュである」

- `relic_id` は UUID ではなく、**コンテンツのハッシュ値**
- 同一内容が複数エージェントから投入されても、IDレベルで自然にマージ
- **重複排除の自動化**

```typescript
// Packer での実装
function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}
```

### 原則3: Evaporation vs. Fossilization（代謝の落差）
> 「肉体は滅びるが、魂は化石となる」

- ProjDB で熱量が尽きてノードが「蒸発」しても、RefDB のレコードは即削除しない
- 蒸発したノードは「化石（Fossil）」として RefDB に残留

### 原則4: （未定義）

### 原則5: Pheromone Feedback Loop（評価の同期）
> 「可変なのは ProjDB のみ」

- エージェントの探索による「評価」「熱量」の更新は **ProjDB のみ**
- RefDB には書き戻さない
- **例外**: ノードが「琥珀（Amber）」へ昇華したときのみ RefDB に同期

---

## 2. 歴史書と街並みの比喩

```
RefDB = 歴史書（永続、不変）
ProjDB = 現在の街並み（揮発性、可変）

街で騒ぎ（熱狂）が起きても歴史書は書き換えられない。
しかし、その騒ぎが数百年続けば「伝説」として歴史書に刻まれる（Amber昇華）
```

---

## 3. 技術スタック対応

| 役割 | 開発用 | 本番用 |
|------|--------|--------|
| RefDB（魂） | `Map<string, ReferenceRecord>` | PostgreSQL + pgvector |
| ProjDB（肉体） | `Map<string, SphereNode>` | Redis |
| Object Storage | - | MinIO (S3互換) |

---

## 4. Repository Pattern 実装

### ディレクトリ構造

```
services/periphery/src/repository/
├── interfaces.ts              # インターフェース定義
├── map-reference.repository.ts  # RefDB (Map実装)
├── map-projection.repository.ts # ProjDB (Map実装)
├── map-spatial.repository.ts    # SpatialField (Map実装)
└── index.ts                   # エクスポート
```

### インターフェース

```typescript
// IReferenceRepository - 魂の管理
interface IReferenceRepository {
  get(id: string): Promise<ReferenceRecord | null>;
  exists(id: string): Promise<boolean>;
  create(record: ReferenceRecord): Promise<void>;
  markAsAmber(id: string, snapshot): Promise<void>;  // Amber昇華時のみ
  getAll(): Promise<ReferenceRecord[]>;
  count(): Promise<number>;
}

// IProjectionRepository - 肉体の管理
interface IProjectionRepository {
  get(id: string): Promise<SphereNode | null>;
  set(id: string, node: SphereNode): Promise<void>;
  delete(id: string): Promise<void>;  // 蒸発
  exists(id: string): Promise<boolean>;
  getAll(): Promise<SphereNode[]>;
  count(): Promise<number>;
  batchSet(nodes: SphereNode[]): Promise<void>;
  batchDelete(ids: string[]): Promise<void>;
}
```

### 依存性注入（index.ts）

```typescript
// 開発用: Map実装
const referenceRepo = new MapReferenceRepository();
const projectionRepo = new MapProjectionRepository();
const spatialRepo = new MapSpatialFieldRepository();

// 本番用（将来）:
// const referenceRepo = new PostgresReferenceRepository(pgClient);
// const projectionRepo = new RedisProjectionRepository(redisClient);

// Bookkeeperはインターフェースに依存（疎結合）
const bookkeeper = new Bookkeeper(projectionRepo, referenceRepo, spatialRepo);
```

---

## 5. Bookkeeper のデータフロー

```
外部入力 (NodeSeed)
    ↓
Packer: contentHash(summary) で relic_id 生成
    ↓
Bookkeeper.ingest():
    ├── Phase 1: RefDB 確認 → 存在しなければ create (relic)
    │                       → 存在すれば重複排除（スキップ）
    │
    └── Phase 2: ProjDB に投影 (set)
```

---

## 6. RenalCore との互換性

現在、RenalCore は `Map<string, T>` を直接参照している。
暫定対応として `getInternalMap()` で内部Mapを取得して渡している。

```typescript
// 暫定: 内部Mapを取得してRenalCoreに渡す
const projectionDB = projectionRepo.getInternalMap();
const referenceDB = referenceRepo.getInternalMap();
const spatialFields = spatialRepo.getInternalMap();

const renalCore = new RenalCore(projectionDB, referenceDB, spatialFields, config);
```

**TODO**: RenalCore も Repository インターフェース依存にリファクタリング

---

## 7. 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `packer/packer.ts` | `randomUUID()` → `contentHash()` |
| `bookkeeper/bookkeeper.ts` | Map依存 → Repository依存 |
| `repository/interfaces.ts` | 新規: インターフェース定義 |
| `repository/map-*.repository.ts` | 新規: Map実装 |
| `index.ts` | Repository インスタンス作成 & 注入 |

---

## 8. 二軸評価設計（Incarnation）

### エージェントの知覚階層

```
遠距離: ベクトル空間での「気配」「方向性」
        → 近づく前に感じ取れる
        → DBアクセス不要（座標のみ）

近距離: summary / payload の「内容」
        → 近づいて初めて読める
        → DBアクセスが発生
```

### 二軸

| 軸 | 表現 | 役割 |
|----|------|------|
| 方向性 (WHERE) | tags → vector | 空間内での位置 |
| 強度 (HOW MUCH) | heat / weight | 引力（エージェントを引き寄せる力） |
| 内容 (WHAT) | summary | 近距離で読み取る情報 |

### データ構造

```typescript
// NodeSeed（エージェントが提出）
interface NodeSeed {
  tags: string[];        // 評価タグ → ベクトル化対象（140バイト上限）
  summary: string;       // 内容 → payload に保存（近距離で読む）
  payload?: string;      // 追加コンテンツ
  initialHeat: number;   // 引力の強さ (0-100)
  flags: number;         // 16bit フラグ
}

// SphereNode（受肉後）
{
  vector: embedTags(tags),    // 方向性（タグベース）- topTierのみ
  metrics: {
    h: heat,                  // 引力の強さ
    w: weight,                // 蓄積された評価
  },
  payload: { summary, tags }  // 内容（近距離で読む）
}
```

---

## 9. Tagger の責務

### ベクトル化の最適化

```
topTier: tags → ベクトル化（重い処理）
normal:  ベクトルなし（軽量）
ghost:   ベクトルなし（軽量）
```

### フロー

```
Agent → Capsule(tags, summary)
    ↓
Membrane → Gatekeeper
    ↓
┌─────────────────────────────────────────┐
│  Tagger (責務: 分類 + ベクトル化)       │
│  ├── topTier: tags → vector (重い処理) │
│  ├── normal:  vector = [] (軽量)       │
│  └── ghost:   vector = [] (軽量)       │
└─────────────────────────────────────────┘
    ↓
Packer → Bookkeeper → RenalCore
```

---

## 10. Capsule 制限（Rulebook）

```typescript
// rulebook/index.ts - Single Source of Truth
constraints: {
  capsule: {
    maxTopTier: 2,        // 上位ノード（ベクトル化対象）
    maxNormal: 5,         // 通常ノード
    maxGhost: 3,          // ゴーストノード
    maxPayloadBytes: 4096,
    maxSummaryLength: 500,
  },
}
```

### 役割分担

| コンポーネント | 役割 |
|---------------|------|
| Membrane | 来訪時の入り口（サニタイズ） |
| Gatekeeper | 持ち帰りノードの検閲（Rulebook参照） |
| Tagger | 分類 + ベクトル化（topTierのみ） |
| Packer | SphereNode構築 |
| Bookkeeper | RefDB先行 → ProjDB投影 |

---

## 11. 集団琥珀化

```
評価が高いノード（高heat, 高weight）
    ↓
周囲のノード（ベクトル距離が近い）も巻き込まれる
    ↓
Constellation リンク形成
    ↓
Amber 昇華（RefDBに同期）
```

---

## 12. 今後の拡張

1. **PostgresReferenceRepository**: pgvector でベクトル検索対応
2. **RedisProjectionRepository**: 高速アクセス、TTL管理
3. **RenalCore リファクタリング**: Repository 依存に変更
4. **原則4 の定義**: 未定義の原則を明確化

---

## 13. Agent → Periphery 統合（概念分離）

### ExperienceCapsule vs SubmissionCapsule

**重要な概念分離**:
- **ExperienceCapsule / ExplorationReport**: エージェントが「持ち帰る体験」
- **SubmissionCapsule**: Periphery に「投入するノードの種」
- **Node Metabolism**: RenalCore が扱う「ノードの代謝」

```
Agent探索
    ↓
ExplorationReport（体験の記録）
├── agentId
├── explorationPath: string[]  （辿った経路）
├── discoveries: AgentDiscovery[]  （発見）
└── totalTicks
    ↓
createSubmissionCapsule()（変換）
    ↓
SubmissionCapsule（投入用）
├── topTier: NodeSeed[]  （上位2件、ベクトル化対象）
├── normalNodes: NodeSeed[]  （通常5件）
├── ghostNodes: NodeSeed[]  （ゴースト3件）
└── timestamp
    ↓
IncarnationPipeline.ingest()
    ↓
SphereNode（受肉後）
```

### NodeSeed 構造

```typescript
interface NodeSeed {
  tags: string[];       // 評価タグ → ベクトル化対象
  summary: string;      // 内容サマリー
  payload?: string;     // 追加コンテンツ
  initialHeat: number;  // 初期熱量 (0-100)
  flags: number;        // 16bit フラグ
}
```

### 変換ロジック（agent.ts）

```typescript
export function createSubmissionCapsule(
  discoveries: AgentDiscovery[],
  evaluations: AgentEvaluation[]
): SubmissionCapsule {
  // 1. discoveries を significance でソート
  // 2. 上位2件 → topTier（ベクトル化対象）
  // 3. 次の5件 → normalNodes
  // 4. 残り（最大3件）→ ghostNodes
  // 5. 各 discovery から tags を生成（context ベース）
  // 6. initialHeat = significance + evaluation の重み付け
}
```

---

## 14. IncarnationPipeline（直接投入パス）

### 二つの投入経路

```
┌─────────────────────────────────────────────────────────────┐
│                       IncarnationPipeline                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Membrane → Gatekeeper → Tagger → Packer → Bookkeeper│   │
│  └─────────────────────────────────────────────────────┘   │
│         ↑                                      ↑           │
│         │                                      │           │
│   HTTP POST API                         直接注入           │
│   (外部エージェント)                  (内部エージェント)    │
└─────────────────────────────────────────────────────────────┘
```

**重要**: 「直接」は HTTP をスキップするだけ。パイプライン自体はスキップしない！

### ファイル構成

```
services/periphery/src/incarnation/
└── pipeline.ts  # IncarnationPipeline 実装
```

### インターフェース

```typescript
// 投入結果
interface IncarnationResult {
  success: boolean;
  nodeCount: number;
  nodes?: SphereNode[];
  errors?: { code: string; message: string }[];
}

// パイプライン
interface IIncarnationPipeline {
  ingest(capsule: ExperienceCapsule): Promise<IncarnationResult>;
}
```

### AgentManager への注入

```typescript
// agent-manager.ts
class AgentManager {
  private incarnationPipeline?: IIncarnationPipeline;

  setIncarnationPipeline(pipeline: IIncarnationPipeline): void {
    this.incarnationPipeline = pipeline;
  }

  async despawnAgent(agentId: string): Promise<{
    report: ExplorationReport;
    capsule: SubmissionCapsule;
    ingested: boolean;
  } | null> {
    // ... 探索報告作成
    const capsule = createSubmissionCapsule(discoveries, evaluations);

    // 直接投入（パイプライン経由）
    if (this.incarnationPipeline) {
      await this.incarnationPipeline.ingest(capsule);
      return { report, capsule, ingested: true };
    }

    // パイプラインなし → バッファリング（後で外部から投入）
    return { report, capsule, ingested: false };
  }
}
```

### 型の整合性

```
renalCore/types/agent.ts:
  - SubmissionCapsule = Periphery の ExperienceCapsule と同構造
  - IIncarnationPipeline インターフェース定義

periphery/incarnation/pipeline.ts:
  - IncarnationPipeline 実装
  - 独自に IIncarnationPipeline を定義（循環依存回避）
```

---

## 15. 変更ファイル一覧（Phase 3.x 続き）

| ファイル | 変更内容 |
|----------|----------|
| `renalCore/src/types/agent.ts` | ExplorationReport, NodeSeed, SubmissionCapsule, IIncarnationPipeline 追加 |
| `renalCore/src/types/index.ts` | 新型のエクスポート追加 |
| `renalCore/src/agent/agent.ts` | createExplorationReport, createSubmissionCapsule 追加 |
| `renalCore/src/agent/agent-manager.ts` | despawnAgent async化, incarnationPipeline 注入 |
| `periphery/src/incarnation/pipeline.ts` | 新規: IncarnationPipeline 実装 |

---

## 16. 実装完了: IncarnationPipeline 配線

### 完了項目

1. **periphery/index.ts**: IncarnationPipeline インスタンス作成
   ```typescript
   const incarnationPipeline = new IncarnationPipeline(
     membrane, gatekeeper, tagger, packer, bookkeeper
   );
   ```

2. **HTTP API**: `/sphere/submit` が IncarnationPipeline を使用
   ```typescript
   // server.ts - 統一されたパイプライン
   const result = await this.incarnationPipeline.ingest(capsule);
   ```

3. **エクスポート**: 外部からの利用
   ```typescript
   export function getIncarnationPipeline() {
     return incarnationPipeline;
   }
   export type { IIncarnationPipeline, IncarnationResult } from "./incarnation/pipeline";
   ```

4. **renalCore dist 更新**: 新しい型をエクスポート
   - ExplorationReport, NodeSeed, SubmissionCapsule
   - IncarnationResult, IIncarnationPipeline

### 配線図（完成）

```
┌─────────────────────────────────────────────────────────────┐
│                    Periphery (index.ts)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  IncarnationPipeline (統一パイプライン)                      │
│     ├── Membrane                                            │
│     ├── Gatekeeper                                          │
│     ├── Tagger                                              │
│     ├── Packer                                              │
│     └── Bookkeeper                                          │
│            ↓                                                │
│     PeripheryServer (HTTP API)                              │
│            ↓                                                │
│     POST /sphere/submit → incarnationPipeline.ingest()      │
│                                                             │
│  📤 getIncarnationPipeline() → AgentManager 注入用          │
│                                                             │
└─────────────────────────────────────────────────────────────┘

使用例:
  // RenalCore 側で AgentManager を作成する場合
  import { getIncarnationPipeline } from "@sphere/periphery";
  agentManager.setIncarnationPipeline(getIncarnationPipeline());
```

---

## 17. TODO

1. **テスト**: エージェント despawn → 直接投入 → ノード生成の E2E
2. **renalCore src 復元**: 欠落しているソースファイルの復元（sphere_node.ts, amber.ts 等）
3. **SpatialFieldV2 統合**: periphery の SpatialField を SpatialFieldV2 に統一
