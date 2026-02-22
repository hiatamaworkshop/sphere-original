# BroadcastRenderer (つぶやき機能) 実装メモ — 2026-02-16

## コミット

```
c30f87b — "つぶやき機能実装" (hiatama, 2026-02-16 21:36)
5 files changed, 210 insertions(+), 16 deletions(-)
```

## 概要

Agent の探索結果に **Broadcast（決定的射影）** を出力する機能を追加。
Narrative（LLM 生成）と並行して、純粋関数による観測データフォーマットを出力。
LLM も人間編集も介在しない決定的出力であり、X/Twitter 投稿用テンプレートとして機能する。
後から Narrative と照合可能（因果鎖の検証可能性）。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `phi-agent/src/broadcast-renderer.ts` | **新規** — 純粋関数 `renderBroadcast()`, `flagsToLabels()` |
| `phi-agent/src/agent.ts` | encounters に `flags` 追加 + Broadcast 出力ステップ挿入 |
| `phi-agent/src/eval-log.ts` | NarrativeEntry に `flags?`, `broadcast?` 追加（後方互換） |
| `explorers/parser.py` | `extract_broadcast()` 追加 |
| `explorers/app.py` | Broadcast パネル追加（Markdown 表示） |

---

## 設計

### broadcast-renderer.ts（純粋関数）

- `renderBroadcast(encounters, meta) → BroadcastPost[]`
- `flagsToLabels(flags: number) → string` — 15 種フラグの hex + 短縮名マッピング
- 入力: encounters (nodeId, tags, summary, h, w, d, flags) + meta (loadout, query, cycles, energy, duration, timestamp)
- 出力: 280 字以内の post 配列（thread 形式）
- LLM 不要。response フラグに依存せず、encounters > 0 で常に出力

### 出力マーカー

```
== BROADCAST START ==
--- 1/3 ---
{header post}
--- 2/3 ---
{node posts}
== BROADCAST END ==
```

### agent.ts 配線

- Step 5b（disconnect 後、narrative 前）に Broadcast 挿入
- encounters に `flags: target.flags` を追加（standardCycle, liaisonExplore 両方）
- `broadcastPosts` を `persistNarrative()` に渡す

### 型拡張（eval-log.ts）

- `NarrativeEntry.encounters[].flags?: number`（後方互換）
- `NarrativeEntry.broadcast?: string[]`（後方互換）

### Explorers UI（parser.py + app.py）

- `extract_broadcast()`: `== BROADCAST START/END ==` マーカー間をパース
- Broadcast パネル: Markdown 表示、`[1/N]` 形式でナンバリング

---

## フラグマッピング（15 種）

| hex | 短縮名 | 意味 |
|-----|--------|------|
| 0x0001 | recent | 最近のノード |
| 0x0002 | timeless | 時代を超えた |
| 0x0004 | cyclic | 周期的 |
| 0x0010 | dense | 密結合 |
| 0x0020 | sparse | 疎結合 |
| 0x0040 | composite | 複合 |
| 0x0080 | authority | 権威 |
| 0x0100 | sharp | 鋭い |
| 0x0200 | fuzzy | 曖昧 |
| 0x0400 | tensile | 張力 |
| 0x0800 | settled | 安定 |
| 0x1000 | marked | マーク済 |
| 0x2000 | core | コア |
| 0x4000 | compressed | 圧縮 |
| 0x8000 | candidate | 候補 |

---

## 検証状態

| 項目 | 状態 |
|------|------|
| tsc コンパイル | 通過（コミット時点） |
| Explorers UI 表示 | 実装済（未テスト記録） |
| Narrative との照合 | 構造のみ（自動比較は未実装） |
