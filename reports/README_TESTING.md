# Sphere Testing Guide - ノードDecay観測

## 準備完了事項 ✅

以下の準備が完了しました：

1. ✅ ノード観測用エンドポイント追加（GET /nodes, GET /nodes/stats）
2. ✅ 初期テストノード作成スクリプト（seed.ts）
3. ✅ ノード観測スクリプト（observer.ts）
4. ✅ サーバービルド完了

## 🚀 サーバー起動方法

### 方法1: バッチファイルを使用（推奨）

```bash
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1
start-sphere.bat
```

### 方法2: 手動起動

```bash
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery
npm run dev
```

サーバーが起動すると、以下のような出力が表示されます：

```
============================================================
🌐 Sphere Project - Phase 3: Periphery
============================================================

[Init] Creating RenalCore databases...
[Init] Initializing RenalCore metabolism engine...
[Init] Starting RenalCore heartbeat (1 tick/second)...

[PeripheryServer] 🚀 Listening on port 3001
[PeripheryServer] Endpoints:
  POST /sphere/submit - Submit ExperienceCapsule
  GET  /health        - Health check
  GET  /stats         - System stats
  GET  /nodes         - List all nodes
  GET  /nodes/stats   - Node statistics
  GET  /nodes/:id     - Get specific node

💚 RenalCore heartbeat: ACTIVE
🌐 Periphery server: LISTENING
```

## 📊 ノード観測手順

### Step 1: 初期ノードの投入

新しいターミナルを開いて：

```bash
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery
npm run seed
```

出力例：
```
====================================================
🌱 Seeding Initial Test Nodes
====================================================
📡 Target: http://localhost:3001

[SeedBot] ✅ High-Heat Capsule: 6 nodes incarnated
[SeedBot] ✅ Medium-Heat Capsule: 9 nodes incarnated
[SeedBot] ✅ Low-Heat Capsule: 10 nodes incarnated

✅ Initial seeding complete
📊 Check node stats: GET http://localhost:3001/nodes/stats
📋 List all nodes: GET http://localhost:3001/nodes
```

### Step 2: リアルタイム観測

別のターミナルで観測スクリプトを起動：

```bash
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery
npm run observe
```

5秒ごとにノードの統計情報が表示されます：

```
======================================================================
📊 Node Statistics [Elapsed: 0:05]
======================================================================

🔢 Node Counts:
  Relic:          0 (永続)
  Amber:          0 (結晶化)
  Active:        22 (活性)
  Fossil:         0 (風化)
  Ghost:          3 (痕跡)
  Link:           0 (連結)
  Plankton:       0 (養分)
  Environment:    0 (環境)
  ────────────────
  Total:         25

📈 Averages:
  Heat:     32.456
  Weight:    0.623
  TTL:   84523.2

🔥 Top 5 Nodes by Heat:
  1. [a3f2b9e1] active      heat= 98.23 ttl=172800 - [HIGH-HEAT] Important knowledge node 1 -...
  2. [d4e5f6a2] active      heat= 87.45 ttl=172800 - [HIGH-HEAT] Important knowledge node 2 -...
  ...
======================================================================
```

### Step 3: Decay観測のポイント

観測スクリプトを実行し続けると、以下の現象が観察できます：

#### 🔥 Heat（熱量）の減衰
- **初期**: High-Heat ノード（80-100）、Medium-Heat（20-80）、Low-Heat（5-30）
- **1分後**: Heat が約 2% 減衰（heatDecayFactor: 0.02）
- **5分後**: Low-Heatノードが Ghost化の閾値（0.5）に近づく
- **10分後**: Ghost化したノードが蒸発し始める

#### ⏱️ TTL（寿命）の減衰
- **Top Tier**: 172800秒（2日） → 毎秒 alpha * loadFactor ずつ減少
- **Normal**: 86400秒（1日） → 同様に減衰
- **Ghost**: 3600秒（1時間） → さらに速く減衰（10%に短縮）

#### 🦴 ノード状態遷移
- **Active → Ghost**: Heat < 0.5 のとき
- **Active → Amber**: Heat > 15 かつ Weight > 0.7 のとき（通常は起こりにくい）
- **Ghost → 蒸発**: TTL ≤ 0 または Heat < 0.01 のとき

### Step 4: 手動APIリクエスト

観測スクリプトとは別に、curlやブラウザで直接APIを叩いて確認することもできます：

```bash
# ノード統計
curl http://localhost:3001/nodes/stats | json_pp

# 全ノードリスト
curl http://localhost:3001/nodes | json_pp

# 特定ノード詳細
curl http://localhost:3001/nodes/NODE_ID | json_pp
```

## 🧪 追加テスト

### 継続的なノード投入（Mock Bot）

```bash
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery
npm run mock-bot
```

2秒ごとにランダムなカプセルを投入し、代謝の動的な様子を観測できます。

## 📝 RenalCore ログ

サーバーのコンソール出力で、RenalCoreの心拍ログが1秒ごとに表示されます：

```
[RenalCore] tick=1 loadFactor=0.000 idle=0
[RenalCore] stats tick=1 relic=0 amber=0 active=22 fossil=0 ghost=3 plankton=0 link=0 environment=0 fertility=0.000

[RenalCore] tick=2 loadFactor=0.000 idle=1
[RenalCore] stats tick=2 relic=0 amber=0 active=22 fossil=0 ghost=3 plankton=0 link=0 environment=0 fertility=0.000

[RenalCore] ghostification node=a3f2b9e1 →ghost heat=0.387 ttl=360.0
[RenalCore] evaporation node=b4c5d6e7 ttl=-12.3 heat=0.003 fertility+=0.001 cell=x0_y0_z0
```

## 🎯 観測目標

以下を確認できれば成功です：

1. ✅ サーバーが正常に起動し、RenalCoreの心拍が動作している
2. ✅ 初期ノードが投入され、ProjectionDBに格納されている
3. ✅ 毎秒のTick でノードのHeatとTTLが減衰している
4. ✅ Low-HeatノードがGhostに遷移する
5. ✅ Ghostノードが蒸発し、総ノード数が減少する
6. ✅ Fertilityが徐々に蓄積される

## 🛑 サーバー停止

Ctrl+C でサーバーを停止できます。

停止時には以下のように表示されます：

```
[Shutdown] Gracefully shutting down...
[Shutdown] ✅ Buffers flushed
[Shutdown] 👋 Goodbye
```

## 📚 参考情報

- **RenalCore設定**: `sphere.config.json` の `renal_core` セクション
- **Periphery設定**: `sphere.config.json` の `periphery` セクション
- **ノード種別**: relic, amber, active, fossil, ghost, link, plankton, environment
- **物理定数**:
  - heatDecayFactor: 0.02（毎Tick 2%減衰）
  - alpha: 0.01（基本減衰率）
  - ghostHeatThreshold: 0.5
  - evaporationHeat: 0.01

---

**世界の代謝を観測しましょう！** 🌐💫
