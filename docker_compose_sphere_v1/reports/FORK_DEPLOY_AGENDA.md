# 直近でのフォークやデプロイ関連の課題 — 議論メモ

**日付**: 2026-02-07
**ステータス**: 議論完了・優先度整理済み

---

## 1. Metrics の適正減衰パラメータのモード化

### 現状の減衰パラメータ

| パラメータ | 現在値 | 1tick あたり |
|-----------|--------|------------|
| Heat | `heatDecayFactor: 0.01` | ×0.99 |
| Weight | `weightDecayFactor: 0.005` | ×0.995 |
| TTL | `alpha: 10.0` | -10 × loadFactor |
| Fertility | `fertilityDecayRate: 0.01` | ×0.99 |

### フラグ修飾子 (既存)

| フラグ | Heat 修飾 | Weight 修飾 | TTL 修飾 |
|--------|----------|------------|---------|
| Authority | ×0.95 | ×0.95 | — |
| Freshness | ×1.2 | — | — |
| Ephemeral | ×1.5 | — | — |
| Hub | — | ×0.8 | — |
| Sticky | — | — | ×0.8 |
| Volatile | — | — | ×1.3 |
| Frozen | 全停止 | 全停止 | 全停止 |

### 提案: 3モード + カスタム

| モード | Heat | Weight | TTL alpha | 想定用途 |
|--------|------|--------|-----------|---------|
| **Archive** (保存重視) | 0.005 | 0.002 | 5.0 | 図書館型。ノードは長く残る。Amber 昇華が容易 |
| **Flow** (流動重視) | 0.02 | 0.01 | 15.0 | SNS/リアルタイム型。古いものはすぐ消える |
| **Balanced** (現行) | 0.01 | 0.005 | 10.0 | 現行のまま。汎用 |
| **Custom** | ユーザー指定 | ユーザー指定 | ユーザー指定 | sphere.config.json 直接編集 |

### 試算 (1000 tick 後の残存率)

```
Archive:  heat = 0.995^1000 ≈ 0.67%   weight = 0.998^1000 ≈ 13.5%
Balanced: heat = 0.99^1000  ≈ 0.004%  weight = 0.995^1000 ≈ 0.67%
Flow:     heat = 0.98^1000  ≈ ~0%     weight = 0.99^1000  ≈ 0.004%
```

### 実装案

- `sphere.config.json` に `decayPreset: "archive" | "flow" | "balanced" | "custom"` を追加
- 起動時にプリセット値を展開、`custom` の場合は個別値を使用
- config-reference.md にモード表を追記
- Wizard の init ステップで選択可能にする（将来）

### 結論

コード変更は最小限（config 読み込み時の preset 展開のみ）。ドキュメント追記が主体。

---

## 2. ReferenceDB の差し替え手順

### 現状

- ReferenceDB は `Map<string, ReferenceNode>` のインメモリ実装
- 永続化なし（再起動で消失）
- `relic_id` は content hash — 重複排除あり

### DB設計制約 (DB_DESIGN_PRINCIPLES_MEMO より)

1. RefDB は **Single Source of Truth** — ProjDB の全ノードは relic_id 経由で RefDB に存在必須
2. `relic_id` は **content hash** — 同一内容は自動重複排除
3. RefDB → ProjDB は一方向（ProjDB の変更は RefDB に書き戻されない。Amber 昇華のみ例外）

### 差し替えが必要な場面

- フォーク時に別の知識ベースを読み込みたい
- Sanctuary の bundle をロードしたい
- マージ操作（Sphere A + B → C）

### 差し替え方法（現在→将来）

| 方法 | 実装状態 | 概要 |
|------|---------|------|
| **A. contribute API (batch)** | **実装済み** | `POST /sphere/contribute` に `batch: true` + `capsules[]` |
| **B. Bundle Loader** | 部分実装 | Sanctuary bundle 経由。署名検証は未完 |
| **C. Wizard CLI** | 未実装 | `sphere-wizard init` で対話的に全ステップ実行 |

### ドキュメント構成案

```
docs/reference-db-replacement.md
├── 1. 前提条件（Sphere 停止 or Dormancy 状態にする）
├── 2. バックアップ（現行 RefDB のエクスポート — 現在は不可、要実装）
├── 3. データ形式（ReferenceNode スキーマ + /schema API 参照）
├── 4. 差し替え方法
│   ├── A. contribute API 経由（現在唯一の実装済み経路）
│   ├── B. Bundle 経由（将来）
│   └── C. Wizard 経由（将来・推奨）
├── 5. 整合性チェック（ProjDB 再構築の必要性）
└── 6. 差し替え後の確認手順
```

### 結論

現時点では contribute API が唯一の実装済み経路。ドキュメントには「今使える方法」と「将来の推奨方法」を分離して記載すべき。

