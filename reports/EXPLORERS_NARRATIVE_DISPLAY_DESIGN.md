# Explorers UI — Narrative Display Design

**Date**: 2026-02-11
**Status**: Design memo (未実装)

---

## 設計方針: 最小実装

### 原則

- **FIFO ですらなくて良い** — エージェント帰還時に「何を見たか」を表示するだけ
- **新規タブ不要** — Agent Runner タブ内の出力に narrative を追加
- **裏で Digestor-Narrative に蓄積** — phi-agent 側で既に実装済み

---

## 実装スコープ

### Explorers UI (Agent Runner タブ)

**現状**:
```
[Species] [Model] [Query] → [Run Agent]
↓
Cycle visualization (sense → focus → evaluate → move)
```

**追加**:
```
[Species] [Model] [Query] → [Run Agent]
↓
Cycle visualization (sense → focus → evaluate → move)
↓
**Return Narrative** (帰還時のみ表示)
```

### 表示内容

**最小形式**:
```markdown
## Agent Narrative

{narrative text}

---
Duration: {duration}s
Encounters: {encounter count} nodes
Feelings: satisfaction={S}, frustration={F}, stamina={St}
```

**narrative text の生成**:
- phi-agent 側で既に実装済み (`RESPONSE=true` フラグ)
- Docker executor 経由で取得 → Gradio Textbox に表示

---

## データフロー

```
1. Explorers UI → Docker exec phi-agent (RESPONSE=true)
2. phi-agent → Sphere dive → return (narrative 生成)
3. phi-agent → Digestor POST /narratives (蓄積)
4. phi-agent → stdout (narrative 出力)
5. Explorers UI → narrative 取得 → Gradio 表示
```

**重要**: Digestor への POST は phi-agent が担当。Explorers は表示のみ。

---

## 実装箇所

### explorers/app.py

**修正対象**: `run_agent()` 関数

**現状**:
```python
def run_agent(species, model, query):
    # Docker exec phi-agent
    # Return: cycle_output (sense/focus/evaluate/move logs)
```

**追加**:
```python
def run_agent(species, model, query):
    # Docker exec phi-agent (RESPONSE=true 追加)
    cmd = [
        "docker", "exec", "phi-agent",
        "/bin/sh", "-c",
        f"LOADOUT={species} OLLAMA_MODEL={model} RESPONSE=true node /app/dist/index.js '{query}'"
    ]

    # stdout から narrative 抽出 (== NARRATIVE START == ... == NARRATIVE END == で囲まれている)
    narrative = extract_narrative(stdout)

    # Return: cycle_output + narrative
    return cycle_output, narrative
```

**Gradio UI 追加**:
```python
with gr.Tab("Agent Runner"):
    # ... 既存の species/model/query inputs
    run_btn = gr.Button("Run Agent")
    cycle_output = gr.Textbox(label="Cycle Visualization")
    narrative_output = gr.Markdown(label="Return Narrative")  # 追加

    run_btn.click(
        run_agent,
        inputs=[species_dropdown, model_dropdown, query_input],
        outputs=[cycle_output, narrative_output]  # narrative 追加
    )
```

---

## 既存実装との接続

### phi-agent 側 (実装済み)

- `RESPONSE=true` フラグで narrative 生成有効化
- `src/narrative-builder.ts` — 帰還時 narrative 生成
- `src/eval-log.ts` — `appendNarrativeLog()` で Digestor POST

### Digestor 側 (実装済み)

- `POST /narratives` — narrative-log.jsonl に追記
- `GET /narratives` — 蓄積された narrative 取得 (将来の FIFO 用)

---

## 将来の拡張 (後日実装候補)

### Phase 2: FIFO 閲覧

- 第3タブ「Narratives」追加
- Digestor `/narratives?limit=10` から最新 N 件取得
- Species/Model フィルタ

### Phase 3: SNS 配信

- Digestor → SNS bot (自動投稿)
- または手動コピペ用の共有リンク生成

---

## 実装優先度

- **今すぐ**: なし (設計メモのみ)
- **データ蓄積後**: Agent Runner に narrative 表示追加 (< 1 時間)
- **運用安定後**: FIFO タブ追加、SNS 配信

---

## 設計判断

### なぜ FIFO が不要か

- **Explorers の役割**: Agent 実行の操作盤
- **ユーザー行動**: クエリ入力 → 実行 → 結果確認
- **1 セッション 1 narrative** — 過去の narrative を遡る必要性が低い
- **Digestor で永続化済み** — 後から `/narratives` で取得可能

### なぜ新規タブが不要か

- **Context の連続性**: Agent 実行 → Narrative が同一画面で完結
- **認知負荷の低減**: タブ切り替え不要
- **Gradio の制約**: タブ間の state 共有が面倒

---

## 技術的注意点

### narrative の抽出方法

**phi-agent stdout フォーマット** (既存):
```
[phi-agent] Cycle 1: sense
[phi-agent] Cycle 2: focus
...
== NARRATIVE START ==
{narrative text}
== NARRATIVE END ==
```

