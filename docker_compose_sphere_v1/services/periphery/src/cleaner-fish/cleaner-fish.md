# CleanerFish - 環境駆動型ガベージコレクション

## 役割

「死」の管理 - 自律的なガベージコレクション。
環境変数（DB容量、磁場）に基づいて行動パラメータを動的に調整する。

## アーキテクチャ (2026-02-06 設計)

### 責務分担

| 責務 | 担当 | 理由 |
|------|------|------|
| Active → Ghost → Fossil 判定 | CleanerFish | 環境駆動（Hunger/Threshold） |
| Fossil → End 判定 | CleanerFish | 同上 |
| Ghost → End 判定 | CleanerFish | 同上（evaporate） |
| Active → Amber 判定 | Arbiter | 既存（cooldown 期間監視） |
| 遷移の実行 | Bookkeeper | 既存（DB 書き込み） |

### NodeKind = Access Level

NodeKind は「タイプ」ではなく「アクセスレベル」として解釈する。
**TTL ベースの段階的制限**:

```
Active (L4: Full Access)    ← TTL > 500
  │ └─ focus() で L1-L4 全て返却
  │
  ▼ TTL ~500
Ghost (L3: Partial Access)  ← TTL 100-500
  │ └─ sense() で L1+L2 (tags + summary) 返却
  │
  ▼ TTL ~100
Fossil (L2: Minimal Access) ← TTL < 100 (凍結)
  │ └─ scanL1() で L1 (tags) のみ返却
  │
  ▼ 環境圧力 or TTL <= 0
End (L0: No Access)
    └─ DB から削除、プランクトン化（fertility 還元）
```

**重要: 遷移時のデータ維持 (2026-02-06 新設計)**

遷移 = `kind` 変更 + フラグ変更**のみ**。データは一切削除しない。

| 操作 | 変更内容 | 変更しない |
|------|---------|-----------|
| ghostify() | kind: "ghost" | payload (全データ維持) |
| fossilize() | kind: "fossil", flg: +Frozen+Compressed | payload, vector (全データ維持) |
| decompose() | DB から削除 | - (唯一のデータ消去) |

**アクセス制限の実現方法**:
- データは ProjDB/RefDB に全て保持
- `sense()`, `scanL1()`, `focus()` の **レスポンス時** に kind に応じてフィルタリング
- Ghost: L1+L2 のみ返却、Fossil: L1 のみ返却

**Note**: ghostNodes[] は Capsule から Ghost として直接生成される（CleanerFish 不経由）。
Active からの Ghost 化は CleanerFish が TTL ベースで実行。

### 環境駆動型行動

掃除魚の行動は環境変数から動的に決定される。

```
┌─────────────────────────────────────────────────────────┐
│  環境変数 (2軸)                                          │
│  ├─ DB容量: システム保護（必須検知）                     │
│  └─ 磁場 intensity: 生態系の気候（後日実装）             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  行動パラメータ                                          │
│  ├─ Threshold: 対象ノードの判定基準                      │
│  └─ Hunger: 処理意欲（蓄積 → 処理で消費）                │
└─────────────────────────────────────────────────────────┘
```

### DB容量ベースの閾値テーブル

| 状態 | DB容量 | Hunger | 挙動 |
|------|--------|--------|------|
| 通常 | < 50% | 低 | TTL <= 0 のみ捕食 |
| 警戒 | ~70% | 中 | Fossil (TTL > 0) も捕食対象 |
| 限界 | > 90% | 高 | Ghost も捕食対象になりうる |

### Hunger の効果

**Hunger が閾値を押し上げる**:
- 通常時: `prey = nodes.filter(n => n.metrics.ttl <= 0)`
- 高 Hunger: `prey = nodes.filter(n => n.metrics.ttl <= threshold)`
  - threshold は Hunger に比例して増加
  - Ghost/Fossil が TTL > 0 でも捕食対象に

```
Hunger 低 (通常)
  └─ TTL <= 0 のみ ──────────────────▶ [Fossil TTL=0]

Hunger 中 (警戒)
  └─ TTL <= 50 ────────────────────▶ [Fossil TTL=0..50]

Hunger 高 (限界)
  └─ TTL <= 200 ───────────────────▶ [Ghost/Fossil TTL=0..200]
```

