# TODO: Link Node 外部生成化

**作成日**: 2026-02-01
**優先度**: 高
**関連**: renalCore 責務純粋化、Observatory 機能拡張

---

## 設計方針

### 原則

```
┌─────────────────────────────────────────────────────────────┐
│  Sphere は自ら何も生み出さない                              │
│  すべてのノードは外部から持ち込まれる                       │
│  Observatory が接続されていなければ、Link は生成されない    │
└─────────────────────────────────────────────────────────────┘
```

### 責務分離

| コンポーネント | 責務 | 備考 |
|---------------|------|------|
| **RenalCore** | 物理演算（tick = 生体能力） | Pulse 送信しない |
| **Arbiter** | 状態監視・判定 | Link 候補を検出 |
| **Periphery** | 外部通信の窓口 | Pulse 送信を担当 |
| **Observatory** | 外部監視 + ノード生成 | Link/Environmental Node を contribute |

---

## ノード生成の責務（確定）

| ノード種別 | 生成元 | 経路 |
|-----------|--------|------|
| Active | 外部 Agent | Capsule → Gatekeeper → Bookkeeper |
| Environmental | Observatory | Pulse 異常検知 → contribute |
| **Link** | Observatory | Arbiter 通知 → contribute |
| Amber/Fossil/Ghost | 内部遷移 | Arbiter → Bookkeeper（既存ノードの変換のみ） |

---

## 実装計画

### Phase 1: Pulse 送信の移動

**renalCore から削除:**
```typescript
// 削除
- processPulseBroadcast()
- UDP socket 管理
- closePulseSocket()
```

**renalCore に追加:**
```typescript
// データ生成のみ（送信しない）
getPulseData(): PulseData {
  return {
    cid: "global",
    ts: Date.now(),
    sig: { a, r, d, f },
    flg: this.computePulseFlags(),
    tick: this.tickCount
  };
}
```

**periphery/src/index.ts に追加:**
```typescript
// Pulse 送信を Periphery が担当
import dgram from "dgram";

const pulseSocket = dgram.createSocket("udp4");

if (shouldObserve) {
  const queue = arbiter.observe(projectionDB, { isPaused });
  await bookkeeper.applyTransitions(queue);

  // Pulse 送信（Arbiter の結果を含む）
  const pulseData = renalCore.getPulseData();
  const packet: PulsePacket = {
    ...pulseData,
    linkCandidates: queue.shouldSpawnLink  // Arbiter の判定結果
  };

  const msg = Buffer.from(JSON.stringify(packet));
  pulseSocket.send(msg, pulseConfig.port, pulseConfig.broadcastAddress);
}
```

### Phase 2: Link 候補検出を Arbiter に移動

**renalCore から削除:**
```typescript
// 削除
- processLinkNodeGeneration()
- spawnLinkNode()
- computeLinkPosition()
- computeBranchingFactor()
- isBehavingAsLink()

// 削除する設定
- linkTraversalThreshold
- linkStayTimeThreshold
- linkBranchingThreshold
- linkSemanticDistanceThreshold
- hackTraversalThreshold      // Arbiter へ
- hackStayRatioThreshold      // Arbiter へ
```

**Arbiter に追加:**
```typescript
interface LinkCandidate {
  sourceId: string;      // 起点ノード
  targetId: string;      // 終点 Amber（経路先）
  midpoint: Vector;      // 中間座標
  metrics: {
    traversal: number;
    stayTime: number;
    branchingFactor: number;
  };
}

interface TransitionQueue {
  shouldAscend: SphereNode[];
  shouldErode: SphereNode[];
  shouldStrip: SphereNode[];
  shouldSpawnLink: LinkCandidate[];  // NEW
}
```

**Arbiter の observe() に追加:**
```typescript
// Link 候補検出
for (const node of projDB.values()) {
  if (node.kind === "active" && this.isLinkCandidate(node)) {
    const target = this.findNearestAmber(node, projDB);
    if (target) {
      queue.shouldSpawnLink.push({
        sourceId: node.id,
        targetId: target.id,
        midpoint: this.computeMidpoint(node.vector, target.vector),
        metrics: { ... }
      });
    }
  }
}
```

### Phase 3: Observatory で Link 生成

