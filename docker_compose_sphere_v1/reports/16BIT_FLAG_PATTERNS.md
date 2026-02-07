# 16-bit NodeFlag パターン辞書

> **定義場所**: `services/periphery/src/tagger/tagger.ts`
> **最終更新**: 2026-02-03

---

## 概要

Tagger が `tags[]` をスキャンし、キーワードマッチで 16bit フラグを付与する。

```
Agent tags: ["api", "official", "2026"]
     ↓ Tagger (16bitTechnique)
classificationFlags: 0x0003 (Authority + Freshness)
```

---

## フラグ一覧

| Hex | Flag | 物理効果 | 設定元 |
|-----|------|----------|--------|
| 0x0001 | Authority | Decay ×0.95 | Tagger |
| 0x0002 | Freshness | Heat ×1.2 | Tagger / Packer (tierFlags.top) |
| 0x0004 | Catalyst | Link形成促進 | Tagger |
| 0x0008 | Ephemeral | Decay ×1.5 | Tagger |
| 0x0010 | Sticky | TTL減衰 ×0.8 | Tagger |
| 0x0020 | Volatile | TTL減衰 ×1.3 | Tagger |
| 0x0040 | Hot | 動的表示 | **Arbiter** (heat > 80) |
| 0x0080 | Frozen | 代謝停止 | **Arbiter** (Relic) |
| 0x0100 | Hub | 構造的重要性 | Tagger / **Arbiter** (links > 5) |
| 0x0200 | Isolated | 孤立ノード | **Arbiter** (links == 0) |
| 0x0400 | Spectral | 精製済み | Tagger |
| 0x0800 | Constellation | クラスタ所属 | Tagger |
| 0x1000 | UserMarked | ユーザー重要 | Tagger |
| 0x2000 | SystemCore | システム基盤 | Tagger |
| 0x4000 | Compressed | 圧縮済み | **Arbiter** (Fossil) |
| 0x8000 | Candidate | Ascension冷却中 | **Arbiter** |

---

## パターン定義 (TAG_FLAG_PATTERNS)

### Authority (0x0001) - 権威性
```
official, authoritative, source, reference, standard, canonical,
spec, specification, documentation, doc, peer-reviewed, research,
paper, thesis, verified, proven, original
```
**用途**: 公式ドキュメント、学術論文、仕様書

---

### Freshness (0x0002) - 新鮮さ
```
new, fresh, latest, recent, breaking, update, revised, modern,
upcoming, 2024, 2025, 2026, today, now, current, realtime, live, just-in
```
**用途**: 最新情報、速報、リアルタイムデータ

---

### Catalyst (0x0004) - 触媒
```
hub, central, core, foundation, base, link, connect, bridge,
relation, integration, interface, gateway, junction, middleware,
api, glue, nexus, pipeline
```
**用途**: 接続点、API、インフラ基盤

---

### Ephemeral (0x0008) - 一時的
```
temporary, ephemeral, transient, short-term, brief, draft, wip,
experimental, prototype, test, beta, trial, random, thought,
note, memo, volatile, fleeting
```
**用途**: 下書き、実験、メモ、一時データ

---

### Sticky (0x0010) - 粘着性（長命）
```
important, critical, essential, fundamental, key, permanent,
stable, reliable, proven, fixed, legacy, anchor, root, main,
major, primary, vital
```
**用途**: 基盤知識、重要概念、安定した情報

---

### Volatile (0x0020) - 揮発性（短命）
```
unstable, changing, mutable, dynamic, flux, shifting, evolving,
fluid, variable, fluctuating, turbulent, chaotic
```
**用途**: 頻繁に変わる情報、不安定なデータ

---

### Hot (0x0040) - 高活性
```
trending, popular, viral, hot, active, discussion, debate,
controversial, shout, alert, emergency, attention, boom, hype, burst
```
**用途**: トレンド、議論中、緊急情報

> ⚠️ **Note**: Arbiter も `heat > 80` で動的に設定

---

### Hub (0x0100) - ハブ（構造的）
```
overview, summary, index, catalog, collection, guide, tutorial,
introduction, 101, map, portal, archive, list, directory, atlas, handbook
```
**用途**: まとめ、ガイド、インデックス

> ⚠️ **Note**: Arbiter も `linkCount > 5` で動的に設定

---

### Spectral (0x0400) - 精製済み
```
curated, selected, best, top, recommended, master, elite, prime,
pure, refined, gold, pearl, special, exclusive, ultimate, premium,
insight, analysis, deep-dive
```
**用途**: 厳選コンテンツ、プレミアム情報、深い洞察

---

### Constellation (0x0800) - 星座（グループ）
```
cluster, group, bundle, package, suite, family, series, set,
batch, ensemble, constellation, network, web, mesh, graph
```
**用途**: パッケージ、シリーズ、関連グループ

---

### UserMarked (0x1000) - ユーザーマーク
```
favorite, bookmark, starred, pinned, saved, marked, flagged,
remember, keep, preserved, highlighted
```
**用途**: ブックマーク、お気に入り、保存済み

---

### SystemCore (0x2000) - システム基盤
```
system, config, settings, internal, kernel, infrastructure,
architecture, framework, schema, model, engine, runtime, bootstrap
```
**用途**: システム設定、アーキテクチャ、フレームワーク

---

## 動的フラグ（Arbiter 管轄）

以下はパターンマッチではなく、Arbiter が実行時に設定/解除:

| Flag | 条件 | 設定場所 |
|------|------|----------|
| Hot (0x0040) | `heat > hotHeatThreshold (80)` | `nodeFlags.dynamicThresholds` |
| Hub (0x0100) | `linkCount > hubLinkThreshold (5)` | `nodeFlags.dynamicThresholds` |
| Isolated (0x0200) | `linkCount <= isolatedLinkThreshold (0)` | `nodeFlags.dynamicThresholds` |
| Frozen (0x0080) | Relic 昇格時 | Arbiter |
| Candidate (0x8000) | Ascension 冷却期間中 | Arbiter |
| Compressed (0x4000) | Fossil 化時 | Arbiter |

---

## フラグ合成フロー

```
[Agent/External]
     ↓
NodeSeed.flags (seedFlags: 0x0000)
     ↓
[Tagger] TAG_FLAG_PATTERNS マッチ
     ↓
classificationFlags (例: 0x0011 = Authority + Sticky)
     ↓
[Packer] tierFlags 合成
     ↓
flg = seedFlags | classificationFlags | tierFlags
    = 0x0000   | 0x0011              | 0x0002 (top)
    = 0x0013
     ↓
[Arbiter] 動的フラグ追加
     ↓
flg |= 0x0040 (Hot, if heat > 80)
    = 0x0053
```

---

## 設定ファイル参照

**統一設定場所**: `services/periphery/src/types/config.ts`

```typescript
nodeFlags: {
  tierFlags: {
    top: 0x0002,      // Freshness
    normal: 0x0000,
    ghost: 0x0000,
  },
  dynamicThresholds: {
    hotHeatThreshold: 80,
    hubLinkThreshold: 5,
    isolatedLinkThreshold: 0,
  },
},
```

---

## 更新履歴

| 日付 | 変更内容 |
|------|----------|
| 2026-02-03 | 初版作成、12パターン定義 |
| 2026-02-03 | Volatile, Constellation, UserMarked, SystemCore 追加 |
