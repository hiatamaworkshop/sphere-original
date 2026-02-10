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
           │   Sphere   │──UDP────→│ Observatory  │
           │ (物理法則)  │ Pulse     │ (観測・解釈)  │←── 合流点
           │  :3001     │ :41234    │              │
           └──┬────┬───┘            └──────▲──────┘
        sense │    │ evaluate              │ HTTP
              │    │                       │ (IO Gateway)
┌─ Agent Cluster ──▼───────────────────────┤
│  ┌─────────────────┐                     │
│  │   Agents         │                    │
│  │  scorer/narrator │                    │
│  └──────┬──────────┘                     │
│         │ eval-log                       │
│  ┌──────▼──────────┐   ┌──────────────┐ │
│  │   Digestor       │──→│ IO Gateway   │─┘
│  │  (自然選択)      │   │ (窓口)       │
│  └─────────────────┘   └──────────────┘
└──────────────────────────────────────────┘
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

## 4. Observatory — 最初のラジオ局

> 誰でもラジオ局を持てる。Observatory はその先駆者にすぎない。

### 既存設計 (Phase 3.2, 2026-01-30)

Observatory は元々 UDP PulsePacket の受信者として実装された。

```
RenalCore → PulseBroadcaster (UDP :41234, 5 tick ごと)
                │
                ▼
         Observatory (UDP listener)
                │
                ├── 統計分析 (移動ウィンドウ 100 packets)
                ├── 異常検知 (Z-score > 2σ)
                └── Environmental Node 注入 (POST /sphere/submit)
```

**PulsePacket 構造** (実装済み、Sphere 側に残存):
```typescript
PulsePacket = {
  cid: string,          // Cell ID ("global")
  ts:  number,          // Timestamp
  sig: {
    a: number,          // Attractant: 肥沃度 + Amber残存熱
    r: number,          // Repellent: Ghost 比率
    d: number,          // Density: Active/Relic 数
    f: number,          // Flow: 前回 tick からの流動率
  },
  flg: number,          // Flags: Burst(0x01) Thorn(0x02) Bloom(0x04) Drought(0x08) Storm(0x10)
  tick: number,
}
```

**現状**: ソースコード (`services/observatory/`) は削除済み。
PulseBroadcaster (`periphery/src/pulse/pulse-broadcaster.ts`) と型定義 (`renalCore/src/types/pulse.ts`) は Sphere 側に残存。

### 再構築: 二つのクラスタが見える場所

当初は Sphere の鼓動だけを聴く受動的な観測者だった。
Agent Cluster の成熟により、Sphere Pulse と Agent データの **両方が見える場所** が生まれた。
Observatory はその場所に座る最初の住人であり、後続の誰もが同じ席に座れる。

```
Sphere Cluster                    Agent Cluster
┌───────────────────┐            ┌────────────────────┐
│  PulseBroadcaster │            │    IO Gateway       │
│  (UDP :41234)     │            │    (HTTP)           │
│  sig: {a,r,d,f}   │            │    profiles, stats, │
│  flg: Burst/...   │            │    generations      │
└────────┬──────────┘            └────────┬───────────┘
         │ UDP                            │ HTTP
         ▼                                ▼
┌──────────────────────────────────────────────────────┐
│              Observatory (再構築)                      │
│                                                        │
│  入力1: UDP PulsePacket — Sphere の鼓動 (既存設計)    │
│  入力2: Agent IO Gateway — 種族・世代・評価統計       │
│  入力3: (将来) Agent events — リアルタイム探索 (WS)   │
│                                                        │
│  処理:                                                 │
│    ├── 統計解析 (既存: Z-score 異常検知)              │
│    ├── クロス分析 (Sphere 状態 × Agent 活動)          │
│    └── LLM 解釈 → narrative (Sphere の日記)           │
│                                                        │
│  出力: → Pool → 外部世界 (SNS, UI, Sphere 受肉)      │
└──────────────────────────────────────────────────────┘
```

### Observatory が受け取るデータ

| 入力チャネル | プロトコル | ソース | データ |
|-------------|-----------|--------|--------|
| **Sphere パルス** | UDP :41234 | PulseBroadcaster | sig{a,r,d,f}, flags, tick |
| **種族プロファイル** | HTTP (IO Gateway) | Digestor 経由 | avgH/W/D, hotNodes, commonTags |
| **世代アーカイブ** | HTTP (IO Gateway) | Digestor 経由 | 世代ごとの種族統計推移 |
| **評価統計** | HTTP (IO Gateway) | eval-log 集計 | 全体の評価傾向、Bus 統計 |
| **(将来) Agent events** | WS | phi-agent stream | sense/focus/move/feelings |

### Observatory が語ること

