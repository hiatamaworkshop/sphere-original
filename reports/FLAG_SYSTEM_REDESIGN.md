# Flag System Redesign — 16bit as Physical Constants

**Date**: 2026-02-10
**Status**: Implementation Complete (config/physics/pool-service migrated)
**Context**: Tagger regex patterns and flag allocation redesign

---

## Core Principle

**Flags are NOT tags. Flags are physical constants of information.**

Flags describe **how an agent should handle a node**, not **what domain it belongs to**.

```
Tags:        "physics", "quantum", "biology"      → domain classification
Flags:       TemporalShort, Dense, Insightful    → agent handling instructions
```

Agent behavior emerges from:
```
Personality = Loadout (measurement tools) × Sphere (physics) × LLM (sensory organ)
```

Flags are part of Sphere's physics — they modulate decay rates, visibility, and scoring multipliers.

---

## Why Connectivity Was Abandoned

**Layer 4 proposal**: Bridge / Cluster / Isolated
**Requires**: Node visitation tracking (link counts, traversal history)

### Conflict with Sphere Philosophy

**Sphere's role** = physics only (flags, metrics, state transitions)
**No tracking of agent behavior** — agents leave evaluations (pheromones), not logs

From `STIGMERGY_ARCHITECTURE.md`:
> "Learning happens on the Sphere side. Agents are sensory organs that read and write the environment."

Visitation tracking = recording agent history = **outside Sphere's responsibility**.

If this data is needed, **external services** (like Explorers or future analytics) should collect it, not RenalCore.

**Decision**: Connectivity flags removed entirely.

---

## Why AgentAffinity Was Externalized

**Layer 5 proposal**: ExplorerFood / DigestorFood / SynthFood / ArchiveOnly
**Requires**: Statistical analysis of evaluations (which agents rated a node highly)

### Conflict with Sphere Philosophy

**AgentAffinity = "this node is good for agent X"** — but who decides?

If derived from regex patterns → **human-defined affinity** → contradicts emergent personality principle
If derived from evaluation statistics → **requires aggregation & scoring** → outside Sphere's scope

From `EMERGENT_PERSONALITY_MEMO.md`:
> "Personality resides in the Loadout (measurement tools), not in the model or the nodes."

A node is not "explorer food" — a node simply **is**. The explorer's Loadout determines if it appears appetizing.

**Decision**: AgentAffinity flags rejected. Node suitability emerges from `(Loadout × Node Physics)`, not from static labels.

If affinity metrics are needed, **Digestor or external analytics** can compute them post-hoc.

---

## New Flag System — 3 Layers + Special

### Bit Allocation

```
bits 0-3   Temporal:    physical time properties
bits 4-7   Density:     structural complexity
bits 8-11  Cognitive:   perceptual impact
bits 12-15 Special:     system/user metadata
```

### Layer 1: Temporal (bits 0-3)

**Philosophy**: How does this node age?

| Flag | Bit | Meaning | Physics Effect |
|------|-----|---------|----------------|
| **TemporalShort** | 0x0001 | Time-sensitive, decays quickly | `decay_rate × 1.3`, `ttl_decay × 1.2` |
| **TemporalLong** | 0x0002 | Timeless, resists decay | `decay_rate × 0.8`, `ttl_decay × 0.7` |
| **TemporalCyclic** | 0x0004 | Resurfaces periodically | TBD (future: seasonal boost mechanism) |
| _(reserved)_ | 0x0008 | — | — |

**Agent behavior**:
- Scout: attracted to TemporalShort (novelty)
- Archivist: attracted to TemporalLong (preservation)

**Old flags → New mapping**:
- Freshness → **TemporalShort**
- Ephemeral → **TemporalShort**
- Sticky → **TemporalLong**
- Hot → **TemporalShort** (trending = short-lived)

---

### Layer 2: Density (bits 4-7)

**Philosophy**: How compressed is the information?

| Flag | Bit | Meaning | Physics Effect |
|------|-----|---------|----------------|
| **Dense** | 0x0010 | High information density (theory, formulas) | `weight × 1.2` (設計値) |
| **Sparse** | 0x0020 | Low density (casual, anecdotal) | `weight × 0.9` (設計値) |
| **Composite** | 0x0040 | Multi-concept fusion | `weight × 1.1` (設計値) |
| **Authority** | 0x0080 | Compressed trust (peer-reviewed, official) | `decay_rate × 0.95` |

> **Physics Wiring Status (2026-02-12 確認)**
> - **Authority**: decay_rate 配線済み (bit_math.ts) ✅
> - **Dense/Sparse/Composite**: weight 物理効果は **未配線**。ビットポジション確定が本質的成果。
>   物理効果の意味 (「重い情報は遅く減る」が正しいか) の追求が配線に先行する。
> - physics.ts の `computePhysicsModifiers()` に Dense×1.2 のハードコードあり (dead code — 呼び出し元なし)

