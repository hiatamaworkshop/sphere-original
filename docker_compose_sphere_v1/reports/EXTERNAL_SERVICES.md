# Session Memo: 外部サービス化と Agent 準備

**日付**: 2026-01-31
**ブランチ**: working-for-remote
**作業者**: Claude (Opus 4.5)

---

## 概要

Sphere プロジェクトの外部サービス接続アーキテクチャを整備し、以下を完了した：

1. Observatory の完全独立化
2. sphere.config.json の外部サービス対応
3. エージェント外部化設計
4. テストエージェント作成
5. **Agent Rulebook 実装** - エージェントへのルール・制約配信システム

---

## 1. Observatory 完全独立化

### 目的
Observatory を Sphere プロジェクトから切り離し、独立したサービスとして運用可能にする。

### 実施内容

| 作業 | 詳細 |
|------|------|
| 型定義の内部化 | `PulseSignal`, `PulsePacket` を `types.ts` 内で自己定義 |
| 依存関係の削除 | `@sphere/renal-core` への依存を完全削除 |
| 設定ファイル作成 | `observatory.config.json` を作成 |
| 環境変数対応 | `.env.example` を作成、`--env-file` オプション対応 |
| 起動スクリプト | `start.bat` / `start.sh` を作成 |

### ファイル構成（独立後）

```
observatory/
├── package.json           # pulse-observatory（独立パッケージ）
├── observatory.config.json
├── .env.example
├── .gitignore
├── start.bat / start.sh
├── README.md
└── src/
    ├── index.ts           # config 読み込み対応
    ├── observatory.ts
    ├── statistics.ts
    └── types.ts           # 自己完結型定義
```

### 確認結果

- ✅ `npm run build` 成功
- ✅ `@sphere` への参照なし
- ✅ ディレクトリ移動後も動作可能

---

## 2. sphere.config.json の外部サービス対応

### 追加セクション

```json
"external_services": {
  "observatory": { ... },    // UDP 監視
  "visualizer": { ... },     // WebSocket 可視化
  "archive": { ... },        // 長期保存
  "agent_gateway": { ... }   // エージェント接続
}
```

### 設計パターン

| 項目 | 説明 |
|------|------|
| `enabled` | 各サービスの有効/無効 |
| `protocol` | 接続プロトコル (UDP/HTTP/WebSocket) |
| `connection` | 接続先情報 |
| `visibility` | 可視性制御（何が見えるか） |
| `actions` | 許可されるアクション |
| `rateLimit` | レート制限 |

---

## 3. エージェント外部化設計

### 原則

```
┌─────────────────────────────────────────────────────────────┐
│  エージェントは Sphere の住人ではない                       │
│  Sphere は誰が来ても同じインターフェースを提供する          │
│  来訪者は物理情報のみを知覚し、意味には触れられない         │
└─────────────────────────────────────────────────────────────┘
```

### 接続プロトコル

| フェーズ | プロトコル | 用途 |
|---------|-----------|------|
| Spawn | HTTP POST | セッション開始、トークン取得 |
| 通信 | WebSocket | radar, echo, focus, action |
| Despawn | HTTP POST | セッション終了、capsule 提出 |

### 可視性制御

| データ | 監視系サービス | AI Agent |
|--------|---------------|----------|
| Radar（周辺ノード） | ✅ 量子化済み | ✅ |
| Focus（詳細視界） | ✅ 劣化あり | ✅ |
| Echo（気配） | ✅ 匿名 | ✅ |
| payload | ❌ 不要 | ✅ 持ち帰り可 |
| 他エージェント | ❌ | ❌ |

---

## 4. テストエージェント作成

### ファイル

| ファイル | 説明 |
|----------|------|
| `services/periphery/src/mock/test-agent.ts` | テストエージェント本体 |
| `start-agent.bat` | 起動スクリプト（対話式） |

### ランダムミッション

```typescript
const MISSIONS = [
  "Find high-heat nodes",
  "Explore ghost territory",
  "Locate amber formations",
  "Survey active nodes",
  "Detect fossil patterns",
  "Search for links",
  "Measure density",
  "Track recent activity",
  "Find lonely nodes",
  "Discover hot spots",
];
```

### 使い方

```bash
# npm スクリプト
cd services/periphery
npm run agent          # 単発探索
npm run agent:watch    # 継続監視

# バッチファイル
start-agent.bat        # 対話式メニュー
```

---

## 5. start-sphere.bat 更新

### 変更点

- Observatory が存在しない場合のグレースフル処理
- `OBSERVATORY_EXISTS` フラグによる条件分岐
- エージェント起動コマンドの案内追加

---

## 6. Agent Rulebook 実装

### 目的

エージェントが Sphere に接続した際、ルール・制約・作法を自己認識できるようにする。

### 設計思想

