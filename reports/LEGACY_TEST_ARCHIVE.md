# Legacy Test Scripts — Archive & Methodology Memo

> **アーカイブ**: 削除済みスクリプトの記録。最新の手順は [TEST_PROCEDURES.md](TEST_PROCEDURES.md) を参照。

**Date**: 2026-02-16
**Status**: アーカイブ (元ファイルは削除済み)

---

## 概要

Docker Compose 統一に伴い、ホスト直起動前提のテストスクリプト (`.ps1`, `.sh`, `.js`, `.mjs`) を削除。
以下は削除前に抽出した **再利用可能なテスト方法論とデータ** のまとめ。

---

## 削除ファイル一覧

### プロジェクトルート (6 files)
| ファイル | 内容 |
|---------|------|
| `test-flags.js` | Flag システム動作確認 (16-bit flag → label 変換) |
| `test-websocket.mjs` | WebSocket 接続テスト (dive ticket → sense → getField → return) |
| `test-ab-species-memory.sh` | Species Memory A/B テスト (6 species × 2 phases) |
| `test-llama-1b.ps1` | llama3.2:1b 速度テスト |
| `test-phi3-mini.ps1` | phi3:mini 速度テスト |
| `test-single-agent.ps1` | 単発エージェントテスト |

### phi-agent/ (約 34 files)
| パターン | 数 | 内容 |
|---------|---|------|
| `test-*-once.ps1` | 4 | 単発テスト (balanced, hermit, moth, scholar) |
| `test-*-heat.ps1` | 3 | Heat 指向クエリテスト |
| `test-*-weight.ps1` | 3 | Weight 指向クエリテスト |
| `test-moth-*.ps1` | 10 | Moth 種族の各モデル比較 |
| `test-baseline-*.ps1` | 4 | Species memory ベースライン測定 |
| `test-scout-*.ps1` | 4 | Scout progressive A/B テスト |
| `test-qwen15-*.ps1` | 8 | Qwen 2.5:1.5b 評価パターンテスト |
| `test-gemma2-*.ps1` | 1 | Multi-loadout 比較 |
| `test-clean-baseline.ps1` | 1 | Gen-003 ベースライン強化 |
| `test-*.log` | 4 | テスト出力ログ |

---

## 保存すべきテスト方法論

### 1. Progressive A/B Species Memory テスト

**元ファイル**: `test-scout-stage1-nothing.ps1`, `test-scout-stage2-gen002.ps1`, `test-scout-gemma-gen004.ps1`

**方法**:
```
Stage 1: species-profile.json を除去 → memory なしでベースライン取得
Stage 2: gen-002 の profile を復元 → 弱い memory (6 evals) の影響を測定
Stage 3: gen-004 の profile → 蓄積された memory (39 evals) の影響を測定
```

**発見**: Scout の h=7 固着が gen-004 で再発。gen-005 clean baseline で改善を試みた。

**Docker Compose 移植案**:
```bash
# Stage 1: memory なし
docker compose exec phi-agent sh -c "mv /app/data/species-profile.json /tmp/ 2>/dev/null; LOADOUT=scout node /app/dist/index.js 'breaking news trending viral'"
# Stage 2: memory あり
docker compose exec phi-agent sh -c "mv /tmp/species-profile.json /app/data/ 2>/dev/null; LOADOUT=scout node /app/dist/index.js 'breaking news trending viral'"
```

### 2. Cross-Model Species Memory 影響テスト

**元ファイル**: `test-baseline-sniper-llama.ps1`, `test-baseline-sniper-gemma.ps1`

**方法**: Model A (phi3:mini) で蓄積した species memory が Model B (llama/gemma) の出力に影響するか検証。

**発見**:
- phi3:mini で d_avg=6.0 → llama の d 出力に影響あり
- Species memory は model-agnostic に作用する（部分的に）

### 3. LONGEVITY スケール反転

**元ファイル**: `test-qwen15-longevity.ps1`

