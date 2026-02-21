# Session: 2026-02-01 - Wizard & API設計

## 概要

大量データ処理装置（Wizard）の設計と、Periphery APIの整理。

---

## 完了した作業

### 1. WIZARD_DESIGN_MEMO.md 作成

**ファイル**: `WIZARD_DESIGN_MEMO.md`

Wizardの設計思想と動線を文書化：
- Wizard = 聖域化（SanctuaryBundle生成）
- 初期データ設定 vs 聖域化の比較
- 外部サービス開発者向けデータ準備動線
- セーブポイント設計（長時間処理対応）

### 2. Forge エンドポイント認証追加

**ファイル**: `services/periphery/src/server.ts`

- `createExternalServiceGuard` ミドルウェア追加
- `POST /sphere/forge/link` に認証ガード適用
- `POST /sphere/forge/environmental` に認証ガード適用

**ファイル**: `services/periphery/src/types/config.ts`

- `ExternalServiceConfig` インターフェース追加
- `externalServices.allowed[]` 設定追加

### 3. API設計統一

**エンドポイントリスト更新** (`server.ts`):

```
sanctuary: {
  "POST /sphere/upstream": "Bulk data stream (mode: init|update)",
  "GET /sphere/downstream": "Export SanctuaryBundle",
}
```

**統一設計**:
- `POST /sphere/upstream` - 初期化と更新を `mode` フラグで統一
- `GET /sphere/downstream` - SanctuaryBundle出力

---

## 設計決定

### Wizard = 聖域化

```
Wizard作成 = SanctuaryBundle生成 = 聖域の凍結
```

- 初期データ設定 = 知恵の「移植」（外→内）
- 聖域化 = 知恵の「結晶化」（内→外）
- 同じ形式（SanctuaryBundle）= 出自を問わない

### API統一

```
POST /sphere/upstream
  mode: "init"   → 空のSphereに初期投入
  mode: "update" → 既存Coreへの差分/マージ

GET /sphere/downstream
  → SanctuaryBundle（配布用凍結スナップショット）
```

外部サービスは座標（vector）完成済みデータを用意。

---

## 3層体験とBundle設計の深掘り

### レイヤー遷移ルール

```
Tutorial → Sanctuary → Core
    │          │         │
    └──────────┴─────────┴──→ 帰還（常に可能）

禁止:
  - Tutorial → Core（Sanctuary経由必須）
  - Core → Sanctuary（受肉の取り消し不可）
  - Sanctuary → Tutorial（逆行不可）
```

### DB設計：単一DB + フラグベース抽出

```
Core（唯一の真実源）
  RefDB: sanctuary フラグ付きノード
  ProjDB: インメモリ metrics（刻々と変動）
         ↓
  GET /sphere/downstream
  (sanctuary=true のみ抽出 + metrics凍結)
         ↓
  SanctuaryBundle（凍結スナップショット）
```

### サーバー上での cachedBundle

```
サーバーメモリ:
  - RefDB（永続）
  - ProjDB（インメモリ、ライブ）
  - cachedBundle（単一キャッシュ）← 全セッション共有

層による読取先:
  Tutorial/Sanctuary → cachedBundle（frozenMetrics）
  Core → RefDB + ProjDB（ライブ値）
```

### frozenMetrics 最適化

**ProjDB（ライブ）で保持:**
```
heat, weight, ttl, decay, traversal, stayTime, flags, lastAccessed, createdAt
```

**SanctuaryBundle に抽出:**
```
frozenMetrics: { weight, heat }  ← これだけ
```

**除外理由:**
| 指標 | 不要理由 |
|------|----------|
| ttl | CleanerFish不在、消滅なし |
| decay | 代謝停止、減衰計算なし |
| traversal | 参照用（凍結値で十分） |
| stayTime | 参照用（凍結値で十分） |
| lastAccessed | 更新なし（ReadOnly） |

**効果:** Bundle サイズ大幅削減

---

## 未実装（設計のみ）

- [ ] `POST /sphere/upstream` エンドポイント実装
- [ ] `GET /sphere/downstream` エンドポイント実装
- [ ] Wizard外部サービス本体
- [ ] cachedBundle 更新トリガー設計

※ 設計メモとして残すのみ。実装は後日。

---

## 参照ドキュメント

- `WIZARD_DESIGN_MEMO.md` - Wizard設計詳細
- `THREE_LAYER_PIPING_DESIGN.md` - 3層体験設計
- `config_design.md` - Sphere設定全体
- `services/periphery/src/types/experience-layer.ts` - ExperienceLayer型定義
