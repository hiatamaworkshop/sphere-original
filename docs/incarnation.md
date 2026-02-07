# Incarnation Process - 受肉プロセス全体フロー

**最終更新**: 2026-01-30
**目的**: エージェント → Gatekeeper → Packer → Bookkeeper の連携を明確化

---

## 🎯 受肉プロセスとは

外部エージェントの探索体験を、スフィアの物理世界（Projection DB / Reference DB）に刻み込む一連のプロセス。

**重要な原則**:
> 受肉は**帰還後のみ**行われる。探索中には世界を変更しない。

---

## 📊 全体フロー図

```
┌────────────────────────────────────────────────────────────┐
│                   1. エージェント探索                       │
│                                                             │
│  SphereContext を使ってスフィア内を探索                      │
│  - radar.scan() で周辺観測                                  │
│  - act.focus() でノード詳細取得                             │
│  - act.mark() で Ghost 候補を記録                           │
│                                                             │
│  すべての摩擦・詰まり・迷いを Trace Capsule に記録          │
│  （エージェント個人の持ち物、スフィアには影響なし）         │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│                   2. Selection（帰還後）                    │
│                                                             │
│  エージェントが外部で Trace を解析・精製                     │
│                                                             │
│  ┌──────────────┬──────────────┬──────────────┐           │
│  │              │              │              │           │
│  │ Top Tier     │ Normal Nodes │ Ghost Nodes  │           │
│  │ (上位3件)    │ (通常)       │ (失敗・迷い) │           │
│  │ 高品質       │ 標準TTL      │ 短TTL        │           │
│  │ 長寿命       │              │ payload無し  │           │
│  └──────────────┴──────────────┴──────────────┘           │
│                                                             │
│  Experience Capsule にパッキング                            │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│              3. Membrane（膜）- API Gateway                │
│                                                             │
│  POST /sphere/submit                                        │
│  - ルール提示                                               │
│  - prohibited_patterns チェック                             │
│  - リクエスト正規化                                         │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│            4. Gatekeeper（門番）- 物理検疫                  │
│                                                             │
│  Experience Capsule の物理的妥当性をチェック                │
│                                                             │
│  ✓ 総ノード数 ≤ maxNodesPerCapsule (50)                   │
│  ✓ Top Tier 数 ≤ maxTopTierPerCapsule (5)                 │
│  ✓ Ghost 比率 ≤ maxGhostRatio (0.4 = 40%)                 │
│  ✓ Summary 長 ≤ maxSummaryLength (512)                    │
│                                                             │
│  ❌ 個別エージェントは追わない（ステートレス）              │
│  ❌ エネルギー管理はしない（SphereContext の役割）         │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│          5. ParserBuffer（バッチベクトル化）                │
│                                                             │
│  最大8件 or 5秒タイムアウトでバッチ処理                      │
│                                                             │
│  ┌─ Parser ────────────────────────────────┐               │
│  │  summary → 1536-dim Vector              │               │
│  │  Embedding Model 実行                    │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
│  待ち時間中：                                               │
│  - Amber Showcase 閲覧                                      │
│  - Tutorial Sphere 体験                                     │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│               6. Tagger（価値判断）                         │
│                                                             │
│  Top Tier に対してのみ Tag Vector を付与                    │
│  - タグ文字列を統合（半角スペース結合）                      │
│  - 140バイト制限                                            │
│  - 1つの複合座標を生成                                      │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│         7. Packer（パッカー）- NodeSeed → SphereNode        │
│                                                             │
│  ★ ここで Ghost が確定する                                 │
│                                                             │
│  const isGhost = raw.metrics.h < 2.0 || raw.flg === 0xDEAD;│
│                                                             │
│  ┌─ Top Tier ────────────────────────────────┐            │
│  │  kind: "active"                            │            │
│  │  weight: 0.8                               │            │
│  │  ttl: 172800 (2日)                         │            │
│  │  heat: 50-100                              │            │
│  │  flg: 0x0002 (Freshness)                   │            │
│  │  tagVector: あり                           │            │
│  └───────────────────────────────────────────┘            │
│                                                             │
│  ┌─ Normal Nodes ─────────────────────────────┐           │
│  │  kind: "active"                            │            │
│  │  weight: 0.5                               │            │
│  │  ttl: 86400 (1日)                          │            │
│  │  heat: 20-50                               │            │
│  │  flg: 0x0000                               │            │
│  └───────────────────────────────────────────┘            │
│                                                             │
│  ┌─ Ghost Nodes ──────────────────────────────┐           │
│  │  kind: "ghost"                             │            │
│  │  weight: 0.2                               │            │
│  │  ttl: 3600 (1時間)                         │            │
│  │  heat: 0-5                                 │            │
│  │  flg: 0x0000                               │            │
│  │  payload: null  ← ★ 意味を持たない        │            │
│  └───────────────────────────────────────────┘            │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│       8. IncarnationBuffer（バッチ受肉バッファ）            │
│                                                             │
│  最大8件 or 100ms タイムアウトでバッチ処理                  │
│  - 即座に「受付完了」を返す（非同期）                        │
│  - バッチが溜まったら一括で Bookkeeper へ                   │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│          9. Bookkeeper（帳簿係）- DB Controller            │
│                                                             │
│  二重DB構造への書き込み                                      │
│                                                             │
│  ┌─ Reference DB (原典・魂) ─────────────────┐            │
│  │  すべてのノード                             │            │
│  │  - UUID                                    │            │
│  │  - payload (Active/Amber のみ)             │            │
│  │  - 親子関係・系譜                           │            │
│  │                                             │            │
│  │  Ghost の場合：                             │            │
│  │  - UUID のみ                                │            │
│  │  - 親 Active との関係                       │            │
│  │  - payload: null                           │            │
│  └───────────────────────────────────────────┘            │
│                                                             │
│  ┌─ Projection DB (現象・肉体) ──────────────┐            │
│  │  すべてのノード                             │            │
│  │  - Vector (座標)                           │            │
│  │  - Metrics (w, d, h, ttl, flg)             │            │
│  │  - tagVector (Top Tier のみ)               │            │
│  │                                             │            │
│  │  Ghost も含む：                             │            │
│  │  - 座標は重要（地形情報）                   │            │
│  │  - 熱量・TTL で管理                         │            │
│  └───────────────────────────────────────────┘            │
│                                                             │
│  ┌─ Spatial Fields (空間セル) ───────────────┐            │
│  │  - Fertility（養分）                       │            │
│  │  - Density（密度）                         │            │
│  │  - Flow（流量）                            │            │
│  └───────────────────────────────────────────┘            │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│              10. RenalCore（代謝エンジン）                  │
│                                                             │
│  Tick ごとに物理法則を適用                                  │
│                                                             │
│  1. Decay（減衰）                                          │
│     - すべてのノードの TTL, Heat を減衰                     │
│                                                             │
│  2. Ghostification（ゴースト化）                           │
│     - Active/Fossil が熱を失って Ghost へ遷移             │
│     ※ これは受肉時の Ghost とは別プロセス                  │
│                                                             │
│  3. Erosion（侵食）                                        │
│     - Amber が熱を失って Active へ退行                     │
│                                                             │
│  4. Ascension（昇華）                                      │
│     - Active が熱量・重みを得て Amber へ結晶化             │
│     - 周辺の Ghost を浄化（purifySurroundingGhosts）       │
│                                                             │
│  5. Evaporation（蒸発）                                    │
│     - TTL ≤ 0 のノードを削除                               │
│     - Fertility へ還元（プランクトン化）                    │
└────────────────────────────────────────────────────────────┘
```

