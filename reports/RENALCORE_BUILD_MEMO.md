# renalCore ビルド知見メモ

**作成日**: 2026-02-01
**環境**: Windows 11 + Git Bash

---

## 問題: npm run build が動作しない

### 症状

```bash
npm run build --prefix "path/to/renalCore"
# → 無出力、distフォルダ未生成
```

### 原因

1. Windows環境での `--prefix` オプションの挙動が不安定
2. `npm run build` がサイレント失敗する場合がある
3. tsc が実行されても出力先が期待と異なることがある

---

## 解決策

### 方法1: node経由で直接tsc実行（推奨）

```bash
cd "C:/Users/kazuh/Desktop/Various/programming/DockerFiles/sphere/docker_compose_sphere_v1/services/renalCore"
node node_modules/typescript/lib/tsc.js
```

### 方法2: tscに明示的オプション指定

```bash
"path/to/renalCore/node_modules/.bin/tsc" \
  --project "path/to/renalCore/tsconfig.json" \
  --outDir "path/to/renalCore/dist"
```

### 方法3: クリーンビルド

```bash
# 古いdistを削除
rm -rf "path/to/renalCore/dist"

# cdしてからビルド
cd "path/to/renalCore" && node node_modules/typescript/lib/tsc.js
```

---

## 問題: peripheryのnode_modulesが更新されない

### 症状

```bash
npm install --prefix "path/to/periphery"
# → @sphere/renal-coreが空のまま
```

### 原因

- `file:../renalCore` 形式のローカル依存は npm の挙動が不安定
- Windows環境では symlink が正常に作成されないことがある
- npm link も同様に失敗することがある

### 解決策: 手動コピー

```bash
# ディレクトリ作成
mkdir -p "path/to/periphery/node_modules/@sphere/renal-core"

# dist と package.json をコピー
cp -r "path/to/renalCore/dist" "path/to/periphery/node_modules/@sphere/renal-core/"
cp "path/to/renalCore/package.json" "path/to/periphery/node_modules/@sphere/renal-core/"
```

---

## 確認コマンド

### ビルド成功の確認

```bash
ls "path/to/renalCore/dist/"
# → index.js, index.d.ts などが存在すること
```

### 型定義の確認

```bash
grep -r "1536\|384" "path/to/renalCore/dist/" --include="*.d.ts"
# → 期待する次元数が含まれていること
```

### periphery依存の確認

```bash
ls "path/to/periphery/node_modules/@sphere/renal-core/"
# → dist/, package.json が存在すること
```

---

## チェックリスト

renalCore変更時の手順:

- [ ] renalCore/src の TypeScript ファイルを編集
- [ ] `cd renalCore && node node_modules/typescript/lib/tsc.js`
- [ ] `ls dist/` でビルド成功を確認
- [ ] periphery/node_modules/@sphere/renal-core を手動更新
- [ ] periphery側でimportエラーがないことを確認

---

## 根本対策（将来）

1. **モノレポ化**: pnpm workspace や nx を導入
2. **Docker内ビルド**: 環境差異を排除
3. **CI/CD**: GitHub Actions でビルド検証

現状は手動コピーで運用する。

---

## 2026-02-01 追記: index.js 不足問題

### 症状

```bash
npm run dev
# → Error: Cannot find package '.../@sphere/renal-core/index.js'
```

### 原因

- `periphery/node_modules/@sphere/renal-core/dist/` に `index.js` が存在しない
- `renalcore.js` は存在するが、`package.json` の `main` は `dist/index.js` を指定

### 確認コマンド

```bash
# periphery側のdist確認
ls periphery/node_modules/@sphere/renal-core/dist/
# → index.js が無い場合は問題

# renalCore側のdist確認
ls renalCore/dist/
# → index.js が存在するはず
```

### 解決: 手動コピー（再実行）

```bash
# distの中身をすべてコピー
cp -r "services/renalCore/dist/"* \
      "services/periphery/node_modules/@sphere/renal-core/dist/"

# package.jsonもコピー
cp "services/renalCore/package.json" \
   "services/periphery/node_modules/@sphere/renal-core/"
```

### 注意

- `npm install` を実行すると上書きされる可能性あり
- renalCore を変更したら必ず再コピーが必要
- periphery 側の `node_modules/@sphere/renal-core/` にある `tsconfig.json` や `src/` は無視してよい（distのみ使用）