**Observatory に追加:**
```typescript
// linkCandidates を受信したら Link Node を生成
if (packet.linkCandidates?.length > 0) {
  for (const candidate of packet.linkCandidates) {
    await this.contributeLinkNode(candidate);
  }
}

private async contributeLinkNode(candidate: LinkCandidate): Promise<void> {
  const linkNode = {
    kind: "link",
    vector: candidate.midpoint,
    payload: null,
    linkMeta: {
      source: candidate.sourceId,
      target: candidate.targetId
    }
  };

  await fetch(`${this.sphereUrl}/sphere/contribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(linkNode)
  });
}
```

---

## 座標計算

```
Link Node の位置 = 琥珀ノード間の中間点

midpoint = (source.vector + target.vector) / 2
```

- 複雑な空間演算は不要
- Amber 同士を繋ぐ経路として機能

---

## Arbiter の閾値（移動後）

| 閾値 | 用途 | 現在値 |
|------|------|--------|
| `linkTraversalThreshold` | Link 候補判定 | 10 → **要調整** |
| `linkStayTimeThreshold` | Link 候補判定 | 5 → **単位確認** |
| `linkBranchingThreshold` | 分岐係数判定 | 現状維持 |
| `hackTraversalThreshold` | 不正検出 | 50 → **要調整** |
| `hackStayRatioThreshold` | 不正検出 | 0.1 |

※ 閾値調整は [TODO_THRESHOLD_CONSISTENCY.md](./TODO_THRESHOLD_CONSISTENCY.md) 参照

---

## 依存関係の変化

### Before
```
renalCore ──(UDP)──→ Observatory
    │
    └──(直接生成)──→ Link Node
```

### After
```
renalCore ──(データ)──→ Periphery ──(UDP)──→ Observatory
                            │                     │
                      Arbiter 判定         Link Node 生成
                            │                     │
                            └─────────────────────┘
                                     ↓
                              /sphere/contribute
```

---

## チェックリスト

### Phase 1: Pulse 移動
- [ ] renalCore から UDP socket 削除
- [ ] renalCore に `getPulseData()` 追加
- [ ] periphery に Pulse 送信処理を移動
- [ ] sphere.config.json の pulse 設定を periphery で読み取り

### Phase 2: Link 判定移動
- [ ] renalCore から Link 関連処理を削除
- [ ] Arbiter に `shouldSpawnLink` キュー追加
- [ ] Arbiter に Link 候補検出ロジック追加
- [ ] ArbiterConfig に閾値を移動

### Phase 3: Observatory 拡張
- [ ] PulsePacket に `linkCandidates` フィールド追加
- [ ] Observatory で linkCandidates 受信処理
- [ ] Link Node の contribute 実装
- [ ] contribute 用のノード構造定義

### Phase 4: 閾値調整
- [ ] traversal/stayTime 減衰との整合性確認
- [ ] 閾値の適正値を決定
- [ ] テストで動作確認

---

## 関連ファイル

- [renalcore.ts](../services/renalCore/src/renalcore.ts)
- [arbiter.ts](../services/periphery/src/arbiter/arbiter.ts)
- [periphery/index.ts](../services/periphery/src/index.ts)
- [observatory.ts](../services/observatory/src/observatory.ts)
- [TODO_THRESHOLD_CONSISTENCY.md](./TODO_THRESHOLD_CONSISTENCY.md)

---

## Link 候補検出: 共起ベース設計（2026-02-02 追記）

### 問題

「Amber A と Amber B が経路として利用されている」をどう検出するか？

**制約**:
- エージェントの追跡は行わない（プライバシー・設計原則）
- Link は Amber 間のみに生成される
- **各 Amber は 1-2 本の Link のみ許可**（全結合防止）

### 解決策: セッション共起（Co-occurrence）

```
┌─────────────────────────────────────────────────────────────┐
│  同じセッションで訪問された Amber = 思考の連鎖               │
│  エージェントを追跡せず、セッション単位で集計                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  利用されない Link → heat 減衰 → Relic → Fossil            │
│  → 自然淘汰により「意味のある道」だけが残る                 │
└─────────────────────────────────────────────────────────────┘
```

### データソース: AutoCapsule

エージェントが return() する際に生成される AutoCapsule に全訪問記録がある。

```typescript
interface AutoCapsule {
  sessionId: string;
  duration: number;
  visits: VisitRecord[];  // 全訪問記録
  summaryMetrics: SummaryMetrics;
}

