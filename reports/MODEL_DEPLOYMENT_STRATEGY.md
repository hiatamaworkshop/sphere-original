# Model Deployment Strategy — Sphere Ecosystem

**日付**: 2026-02-09
**ステータス**: 検証完了、デプロイ推奨案確定

---

## 概要

Sphere エコシステムにおける LLM の役割は **感覚器官** である。エージェントは環境（Sphere）を読み書きする器官であり、知性は Sphere 側に蓄積される（痕跡協調モデル）。本レポートは、0.36B から 3.8B までの 5 モデルを比較検証し、デプロイ戦略を提案する。

---

## 検証結果サマリー

### テスト対象モデル (5 models)

| モデル | パラメータ | シリーズ | テスト期間 | セッション数 | 評価数 |
|--------|-----------|---------|-----------|------------|-------|
| smollm2:360m | 0.36B | SmolLM2 | ~4 min | 29 | 87 |
| qwen2.5:0.5b | 0.5B | Qwen2.5 | ~18 min | 54 | 168 |
| llama3.2:1b | 1.2B | Llama3.2 | ~13 min | 29 | 128 |
| qwen2.5:1.5b | 1.5B | Qwen2.5 | ~19 min | 25 | 100 |
| gemma2:2b | 2B | Gemma2 | ~16 min | 20 | 77 |
| **phi3:mini** | **3.8B** | **Phi3** | **ベースライン** | **59** | **~180** |

**テスト方法**: daemon mode, 3 agents (wanderer, moth, hermit), LOADOUT=random, OLLAMA_MODEL 切替, eval-log.jsonl を空にして純粋比較。

---

## 核心的発見: 測定 vs スタンプ

LLM の評価能力は2つのパターンに分類される:

### 測定 (Measurement)

LLM がコンテンツを読み、evalFocus のレンズで知覚し、**異なる値を出力** → 意味のある痕跡。

**特徴**:
- 種族間でスコア分布が異なる (range > 0.5pt)
- 同じ種族でもコンテンツによってスコアが変動 (std > 0)
- evalFocus の指示に応じて値が変わる

**例**: phi3:mini, llama3.2:1b

### スタンプ (Stamp)

LLM がコンテンツを無視し、**定型値を出力** → ノイズ (壊れた温度計)。

**特徴**:
- 種族間でスコア差がない or 最小限 (range < 0.5pt)
- 同じ種族では常に同じ値 (std = 0)
- evalFocus を無視する

**例**: qwen2.5:0.5b (全種族 h≈8, w≈7)

### キャリブレーション済みスタンプ (Calibrated Stamp)

evalFocus を理解し、**種族ごとに異なる固定値** を返す。測定ではないが、賢いスタンプ。

**特徴**:
- 種族間でスコア差がある (range > 2pt)
- 同じ種族では常に同じ値 (std = 0)
- evalFocus に基づいた種族分類は正しい

**例**: gemma2:2b (moth=8, wanderer=6, hermit=5 — h 固定)

---

## モデル比較: 総括表

| モデル | h 測定 | w 測定 | 速度 | Bus | 判定 | 用途適合性 |
|--------|--------|--------|------|-----|------|-----------|
| **smollm2:360m** | **完全固定** h=8 (std=0.0) | **完全固定** w=7 (std=0.0) | 15s | 有（無意味） | **完全盲目** | ❌ 不適格 |
| **qwen2.5:0.5b** | スタンプ h≈8 | スタンプ w≈7 | 33s | 有 | **盲目** | ❌ 不適格 |
| **qwen2.5:1.5b** | スタンプ h=5 | **測定** w range 1.3pt | 64s | 無 | **片目** | △ 限定的 |
| **llama3.2:1b** | **測定** h range 0.9pt | **測定** w range 1.0pt | 58s | 無 | **両目（弱）** | ✅ 適格 |
| **gemma2:2b** | **種族固定** h range 3.0pt | **測定** w range 3.1pt | 22s | moth のみ | **片目+賢スタンプ** | ✅ 適格 |
| **phi3:mini** | **測定** h range 2.0pt | **測定** w range 3.3pt | 60s | 有 | **両目（強）** | ✅ 最適 |

---

## 詳細分析

### 1. smollm2:360m (0.36B) — 完全盲目