## 遷移ライフサイクル

### TTL 閾値 (config で定義)

```typescript
interface TransitionThresholds {
  ghostifyTTL: number;    // Active → Ghost (例: 500)
  fossilizeTTL: number;   // Ghost → Fossil (例: 100)
  // decompose は Hunger で動的決定
}
```

### TTL の扱い

- **Ghost 化時**: TTL 継続減少
- **Fossil 化時**: TTL 継続減少（凍結しない）
- **復活時**: TTL リセット（defaultTTL）
- **Decompose 判定**: TTL <= 0 または環境圧力（Hunger）

### 復活メカニズム

Fossil は focus 不可だが、評価は可能:

1. Agent が Active ノードを focus
2. `nearbyGhosts` で近傍の Ghost/Fossil を取得（コスト0）
3. Agent が ExperienceCapsule.evaluations で Fossil を評価
4. Bookkeeper がメトリクス付与
5. メトリクス改善 → Active に復活

```
Agent ── focus(activeId) ──▶ FocusResult
                              ├─ node: NodeDetail
                              └─ nearbyGhosts: [Fossil info (tags)]

Agent ── ExperienceCapsule ──▶ Bookkeeper
         evaluations: [          ├─ nodeId 検索
           { nodeId: fossilId,   ├─ メトリクス付与
             h: +2, w: +1 }      └─ 閾値超過 → 復活判定
         ]
```

## 実装状況 (2026-02-06 完了)

### 実装済み

| Phase | 内容 | ファイル |
|-------|------|---------|
| 1 | 型定義追加 | `cleaner-fish.ts` |
| 2 | CleanerFish.ghostify() | `cleaner-fish.ts` |
| 3 | CleanerFishPool 環境駆動化 | `cleaner-fish.ts` |
| 4 | 呼び出し元変更 | `index.ts` |
| - | Bookkeeper.applyGhostification() | `bookkeeper.ts` |

### 追加した型

```typescript
// 環境状態
interface EnvironmentState {
  dbCapacityRatio: number;     // 0.0 - 1.0 (必須)
  fieldIntensity?: number;     // 0.0 - 1.0 (磁場、後で接続)
}

// 行動パラメータ
interface BehaviorParams {
  hunger: number;              // 0.0 - 1.0 (処理意欲)
  preyTTLThreshold: number;    // Hunger から算出
}

// 遷移閾値
interface TransitionThresholds {
  ghostifyTTL: number;         // Active → Ghost (default: 500)
  fossilizeTTL: number;        // Ghost → Fossil (default: 100)
}

// 処理結果
interface ProcessResult {
  ghostified: GhostificationResult[];
  fossilized: FossilizationResult[];
  decomposed: DecompositionResult[];
}
```

### 主要メソッド

```typescript
// CleanerFish - 遷移は kind + flags のみ変更、データは維持
ghostify(node): GhostificationResult    // Active → Ghost (kind変更のみ)
fossilize(node): FossilizationResult    // Ghost → Fossil (kind + Frozen flag)
decompose(node, cellId): DecompositionResult  // Fossil → End (唯一のデータ消去)
evaporate(node): DecompositionResult    // Ghost → End (fertility なし)

// CleanerFishPool
computeBehavior(env): BehaviorParams    // 環境 → Hunger 算出
findTransitionCandidates(nodes, behavior, thresholds)  // 遷移候補抽出
process(nodes, getCellId, env, thresholds): ProcessResult  // 環境駆動処理

// Bookkeeper
applyGhostification(ghostNodes)  // ProjDB kind 更新
applyFossilization(fossilNodes)  // ProjDB kind + flags 更新
applyDecomposition(decompositions)  // ProjDB 削除 + fertility 還元
```

### 仮の閾値 (要調整)

```typescript
DEFAULT_TRANSITION_THRESHOLDS = {
  ghostifyTTL: 500,   // TTL <= 500 で Ghost 化
  fossilizeTTL: 100,  // TTL <= 100 で Fossil 化
}

// Hunger → preyTTLThreshold
// hunger 0.1 → TTL <= 0
// hunger 0.5 → TTL <= 100
// hunger 1.0 → TTL <= 200

// estimatedMaxNodes = 50000 (DB容量算出用)
```