interface VisitRecord {
  nodeId: string;
  kind: NodeKind;     // "amber" でフィルタ可能
  stayTime: number;
  traversal: number;
  focusCount: number;
  heatDelta: number;
}
```

### 処理フロー（Observatory 経由）

```
┌─────────────────────────────────────────────────────────────┐
│  Observatory = 外部の「神の目」                             │
│  → Link 生成も Environmental 生成も Observatory が指示     │
│  → 接続されていなければ生成されない（オプション機能）       │
└─────────────────────────────────────────────────────────────┘
```

```
[受肉時] Agent Session → AutoCapsule
    │
    ▼
Arbiter.processCoOccurrence(visits)
    │
    │ 1. Amber 訪問を抽出
    │ 2. 各ペアの共起カウント更新（減衰適用）
    │ 3. 閾値超過ペアを内部キューに蓄積
    │
    ▼
（蓄積のみ、通知はしない）

[Pulse 時] PulseBroadcaster
    │
    │ Arbiter.getLinkCandidates() → 閾値超過ペアを取得
    │
    ▼
PulsePacket に linkCandidates を含めて UDP broadcast
    │
    ▼
Observatory（外部サービス）
    │
    │ 受信 → 判断（Link 上限、既存 Link 確認など）
    │
    ├── POST /sphere/forge/link → LinkForge
    └── POST /sphere/forge/env  → EnvForge
    │
    ▼
LinkForge → Link Node 生成（上限チェック含む）
```

**重要**:
- 受肉時: 共起の記録のみ（通知しない）
- Pulse 時: 候補を Pulse に含めて送信
- Observatory: 受信して判断 → Forge に指示
- **Observatory なし = Link/Env Node は生成されない（オプション機能）**

### PulsePacket 拡張

```typescript
/**
 * Link 候補（共起閾値を超えた Amber ペア）
 */
interface LinkCandidate {
  sourceId: string;  // Amber A
  targetId: string;  // Amber B
  score: number;     // 共起カウント（減衰適用後）
}

/**
 * PulsePacket（拡張版）
 */
interface PulsePacket {
  cid: string;
  ts: number;
  sig: PulseSignal;
  flg: number;
  tick: number;
  // === 追加 ===
  linkCandidates?: LinkCandidate[];  // 共起閾値を超えた Amber ペア
}
```

**設計意図**:
- Pulse = 環境信号 + Link 候補
- 同じ通信チャネルで統合
- Observatory は Pulse を受信するだけで全情報を取得

### 処理タイミングの設計原則

```
┌─────────────────────────────────────────────────────────────┐
│  生物のリズム: 処理は Pulse タイミングに同期                │
│  毎 Tick の処理は RenalCore（物理）のみ                     │
└─────────────────────────────────────────────────────────────┘
```

| 処理 | タイミング | 理由 |
|------|------------|------|
| RenalCore.tick() | 毎 Tick | 物理法則（減衰）は常に作用 |
| PulseBroadcaster | Pulse 間隔 | 外部への信号放射 |
| Arbiter.observe() | **Pulse 間隔** | 状態監視は呼吸のリズム |
| 共起処理 | **受肉タイミング** | イベント駆動（セッション終了時） |

```typescript
// periphery/src/index.ts
const observationInterval = pulseConfig?.intervalTicks ?? 10;
const shouldObserve = tickCounter % observationInterval === 0;

// Arbiter.observe() は Pulse タイミングでのみ実行
if (shouldObserve && snapshot) {
  const queue = arbiter.observe(projectionDB, { isPaused });
  await bookkeeper.applyTransitions(queue);
}
```

**設計意図**:
- 心拍（Tick）は常に刻む
- 呼吸（Pulse）のリズムで状態を観測
- 必要以上に監視しない（処理効率 + 生物的自然さ）

### 共起カウンターの設計（Arbiter 内部）

```typescript
/**
 * Amber 共起カウンター
 *
 * [Location] Arbiter 内部に保持
 * [Design] セッション単位の共起を記録
 * [Decay] 経過時間ベースで減衰（毎 Tick ループ不要）
 */
interface CoOccurrenceEntry {
  count: number;
  lastUpdated: number;  // 減衰計算用（timestamp）
}

// Arbiter 内部
private coOccurrenceStore: Map<string, CoOccurrenceEntry> = new Map();

// キー生成（順序を正規化）
function coKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}
```

### 経過時間ベースの減衰

毎 Tick ループではなく、アクセス時に経過時間分の減衰を適用。

```typescript
/**
 * 経過時間ベースの減衰計算
 *
 * [Design] アクセス時に減衰を適用（Lazy Decay）
 * [Formula] count *= (1 - decayRate)^(elapsed / TICK_MS)
 */