**結果**:
- 全 87 評価が **h=8, w=7, d=4 の固定値** (stdH=0.0, stdW=0.0, stdD=0.0)
- 速度異常 (15s = 推論せず即答)
- qwen2.5:0.5b より悪化

**判定**: ❌ **不適格** — 0.5B より小さいモデルは instruction following が機能しない。

---

### 2. qwen2.5:0.5b (0.5B) — 盲目

**結果**:
- 全種族 h≈8, w≈7 に収束 (range h=0.2pt, w=0.4pt)
- phi3:mini の **10x-20x 縮小**
- 速度優秀 (33s, 47%高速)
- Bus 有効 (h>=8) だが全種族同値で無意味

**判定**: ❌ **不適格** — evalFocus を完全無視。種族性なし。

---

### 3. qwen2.5:1.5b (1.5B) — 片目

**結果**:
- h=5 固定 (スタンプ)
- w 測定可能 (range 1.3pt, moth w=5.4 最低, balanced w=6.7 最高)
- 速度遅い (64s)
- Bus 不能 (h<8)

**判定**: △ **限定的** — w 測定のみ可能。h スタンプ。Digestor には機能するが推奨しない。

---

### 4. llama3.2:1b (1.2B) — 両目（弱）

**結果**:
- **h, w 両方で測定可能** (range h=0.9pt, w=1.0pt)
- moth h=2.9 最高、hermit w=2.1 最高 — evalFocus に応答
- 速度良好 (58s, phi3:mini と同等)
- Bus 不能 (h<8, 最大 h=7)

**判定**: ✅ **適格** — 両次元測定可能。軽量 (1.2B = ~670MB)。**内部評価専用として最適**。

---

### 5. gemma2:2b (2B) — 片目 + 賢いスタンプ

**結果**:
- h: 種族固有の固定値 (moth=8, wanderer=6, hermit=5) — **種族認識スタンプ**
- w: 測定可能 (range 3.1pt) — **phi3:mini と同等**
- 速度: **超高速** (平均 22s, moth は 12s) — **63% 高速**
- Bus: moth のみ可能

**判定**: ✅ **適格** — w 測定が強力。速度最速。**外部応答用として最適**。

---

### 6. phi3:mini (3.8B) — 両目（強）

**結果**:
- h, w 両方で測定可能 (range h=2.0pt, w=3.3pt)
- 全種族 Bus 通信可能
- 速度標準 (60s)

**判定**: ✅ **最適** — 全項目で最高品質。ベースライン。

---

## シリーズ別の傾向

| シリーズ | 測定能力 | 判定 |
|---------|---------|------|
| **Llama** (Meta) | 1.2B で両次元測定可能 | ✅ **唯一の実用可能シリーズ** |
| **Qwen** (Alibaba) | 0.5B/1.5B ともにスタンプ傾向 | ❌ 不適格 |
| **SmolLM** (HuggingFace) | 0.36B で完全固定 | ❌ 不適格 |
| **Gemma** (Google) | 2B で w 測定可能、h スタンプ | ✅ 速度優秀 |
| **Phi** (Microsoft) | 3.8B で両次元測定可能 | ✅ 最高品質 |

**結論**: 軽量化なら **Llama** 一択。速度と品質のバランスなら **Gemma**。最高品質なら **Phi**。

---

## 役割分担アーキテクチャ

Sphere エコシステムは2つの異なる役割を持つ:

### 1. **内部評価専用** — Sphere 内部の常駐エージェント

**役割**:
- sense() → evaluate() → Digestor フィードバックループ
- ノード評価、種族記憶形成
- 24/7 常駐で内部スフィアを育てる

**要求仕様**:
- ✅ 両次元測定可能 (h, w の種族差が必要)
- ✅ 軽量 (常駐してもリソース消費が少ない)
- ❌ 推論能力は不要 (外部応答しない)
- ❌ Bus 通信は optional

**推奨モデル**: **llama3.2:1b (1.2B)**

| 項目 | 評価 | 理由 |
|------|------|------|
| 測定能力 | ✅ | h range 0.9pt, w range 1.0pt — 両次元測定可能 |
| 軽量性 | ✅ | 1.2B = ~670MB, メモリ消費少 |
| 速度 | ✅ | 58s/session, phi3:mini と同等 |
| Bus | △ | 不可 (h<8) — 内部評価では不要 |

---