---

## 🔑 重要な役割分担

### エージェント（Agent）
```typescript
// 探索中
ctx.radar.scan()     // 周辺観測
ctx.act.focus()      // ノード詳細取得
ctx.act.mark()       // Ghost 候補を記録

// 帰還時
const capsule: ExperienceCapsule = {
  topTier: sortedExperiences.slice(0, 3),
  normalNodes: sortedExperiences.slice(3, 10),
  ghostNodes: sortedExperiences.slice(10),  // ★ ここで Ghost を選別
  timestamp: Date.now(),
};

ctx.lifecycle.return(capsule);
```

**責務**:
- 探索体験の記録
- 価値判断（Top/Normal/Ghost の選別）
- Experience Capsule の組み立て

**❌ やらないこと**:
- DB への直接書き込み
- 物理量の計算
- 座標の決定

---

### Membrane（膜）
```typescript
POST /sphere/submit
- ルール提示
- prohibited_patterns チェック
- リクエスト正規化
```

**責務**:
- API Gateway
- 禁止パターンの検閲
- 正規化

---

### Gatekeeper（門番）
```typescript
interface GatekeeperConfig {
  maxNodesPerCapsule: number;      // 50
  maxTopTierPerCapsule: number;    // 5
  maxGhostRatio: number;           // 0.4 (40%)
  maxSummaryLength: number;        // 512
}
```

