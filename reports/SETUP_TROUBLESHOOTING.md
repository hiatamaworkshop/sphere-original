# Sphere Setup & Troubleshooting - 開発者向けメモ

## 🔧 初回セットアップ時の問題と解決策

### 問題1: RenalCore パッケージが見つからない

**症状:**
```
Error: Cannot find package 'C:\...\node_modules\@sphere\renal-core\dist\index.js'
```

**原因:**
- `services/renalCore/package.json` が存在しなかった
- `services/periphery/node_modules/@sphere/renal-core/dist/` が存在しなかった

**解決策:**

1. RenalCore の package.json を作成:
```json
{
  "name": "@sphere/renal-core",
  "version": "1.0.0",
  "description": "Sphere Project - RenalCore Metabolism Engine",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts"
  },
  "keywords": ["sphere", "metabolism", "renal-core"],
  "author": "Sphere Project",
  "license": "MIT"
}
```

2. ビルド済み dist を node_modules にコピー:
```bash
cd services/renalCore
# distが既にある場合
cp -r dist ../periphery/node_modules/@sphere/renal-core/

# または RenalCore をビルド
cd ../periphery/node_modules/@sphere/renal-core
npm run build
```

3. Periphery で再インストール:
```bash
cd services/periphery
npm install
```

### 問題2: ES Modules のインポートエラー

**症状:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../dist/server'
imported from .../dist/index.js
```

**原因:**
- `package.json` で `"type": "module"` を使用しているが、TypeScript コンパイル後の `.js` ファイルで相対インポートに `.js` 拡張子が必要
- `import { Server } from "./server"` は動作しない（ES Modules では `.js` が必須）

**解決策 (推奨):**

**tsx を使って TypeScript を直接実行**（ビルド不要）:
```bash
npm run dev  # tsx watch src/index.ts
```

**代替案1: ソースコードに .js 拡張子を追加**
```typescript
// src/index.ts
import { PeripheryServer } from "./server.js";  // .js を明示
import { Membrane } from "./membrane/membrane.js";
// ...すべての相対インポートに .js を追加
```

**代替案2: tsconfig.json を調整**
```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

### 問題3: Windows でのバックグラウンド実行の困難

**症状:**
- `&` でバックグラウンド実行しても安定しない
- プロセスがすぐに終了する
- リダイレクトが正しく機能しない

**解決策:**

**方法1: PowerShell Job（推奨）**
```powershell
Start-Job -ScriptBlock {
    cd 'c:\path\to\services\periphery'
    npm run dev
}

# ジョブ確認
Get-Job

# ジョブ停止
Stop-Job -Id 1
Remove-Job -Id 1
```

**方法2: 別ターミナル**
```bash
# Terminal 1: Server
cd services/periphery
npm run dev

# Terminal 2: Seed
npm run seed

# Terminal 3: Observer
npm run observe
```

**方法3: start-sphere.bat**
```batch
cd services\periphery
start "Sphere Server" cmd /k "npm run dev"
```

## ✅ 正しい起動手順（確立版）

### 1. 依存関係の確認

```bash
cd services/periphery

# RenalCore の dist が存在するか確認
ls node_modules/@sphere/renal-core/dist

# なければコピー
cp -r ../renalCore/dist node_modules/@sphere/renal-core/
```

### 2. サーバー起動

```bash
# 方法A: 開発モード（tsx、推奨）
npm run dev

# 方法B: ビルドして実行（非推奨、ES Modules 問題あり）
npm run build
node dist/index.js  # ❌ エラーになる可能性あり
```

### 3. 初期データ投入（別ターミナル）

```bash
cd services/periphery
npm run seed
```

出力例:
```
🌱 Seeding Initial Test Nodes
📡 Target: http://localhost:3001

[SeedBot] ✅ High-Heat Capsule: 6 nodes incarnated
[SeedBot] ✅ Medium-Heat Capsule: 9 nodes incarnated
[SeedBot] ✅ Low-Heat Capsule: 10 nodes incarnated

✅ Initial seeding complete
```

### 4. 観測開始（別ターミナル）

