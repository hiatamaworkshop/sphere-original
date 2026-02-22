# Node Reference Convention (L3参照作法)

## ステータス: 実装完了 ✅

---

## 1. 現状分析

### 1.1 データ構造

```typescript
// NodeSeed (エージェント入力) - capsule.ts
interface NodeSeed {
  tags: string[];
  summary: string;
  payload?: string;
  sourceNodeId?: string;  // 派生元（1つのみ）
  links?: string[];       // ✅ 追加: 関連ノード参照（最大5）
  ref_url?: string;       // ✅ 追加: 外部URL（最大256文字）
  initialHeat: number;
  flags: number;
}

// SphereNode (内部表現) - sphere_node.ts
interface SphereNode {
  payload?: {
    summary?: string;
    tags?: string[];
    sourceNodeId?: string;  // ✅ L3: 派生元
    links?: string[];       // ✅ L3: 関連ノード参照
    ref_url?: string;       // ✅ L3: 外部URL
  };
}

// ReferenceRecord (RefDB永続化) - types.ts
interface ReferenceRecord {
  payload: {
    summary?: string;
    tags?: string[];
    sourceNodeId?: string;  // ✅ L3: 派生元
    links?: string[];       // ✅ L3: 関連ノード参照
    ref_url?: string;       // ✅ L3: 外部URL
    crystallization?: CrystallizationData;  // amber のみ
  };
}

// NodeDetail (エージェント公開) - gateway.ts
interface NodeDetail {
  // L1: 存在
  id: string;
  kind: NodeKind;
  distance: number;
  heat: number;
  weight: number;
  // L2: 概要
  summary: string;
  tags: string[];
  // L3: 参照
  sourceNodeId?: string;  // ✅ Phase 4 追加
  ref_url?: string;
  links?: string[];
  // L4: 詳細
  payload?: string;
}
```

### 1.2 実装状況 ✅

| 項目 | 設計 | 実装 | ファイル |
|------|------|------|----------|
| sourceNodeId 転送 | NodeSeed → SphereNode | ✅ Packer で転送 | `packer.ts` |
| 深度制限 | MAX_DERIVATION_DEPTH=2 | ✅ Pipeline で検証 | `pipeline.ts` |
| links[] 入力 | NodeSeed に定義 | ✅ 追加済み | `capsule.ts` |
| ref_url 入力 | NodeSeed に定義 | ✅ 追加済み | `capsule.ts` |
| 有限ノード制約 | amber/relic/active のみ | ✅ Pipeline で検証 | `pipeline.ts` |
| sourceNodeId 公開 | NodeDetail に公開 | ✅ Phase 4 | `gateway.ts`, `sphere-core-adapter.ts` |
| FocusAction 履歴 | sourceNodeId を記録 | ✅ Phase 4 | `auto-capsule.ts`, `sphere-context.ts` |
| WarpAction 分離 | warp ログを move から分離 | ✅ Phase 4 | `auto-capsule.ts`, `sphere-context.ts` |

---

## 2. 設計原則（確定済み）

### 2.1 派生深度制限

```
MAX_DERIVATION_DEPTH = 2

depth 0: [情報]          ✅ 許可（ルートノード）
depth 1: [考察]          ✅ 許可（情報への意見）
depth 2: [考察への応答]   ✅ 許可（意見への反論）
depth 3+:                 ❌ 禁止（無限チェーン防止）
```

**原則**: 3階層までで議論は収束すべき。

### 2.2 参照可能ノード制約

**原則**: 推論対象として有効なノードのみ参照可

| ノード種別 | 参照可能 | 理由 |
|-----------|---------|------|
| amber | ✅ | 結晶化済み、安定 |
| relic | ✅ | 永続、システムコア |
| active | ✅ | 代謝中だが十分安定、推論対象として有効 |
| ghost | ❌ | 動線的な迷い、推論対象にならない |
| fossil | ❌ | 風化済み、参照価値低 |
| link | ❌ | 連結専用、コンテンツなし |

**理由**: ghost は一時的な痕跡であり、知見として参照する価値がない

---

## 3. 議題

### 3.1 無限禁止の徹底化 ✅ 実装完了

**実装箇所**: Pipeline.validateReferences() （案B を採用）