---

## 3. Config の解説書

**済**: `docs/config-reference.md` 完成済み。

---

## 4. エンベディングモデルの推奨とマシンパワー試算

### 現行実装

- `embedding-provider.ts` で transformers.js / Hugging Face Inference API を使用
- 384 次元ベクトル
- モデル: `all-MiniLM-L6-v2` (23MB)

### モデル選択肢

| モデル | 次元 | サイズ | 速度 (CPU) | 品質 | 推奨場面 |
|--------|------|--------|-----------|------|---------|
| `all-MiniLM-L6-v2` | 384 | 23MB | ~10ms/text | 良 | **現行・スタンドアロン推奨** |
| `bge-small-en-v1.5` | 384 | 33MB | ~12ms/text | 良+ | 英語特化 |
| `multilingual-e5-small` | 384 | 118MB | ~15ms/text | 良 | 多言語必須 |
| `all-MiniLM-L12-v2` | 384 | 33MB | ~20ms/text | 良+ | 精度優先 |
| `nomic-embed-text-v1.5` | 768 | 137MB | ~25ms/text | 優 | GPU 有環境 |

### スケーリング試算 (CAPACITY_ESTIMATE.md ベース)

| 規模 | 同時接続 | メモリ | 帯域 | 構成 | 月額目安 |
|------|---------|--------|------|------|---------|
| Phase 0 | ~1k | 数百MB | 最小 | 単一サーバー | ~$50 |
| Phase 1 | ~10k | ~2.6GB | ~28Mbps | nginx LB + 2-3台 | ~$500 |
| Phase 2 | ~50k | ~13GB | ~140Mbps | + Redis cluster | ~$3k |
| Phase 3 | ~100k | ~26GB | ~280Mbps | 12 GW + Core dist | ~$5-10k |

### ボトルネック

1. **ベクトル化**: 入口（contribute/entry）で発生。バッチ化で緩和可能
2. **近傍検索**: explore で全ノード走査 O(n)。10万ノード超で問題化
3. **メモリ**: 384次元 × float32 = 1.5KB/ノード。100万ノードで ~1.5GB

### 重要な注意事項

- **モデルを差し替えると既存ベクトルとの互換性が壊れる**
- 差し替え時は全ノード再ベクトル化が必要 → Wizard の `upgrade` コマンドの主用途

### 結論

HF Space / スタンドアロンでは現行の `all-MiniLM-L6-v2` で十分。モデル差し替え時の再ベクトル化手順をドキュメント化すべき。

---

## 5. API リストと使い道

### HTTP REST API

| メソッド | パス | 用途 | 主な利用者 |
|---------|------|------|-----------|
| GET | `/` | Sphere 情報 + エンドポイント一覧 | 開発者・監視 |
| GET | `/health` | ヘルスチェック | LB・監視 |
| GET | `/metrics` | システムメトリクス | 監視・Observatory |
| GET | `/stats` | 統計 (legacy) | 互換用 |
| GET | `/nodes/metrics` | 全ノード一覧（heat 順） | UI・デバッグ |
| GET | `/nodes/stats` | kind 別統計 | UI・ダッシュボード |
| GET | `/nodes/:id` | ノード詳細 | デバッグ |
| GET | `/sphere/explore` | ベクトル類似検索 | **外部検索の主要 API** |
| POST | `/sphere/contribute` | データ投入（単体/バッチ） | **Loader・外部投入** |
| POST | `/sphere/forge/environmental` | 環境ノード生成 | Observatory |
| GET | `/rulebook` | エージェント規則書 | Agent（dive 前） |
| GET | `/schema` | データスキーマ | Agent・外部ツール |
| POST | `/dive/request` | Dive チケット発行 | Agent（接続前） |
| GET | `/dive/validate/:token` | チケット検証（デバッグ） | 開発者 |
| GET | `/dive/stats` | Dive 統計 | 監視 |
| POST | `/quest` | Quest 投入 | 外部サービス |
| GET | `/quest/stats` | Quest 統計 | 監視 |

### WebSocket メッセージ (Dive 中の AI Agent 用)

#### Agent → Gateway

| メッセージ | 用途 | レート制限 |
|-----------|------|-----------|
| `entry` | 入場リクエスト（capsule 提出） | — |
| `sense` | 知覚（L1+L2、radius 指定） | 3/sec |
| `scan` | L1 スキャン（tags のみ） | 3/sec |
| `focus` | 詳細閲覧（L1-L4） | 30/min |
| `evaluate` | ノード評価（h, w, d） | 3/sec |
| `move` | 移動（mode 指定） | 3/sec |
| `warp` | ワープ（既知 node ID） | 3/sec |
| `emit` | ActiveBus ブロードキャスト（64byte max） | 3/sec |
| `return` | 退出 | 制限なし |
| `enterSanctuary` | Sanctuary 層へ移行 | 3/sec |
| `enterCore` | Core 層へ移行 | 3/sec |