**Explorers 側での抽出**:
```python
def extract_narrative(stdout: str) -> str:
    start = stdout.find("== NARRATIVE START ==")
    end = stdout.find("== NARRATIVE END ==")
    if start == -1 or end == -1:
        return "No narrative generated (RESPONSE=false)"
    return stdout[start+22:end].strip()
```

### Docker exec のタイムアウト

- Agent 実行時間: 平均 30-60s (phi3:mini)
- Gradio のタイムアウト設定を延長 (default 60s → 120s)

---

## 関連ドキュメント

- `reports/NARRATIVE_LOG_DESIGN.md` — Narrative log 全体構想
- `reports/RETURN_RESPONSE_DESIGN.md` — 帰還時応答生成の設計
- `phi-agent/doc/SETUP.md` — RESPONSE フラグの説明

---

## 2026-02-16: BroadcastRenderer 実装 + SNS 最適化

Narrative (LLM 生成) と並行して **Broadcast (決定的射影)** を出力。Phase 3 の SNS 配信の具体実装。

### 設計原則

- **純粋関数** — 同じ入力から常に同じ出力 (LLM 不介在、人間編集なし)
- **因果鎖**: Sphere データ → Agent 観測 → Broadcast テキスト
- **X/Twitter 互換** — 280 文字制限/post、スレッド形式

### 最終フォーマット (v1)

```
[scholar] query: "quantum physics"
5 cycles · 4 nodes · energy 8% · 87s
---
▸ Standard Model of Particle Physics
  h:7 w:8 d:4 [physics, quantum, particles]
▸ Schrödinger's Cat
  h:8 w:9 d:4 [quantum, thought-experiment, physics]
```

### SNS 最適化で削除したもの

| 項目 | 削除理由 |
|------|---------|
| nodeId | トレーサビリティだが SNS 読者には無意味 |
| flags hex / labels | 内部データ、SNS 向けではない |
| timestamp | X 投稿自体にタイムスタンプがある |
| evals 数 | nodes 数と重複、冗長 |

### 残したもの

| 項目 | 理由 |
|------|------|
| loadout 名 | どの種族が探索したか (キャラクター性) |
| query (50文字上限) | 何を探索したか |
| cycles / nodes | 探索規模 |
| energy % / duration | リソース消費 |
| summary (120文字上限) | ノードの内容 |
| h:w:d | 評価スコア |
| tags (3つまで) | カテゴリ |

### 変更ファイル

| ファイル | 変更 |
|---------|------|
| `phi-agent/src/broadcast-renderer.ts` | 新規 — renderBroadcast() + flagsToLabels() |
| `phi-agent/src/agent.ts` | encounters に flags 追加, broadcast 出力 (Step 5b) |
| `phi-agent/src/eval-log.ts` | NarrativeEntry に flags?, broadcast? 追加 |
| `explorers/parser.py` | extract_broadcast() 追加 |
| `explorers/app.py` | Broadcast パネル追加 |

### Docker Compose 同期

- phi-agent, explorers, periphery イメージをリビルド済み (2026-02-16)
- docker-compose.yml 自体の変更は不要

---

## 2026-02-16: Docker Compose 統一 — レガシースクリプト廃止

### 背景

プロジェクト初期はホスト直起動 (node, npx tsx) で開発していたが、サービスが成熟し Docker Compose が全サービスをカバーするようになったため、ホスト直起動スクリプトは **ポート競合の原因** かつ **混乱の元** になっていた。

### 変更

| ファイル | Before | After |
|---------|--------|-------|
| `sphere.bat` | ホスト直起動 (`npm run dev`, `npx tsx`) | **Docker Compose ラッパー** |
| `start-periphery.bat` | ホスト直 `node dist/index.js` | **削除** |
| `start-daemon.bat` | ホスト直 phi-agent daemon | **削除** |
| `test-single.bat` | ホスト直 phi-agent 単発テスト | **削除** |

### sphere.bat 新コマンド体系

| コマンド | 動作 |
|---------|------|
| `sphere up` | 全サービス起動 (`--profile agent`) |
| `sphere core` | コア (periphery + infra) のみ起動 |
| `sphere down` | 全停止 |
| `sphere build` | 全イメージリビルド |
| `sphere ps` | サービス状態表示 |
| `sphere logs [svc]` | ログ追跡 |
| `sphere batch` | テストデータ注入 (docker exec) |
| `sphere contribute N` | N 件注入 (docker exec) |
| `sphere wave [n] [ms]` | ウェーブ注入 |
| `sphere explore` | 3層探索 |
| `sphere full` | batch + explore |

### 方針

- **Docker Compose が唯一の起動手段** — ホスト直起動は非推奨
- generation data は `sphere-phi-agent-data` volume で永続化
- コード変更後は `sphere build` でイメージ更新

---

*Last updated: 2026-02-16*
