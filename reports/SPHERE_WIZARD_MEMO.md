# Sphere Wizard Design Memo

Sphere Project - 大規模データ処理ツール設計メモ

---

## 1. 概要

Sphere初期化・マージ・アップグレードのための**オフラインバッチ処理ツール**。
Periphery (HTTP API) とは別レイヤーで動作する。

### 1.1 設計思想

**Sphereは本質的にDBである。**

人類が洗練させたDB管理作法を学習し、Sphere設計に活かす:
- GitHub: Fork/Merge戦略、ブランチ管理
- DB: Transaction、Migration、整合性制約
- Cloud Storage: ETL、バージョニング、レプリケーション

### 1.2 計算資源の分離原則

```
┌─────────────────────────────────────────────────────────────┐
│  外部サービス群（重い計算を担当）                             │
│  - Sphereの計算資源を汚さない                                │
│  - 検証・変換・統合判定を外部で完結                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
                    検証済みデータのみ
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Sphere（純粋な保管庫）                                      │
│  - 代謝・評価・探索に専念                                    │
│  - 重い計算は行わない                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 用途

| 用途 | 説明 |
|------|------|
| 初期化 | 新Sphereの初期データ投入 |
| マージ | Sphere A + Sphere B → 新Sphere |
| アップグレード | Embedding Model変更時の全再計算 |
| マイグレーション | データ形式変更時の変換処理 |

---

## 3. Peripheryとの責務分離

```
┌─────────────────────────────────────────────────────────────┐
│  Periphery (HTTP API)                                        │
│  - 小〜中規模データ                                          │
│  - リアルタイム処理                                          │
│  - POST /sphere/contribute                                   │
│  - NodeSeed → Pipeline → SphereNode                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Sphere Wizard (CLI/Job)                                     │
│  - 大規模データ                                              │
│  - オフライン・バッチ処理                                    │
│  - 外部サービス連携（座標付与済み）                          │
│  - SphereNode（完成形） → DB直接投入                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 処理フロー

### 4.1 ウィザードステップ

```
┌─────────────────────────────────────────────────────────────┐
│  Sphere Wizard                                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Step 1] 設定取得 ─────────────────────── 💾 Savepoint 1   │
│    - ターゲットSphereの /schema 取得                         │
│    - Embedding Model 選定・ダウンロード                       │
│    - 入力データ形式検証                                      │
│    - 互換性チェック                                          │
│                                                              │
│  [Step 2] ベクトル化バッチ ─────────────── 💾 Savepoint 2   │
│    - 全データ Embedding 処理（長時間）                        │
│    - チャンク単位で進捗保存                                   │
│    - 失敗時は再開可能                                        │
│    - → ProjectionDB 生成                                     │
│                                                              │
│  [Step 3] 参照データ統合 ──────────────── 💾 Savepoint 3   │
│    - ReferenceDB 構築                                        │
│    - Relic Data 配置（不変の真実）                           │
│    - メタデータ付与                                          │
│    - → {referenceDB, projectionDB} セット完成                │
│                                                              │
│  [Step 4] Bookkeeper統合 ──────────────── 💾 Savepoint 4   │
│    - Sphere Data → Bookkeeper                                │
│    - 整合性チェック                                          │
│    - 新バージョン準備                                        │
│                                                              │
│  [Step 5] デプロイ ────────────────────── ✅ Complete       │
│    - 新ProjectionDBをアクティブ化                            │
│    - 旧データのアーカイブ（ロールバック用）                   │
│    - 完了通知                                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Savepoint設計

各ステップ完了時に状態を永続化し、障害時に再開可能にする。

```typescript
interface WizardState {
  jobId: string;
  step: 1 | 2 | 3 | 4 | 5;
  status: "running" | "paused" | "failed" | "completed";

  // Step 1 results
  config?: {
    targetSchema: SchemaSpec;
    embeddingModel: string;
    inputFormat: string;
  };

  // Step 2 results
  vectorization?: {
    totalItems: number;
    processedItems: number;
    projectionDBPath: string;
  };

  // Step 3 results
  integration?: {
    referenceDBPath: string;
    relicCount: number;
    metadataApplied: boolean;
  };

  // Step 4 results
  bookkeeper?: {
    validated: boolean;
    newVersion: string;
  };

  // Timestamps
  startedAt: number;
  updatedAt: number;
  completedAt?: number;

  // Error tracking
  lastError?: string;
}
```

---

## 5. Sphere間マージ

### 5.1 マージフロー

```
Sphere A (Model X)  +  Sphere B (Model Y)
         ↓                    ↓
    referenceDB A        referenceDB B
         ↓                    ↓
         └────────┬───────────┘
                  ↓
         新Model選定 (Model Z)
                  ↓
         全データ再Embedding
                  ↓
         新ProjectionDB生成
                  ↓
         新Sphere C
