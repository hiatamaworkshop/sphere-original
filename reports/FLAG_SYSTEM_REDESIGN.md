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
| **Dense** | 0x0010 | High information density (theory, formulas) | `weight × 1.2` |
| **Sparse** | 0x0020 | Low density (casual, anecdotal) | `weight × 0.9` |
| **Composite** | 0x0040 | Multi-concept fusion | `weight × 1.1`, attracts synthesis |
| **Authority** | 0x0080 | Compressed trust (peer-reviewed, official) | `decay_rate × 0.95` |

**Agent behavior**:
- Scholar: attracted to Dense + Authority
- Scout: neutral to Sparse (explores breadth)

**Old flags → New mapping**:
- Authority → **Authority** (moved to Density layer — trust = compressed reliability)
- Sticky → **Dense** (重複: TemporalLong が主、Dense が副)

---

### Layer 3: Cognitive (bits 8-11)

**Philosophy**: How does this node affect perception?

| Flag | Bit | Meaning | Agent Response |
|------|-----|---------|----------------|
| **Insightful** | 0x0100 | Generates "aha" moments | High `qualityVector` weight |
| **Confusing** | 0x0200 | Low resolution, ambiguous | Frustration trigger |
| **Provoking** | 0x0400 | Challenges assumptions | Curiosity trigger |
| **Soothing** | 0x0800 | Calming, reassuring | Satisfaction boost |

**Agent behavior**:
- Moth: attracted to Insightful (light = insight)
- Hermit: attracted to Soothing (stable, quiet)
- Hunter: attracted to Provoking (high-value targets)

**Implementation note**:
- These flags are **harder to assign via regex** — may require LLM-based Tagger (future)
- Start with conservative patterns, evolve over time

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

     // Cognitive (bits 8-11)
     Insightful = 0x0100,
     Confusing  = 0x0200,
     Provoking  = 0x0400,
     Soothing   = 0x0800,

     // Special (bits 12-15)
     UserMarked  = 0x1000,
     SystemCore  = 0x2000,
     Compressed  = 0x4000,  // TODO: move to state
     Candidate   = 0x8000,  // TODO: move to state
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

// Cognitive — conservative start
{ pattern: /\b(insight|revelation|breakthrough|aha)\b/i, flags: Insightful },
{ pattern: /\b(confusing|ambiguous|unclear)\b/i, flags: Confusing },

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
- `balanced`: remove catalyst → add temporalShort (light touch)
- `scholar`: authority + dense + temporalLong
- `scout`: temporalShort
- `archivist`: authority + temporalLong
- `hunter`: temporalShort (trending)

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

Cognitive flags (Insightful, Confusing, Provoking, Soothing) are **hard to detect via regex**.

Future option:
- Use lightweight LLM (llama3.2:1b) to rate cognitive impact
- Input: title + summary (L1+L2 only)
- Output: cognitive flags (4 bits)
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

**Conclusion**: Flags are not semantic labels — they are **physical constants** that modulate node behavior in Sphere's physics engine. The new 3-layer structure (Temporal / Density / Cognitive) provides **orthogonal dimensions** for agent Loadouts to interpret, while avoiding the pitfalls of tracking-based (Connectivity) or statistics-based (AgentAffinity) flags.