**責務**:
- Experience Capsule の物理検疫のみ
- 総量・比率・サイズのバリデーション

**❌ やらないこと** （重要）:
- 個別エージェントの追跡
- セッション状態の管理
- エネルギー消費の監視
- リアルタイムの行動制限

→ これらは **SphereContext** の役割

---

### Parser & Tagger
```typescript
ParserBuffer {
  batchSize: 8
  flushTimeout: 5000ms

  // 一括ベクトル化
  vectors = await embeddingModel.embedBatch(summaries)
}

Tagger {
  topTierCount: 3

  // Top Tier のみタグベクトル付与
  if (idx < topTierCount) {
    node.tagVector = await getTagVector(tags)
  }
}
```

**責務**:
- 座標の決定（Embedding）
- Tag Vector の生成
- バッチ処理による負荷軽減

---

### Packer（パッカー）
```typescript
async function packTraceToSphereNodes(rawNodes: RawExperience[]): Promise<SphereNode[]> {
  const sorted = rawNodes.sort((a, b) =>
    (b.metrics.h * b.metrics.w) - (a.metrics.h * a.metrics.w)
  );

  return await Promise.all(sorted.map(async (raw, idx) => {
    const isPrimary = idx < MAX_ACTIVE_VECTORS_PER_BATCH;

    // ★ ゴースト判定（ここで確定）
    const isGhost = raw.metrics.h < 2.0 || raw.flg === 0xDEAD;

    return {
      id: generateId(),
      kind: isGhost ? "ghost" : "active",
      vector: await Parser.getVector(raw.content),
      payload: isGhost ? null : { body: raw.content },
      metrics: {
        w: getTierWeight(tier),
        h: raw.metrics.h,
        d: STANDARD_DECAY,
        ttl: getTierTTL(tier, isGhost),
        flg: getTierFlags(tier)
      }
    };
  }));
}
```

**責務**:
- NodeSeed → SphereNode への変換
- Ghost 判定の最終確定
- Tier ごとの物理パラメータ設定
- Reference / Projection への分離準備

---

### Bookkeeper（帳簿係）
```typescript
interface IBookkeeper {
  // Reference DB への書き込み
  writeReference(node: SphereNode): Promise<void>;

  // Projection DB への書き込み
  writeProjection(node: SphereNode): Promise<void>;

  // Spatial Fields の更新
  updateSpatialField(cellId: string, delta: Partial<SpatialField>): Promise<void>;
}
```

**責務**:
- 二重DB構造への書き込み制御
- トランザクション管理
- DB 抽象化レイヤーの提供

---