private applyDecay(entry: CoOccurrenceEntry): void {
  const now = Date.now();
  const elapsed = now - entry.lastUpdated;
  const ticks = elapsed / TICK_MS;  // 経過 Tick 数

  // 複利計算: (1 - rate)^ticks
  const decayFactor = Math.pow(1 - this.config.coOccurrenceDecayRate, ticks);
  entry.count *= decayFactor;
  entry.lastUpdated = now;
}
```

### 閾値設計

| パラメータ | 値（案） | 説明 |
|-----------|---------|------|
| `linkCoOccurrenceThreshold` | 5 | Link 生成に必要な共起回数 |
| `coOccurrenceDecayRate` | 0.01 | 毎 Tick 相当の減衰率（1%） |
| `maxLinksPerAmber` | 2 | 各 Amber が持てる Link の上限 |

**定常状態計算**:
```
定常状態 = 加算量/Tick ÷ 減衰率

例: 毎10セッションで1回共起（0.1/session × 1session/10tick = 0.01/tick）
定常状態 = 0.01 / 0.01 = 1

例: 毎2セッションで1回共起（0.5/session × 1session/10tick = 0.05/tick）
定常状態 = 0.05 / 0.01 = 5 → 閾値到達
```

### Link 上限制約

```typescript
/**
 * Link 生成前のチェック（LinkForge）
 */
async forgeLink(request: LinkRequest): Promise<SphereNode | null> {
  const sourceLinks = await this.countLinksForAmber(request.sourceId);
  const targetLinks = await this.countLinksForAmber(request.targetId);

  // 既に上限に達している場合は生成しない
  if (sourceLinks >= this.config.maxLinksPerAmber ||
      targetLinks >= this.config.maxLinksPerAmber) {
    return null;
  }

  // 生成続行...
}
```

### 実装箇所

| ファイル | 変更内容 |
|----------|----------|
| `renalCore/src/types/pulse.ts` | `PulsePacket` に `linkCandidates` 追加 |
| `periphery/src/arbiter/arbiter.ts` | CoOccurrenceStore 追加、`processCoOccurrence()`, `getLinkCandidates()` 追加 |
| `periphery/src/pulse/pulse-broadcaster.ts` | Arbiter から候補取得 → Pulse に含める |
| `periphery/src/gateway/return-handler.ts` | 受肉時に `arbiter.processCoOccurrence()` 呼び出し |
| `periphery/src/forge/link-forge.ts` | Link 上限チェック追加 |
| `sphere.config.json` | `linkCoOccurrenceThreshold`, `coOccurrenceDecayRate`, `maxLinksPerAmber` 追加 |

**注**:
- 別ファイル（cooccurrence/store.ts）は不要。Arbiter 内部で完結。
- Observatory なしでも Sphere は動作する（Link/Env Node は生成されないだけ）

### 利点

1. **エージェント追跡なし**: セッション単位の匿名集計
2. **既存データ活用**: AutoCapsule.visits は既に記録されている
3. **意味のある接続**: 「同じ思考の流れで訪問した」= 概念的関連
4. **自然な形成**: 多くのエージェントが同じペアを訪問 → 道ができる
5. **自然淘汰**: 使われない Link は減衰 → 化石化
6. **処理効率**: 毎 Tick ループ不要、受肉タイミングのみ

### traversal/stayTime 閾値との関係

**旧設計（TODO_THRESHOLD_CONSISTENCY.md の問題）**:
- `linkTraversalThreshold` / `linkStayTimeThreshold` は個別ノードのメトリクス
- Amber 間の「関連性」を測れない
- **traversal/stayTime の減衰は実装されていない**（メモのみ）

**新設計**:
- 共起カウントは Amber ペアの関連性を直接測定
- 個別ノードの traversal/stayTime は別の用途（hack 検知など）に使用

**結論**: 旧閾値は Link 生成には使わない。共起ベースに移行。
`linkTraversalThreshold` / `linkStayTimeThreshold` は deprecated。

---

## NodeForge: 内部ノード成型工房

### 概要

外部から来たノード（Capsule）は Packer → Gatekeeper を通る。
内部発生ノード（Link, Environmental）は **NodeForge** を通る。

```
┌─────────────────────────────────────────────────────────────┐
│  NodeForge = 内部発生ノードの成型工房                       │
│  工法（Strategy）をスイッチ可能                             │
└─────────────────────────────────────────────────────────────┘
```

### アーキテクチャ

```
Observatory
    │
    ├─ Link 候補 ─────────→ POST /sphere/forge/link
    │                           │
    └─ 異常検知 ──────────→ POST /sphere/forge/environmental
                                │
                          ┌─────┴─────┐
                          │ NodeForge │
                          │  (Router) │
                          └─────┬─────┘
                                │
                    ┌───────────┼───────────┐
                    ↓           ↓           ↓
               ILinkForge  IEnvForge    (将来拡張)
                    │           │
                    └───────────┴───────────┐
                                            ↓
                                      Bookkeeper