**Agent behavior**:
- Scholar: attracted to Dense + Authority
- Scout: neutral to Sparse (explores breadth)

**Old flags → New mapping**:
- Authority → **Authority** (moved to Density layer — trust = compressed reliability)
- Sticky → **Dense** (重複: TemporalLong が主、Dense が副)

---

### Layer 3: Cognitive (bits 8-11)

**Philosophy**: What is the epistemic state of this information?

> **Design Note (2026-02-14)**: 旧定義 (Insightful/Confusing/Provoking/Soothing) は受け手の感情反応を記述しており、
> 他の3層 (Temporal/Density/Special) が情報そのものの性質を記述する原則と矛盾していた。
> 新定義は情報の客観的な認知状態を記述する。感情は結果であり原因ではない — 原因 (情報の状態) をフラグにし、
> 結果 (受け手の反応) はエージェントの Loadout に委ねる。

| Flag | Bit | Meaning | 対応する情報の性質 |
|------|-----|---------|-------------------|
| **Sharp** | 0x0100 | 明確、一意的解釈、境界明瞭 | 定義、定理、結論、数式 |
| **Fuzzy** | 0x0200 | 曖昧、複数解釈可能、未確定 | 仮説、問い、推測、概念初期段階 |
| **Tensile** | 0x0400 | 内部対立・矛盾を内包、未解決 | 論争、パラドックス、対比構造 |
| **Settled** | 0x0800 | 決着済み、合意形成済み、収束 | 定説、法律、標準規格、公理 |

**2軸の直交構造**:
```
解像度軸:  Sharp (明確) ←→ Fuzzy (曖昧)
確定度軸:  Tensile (未解決) ←→ Settled (決着済み)
```

**Agent behavior**:
- Scholar: attracted to Sharp (明確な知識を好む)
- Moth: attracted to Sharp (光 = 明瞭さ)
- Hunter: attracted to Tensile (未解決の対立 = 高価値ターゲット)
- Hermit: attracted to Settled (決着済み = 安定した思索環境)
- Archivist: attracted to Settled (合意形成済み = 保存価値が高い)

**旧→新の対応**:
| 旧 (感情) | 新 (状態) | 理由 |
|-----------|----------|------|
| Insightful | **Sharp** | 洞察 → 解像度が高いから見える |
| Confusing | **Fuzzy** | 混乱 → 情報が曖昧だから起きる |
| Provoking | **Tensile** | 挑発 → 内部に矛盾があるから張る |
| Soothing | **Settled** | 安心 → 決着しているから安定する |

---

### Layer 4: Special (bits 12-15)

**Philosophy**: System metadata & user overrides

| Flag | Bit | Meaning | Physics Effect |
|------|-----|---------|----------------|
| **UserMarked** | 0x1000 | User bookmark | Immune to decay |
| **SystemCore** | 0x2000 | Infrastructure (Relic) | Frozen metabolism |
| _(reserved)_ | 0x4000 | — | — |
| _(reserved)_ | 0x8000 | — | — |

**Note**: Compressed (0x4000) and Candidate (0x8000) are **state flags**, not physical properties. These should move to `ReferenceRecord.kind` or a separate state field (future refactor).

---

## Old Flags → Disposal

| Old Flag | Bit | Reason for Removal | Migration Path |
|----------|-----|---------------------|----------------|
| **Catalyst** | 0x0004 | Connectivity tracking required | Remove from all code |
| **Hub** | 0x0100 | Connectivity tracking required (deprecated) | Remove from all code |
| Volatile | 0x0020 | Redundant with TemporalShort | **Delete** or map to TemporalCyclic |
| Hot | 0x0040 | Redundant with TemporalShort | Map to TemporalShort |
| Frozen | 0x0080 | State flag, not physics | Move to `kind` field (future) |
| Isolated | 0x0200 | Connectivity tracking required | Remove |

**Critical bug found**: pool-service defines `Catalyst = 0x0002`, which **collides with Freshness**. This must be fixed during cleanup.

---

## Implementation Phases

### Phase 1: Type System (Immediate)

