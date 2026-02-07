# Phase 3 完了メモ - 2026-01-30

## 🎯 達成事項

### Phase 3: Periphery - 世界の代謝システムのテスト完了

**目標**: スフィアサーバーを起動し、ノードの状態と減衰（Decay）を観測する

**結果**: ✅ 成功 - 4つの代謝プロセスすべてが動作確認

---

## 🔧 解決した主要問題

### 1. Configuration が読み込まれていなかった
**問題**: `index.ts` で RenalCore の設定がハードコードされており、`sphere.config.json` が無視されていた

**解決**:
```typescript
// Before: ハードコード
const renalConfig = {
  alpha: 0.01,  // 固定値
  // ...
};

// After: ファイルから読み込み
const sphereConfig = JSON.parse(readFileSync(sphereConfigPath, "utf-8"));
const renalConfig = {
  alpha: sphereConfig.renal_core.decay.alpha * DEV_CONFIG.timeAcceleration,
  // ...
};
```

**ファイル**: [services/periphery/src/index.ts](services/periphery/src/index.ts#L35-L59)

---

### 2. Dev/Prod 環境分離の実装
**問題**: テスト環境なのに TTL が長すぎて、減衰の観測に時間がかかりすぎる

**解決**: `env.ts` の `DEV_CONFIG` を実際に適用
```typescript
export const DEV_CONFIG = {
  timeAcceleration: isDevelopment ? 10 : 1,      // 時間を10倍速に
  logInterval: isDevelopment ? 10 : 100,         // ログを10tick毎に
  minLoadFactor: isDevelopment ? 1.0 : 0.1,      // 少数ノードでも減衰
  ttlMultiplier: isDevelopment ? 0.1 : 1.0,      // TTLを1/10に短縮
};
```

**適用箇所**:
- RenalCore: `alpha` と `heatDecayFactor` に `timeAcceleration` を適用
- Packer: TTL に `ttlMultiplier` を適用
- loadFactor 計算: `minLoadFactor` を適用

**ファイル**:
- [services/periphery/src/config/env.ts](services/periphery/src/config/env.ts)
- [services/periphery/src/index.ts](services/periphery/src/index.ts)
- [services/periphery/src/packer/packer.ts](services/periphery/src/packer/packer.ts)

---

### 3. ES Modules の `__dirname` 問題
**問題**: ES Modules では `__dirname` が未定義

**解決**:
```typescript
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sphereConfigPath = join(__dirname, "../../../sphere.config.json");
```

---

### 4. loadFactor が 0 に近く、減衰しなかった
**問題**: 少数ノード（10-20個）で `loadFactor = size / 50000 ≈ 0.0004` → 減衰率がほぼゼロ

**解決**:
```typescript
const rawLoadFactor = projectionDB.size / 50000;
const loadFactor = Math.max(
  DEV_CONFIG.minLoadFactor,  // Dev: 1.0, Prod: 0.1
  Math.min(2.0, rawLoadFactor * 100)
);
```

---

## 📊 動作確認された代謝プロセス

### 1. Decay (減衰)
全ノードの Heat と TTL が減衰
```
[RenalCore] decay node=xxx ttl=xxx heat=xxx
```

### 2. Ascension (結晶化)
高熱・高 Weight のノードが Amber に昇華
```
[RenalCore] ascension node=fa1fb598 active→amber heat=57.471 weight=0.800
```

### 3. Evaporation (蒸発)
TTL ≤ 0 または Heat < 0.01 のノードが削除され、Fertility へ還元
```
[RenalCore] evaporation node=135db90c ttl=-40.0 heat=0.341 fertility+=0.102 cell=x-1_y0_z-1
```

### 4. Fertility (空間への還元)
蒸発したノードの熱量が Fertility として空間に還元される
```
fertility=0.101
```

---

## 🛠️ 現在の設定値（Development モード）

### RenalCore Config (実効値)
```
alpha: 10.0 * 10 = 100.0
heatDecayFactor: 0.02 * 10 = 0.2
minLoadFactor: 1.0
```

### TTL (実効値)
```
Ghost:  60 * 0.1 = 6秒
Normal: 86400 * 0.1 = 8640秒 (2.4時間)
Top:    172800 * 0.1 = 17280秒 (4.8時間)
```

### 減衰速度
- TTL減衰: 100/秒 (Ghost は約 0.06秒で evaporate)
- Heat減衰: 20%/秒

---

## 📁 重要なファイル

### Configuration
- `sphere.config.json` - メイン設定ファイル（本番用の値）
- `services/periphery/src/config/env.ts` - Dev/Prod 環境分離

### Core Files
- `services/periphery/src/index.ts` - エントリーポイント、設定読み込み
- `services/periphery/src/packer/packer.ts` - NodeSeed → SphereNode 変換
- `services/renalCore/src/renalcore.ts` - 代謝エンジン

### Test/Observation Tools
- `services/periphery/src/mock/seed.ts` - テストデータ投入
- `services/periphery/src/mock/observer.ts` - リアルタイム観測

### Scripts
```bash
npm run dev      # サーバー起動
npm run seed     # テストデータ投入
npm run observe  # リアルタイム監視
```

---

## 🔍 設計上の重要な確認事項

### Ghost ノードの設計
**ユーザーの明確化**:
> "ghost はパッカーが生成し、投入された時から減衰するだけ
> renalcore が遷移させるとは思っていない"

**実装状況**:
- ✅ Packer が Ghost を生成（正しい）
- ⚠️ RenalCore の `processGhostification()` が Active → Ghost に遷移させる（ユーザーの意図と異なる可能性）

**今後の検討事項**:
- `processGhostification()` を削除するか、無効化するかを検討
- または、Ghost の定義を再確認

---

## 🎓 学んだこと・アーキテクチャ上の課題

### 1. Node.js プロジェクトの過剰分離
**問題**: periphery と renalCore を別々の Node.js プロジェクトとして分離した結果：
- 手動での `dist/` コピーが必要
- 依存関係管理が複雑
- ビルドが2回必要

**推奨**: 単一プロジェクト化または Monorepo 化（詳細: [ARCHITECTURE_ANALYSIS.md](ARCHITECTURE_ANALYSIS.md)）

### 2. Dev/Prod 設定の分離の重要性
**教訓**:
- 開発初期は「すぐ結果が出る」設定が必須
- 本番想定の設定では動作確認に時間がかかりすぎる
- 環境変数で切り替え可能にすることが重要

---

## 📝 ドキュメント

### 作成したドキュメント
- `ARCHITECTURE_ANALYSIS.md` - アーキテクチャの問題分析
- `DEV_VS_PROD_CONFIG.md` - Dev/Prod 設定の違い
- `DEVELOPMENT_NOTES.md` - 開発メモ
- `SETUP_TROUBLESHOOTING.md` - セットアップのトラブルシューティング
- `QUICKSTART.md` - クイックスタートガイド
- `README_TESTING.md` - テスト手順

---

## 🚀 次のフェーズへ

### Phase 3 完了条件 ✅
- [x] Sphere サーバーが起動する
- [x] ノードの状態が観測できる
- [x] Decay（減衰）が動作する
- [x] Ascension（結晶化）が動作する
- [x] Evaporation（蒸発）が動作する
- [x] Fertility（還元）が動作する
- [x] Dev/Prod 環境が分離されている

### Phase 4 に向けて
- エージェントの実装（まだ未着手）
- 実際の Claude API との統合
- ユーザー体験の実装

---

## 💡 次回セッションで確認すべきこと

1. **Ghost の設計再確認**
   - `processGhostification()` を削除するか
   - Ghost は Packer のみが生成する仕様にするか

2. **アーキテクチャの整理**
   - periphery と renalCore の統合を検討するか
   - 現状のままで進めるか

3. **本番設定の調整**
   - 開発用設定で動作確認が取れたので、本番用の値を最適化

4. **次のフェーズの計画**
   - エージェント実装に進むか
   - 他の機能のテストを先に行うか

---

**作成日**: 2026-01-30
**状態**: Phase 3 完了、次フェーズ準備完了
**動作確認**: ✅ すべての代謝プロセスが正常動作