```

### インターフェース設計（Strategy Pattern）

```typescript
// 工法をスイッチ可能にする

interface ILinkForge {
  forge(request: LinkRequest, projDB: Map<string, SphereNode>): SphereNode | null;
}

interface IEnvForge {
  forge(request: EnvironmentalRequest, projDB: Map<string, SphereNode>): SphereNode | null;
}

// デフォルト実装
class MidpointLinkForge implements ILinkForge { ... }
class StatisticalEnvForge implements IEnvForge { ... }

// 将来の代替実装例
class WeightedMidpointLinkForge implements ILinkForge { ... }  // 重み付き中間点
class ClusterBasedEnvForge implements IEnvForge { ... }        // クラスタ分析ベース
```

### 処理対象

| ノード種別 | Forge | 入力 | 計算 |
|-----------|-------|------|------|
| **Link** | ILinkForge | sourceId, targetId | 中間点ベクトル |
| **Environmental** | IEnvForge | 異常検知データ | 配置位置（戦略による） |

### Link Node 成型

```typescript
interface LinkRequest {
  sourceId: string;
  targetId: string;
}

class MidpointLinkForge implements ILinkForge {
  forge(request: LinkRequest, projDB): SphereNode | null {
    const source = projDB.get(request.sourceId);
    const target = projDB.get(request.targetId);
    if (!source || !target) return null;

    // 中間点計算
    const midpoint = source.vector.map((v, i) =>
      (v + (target.vector[i] ?? 0)) / 2
    );

    return {
      id: generateLinkId(source.id, target.id),
      kind: "link",
      vector: midpoint,
      payload: null,
      linkMeta: { sourceId: source.id, targetId: target.id },
      metrics: { ttl: initialTTL, h: 0, w: 0, d: decayRate, flg: NodeFlag.Catalyst }
    };
  }
}
```

### Environmental Node 成型

```typescript
interface EnvironmentalRequest {
  anomalyType: "attractant_drop" | "repellent_spike" | "density_drop" | "flow_drop";
  severity: number;
  signal: PulseSignal;
}

class StatisticalEnvForge implements IEnvForge {
  forge(request: EnvironmentalRequest, projDB): SphereNode | null {
    const position = this.computePlacement(request, projDB);

    return {
      id: generateEnvId(request.anomalyType),
      kind: "environment",
      vector: position,
      payload: { type: request.anomalyType, severity: request.severity },
      metrics: { ttl: envTTL, h: 0, w: 0, d: envDecayRate, flg: NodeFlag.Frozen }
    };
  }

  private computePlacement(request, projDB): number[] {
    switch (request.anomalyType) {
      case "density_drop": return this.findEmptyRegion(projDB);
      case "repellent_spike": return this.findGhostBoundary(projDB);
      default: return this.randomPosition();
    }
  }
}
```

### エンドポイント

| エンドポイント | 用途 | パイプライン |
|---------------|------|-------------|
| `POST /sphere/contribute` | 外部ノード | Packer → Gatekeeper → Bookkeeper |
| `POST /sphere/forge/link` | Link 生成 | LinkForge → Bookkeeper |
| `POST /sphere/forge/environmental` | 環境調整 | EnvForge → Bookkeeper |

### ディレクトリ構造

```
periphery/src/
├── forge/
│   ├── index.ts              # NodeForge（ルーター）
│   ├── types.ts              # 共通型定義
│   ├── link/
│   │   ├── interface.ts      # ILinkForge
│   │   └── midpoint.ts       # MidpointLinkForge（デフォルト）
│   └── env/
│       ├── interface.ts      # IEnvForge
│       └── statistical.ts    # StatisticalEnvForge（デフォルト）
├── packer/
├── gatekeeper/
└── bookkeeper/
```

### 設定による工法スイッチ

```json
// sphere.config.json
{
  "forge": {
    "link": {
      "strategy": "midpoint",  // or "weighted_midpoint", etc.
      "initialTTL": 1000,
      "decayRate": 0.01
    },
    "environmental": {
      "strategy": "statistical",  // or "cluster_based", etc.
      "initialTTL": 500,
      "decayRate": 0.02
    }
  }
}
```

---

## 設計メモ

### なぜ Observatory が Link を生成するのか

1. **Sphere の純粋性**: Sphere は受容のみ、生成しない
2. **サービス依存**: Observatory 未接続時は Link 生成されない = 正常動作
3. **一貫性**: Environmental Node と同じパターン
4. **拡張性**: 将来的に Link 生成ロジックを変更可能（Sphere 変更不要）

### tick = 生体能力

```
RenalCore.tick() = 代謝（物理演算）
  - TTL/Heat 減衰
  - メトリクス更新
  - 蒸発トリガー

