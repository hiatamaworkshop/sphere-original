# Trajectory Analysis — 空間生態観測

**Status**: v1 指標確定 / 未実装 (2026-02-26)
**関連**: `LEARNED_WEIGHT_DESIGN.md`, `SPECIES_MEMORY_DESIGN.md`, `INFORMATION_PHYSICS_ENGINE_DESIGN.md`

---

## 概念

```
軌跡解析は「ログ分析」ではない。
空間存在としてのエージェントの生態観測である。

Digestor  = 代謝 (eval-log の自然選択)
Trajectory = 生態観測 (空間内の振る舞いパターン)

責務が異なる。
初期は Digestor に同居するが、内部モジュールは分離する。
```

---

## 優先順位

```
(B) 種族レベル  ← 最優先
    loadout が空間にどんな軌跡を描くか
    これがスフィアの根本問題

(A) 個体レベル
    一回の Dive セッションの軌跡統計
    種族解析の入力データ

(C) クロスセッション
    agentId で紐付けた複数 Dive の変遷
    resumePosition の実効性検証

(D) ライフログ固有
    別プロジェクト。ユーザーの生理的軌跡の orbit パターン
```

---

## v1 指標 — 確定 (5指標)

### 1. Spread (空間的拡散)

```
訪問ノード分布の広がり (normalized spread)

低い → 局所探索型 (sniper 的)
高い → 放射型探索 (moth 的)

計算:
  spread = mean(dist_i_to_centroid) / max(dist_i_to_centroid)

  dist_i = euclidean_distance(waypoint_i, centroid)
  centroid = mean(all waypoints)

パラメータ不要。状態量として扱いやすい。
これは species 特性の「指紋」になる。

最小セッション: 2 waypoints 以上
```

### 2. Heat Bias (熱嗜好)

```
高 heat ノードへの接近傾向

正 (+) → 流行追従型 (高 heat に引き寄せられる)
負 (-) → 逆張り型 (低 heat を好む)
  0    → heat に無関心

計算:
  heat_bias = (mean_visited_heat - sphere_avg_heat) / sphere_avg_heat

  mean_visited_heat = mean(waypoints[].heat)
  sphere_avg_heat   = スフィア全体の平均 heat (snapshot から取得)

これは思想に直結する。
hunter が熱を追い、scholar が冷域を好むなら、
loadout 設計が正しく機能している証拠。

sphere_avg_heat 不明時: heat_bias = undefined (比較不能)
```

### 3. Path Length (移動総量)

```
384D 空間での総移動距離

計算:
  pathLength = Σ |pos[i+1] - pos[i]|  (euclidean)

探索の活発さの直接指標。
短い → 局所に留まった
長い → 広範に動いた

最小セッション: 2 waypoints 以上
```

### 4. Straightness (目標志向性)

```
始点から終点への直線距離 / 実際の移動距離

計算:
  straightness = dist(first_waypoint, last_waypoint) / pathLength

  1.0 → 完全に直線 (目標志向)
  → 0  → 蛇行・漂流 (方向転換が多い)

curvature (連続ベクトル間角度) より安定。
3〜15 waypoints でも信頼できる。
curvature は「どれだけ曲がったか」、
straightness は「結果としてどこに辿り着いたか」。

最小セッション: 2 waypoints 以上 (pathLength > 0)
pathLength = 0 の場合: straightness = 1.0 (動かなかった = 直線的)
```

### 5. Revisit Rate (回帰傾向)

```
前回セッション centroid との距離

計算:
  revisit_distance = cosine_distance(current_centroid, previous_session_centroid)
  previous_session_centroid は agentId + loadout で紐付け

低い → 定住型 (既知領域に戻る)
高い → 探索型 (未知領域を好む)

初回セッション: undefined (比較対象なし)

resumePosition の実効性検証にも使える:
  lastPosition → 今回初期位置 の距離が小さければ
  resume が機能している。
```

---

## v2 昇格候補 (将来)

```
v1 で十分なデータが溜まってから検討。

| 指標 | 方法 | 昇格条件 |
|------|------|----------|
| Shannon Entropy | ビン化 → -Σ p log₂ p | spread では弁別不足な場合 |
| Spearman 相関 | 訪問順 vs heat | セッション長が十分になったら (15+ waypoints) |
| PCA1 | power iteration | waypoints 数が安定して 10+ になったら |
| Curvature | 連続ベクトル角度平均 | waypoints 数が安定して 10+ になったら |

v1 → v2 への差し替えは trajectory_signature の次元追加で対応。
v1 指標は廃止しない (互換性維持)。
```