### Capsule Tier と TTL (sphere.config.json)

```typescript
tierTTLs: {
  top:    172800,  // 2日
  normal: 86400,   // 1日
  ghost:  300,     // 300秒 (> fossilizeTTL=100)
}

tierWeights: {
  top:    800,
  normal: 500,
  ghost:  200,
}
```

**設計思想**:
- エージェントは `topTier` / `normalNodes` / `ghostNodes` 配列で重要度を表現
- tier の違いは **初期 TTL と weight のみ**
- `ghostNodes[]` → Ghost (TTL=300) として直接生成（CleanerFish 不経由）
- Active からの Ghost 化は CleanerFish が TTL ベースで実行

### 残作業

- [x] 閾値の調整（実運用で検証） - 完了
- [x] GlobalAmbientField (磁場) 実装後に `fieldIntensity` 接続 - 完了
- [x] Fossil 復活ロジック（メトリクス改善 → Active 復帰） - 完了
- [x] **ghostify()/fossilize() データ維持リファクタ** - 完了 (2026-02-06)
  - `{...node, kind: "ghost/fossil"}` でデータ維持
  - createTrace(), compressVector(), FossilTrace 削除
- [ ] 磁場 intensity → hunger 係数調整（現在 0.2、夏/冬効果が弱い）
- [x] Agent Interest Protection - **無効化** (2026-02-06)
  - weight が decay しないため h+w 保護は全ノードを保護してしまう
  - 根本解決には weight decay の実装 or heat のみ保護への変更が必要

### Agent Interest Protection (設計メモ)

**問題**: TTL ベースの遷移では、エージェントが評価中のノードも捕食対象になる

**解決案**: Ghost/Fossil に一定の h+w がある場合、TTL が低くても遷移をスキップ

**現状 (2026-02-06)**: **無効化**

```typescript
// index.ts
const transitionThresholds = {
  ...DEFAULT_TRANSITION_THRESHOLDS,
  protectionThreshold: 0,  // Disabled
};
```

**無効化理由**:
- h+w で保護判定していたが、**weight が decay しない**
- 全ノードが w >= 500 を維持 → h+w >= 500 → 閾値100を常に超える
- 結果: 全 Fossil が保護され、decompose が発生しない

**根本問題: weight decay の欠如**

| メトリクス | 現状 | 期待 |
|-----------|------|------|
| h (heat) | decay する | OK |
| w (weight) | **decay しない** | decay すべき？ |
| ttl | decay する | OK |

**将来の選択肢**:
1. **weight decay を実装** (RenalCore) → h+w 保護を復活
2. **heat のみで保護** (h >= threshold) → weight 無視
3. **保護なし** (現状) → TTL のみで判定

heat は「今誰かが見ている」を表すため、保護基準として適切。
weight は蓄積価値で、それだけでは保護の理由にならない。

### Fossil/Ghost Revival (設計メモ) - 2026-02-06 更新

**採用案**: h×w 積 + d 安定性ゲート

#### 設計思想

| 遷移 | 条件 | 意味 |
|------|------|------|
| Ascension (Active→Amber) | h+w >= 1000 | 和: どちらかが高ければ可 |
| Revival (Fossil→Active) | h×w >= 閾値 && d <= 閾値 | 積 + 安定性: 両方必要 |

**なぜ積か？**
- h+w = 単発の高評価で達成可能（h=100, w=0 → h+w=100）
- h×w = 両方のメトリクスが必要（片方 0 なら積も 0）
- 「一度の評価では許可しない」を実現

**なぜ d ゲート？**
- d = 揮発性（decay rate）、評価で下がる
- d が低い = 複数回「安定している」と評価された
- 熱があっても不安定なら復活させない

#### 閾値案

```typescript
REVIVAL_THRESHOLD = 2500;   // h × w
D_THRESHOLD = 800;          // d <= (初期 1000、安定評価で下がる)
PROTECTION_THRESHOLD = 100; // 捕食防止 (h + w)
```

#### 復活シミュレーション

Fossil 初期状態: h=0, w=維持(500等), d=凍結値(1000)