Periphery = 外部との接点
  - Pulse 送信（環境信号の放射）
  - API 提供
  - 外部サービス連携
```

### Link Node の自然な発生

```
┌─────────────────────────────────────────────────────────────┐
│  Link Node は「道が自然に踏み固められる」現象である         │
│  急いで生成する必要はない                                   │
│  Pulse の遅延（5秒程度）は許容される                        │
│  むしろ自然な形成プロセスとして解釈する                     │
└─────────────────────────────────────────────────────────────┘
```

**イメージ:**
- 獣道が徐々に形成されるように
- 何度も通られた場所が自然と道になる
- 即座に舗装されるのではなく、時間をかけて固まる

**技術的意味:**
- 1 Pulse 分の遅延（observationInterval = 5 tick = 5秒）は問題なし
- Link 候補は次回 Pulse で Observatory に通知される
- この「緩やかさ」が Sphere の性質に合致する

---

## エージェント操作と L3 参照設計

### エージェントの操作一覧（Rulebook より）

| 操作 | コスト | 説明 |
|------|--------|------|
| sense | Low | 周囲を感知（NearbyNode[] を取得） |
| move | Low | 概念的方向への移動 |
| warp | Medium | 既知ノードへの直接移動 |
| focus | Medium | ノードを詳細に調べる |
| emit | High | 信号をブロードキャスト |

### focus の戻り値（NodeDetail）

```typescript
interface NodeDetail extends NearbyNode {
  payload?: string;      // 要約・概要
  tags: string[];        // タグ一覧

  // === L3: Reference Layer ===
  ref_url?: string;      // 外部参照（URL）
  links?: string[];      // 内部参照（ノード ID）

  fullContent?: string;  // 詳細コンテンツ（あれば）
}
```

### L3 参照の概念

```
L1: 存在     - id, kind, distance, heat, weight
L2: 概要     - summary, tags
L3: 参照     - ref_url (外部), links (内部)
L4: 詳細     - payload, fullContent
```

`links` は `ref_url` と同じ階層（L3）に位置する。
- **ref_url**: Sphere 外への参照（URL）
- **links**: Sphere 内への参照（ノード ID）

### kind 別の focus 結果

| kind | payload | links | 備考 |
|------|---------|-------|------|
| active/amber | 要約テキスト | なし or 関連ノード | 通常のノード |
| link | "(path)" | `[source_id, target_id]` | 道標として機能 |
| environment | "Environmental: {type}" | なし | 異常対応ノード |

### Link Node の辿り方

```
エージェント
    │
    │ focus(linkId)
    ▼
NodeDetail {
  kind: "link",
  payload: "(path)",
  links: ["abc123...", "def456..."]  // source_id, target_id
}
    │
    │ move({ toNode: links[0] })
    ▼
focus(targetId)
    │
    ▼