**方法**: Decay の代わりに LONGEVITY (0=ephemeral, 10=permanent) で評価させ、バックエンドで `decay = 10 - longevity` に変換。

**狙い**: LLM の意味的混乱を解消
```
Before: "short decay time" → LLM が low number を出力 → 実際には長寿命 (誤り)
After:  "long-lasting"    → longevity=8              → decay=2 (正しい)
```

**ステータス**: アイディアのみ。本実装には未反映。

### 4. 3-Step Sequential Dimension Evaluation

**元ファイル**: `test-qwen15-3step-1session.ps1`, `test-qwen15-hermit-3step.ps1`

**方法**: h, w, d を同時ではなく順次評価させる。各次元間に PAUSE を入れる。

**発見**:
- qwen2.5:1.5b で h=10 固着が頻発
- 3-step にしても固着は改善しなかった
- Hermit では h/w が交互パターン (h=5/w=10, h=10/w=5) を示した

### 5. Cross-Query Consistency テスト

**元ファイル**: `test-qwen15-hermit-3step-2sessions.ps1`

**方法**: 同じ species/model で異なるクエリを投入し、評価スコアの一貫性を検証。

**発見**: Session 2 ("established scientific theories") は Session 1 ("timeless philosophical principles") よりスコア一貫性が高かった。

### 6. WebSocket プロトコルテスト

**元ファイル**: `test-websocket.mjs`

**フロー**:
```
POST /dive/request → ticket 取得
WS connect (token) → session_start
→ sense (radius: 0.5) → sense_result (nodes)
→ getField → field_result (intensity, volatility)
→ return → session_end
```

**Docker Compose 移植案**:
```bash
# コンテナ内から WebSocket テスト
docker compose exec phi-agent node -e "
  const ws = new (require('ws'))('ws://periphery:3001?token=...');
  // ... (ticket は別途 curl で取得)
"
```

---

## テスト用クエリカタログ

### Heat 指向 (moth, scout 向け)
- `trending viral discussions`
- `trending viral content`
- `breaking news trending viral`

### Weight 指向 (hermit, sniper 向け)
- `established authoritative knowledge`
- `established scientific theories`
- `lasting fundamental patterns`
- `deep knowledge fundamental principles`

### Balanced
- `knowledge exploration`
- `fundamental mathematics`
- `fundamental mathematical concepts`
- `timeless philosophical principles`

### A/B テスト用
- `psychology` (全 species 共通クエリ)

---

## Species ベースラインデータ (gen-002 ~ gen-005 時点)

| Species | Evals | h_avg | w_avg | d_avg | 特性 |
|---------|-------|-------|-------|-------|------|
| moth | 108 | 6.7 | 6.2 | 4.1 | heat-focused, walk: hot, minCycles: 3 |
| hermit | ~19 | — | — | — | weight-focused, walk: deep, minCycles: 4 |
| sniper | 6 | 5.4 | 4.9 | 4.6 | decay-focused (d=0.7), stability seeker |
| scout | 17 | 6.55 | 5.01 | 4.06 | heat-focused (h=0.5), frustration-driven |
| balanced | — | — | — | — | standard balanced |
| scholar | — | — | — | — | テストデータ少 |

---

## モデル別の知見

| Model | 特徴 |
|-------|------|
| `phi3:mini` | 安定。h/w/d のレンジが適度。推奨ベースライン model |
| `gemma2:2b` | word examples + 2-step analysis パターン。h 固着傾向あり |
| `llama3.2:1b` | h,w measurable (range ~1pt), d fixed 傾向 |
| `qwen2.5:1.5b` | h=10 固着が頻発。JSON パース失敗も多い。要注意 |

---

---

## 追加削除ファイル (Phase 2)