### 2. **外部応答用** — pool-service / 外部委託クエリ対応

**役割**:
- 外部からの依頼 (「このトピックについて調べて」) に対応
- Sphere を検索 → 知識を統合 → **推論して回答を生成**
- アウトプット: レポート、要約、回答文 (evaluations ではなく)

**要求仕様**:
- ✅ 推論能力が高い (要約、質問応答、レポート生成)
- ✅ 速度が速い (外部クエリへのレスポンス重視)
- △ 測定能力 (w 測定があれば Digestor に貢献)
- ❌ 両次元測定は不要 (外部応答が主目的)

**推奨モデル**: **gemma2:2b (2B)** または **phi3:mini (3.8B)**

| モデル | 推論能力 | 速度 | 測定能力 | 用途 |
|--------|---------|------|---------|------|
| **gemma2:2b** | 高 (Google instruction tuning) | **22s** (63%高速) | w 測定可能 (3.1pt) | **推奨** — 速度と品質のバランス |
| **phi3:mini** | 最高 | 60s (標準) | h,w 測定可能 | オプション — 最高品質重視 |

---

## 推奨デプロイ構成

### 構成 A: 分離型 (推奨)

```
┌─────────────────────────────────────────┐
│         Sphere Ecosystem                │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Internal Loop (24/7)           │   │
│  │  Model: llama3.2:1b (1.2B)     │   │
│  │  - sense() → evaluate()        │   │
│  │  - Digestor feedback           │   │
│  │  - 両次元測定、軽量常駐          │   │
│  │  - リソース: ~670MB RAM        │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  External Response (on-demand)  │   │
│  │  Model: gemma2:2b (2B)         │   │
│  │  - 外部クエリ受付 (pool-service)│   │
│  │  - 推論 + レポート生成           │   │
│  │  - 高速 (22s), w 測定可能       │   │
│  │  - リソース: ~1.3GB RAM        │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

**利点**:
- 内部ループは軽量で常駐可能
- 外部応答は高速で推論能力高
- 役割分離で最適化しやすい

**欠点**:
- 2つのモデルを管理する必要がある

---

### 構成 B: 単一型 (gemma2:2b 統一)

```
┌─────────────────────────────────────────┐
│         Sphere Ecosystem                │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Internal + External (共通)     │   │
│  │  Model: gemma2:2b (2B)         │   │
│  │  - 内部評価 (w 測定可能)        │   │
│  │  - 外部応答 (推論能力高)        │   │
│  │  - 高速 (22s)                  │   │
│  │  - リソース: ~1.3GB RAM        │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

**利点**:
- 単一モデルで管理が簡単
- w 測定可能で Digestor に貢献
- 速度が速い

**欠点**:
- h 測定不可 (固定値スタンプ)
- llama3.2:1b より重い (1.2B vs 2B)

---

### 構成 C: 最高品質型 (phi3:mini 統一)

```
┌─────────────────────────────────────────┐
│         Sphere Ecosystem                │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Internal + External (共通)     │   │
│  │  Model: phi3:mini (3.8B)       │   │
│  │  - 内部評価 (両次元測定可能)     │   │
│  │  - 外部応答 (最高推論能力)       │   │
│  │  - Bus 全種族対応               │   │
│  │  - リソース: ~2.5GB RAM        │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

**利点**:
- 最高品質 (両次元測定、Bus 通信)
- 単一モデルで管理が簡単

**欠点**:
- 速度が遅い (60s)
- リソース消費が大きい

---

## 推奨: 構成 A (分離型)

**理由**:
1. **内部ループの軽量化** — llama3.2:1b (1.2B) で常駐コスト最小化
2. **外部応答の高速化** — gemma2:2b (2B) で推論速度 2.7倍改善
3. **役割に最適化** — 内部は測定能力、外部は推論能力を重視
4. **Digestor との相性** — llama の両次元測定 + gemma の w 測定で十分なフィードバック

**デプロイ例** (Docker Compose):

```yaml
services:
  phi-agent-internal:
    image: phi-agent:latest
    environment:
      - DAEMON=true
      - LOADOUT=random
      - OLLAMA_MODEL=llama3.2:1b
      - SPHERE_URL=http://periphery:3001
      - SPHERE_WS=ws://periphery:3001
    volumes:
      - phi-agent-data:/app/data
    networks:
      - sphere-network

  phi-agent-external:
    image: phi-agent:latest
    environment:
      - DAEMON=false  # on-demand
      - OLLAMA_MODEL=gemma2:2b
      - SPHERE_URL=http://periphery:3001
      - SPHERE_WS=ws://periphery:3001
    volumes:
      - phi-agent-data:/app/data
    networks:
      - sphere-network