1. **Update NodeFlag enum** ([types.ts](../docker_compose_sphere_v1/services/renalCore/src/core/types.ts)):
   ```typescript
   export enum NodeFlag {
     // Temporal (bits 0-3)
     TemporalShort = 0x0001,
     TemporalLong  = 0x0002,
     TemporalCyclic = 0x0004,

     // Density (bits 4-7)
     Dense      = 0x0010,
     Sparse     = 0x0020,
     Composite  = 0x0040,
     Authority  = 0x0080,

     // Cognitive (bits 8-11) — epistemic state of information
     Sharp      = 0x0100,   // 明確、一意的解釈
     Fuzzy      = 0x0200,   // 曖昧、複数解釈可能
     Tensile    = 0x0400,   // 内部対立・未解決
     Settled    = 0x0800,   // 決着済み・収束

     // Special (bits 12-15)
     UserMarked  = 0x1000,
     SystemCore  = 0x2000,
     Structured  = 0x4000,  // 構造化データ (コード, 表, JSON)
     Multimodal  = 0x8000,  // 非テキスト要素含む
   }
   ```

2. **Remove Catalyst/Hub from all mirrors**:
   - [phi-agent/src/fast-gate.ts](../phi-agent/src/fast-gate.ts)
   - [pool-service/src/weapon-scorers.ts](../pool-service/src/weapon-scorers.ts)

### Phase 2: Tagger Rewrite

Regex patterns split by layer:

```typescript
// Temporal
{ pattern: /\b(new|latest|breaking|2024-2026|trending|viral)\b/i, flags: TemporalShort },
{ pattern: /\b(timeless|classic|fundamental|proven|stable)\b/i, flags: TemporalLong },

// Density
{ pattern: /\b(dense|theory|formula|rigorous|technical)\b/i, flags: Dense },
{ pattern: /\b(casual|light|brief|anecdotal)\b/i, flags: Sparse },
{ pattern: /\b(official|peer-reviewed|authoritative|verified)\b/i, flags: Authority },

// Cognitive — epistemic state (conservative start)
{ pattern: /\b(definition|theorem|proof|conclusion|precisely|exact|definitive)\b/i, flags: Sharp },
{ pattern: /\b(hypothesis|maybe|perhaps|unclear|ambiguous|uncertain|speculative)\b/i, flags: Fuzzy },
{ pattern: /\b(debate|controversy|paradox|contradiction|versus|conflict|unresolved)\b/i, flags: Tensile },
{ pattern: /\b(established|consensus|standard|proven|accepted|settled|canonical)\b/i, flags: Settled },

// Special
{ pattern: /\b(bookmark|starred|important)\b/i, flags: UserMarked },
{ pattern: /\b(system|config|core)\b/i, flags: SystemCore },
```

**Design principle**: Patterns are **sparse and precise**. Agent Loadouts will compensate for missing flags.

### Phase 3: Scoring Logic Update

**FastGate** and **PoolWeapon**:
- Remove `flagBias.catalyst`
- Add `flagBias.temporal`, `flagBias.density`, `flagBias.cognitive` (optional, per-flag is fine too)

Example:
```typescript
// Old
flagBias: { authority: 1.2, catalyst: 1.1, freshness: 1.0, sticky: 1.2 }

// New
flagBias: { authority: 1.2, temporalShort: 1.0, temporalLong: 1.1, dense: 1.3 }
```

**Loadout migration** (phi-agent):
- `balanced`: authority + temporalShort + temporalLong (light touch)
- `scholar`: authority + dense + temporalLong + **sharp**
- `scout`: temporalShort
- `archivist`: authority + temporalLong + dense + **settled** + sharp
- `hunter`: temporalShort + **tensile**
- `moth`: temporalShort + **sharp**
- `hermit`: authority + temporalLong + dense + **settled**
- `sniper`: authority + temporalShort

### Phase 4: Cleanup

Remove all references to:
- `Catalyst` (bit checks, weapon fields)
- `Hub` (bit checks, comments)
- `Isolated` (if used anywhere)

Files to check:
- arbiter.ts
- bookkeeper.ts
- rulebook/index.ts
- bit_math.ts
- physics.ts

---

## Design Rationale — Critical Points

### Why 3 layers?

Each layer answers a different question:
- **Temporal**: When does this matter?
- **Density**: How much is packed in?
- **Cognitive**: How does it feel?

These are **orthogonal dimensions** — a node can be TemporalShort + Dense + Provoking simultaneously.

### Why avoid statistics?

**Sphere = substrate, not supervisor.**

