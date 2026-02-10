# Return Response — エージェント帰還時の応答生成

**Date**: 2026-02-10
**Status**: Initial implementation + first test complete

---

## 動機

エージェントはクエリを持ってスフィアへ行き、情報に触れ、評価し、帰還する。
しかし帰還時に「何を発見したか」を表現する仕組みがなかった。

- evaluations は Sphere に堆積する (フェロモン) — これは完了済み
- eval-log.jsonl に種族記憶として記録される — これも完了済み
- **クエリに対する応答がない** — エージェントは黙って帰ってくる

## 設計判断

### データの在り方

- エージェントは sense/focus で **全データを閲覧している** (L1-L3)
- しかしシステムとして **データを直接持ち帰らせていない**
- 禁止はない — 単に配線がなかっただけ
- 帰還時に encounters (見たもの) を使って LLM に応答を生成させる

### 実装方針: A案 (phi-agent 内完結)

```
exploreLoop() → encounters[] 蓄積
  ↓
persistEvalLog() — 種族記憶書き込み
  ↓
generateReturnResponse() — LLM で体験を振り返り ← NEW
  ↓
disconnect() — Sphere から切断
```

UI は後回し。まず stdout で検証。

## 実装詳細

### 1. OllamaClient.generateText()

既存の `generate()` は `format: "json"` 強制。
自然言語応答には JSON 制約を外した別メソッドが必要。

```typescript
async generateText(prompt: string, system?: string, maxTokens = 256): Promise<string>
```

- JSON format なし (free-form text)
- maxTokens = 256 (evaluation の 128 より多い)
- temperature は共通 (0.4)

### 2. encounters[] — エージェントの記憶

standardCycle で focus した後、evaluation 成功時に記録:

```typescript
private encounters: Array<{
  nodeId: string;
  tags: string[];
  summary: string;  // L2 データ — focus() で見たもの
  h: number; w: number; d: number;  // 自分の評価
}>
```

- summary を保存する = エージェントが「見たものを覚えている」
- content (L3) は保存しない — summary で十分
- eval-log には summary は書かない — encounters はセッション内のみ

### 3. generateReturnResponse()

```
Prompt:
  - クエリ
  - 種族名
  - 見たノード一覧 (tags, summary, scores)
  - 残エネルギー

System:
  "Report findings concisely. Do not fabricate. 2-4 sentences."
```

### 4. 配線

`agent.run()` 内、persistEvalLog() の後、disconnect() の前。
失敗しても session は正常終了する (try-catch)。

## 初回テスト結果

### phi3:mini moth — "trending viral discussions"

**5 nodes encountered:**

| # | Tags | Summary | h | w | d |
|---|------|---------|---|---|---|
| 1 | web, curiosity, time-management | Internet rabbit hole descent | 5 | 4 | 2 |
| 2 | biology, evolution, theory | Evolution by natural selection | 2 | 3 | 1 |
| 3 | linguistics, cognition, culture | Sapir-Whorf hypothesis linguistic relativity | 4 | 5 | 3 |
| 4 | theory, computation, mathematics | Turing machine computational universality | 1 | 1 | 1 |
| 5 | game-theory, economics, mathematics | Nash equilibrium game theory | 2 | 3 | 4 |

**Response (原文):**

> During my exploration as a Sphere moth seeking trending viral discussions within various nodes of information and knowledge on the internet, I encountered several topics that have been captivating audiences across different fields: time-management strategies were hotly debated in online forums dedicated to productivity; evolution by natural selection was being discussed with renewed interest due to recent scientific findings. The Sapir-Whorf hypothesis and its implications on linguistic relativity sparked discussions about the influence of language structure on thought processes within cultural studies circles, while Turing machine computational universality became a topic in computer science communities as it relates to artificial intelligence's potential for replicating human cognition. Lastly, Nash equilibrium game theory was trending among economists and strategic decision-makers who are applying these concepts beyond traditional economic models into broader societal contexts such as political campaigning and social media dynamics. These discussions reflect a convergence of interests across disciplines in understanding how fundamental principles shape our daily lives, behaviors, and the digital world we navigate.

### 観察

| 項目 | 結果 | 備考 |
|------|------|------|
| 全ノード参照 | ✅ | 5/5 ノード全てに言及 |
| 英語応答 | ✅ | |
| クエリへの応答 | ✅ | "trending" に絡めようとしている |
| **捏造** | ⚠️ | "recent scientific findings", "online forums" — 見ていないコンテキストを付加 |
| **文長** | ⚠️ | 1段落で全部詰め込み、2-4文指示を無視 |
| **種族性** | ✅ | "as a Sphere moth" と自己言及 |
| **速度** | +約20s | evaluation 5回 (~90s) + return response (~20s) |

### 考察

1. **捏造問題**: "Do not fabricate" は効いていない。LLM は与えられた summary から「もっともらしい文脈」を生成する傾向。これは prompt で制御可能だが、ある程度は受け入れるべきかもしれない — エージェントの「解釈」として
2. **文長制御**: 256 tokens では 1 段落に収まるが、文数制御は弱い。maxTokens を 150 に下げるか、prompt で "maximum 3 sentences" と強調する
3. **種族性の表現**: moth が "moth" と名乗るのは面白いが、もっと性格に基づいた語り口になる可能性がある

---

## 検証予定

- [ ] 他モデルでのテスト (llama3.2:1b, gemma2:2b, qwen2.5:1.5b)
- [ ] 他種族でのテスト (hermit, scholar, hunter — 応答に種族差が出るか)
- [ ] クエリ多様性テスト (同じ種族・モデルでクエリを変える)
- [ ] prompt 調整 (捏造抑制、文長制御、種族性強化)
- [ ] Explorers UI 統合

---

**Changed files:**
- `phi-agent/src/ollama-client.ts` — `generateText()` 追加
- `phi-agent/src/agent.ts` — `encounters[]`, `generateReturnResponse()`, run() 配線
