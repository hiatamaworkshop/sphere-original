# Explore Agent 実装メモ

## 日付: 2026-02-01

## 概要

モックエージェントがSphereにexploreする動線をテストするための `explore-agent.ts` を実装。
3フェーズ接続フローと3層（Tutorial → Sanctuary → Core）の遷移をサポート。

---

## 実装内容

### 1. 3フェーズ接続フロー

```
Phase 1: pending   → welcome受信 → Rulebook取得
Phase 2: processing → EntryRequest送信 → Parser動作中
Phase 3: active    → positioned受信 → 本番Dive開始
```

### 2. 3層遷移システム

| Layer | 特徴 | evaluate動作 |
|-------|------|-------------|
| Tutorial | 練習モード | 破棄される |
| Sanctuary | 読み取り専用 | バッファされる |
| Core | ライブワールド | 即座にincarnate |

---

## 変更ファイル

### 新規作成

- `services/periphery/src/mock/explore-agent.ts`
  - 3フェーズ接続フロー
  - enterSanctuary() / enterCore() メソッド
  - フルフローテスト実装

### 修正

- `services/periphery/src/gateway/gateway-server.ts`
  - AgentMessage: `enterSanctuary`, `enterCore` 追加
  - GatewayMessage: `layerChanged` 追加
  - handleActiveMessage: layer遷移ハンドラ追加
  - コンストラクタ: `coreAdapter` パラメータ追加

- `services/periphery/src/gateway/sphere-context.ts`
  - sense(): coreAdapterを使用して実ノードを返却

- `services/periphery/src/server.ts`
  - PeripheryServer: `coreAdapter` パラメータ追加
  - GatewayServer初期化時にcoreAdapterを渡す

- `services/periphery/src/index.ts`
  - SphereCoreAdapter インスタンス作成
  - PeripheryServerに注入

- `services/periphery/package.json`
  - `"explore": "tsx src/mock/explore-agent.ts"` 追加

---

## 使用方法

```bash
# サーバー起動
npm run dev

# データ投入（必須 - メモリ内DBのため再起動後は消える）
npm run contribute

# Explore Agent実行
npm run explore

# カスタムクエリで実行
npm run explore -- --query "量子力学について" --tags "physics,quantum"
```

---

## 出力例

```
======================================================================
  SPHERE EXPLORE AGENT (3-Phase Flow)
======================================================================
  Name:   Explorer-815
  Query:  "explore sphere knowledge"
======================================================================

[Step 1] Requesting Dive Ticket...
[Step 2] Fetching Rulebook...
[Step 3] Connecting to Gateway...
[Step 4] Sending EntryRequest...
[Step 5] Waiting for positioned message...

----------------------------------------------------------------------
  TUTORIAL LAYER - Exploration
----------------------------------------------------------------------
[Tutorial] Found 2 nearby nodes
[Tutorial] Evaluating node (will be discarded in Tutorial)...

----------------------------------------------------------------------
  SANCTUARY LAYER - Read-only Exploration
----------------------------------------------------------------------
[Transition] Entering Sanctuary layer...
[Sanctuary] Entered Sanctuary - read-only exploration enabled

----------------------------------------------------------------------
  CORE LAYER - Live World
----------------------------------------------------------------------
[Transition] Entering Core layer...
[Core] Entered Core - evaluations will be incarnated
[Core] Evaluating node (will be incarnated!)...

======================================================================
  EXPLORE COMPLETE
======================================================================
  Final layer: core
======================================================================
```

---

## 注意事項

1. **メモリ内DB**: サーバー再起動でノードが消失するため、テスト前に `npm run contribute` が必要

2. **sense radius**: デフォルトでは radius=5 を使用（コサイン距離で広範囲検索）

3. **Layer遷移の順序**: Tutorial → Sanctuary → Core の順序は強制
   - Tutorial → Core 直接遷移は不可
   - Core → Sanctuary への逆戻りは不可

---

## 関連ドキュメント

- `RENALCORE_BUILD_MEMO.md` - ビルドエラー対策
- `services/periphery/src/types/experience-layer.ts` - 3層システム定義

---

## 移動モデル更新（2025-02-03）

### 384次元空間での移動 API