```

---

## ライセンス比較

| モデル | ライセンス | 商用利用 | 規模制限 | 再配布 |
|--------|-----------|---------|---------|--------|
| llama3.2:1b | Llama 3 Community License | ✅ | MAU 7億未満 | ✅ |
| gemma2:2b | Gemma Terms of Use | ✅ | **制限なし** | ✅ |
| phi3:mini | MIT License | ✅ | 制限なし | ✅ |

**全モデル商用利用可能**。llama のみ大規模サービス (MAU 7億超) で追加ライセンス必要。

---

## Digestor との相性

### llama3.2:1b (内部専用)

**Digestor への貢献**:
- ✅ h, w 両方で測定可能 → **h × w スコアリング** に有効
- ✅ 種族差が明確 (moth h=2.9, hermit w=2.1) → 種族プロファイル形成
- ✅ 時間経過で species-profile.json が精緻化

**フィードバックループ**:
1. llama が evaluations を記録 → eval-log.jsonl
2. Digestor が代謝 → species-profile.json
3. llama が profile を読み込み → ノード選択が偏る
4. 偏ったノードを評価 → 新しい痕跡を残す

→ **正のフィードバック** — 種族性が強化される。

---

### gemma2:2b (外部応答、副次的に内部評価も)

**Digestor への貢献**:
- △ h は固定値 → スコアリングへの貢献は限定的
- ✅ w 測定が強い (range 3.1pt) → **w の多様性で十分**
- ✅ Digestor は h × w でスコアリング → h 固定でも w の変動で機能

**フィードバックループ**:
1. gemma が evaluations を記録 (h 固定、w 測定)
2. Digestor が代謝 → w の分布から種族プロファイル生成
3. gemma が profile を読み込み → ノード選択が偏る (w 重視)
4. 偏ったノードを評価 → w の痕跡を残す

→ **限定的フィードバック** — w 軸のみで種族性が形成される。

---

## アウトプットの違い

| レイヤー | 入力 | 処理 | 出力 | モデル |
|---------|------|------|------|--------|
| **内部評価** | ノードコンテンツ | evalFocus で測定 | **evaluations** (h, w, d) | llama3.2:1b |
| **外部応答** | 外部クエリ | Sphere 検索 + 推論 | **レポート/回答** (自然言語) | gemma2:2b |

内部評価は **痕跡 (evaluations)** を残すだけ。外部応答は **推論結果** を返す。

---

## 外部アクセスパターン C (委託) との対応

MEMORY.md の「外部アクセス 3パターン」の **C: 委託** に対応:

> **C: 委託** — 外部は依頼のみ、Sphere が内部で全実行 (推奨パターン)

**フロー**:
1. 外部: 「トピック X について調べて」(依頼のみ)
2. Sphere: gemma2:2b が内部で検索 → 推論 → レポート生成
3. 外部: レポートを受け取る

**利点**:
- フォーマット問題消滅 — 外部は JSON パースも evaluations も不要
- Judgment Daemon 構造と一致 — Sphere が知性を担う
- pool-service と対称 — 外部からの入力を内部で処理

---

## デプロイ時の考慮事項

### 1. リソース要件

| 構成 | RAM (推定) | ディスク | 備考 |
|------|-----------|---------|------|
| A (分離型) | ~2.0GB | ~1.5GB | llama (670MB) + gemma (1.3GB) |
| B (gemma 統一) | ~1.3GB | ~1.3GB | gemma のみ |
| C (phi3 統一) | ~2.5GB | ~2.3GB | phi3 のみ |

**推奨**: 構成 A (分離型) — リソース効率と機能のバランス最良。

---

### 2. 速度比較

| 構成 | 内部評価速度 | 外部応答速度 | 総合判定 |
|------|------------|------------|---------|
| A (分離型) | 58s (llama) | **22s (gemma)** | ✅ 外部応答高速 |
| B (gemma 統一) | **22s (gemma)** | **22s (gemma)** | ✅ 全体高速 |
| C (phi3 統一) | 60s (phi3) | 60s (phi3) | △ 標準速度 |

**推奨**: 構成 A または B — 速度優先ならどちらも優秀。

---

### 3. モデル切替の容易性

**環境変数のみで切替可能**:

```bash
# llama3.2:1b に切替
export OLLAMA_MODEL=llama3.2:1b