### ホスト直起動スクリプト (8 files)
| ファイル | 内容 |
|---------|------|
| `run-r1-phi3.ps1` | Round 1 daemon: scout, hunter, archivist, sniper × phi3:mini |
| `run-r2-phi3.ps1` | Round 2 daemon: moth, balanced, scholar, wanderer × phi3:mini |
| `run-r3-phi3.ps1` | Round 3 (DEPRECATED — R1+R2 に統合済み) |
| `run-r1-test.ps1` | Round 1 test: balanced, scholar, scout × llama3.2:1b |
| `run-chk.ps1` | Lower-model verification sandbox (gemma/qwen) |
| `inject-mock-wave.ps1` | Mock data REST API 注入 (/api/wave) |
| `run-digestor.ps1` | Digestor daemon (ホスト直) |
| `run-digestor-once.ps1` | Digestor one-shot (ホスト直) |

### 旧ホスト直起動 CLI
| ファイル | 内容 |
|---------|------|
| `sphere.sh` | 旧 Unix CLI (ホスト直起動、sphere.bat Docker Compose 版に置換) |

### データファイル
| ファイル | 内容 |
|---------|------|
| `test-ab-output/` (12 files) | A/B Species Memory テスト出力 |
| `phi-agent/data/eval-log-backup-*.jsonl` (3) | eval-log バックアップ |
| `phi-agent/data/eval-log-docker*.jsonl` (2) | Docker 版 eval-log |
| `phi-agent/data/eval-log-experiment.jsonl` | 実験用 eval-log |
| `phi-agent/data/eval-log-gemma2b-test.jsonl` | Gemma2B テスト |
| `phi-agent/data/eval-log-test-*.jsonl` (2) | テスト用 eval-log |
| `phi-agent/data/eval-log-baseline-gen2.jsonl` | Gen-2 ベースライン |
| `phi-agent/data/species-profile*.bak` (2) | プロファイルバックアップ |
| `phi-agent/data/test-results/` (全体) | モデル比較テスト結果 |
| `docker_compose_sphere_v1/periphery.log` | 空ログ |
| `docker_compose_sphere_v1/services/periphery/server.log` | 空ログ |

---

## 追加保存すべき方法論

### 7. Round 制マルチエージェント並列テスト

**元ファイル**: `run-r1-phi3.ps1`, `run-r2-phi3.ps1`

**構成**:
```
Round 1: scout, hunter, archivist, sniper (活発2 + 静寂2)
Round 2: moth, balanced, scholar, wanderer (活発1 + 中庸1 + 静寂2)
→ 全8種族を 2 Round でカバー
```

**3-Phase アーキテクチャ**:
```
Phase 1: 4 agents × 5 min (既存ノードで探索)
Phase 2: Wave inject (50 items 追加)
Phase 3: 4 agents × 10 min (新ノード含めて再探索)
→ 新旧ノード混在環境での種族行動比較
```

**モニタリング**: eval-log.jsonl の行数を 60 秒間隔で表示。
終了後は直近 3 エントリを JSON パースして loadout/timestamp/eval数 を表示。

**Docker Compose 移植案**:
```bash
# sphere.bat に "round" コマンドとして統合可能
# Round 1 相当
sphere batch                          # Phase 2 相当
docker compose exec phi-agent sh -c "LOADOUT=scout OLLAMA_MODEL=phi3:mini node /app/dist/index.js --daemon --sleep 30000"
```

### 8. 検証用サンドボックス (EVALUATE='fake' モード)

**元ファイル**: `run-chk.ps1`

**特殊環境変数**:
```
EVALUATE='fake'           — 評価をスキップ (構造テスト用)
SYSTEM_PROMPT='...'       — カスタムシステムプロンプト注入
OLLAMA_OPTIONS='{"num_predict": 128, "temperature": 0.4}' — モデルパラメータ調整
```

**安全策**: テスト前に eval-log.jsonl を退避 → テスト後に復元。

### 9. REST API 直接注入

**元ファイル**: `inject-mock-wave.ps1`

**方法**: mock_data.json を読み込み、`POST /api/wave` で 1 件ずつ注入。
Contribution.js batch と異なり、任意の JSON ペイロードを直接注入可能。

---

*Archived: 2026-02-16 (Updated)*