```

### 5.2 注意点

- **座標の再計算が必須**: 異なるモデルで生成された座標は混在不可
- **Model選定**: 統合後のデータ量・用途に応じて適切なモデルを選択
- **整合性**: マージ後のRelic重複チェック

---

## 6. 外部サービス連携

### 6.1 設計原則: Sphereの計算資源を汚さない

重い計算処理は全て外部サービスで行い、Sphereは純粋な保管庫として保つ。

```
┌─────────────────────────────────────────────────────────────┐
│  外部サービス群                                              │
├─────────────────────────────────────────────────────────────┤
│  Config Checker    - 異なるコンフィグの整合性検証            │
│  Embedding Service - ベクトル化（GPU/TPU使用）               │
│  Merge Resolver    - 衝突解決・統合判定                      │
│  Validator         - データ形式・制約検証                    │
│  Job Queue         - 長時間処理の管理                        │
│  Cloud Storage     - 中間データ保存（S3, GCS等）             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 マージの規律

**異なるコンフィグを持つSphereの統合は、外部のConfig Checkerが整合性を担保する。**

```
Sphere A (Config X)    Sphere B (Config Y)
         ↓                    ↓
         └────────┬───────────┘
                  ↓
    ┌─────────────────────────────┐
    │  Config Checker (外部)       │
    │  - Embedding Model互換性     │
    │  - スキーマ互換性            │
    │  - 制約条件の統合可否        │
    │  - 衝突検出・解決戦略        │
    └─────────────────────────────┘
                  ↓
              整合性OK
                  ↓
    ┌─────────────────────────────┐
    │  Merge Resolver (外部)       │
    │  - 重複ノード処理            │
    │  - Relic衝突解決             │
    │  - 新Model選定・再Embedding   │
    └─────────────────────────────┘
                  ↓
              検証済みデータ
                  ↓
             新Sphere C
```

### 6.3 参照すべき設計パターン

| 領域 | 参照元 | Sphereへの適用 |
|------|--------|----------------|
| 分岐・統合 | GitHub Fork/Merge | Sphere分岐、マージ戦略 |
| 整合性 | DB Transaction | Config整合性、原子的更新 |
| 大規模処理 | Cloud ETL | 外部で処理→結果投入 |
| バージョン管理 | DB Migration | ProjectionDBバージョニング |
| レプリケーション | Cloud Storage | Sphere複製・同期 |

### 6.4 連携パターン

```
外部サービス
    ↓
  - ベクトル化済み
  - バリデーション済み
  - Sphere形式に整形済み
  - コンフィグ整合性検証済み
    ↓
Sphere Wizard (Step 3以降から開始可能)
    ↓
Bookkeeper統合
```

外部サービスがStep 1-2を担当する場合、ウィザードはStep 3から再開可能。

---

## 7. CLI インターフェース（案）

```bash
# 新規Sphere初期化
sphere-wizard init \
  --input ./data/initial-nodes.json \
  --model "text-embedding-3-small" \
  --output ./sphere-data/

# 処理再開（Savepointから）
sphere-wizard resume --job-id abc123

# ステータス確認
sphere-wizard status --job-id abc123

# Sphereマージ
sphere-wizard merge \
  --sphere-a ./sphere-a/ \
  --sphere-b ./sphere-b/ \
  --model "text-embedding-3-large" \
  --output ./merged-sphere/

# アップグレード（モデル変更）
sphere-wizard upgrade \
  --sphere ./current-sphere/ \
  --new-model "text-embedding-3-large" \
  --output ./upgraded-sphere/
```

---

## 8. 実装状況

| 機能 | 状態 |
|------|------|
| 概念設計 | ✅ 完了 |
| WizardState型定義 | 🔲 未実装 |
| Step 1: 設定取得 | 🔲 未実装 |
| Step 2: ベクトル化 | 🔲 未実装 |
| Step 3: 参照データ統合 | 🔲 未実装 |
| Step 4: Bookkeeper統合 | 🔲 未実装 |
| Step 5: デプロイ | 🔲 未実装 |
| Savepoint永続化 | 🔲 未実装 |
| CLI実装 | 🔲 未実装 |
| マージ機能 | 🔲 未実装 |

**備考**: 優先度は低め。まずはPeriphery APIで基本動作を確立後に実装予定。

---

## 9. 哲学

> Sphereは本質的にDBである。
> 人類が長年かけて洗練させたデータ管理の知恵を継承する。
>
> Sphereの誕生と成長には二つの道がある。
> 一つは日々の体験による漸進的な成長（Periphery経由）。
> もう一つは大いなる変容による飛躍的な進化（Wizard経由）。
>
> Wizardは「創世の儀式」であり、慎重に、段階的に、
> セーブポイントを刻みながら進む。
> 失敗しても、そこから再開できる。
>
> 重い計算はSphereの外で行う。
> Sphereは純粋な保管庫として、代謝と評価に専念する。
> 汚れ仕事は外部サービスが引き受け、
> 検証済みの清浄なデータのみがSphereに入る。
>
> これがGitHub、クラウドDB、分散ストレージから学んだ、
> スケーラブルで信頼性の高いシステム設計の道である。

---

作成日: 2025-01-31
ステータス: 概念設計完了
