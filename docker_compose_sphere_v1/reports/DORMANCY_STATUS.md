# Dormancy (代謝冬眠) 調査メモ

## 結論
**コンフィグは存在するが、実装はスタブのみ。代謝は常時回り続ける。**

## 2つの関連機構

### 1. pause (ノード変化監視) — 実装済み
- `sphere.config.json`: `renal_core.pause.idleThreshold = 300` (300tick = 5分)
- `renalcore.ts`: `idleTickCount` が `projectionDB.size` 変化を監視
- `index.ts`: `isPaused = idleTickCount > pauseIdleThreshold` → Arbiter に渡す
- **用途**: ノード数が変わらない = 静止状態 → erosionBoost で侵食加速
- **注意**: エージェント不在の検知ではない

### 2. dormancy (エージェント不在冬眠) — 未実装
- `sphere.config.json`: `renal_core.dormancy.thresholdMs = 60000` (1分)
- `index.ts:74`: `dormancyThresholdMs` を config から読み込み済み
- `index.ts:432-434`: `setOnAgentCountChange()` → `renalCore.updateAgentCount(count)`
- `renalcore.ts:222-224`: `agentCount` を保存するだけ、`tick()` 内で未参照

### DEV モードの影響
- `minLoadFactor = 1.0` → loadFactor が常に 1.0 以上 → decay フルスピード
- 本番は `minLoadFactor = 0.1` だが、dormancy ロジック自体が未実装なので効果なし

## 実装する場合のアイデア
- `tick()` 内で `agentCount === 0` かつ `dormancyThresholdMs` 経過 → decay スキップ
- または `setInterval` 自体を停止/再開 (WebSocket 接続時に再開)
- `minLoadFactor` を 0 にして loadFactor=0 → decay 実質停止、という方法もある

## 関連ファイル
| ファイル | 役割 |
|----------|------|
| `periphery/src/config/env.ts` | DEV_CONFIG.minLoadFactor |
| `periphery/src/index.ts:56-75` | renalConfig 構築、dormancyThresholdMs 読み込み |
| `periphery/src/index.ts:214-351` | setInterval tick ループ |
| `periphery/src/index.ts:432-435` | setOnAgentCountChange |
| `renalCore/src/renalcore.ts:82-84` | idleTickCount, agentCount フィールド |
| `renalCore/src/renalcore.ts:220-224` | updateAgentCount() スタブ |
| `sphere.config.json` | pause, dormancy セクション |