#### Gateway → Agent

| メッセージ | 用途 | タイミング |
|-----------|------|-----------|
| `welcome` | セッション開始 + Quest 一覧 | Phase 1 |
| `processing` | Parser 処理中 | Phase 1→2 |
| `amber_showcase` | 代表 Amber ノード展示 | Phase 2 |
| `positioned` | 配置完了 → Dive 開始可 | Phase 2→3 |
| `senseResult` | sense 応答（L1+L2） | 応答 |
| `scanResult` | scan 応答（L1 のみ） | 応答 |
| `focusResult` | focus 応答（L1-L4 + nearbyGhosts） | 応答 |
| `evaluateResult` | 評価結果 | 応答 |
| `moveResult` | 移動結果（384D 位置） | 応答 |
| `warpResult` | ワープ結果 | 応答 |
| `emitResult` | ブロードキャスト確認 | 応答 |
| `bus_message` | 他 Agent からのブロードキャスト | Push |
| `returnAck` | 退出確認 | 応答 |
| `layerChanged` | 層移行確認 | 応答 |
| `error` | エラー | 応答 |
| `warning` | 警告 | 非同期 |
| `expelled` | 強制退出 | 強制 |

### レート制限

| 対象 | 制限 |
|------|------|
| Heavy (contribute, forge) | 10/min |
| Medium (explore, quest) | 30/min |
| Read-only (info, nodes, stats) | 120/min |
| WS general | 3/sec |
| WS focus | 30/min |

### 3フェーズ接続フロー

```
Phase 1 (Pending)     → token 認証済み、EntryRequest 待ち
Phase 2 (Processing)  → EntryRequest 受理、Parser ベクトル化中
Phase 3 (Active)      → 全操作可能
```

### 結論

`docs/api-reference.md` としてリクエスト例・レスポンス例を付けたドキュメントを作成すべき。diving-experience.md が Agent 側をカバーしているので HTTP API 側が不足。

---

## 6. 外部サービス: Observatory

### 役割

Sphere の「環境観測所」。異常検知 → 環境ノード注入。

### アーキテクチャ

```
RenalCore ──(UDP pulse 5tick毎)──→ Observatory
                                      ↓ Z-score 異常検知 (閾値 2.0)
                                      ↓ 100パケットの滑走窓
Periphery ←──(POST /sphere/forge/environmental)──
```

### PulsePacket 構造

- `cid` (cell ID), `timestamp`
- signals: attractant / repellent / density / flow
- flags: Burst / Thorn / Bloom / Drought / Storm

### 3つの外部エージェント型

| 名称 | 役割 | 状態 |
|------|------|------|
| **Agitator** (扇動者) | 停滞領域に刺激を与える。heat 注入、移動誘発 | 概念段階 |
| **Pioneer** (開拓者) | 未踏領域を探索して環境ノードを播種 | 概念段階 |
| **環境調整ノード** | 異常（密集・枯渇・嵐）への自律応答 | Observatory が自動生成（実装済み） |

### 結論

Observatory 本体は実装済み。Agitator/Pioneer は Observatory の追加モジュールとして実装するのが自然。Pioneer は explore API で空白領域を検出 → contribute で種を撒くフローが有効。

---

## 7. 外部サービス: the Loader

### 役割

オフラインバッチ投入ツール。Sphere の初期化・データ移行・マージを担当。

### Wizard CLI（設計済み・未実装）

| コマンド | 用途 |
|---------|------|
| `sphere-wizard init` | 新規 Sphere 初期化（対話式） |
| `sphere-wizard resume` | 中断した処理の再開 |
| `sphere-wizard status` | 現在の Sphere 状態確認 |
| `sphere-wizard merge` | Sphere A + B → C |
| `sphere-wizard upgrade` | モデル差し替え + 全ノード再ベクトル化 |

### 5 ステップ処理

```
1. Config 取得 + Schema 取得 + Model 選択 + 入力検証
2. バッチベクトル化 → ProjectionDB 生成
3. ReferenceDB 統合 + Relic 配置
4. Bookkeeper 検証
5. デプロイ（新 ProjectionDB 有効化 + アーカイブ）
```

### Savepoint 設計

各ステップで中間状態を JSON 保存。障害時に任意のステップから再開可能。

### 現時点で使える方法

`POST /sphere/contribute` (batch mode) が唯一の実装済み経路。

### 最小実装案

contribute API を叩く Node.js スクリプト + savepoint（JSON ファイル）から始めるのが現実的。

### 結論

Wizard CLI は未実装だが設計は堅い。フォーク時の最初の作業が「データ投入」なので優先度は高い。