| API | 状態 | 説明 |
|-----|------|------|
| `move(dx,dy,dz)` | ❌ 非推奨 | 3D投影のみ変更、意味空間位置は不変 |
| `randomWalk(step, mode?)` | ✅ PRIMARY | 384D空間をランダム方向に移動 |
| `warp(nodeId)` | ✅ DIRECT | 既知ノードへ瞬間移動 |

### randomWalk モード

| mode | 動作 |
|------|------|
| (なし) | 純粋ランダム方向 |
| `"hot"` | 高heat方向へ勾配移動（要sense()） |
| `"explore"` | 未知領域方向へ勾配移動（要sense()） |

---

## Perception チューニング（2025-02-03）

### 設定パラメータ

```typescript
// config.ts
perception: {
  basePerceptionRadius: 0.4,  // cosine distance ~50度
  maxSenseResults: 15,
}
```

### 実験結果

| radius | 初期sense | 評価 |
|--------|----------|------|
| 0.5 | 8 nodes | 密すぎ（移動の意味薄い）|
| 0.4 | 2 nodes | ✅ 最適（バランス）|
| 0.35 | 0 nodes | 疎すぎ |
| 0.3 | 0 nodes | 疎すぎ |

### cosine distance と角度の対応

| cosine distance | 角度（概算）|
|-----------------|------------|
| 0.5 | ~60度 |
| 0.4 | ~50度 |
| 0.3 | ~45度 |
| 0.15 | ~25度 |

### 考察

- 現在のノード密度では `0.4` が下限
- ノード数が増えれば `0.3` 以下も有効
- heat による可視性拡張があるため、人気ノードは遠くからも見える

---

## 発見された問題（2026-02-03）→ 修正完了 ✅

### sense() が 0 ノードを返す現象

**状況:**
- データ投入直後 sense() が 0 ノードを返していた
- radius パラメータを増やしても効果なし

**原因:**
- metrics が**整数スケール（0-1000）** に変更されていた
- `h / 50` は旧スケール（0-100）を想定
- contribution.ts は importance を heat として設定（設計違反）

### 修正内容（2026-02-03）

**1. contribution.ts**
```typescript
// 旧: initialHeat: Math.round(data.importance * 100)  // importance を heat に変換
// 新: initialHeat: 500  // デフォルト基準値（評価で変動）
```

**設計原則:**
- 新規ノードはデフォルト metrics からスタート (h=500, w=tierWeight)
- importance は tier 振り分けにのみ使用
- heat は後続セッションでの評価により変動

**2. sphere-core-adapter.ts:250**
```typescript
// 旧: const heatFactor = Math.max(0.1, node.metrics.h / 50);
// 新: const heatFactor = Math.max(0.1, node.metrics.h / 1000);
```

**3. gatekeeper.ts**
```typescript
// 旧: node.initialHeat > 100 → INVALID_HEAT
// 新: node.initialHeat > 1000 → INVALID_HEAT
```

### 計算例（修正後）

```
perceptionRadius = basePerceptionRadius * radius = 0.4 * 2 = 0.8
heat = 500 (デフォルト)
heatFactor = max(0.1, 500 / 1000) = max(0.1, 0.5) = 0.5
visibilityRadius = 0.8 * 0.5 = 0.4
```

### ステータス: 修正完了 ✅

---

## テスト結果（2026-02-03）

### radius パラメータの影響

| radius | perceptionRadius | maxDistance | 結果 |
|--------|------------------|-------------|------|
| 2 | 0.8 | 1.6 | 0 nodes |
| 10 | 4.0 | 8.0 | 6 nodes ✅ |

**原因:** エージェントのクエリ「explore sphere knowledge」と mock データ（量子力学、AI等）の意味的距離が大きい（cosine distance > 1.6）

### テスト実行例

```bash
# デフォルト radius=2（意味的に近いデータが必要）
npm run explore

# 広範囲探索（テスト用）
npm run explore -- --radius 10
```

### 検証済み機能

- ✅ sense() - ノード検出
- ✅ focus() - ノード詳細取得
- ✅ warp() - 既知ノードへジャンプ
- ✅ randomWalk() - 384D空間移動
- ✅ evaluate() - 評価（Tutorial/Sanctuary/Core で動作確認）
- ✅ 3層遷移（Tutorial → Sanctuary → Core）