```bash
npm run observe
```

## 📋 トラブルシューティング チェックリスト

### サーバーが起動しない

- [ ] `node_modules/@sphere/renal-core/dist/` が存在するか？
- [ ] `npm install` を実行したか？
- [ ] ポート 3001 が使用されていないか？ (`netstat -ano | findstr 3001`)
- [ ] `npm run dev` で tsx を使っているか？（`node dist/index.js` は避ける）

### ノードが投入されない

- [ ] サーバーが起動しているか？ (`curl http://localhost:3001/health`)
- [ ] `npm run seed` を実行したか？
- [ ] エラーログを確認したか？

### 観測スクリプトがエラー

- [ ] サーバーが起動しているか？
- [ ] `/nodes/stats` エンドポイントが実装されているか？
- [ ] `fetch` が使えるか？（Node.js 18+ 必要）

## 🛠️ 開発時の注意点

### TypeScript ビルドについて

- **推奨**: `npm run dev`（tsx で直接実行）
- **非推奨**: `npm run build` → `node dist/index.js`（ES Modules 問題）

### パッケージリンクについて

RenalCore はローカルパッケージ（`file:../renalCore`）なので：

1. RenalCore を変更したら再ビルドが必要
2. Periphery の `node_modules/@sphere/renal-core/dist/` に反映する必要がある

```bash
# RenalCore 変更後
cd services/renalCore
# (必要に応じてビルド)

# Periphery に反映
cp -r dist ../periphery/node_modules/@sphere/renal-core/

# または Periphery で再インストール
cd ../periphery
npm install
```

### ポート確認

```bash
# Windows
netstat -ano | findstr 3001

# プロセス終了
taskkill /PID <PID> /F
```

## 📝 開発フロー（日常）

```bash
# 1. サーバー起動（Terminal 1）
cd services/periphery
npm run dev

# 2. 初期データ投入（Terminal 2、初回のみ）
npm run seed

# 3. 観測（Terminal 3、任意）
npm run observe

# または Mock Bot（継続的投入）
npm run mock-bot
```

## 🔍 デバッグ方法

### サーバーログの確認

```bash
npm run dev
# コンソールに全ログが表示される:
# - [Init] 初期化ログ
# - [RenalCore] Tick ログ
# - [Server] リクエストログ
# - [Shutdown] シャットダウンログ
```

### API 手動テスト

```bash
# Health check
curl http://localhost:3001/health

# ノード統計
curl http://localhost:3001/nodes/stats

# 全ノード
curl http://localhost:3001/nodes

# 特定ノード
curl http://localhost:3001/nodes/<NODE_ID>
```

### RenalCore の動作確認

サーバーログで以下を確認：

```
[RenalCore] tick=1 loadFactor=0.000 idle=0
[RenalCore] stats tick=1 relic=0 amber=0 active=0 ...

[RenalCore] decay node=a3f2b9e1 ttl=172799.0 heat=98.230
[RenalCore] ghostification node=b4c5d6e7 →ghost heat=0.387 ttl=360.0
[RenalCore] evaporation node=c5d6e7f8 ttl=-12.3 heat=0.003 fertility+=0.001
```

## 📚 関連ファイル

- **起動スクリプト**: `start-sphere.bat`
- **テスト手順**: `README_TESTING.md`
- **設定ファイル**: `sphere.config.json`
- **RenalCore**: `services/renalCore/src/renalcore.ts`
- **Periphery**: `services/periphery/src/index.ts`

## 🚨 重要な注意事項

1. **必ず tsx を使う**（`npm run dev`）
   - ビルド済み `.js` ファイルの実行は ES Modules 問題がある

2. **RenalCore の dist は手動管理**
   - ローカルパッケージなので、変更時は手動コピーまたは再インストール

3. **Windows でのバックグラウンド実行は避ける**
   - 複数ターミナルを使うか、PowerShell Job を使う

4. **ポート 3001 を確保**
   - 他のプロセスが使用していないことを確認

---

**作成日**: 2026-01-30
**更新日**: 2026-01-30
**作成者**: Claude (Sphere Development Assistant)