```
┌─────────────────────────────────────────────────────────────┐
│  Sphere は情報を隠さない                                     │
│  Agent は payload を自由に閲覧できる（開発者の代理人）        │
│  ただし、帰還時は Gatekeeper の検閲を通過しなければならない  │
│  Agent は事前にルールを知り、自己調整する責任を持つ          │
└─────────────────────────────────────────────────────────────┘
```

### ファイル構成

```
services/periphery/src/rulebook/
└── index.ts    # Rulebook 定義 + API用関数
```

### 新規エンドポイント

| エンドポイント | 用途 |
|---------------|------|
| `GET /rulebook` | JSON形式（プログラム用） |
| `GET /rulebook/text` | テキスト形式（人間/LLM用） |
| `GET /rulebook/constraints` | 制約のみ（バリデーション用） |

### Rulebook 内容

| セクション | 説明 |
|-----------|------|
| `welcome` | Sphere への接続メッセージ |
| `principles` | 4つの核心原則 |
| `navigation` | 空間航法ガイド |
| `phases` | セッション3段階（Tutorial/Sanctuary/Core） |
| `actions` | 許可/禁止アクション |
| `constraints` | Gatekeeper 制約（数値） |
| `taboos` | 禁忌とその結果 |
| `wisdom` | 失敗の尊重、帰還の心得 |

### 制約値

```json
{
  "capsule": {
    "maxTopTier": 3,
    "maxNormal": 10,
    "maxGhost": 20,
    "maxPayloadBytes": 4096,
    "maxSummaryLength": 500
  },
  "rateLimit": {
    "actionsPerTick": 3,
    "focusPerMinute": 30
  },
  "session": {
    "maxDurationSeconds": 3600,
    "warningBeforeExpiry": 300
  }
}
```

### test-agent.ts 更新

- 接続時に `/rulebook/constraints` を取得
- 制約値を表示してから探索開始
- Agent が「ルールを知っている」状態で動作

---

## 更新ファイル一覧

| ファイル | 変更内容 |
|----------|---------|
| `sphere.config.json` | `external_services` セクション追加、`pulse._comment` 追加 |
| `start-sphere.bat` | Observatory 存在チェック、agent 案内追加、rulebook エンドポイント追加 |
| `start-agent.bat` | 新規作成 |
| `services/observatory/*` | 完全独立化 |
| `services/periphery/package.json` | `agent`, `agent:watch` スクリプト追加 |
| `services/periphery/src/mock/test-agent.ts` | 新規作成、rulebook 取得機能追加 |
| `services/periphery/src/rulebook/index.ts` | **新規作成** - Agent Rulebook 定義 |
| `services/periphery/src/server.ts` | `/rulebook` エンドポイント追加 |
| `reports/PHASE4_AGENT_IMPLEMENTATION_MEMO.md` | 外部化設計セクション追加 |

---

## 次のステップ

1. **Observatory の移動・削除**
   - ディレクトリを任意の場所に移動可能
   - `.env` で `SPHERE_URL` を設定

2. **エージェント REST API 実装** (Phase 4.x.1)
   - `/agent/spawn`, `/agent/:id/action` 等

3. **WebSocket 実装** (Phase 4.x.2)
   - リアルタイム radar/echo 配信

4. **認証・レート制限** (Phase 4.x.4)
   - セッショントークン
   - `actionsPerTick` 制限

---

## 設計メモ

### なぜ外部サービス化するのか

1. **疎結合**: Sphere コアは外部サービスを知らない
2. **拡張性**: 任意の言語/環境からエージェントを実装可能
3. **テスト容易性**: サービス単位での検証が可能
4. **運用分離**: サービスごとのスケーリング/デプロイ

### 観測者による可視性の違い

```
┌─────────────────────────────────────────────────────────────┐
│  Sphere は情報を隠さない。誰が何を見るかは観測者の役割次第  │
└─────────────────────────────────────────────────────────────┘

監視系サービス（Observatory, Visualizer）:
  ✓ 座標 (vector)
  ✓ 熱量 (heat) - 量子化済み
  ✓ 種類 (kind)
  ✓ フラグ (flags)
  ✗ payload（不要）

AI Agent（開発者の代理人）:
  ✓ 上記すべて
  ✓ payload（必要 - 持ち帰るため）
  ✗ 他の Agent の情報
```

### Agent のデータフロー

```
探索時: payload 含め自由に閲覧
帰還時: ExperienceCapsule を Gatekeeper が検閲
        ├─ 個数制限（topTier: 3, normal: 10, ghost: 20）
        ├─ サイズ制限（4096 bytes）
        └─ 通過できなければ Agent が自己調整して再提出
```

### Rulebook の意義

- Agent は事前にルールを知る → 「知らなかった」は通用しない
- 自己調整の責任を Agent に委譲
- Sphere インスタンスごとに異なるルールを設定可能

---

**End of Session Memo**