---

## 8. 未実装箇所

| 機能 | 完成度 | 重要度 | 概要 |
|------|--------|--------|------|
| **Focus Echo** | 90% (RenalCore のみ) | 低 (deprecated 寄り) | focus 時に近傍エージェントへ匿名波紋を送る。内容・観測者ID は伝わらない。Periphery 統合未着手。棚上げ |
| **Capsule 差分評価** | 40% | 高 | Agent 信頼性システムの核。AutoCapsule vs ProposedCapsule の比較未実装 |
| **Bundle 署名検証** | 50% | 中 | SHA256 ハッシュ計算済みだが比較ロジックなし |
| **Cluster-based Forge** | 0% | 低 | statistical fallback で運用可能 |
| **Tutorial Sense** | 0% | 低 | entry 処理中の Amber 閲覧。空レスポンスで stub |
| **RenalCore Repository 化** | 60% | 中 | `getInternalMap()` で直接アクセス中。抽象化不完全 |
| **Wizard CLI** | 0% | 高 | バッチ投入・マージ・アップグレード全般 |
| **Persistence (SQLite/Redis)** | 0% | 高 | 再起動でデータ消失。デモ以外では致命的 |
| **Plankton Heat 継承** | 0% | 低 | マニフェストに記載あるが未実装 |

### フォーク・デプロイ観点の最重要項目

1. **Persistence** — データが揮発するのはデモでは許容できるが実運用では致命的
2. **Loader (Wizard CLI)** — DB 統合・再ベクトル化を担う外部サービス。別プロジェクト（ウィザード式ローカルアプリ）として開発

---

## 9. ランダムサンプリングの手法と使用箇所

| 手法 | ファイル | 数式 | 目的 |
|------|---------|------|------|
| **Fisher-Yates 式ランダム選択** | `global-field-layer.ts:119-134` | `Math.floor(random * length)` + Set 衝突回避 | GlobalField 計算用ノードサンプリング |
| **動的 Limit (√)** | `sphere-core-adapter.ts:148-150` | `baseLimit / √agentCount` | Agent 数に応じた結果件数制限 |
| **動的 Ratio (⁴√)** | `sphere-core-adapter.ts:162-164` | `1 / agentCount^0.25` (min 20%) | DB 走査時の確率的スキップ |
| **確率的ノードフィルタ** | `map-projection.repository.ts:99` | `Math.random() > ratio → skip` | O(n) 走査の高速化 |
| **パーセンテージ制限** | `global-field-layer.ts:83-94` | `length × 0.2` (clamped 50-500) | GlobalField の最低サンプル保証 |
| **知覚ノイズ** | `sphere-core-adapter.ts:57-61` | `±10% uniform noise` | Agent の知覚を不正確にする |
| **ログサンプリング** | `active-bus-layer.ts:88-96` | `Math.random() < 0.7` (70%) | ActiveBus ログ削減 |

### 設計の特徴

- **Reservoir Sampling は不使用** — Set ベースの衝突検出で代替
- **2段階サンプリング**: sense/scanL1 は `getDynamicLimit()` + `getSampleRatio()` の二重制御
- **最低保証**: すべての ratio に下限（10-20%）を設定
- **Agent 数依存のスケーリング**: 4 agents → 71%, 10 agents → 56%, 100 agents → 32%

### 注意事項

Fisher-Yates の Set 衝突回避方式は sampleSize が length に近い場合に遅くなる。現状の 20% 上限なら問題にならないが、変更時は注意。

---

## 優先度整理

| 優先度 | 項目 | 理由 | 作業内容 |
|--------|------|------|---------|
| **A (即)** | API リスト + 使い道ドキュメント | フォーク者が最初に見る | `docs/api-reference.md` 作成 |
| **A (即)** | RefDB 差し替え手順 | フォーク者が最初にやる作業 | `docs/reference-db-replacement.md` 作成 |
| **A (即)** | 減衰パラメータのモード表 | config-reference に追記で済む | config-reference.md 追記 |
| **B (近)** | Loader (別プロジェクト) | DB統合・再ベクトル化を担う外部サービス | ウィザード式ローカルアプリとして設計。Sphere 本体とは別リポジトリ |
| **B (近)** | エンベディングモデル推奨表 | ドキュメントのみ | docs に追記 |
| **C (中)** | Observatory 詳細ドキュメント | 外部サービス。実装済みだが説明不足 | 別議論が必要 |
| **C (中)** | 未実装箇所一覧の整理 | 開発ロードマップとして | このドキュメントで完了 |
| **D (後)** | サンプリング手法ドキュメント | 内部実装の話、急がない | 必要時に参照 |

---

*このドキュメントは「決めるため」ではなく「議論の記録と次のアクションの指針」として存在する。*
