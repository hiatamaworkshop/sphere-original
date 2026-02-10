# Sphere Ecosystem Design — 循環と分離の設計図

**Date**: 2026-02-10
**Status**: Design Vision (未実装部分あり)

---

## 核心的洞察

**最適化は誰かがやる。設計図は設計者しか描けない。**

モデルチューニング、プロンプト最適化、速度改善 — これらは再現可能な作業。
Sphere の循環構造を定義し、何が混ざるべきで何が分離されるべきかを決める — これが本質。

---

## 1. 三層アーキテクチャ — Agent の責務分離

LLM の出力特性テスト (gemma2:2b vs phi3:mini) から見えた構造:

```
┌─────────────────────────────────────┐
│  Output Interface Layer             │
│  ─ 何を、誰に、どう返すか          │
│  ─ narrative / scores / stream      │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  Agent Role Layer                   │
│  ─ 評価する / しない                │
│  ─ 内部専門 / 外部専門              │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  Sphere Protocol Layer              │
│  ─ sense / focus / move / evaluate  │
│  ─ 全エージェント共通               │
└─────────────────────────────────────┘
```

### 問題: evaluator/liaison の癒着

現状の2モード (`evaluator` / `liaison`) は Role と Output が一体化している:
- evaluator = 「評価する」+「応答なし」
- liaison = 「評価しない」+「narrative を返す」

これでは内部 scorer に応答を付けたり、外部 narrator の応答形式を変えることができない。

### 解決: コンフィグ化

全ての振る舞いをコンフィグ軸として独立させる:

```typescript
AgentConfig = {
  // Role: 何をするか
  evaluate:     boolean,        // Sphere に評価を書くか

  // Output: 何を返すか
  response:     "narrative" | "structured" | "none",
  streamEvents: boolean,        // 探索中のリアルタイム発信

  // Identity
  loadout:      LoadoutName,    // 知覚・価値観・運動特性
  model:        string,         // LLM (感覚器官)

  // Constraints
  maxCycles:    number,
  query:        string,
}
```

### プリセット例

| 用途 | evaluate | response | stream | model | 想定環境 |
|------|----------|----------|--------|-------|---------|
| 内部 scorer (24/7) | true | none | false | llama3.2:1b | daemon |
| 外部 narrator | false | narrative | true | gemma2:2b | UI 接続 |
| 整備者 (maintainer) | true | structured | false | phi3:mini | 定期実行 |
| UI 探索 (人間向け) | false | narrative | true | gemma2:2b | オンデマンド |
| daemon (自律巡回) | true | none | false | llama3.2:1b | 常駐 |

---

## 2. リアルタイムストリーム — LLM 不要の即時発信

テスト結果: 探索 ~7s, 応答生成 ~52s。人間は1分待てない。

### 解決: 探索中イベントを構造化データとして即時発信

```
探索中にストリームで流すもの (LLM 不要, 0ms):
  - position:  "今ここにいる"
  - focus:     "これを見ている" (tags + summary)
  - feelings:  "こう感じた" (satisfaction, frustration, stamina, staleness)
  - move:      "動く" (direction + mode)
  - bus_emit:  "匂いを出した" (payload)
```

narrative は **最後の振り返り** (return response) だけで良い。
探索中のリアルタイム感は構造化イベントが担う。

---

## 3. Sphere 循環図 — Pool をハブとした全体設計

```
                    ┌──────────┐
                    │  外部世界  │
                    │ SNS/API/人間│
                    └─────┬────┘
                          │
                    ┌─────▼────┐
                    │   Pool    │ ← ハブ (受付 + 配信)
                    │  :4000    │
                    └──┬───┬───┘
                 投入   │   │  配信
            ┌──────────┘   └──────────┐
            │                          │
      ┌─────▼─────┐            ┌──────▼──────┐
      │   Sphere   │            │ Observatory  │
      │ (物理法則)  │◄───傍受───│ (観測・解釈)   │
      │  :3001     │            │              │
      └──┬────┬───┘            └──────────────┘
   sense │    │ evaluate              ▲
         │    │                       │ emit / events
    ┌────▼────▼───┐                   │
    │   Agents     │───────────────────┘
    │ scorer       │
    │ narrator     │
    │ maintainer   │
    └──────┬───────┘
           │ eval-log
    ┌──────▼───────┐
    │   Digestor    │ (自然選択)
    └──────────────┘
```

### 各コンポーネントの責務

