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

## 今後の展望

### 短期: 種族記憶の読み込み活用
- 次回の scholar 起動時に過去評価を参照
- 過去に高評価だったノード → Weapon のバイアスに加算
- 過去に低評価だったノード → 回避リストに追加

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
