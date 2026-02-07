# Architecture Analysis - 構造上の問題と改善案

## 🎯 核心的な問題：Node.js プロジェクトの分割過剰

### 現状の構造

```
services/
├── periphery/          ← Node.js Project #1
│   ├── package.json
│   ├── node_modules/
│   │   └── @sphere/renal-core/  ← file:../renalCore でリンク
│   ├── tsconfig.json
│   └── src/
├── renalCore/          ← Node.js Project #2
│   ├── package.json
│   ├── node_modules/
│   ├── tsconfig.json
│   ├── dist/           ← ビルド成果物
│   └── src/
├── nginx/              ← Docker service
├── postgres/           ← Docker service
└── minio/              ← Docker service
```

### 🔴 今回の問題の根本原因

**「中途半端なマイクロサービス化」**

1. **依存関係の複雑さ**
   - periphery が renalCore を `file:../renalCore` で参照
   - renalCore の変更が periphery に自動反映されない
   - `dist/` の手動コピーが必要（これが今回の主問題）

2. **ビルド管理の二重化**
   - 両方で `npm install` が必要
   - 両方で `tsc` ビルドが必要
   - node_modules が2箇所に存在（ディスク容量とメモリの無駄）

3. **開発体験の悪化**
   - renalCore 変更 → ビルド → periphery の node_modules にコピー → periphery 再起動
   - または periphery で再 npm install（遅い）

4. **ES Modules の罠**
   - `"type": "module"` が両方で設定されている
   - import パスの `.js` 拡張子問題が2箇所で発生

### ❓ なぜこうなったのか？

**マイクロサービスアーキテクチャの誤適用**

- Docker Compose でサービスを分離 ✅ 正しい（nginx, postgres, minio）
- **Node.js コードも分離** ❌ 過剰（periphery と renalCore は密結合）

#### 真のマイクロサービスとは：

| 条件 | periphery ↔ renalCore | 評価 |
|------|----------------------|------|
| 独立してデプロイ可能？ | ❌ renalCore は periphery の一部として動作 | 不適合 |
| HTTP/gRPC で通信？ | ❌ 直接 import して関数呼び出し | 不適合 |
| 独立した DB を持つ？ | ❌ 同じ DB を共有 | 不適合 |
| 独立してスケール？ | ❌ 常に1:1で動作 | 不適合 |

**結論**: periphery と renalCore は **モノリス内のモジュール** として扱うべき。

---

## 💡 改善案（3つの選択肢）

### 案1: 単一プロジェクト化（推奨）

**最もシンプルで問題がない**

```
services/periphery/
├── package.json           ← 1つだけ
├── node_modules/          ← 1つだけ
├── tsconfig.json          ← 1つだけ
└── src/
    ├── index.ts
    ├── server.ts
    ├── renalCore/         ← renalCore をディレクトリとして統合
    │   ├── renalcore.ts
    │   ├── types/
    │   └── lib/
    ├── bookkeeper/
    ├── gatekeeper/
    └── ...
```

**メリット**:
- ✅ ビルドが1回で済む
- ✅ import パスがシンプル（`from "./renalCore/renalcore"`）
- ✅ node_modules が1つ
- ✅ 開発体験が圧倒的に改善
- ✅ ES Modules 問題が1箇所に集約

**デメリット**:
- RenalCore の「独立性」が失われる（ただし現状も独立していない）

**実装方法**:
```bash
cd services/periphery
mkdir -p src/renalCore
cp -r ../renalCore/src/* src/renalCore/
# renalCore ディレクトリを削除
rm -rf ../renalCore
# package.json から @sphere/renal-core 依存を削除
```

---

### 案2: Monorepo 化（やや複雑だが標準的）

**pnpm workspace や npm workspaces を使用**

```
sphere/
├── package.json           ← Root package (workspace 定義)
├── pnpm-workspace.yaml    ← Workspace 設定
└── packages/
    ├── periphery/
    │   ├── package.json
    │   └── src/
    └── renal-core/
        ├── package.json
        └── src/
```

**メリット**:
- ✅ パッケージの独立性を保ちつつ、依存関係を適切に管理
- ✅ ビルドが自動で連携
- ✅ 大規模プロジェクトに対応可能

**デメリット**:
- ⚠️ 学習コストがある（pnpm, Turborepo 等の知識が必要）
- ⚠️ セットアップが複雑

**実装方法**:
```bash
# pnpm をインストール
npm install -g pnpm

# ルートに pnpm-workspace.yaml を作成
echo "packages:\n  - 'services/*'" > pnpm-workspace.yaml

# 各パッケージで pnpm install
cd services/periphery && pnpm install
cd ../renalCore && pnpm install
```

---

