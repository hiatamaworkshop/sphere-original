# Parameter Experiment Plan

## Overview
Phase 1.2 の機能実装が一段落。以下のパラメータを変えて Sphere の生態系挙動を観察する。

## Variable Parameters

| Parameter | Current | Location | Range |
|-----------|---------|----------|-------|
| wave delay | 3000ms | `contribution.ts wave [n] [ms]` | 500 ~ 10000 |
| energy initial | 100 | `config.energy.initial` | 50 ~ 300 |
| heat baseHeat | 750 | `config.packer.baseHeat` | 200 ~ 1500 |
| sampleRatio curve | `1/a^0.25` | `sphere-core-adapter.ts` | exponent 0.1 ~ 0.5 |
| agentCount | 3 | `swarm -n [count]` | 1 ~ 30 |

## Observation Points

### 1. Fossil 出る？
- **何を見る**: CleanerFish の `fossilized` ログ数、タイミング
- **仮説**: wave delay 短い + baseHeat 低い → ghost tier がすぐ fossil 化
- **コマンド**: `curl http://localhost:3001/nodes/stats` で kind 分布確認

### 2. Ghost 残る？
- **何を見る**: ghost kind のノード数が安定して存在するか
- **仮説**: ghost TTL=3600s(DEV 3x で実質1200s) → wave delay 短ければ ghost 層が維持される
- **danger**: wave delay > ghostTTL なら ghost 層が常に空

### 3. CleanerFish 動く？
- **何を見る**: `hunger` 値の推移、ghostify/fossilize/decompose 数
- **仮説**: ノード密度が上がると hunger 上昇 → 掃除が激しくなる
- **注目**: DB容量 50% 超えると hunger 急上昇（現在の閾値テーブル）

### 4. 熱は偏る？
- **何を見る**: GlobalField の `flags` (dominantFlags)、`intensity`
- **仮説**: 特定タグが多い mock_data → 特定方向に磁場偏り
- **コマンド**: サーバーログの `[GlobalField] update:` で flags 変化を追跡
- **baseHeat 高い場合**: 全ノード Hot flag → flags が 0x0040 に偏る

### 5. Agent が集まる場所できる？
- **何を見る**: swarm の座標ログ `(x, y, z)` が収束するか
- **仮説**: 磁場 intensity 高い + mode=hot/flow → エージェントが Hot ノード群に収束
- **sampleRatio 低い場合**: 近くのノード見逃し → 集まりにくい（分散）

## Experiment Recipes

### Exp.1: Dense Wave (高密度投入)
```
sphere wave 50 500    # 0.5秒間隔で5wave
sphere swarm 5        # 5体で泳がせる
```
- 期待: ノード密度↑ → hunger↑ → CleanerFish 活発化
- 注目: fossil/decompose の発生タイミング

### Exp.2: Low Energy (省エネ探索)
```
# config.energy.initial = 50
sphere wave 50 3000
sphere swarm 3
```
- 期待: sense 回数制限 → 探索範囲縮小 → 評価偏り
- 注目: energy=1 到達までの行動数

### Exp.3: Hot Sphere (高熱環境)
```
# config.packer.baseHeat = 1500
sphere wave 50 3000
sphere swarm 3
```
- 期待: 全ノード Hot flag → dominantFlags に Hot 出現
- 注目: 磁場の flags、エージェントの mode=hot 移動方向

### Exp.4: Large Swarm (大群)
```
sphere wave 50 1000   # 先にノード投入
sphere swarm 10       # 10体
sphere swarm 20       # 20体
```
- 期待: sampleRatio 低下 (10体→56%, 20体→47%)
- 注目: 各エージェントの発見ノード数のばらつき

### Exp.5: Starvation (飢餓環境)
```
sphere contribute 5   # 少量投入
sphere swarm 10       # 大量エージェント
```
- 期待: ノード不足 → sense で 0 nodes → 空振り帰還
- 注目: AutoCapsule の中身、returnHandler のログ

## Quick Commands

```bash
# 状態確認
curl -s http://localhost:3001/nodes/stats | jq .
curl -s http://localhost:3001/stats | jq .
curl -s http://localhost:3001/health | jq .

# ベクトル検索
curl -s "http://localhost:3001/sphere/explore?q=AI&limit=10&radius=1.0" | jq .

# ノード詳細
curl -s http://localhost:3001/nodes/metrics | jq '.nodes[:5]'
```

## Notes
- DEV モードは timeAcceleration=3x → TTL/decay が3倍速
- サーバー再起動でデータリセット（Map実装のため）
- wave → 少し待つ → swarm の順序が重要（ノードが先に必要）
