# External Access Patterns — 外部からの Sphere 利用設計

**Date**: 2026-02-09
**Status**: 設計判断確定 (C 推奨、A 達成済み、B 将来対応可)

---

## 3つのパターン

```
Pattern A: 直接アクセス (Direct)
  外部Agent ──→ Sphere API (sense/focus/evaluate)
  レイヤーの恩恵なし。全て自力。

Pattern B: レイヤー利用 (Bring Your Own LLM)
  外部Agent (任意のLLM) ──→ Layer System ──→ Sphere
  種族+武器の恩恵を受ける。LLM はプロンプトに応えるだけ。

Pattern C: 委託 (Delegation)
  外部Client ──→ POST /explore ──→ phi-agent + Sphere (内部完結)
  外部は判断 (query) だけを渡す。実行は全て Sphere 側。
```

## なぜ C が最も筋がいいか

### 1. フォーマット問題が消滅する

Pattern B では外部 LLM の出力を parseAction で解釈する必要がある。
LLM ごとに出力形式が異なり、coupling 層がモデル固有のアダプタを抱え込む。

Pattern C では外部は LLM 出力に一切触れない。
`format: "json"` も parseAction のフォールバックも、完全に内部実装の自由度に閉じる。

### 2. Judgment Daemon 構造と一致する

```
外部クライアント = Judgment Daemon (出来事を作る側)
  「この領域を scholar で探索してくれ」
  「この query に関連するノードの評価を集めてくれ」

Sphere + phi-agent = 実行側 (存在を維持する側)
  種族選択、感情、移動、評価 — 全て内部で完結
```

外部はエージェントである必要がない。**判断 (query/intent)** だけを渡せばいい。
これは JUDGMENT_DAEMON_VISION.md の Phase 3 構想と自然に合流する。

### 3. pool-service と対称になる

```
pool-service  = 外部 → Sphere への「書き込み」委託 (データ投入)
phi-agent API = 外部 → Sphere への「読み取り+評価」委託 (探索)
```

入口が二つ、出口は Sphere。外部から見た契約がシンプルで対称。

### 4. 軽量モデルの価値が最大化する

Pattern C の売り: **どんな軽量モデルでも、ファインチューニングなしで、
性格と戦略を持った知的エージェントになれる。** 外部はその恩恵を、
curl 一発で享受できる。LLM を持っていなくていい。

## Pattern C の API イメージ

```
POST /explore
{
  query: "AI safety",
  loadout: "scholar",    // optional (default: balanced or "random")
  cycles: 10             // optional
}

→ 200 OK
{
  status: "completed",
  cycles: 10,
  evaluations: [
    { nodeId: "abc123", h: 8, w: 7, d: 4, tags: ["safety", "alignment"] },
    ...
  ],
  speciesMemory: {
    hotNodes: [...],
    commonTags: [...]
  }
}
```

現在の daemon モードに HTTP エンドポイントを一つ足すだけで実現できる。

## 責務分離 — 3層の正しい境界

| 層 | 責務 | 対象 |
|---|---|---|
| **LLM Client** (`format:json` 等) | 感覚器官固有のフォーマット強制 | そのモデルだけ |
| **parseAction** (alias + fallback) | ユニバーサル行動解釈 | 全モデル共通 |
| **Digestor** | 評価品質の正規化 (model bias) | 全モデル横断 |

### 各層の設計原則

**LLM Client (感覚器官)**
- `format: "json"` は OllamaClient 固有 — ollama API のパラメータ
- GPT なら `response_format: {type: "json_object"}`、Claude なら `tool_use`
- 外部には漏れない。Pattern C では外部から見えない内部実装

**parseAction (ユニバーサルパーサー)**
- action alias (`rate→evaluate`, `select→focus`, `walk→move`) — 全モデル共通の正規化
- keyless JSON 推論 (`{h:8,w:7}→evaluate`) — action キーなしでもスコアを拾う
- 局所対応ではなく **汎用化**: どんな LLM が何を返しても、JSON に数値があれば解釈できる
- Pattern B を開放する場合、ここがインターフェースの核になる

**Digestor (評価品質正規化)**
- `eval-log.jsonl` の `model` フィールドでモデル間の傾向差を識別
- 「phi3:mini は h を高めに出す」「1B は分散が大きい」— 統計的に学習可能
- score の補正は coupling 層ではなくここが担う (エージェントはフェイクしない)

## Pattern A/B/C の対応状況

| Pattern | 状態 | 必要な追加実装 |
|---------|------|--------------|
| **A: 直接** | **達成済み** | なし (Sphere API は公開済み) |
| **B: BYOLLM** | 対応可能 | `SensoryOrgan` interface の明示化 |
| **C: 委託** | **推奨・設計中** | HTTP endpoint (`POST /explore`) |

## Pattern B への将来拡張 (メモ)

Pattern B を開放する場合、LLM Client のインターフェースを明示する必要がある:

```typescript
interface SensoryOrgan {
  generate(prompt: string, system?: string): Promise<string>;
}
```

OllamaClient はこの実装の一つ。外部が自分の LLM Client を持ち込む場合、
このインターフェースを満たす実装を提供すればよい。
parseAction がその出力を解釈する。

ただし Pattern B の優先度は低い:
- Pattern C で外部の需要は満たせる
- Pattern B は「自分の LLM で Sphere を体験したい」という開発者向けの需要
- interface の安定化は内部が固まってからでよい

## 関連メモ

- [JUDGMENT_DAEMON_VISION.md](./JUDGMENT_DAEMON_VISION.md) — Phase 3: Judgment Daemon = Pattern C の発展形
- [STIGMERGY_ARCHITECTURE.md](./STIGMERGY_ARCHITECTURE.md) — Sphere = 痕跡協調基盤
- [SPECIES_MEMORY_METABOLISM_DESIGN.md](./SPECIES_MEMORY_METABOLISM_DESIGN.md) — Digestor の責務
- [EMERGENT_PERSONALITY_MEMO.md](./EMERGENT_PERSONALITY_MEMO.md) — 軽量 LLM で性格が創発する
- [LOADOUT_DESIGN_MEMO.md](./LOADOUT_DESIGN_MEMO.md) — Loadout = 静的人格