---

## Trajectory Signature — 種族の空間的個性

```
trajectory_signature = [spread, heat_bias, straightness]

3次元ベクトルとして species ごとに平均化。
種族間距離 = euclidean_distance(signature_i, signature_j)

これだけで「振る舞いの違い」が定量化される。

用途:
  - 種族設計の検証 (期待パターンとの比較)
  - learned_δ の効果測定 (世代間 signature drift)
  - 新種族の位置づけ (既存種族との距離)
```

---

## データフロー

```
[収集 — 既存インフラ]

Sphere (periphery)
  focus() → positionSnapshot[384D] を ActionLog に記録
  acknowledge → onSessionEnd(trail) 発火
                    ↓
[蓄積 — IO Gateway 経由 (主経路)]

onSessionEnd(trail)
  → POST /trails (Digestor IO Gateway)
  → 失敗時 fallback: trail-log.jsonl にローカル追記
                    ↓
[解析 — Digestor 同居 / モジュール分離 / バッチ処理]

digestor.ts: digest()
  ├─ evalDigest()             (既存: eval-log 代謝)
  └─ trajectoryDigest()       (新規: trail-log 解析)
       └─ per-species aggregate (species 単位でバッチ集計)
                    ↓
[出力]

species-profile.json
  species.scholar.trajectoryStats: { spread, heatBias, straightness, ... }

generations/gen-NNN.json
  species.scholar.trajectoryStats: { ... }  ← 世代間比較用
                    ↓
[閲覧]

Observatory
  GET /trails → trail 生データ
  GET /species → trajectoryStats 含む種族プロファイル
  console: trajectory stats メニュー
```

### 配線の設計判断

```
主経路: HTTP POST /trails (IO Gateway)
  理由:
    - 将来 Observatory 分離可能
    - 外部アクセスも可能
    - 非同期化できる

Fallback: local trail-log.jsonl 直接追記
  理由:
    - IO Gateway 未起動時の保険
    - DIGESTOR_URL 未設定時のファイルモード

計算タイミング: バッチ (trajectoryDigest() 内)
  理由:
    - 軌跡は単体では意味が薄い
    - 重なりが意味を生む
    - species 単位で集計すべき
    - 受信時即計算は将来の最適化として残す
```

---

## 保存データ構造

### trail-log.jsonl (1行1セッション)

```json
{
  "sessionId": "abc123",
  "agentId": "agent-xyz",
  "loadout": "scholar",
  "sphereId": "sphere-main",
  "timestamp": 1740000000000,
  "duration": 45000,
  "initialQuery": "quantum mechanics",
  "waypoints": [
    { "nodeId": "n1", "position": [0.1, -0.3, ...], "heat": 5.2, "ts": 1740000001000 },
    { "nodeId": "n2", "position": [0.2, -0.1, ...], "heat": 3.8, "ts": 1740000005000 }
  ],
  "actions": {
    "focus": 12,
    "move": 8,
    "warp": 2,
    "evaluate": 10
  },
  "summary": {
    "spread": 0.72,
    "heatBias": 0.45,
    "pathLength": 4.56,
    "straightness": 0.38,
    "revisitRate": 0.78,
    "centroid": [0.15, -0.2, ...]
  }
}
```

### species-profile.json 拡張

```json
{
  "species": {
    "scholar": {
      "evaluations": 50,
      "weightDelta": { ... },
      "evaluationConsistency": { ... },
      "trajectoryStats": {
        "sessions": 12,
        "avgSpread": 0.65,
        "avgHeatBias": -0.3,
        "avgPathLength": 5.4,
        "avgStraightness": 0.42,
        "avgRevisitRate": 0.55,
        "centroidDrift": 0.15,
        "signature": [0.65, -0.3, 0.42]
      }
    }
  }
}
```

### 保存フィールド

| フィールド | 次元 | 用途 |
|---|---|---|
| centroid | 384D | 軌跡の重心。generation 間の drift 計測 |
| pathLength | scalar | 総移動距離。探索の活発さ |
| straightness | scalar | 目標志向性。curvature の代替 (v1) |
| signature | 3D | [spread, heatBias, straightness] — 種族比較用 |

---