Statistics require:
- Aggregation (who counts?)
- Normalization (what's the baseline?)
- Judgment (what's "good"?)

These are **interpretation layers** — belong in Digestor, Explorers, or external analytics, not RenalCore.

Flags are **input physics**, not **output analytics**.

### Why sparse regex patterns?

From experience with evalFocus:
> "Pattern は少なくていい。後で agent が補正する。" (User directive)

Tagger provides **structural hints**, not **complete classification**.

Agents with different Loadouts will interpret the same node differently — that's the point.

---

## Future Considerations

### LLM-based Tagger (Phase 5+)

Cognitive flags (Sharp, Fuzzy, Tensile, Settled) は regex でもある程度検出可能だが、
文脈依存の判断 (例: 表面上は断定文だが本質的に未解決) は LLM が優れている。

Future option:
- Use lightweight LLM (llama3.2:1b) to assess epistemic state
- Input: title + summary (L1+L2 only)
- Output: cognitive flags (4 bits) — 解像度軸 (Sharp/Fuzzy) + 確定度軸 (Tensile/Settled)
- Cost: ~10ms per node (acceptable for Contribution pipeline)

This would make Tagger **measurement-based** rather than pattern-based — aligns with Sphere philosophy.

### Dynamic Flags (Phase 6+)

Some flags should be **Arbiter-assigned** (runtime), not Tagger-assigned (ingest):
- **Hot**: currently assigned via "trending" keyword → should be derived from `heat > threshold`
- **Frozen**: state flag → should be in `kind` field

Proposal:
- Split flags into **static** (Tagger) and **dynamic** (Arbiter)
- Static: Temporal, Density, Authority, Cognitive
- Dynamic: Hot, Frozen (move to separate bitmask or state enum)

---

## Migration Checklist

- [x] Write this design doc
- [x] Update NodeFlag enum in types.ts — 16bit 3層構造 + Hot(dynamic)
- [x] Rewrite Tagger regex patterns — periphery Tagger 完全移行済み (NodeFlag enum 使用)
- [x] Remove Catalyst/Hub from FastGate — phi-agent flagBias は新体系で定義済み
- [x] Remove Catalyst/Hub from pool-service — **2026-02-10 実装**
- [x] Update Loadout flagBias definitions — 9種族分定義済み (MEMORY.md 参照)
- [x] Clean up arbiter/bookkeeper — Hub/Isolated 動的フラグ削除済み (コメント残存は許容)
- [x] Update MEMORY.md with new flag layer structure
- [x] **sphere.config.json フラグ名修正** — 2026-02-10 実装 (下記ログ参照)
- [x] **physics.ts レガシーフラグ衝突修正** — 2026-02-10 実装 (下記ログ参照)
- [ ] Generate test data with new flags (add "timeless", "dense", etc. to tags)
- [ ] mock_data.json のフラグ値を新体系に更新
- [ ] Density 層の物理効果を追求し、必要なら bit_math.ts に配線 (Dense/Sparse/Composite)

---

## Implementation Log — 2026-02-10

### 背景

設計 (FLAG_SYSTEM_REDESIGN.md) は完了していたが、実装コードの移行が不完全だった。
旧フラグ名が残存し、sphere.config.json のキー名不一致により **config が完全に死んでいた**。

### 発見された問題

| 場所 | 問題 | 深刻度 |
|------|------|--------|
| pool-service/scorer-a.ts | `catalyst` 参照 (廃案フラグ)、フラグ値が全て旧体系 (0x0001=Authority, 0x0002=Catalyst, 0x0004=Freshness) | 致命的 |
| pool-service/types.ts | `ThermometerScores` に `catalyst` フィールド、`intakeWeights` が [4] | 致命的 |
| renalCore/physics.ts | 旧 Volatile (0x0020) チェックが新体系 Sparse と **ビット衝突** — Sparse ノードが意図せず ttl_decay 加速 | 致命的 |
| sphere.config.json | `physicsModifiers` のキーが旧名 (Freshness, Ephemeral, Sticky, Volatile, Hub, Frozen) → 新型 `RenalCoreFlagsConfig` と不一致 → **config 値が全て無視** (ハードコードフォールバック) | 致命的 |
| periphery/config.ts | フラグ一覧コメントが旧体系 (16項目) | 中 |
| pool-service/doc/SETUP.md | catalyst 参照残り | 低 |

### 修正内容

#### pool-service (catalyst 廃止 + フラグ値修正)

```
scorer-a.ts:
  - LLM prompt: 4 scores → 3 scores (catalyst 削除)
  - deriveMetrics:
    heat = 50 + (authority + novelty) × 25   (旧: authority + catalyst)
    weight = 50 + authority × 50              (旧: (authority + novelty) × 25)
  - フラグ: 0x0080 = Authority, 0x0001 = TemporalShort (旧: 0x0001, 0x0002, 0x0004)

types.ts:
  - ThermometerScores: catalyst フィールド削除
  - intakeWeights: [number, number, number, number] → [number, number, number]
  - DEFAULT_CONFIG: [0.3, 0.3, 0.2, 0.2] → [0.4, 0.3, 0.3]
```

#### renalCore (レガシーフラグ衝突修正)

```
physics.ts:
  - 削除: if (flags & 0x0020) { ttl_decay *= 1.3 }  ← 旧 Volatile、新 Sparse と衝突
  - 追加: if (flags & NodeFlag.Dense) { weight_multiplier *= 1.2 }
```

#### sphere.config.json (config 復活)

```
旧キー → 新キー:
  Freshness   → TemporalShort  (decayRateMultiplier: 1.3)
  Sticky      → TemporalLong   (ttlDecayMultiplier: 0.7)
  Hub         → Dense           (weightMultiplier: 1.2)
  Authority   → Authority       (変更なし)
  Frozen      → SystemCore      (decayRate: 0, ttlDecay: 0)
  Ephemeral   → (削除、TemporalShort に統合)
  Volatile    → (削除、TemporalShort に統合)
```

#### periphery/config.ts (コメント刷新)

```
フラグ一覧コメント: 旧 16 項目 → 新 16bit 3層体系 (Temporal/Density/Cognitive/Special)
tierFlags.top: "Freshness" → "TemporalLong — top-tier persists longer"
  値 0x0002 は維持 (旧 Freshness = heat boost、新 TemporalLong = decay resistance)
  top-tier ノードが長生きするのは合理的
```

### 残存する旧フラグ参照 (許容)

以下はコメント・ドキュメント内の参照であり、実行コードに影響しない:

- `periphery/src/bus/index.ts:6` — "Volatile broadcast" (概念名、フラグ値ではない)
- `periphery/src/index.ts:538` — "Ephemeral Mode" (デモリセット機能名)
- `periphery/src/arbiter/arbiter.ts:505` — "Hub/Isolated removed" (削除記録)
- `reports/*.md` — 設計履歴ドキュメント

### TypeScript ビルド検証

```
pool-service:  ✅ npx tsc --noEmit (0 errors)
phi-agent:     ✅ npx tsc --noEmit (0 errors)
renalCore:     ✅ npx tsc --noEmit (0 errors)
periphery:     ✅ npx tsc --noEmit (0 errors)
```

### 教訓

1. **型定義と config ファイルのキー名不一致は沈黙の故障** — TypeScript の型はランタイムの JSON を検証しない。config が死んでいても気づかない
2. **レガシーフラグのビット値は再利用に注意** — 旧 Volatile (0x0020) が新 Sparse と衝突していた
3. **フラグの旧→新マッピングは 1:1 ではない** — Freshness (heat boost) ≠ TemporalShort (decay acceleration)。効果の意味を確認してから移行すべき

---

## References

- `STIGMERGY_ARCHITECTURE.md` — Sphere = substrate, agents = sensory organs
- `EMERGENT_PERSONALITY_MEMO.md` — Personality in Loadout, not in nodes
- `COUPLING_LAYER_DESIGN_MEMO.md` — Sphere = physics, Coupling = interpretation
- `EVALFOCUS_V3_EXPERIMENT.md` — Sparse prompts + agent compensation

---

## Data Type Flags — Special 層の再定義 (2026-02-11)

### 背景

Sphere は現在テキストのみを扱っているが、将来的にあらゆるデータ形式 (画像, 音声, 構造化データ, コード) を包含する可能性がある。h, w, d は情報の物理的振る舞いを記述し、形式に依存しない。しかしエージェントが **どのセンサー (LLM) でノードを知覚すべきか** を判断するためには、形式のヒントが必要。

Compressed (0x4000) と Candidate (0x8000) は設計書で「state フィールドに移動予定」と明記済み。この 2 ビットをデータタイプフラグに再割当てする。

### Special 層 (bits 12-15) — 更新後

| Flag | Bit | 意味 | 物理効果 | 用途 |
|------|-----|------|---------|------|
| **UserMarked** | 0x1000 | ユーザーブックマーク | decay 免除 | 変更なし |
| **SystemCore** | 0x2000 | インフラ (Relic) | 代謝凍結 | 変更なし |
| **Structured** | 0x4000 | 構造化データ | weight x 1.1 | コード, 表, JSON, 数式, API response |
| **Multimodal** | 0x8000 | 非テキスト要素含む | 知覚コスト +1 (専用センサー必要) | 画像, 音声, 動画, 図表付き文書 |

旧 Compressed / Candidate → `ReferenceRecord.kind` or 別の state フィールドに移行。

### 組み合わせパターン (2 bit = 4 states)

```
0x0000 (フラグなし)       = テキスト (デフォルト、現行データ全て)
0x4000 (Structured)       = 構造化テキスト (コード, 表, JSON, 数式)
0x8000 (Multimodal)       = 非テキスト (画像, 音声, 動画)
0xC000 (Structured+Multi) = 構造化 + 非テキスト (図表付き論文, annotated image)
```

### 設計判断

**なぜ形式の詳細 (image/audio/video) をフラグで区別しないか**

フラグは物理定数であり、「画像」「音声」の区別は Sphere の物理に影響しない。影響するのは:
1. **エージェントが知覚できるか** (text LLM vs multimodal LLM) → Multimodal フラグ
2. **解析モードが異なるか** (読む vs 解析する) → Structured フラグ

形式の詳細はノードの metadata (tags, content-type 等) に格納すれば十分。

**なぜ Structured に weight x 1.1 の物理効果を与えるか**

構造化データは情報密度が高い傾向がある (Dense フラグとは別の軸)。コードや数式は同じ文字数でもテキストより多くの情報を圧縮している。Dense = 内容が濃い、Structured = 形式が構造的。直交する概念。

**0x0008 (Temporal 層の空き) を温存する理由**

Temporal 層は情報の時間的振る舞いを記述する最も基本的な層。将来 TemporalEvent (一回性のイベント — 地震速報, 決算発表) のような時間特性が必要になった場合に備え、同層内に予備を残す。

### Agent への影響

| フラグ | Agent の行動変化 |
|--------|-----------------|
| Structured | コード特化 LLM (code model) での知覚が有利。Loadout に `structuredBias` を追加可能 (将来) |
| Multimodal | text-only agent はこのノードの content を知覚できない (tags + summary のみ)。multimodal agent は完全知覚可能 |

現行の text-only agent (phi3:mini, llama3.2:1b, gemma2:2b) は Multimodal ノードに対して L1+L2 (tags + summary) までしかアクセスできない。L3 (content) は multimodal sensor 搭載時のみ。これは既存の Access Level 階層と自然に整合する。

### 実装優先度

- **今すぐ**: 設計のみ確定。enum に追加してもコードパスは変更不要 (フラグ 0 = text、既存動作に影響なし)
- **Pool-service 対応時**: 投入パイプラインで content-type を検出し、Structured/Multimodal フラグを自動付与
- **Agent 対応時**: FastGate に `structuredBias`, `multimodalBias` を追加 (Loadout 拡張)

---

## Gate Type Architecture — 汎用化のための構造分離 (2026-02-11)

### 発見

FastGate は現在テキストデータを前提に設計されているが、その scoring pipeline は **データ形式を知らない**。
`if (flags & bit) score *= bias` — ビット演算と乗算の連鎖にすぎない。

この発見から、FastGate System を **複数のデータドメインに対応可能な汎用エンジン** として位置づける設計が導かれた。

---

### 3 層のドメイン依存性

| 層 | bits | ドメイン依存性 | 理由 |
|----|------|---------------|------|
| **Temporal** | 0-3 | **ユニバーサル** | あらゆるデータに時間性がある |
| **Density** | 4-7 | **ユニバーサル** | あらゆるデータに密度・権威性がある |
| **Cognitive** | 8-11 | **ドメイン固有** | 知覚反応はデータ形式により異なる |
| **Special** | 12-15 | **ユニバーサル** | システムメタデータ・形式フラグ |

**12 bits がユニバーサル、4 bits のみがドメイン固有。** これが汎用化の鍵。

---

### ユニバーサル層 — 全ドメイン共通の物理定数

#### Temporal (bits 0-3): 「この情報はいつ意味を持つか？」

| Flag | Bit | テキスト | 数値/時系列 | 信号 | グラフ | 画像 |
|------|-----|---------|------------|------|--------|------|
| **TemporalShort** | 0x0001 | 速報, トレンド | 高頻度変動, リアルタイム値 | 短パルス, バースト | 一時的リンク | 瞬間的場面 |
| **TemporalLong** | 0x0002 | 古典, 定理 | 物理定数, 長期平均 | 定常波, 搬送波 | 恒久的構造 | 不変の特徴 |
| **TemporalCyclic** | 0x0004 | 季節記事, 年次報告 | 周期変動, 季節性 | 振動, 変調 | 周期的パターン | 繰り返し構図 |
| _(reserved)_ | 0x0008 | — | — | — | — | — |

**ユニバーサルな理由**: 時間に対する振る舞い (短命・永続・周期) はデータ形式と無関係に存在する。株価もテキストも画像も、すべてに temporal lifespan がある。

#### Density (bits 4-7): 「この情報はどれだけ圧縮されているか？」

| Flag | Bit | テキスト | 数値/時系列 | 信号 | グラフ | 画像 |
|------|-----|---------|------------|------|--------|------|
| **Dense** | 0x0010 | 理論, 数式 | 高次元特徴量, 圧縮表現 | 広帯域, 高情報量 | 高接続密度 | テクスチャ密 |
| **Sparse** | 0x0020 | 雑談, 逸話 | 欠損多, 低頻度サンプル | 狭帯域, 単調 | 疎結合 | 余白多 |
| **Composite** | 0x0040 | 融合概念 | 多変量合成指標 | 多重変調 | 異種ネットワーク | コラージュ |
| **Authority** | 0x0080 | 査読済, 公式 | 校正済, 標準値 | 基準信号, 較正 | 公的レジストリ | 参照画像 |

**ユニバーサルな理由**: 情報密度と信頼性はデータ形式を問わない普遍的属性。査読論文もキャリブレーション信号も「信頼度の高い参照」という同じ物理的意味を持つ。

#### Special (bits 12-15): 「システムはこの情報をどう扱うか？」

| Flag | Bit | 意味 | ドメイン依存性 |
|------|-----|------|--------------|
| **UserMarked** | 0x1000 | ユーザー保護 | 全ドメイン共通 |
| **SystemCore** | 0x2000 | インフラ凍結 | 全ドメイン共通 |
| **Structured** | 0x4000 | 構造化データ | 全ドメイン共通 (形式記述) |
| **Multimodal** | 0x8000 | 非テキスト要素 | 全ドメイン共通 (形式記述) |

---

### ドメイン固有層 — Cognitive (bits 8-11)

**現在 (text gate)**:

| Flag | Bit | 意味 | 検出方法 |
|------|-----|------|---------|
| **Sharp** | 0x0100 | 明確、一意的解釈 | regex (definition, theorem, proof) / NLP |
| **Fuzzy** | 0x0200 | 曖昧、複数解釈可能 | regex (hypothesis, maybe, uncertain) / NLP |
| **Tensile** | 0x0400 | 内部対立、未解決 | regex (debate, paradox, contradiction) / NLP |
| **Settled** | 0x0800 | 決着済み、収束 | regex (established, consensus, standard) / NLP |

**将来の gate type ごとの Cognitive 層再定義案**:

| Gate Type | 0x0100 | 0x0200 | 0x0400 | 0x0800 |
|-----------|--------|--------|--------|--------|
| **text** | **Sharp** | **Fuzzy** | **Tensile** | **Settled** |
| **numeric** | Precise | Noisy | Volatile | Stable |
| **signal** | Coherent | Distorted | Transient | Steady |
| **graph** | Bridge | Isolated | Hub | Cluster |
| **vision** | Salient | Occluded | Dynamic | Textured |

**ビット位置は同一、意味テーブルが変わる。** FastGate の `flagBias.sharp` は numeric gate では `flagBias.precise` と読み替えられるが、コード上は同じ `if (flags & 0x0100) score *= bias` のまま。

**2軸構造の汎用性**: text gate の Sharp↔Fuzzy / Tensile↔Settled は、他ドメインでも自然に写像される:
- numeric: Precise↔Noisy (解像度) / Volatile↔Stable (確定度)
- signal: Coherent↔Distorted (解像度) / Transient↔Steady (確定度)
- 解像度軸と確定度軸の直交性はドメインを超えて保存される。

---

### のせかえの構造 — 何を交換し、何を残すか

```
┌─────────────────────────────────────────────────────────┐
│                  Gate Type Architecture                   │
│                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────┐ │
│  │   Tagger      │     │  16bit Flags  │     │ FastGate │ │
│  │  (入口)       │────►│  (物理定数)   │────►│ (演算)   │ │
│  │              │     │              │     │          │ │
│  │  ★交換対象   │     │ bits 0-7  固定│     │  固定    │ │
│  │              │     │ bits 8-11 交換│     │          │ │
│  │              │     │ bits 12-15 固定│     │          │ │
│  └──────────────┘     └──────────────┘     └──────────┘ │
│                                                          │
│  交換 = Tagger 実装 + Cognitive 意味テーブル              │
│  固定 = Temporal + Density + Special + FastGate pipeline  │
└─────────────────────────────────────────────────────────┘
```

| 要素 | 交換するか | 理由 |
|------|-----------|------|
| **Tagger 実装** | **YES** | 生データ → flags への変換器。NLP, 統計分析, FFT, 画像特徴量 — ドメインごとに異なる |
| **Cognitive 意味テーブル (bits 8-11)** | **YES** | 4bit の「知覚反応ラベル」をドメインに合わせて再定義 |
| **Weapon preset** | **追加** | ドメイン特化の種族バイアスセット (既存 preset に加えて新規追加) |
| **Temporal/Density/Special (12 bits)** | **NO** | 情報物理学の普遍的定数。データ形式を問わない |
| **FastGate scoring pipeline** | **NO** | `base × flagGate × stateGate × ratioMod` — 汎用演算。ビットと係数しか知らない |
| **h, w, d 物理** | **NO** | 解釈は変わるが処理は同一 (temporal energy, mass, entropy) |

---

### Tagger の責務 — ドメインアダプターとしての再定義

Tagger は単なる「regex パターンマッチャー」ではなく、**生データを情報物理空間に投射する変換器** である。

```
Tagger = Domain Adapter
  入力: 生データ (テキスト, 数値, 信号, グラフ, 画像)
  出力: 16bit flags + h, w, d 初期値
  責務: ドメイン固有の特徴を、ドメイン非依存の物理定数に変換する
```

| Gate Type | Tagger が何をするか | h の意味 | w の意味 | d の意味 |
|-----------|-------------------|---------|---------|---------|
| **text** | NLP 分析, regex | 注目度 (話題性) | 情報密度 (重さ) | 永続性 (寿命) |
| **numeric** | 統計分析 (分散, トレンド, 異常値検出) | 変動強度 | データ量 | 安定性 |
| **signal** | 周波数解析 (FFT, 帯域幅, SNR) | 振幅 (エネルギー) | 帯域密度 | 信号寿命 |
| **graph** | トポロジー分析 (次数, クラスタ係数) | 活動度 (通過量) | 接続密度 | 構造安定性 |
| **vision** | 画像特徴量 (顕著性, テクスチャ, 動き) | 視覚的注目度 | 情報密度 | 時間的持続性 |

**Tagger が変わっても、Sphere の物理法則は変わらない。** decay は decay、weight は weight。
解釈の意味が変わるだけで、RenalCore の `tick()` 処理は同一コードで動く。

---

### 実装指針

#### Phase 1 (現在): Text Gate のみ — 設計確定

- Cognitive 層は text 用定義 (Insightful / Confusing / Provoking / Soothing)
- Tagger は regex + (将来) LLM-based
- FastGate scoring pipeline は汎用性を意識して設計済み

#### Phase 2 (将来): Gate Type Config 化

```typescript
// gate-config.ts (将来)
interface GateTypeConfig {
  name: string;                              // "text" | "numeric" | "signal" | ...
  cognitiveLabels: [string, string, string, string];  // bits 8-11 の意味ラベル
  tagger: Tagger;                            // ドメイン固有の変換器
  weaponPresets?: Record<string, Weapon>;     // ドメイン特化の種族バイアス
}

const TEXT_GATE: GateTypeConfig = {
  name: "text",
  cognitiveLabels: ["Insightful", "Confusing", "Provoking", "Soothing"],
  tagger: new TextTagger(),        // NLP / regex
};

const NUMERIC_GATE: GateTypeConfig = {
  name: "numeric",
  cognitiveLabels: ["Anomalous", "Noisy", "Trending", "Stable"],
  tagger: new NumericTagger(),     // 統計分析
};
```

FastGate は `GateTypeConfig` を受け取るが、scoring pipeline は変わらない。
`flagBias.sharp` の **名前** が `precise` に変わるだけで、演算は `if (flags & 0x0100) score *= bias`。

#### Phase 3 (将来): 異種 Gate 混在 Sphere

Sphere 内にテキストノードと数値ノードが共存する場合:
- 各ノードの `Multimodal` / `Structured` フラグ (Special 層) で形式を識別
- 同一 FastGate pipeline で scoring — Cognitive 層のバイアスは gate type に応じて解釈
- Agent は自身の搭載センサーで知覚可能なノードのみ L3 アクセス

---

### 結論: 16bit Flag System の汎用性

```
16bit = 12 bits (ユニバーサル物理定数) + 4 bits (ドメイン固有知覚)

のせかえの正体:
  ① Tagger (入口の変換器) を差し替える
  ② Cognitive 4bit (知覚反応ラベル) の意味テーブルを差し替える
  ③ Weapon preset (種族バイアス) をドメイン用に追加する

触らないもの:
  ① FastGate scoring pipeline (汎用演算エンジン)
  ② Temporal + Density + Special (情報物理学の普遍的定数)
  ③ h, w, d の物理処理 (RenalCore tick)
  ④ Digestor / Species Memory (評価の代謝は形式非依存)
```

Tagger は「regex マッチャー」ではなく **ドメインアダプター** — 生データを情報物理空間に投射する変換器である。この認識が、16bit Flag System を text-only から **あらゆるデータ形式に対応する汎用物理エンジン** へと拡張する鍵となる。

---

**Conclusion**: Flags are not semantic labels — they are **physical constants** that modulate node behavior in Sphere's physics engine. The 3-layer structure (Temporal / Density / Cognitive) + Special layer now covers **4 orthogonal dimensions**: time, density, epistemic state, and format — providing agent Loadouts with complete routing information for any data type. Cognitive 層は情報の認識論的状態 (解像度 × 確定度) を記述し、受け手の感情反応はエージェントの Loadout に委ねる。