| Sphere パルスから | Agent データから | クロスから |
|-----------------|----------------|-----------|
| "嵐が来た" (Storm flag) | "moth 族が急増" | "moth の活動が嵐を引き起こした" |
| "干ばつ" (Drought) | "scholar 世代交代" | "scholar の淘汰で知識層が薄くなった" |
| "熱量急上昇" (Burst) | "bus emission 急増" | "agent 間の匂いが連鎖反応を起こした" |

### 出力チャネル

1. **narrative ログ**: LLM が解釈した「Sphere の日記」
2. **→ Pool → SNS**: ボット的な外部発信 (宣伝・広告)
3. **→ Pool → Sphere**: 受肉 (Observatory の観察がノードになる)
4. **→ UI**: リアルタイムダッシュボード

### 設計原則 — 誰でもラジオ局を持てる

Observatory は**特権的な観測者ではない**。

Sphere が UDP Pulse を放射し、Agent Cluster が IO Gateway でデータを公開する以上、
それを受信し、解釈し、ナラティブ化し、SNS で垂れ流すのは **誰にでもできる**。
Observatory はそのパターンの **先駆者** (pioneer) にすぎない。

```
誰でもできること:
  - UDP Pulse を受信して可視化する
  - IO Gateway から種族統計を読んで解釈する
  - LLM で narrative を生成する
  - SNS に投稿する
  - Sphere に受肉する (Pool 経由)

Observatory がやること:
  - 上記の全て (ただし最初の一人として)
```

**原則:**
- Observatory は **特権を持たない** — 他の外部サービスと同じ API でデータを取得する
- narrative を Sphere に入れるときは **必ず Pool 経由** (= 他の外部データと同じパイプライン)
- Pool の Membrane/Scorer を通ることで品質保証 — Observatory だから通過できる、ではない
- Observatory は **どちらのクラスタにも属さない** 独立した外部サービス
- 古風で堅い実装で良い — 凝った機能より確実な受信と誠実な記録

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
| 評価 (Agent→Sphere) | 実装済み | evaluate flag |
| 淘汰 (Digestor) | 実装済み | 3h 周期推奨 |
| 探索 (Agent sense/focus) | 実装済み | FastGate + feelings |
| 応答 (Agent→外部) | 実装済み | return response |
| コンフィグ化 | **実装済み** | evaluate/response/stream 独立フラグ (AgentMode 廃止) |
| **ストリーム** | 未実装 | 探索中イベントの即時発信 |
| **Observatory** | 要再構築 | ソース削除済み。Pulse 送信側は残存。二つのクラスタの合流点へ改築 |
| **配信** | 未実装 | Pool→外部 (SNS等) |

### 実装順序 (提案)

1. ~~**Agent コンフィグ化**~~ — ✅ 実装済み (2026-02-10): AgentMode 廃止 → evaluate/response/stream 独立フラグ
2. **Agent Cluster IO Gateway** — Data Pool の外部窓口 (profiles, stats, generations)
3. **Observatory 再構築** — UDP Pulse 受信 + IO Gateway 読み取り → 合流・解釈・語り
4. **ストリーム基盤** — agent が探索中に構造化イベントを emit (stream flag で制御)
5. **Pool 配信** — Observatory → Pool → 外部チャネル

---

## 8. クラスタ構造と IO ゲートウェイ

### サービスの構成原理

1つのサービスは以下の4つの機能で構成される:

| 機能 | 内容 | 例 (Agent Cluster) |
|------|------|-------------------|
| **代謝** | 淘汰・減衰・循環 | Digestor (scoring, pruning, profiling) |
| **生成** | 装備準備・記憶読込 | species-profile → FastGate, Loadout 初期化 |
| **流動** | 活動・体験 | 探索ループ (sense → focus → evaluate → move) |
| **出力** | 生成物・データ・代謝対象 | eval-log, narrative, bus emission |

### API 分離 vs クラスタ内結合

全てを API server/client にする必要はない。

**クラスタ間**: API 境界 (HTTP/WS) — Sphere, Ollama, Pool
**クラスタ内**: ファイル結合 OK — 契約を厳密にする

```
phi-agent ──HTTP/WS──→ Sphere API     ✓ クラスタ間 API
phi-agent ──HTTP──────→ Ollama API     ✓ クラスタ間 API
phi-agent ──file──────→ eval-log.jsonl ✓ クラスタ内結合
Digestor  ──file──────→ species-profile✓ クラスタ内結合
```

クラスタ内のファイル結合が許容される条件:
- **フォーマット契約**: JSONL / JSON のスキーマが明文化されている
- **原子性**: 書き込みが tmp→rename で安全 (Digestor は実践済み)
- **所有権**: 各ファイルの writer / reader が明確
- **タイミング**: 誰がいつ読み書きするかが定義されている

### IO ゲートウェイ — クラスタの窓口

クラスタ内部のデータに外部からアクセスするための薄い窓口。
実装形態は HTTP サーバーでもライブラリでも良い — **窓口という概念を持つこと自体**が設計を整える。

