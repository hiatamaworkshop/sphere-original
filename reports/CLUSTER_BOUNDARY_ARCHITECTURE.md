# Cluster Boundary Architecture — 3 クラスタ分離と接続契約

**Date**: 2026-02-11
**Status**: Confirmed Design
**Depends on**: `SPHERE_ECOSYSTEM_DESIGN.md` (Section 8: IO Gateway), `DEPLOYMENT_STRATEGY.md`

---

## 核心原則

**カップリングレイヤー (FastGate + Digestor) の設計は混ぜてはならない。**

Sphere の独創性は物理法則そのものではなく、物理法則と知性の接合部にある。
FastGate (種族知覚による情報選別) と Digestor (評価の自然選択と種族記憶の代謝) は、
情報生態系における stigmergic coupling の実装であり、学術的に独立した価値を持つ。

Observatory は「データをどう使うか」の問題にすぎない。可視化でも SNS 発信でもイラストの題材でも、
何にでもなれる。ただの観測所だ。この二つを混ぜると、設計の本質が見えなくなる。

---

## 3 クラスタ定義

### Cluster 1: Sphere 系 (物理基盤)

```
┌─────────────────────────────┐
│  Sphere Cluster              │
│                              │
│  periphery   — HTTP API/WS   │ ← 唯一の外部インターフェース
│  renalCore   — 物理エンジン  │   (内部)
│  Sphere-UI   — フロントエンド │ ← 静的配信
│                              │
│  状態: 公開済み (Render + HF) │
└─────────────────────────────┘
```

**責務**: 情報の物理法則。decay, weight, heat, spatial field, 状態遷移。
**所有データ**: ノード (ProjDB + RefDB), tick 状態
**外部IF**: `SPHERE_URL` (HTTP), `SPHERE_WS` (WebSocket), UDP Pulse (:41234)

### Cluster 2: Agent Cluster (カップリングレイヤー)

```
┌──────────────────────────────────────────┐
│  Agent Cluster                            │
│                                           │
│  Explorers     — Gradio UI               │ ← port 7860 (人間向け)
│  phi-agent     — 探索・評価エージェント  │   (内部, Docker spawn)
│  Ollama        — LLM 推論               │   (内部)
│  Digestor      — 自然選択・代謝          │
│    └─ IO Gateway                         │ ← port 5000 (データ公開)
│                                           │
│  内部データ:                              │
│    eval-log.jsonl      — 全評価履歴       │
│    species-profile.json — 種族プロファイル │
│    generations/        — 世代アーカイブ    │
│    narratives/         — ナラティブログ    │
│                                           │
│  状態: 未公開 (ローカル Docker Compose)    │
└──────────────────────────────────────────┘
```

**責務**: 情報の知覚・評価・代謝。Loadout による知覚分化、FastGate による情報選別、
Digestor による評価の淘汰と種族記憶の世代継承。
**所有データ**: eval-log, species-profile, generations, narratives
**外部IF**: port 7860 (Explorers UI), port 5000 (IO Gateway HTTP)
**入力依存**: `SPHERE_URL`, `SPHERE_WS` のみ

### Cluster 3: Observatory (観測所)

```
┌──────────────────────────────────┐
│  Observatory                      │
│                                   │
│  UDP 受信 — Sphere の鼓動        │
│  HTTP 読取 — IO Gateway データ   │
│  (将来) WS — Agent リアルタイム  │
│                                   │
│  出力: 何でもできる               │
│    → 可視化ダッシュボード         │
│    → SNS 発信 (Pool 経由)        │
│    → Sphere 受肉 (Pool 経由)     │
│    → イラスト題材                 │
│    → 統計レポート                 │
│                                   │
│  状態: 設計中                     │
└──────────────────────────────────┘
```

**責務**: なし。データを受け取り、好きに使う。特権を持たない。
**所有データ**: 自身のログのみ
**入力依存**: `SPHERE_URL` (UDP + HTTP), `DIGESTOR_URL` (IO Gateway HTTP)

---

## 接続契約 (Interface Contract)

```
                          SPHERE_URL / SPHERE_WS
┌──────────────┐         (HTTP + WS)          ┌─────────────────────────┐
│  Sphere 系    │◄────────────────────────────►│  Agent Cluster           │
│              │                              │                         │
│  :3001       │                              │  :7860 (Explorers)      │
│  UDP :41234  │                              │  :5000 (IO Gateway)     │
└──────┬───────┘                              └────────────┬────────────┘
       │                                                   │
       │  UDP + HTTP              IO Gateway HTTP          │
       │  (SPHERE_URL)            (DIGESTOR_URL)           │
       │                                                   │
       │          ┌──────────────┐                         │
       └─────────►│ Observatory  │◄────────────────────────┘
                  └──────────────┘
```

| 接続 | プロトコル | 環境変数 | 方向 |
|------|-----------|---------|------|
| Agent → Sphere | HTTP + WS | `SPHERE_URL`, `SPHERE_WS` | Agent が Sphere を叩く |
| Observatory → Sphere | UDP + HTTP | `SPHERE_URL`, UDP port | Observatory が Sphere を聴く |
| Observatory → Agent | HTTP | `DIGESTOR_URL` | Observatory が IO Gateway を読む |

**契約は URL 3 本のみ。** Docker internal network、shared volume、socket — 一切の物理的結合なし。
どのクラスタもどこにでも置ける。

