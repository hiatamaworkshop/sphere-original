# RenalCore 物理エンジン化メモ

**日付**: 2026-02-01
**ブランチ**: phase5.6

---

## 概要

RenalCore を純粋な物理エンジンに限定し、状態遷移ロジックを全て Periphery に委譲した。

---

## RenalCore の責務（物理演算のみ）

```typescript
tick(loadFactor: number) {
  processDecay(loadFactor);  // Heat/TTL/Fertility 減衰
  logTelemetry();            // 統計ログ
}
```

### processDecay の内容
1. **Node Decay**: 全ノードの Heat/TTL を減衰
   - Frozen フラグがあるノードは除外
   - `effectiveTTLDecay = alpha × loadFactor × flagModifier`
   - `effectiveHeatDecay = heatDecayFactor × flagModifier`
2. **Spatial Field Decay**: Fertility を自然減衰

---

## 削除された機能と委譲先

| 削除された機能 | 委譲先 | 備考 |
|--------------|-------|------|
| `processErosion()` | Arbiter + Bookkeeper | Amber → Active 退行 |
| `processGhostification()` | 削除 | Ghost は Packer のみが生成 |
| `processAscension()` | Arbiter + Bookkeeper | Active → Amber 結晶化 |
| `processEvaporation()` | CleanerFish | TTL=0 ノードの削除 |
| `processLinkGeneration()` | NodeForge | Observatory 経由で外部生成 |
| `processPulseBroadcast()` | PulseBroadcaster | Periphery が UDP 送信 |
| `traversalDecayFactor` | 削除 | 不要になった設定項目 |

---

## RenalCoreConfig（簡略化後）

```typescript
interface RenalCoreConfig {
  // 物理定数
  alpha: number;                  // 基本減衰率
  heatDecayFactor: number;        // 熱量減衰係数

  // 代謝閾値（Arbiter が参照）
  amberHeatThreshold: number;
  amberWeightThreshold: number;
  fossilHeatThreshold: number;
  erosionHeatThreshold: number;
  ghostHeatThreshold: number;
  ghostTTLMultiplier: number;

  // 空間管理
  planktonConversionRate: number;
  fertilityDecayRate: number;

  // リンク管理（NodeForge 用）
  spectralLinkInterval: number;
  linkDistanceThreshold: number;
  // ... その他リンク設定

  // Pause 判定
  pauseIdleThreshold: number;
  pauseErosionBoost: number;
}
```

---

## 状態遷移の責任分担

```
┌─────────────────────────────────────────────────────────────┐
│                       Periphery                              │
├─────────────────────────────────────────────────────────────┤
│  Arbiter         : 状態遷移の判定（shouldAscend, shouldErode）│
│  Bookkeeper      : 状態遷移の実行（applyTransitions）         │
│  CleanerFish     : 死の管理（fossilize, decompose, evaporate）│
│  PulseBroadcaster: 環境シグナルの UDP broadcast              │
│  NodeForge       : Link/Environment ノード生成              │
├─────────────────────────────────────────────────────────────┤
│                       RenalCore                              │
├─────────────────────────────────────────────────────────────┤
│  processDecay    : Heat/TTL/Fertility の物理的減衰のみ       │
└─────────────────────────────────────────────────────────────┘
```

---

## Adapter 修正内容

### 問題
- f886672 時点で diving adapter が正常動作していた
- renalCore 消失後、復元した renalCore と Periphery の型が不整合

### 解決
1. リファクタリング済み renalCore（物理演算のみ）をビルド
2. `services/periphery/node_modules/@sphere/renal-core` に配置
3. `index.ts` から不要な `traversalDecayFactor` を削除

### 動作確認
```bash
npm run dev        # サーバー起動
npm run contribute # データ投入
npm run explore    # 3層体験テスト
```

**結果**: Tutorial → Sanctuary → Core → Return が正常完了

---

## ファイル変更

| ファイル | 変更内容 |
|---------|---------|
| `renalCore/src/renalcore.ts` | 物理演算のみに簡略化済み |
| `periphery/src/index.ts` | `traversalDecayFactor` 削除 |
| `periphery/node_modules/@sphere/renal-core/` | 新 renalCore を配置 |

---

## 次のステップ

1. [ ] sense() で 0 nodes の問題を調査（heat 可視性の調整）
2. [ ] renalCore の src/ を git 管理下に追加
3. [ ] Arbiter の状態遷移ロジックを検証

---

**作成日**: 2026-02-01
**状態**: RenalCore 物理エンジン化完了、Adapter 動作確認済み