NodeDetail (琥珀ノード、payload あり)
```

### 実装箇所

1. **types/gateway.ts** の `NodeDetail` に `links?: string[]` を追加
2. **sphere-core-adapter.ts** の `focus()` で `node.linkMeta` を `links` に変換

```typescript
// sphere-core-adapter.ts focus() 内
return {
  id: node.id,
  // ... 既存フィールド ...

  // L3 Reference Layer
  ref_url: node.payload?.ref_url,
  links: node.kind === "link" && node.linkMeta
    ? [node.linkMeta.source_id, node.linkMeta.target_id]
    : node.payload?.links,  // 通常ノードの参照があれば
};
```

### 設計原則

```
┌─────────────────────────────────────────────────────────────┐
│  ヘッダを増やさない                                          │
│  kind ごとに専用フィールドを作らない                         │
│  L3 参照層（ref_url, links）で統一的に扱う                   │
└─────────────────────────────────────────────────────────────┘
```

Environmental Node は payload に type/severity が含まれるため、
追加フィールドは不要。Link Node のみ `links` で source/target を公開する。

---

## RefDB 設計と Bookkeeper 実装

### ReferenceRecord.kind の拡張

RefDB は「実体を持つデータ」を保存する。従来の `"amber" | "relic"` から拡張:

```typescript
// renal-core/src/core/types.ts
interface ReferenceRecord {
  id: string;
  timestamp: number;
  kind: "active" | "link" | "amber" | "relic";
  payload: { ... };
  snapshot: { ... };
}
```

| kind | 説明 | 生成タイミング |
|------|------|----------------|
| active | 活性ノード | 外部 Contribution 時 |
| link | リンクノード | NodeForge 生成時 |
| amber | 琥珀化ノード | Ascension 後 |
| relic | 永続ノード | システムコア |

### Bookkeeper のフロー

```
外部 Contribution           NodeForge (Link)
       │                         │
       ▼                         ▼
  ingest()                ingestLinkNode()
       │                         │
       ▼                         ▼
  RefDB (kind="active")    RefDB (kind="link")
  ProjDB (active)          ProjDB (link)
       │                         │
       └─────────┬───────────────┘
                 │
                 ▼ (Arbiter.observe → shouldAscend)
                 │
       ┌─────────▼─────────┐
       │ applyTransitions  │
       │   kind → "amber"  │
       │   +Frozen flag    │
       │   +Spectral flag  │ (Link の場合)
       └─────────┬─────────┘
                 │
                 ▼
       recordAscensions()
                 │
                 ▼
         RefDB (kind="amber")
         → markAsAmber()
```

### 設計原則

```
┌─────────────────────────────────────────────────────────────┐
│  RefDB = 実体を持つすべてのノードの原典                       │
│  Link Node も NodeForge 生成時点で RefDB に記録              │
│  Ascension 時は markAsAmber() で kind を更新                 │
└─────────────────────────────────────────────────────────────┘
```

### 実装箇所

1. **renal-core/src/core/types.ts**: `ReferenceRecord.kind` 拡張
2. **bookkeeper.ts**: `ingest()` で `kind: "active"` を使用
3. **bookkeeper.ts**: `ingestLinkNode()` で RefDB + ProjDB 両方に書き込み
4. **bookkeeper.ts**: `recordAscensions()` シンプル化（全ノードが RefDB にある前提）

---

## Environmental Node 設計

### 概念

Environmental Node は「一時的な処方箋」

```
Observatory が統計的異常を検知
      │
      ▼
NodeForge.forgeEnvironmental()
      │
      ▼
ProjDB のみに配置（RefDB には保存しない）
      │
      ▼
一定時間、周囲に影響を放出
      │
      ▼
TTL 消費 → Fossil化 → 消滅
```

### Link Node との比較

| 項目 | Link Node | Environmental Node |
|------|-----------|-------------------|
| RefDB | ✓ 保存 | ✗ 保存しない |
| 実体 | 道（traversal から生成）| 処方箋（異常への応答）|
| 寿命 | Ascension で永続化可能 | TTL で消滅 |
| 代謝 | あり → Amber化 | あり → Fossil化 → 消滅 |
| Frozen | Amber時のみ | なし |

### 設計原則

```
┌─────────────────────────────────────────────────────────────┐
│  Environmental Node = 一時的な介入                            │
│  RefDB に保存しない（無駄なデータを保持しない）                │
│  代謝する（Frozen フラグなし）                                │
│  TTL 消費後は化石化 → 消滅                                   │
└─────────────────────────────────────────────────────────────┘
```

### 実装修正

```typescript
// env-forge.ts
metrics: {
  ttl: this.config.initialTTL,
  h: this.config.initialHeat,
  w: 0,
  d: this.config.decayRate,
  flg: 0,  // ← Frozen を外す（代謝する）
}