# gemma2:2b に切替
export OLLAMA_MODEL=gemma2:2b

# phi3:mini に切替
export OLLAMA_MODEL=phi3:mini
```

**Docker Compose での切替**:

```yaml
environment:
  - OLLAMA_MODEL=${OLLAMA_MODEL:-llama3.2:1b}
```

```bash
# 起動時にモデル指定
OLLAMA_MODEL=gemma2:2b docker compose up
```

---

## 今後の検討事項

### 1. モデル別 Calibration (将来)

Digestor の `model` field を活用し、モデルごとに異なるスコアリング閾値を設定:

```typescript
// digestor/src/scoring.ts (将来構想)
const calibration = {
  'llama3.2:1b': { hScale: 1.5, wScale: 1.5 },  // 低スコア傾向を補正
  'gemma2:2b': { hScale: 0.8, wScale: 0.8 },    // 高スコア傾向を補正
  'phi3:mini': { hScale: 1.0, wScale: 1.0 },    // ベースライン
};
```

---

### 2. ハイブリッドモデル構成

**構成 D: 3モデル型** (内部 = llama, 外部 = gemma + phi3):

```yaml
phi-agent-internal:
  environment:
    - OLLAMA_MODEL=llama3.2:1b  # 軽量、両次元測定

phi-agent-external-fast:
  environment:
    - OLLAMA_MODEL=gemma2:2b  # 高速応答

phi-agent-external-quality:
  environment:
    - OLLAMA_MODEL=phi3:mini  # 高品質応答
```

**用途**:
- 簡易クエリ → gemma2:2b (22s)
- 複雑クエリ → phi3:mini (60s, 高品質)

---

### 3. ActiveBus payload 設計

gemma2:2b の moth は Bus emit 可能 (h=8)。将来的に Bus payload を LLM 生成 64byte fragment に拡張:

```typescript
// 評価 prompt に bus fragment 生成を追加
const evalPrompt = `
  ${evalFocus}

  If h >= 8, also generate a 64-byte "scent" fragment to emit on the Bus.
  This fragment should capture the essence of why this node is HOT.
`;
```

→ 言語が種族を作る — 器 (64byte) を用意するだけで種族性が創発する。

---

## まとめ

### 検証結果

1. **測定 vs スタンプ** — LLM の evalFocus 応答能力を2つのパターンで分類
2. **llama series のみ実用可能** — qwen/smollm は同サイズで不適格
3. **1.2B が最小サイズ** — 両次元測定には 1.2B 以上が必要 (0.5B 以下は盲目)
4. **gemma2:2b は速度と w 測定のバランス最良** — 外部応答用として最適

---

### 推奨デプロイ戦略

**構成 A (分離型)** を推奨:

| 役割 | モデル | 理由 |
|------|--------|------|
| **内部評価専用** | **llama3.2:1b (1.2B)** | 軽量、両次元測定可能、常駐向き |
| **外部応答用** | **gemma2:2b (2B)** | 高速 (63% faster)、w 測定可能、推論能力高 |

**代替構成**:
- 単一モデル運用 → **gemma2:2b** (速度と管理の簡便性)
- 最高品質重視 → **phi3:mini** (両次元測定、Bus 全種族対応)

---

### ライセンス

**全モデル商用利用可能**。デプロイ制約なし (llama のみ MAU 7億超で要追加ライセンス)。

---

**最終更新**: 2026-02-09
**関連ドキュメント**:
- `phi-agent/data/test-results/test-<model-name>/summary.md` — 各モデルの詳細結果
- `phi-agent/data/test-results/TEST_PROTOCOL.md` — テスト手順
- `reports/EMERGENT_PERSONALITY_MEMO.md` — 性格創発の原理
- `reports/STIGMERGY_ARCHITECTURE.md` — Sphere の痕跡協調モデル
- `reports/SPECIES_MEMORY_METABOLISM_DESIGN.md` — Digestor 設計
