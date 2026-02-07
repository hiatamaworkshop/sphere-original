# Config Reference

`sphere.config.json` の全セクション解説。

---

## metadata

| key | 値 | 用途 |
|-----|-----|------|
| sphere_name | "Sphere Genesis" | 識別名 |
| version | "0.3.0" | バージョン |
| ethos | "Metabolism over Preservation" | 設計理念タグ |

---

## physical_constants

| key | default | 効果 |
|-----|---------|------|
| dimension | 384 | ベクトル次元数。embedding モデルに依存 |
| gravity_constant | 0.1 | 未使用（将来の空間引力用） |
| ambient_temperature | 0.5 | 未使用（将来用） |
| vacuum_decay | 0.01 | 未使用（将来用） |

---

## perception

知覚の計算コスト制御。

| key | default | 効果 |
|-----|---------|------|
| targetTotalOps | 100000 | 全エージェント合計の計算負荷上限。`sampleSize = T / (a × D)` |
| basePerceptionRadius | 0.8 | cosine distance での知覚半径。↑=広く見える、↓=探索が意味を持つ |
| maxSenseResults | 15 | sense() の最大返却数 |

**調整指針**: ノード数が少ない(~50)うちは radius 1.5 で全部見える。ノード数 500+ なら 0.5 程度に下げると空間に意味が出る。

---

## field

Global Ambient Field（磁場）。スフィア全体の「気候」。

| key | default | 効果 |
|-----|---------|------|
| updateIntervalTicks | 120 | 更新周期 (tick)。120 = 2分 |
| targetSampleOps | 50000 | サンプリング計算負荷上限 |
| minSampleSize | 10 | 最低サンプル数 |
| maxSampleSize | 500 | 最大サンプル数 |
| intensityDecay | 0.1 | intensity の減衰率/更新。↑=季節変化が急 |
| emptyIntensity | 0 | ノード 0 件時の intensity |

**調整指針**: updateIntervalTicks↓ = 気候変化が速い世界。intensityDecay↑ = 磁場が不安定に。

---

## periphery

### periphery.membrane

入力フィルタリング。

| key | default | 効果 |
|-----|---------|------|
| tag_encoding | "UTF-8" | タグのエンコーディング |
| tag_limit_bytes | 64 | 1タグの最大バイト数 |
| prohibited_patterns | ["<script>", ...] | 拒否パターン |

### periphery.parser

カプセル→ノード変換のバッチ処理。

| key | default | 効果 |
|-----|---------|------|
| batchSize | 7 | embedding バッチサイズ |
| flushTimeoutMs | 1000 | バッチ溢れ待機 (ms) |
| embeddingProvider | "local" | "local" = onnx、"mock" = テスト用 |
| vectorDimension | 384 | ベクトル次元 |

### periphery.gatekeeper (DEPRECATED)

Rulebook に移行済み。値は無視される。`periphery/src/rulebook/index.ts` 参照。

### periphery.packer

ノード生成時の初期値を決定。

| key | default | 効果 |
|-----|---------|------|
| baseHeat | 750 | 全ノード共通の初期 heat (整数スケール) |
| tierWeights.top | 300 | top tier の初期 weight |
| tierWeights.normal | 100 | normal tier の初期 weight |
| tierWeights.ghost | 50 | ghost tier の初期 weight |
| tierTTLs.top | 172800 | top の初期 TTL (秒)。2日 |
| tierTTLs.normal | 86400 | normal の初期 TTL (秒)。1日 |
| tierTTLs.ghost | 300 | ghost の初期 TTL (秒)。5分 |
| tierFlags.top | 2 | top に付与するフラグ (0x0002 = Freshness) |

**調整指針**: baseHeat↑ = ノードが長く活発。tierTTLs↓ = ノードの寿命が短い → CleanerFish が忙しくなる。

### periphery.incarnationBuffer

DB 書き込みのバッチ設定。

