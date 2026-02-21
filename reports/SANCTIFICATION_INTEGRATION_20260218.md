# Sanctification Integration Work Memo — 2026-02-18

## 概要

Sanctification Neuron の初回 SANCTIFY トリガー（cycle=157, confidence=0.413）を受け、
後続の統合実装を4フェーズで完了。

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

Hard confidence の baseline 相対バンドマッピングで decay プリセットをランタイム切替。
Phase 4 (Allostasis) で固定バンドから baseline 相対に移行済。

| 条件 | Decay preset | 用途 |
|------|-------------|------|
| confidence < baseline × 0.5 | flow | 平常値を大きく下回る → 高速回転で刷新 |
| confidence < baseline | natural | 平常値未満 → 通常運転 |
| confidence ≥ baseline | archive | 平常値以上 → 保存重視 |

### 実装

- `decay-presets.ts`: `getPresetValues()` エクスポート追加
- `index.ts`: 観測後に Hard confidence vs baseline → preset 判定 → `renalConfig` 直接変更
- `renalConfig` に `minLoadFactor` 追加（loadFactor 計算も追従）
- `currentMetabolicMode` 変数でモード変化をトラッキング

### ログ出力例

```
[Sanctification] Metabolic mode: natural → archive (Hard=0.380 baseline=0.340)
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

## Phase 4: Allostatic Thresholding (#11)

固定閾値からスフィア自己校正型へ移行。生物学的アロスタシスモデル。

### 設計方針

- **Homeostasis**（固定の正常値を維持）ではなく **Allostasis**（"正常"自体がシフト）
- スフィアが自分の歴史から自分のゴールを見出す。外部チューニング不要。
- 設計者の意志は **FLOOR** と **BASELINE_RATIO** の2つだけ。残りはスフィアが決める。

### Hard Neuron — 自己校正閾値

```
baseline = EMA(confidence, α=0.02)  // ~50観測で半減
effectiveThreshold = max(FLOOR, baseline × BASELINE_RATIO)
FLOOR = 0.15, BASELINE_RATIO = 0.85
```

| スフィア状態 | baseline | threshold | 効果 |
|------------|----------|-----------|------|
| 新生 | ~0.16 | 0.15 (FLOOR) | 低い敷居で最初の結晶化を促す |
| 成長中 | ~0.30 | 0.255 | 自分の履歴に基づく適切な要求 |
| 成熟 | ~0.45 | 0.383 | 安易な聖域化を自動防止 |
| 擾乱後 | 低下 | 連動低下 | 回復を促す |

**capacityHealth (estimatedMaxNodes=50000) 問題が解消**: baseline がスフィアの実状に追従するため、スケールに依存しない。

### Meta Neuron — 免疫学習 + agentDiversity 廃止

**適応的回復率:**
```
metabolicBaseline = EMA(churnRate, α=0.02)
effectiveRecovery = 0.99 - blend × 0.04  // 0.95~0.99

活発なスフィア → 回復が速い（この活動量が「正常」と学習）
静かなスフィア → 回復が遅い（異常に敏感）
```

**agentDiversity → ghostMetabolism に変更:**
- 旧: `agentDiversity < 0.3 && totalEvents > 2` → 単独エージェントで永久ブロック
- 新: `connectedAgents === 0 && totalEvents > 3` → エージェントなし活動のみペナルティ
- 単独エージェント運用は Sphere Original の正常状態

### Metabolic Auto-Mode — baseline 相対バンド

Phase 2 を置換。固定 0.15/0.30 → baseline 相対:
```
confidence < baseline × 0.5 → flow
confidence < baseline        → natural
confidence ≥ baseline        → archive
```

### 削除・変更した定数

| 旧 | 新 | 理由 |
|----|-----|------|
| `HardNeuron.THRESHOLD = 0.3` | `FLOOR=0.15 + baseline×0.85` | 自己校正 |
| `MetaNeuron.RECOVERY_RATE = 0.995` | `0.95~0.99 (adaptive)` | 免疫学習 |
| `agentDiversity < 0.3` check | `ghostMetabolism` check | 単独エージェント正常化 |
| Metabolic band 0.15/0.30 | baseline-relative | スケール独立 |

### ログ出力

```
[Sanctification] epoch=0 cycle=30
  Hard=·(0.162/thr=0.150 bl=0.162)
  Soft=·(0.140) Meta=✓(sus=0.010 rec=0.990)
```

baseline (bl), effective threshold (thr), recovery rate (rec) が可視化される。

---

## 変更ファイル一覧

| ファイル | 変更種別 |
|---------|---------|
| `services/periphery/src/sanctification/sanctification-neuron.ts` | Phase 1-4 全変更 |
| `services/periphery/src/sanctification/index.ts` | エクスポート追加 |
| `services/periphery/src/config/decay-presets.ts` | `getPresetValues()` 追加 |
| `services/periphery/src/index.ts` | Festival 配線, metabolic auto-mode (allostatic), dormancy 統合 |
| `sphere.config.json` | `sanctification` セクション追加 |

---

## 未実施・未決定事項

| 項目 | 状態 | 備考 |
|------|------|------|
| Sanctuary Snapshot (DB書き出し) | 未実装 | `// TODO` コメントのみ。DB設計後に実装 |
| Festival 効果 | 構造のみ | 期間中の代謝変化・フィールド変動は未定義 |
| Node immunity | 延期 | Sphere 全体の immunity 実証後 |
| Allostasis 定数検証 | 初期値 | FLOOR=0.15, RATIO=0.85, α=0.02, Recovery 0.95~0.99 |
| Docker イメージリビルド | 未実施 | Phase 1-4 全変更がソースのみ。テスト前に要ビルド |

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
# - [Sanctification] baseline の推移 (bl=0.xxx の変化)
# - [Sanctification] threshold が baseline に追従 (thr=0.xxx)
# - [Sanctification] Metabolic mode 切替 (baseline 相対)
# - [Sanctification] Meta recovery rate 適応 (rec=0.9xx)
# - [Dormancy] Entering hibernation — neuron observed...
# - [Sanctification] Epoch N — festival begins / Festival ended
```