// server.ts - Environmental は ingest() ではなく直接 ProjDB
if (this.bookkeeper) {
  // Environmental は RefDB に保存しない
  await this.projectionRepo.set(result.node.id, result.node);
} else {
  this.projectionDB.set(result.node.id, result.node);
}
```

### イメージ

- Link Node: 獣道（踏み固められて永続化）
- Environmental Node: 一時的な標識・栄養剤（役目を終えたら消える）

### 影響の放出方式

**原則: 追加演算なし**

Environmental Node は特別な「影響放出」処理を持たない。
単なるノードの１つとして metrics を持ち、既存の物理演算に参加するだけ。

```
Environmental Node (heat = X)
      │
      ▼ (既存の SpatialField 更新)
SpatialField.avgHeat に寄与
      │
      ▼ (既存の物理演算)
周囲ノードの代謝に自然と影響
```

**異常タイプ別の heat 設定例:**

| AnomalyType | heat | 効果 |
|-------------|------|------|
| density_drop | 0.3 | 高熱で引力増加 |
| repellent_spike | 0.05 | 低熱で緩衝 |
| attractant_drop | 0.2 | 中熱で安定化 |
| flow_drop | 0.15 | 中熱で経路誘導 |

**エレガントさ:**
- 新しい処理ループなし
- 既存の物理演算を再利用
- Environmental Node は「熱源」として機能するだけ
- 複雑な距離計算・影響範囲計算は不要

---

## 実装完了記録（2026-02-02）

### Co-occurrence ベース Link 候補検出

以下の実装が完了した:

| ファイル | 変更内容 |
|----------|----------|
| `renalCore/src/types/pulse.ts` | `LinkCandidate` インターフェース追加、`PulsePacket.linkCandidates` 追加 |
| `renalCore/src/types/index.ts` | `LinkCandidate` を export |
| `periphery/src/arbiter/arbiter.ts` | `ArbiterConfig` に co-occurrence 設定追加、`CoOccurrenceEntry` / `coOccurrenceStore` 追加、`processCoOccurrence()` / `getLinkCandidates()` 追加 |
| `periphery/src/pulse/pulse-broadcaster.ts` | `broadcast()` に `arbiter` パラメータ追加、Pulse に Link 候補を含める |
| `periphery/src/gateway/return-handler.ts` | コンストラクタに `arbiter` 追加、受肉時に `processCoOccurrence()` 呼び出し |
| `periphery/src/forge/link-forge.ts` | `maxLinksPerAmber` 設定追加、Link 上限チェック追加 |
| `periphery/src/forge/types.ts` | `LinkForgeConfig.maxLinksPerAmber` 追加 |
| `sphere.config.json` | `periphery.arbiter` セクション追加（coOccurrence, dynamicFlags, deferredObserve） |
| `periphery/src/index.ts` | `arbiterConfig` に co-occurrence 設定追加、`pulseBroadcaster.broadcast()` に arbiter 連携 |

### 処理フロー（実装後）

```
[受肉時] Agent Session → AutoCapsule
    │
    ▼
ReturnHandler.processReturn()
    │
    │ arbiter.processCoOccurrence(autoCapsule.visits)
    │   └── Amber 訪問を抽出
    │   └── 全ペアの共起カウント更新（Lazy Decay 適用）
    │
    ▼
（蓄積のみ、通知はしない）

[Pulse 時] PulseBroadcaster.broadcast()
    │
    │ arbiter.getLinkCandidates()
    │   └── 閾値超過ペアを取得
    │   └── 取得後、Store から削除（一度きり）
    │
    ▼
PulsePacket.linkCandidates に含めて UDP broadcast
    │
    ▼
Observatory（外部サービス）
    │
    │ 受信 → 判断（Link 上限確認など）
    │
    └── POST /sphere/forge/link → LinkForge
            │
            │ countLinksForNode() で上限チェック
            │ maxLinksPerAmber = 2（デフォルト）
            │
            ▼
        Link Node 生成（または拒否）
```

### 設定値（sphere.config.json）

```json
"periphery": {
  "arbiter": {
    "coOccurrence": {
      "threshold": 5,      // Link 生成に必要な共起スコア
      "decayRate": 0.01,   // 毎 Tick の減衰率（1%）
      "maxLinksPerAmber": 2 // 各 Amber が持てる Link の上限
    }
  }
}
```

### 残作業

- [ ] Observatory 側の受信・判断ロジック実装（別サービス）
- [ ] ReturnHandler に arbiter を渡す呼び出し元の更新（必要に応じて）
- [ ] E2E テスト