## 種族特性の検証 — 期待されるパターン

```
| loadout    | Spread | Heat Bias  | Straightness | Revisit Rate |
|------------|--------|------------|--------------|--------------|
| moth       | 高い   | やや正 (+) | 低い (蛇行)  | 高い (探索)  |
| scholar    | 中程度 | 負 (-)     | 高い (直線)  | 中程度       |
| hunter     | 低い   | 強い正 (+) | 高い (直線)  | 低い (定住)  |
| balanced   | 中程度 | 中立 (0)   | 中程度       | 中程度       |

実測がこのパターンから外れている場合:
  → loadout 定義の見直し
  → learned_δ の効果確認
  → walkPreference の実効性検証
```

---

## 実装の段階

### Phase 1: trail 蓄積 (最小限の配線)

```
1. Digestor IO Gateway に POST /trails エンドポイント追加
2. onSessionEnd hook → IO Gateway へ trail 送信 (HTTP)
3. 失敗時 → trail-log.jsonl へ fallback 追記
4. Observatory に GET /trails 表示追加

変更ファイル:
  digestor/src/server.ts    — POST /trails, GET /trails
  periphery gateway-server.ts — onSessionEnd → POST /trails
  observatory/src/observatory.ts — getTrails(), printTrails()
  observatory/src/types.ts  — TrailEntry 型
```

### Phase 2: per-species 集約 (trajectoryDigest)

```
1. digestor.ts の digest() に trajectoryDigest() 追加
2. trail-log → species 別集約 → 5指標 + centroid 計算
3. species-profile.json に trajectoryStats 追記
4. generation archive に trajectoryStats + signature 含める
5. Observatory で種族比較表示 (signature 距離)

新規ファイル:
  digestor/src/trajectory-statistics.ts — 5指標計算関数

変更ファイル:
  digestor/src/digestor.ts  — trajectoryDigest() 呼び出し
  digestor/src/profiler.ts  — SpeciesEntry に trajectoryStats 追加
```

### Phase 3: クロスセッション解析

```
1. agentId で group_by した軌跡変遷
2. revisitRate の実計算 (前回 centroid 参照)
3. centroidDrift の generation 間比較
4. Observatory で agent trajectory 表示

主に Observatory 側の解析ロジック。
```

### Phase 4: v2 指標昇格 (十分なデータ蓄積後)

```
1. Shannon Entropy (spread の精密版)
2. Spearman 相関 (heat_bias の時間版)
3. PCA1 (軌跡の主成分方向)
4. Curvature (straightness の精密版)

昇格基準: 平均 waypoints > 10/session かつ species trails > 20
```

---

## DB への影響 (永続化検討への入力)

```
trail-log が最大のデータ量:
  1セッション ≈ waypoints × 384D float × 4bytes = ~15KB (10 waypoints)
  50セッション/日 → ~750KB/日 → ~22MB/月

summary を trajectoryDigest() で計算して保存すれば、生 waypoints は
一定期間後に truncate 可能 (summary は保持)。

DB テーブル設計の候補:
  trails          — sessionId, loadout, timestamp, summary (5指標 + centroid)
  trail_waypoints — sessionId, seq, position (BLOB), heat, nodeId
  ※ waypoints は別テーブル → 古いものから削除しやすい

保持ポリシー:
  直近 30日: 全 waypoints 保持 (再計算、詳細分析用)
  30日以降: summary のみ保持、waypoints 削除
```

---

## Digestor / Observatory の思想的位置づけ

```
Digestor   = 代謝 (自然選択、species memory の更新)
             eval-log を食べて species-profile を排出する
             「何を覚えるか」の決定者

Observatory = 生態観測 (パターン検出、異常検知)
              trail を見て空間生態統計を出す
              「何が起きているか」の記録者

初期は Digestor に同居 (IO Gateway 共有、generation 管理の利便性)
分離する場合: trajectoryDigest() をそのまま外出しすればよい
```

---

## 定数候補

| 定数 | 候補値 | 備考 |
|------|--------|------|
| MIN_WAYPOINTS | 2 | 統計計算の最小 waypoint 数 |
| MIN_SPECIES_TRAILS | 5 | 種族集約の最小セッション数 |
| TRAIL_RETAIN_DAYS | 30 | 生 waypoints の保持日数 (summary は永続) |

v1 ではパラメータを最小限に保つ。ENTROPY_BINS 等は v2 で必要になる。