| key | default | 効果 |
|-----|---------|------|
| batchSize | 3 | 一度に書き込むノード数 |
| flushIntervalMs | 100 | フラッシュ間隔 (ms) |

### periphery.arbiter

状態遷移の判定ロジック。

| key | default | 効果 |
|-----|---------|------|
| dynamicFlags.hotHeatThreshold | 10 | heat > この値 → Hot フラグ ON |
| dynamicFlags.hubLinkThreshold | 5 | リンク数 > これ → Hub フラグ ON |
| ascension.cooldownMs | 600000 | Ascension 冷却期間 (10分) |
| ascension.scoreThreshold | 1000 | h+w >= これで Ascension 成功 |
| ascension.lowerThresholdRatio | 0.9 | 冷却中に h+w < threshold×0.9 → dropout |
| ascension.dropoutReset | h=0, w=500, d=1000 | dropout 時のリセット値 |
| ascension.absorption.radius | 0.3 | Amber 化時の吸収半径 |
| ascension.absorption.maxNodes | 5 | 最大吸収ノード数 |
| revival.threshold | 2500 | h×w >= これで Fossil → Active 復活 |
| revival.dThreshold | 800 | d <= これで復活許可（安定性ゲート） |
| revival.protectionThreshold | 100 | h+w >= これで decompose 保護 |

**調整指針**: scoreThreshold↓ = Amber になりやすい。cooldownMs↓ = 冷却期間が短い → dropout しにくい。

---

## renal_core

物理エンジン (RenalCore) の定数。

### renal_core.heartbeat

| key | default | 効果 |
|-----|---------|------|
| tickIntervalMs | 1000 | 心拍間隔 (ms)。1秒 |

### renal_core.decay

毎 tick の減衰率。DEV モードでは `×timeAcceleration(3)` が掛かる。

| key | default | DEV実効値 | 効果 |
|-----|---------|-----------|------|
| alpha | 10.0 | 30.0 | TTL 減少量/tick |
| heatDecayFactor | 0.01 | 0.03 | heat 乗算減衰 `h *= (1 - factor)` |
| weightDecayFactor | 0.005 | 0.015 | weight 乗算減衰 `w *= (1 - factor)` |

**調整指針**: heatDecayFactor が最も体感に影響する。DEV 3x で実効値が決まる。750 の heat が DEV で ~50 tick、PROD で ~300 tick で実用域を下回る。

### Decay Presets (推奨モード)

フォーク時のユースケースに応じた減衰パラメータの推奨値。`sphere.config.json` の `renal_core.decay` セクションを書き換える。

| モード | heatDecayFactor | weightDecayFactor | alpha (TTL) | 想定用途 |
|--------|----------------|-------------------|-------------|---------|
| **Archive** | 0.005 | 0.002 | 5.0 | 図書館型。ノードが長く残る。Amber 昇華が容易 |
| **Balanced** (現行) | 0.01 | 0.005 | 10.0 | 汎用。デフォルト値 |
| **Flow** | 0.02 | 0.01 | 15.0 | SNS/リアルタイム型。古いものはすぐ消える |

**1000 tick 後の残存率 (PROD, フラグ修飾なし)**:

| モード | Heat 残存 | Weight 残存 | TTL 消費 (loadFactor=1) |
|--------|----------|------------|----------------------|
| Archive | 0.995^1000 ≈ 0.67% | 0.998^1000 ≈ 13.5% | -5000 |
| Balanced | 0.99^1000 ≈ 0.004% | 0.995^1000 ≈ 0.67% | -10000 |
| Flow | 0.98^1000 ≈ ≈0% | 0.99^1000 ≈ 0.004% | -15000 |

**注意**: DEV モードでは `timeAcceleration (3x)` が掛かるため、上記の約3倍速で減衰する。

**変更方法**: `sphere.config.json` → `renal_core.decay` セクションの3値を書き換えて再起動。

---

### renal_core.thresholds

状態遷移のしきい値（整数スケール、threshold=1000）。

