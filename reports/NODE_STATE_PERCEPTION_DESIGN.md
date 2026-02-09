# Node State Perception Design — 状態別知覚と種族差

**Date**: 2026-02-09
**Status**: 実装済み (Phase 1: Ghost 除外 + Amber bias 再設計)

---

## 背景

Sphere のノードには5つの状態がある。エージェントがこれらをどう「見る」かは、
Sphere 側のアクセスレベル制御とカップリング層 (FastGate) の両方で決まる。

## ノードの生死

```
Active ──(heat/weight↑)──> Amber [Frozen flag]
  │                           │
  │ (TTL=0)                   │ (heat↓, Erosion)
  │                           │
  ▼                           ▼
Ghost ─(TTL=0)─> 蒸発       Active (再活性化)
  │
  └── 痕跡なし (fertility も残さない)

Fossil [Compressed flag] ──(TTL=0)──> fertility += h×w
  │
  └── 空間に養分を返して消滅
```

## アクセスレベルと可視性

| 状態 | L1 (tags) | L2 (summary) | L3 (content) | L4 (source/ref) |
|------|-----------|-------------|-------------|-----------------|
| **Active** | scanL1, sense | sense | focus | focus |
| **Amber** | scanL1, sense | sense | focus | focus |
| **Ghost** | scanL1, sense | sense | **不可** | **不可** |
| **Fossil** | scanL1 | **不可** | **不可** | **不可** |
| **Relic** | scanL1, sense | sense | focus | focus |

### 設計意図

- **Ghost**: かつて生きていた痕跡。匂い (tags/summary) は残るが、中身は読めない。
  存在の記憶はあるが体験はできない — 幽霊。
- **Fossil**: 圧縮された化石。タグだけが残る。内容は失われたが、
  「ここに何かがあった」という事実は scanL1 で検出可能。
- **Amber**: 結晶化した知識。heat は低いが weight が高い。内容は完全に読める。
  「死んでいる」のではなく「凍結保存されている」。

## FastGate での扱い — 実装 (2026-02-09)

### Ghost: hard exclude from focus targets

```typescript
// fast-gate.ts pickFocusTarget()
if (n.kind === "ghost" || n.kind === "fossil") continue;
```

**理由**: Ghost は sense() で見えるため、FastGate がターゲットに選んでしまう。
しかし focus() は Ghost を拒否する (L3 アクセス不可)。
結果、エネルギーを消費して失敗する — これは設計意図ではない。

**ただし**: sense 結果に Ghost が含まれること自体は有益。
tags と summary は読める。エージェントは「この辺に幽霊がいる」ことを知覚しており、
それが移動判断や環境理解に影響する可能性がある。
focus ターゲットにしないだけで、知覚からは除外しない。

### Amber (Frozen flag): 種族ごとの態度

旧設計では全種族が Amber を忌避していた (`frozen: 0.3-0.8`)。
これは Amber の本質を見誤っている。

**Amber の本質**: heat は低いが weight が高い — 情報の結晶。
時間の試練を生き延びた知識。decay が遅い。content も完全に読める。

```
種族の態度 = Amber にどんな価値を見出すか
```

| 種族 | frozen bias | 旧値 | 態度の意味 |
|------|------------|------|-----------|
| **archivist** | **1.5** | 0.8 | 保存対象として最も価値がある。Amber = アーキビストの本領 |
| **scholar** | **1.3** | 0.6 | 高 weight の知識結晶。権威ある情報源 |
| **hermit** | **1.2** | 0.7 | 安定した知識を好む。流行より不変を |
| balanced | 0.5 | 0.5 | 軽い忌避。活動的なノードを優先 |
| wanderer | 0.5 | 0.5 | 偏りなし (default) |
| sniper | 0.4 | 0.4 | query 一致だけが重要。状態は二の次 |
| hunter | 0.4 | 0.4 | 熱いものだけ狩る。凍結は獲物ではない |
| scout | 0.3 | 0.3 | 新鮮なものだけ追う。結晶は古い |
| moth | 0.3 | 0.3 | heat だけ追う。凍結は暗い |

### 設計原則

1. **Frozen は「死」ではなく「保存」** — Amber は失われた情報ではない
2. **態度は Weapon (装備) で表現** — Loadout ごとに Amber への評価が異なる
3. **1.0 超の bias は積極的選好** — 1.5 なら base score を 50% 増幅
4. **focus 可否は Sphere が決める** — カップリング層はスコアリングだけ

## Fossil の将来展望

現在 Fossil は `Compressed` flag で hard exclude。
これは暫定的に正しいが、将来は検討の余地がある:

- **scanL1 的な能力を持つ種族**: archivist/hermit が Fossil の tags だけを読み取る
- **Fossil 密度が移動判断に影響**: 化石が多い領域 = かつて栄えた場所 (考古学的情報)
- **stateBias に fossil 軸を追加**: Amber の frozen と同じパターンで拡張可能

ただし現状では Fossil は sense() にも返ってこないため、
カップリング層だけでは対応できない。Sphere 側の perception 変更が必要。

## 関連メモ

- [LOADOUT_DESIGN_MEMO.md](./LOADOUT_DESIGN_MEMO.md) — Loadout = 静的人格
- [COUPLING_LAYER_DESIGN_MEMO.md](./COUPLING_LAYER_DESIGN_MEMO.md) — 責務分離の原則
- [STIGMERGY_ARCHITECTURE.md](./STIGMERGY_ARCHITECTURE.md) — Sphere の知覚設計
