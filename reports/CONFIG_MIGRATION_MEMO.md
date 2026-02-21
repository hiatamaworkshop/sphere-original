# Configuration Migration - 作業メモ

**作業日**: 2026-01-30
**ステータス**: ✅ 完了

---

## 🎯 実施内容

全ての設定値を `sphere.config.json` に統合し、マジックナンバーを排除。

---

## 📝 主要な変更

### 1. 作成したファイル
- [`sphere.config.json`](sphere.config.json) - 統合設定ファイル（グローバル + モジュール別）
- [`config_design.md`](config_design.md) - 設計ドキュメント

### 2. 型定義の更新
- [`services/renalCore/src/types/stable_config.ts`](services/renalCore/src/types/stable_config.ts)
  - `PeripheryConfig`, `RenalCoreConfig` を階層化
  - `PeripheryPackerConfig`, `RenalCoreFlagsConfig` を追加

- [`services/periphery/src/types/config.ts`](services/periphery/src/types/config.ts)
  - フラット構造 → 階層構造に変更
  - Packer設定を追加

### 3. リファクタリングしたファイル

**Periphery:**
- `packer.ts` - tierWeights, tierTTLs, tierFlags, initialMetrics
- `parser.ts` - vectorDimension
- `parser/buffer.ts` - フォールバック次元
- `membrane.ts` - prohibitedPatterns
- `gatekeeper.ts` - 全ての閾値
- `index.ts`, `server.ts` - 構造変更に対応

**RenalCore:**
- `lib/physics.ts` - Flag modifiers
- `lib/bit_math.ts` - config パラメータ追加（オプショナル）

---

## 🔑 設定アクセス方法の変更

### Before (フラット)
```typescript
config.batchSize
config.port
config.maxNodesPerCapsule
```

### After (階層化)
```typescript
config.parser.batchSize
config.server.port
config.gatekeeper.maxNodesPerCapsule
config.packer.tierWeights.top  // 新規
```

---

## ✅ 除去したマジックナンバー

| 項目 | Before | After |
|------|--------|-------|
| Tier weight (top) | `0.8` | `config.packer.tierWeights.top` |
| Tier TTL (top) | `172800` | `config.packer.tierTTLs.top` |
| Standard decay | `0.05` | `config.packer.standardDecayCoefficient` |
| Vector dimension | `1536` | `config.parser.vectorDimension` |
| Authority decay | `× 0.95` | `config.renal_core.flags.physicsModifiers.Authority.decayRateMultiplier` |
| Grid size | `0.1` | `config.renal_core.spatial.gridSize` |

---

## 🧪 テスト結果

```bash
# TypeScript型チェック
cd services/renalCore && npx tsc --noEmit   # ✅ エラー0
cd services/periphery && npx tsc --noEmit   # ✅ エラー0
```

---

## 📌 今後の拡張（未実装）

1. **Config Loader** - JSONファイルの自動読み込み
2. **Environment Overrides** - 環境変数での設定上書き
3. **Validation** - 起動時の設定値検証
4. **Hot Reload** - 一部設定の動的リロード

---

## 💡 重要な注意点

- **後方互換性**: physics関数のconfigパラメータはオプショナル（既存コード影響なし）
- **デフォルト値**: `DEFAULT_PERIPHERY_CONFIG` と `DEFAULT_PHYSICS_MODIFIERS` で定義済み
- **現在の読み込み**: まだハードコードでDEFAULTを使用（将来的にJSONローダー実装）

---

**参照**:
- 詳細設計: [`config_design.md`](config_design.md)
- 設定ファイル: [`sphere.config.json`](sphere.config.json)