### 案3: 真のマイクロサービス化（過剰）

**RenalCore を独立した HTTP サービスとして分離**

```
services/
├── periphery/          ← HTTP API (Express)
│   └── 呼び出し: POST http://renalcore:4000/tick
├── renalcore/          ← HTTP API (独立サービス)
│   └── エンドポイント: POST /tick, GET /stats
```

**メリット**:
- ✅ 真のマイクロサービス
- ✅ 独立してスケール可能

**デメリット**:
- ❌ **過剰設計**（現在の規模では不要）
- ❌ ネットワークオーバーヘッド
- ❌ 複雑性が大幅に増加
- ❌ トランザクション管理が困難

**結論**: 現時点では不要

---

## 🎯 推奨アプローチ

### **案1: 単一プロジェクト化**

**理由**:
1. 現在の問題を完全に解決
2. 最もシンプル（KISS原則）
3. 開発体験が最も良い
4. periphery と renalCore は実際には密結合

### 移行手順（段階的）

#### Phase 1: 動作確認（現状維持）
```bash
# まず現在の構造で動作を確認
npm run dev  # periphery 起動
npm run seed
npm run observe
```

#### Phase 2: RenalCore 統合（推奨）
```bash
cd services/periphery

# 1. RenalCore のソースをコピー
mkdir -p src/renalCore
cp -r ../renalCore/src/* src/renalCore/

# 2. Import パスを更新
# Before: import { RenalCore } from "@sphere/renal-core"
# After:  import { RenalCore } from "./renalCore/renalcore"

# 3. package.json から依存を削除
# "@sphere/renal-core": "file:../renalCore" を削除

# 4. npm install（クリーンアップ）
rm -rf node_modules package-lock.json
npm install

# 5. テスト
npm run dev
```

#### Phase 3: ディレクトリクリーンアップ
```bash
# renalCore ディレクトリを削除（もう不要）
rm -rf services/renalCore
```

---

## 📊 比較表

| 項目 | 現状（分離） | 案1（統合） | 案2（Monorepo） |
|------|-------------|------------|----------------|
| **シンプルさ** | ⚠️ 普通 | ✅ 非常に良い | ⚠️ やや複雑 |
| **ビルド速度** | ❌ 遅い（2回） | ✅ 速い（1回） | ✅ 速い（並列） |
| **開発体験** | ❌ 悪い | ✅ 非常に良い | ✅ 良い |
| **依存管理** | ❌ 手動コピー | ✅ 自動 | ✅ 自動 |
| **ディスク容量** | ❌ 2倍 | ✅ 半分 | ✅ 共有 |
| **学習コスト** | - | ✅ なし | ⚠️ あり |
| **将来の拡張性** | ⚠️ 普通 | ⚠️ 普通 | ✅ 高い |

---

## 🔍 他のプロジェクトの例

### Next.js（Monorepo）
```
vercel/next.js/
├── packages/
│   ├── next/           ← コア
│   ├── create-next-app/
│   └── eslint-config-next/
└── pnpm-workspace.yaml
```

### Remix（単一プロジェクト）
```
remix/
└── packages/remix/
    └── (全部入り)
```

### NestJS（Monorepo）
```
nestjs/nest/
├── packages/
│   ├── core/
│   ├── common/
│   └── microservices/
└── package.json (workspace)
```

---

## 💭 哲学的考察

### マイクロサービスの Golden Rule

> "Don't build microservices unless you have a team that can maintain them."

**Sphere の現状**:
- チーム規模: 1-2人（想定）
- コンポーネント数: 少ない（periphery + renalCore のみ）
- 通信: 関数呼び出し（HTTP ではない）

**結論**: モノリスが適切

### When to Split?

分離すべき条件:
1. **独立したデプロイサイクル**が必要
2. **異なる言語/ランタイム**を使用
3. **チームが分かれている**（Conway's Law）
4. **スケーリング要件が異なる**

**RenalCore はどれも満たさない** → 統合が妥当

---

## 📝 結論と次のアクション

### 推奨：案1（単一プロジェクト化）

**理由**:
- 今回の問題を完全に解決
- 最小の変更で最大の効果
- 学習コスト不要

### 次のステップ

1. **現状で動作確認**（優先）
   - まずは今の構造でテストを完了させる
   - 問題点を体感する

2. **統合作業**（任意、後日）
   - RenalCore を periphery/src/ に移動
   - Import パス更新
   - テスト

3. **ドキュメント更新**
   - アーキテクチャ決定記録（ADR）として残す

---

**ユーザーの指摘は完全に正しい** 🎯

「Node.js プロジェクトを過剰に分割したことが、今回の混乱の根本原因」

**解決策**: 統合してシンプルにする。