---

## Agent Cluster 内部構造 — 外から見えない

```
┌─ Agent Cluster (内部) ─────────────────────────────┐
│                                                      │
│  Explorers ──docker run──→ phi-agent (短命コンテナ)  │
│                                │                     │
│  phi-agent ──HTTP──→ Ollama (:11434)                 │
│  phi-agent ──HTTP/WS──→ Sphere (外部)                │
│  phi-agent ──file append──→ eval-log.jsonl           │
│                                                      │
│  Digestor ──file R/W──→ eval-log.jsonl               │
│  Digestor ──file write──→ species-profile.json       │
│  Digestor ──file write──→ generations/               │
│  Digestor ──HTTP serve──→ IO Gateway (:5000)         │
│                                                      │
│  phi-agent ──file read──→ species-profile.json       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Docker socket 依存、shared volume、ファイル直書き — これらは全て **Cluster 内部の実装詳細**。
外部から見えるのは port 7860 と port 5000 だけ。

**この設計が正しい理由**: phi-agent は Ollama の隣にいるしかない (LLM 推論の物理的制約)。
Explorers は phi-agent の UI であり、同居が自然。Digestor は eval-log を代謝する以上、
データの隣にいるのが合理的。密結合に見えるが、**クラスタの外には漏れない**。

---

## カップリングレイヤーの学術的価値

Agent Cluster の核心は **phi-agent + Digestor** であり、これは stigmergic coupling の実装:

| 概念 | Sphere での実装 | 蟻塚での対応 |
|------|----------------|-------------|
| **知覚分化** | Loadout (weights, qualityVector) | 個体の感覚閾値 |
| **情報選別** | FastGate (flagBias, weights × metrics) | フェロモン追従の選択性 |
| **環境書き込み** | evaluate (h, w, d → Sphere) | フェロモン堆積 |
| **自然選択** | Digestor (scoring, pruning, survival lottery) | 環境圧によるコロニー淘汰 |
| **文化継承** | species-profile → 次世代の evalFocus 校正 | 巣のフェロモン地図 |
| **環境圧** | 環境ブレンド (0.7×自種族 + 0.3×全種族) | 他コロニーとの資源競争 |

**これは LLM のファインチューニングでは得られない。**
モデルは交換可能な感覚器官にすぎず、性格は Loadout に宿り、学習は Sphere + Digestor が担う。
この構造そのものが研究対象であり、Observatory のデータ活用とは別次元の話。

---

## 分離の原則 — 何を混ぜてはいけないか

| 混ぜてはいけない | 理由 |
|-----------------|------|
| カップリングレイヤーと Observatory | 設計の本質 (知覚・選択) と利用 (可視化・発信) は別問題 |
| Sphere の物理と Agent の解釈 | 既に分離済み。Sphere は flags と metrics のみ、解釈は Agent 側 |
| Agent の評価データと Observatory の語り | eval-log は Agent Cluster の所有。Observatory は IO Gateway 経由でのみ読む |
| 内部結合と外部インターフェース | Docker socket / shared volume はクラスタ内部。外部は HTTP のみ |

**混ぜて良いもの**: Agent Cluster 内の phi-agent, Digestor, Explorers, Ollama — 同居前提。

---

## デプロイ配置 (実験段階)

**原則**: 無料、疎結合、正規公開前提。ハック不可。

### 現状

| クラスタ | 配置 | 状態 |
|----------|------|------|
| Sphere 系 | Render + HF | 公開済み |
| Agent Cluster | ローカル Docker Compose | 開発中 |
| Observatory | 未着手 | 設計中 |

### Phase 1 (実験)

| クラスタ | 配置候補 | 外部IF | 費用 |
|----------|---------|--------|------|
| Sphere 系 | Render + HF (現状維持) | SPHERE_URL | 無料 |
| Agent Cluster | HF Docker Space or ローカル | :7860, :5000 | 無料 |
| Observatory | Render free tier or ローカル | — | 無料 |

**Agent Cluster on HF Docker Space**: Gradio (:7860) + IO Gateway (:5000) + Ollama を 1 Space に。
HF Docker Space は任意の Dockerfile を実行できる。CPU 推論は遅い (phi3:mini ~60s/cycle) が動く。

**Agent Cluster on ローカル**: 開発中はこれで十分。外部公開時に HF or VPS へ移行。

### Phase 2 (公開)

| クラスタ | 配置候補 | 理由 |
|----------|---------|------|
| Sphere 系 | Render (有料 tier) | 安定稼働 |
| Agent Cluster | GPU VPS (Hetzner etc.) | Ollama が本気で動く |
| Observatory | Render or AWS | 軽量、どこでも良い |

---

## 参照

- `SPHERE_ECOSYSTEM_DESIGN.md` — 循環と分離の全体設計 (Section 8: IO Gateway 詳細)
- `DEPLOYMENT_STRATEGY.md` — 具体的デプロイ手順 (VPS, Docker Compose, Firewall)
- `NARRATIVE_LOG_DESIGN.md` — IO Gateway が配信するナラティブの設計
- `STIGMERGY_ARCHITECTURE.md` — カップリングレイヤーの理論的背景

---

*3 クラスタの境界は URL で定義される。Docker network でも shared volume でもない。
だからどこにでも置ける。だから混ぜる必要がない。*