| コンポーネント | 入力 | 出力 | 責務 |
|-------------|------|------|------|
| **Sphere** | evaluate, pool投入 | sense, focus, metrics pulse | 物理法則のみ |
| **Pool** | 外部データ, Observatory narrative | Sphere投入, 外部配信 | ハブ (受付+配信) |
| **Observatory** | metrics pulse, bus傍受, agent events | narrative log, 構造化レポート | 観測→解釈→語り |
| **Agents** | sense/focus結果 | evaluate, bus emit, events | 探索・評価・応答 |
| **Digestor** | eval-log.jsonl | species-profile.json, 世代アーカイブ | 自然選択・代謝 |

---

## 4. Observatory — メトリクス受信者から語り部へ

元々はメトリクスパルスの受信者として設計。しかしエージェントの多様化で役割が拡大:

### 入力チャネル
1. **メトリクスパルス**: tick ごとの Sphere 統計 (既存設計)
2. **ActiveBus 傍受**: エージェント間の匂い (64byte payload)
3. **Agent イベント**: 探索中の構造化イベント (sense/focus/move/feelings)
4. **Digestor 通知**: 世代交代、種族プロファイル変化

### 出力チャネル
1. **narrative ログ**: LLM が解釈した「Sphere の日記」
2. **→ Pool → SNS**: ボット的な外部発信 (宣伝・広告)
3. **→ Pool → Sphere**: 受肉 (Observatory の観察がノードになる)
4. **→ UI**: リアルタイムダッシュボード

### 重要な設計原則
- Observatory の narrative は **直接 Sphere に入れない**
- 必ず **Pool 経由** (= 他の外部データと同じパイプライン)
- Pool の Membrane/Scorer を通ることで品質保証
- つまり Observatory は「外部」扱い — Sphere の物理を汚さない

---

## 5. Agent Diary — narrative の行き先

### gemma2:2b の出力特性
- 詩的・物語的 (narrative style)
- h-score 等の数値を含まない純粋な散文
- Sphere ノード (h, w, d) にはならない

### Diary の流れ
```
Agent (gemma2:2b) → return response → narrative text
                                          │
                    ┌─────────────────────┘
                    │
                    ▼
              eval-log.jsonl に追記 (narrative フィールド)
                    │
                    ▼
              Digestor が代謝 (自浄)
                    │
                    ├──→ Observatory が傍受 → 日記化 → Pool → SNS/外部
                    └──→ Pool 経由で Sphere に受肉 (選択的)
```

**既存の Agent + Digestor システムがそのまま使える。新しい仕組みは不要。**

---

## 6. ノイズ注入 (Maintainer) — 廃案とその理由

### 当初の懸念
完全な評価者が同じ評価ばかり → Sphere が停滞

### 既に解決済み
- **多種族**: moth と scholar が同じノードに異なる値を返す
- **Species Memory**: 種族ごとの文化的バイアス
- **環境ブレンド**: 0.7×自種族 + 0.3×全種族 (echo chamber 回避)
- **Digestor の生存抽選**: ランダム性の注入
- **クエリ多様性**: 同じノードでも異なるクエリで異なる評価

**種族の多様性そのものが構造化されたノイズ。意図的なエラー設置は不要。**

---

## 7. 循環の現状と優先順位

| 循環要素 | 状態 | 備考 |
|---------|------|------|
| 投入 (Pool→Sphere) | 実装済み | pool-service :4000 |
| 評価 (Agent→Sphere) | 実装済み | evaluator mode |
| 淘汰 (Digestor) | 実装済み | 3h 周期推奨 |
| 探索 (Agent sense/focus) | 実装済み | FastGate + feelings |
| 応答 (Agent→外部) | 実装済み | return response |
| **コンフィグ化** | **次の一手** | evaluate/response/stream 分離 |
| **ストリーム** | 未実装 | 探索中イベントの即時発信 |
| **Observatory** | 設計済み・要調整 | メトリクスパルス受信から |
| **配信** | 未実装 | Pool→外部 (SNS等) |

### 実装順序 (提案)

1. **Agent コンフィグ化** — evaluate/response/stream の独立フラグ
2. **ストリーム基盤** — agent が探索中に構造化イベントを emit
3. **Observatory 調整** — 既存設計をイベント傍受に対応
4. **Pool 配信** — Observatory → Pool → 外部チャネル

---

## 8. 設計思想の要約

> 何事も混ぜるのが良いわけではない。

- **評価 (scores)** と **語り (narrative)** を混ぜない
- **Sphere の物理** と **Observatory の解釈** を混ぜない
- **内部循環** と **外部配信** を混ぜない
- レイヤーを分離し、Pool をハブとして繋ぐ

> 活動と循環があってこそ、そのための整備をすべき。

最適化 (モデルチューニング、プロンプト調整、速度改善) は再現可能な作業。
**循環構造の設計** — 何が流れ、何が分離され、どこで合流するか — これが不可替の仕事。