| 評価回数 | 評価内容 | h | w | d | h×w | 復活? |
|---------|----------|---|---|---|-----|-------|
| 5回 | h=10,w=10,d=0 | 125 | 60 | 875 | 7,500 | 不可 (d>800) |
| 8回 | h=10,w=10,d=0 | 200 | 80 | 800 | 16,000 | **可** |
| 10回 | h=8,w=8,d=3 | 150 | 70 | 900 | 10,500 | 不可 (d>800) |
| 15回 | h=7,w=7,d=2 | 150 | 80 | 850 | 12,000 | 不可 (d>800) |

*評価係数: h×5, w×2, d×5 (neutral=5)*

#### 復活フロー

```
Fossil (TTL 継続減少, h=0, w=維持, d=維持)
    │
    │ Agent focus(nearby) → nearbyGhosts で Fossil 発見
    │ Agent return ExperienceCapsule.evaluations = [{ nodeId: fossilId, h, w, d }]
    │
    ▼
Bookkeeper.applyEvaluations()
    │ Fossil.metrics 更新 (h++, w++, d--)
    │
    ▼
Arbiter.observe()
    │ if (kind === "fossil" && h*w >= REVIVAL && d <= D_THRESHOLD)
    │     queue.shouldRevive.push(node)
    │
    ▼
Bookkeeper.applyRevival()
    │ kind = "active"
    │ TTL = defaultTTL (normal tier: 86400)
    │ h, w, d = 維持 (評価の蓄積は資産)
    │
    ▼
Active (通常代謝再開)
    └─ h+w >= 1000 なら Amber 判定へ
```

#### TTL リセット理由
- 復活 = 「再発見」 = 新しい生命の始まり
- 継続減少した TTL を引き継ぐと即座に Ghost 化してしまう
- h, w, d は維持（評価の蓄積は資産）

#### 実装箇所

| 場所 | 変更内容 |
|------|---------|
| Arbiter.observe() | Fossil の h×w, d 監視 → queue.shouldRevive |
| TransitionQueue | shouldRevive: SphereNode[] 追加 |
| Bookkeeper.applyTransitions() | revival 処理追加 |
| CleanerFish | shouldProtect() で h+w チェック（捕食防止）|
| sphere.config.json | revivalThreshold, revivalDThreshold 追加 |

### Autonomous CleanerFish (2026-02-06 実装)

**Two-tier processing** in `index.ts`:

1. **Autonomous (毎 observation)**: メイン処理
   - 毎 observation (5 ticks ごと) で `cleanerFishPool.process()` を実行
   - `fieldIntensity` → `hunger` 連携済み（係数 0.2）

2. **Patrol (30 observations ごと)**: バックアップ
   - TTL 管理を逃れたノードを捕捉
   - `dbCapacityRatio` を 0.5 以上に強制して aggressive sweep

**fieldIntensity 連携**:
```typescript
// cleaner-fish.ts:computeBehavior()
const fieldIntensity = env.fieldIntensity ?? 0;
hunger = Math.min(1.0, hunger + fieldIntensity * 0.2);  // 係数 0.2 = 効果弱い
```

**TODO**: 係数を 0.5 程度に上げるか、intensity を直接 preyTTLThreshold に反映させる

## 磁場 (GlobalAmbientField) - 後日実装

```typescript
interface GlobalAmbientField {
  updatedAt: number;        // 最終更新時刻
  vector: number[];         // 384次元の「平均的な風向き」
  intensity: number;        // 磁場の強さ（0..1）
  volatility: number;       // 空間の入れ替わり速度
  dominantFlags: number;    // 16bitフラグの論理和
}
```

- Observatory がサンプリング → Harvest → Broadcast
- 掃除魚は `intensity` を参照して Hunger を調整
- 磁場 intensity 高 → 「夏」 → 掃除魚活発

## 関連ファイル

- [sphere-core-adapter.ts](../gateway/sphere-core-adapter.ts) - focus() で fossil/ghost は null 返却
- [arbiter.ts](../arbiter/arbiter.ts) - 状態遷移の監視・判定
- [bookkeeper.ts](../bookkeeper/bookkeeper.ts) - 状態変更の実行

---

*作成日: 2026-02-06*