```typescript
// pipeline.ts
private async validateReferences(capsule: ExperienceCapsule): Promise<ValidationError[]> {
  // 1. 参照先が存在するか
  const record = await this.refDB.get(nodeId);
  if (!record) return { code: "ORPHAN_REFERENCE", ... };

  // 2. 参照先が推論対象として有効か（amber/relic/active のみ）
  if (!REFERENCEABLE_KINDS.includes(record.kind)) {
    return { code: "INVALID_REFERENCE_KIND", ... };
  }

  // 3. 深度制限
  const depth = await this.getNodeDepth(nodeId);
  if (depth >= MAX_DERIVATION_DEPTH) {
    return { code: "MAX_DEPTH_EXCEEDED", ... };
  }
}
```

**決定**: Gatekeeper はステートレス維持、Pipeline 内で検証
- Gatekeeper: 形式検証（ステートレス）
- Pipeline.validateReferences(): 意味検証（ステートフル、RefDB 参照）

### 3.2 結晶化と派生ノードの関係（確定）

**結論**: 現状のロジックで意図通り動作。追加実装不要。

**距離ベース判定の自然な振る舞い**:

```
[琥珀化するノード A]
       │
       ├── [派生ノード B] ── 距離 0.2 ── 近傍 → 吸収 ✅
       │   (A を参照 + 近い = 同一思考クラスタ)
       │
       └── [派生ノード C] ── 距離 0.8 ── 遠方 → 存続 ❌
           (A を参照 + 遠い = 独立した知見として参照のみ)
```

**ロジック**:
- 距離判定が先に適用される
- 派生かどうかに関係なく、近傍であれば吸収
- 遠方の派生ノードは自動的に存続（距離フィルターでスキップ）

**解釈**:
- 近傍の派生 = 同一思考クラスタの一部 → 琥珀に合流
- 遠方の派生 = 独立した知見として参照していただけ → 存続

派生ノードを特別扱いする必要はない。「近傍を集合化する」原則で自然に含まれる。

### 3.3 カプセルサイズ設計

#### 単一ノードのサイズ構成

```
NodeSeed {
  summary:       最大 500 chars (~500 bytes)
  tags[]:        最大 10 × 50 chars = 500 bytes
  sourceNodeId:  16 chars (content hash)
  links[]:       最大 5 × 16 chars = 80 bytes
  ref_url:       最大 256 chars
  payload:       詳細コンテンツ
  flags:         2 bytes (16bit)
  initialHeat:   4 bytes
}
```

#### 推論ノードの典型例

```
優れた推論ノード:
  summary:      "K-means収束証明とO(n*k*i*d)計算量" (~50 chars)
  tags:         ["clustering", "k-means", "convergence", ...] (~60 chars)
  sourceNodeId: "a1b2c3d4e5f6a7b8" (16 chars)
  links:        5 nodes × 16 chars = 80 chars
  ref_url:      "https://arxiv.org/abs/2301.12345" (~40 chars)
  payload:      詳細な考察 (~500-1000 chars)

合計: ~800-1200 bytes/node
```

#### カプセル全体の容量

```
現状制約:
  maxPayloadBytes: 4096 (不足)
  maxTopTier: 2
  maxNormal: 5
  maxGhost: 3

実質必要容量:
  topTier:  2 × 1200 = 2400 bytes
  normal:   5 × 800  = 4000 bytes
  ghost:    3 × 400  = 1200 bytes
  合計: ~7600 bytes
```

#### 制約値（確定）

| 項目 | 現状 | 確定値 |
|------|------|--------|
| maxPayloadBytes | 4096 | **8192** (8KB) |
| maxRefUrlLength | なし | **256** |
| maxSummaryLength | 500 | 500 (据え置き) |
| maxLinks | なし | **5** |

**ref_url 256 の根拠**:
- arxiv: `https://arxiv.org/abs/2301.12345` (~35 chars)
- DOI: `https://doi.org/10.1000/xyz123` (~35 chars)
- 長いクエリ付きでも ~200 chars

---

### 3.4 L3 作法の厳格化

**NodeSeed 拡張案**:

```typescript
interface NodeSeed {
  // 既存
  tags: string[];
  summary: string;
  payload?: string;
  sourceNodeId?: string;
  initialHeat: number;
  flags: number;

  // 追加
  links?: string[];    // 複数ノード参照（amber/relic のみ）
  ref_url?: string;    // 外部URL（内部ID禁止）
}
```

**制約**:

| 項目 | 制約 | Gatekeeper 検証 |
|------|------|-----------------|
| sourceNodeId | 1つのみ、amber/relic/active のみ（ghost 不可）| ✅ |
| links[] | **最大5つ**、amber/relic/active のみ | ✅ |
| ref_url | **最大256文字**、http/https のみ | ✅ |
| 深度 | MAX_DERIVATION_DEPTH=2 | ✅ |
| payload合計 | **最大8192バイト** | ✅ |