### RenalCore（代謝エンジン）
```typescript
tick(loadFactor: number) {
  for (const node of this.projectionDB.values()) {
    this.dynamicTTLDecay(node, loadFactor);
    this.heatMetabolism(node);
    this.evaluateNodeState(node);
  }

  if (this.tickCount % 5 === 0) {
    this.manageSpectralLinks();
  }

  this.cleanupAndPlanktonize();
}
```

**責務**:
- 物理法則の適用
- 代謝プロセスの実行
- Ghost の浄化（Amber 確定時）
- Spectral Link の鍛造

**❌ やらないこと**:
- payload の読み取り
- 意味論的判断
- 新規ノードの生成（受肉）

---

## 📝 Ghost 生成の詳細フロー

### エージェント側での選別
```typescript
// 探索中に Trace Capsule に記録
ctx.act.mark('deadend')  // 行き止まり
ctx.act.mark('stuck')    // 詰まり
ctx.act.mark('unclear')  // 意味不明

// 帰還後に解析
const experiences = analyzeTraces(traceCapsule)

// 価値判断
const ghostCandidates = experiences.filter(exp =>
  exp.heat < 2.0 ||           // 熱量が低い
  exp.meaningScore < 0.3 ||   // 意味生成に失敗
  exp.wasDeadEnd ||           // 行き止まり
  exp.wasStuck                // 詰まり
)

// Experience Capsule に格納
const capsule = {
  topTier: topExperiences,
  normalNodes: midExperiences,
  ghostNodes: ghostCandidates  // ★ ここで Ghost 候補として選別済み
}
```

### Gatekeeper での検疫
```typescript
function validateCapsule(capsule: ExperienceCapsule): boolean {
  const totalNodes =
    capsule.topTier.length +
    capsule.normalNodes.length +
    capsule.ghostNodes.length;

  // 総ノード数チェック
  if (totalNodes > config.maxNodesPerCapsule) {
    return false;
  }

  // Ghost 比率チェック
  const ghostRatio = capsule.ghostNodes.length / totalNodes;
  if (ghostRatio > config.maxGhostRatio) {
    return false;  // Ghost が 40% を超えている
  }

  return true;
}
```

### Packer での確定
```typescript
// エージェントが選別した ghostNodes[] を処理
for (const ghostSeed of capsule.ghostNodes) {
  const node: SphereNode = {
    kind: "ghost",           // ★ 確定
    payload: null,           // ★ 意味を剥奪
    metrics: {
      ttl: GHOST_TTL,        // 短寿命
      h: ghostSeed.heat,     // 低熱量
      w: GHOST_WEIGHT        // 低重量
    }
  };

  nodes.push(node);
}
```

---

## 🔧 設定値の例

### sphere.config.json
```json
{
  "periphery": {
    "gatekeeper": {
      "maxNodesPerCapsule": 50,
      "maxTopTierPerCapsule": 5,
      "maxGhostRatio": 0.4,
      "maxSummaryLength": 512
    },
    "packer": {
      "tierWeights": {
        "top": 0.8,
        "normal": 0.5,
        "ghost": 0.2
      },
      "tierTTLs": {
        "top": 172800,
        "normal": 86400,
        "ghost": 3600
      },
      "ghostHeatThreshold": 2.0
    }
  },
  "renal_core": {
    "spatial": {
      "purificationRadius": 0.05
    }
  }
}
```

---

## 📚 関連ドキュメント

- [docs/components/ghost.md](../components/ghost.md) - Ghost Node 詳細
- [docs/components/packer.md](../components/packer.md) - Packer 実装
- [docs/dataSamples/capsules.txt](../dataSamples/capsules.txt) - Capsule 仕様
- [PHASE3_PERIPHERY_DESIGN.md](../../docker_compose_sphere_v1/PHASE3_PERIPHERY_DESIGN.md) - Periphery 設計

---

**End of Document**
