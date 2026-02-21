# Species Memory — 種族記憶の設計と実装

**Date**: 2026-02-08
**Status**: 実装完了 (JSONL 永続化)

---

## 原則

エージェントの記憶は **個体** に帰属しない — **種族** (loadout) に帰属する。

```
scholar-A が残した評価 → eval-log.jsonl に蓄積
scholar-B が次回起動時に読み込み → 種族の経験として継承
```

個体は死ぬ。種族は生き続ける。

## 責務分離の決定

### 却下した案: Sphere 側に loadout を保存
```
NodeEvaluation {
  nodeId, h, w, d,
  loadout?: string,    ← 却下
  agentId?: string,    ← 却下
  timestamp?: number,  ← 却下
}
```

**却下理由**: Sphere は「誰が評価したか」を知る必要がない。
Sphere は物理法則 — 評価が h/w/d デルタとして沈殿するだけ。
種族の記録はカップリングレイヤー (phi-agent) の責務。

### 採用した案: phi-agent 側で独立管理
```
phi-agent/data/eval-log.jsonl
  └── 1行 = 1セッション (loadout, query, timestamp, evaluations[])
```

**採用理由**:
1. カップリングレイヤーを通したエージェントだけが統計に参加する
2. Sphere の型定義を汚さない
3. 将来の DB 移行が容易 (JSONL → SQLite → PostgreSQL)
4. 人間 (Dive) とエージェントの記憶形式が自然に分離される

## 実装

### 書き込み (agent.ts)
```
exploreLoop() 完了
  → persistEvalLog()
    → appendEvalLog(entry)  // JSONL 追記
```

セッション完了後にまとめて書き込み (バッチ方式)。
リアルタイム送信は不要 — 種族記憶は「体験後の報告」。

### 読み取り (eval-log.ts)
```
readEvalLog(loadout?)       // 全エントリ or loadout フィルタ
getSpeciesSummary(loadout)  // 集約統計
```

### ログ構造
```json
{
  "loadout": "scholar",
  "query": "knowledge exploration",
  "timestamp": 1770558995635,
  "duration": 115168,
  "evaluations": [
    {"nodeId": "c2b548770225be7f", "h": 5, "w": 9, "d": 3, "tags": ["psychology","cognition","behavior"]},
    ...
  ]
}
```

### 表示 (index.ts)
```
--- Species Memory ---
Sessions:    2 (scholar)
Total evals: 10
Avg scores:  h=5.4 w=9.0 d=3.9
Hot nodes:   67144ab3(×2), 6195fd7f(×2)
Common tags: psychology, anthropology, society, culture, bias
```

## 記憶の階層 (更新)

| 層 | 保存先 | Sphere 側 | phi-agent 側 | 寿命 |
|----|--------|-----------|-------------|------|
| 環境記憶 | heat, weight, field | ProjDB | — | decay で減衰 |
| 化石記憶 | node state (fossil) | RefDB | — | RefDB 永続 |
| 種族記憶 | evaluation history | — | eval-log.jsonl | ファイル永続 |
| 個体記憶 | feelings, deltaProfile | — | SessionMemory | セッション死で消滅 |

**変更点**: 種族記憶が Sphere 外に独立した永続層として確立された。

## 読み込み (Culture Loop 完了, 2026-02-08)

### SpeciesMemoryBias → FastGate

起動時に `getSpeciesSummary(loadout)` → `SpeciesMemoryBias` に変換 → FastGate に注入。

```
SpeciesMemoryBias {
  hotNodeIds: Map<nodeId, visitCount>  // 種族が過去に訪れたノード
  tags: string[]                        // 種族の蓄積語彙
}
```

スコアリングへの影響 (pickFocusTarget):
- **既知ノード**: `visitCount × SPECIES_NODE_BONUS(3)` を base に加算 (帰巣本能)
- **種族語彙**: タグ一致で `SPECIES_TAG_BONUS(3)` を base に加算 (視野拡張)
- いずれも keywordMatch(10) より弱い — nudge であって mandate ではない
- base に加算 → Weapon の乗算パイプラインに参加 (性格との掛け合わせが生きる)

### 実証結果 (scholar ×3)

```
Session 1: 5 evals → eval-log.jsonl に蓄積
Session 2: 5 evals → 蓄積 + 2ノード再訪
Session 3: "Species memory: 2 past sessions, 5 known nodes, 10 tags" ← ループ閉鎖
           → 6195fd7f を3セッション連続訪問 (帰巣)
           → d06531c6 をセッション2の記憶で再訪 (文化継承)
           → avgW=9.0 不変 (種族行動の定着)
```

## 今後の展望

### 短期: 種族記憶の decay / 容量管理
- eval-log.jsonl は永遠に肥大する
- 古いセッションの減衰 (重み付き平均 or 古いエントリの間引き)
- **設計方針**: truncate ではなく Sphere の作法に従う — phi-agent 自身が古い記憶を評価して淘汰

### 中期: 種族間の比較
- scholar と scout で同じノードの評価を比較
- 種族間で一致して高評価 → Authority 候補
- 種族間で評価が分かれる → 議論的ノード (Catalyst 候補)

### 長期: 種族記憶による Loadout 進化
- 評価傾向から qualityVector を自動調整
- 「この種族は weight を過大評価する傾向がある」→ 補正
- meta-learning: 種族が世代を超えて最適化される

## 関連メモ

- [STIGMERGY_ARCHITECTURE.md](./STIGMERGY_ARCHITECTURE.md) — Sphere の stigmergic model
- [EMERGENT_PERSONALITY_MEMO.md](./EMERGENT_PERSONALITY_MEMO.md) — 性格はモデルに宿らない
- [COUPLING_LAYER_DESIGN_MEMO.md](./COUPLING_LAYER_DESIGN_MEMO.md) — 責務分離の原則