| key | default | 用途 |
|-----|---------|------|
| amberHeat | 1000 | h >= これで Ascension 候補登録 |
| amberWeight | 1000 | w >= これで Ascension 候補登録 |
| fossilHeat | 0.5 | h <= これで Fossil 化対象 |
| erosionHeat | 100 | Amber の h < これで Erosion (Amber 剥奪) |
| ghostHeat | 0.5 | h <= これで Ghost 化対象 |
| evaporationHeat | 0.01 | h <= これで蒸発 (decompose) |

### renal_core.ghost

| key | default | 効果 |
|-----|---------|------|
| ttlMultiplier | 0.1 | Ghost 化時の TTL 倍率。300s(ghost) × 0.1 = 30s |

### renal_core.pause

ノード数変化監視。ノード数が変わらない期間の処理。

| key | default | 効果 |
|-----|---------|------|
| idleThreshold | 300 | 300 tick (5分) 変化なし → isPaused=true |
| erosionBoost | 2.0 | pause 中の erosion 加速倍率 |

### renal_core.dormancy

エージェント不在時の冬眠。

| key | default | 効果 |
|-----|---------|------|
| thresholdMs | 60000 | agent 0 人が 60秒続くと代謝全停止 |

**動作**: tick ループ自体は回り続けるが、RenalCore.tick / Arbiter / CleanerFish / GlobalField の処理をすべてスキップ。agent 接続で即座に再開。

### renal_core.pulse

外部オブザーバー向け UDP ブロードキャスト。

| key | default | 効果 |
|-----|---------|------|
| enabled | true | パルス送信の有効/無効 |
| port | 41234 | UDP ポート |
| intervalTicks | 5 | 送信間隔 (tick) |
| broadcastAddress | "127.0.0.1" | 送信先 |

### renal_core.flags.physicsModifiers

フラグごとの物理量への影響倍率。

| Flag | 効果 | 倍率 |
|------|------|------|
| Authority | decay 減速 | ×0.95 |
| Freshness | heat 増幅 | ×1.2 |
| Ephemeral | decay 加速 | ×1.5 |
| Sticky | TTL 減衰に抵抗 | ×0.8 |
| Volatile | TTL 減衰加速 | ×1.3 |
| Hub | weight 増加 | ×1.1 |
| Frozen | 代謝完全停止 | ×0 |

---

## activeBus

AI-to-AI 揮発性通信。

| key | default | 効果 |
|-----|---------|------|
| enabled | true | Bus の有効/無効 |
| protocol | "AI_NATIVE" | 通信プロトコル |
| maxPayloadBytes | 64 | 最大ペイロード (bytes) |
| bufferSize | 10 | RingBuffer サイズ (FIFO) |
| samplingRate | 0.7 | ログサンプリング率 (70%) |

---

## DEV_CONFIG (`periphery/src/config/env.ts`)

sphere.config.json ではなくコード内定数。開発/本番で自動切替。

| key | DEV | PROD | 効果 |
|-----|-----|------|------|
| timeAcceleration | 3 | 1 | decay 係数に乗算。DEV は 3 倍速で減衰 |
| logInterval | 10 | 100 | テレメトリログ間隔 (tick) |
| minLoadFactor | 1.0 | 0.1 | loadFactor 下限。1.0 = DB が空でもフル代謝 |
| ttlMultiplier | 0.1 | 1.0 | TTL 倍率。DEV は寿命 1/10 |

**注意**: DEV モードでは全体的に「加速された世界」になる。本番の感覚を見たい場合は `NODE_ENV=production` で起動。

---

## external_services

外部接続サービスの定義。現在すべて `enabled: false`。

| service | protocol | 用途 |
|---------|----------|------|
| observatory | UDP | パルス監視 → 異常検出時にノード注入 |
| visualizer | WebSocket | 3D 可視化クライアント |
| archive | HTTP | Amber/Constellation の長期保存 |
| agent_gateway | REST + WS | 外部エージェント接続ポイント |
