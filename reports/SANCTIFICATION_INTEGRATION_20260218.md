# Sanctification Integration Work Memo — 2026-02-18

## 概要

Sanctification Neuron の初回 SANCTIFY トリガー（cycle=157, confidence=0.413）を受け、
後続の統合実装を3フェーズで完了。

---

## Phase 1: Post-Sanctification Reset + Festival

### 設計方針（ユーザー決定）

- **聖域化 = 状態記録**（成長証明ではない）
- Sphere Original はクリーンな思想：epochGrowth=0（閾値固定）
- fork 開発者は epochGrowth>0 で漸進的難易度を選択可能
- Festival = 自然な不応期（Soft バッファ再充填に要する時間）

### 実装

| 変更 | ファイル |
|------|---------|
| `RingBuffer.reset()` | sanctification-neuron.ts |
| `SoftNeuron.reset()` + `isFull` getter | sanctification-neuron.ts |
| `SanctificationNeuron.reset()` | sanctification-neuron.ts |
| Festival lifecycle in `observe()` | sanctification-neuron.ts |
| Epoch 管理（epoch increment, observationCount reset） | sanctification-neuron.ts |
| `SanctificationConfig` interface | sanctification-neuron.ts |
| index.ts: SANCTIFY → reset() → festival | index.ts |
| sphere.config.json `sanctification` セクション | sphere.config.json |

### SanctificationConfig

```json
{
  "sanctification": {
    "windowSize": 30,
    "epochGrowth": 0,
    "maxWindowSize": 90,
    "metabolicAutoMode": true,
    "dormancyObservations": 6
  }
}
```

### Festival ライフサイクル

1. SANCTIFY トリガー → `reset()` 呼出
2. Soft バッファクリア → `festival = true`
3. 30 回の観測で Soft バッファ再充填 → `festival = false`
4. 次の聖域化判定が再開

---

## Phase 2: Metabolic Auto-Mode (#5)

Hard confidence の3バンドマッピングで decay プリセットをランタイム切替。

| Hard confidence | Decay preset | 用途 |
|----------------|-------------|------|
| < 0.15 | flow | 低信頼度 → 高速回転で刷新 |
| 0.15 – 0.30 | natural | 通常運転 |
| ≥ 0.30 | archive | 高信頼度 → 保存重視 |

### 実装

- `decay-presets.ts`: `getPresetValues()` エクスポート追加
- `index.ts`: 観測後に Hard confidence → preset 判定 → `renalConfig` 直接変更
- `renalConfig` に `minLoadFactor` 追加（loadFactor 計算も追従）
- `currentMetabolicMode` 変数でモード変化をトラッキング

### ログ出力例

```
[Sanctification] Metabolic mode: natural → archive (Hard=0.320)
```

---

## Phase 3: Dormancy Integration (#6)

タイマーベース（`lastAgentZeroTime + 60s`）からニューロン駆動へ移行。

### 旧方式（削除）

```typescript
// lastAgentZeroTime + 60000ms
if (Date.now() - lastAgentZeroTime > dormancyThresholdMs) { ... }
```

### 新方式

```typescript
// SanctificationNeuron の連続ゼロエージェント観測カウンター
if (sanctificationNeuron.recommendsDormancy && !isDormant) { ... }
```

- `consecutiveZeroAgent` カウンター（neuron 内部）
- `dormancyObservations: 6`（6 × 10s = ~60s、タイマーと同等）
- 覚醒は即座（`agentCount > 0` で `isDormant = false`）

### 削除した要素

- `lastAgentZeroTime` 変数
- `renalConfig.dormancyThresholdMs`
- timer-based dormancy check in tick loop

---

## 変更ファイル一覧

| ファイル | 変更種別 |
|---------|---------|
| `services/periphery/src/sanctification/sanctification-neuron.ts` | 大幅変更（reset, festival, epoch, dormancy, config） |
| `services/periphery/src/sanctification/index.ts` | エクスポート追加 |
| `services/periphery/src/config/decay-presets.ts` | `getPresetValues()` 追加 |
| `services/periphery/src/index.ts` | Festival 配線, metabolic auto-mode, dormancy 統合 |
| `sphere.config.json` | `sanctification` セクション追加 |

---

## 修正したビルドエラー

1. `dormancyThresholdMs` が renalConfig から消えた → dormancy check をニューロン駆動に置換
2. `lastAgentZeroTime` 削除後の3箇所の参照 → 簡略化・削除
3. `sanctificationNeuron` の宣言前参照 → `sphereConfig.sanctification?.metabolicAutoMode` に変更
4. すべて修正後 `tsc` クリーンパス

---

## 未実施・未決定事項

| 項目 | 状態 | 備考 |
|------|------|------|
| Sanctuary Snapshot (DB書き出し) | 未実装 | `// TODO` コメントのみ。DB設計後に実装 |
| Festival 効果 | 構造のみ | 期間中の代謝変化・フィールド変動は未定義 |
| Node immunity | 延期 | Sphere 全体の immunity 実証後 |
| 閾値チューニング | 初期値 | Hard=0.3, Soft=0.25, Meta=0.5, バンド=0.15/0.30 |
| Docker イメージリビルド | 未実施 | 全変更はソースのみ。テスト前に要ビルド |

---

## 次の作業（テスト手順）

```bash
# 1. ビルド
docker compose build periphery

# 2. 起動
docker compose up -d periphery

# 3. バッチデータ投入
docker compose exec periphery node dist/mock/contribution.js

# 4. デーモンテスト（phi-agent で観測）
docker compose --profile agent up phi-agent

# 確認ポイント:
# - [Sanctification] Metabolic mode: natural → archive/flow
# - [Dormancy] Entering hibernation — neuron observed...
# - [Sanctification] Epoch N — festival begins / Festival ended
```
