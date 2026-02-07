# Periphery Development Notes - Claude用開発メモ

## 🗓️ 2026-01-30: Phase 3 観測環境整備

### 実施内容

1. **ノード観測エンドポイント追加**
   - `GET /nodes` - 全ノード一覧（Heat順ソート）
   - `GET /nodes/stats` - ノード統計情報
   - `GET /nodes/:id` - 特定ノード詳細
   - ファイル: `src/server.ts`

2. **テストツール作成**
   - `src/mock/seed.ts` - 初期ノード投入スクリプト
   - `src/mock/observer.ts` - リアルタイム観測スクリプト
   - `package.json` に `seed`, `observe` コマンド追加

3. **ドキュメント整備**
   - `README_TESTING.md` - 詳細テスト手順
   - `SETUP_TROUBLESHOOTING.md` - トラブルシューティングガイド
   - `QUICKSTART.md` - クイックスタート
   - `start-sphere.bat` - Windows起動スクリプト

### 遭遇した問題と解決策

#### 問題1: `@sphere/renal-core` パッケージが見つからない
**原因**:
- `services/renalCore/package.json` が存在しなかった
- `node_modules/@sphere/renal-core/dist/` が空だった

**解決**:
```bash
# 1. package.json 作成
# 2. dist をコピー
cp -r ../renalCore/dist node_modules/@sphere/renal-core/
# 3. npm install 実行
```

#### 問題2: ES Modules インポートエラー
**原因**: `"type": "module"` 使用時、相対インポートに `.js` 拡張子が必須

**解決**: tsx を使って直接 TypeScript 実行（`npm run dev`）

#### 問題3: Windows バックグラウンド実行
**原因**: `&` での実行が不安定

**解決**:
- PowerShell Job 使用
- または複数ターミナル
- または `start-sphere.bat`

### アーキテクチャ変更

#### server.ts
- `projectionDB` を constructor に追加（optional）
- 観測エンドポイント 3つ追加
- `start()` メソッドにエンドポイント一覧追加

#### index.ts
- `PeripheryServer` に `projectionDB` を渡すように変更

#### package.json
- `seed`, `observe` スクリプト追加

### 重要な発見

1. **tsx の重要性**
   - ES Modules 環境では、TypeScript を直接実行する方が安全
   - ビルド後の `.js` 実行は `.js` 拡張子問題でエラーになりやすい

2. **ローカルパッケージの扱い**
   - `file:` プロトコルでリンクされたパッケージは、dist を手動管理が必要
   - RenalCore 変更時は、Periphery の `node_modules` に反映する必要あり

3. **Windows 開発の注意点**
   - バックグラウンド実行は PowerShell Job または別ターミナル推奨
   - パス区切りは `/` でも `\` でも動作するが、統一すべき

## 📝 今後の改善点

### 短期（Phase 3 完了まで）

- [ ] ES Modules の `.js` 拡張子問題を根本解決
  - Option A: 全 import に `.js` 追加
  - Option B: `moduleResolution: "NodeNext"` に変更
  - Option C: tsx での実行を標準化（推奨）

- [ ] RenalCore のビルド自動化
  - Periphery の postinstall スクリプトで dist をコピー
  - または monorepo ツール（pnpm workspace 等）の検討

- [ ] 観測ツールの強化
  - グラフ表示（CLI チャート）
  - ログファイル出力
  - CSV エクスポート

### 中期（Phase 4 以降）

- [ ] Docker Compose での完全統合
  - バックグラウンド実行の安定化
  - ログ管理の統一
  - ヘルスチェックの実装

- [ ] CI/CD パイプライン
  - ビルドテスト
  - E2E テスト
  - 自動デプロイ

- [ ] Observatory UI 実装
  - Web ベースの可視化
  - リアルタイムグラフ
  - ノード詳細表示

## 🔍 デバッグ方法（備忘録）

### サーバーログの読み方

```
[Init] ...          ← 初期化フェーズ
[RenalCore] ...     ← 代謝エンジンのログ
[Server] ...        ← HTTP リクエスト
[Shutdown] ...      ← 終了処理
```

### RenalCore Tick ログ

```
[RenalCore] tick=1 loadFactor=0.000 idle=0
```
- `tick`: 心拍カウント（1秒=1tick）
- `loadFactor`: 負荷係数（ノード数/50000）
- `idle`: アイドル Tick 数（変化がない連続 Tick）

### ノード状態遷移ログ

```
[RenalCore] decay node=a3f2b9e1 ttl=172799.0 heat=98.230
[RenalCore] ghostification node=b4c5d6e7 →ghost heat=0.387 ttl=360.0
[RenalCore] evaporation node=c5d6e7f8 ttl=-12.3 heat=0.003 fertility+=0.001
```

### API テスト例

```bash
# 統計
curl -s http://localhost:3001/nodes/stats | jq

# Top 5 Nodes
curl -s http://localhost:3001/nodes | jq '.nodes[:5]'

# 特定ノード
curl -s http://localhost:3001/nodes/NODE_ID | jq
```

## 📚 重要なファイルパス

```
services/periphery/
├── src/
│   ├── index.ts              ← メインエントリー
│   ├── server.ts             ← HTTP サーバー（観測エンドポイント追加済み）
│   ├── mock/
│   │   ├── bot.ts            ← Mock Bot
│   │   ├── seed.ts           ← 初期シード（新規）
│   │   └── observer.ts       ← 観測（新規）
│   ├── bookkeeper/
│   ├── gatekeeper/
│   ├── packer/
│   ├── parser/
│   ├── tagger/
│   └── types/
├── package.json              ← seed, observe スクリプト追加
└── node_modules/
    └── @sphere/
        └── renal-core/
            └── dist/         ← 要確認！（手動コピーが必要）

services/renalCore/
├── src/
│   └── renalcore.ts          ← 代謝エンジン本体
├── dist/                     ← ビルド済み（Periphery にコピー必要）
└── package.json              ← 新規作成済み
```

## 🎯 次回作業時のチェックリスト

サーバー起動前:
- [ ] `node_modules/@sphere/renal-core/dist/` が存在するか確認
- [ ] ポート 3001 が空いているか確認
- [ ] `npm install` を実行したか確認

初回テスト時:
- [ ] サーバー起動（`npm run dev`）
- [ ] 初期ノード投入（`npm run seed`）
- [ ] 観測開始（`npm run observe`）
- [ ] RenalCore の Tick ログを確認
- [ ] Decay が発生しているか確認
- [ ] Ghostification → Evaporation を観測

## 💡 メモ・気づき

### TypeScript + ES Modules の罠
- `import ... from "./module"` は NG（`.js` が必要）
- `import ... from "./module.js"` が正解
- または tsx で実行して回避

### npm scripts の活用
```json
{
  "dev": "tsx watch src/index.ts",        // 開発モード（推奨）
  "build": "tsc",                          // ビルド（ES Modules 問題あり）
  "start": "node dist/index.js",           // 本番実行（現状は動作しない）
  "seed": "tsx src/mock/seed.ts",          // 初期データ投入
  "observe": "tsx src/mock/observer.ts",   // 観測
  "mock-bot": "tsx src/mock/bot.ts"        // 継続投入
}
```

### Windows 開発環境での工夫
- Git Bash よりも PowerShell の方が安定
- `start` コマンドで別ウィンドウ起動が便利
- パスは `/` でも `\` でも OK だが、文字列リテラルでは `\\` 必要

---

**このメモは Claude が次回作業時に参照するために作成されました**
