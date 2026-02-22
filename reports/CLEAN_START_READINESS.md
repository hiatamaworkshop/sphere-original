# Clean Start Readiness — Operational Assessment

**Date**: 2026-02-17
**Status**: Ready (with notes)

---

## Overview

Generation data をゼロからやり直す準備状況の評価。
`sphere reset` コマンドの実装と、既存 API パスの確認を実施。

---

## 1. sphere.bat reset コマンド (NEW)

`sphere reset` でゼロスタートが 1 コマンドで可能。

**動作**:
1. 現行データを `phi-agent/data/archive/YYYYMMDD-HHMMSS/` にバックアップ
2. `eval-log.jsonl` → 空
3. `species-profile.json` → empty template
4. `generations/gen-*.json` → archive に退避後クリア
5. `narrative-log.jsonl` → 空

**確認プロンプトあり** (y/N)。誤操作防止。

---

## 2. テーマ特化データ投入パス (既存)

新規実装不要。以下のパスが既に使える。

### Direct API (推奨: テーマ特化データ投入)

```
POST http://localhost:3001/sphere/contribute
Content-Type: application/json

{
  "source": "art_museum_db",
  "capsule": {
    "schemaVersion": 4,
    "topTier": [],
    "normalNodes": [
      {
        "tags": ["renaissance", "painting", "sfumato"],
        "summary": "Sfumato technique in Renaissance art",
        "content": "Leonardo da Vinci pioneered..."
      }
    ],
    "ghostNodes": [],
    "evaluations": [],
    "timestamp": 1708165200000
  }
}
```

Rate limit: 10/min。batch モード (`"batch": true, "capsules": [...]`) も対応。

### Pool Service (品質ゲート経由)

```
POST http://localhost:4000/ingest       # 単件
POST http://localhost:4000/ingest/batch  # バッチ
```

LLM (Scorer A) による authority/novelty/coherence 評価 → coherence < 0.3 は reject → 通過分のみ Sphere に contribute。

### Mock Data (開発用)

```
sphere batch           # mock_data.json から全件注入 (33 nodes)
sphere contribute N    # N 件ランダム注入
sphere wave [n] [ms]   # ウェーブ注入
```

### NodeSeed Format (Required fields)

| Field | Required | Description |
|-------|----------|-------------|
| `tags` | YES | Keywords (5-10 recommended) |
| `summary` | YES | Brief description (50-500 chars) |
| `content` | no | Detailed content |
| `ref_url` | no | External reference |
| `flags` | no | 16-bit node flags |

---

## 3. データ出力フォーマット (R/外部ツール向け)

### eval-log.jsonl

```jsonl
{"loadout":"scout","model":"phi3:mini","query":"...","timestamp":1770950663220,"duration":95205,"evaluations":[{"nodeId":"...","h":9,"w":8,"d":7,"tags":["..."]}],"configHash":"..."}
```

- JSONL 形式。`pd.read_json(lines=True)` / `jsonlite::stream_in()` で読める
- `evaluations` は配列 → unnest 必要
- Reset 後はスキーマ統一 (query/duration 含む)

### species-profile.json

- Species 単位で avgH/avgW/avgD, hotNodes, commonTags, evaluationConsistency
- 各世代の snapshot が `generations/gen-NNN.json` に保存

### narrative-log.jsonl

- narrative (LLM テキスト), encounters, feelings (satisfaction/frustration/stamina)
- Broadcast 出力は stdout のみ (ファイル蓄積は eval-log の broadcast? フィールド)

### Timestamp 混在

| Source | Format |
|--------|--------|
| eval-log, narrative-log | Unix ms (e.g., `1770950663220`) |
| generations, species-profile | ISO-8601 (e.g., `"2026-02-09T07:10:35.959Z"`) |

外部ツール側で吸収可能。統一は将来検討。

---

## 4. ゼロスタート手順

```
1. sphere reset              # データバックアップ + リセット
2. sphere up                 # 全サービス起動
3. sphere batch              # 初期データ注入 (or テーマ特化 JSON を curl)
4. (phi-agent daemon が自動探索開始)
5. (3 時間ごとに Digestor が世代処理)
6. sphere logs phi-agent     # 進行確認
```

---

## 5. 既知の注意点

| 項目 | 状態 | 備考 |
|------|------|------|
| Docker Compose 全サービス | Ready | health check + restart policy 設定済み |
| phi-agent daemon | Ready | query pool 19 種ローテーション、error recovery |
| Digestor 世代処理 | Ready | 3h 間隔自動、ONCE=1 で手動も可 |
| Volume 永続化 | Ready | phi-agent-data を 4 サービスで共有 |
| Reset コマンド | Ready | archive + 確認プロンプト |
| テーマ特化データ投入 | Ready | JSON 準備のみ必要 |
| 蓄積結果の可視化 | Partial | Explorers UI に基本あり、詳細分析は R 等で外部処理 |

---

*Last updated: 2026-02-17*