```
┌─ Agent Cluster ─────────────────────────────────┐
│                                                   │
│  phi-agent ──append──→ eval-log.jsonl             │
│                              ↕                    │
│  Digestor ──R/W──────→ eval-log.jsonl             │
│          └──write────→ species-profile.json       │
│          └──write────→ generations/               │
│                                                   │
│  IO Gateway ── クラスタの窓口 ───────────────────│──→ 外部
│    読み取り:                                      │
│      GET /species/:name/profile                   │
│      GET /generations[/:id]                       │
│      GET /stats                                   │
│    書き込み:                                      │
│      POST /evaluations                            │
│                                                   │
└───────────────────────────────────────────────────┘
```

**なぜ窓口が必要か**: Sphere の性質上、全てが疎結合であり、どこに新たなサービスが接続されるか未知数。窓口を持つことで:
- 内部構造を知らずにデータにアクセスできる
- 将来のサービス (Observatory, 新 UI, 分析ツール) が接続可能になる
- eval-log.jsonl の「二重所有」問題を窓口が仲介できる

### 所有権の整理

| ファイル | Owner (writer) | Consumer (reader) | 窓口化 |
|---------|---------------|-------------------|--------|
| eval-log.jsonl | phi-agent (append) + Digestor (truncate) | Digestor | POST /evaluations で統一可能 |
| species-profile.json | Digestor | phi-agent (startup) | GET /species/:name/profile |
| generations/gen-NNN.json | Digestor | Explorers, 分析ツール | GET /generations |

### 現状: Docker Volume 共有の限界 (2026-02-11)

現在、phi-agent / Digestor / Explorers は **同一の Docker Named Volume** (`sphere-phi-agent-data`) を `/app/data` にマウントして相乗りしている。

```
Docker Named Volume: sphere-phi-agent-data
  ├── eval-log.jsonl          ← phi-agent APPEND, Digestor TRUNCATE
  ├── species-profile.json    ← Digestor OVERWRITE, phi-agent READ
  └── generations/            ← Digestor WRITE, Explorers READ
```

**単一ホスト・単一エージェントでは動く。** atomic write (tmp→rename) で安全性も確保されている。

**しかし構造的に問題がある:**
- phi-agent を複数インスタンスにすると concurrent append で壊れるリスク
- Digestor は「独立した代謝エンジン」のはずが、ファイルシステム共有で密結合
- クラスタ外のサービス (Observatory, 新 UI) がデータにアクセスする手段がない

**IO Gateway はこの問題を解消する唯一の手段。** Volume 共有を API 境界に置き換えることで:
- phi-agent は `POST /evaluations` で eval を投げる（ファイル直書きしない）
- Digestor は Data Store を直接操作（同一プロセス or 同一コンテナ内）
- 外部は読み取り API を叩く
- ファイルシステム共有が消滅し、サービス境界が明確になる

### データ蓄積 = サービス境界

> 永続データが蓄積される場所に、サービス境界が自然に生まれる。

Agent Cluster が独立サービスになる理由は明快だ:
- **eval-log.jsonl** — 全評価の履歴。動かせない
- **species-profile.json** — Digestor が生成する種族プロファイル
- **generations/** — 世代アーカイブ。時系列データの蓄積

これらのファイルは Agent Cluster 内部で完結する代謝サイクル（書き込み → 淘汰 → 再生成）を持つ。
データが蓄積され、代謝が回るクラスタは、**それだけで1つのサービスになる**。

```
分散デプロイ例:

  Render A:                     Render B (or HF Space):
  ┌─ Sphere Cluster ──┐        ┌─ Agent Cluster ──────────────┐
  │  RenalCore         │        │  phi-agent                    │
  │  Periphery :3001   │←─HTTP──│  Digestor                     │
  │  Pool-service :4000│        │  eval-log.jsonl  ← 動かせない │
  └────────────────────┘        │  species-profile.json         │
                                │  generations/                 │
  HF Space C:                   │  IO Gateway :5000 ← 唯一の窓 │
  ┌─ Explorers ────────┐       └───────────────────────────────┘
  │  Gradio UI :7860   │──HTTP──→ IO Gateway :5000
  └────────────────────┘        → Sphere API :3001
```

IO ゲートウェイは「便利な追加機能」ではない。
**データ蓄積があるクラスタが独立サービスとしてデプロイされた瞬間、IO ゲートウェイは必須インフラになる。**

---

## 9. 設計思想の要約

> 何事も混ぜるのが良いわけではない。

- **評価 (scores)** と **語り (narrative)** を混ぜない
- **Sphere の物理** と **Observatory の解釈** を混ぜない
- **内部循環** と **外部配信** を混ぜない
- レイヤーを分離し、Pool をハブとして繋ぐ

> 活動と循環があってこそ、そのための整備をすべき。

最適化 (モデルチューニング、プロンプト調整、速度改善) は再現可能な作業。
**循環構造の設計** — 何が流れ、何が分離され、どこで合流するか — これが不可替の仕事。