---

## 4. 実装計画

### Phase 1: 基盤整備 ✅ 完了
- [x] NodeSeed に links[], ref_url 追加 → `capsule.ts`
- [x] Packer で sourceNodeId, links[], ref_url を転送 → `packer.ts`
- [x] CAPSULE_SCHEMA_VERSION を 3 に更新
- [x] Rulebook 制約更新 → `rulebook/index.ts`
  - maxPayloadBytes: 4096 → **8192**
  - maxRefUrlLength: **256** (新規)
  - maxLinks: **5** (新規)
- [x] Gatekeeper に links/ref_url 検証追加 → `gatekeeper.ts`

### Phase 2: 検証強化 ✅ 完了
- [x] Pipeline 内で RefValidator 実装（Gatekeeper はステートレス維持）→ `pipeline.ts`
- [x] sourceNodeId の存在・種別検証（amber/relic/active のみ）
- [x] links[] の存在・種別検証
- [x] 深度制限検証（MAX_DERIVATION_DEPTH=2）

### Phase 3: ~~結晶化最適化~~ 不要
- ~~absorbAndCrystallize() に自己参照フィルター追加~~ → 距離判定で自然に処理
- ~~派生ノード除外ロジック実装~~ → 現状ロジックで意図通り動作

### Phase 4: エージェント公開 ✅ 完了

**背景**: エージェントが focus() でノードの派生情報を知る手段がなかった

**実装内容**:
- [x] `NodeDetail` に `sourceNodeId` 追加 → `gateway.ts`
- [x] `SphereCoreAdapter.focus()` で `sourceNodeId` を返す → `sphere-core-adapter.ts`
- [x] `FocusAction` に `sourceNodeId` 追加（セッション履歴用）→ `auto-capsule.ts`
- [x] `sphere-context.ts` で focus 時に `sourceNodeId` をログ

**追加修正（warp/move ログ分離）**:
- [x] `WarpAction` 型を新設 → `auto-capsule.ts`
- [x] `warp()` のログを `type: "warp"` に変更 → `sphere-context.ts`

**移動API設計（参照: MOVE_DESIGN_MEMO.md）**:

| API | 用途 | 384D更新 | 状態 |
|-----|------|---------|------|
| `warp(nodeId)` | 既知ノードへ直接ジャンプ | ✅ | 実装済み |
| `randomWalk(step, mode)` | 方向性探索 | ✅ | 実装済み |
| `move(dx,dy,dz)` | 3D座標移動 | ❌ | deprecated |

**エージェントが参照可能なデータ**:

```typescript
// focus() で取得できる NodeDetail
interface NodeDetail {
  // L1: 存在
  id: string;
  kind: NodeKind;
  distance: number;
  heat: number;
  weight: number;

  // L2: 概要
  summary: string;
  tags: string[];

  // L3: 参照（今回追加）
  sourceNodeId?: string;  // ← NEW: 派生元ノード
  ref_url?: string;
  links?: string[];

  // L4: 詳細
  payload?: string;
}
```

---

## 5. 関連ドキュメント

- [EVALUATION_MECHANISM_MEMO.md](./EVALUATION_MECHANISM_MEMO.md) - 派生深度設計
- [AMBER_ABSORPTION_DESIGN_MEMO.md](./AMBER_ABSORPTION_DESIGN_MEMO.md) - 結晶化設計
- [capsule.ts](../services/periphery/src/types/capsule.ts) - NodeSeed 定義

---

## 6. 決定事項

1. ~~**Gatekeeper のステートレス原則を破るか？**~~ → **確定: 破らない**
   - Gatekeeper はステートレス維持（形式検証のみ）
   - Pipeline.validateReferences() で意味検証（RefDB 参照）

2. ~~**派生ノードの結晶化時処理**~~ → **確定: 現状維持**
   - 距離ベース判定で自然に処理される
   - 近傍派生 = 吸収、遠方派生 = 存続

3. ~~**links[] の最大数**~~ → **確定: 5**
   - 5ノードを参照 → 推論を生成 → 受肉
   - 過度な参照は意味の希薄化を招く

4. ~~**ref_linked（逆参照）の保存**~~ → **確定: 保存しない**
   - 必要時に計算で導出

---

*Created: 2026-02-03*
*Updated: 2026-02-03*
*Status: 実装完了（Phase 4 含む）*
