# Sphere Snapshot & sphere_hash — 実装メモ

**Date**: 2026-02-13
**Status**: 実装完了
**関連**: `INFORMATION_PHYSICS_ENGINE_DESIGN.md` Section 2

---

## 1. 目的

世代アーカイブ (gen-NNN.json) に Sphere の物理状態を記録し、
**実験の再現性**と**環境変化の追跡**を可能にする。

> 「この時、世界はこうだった」に戻れる三つ組: (sphere_hash, agent_config, timestamp)

---

## 2. 実装内容

### 2.1 Periphery: `GET /sphere/snapshot`

**場所**: `periphery/src/server.ts`

1回の呼び出しで Sphere の全物理状態を返す。

```jsonc
{
  "timestamp": "2026-02-13T12:00:00.000Z",
  "nodeCount": {
    "active": 42, "amber": 5, "ghost": 15,
    "fossil": 3, "relic": 0, "environment": 0, "total": 65
  },
  "heatDistribution": { "mean": 45.2, "std": 30.1, "min": 0, "max": 100 },
  "weightDistribution": { "mean": 60.0, "std": 15.3, "min": 10, "max": 100 },
  "flagDistribution": { "1": 12, "2": 8, "128": 15, "256": 3 },
  "fertility": { "total": 1234.5 },
  "field": { "intensity": 0.6, "dominantFlags": 130, "volatility": 0.3 }
}
```

**データソース**:
| フィールド | ソース |
|-----------|--------|
| nodeCount | ProjDB (Map イテレーション) |
| heat/weightDistribution | ProjDB node.metrics.h / .w |
| flagDistribution | ProjDB node.metrics.flg (全16bit走査) |
| fertility | SpatialField Map (全セル合計) |
| field | GlobalFieldLayer.getGlobalField() |

**変更箇所**:
- `server.ts`: `SpatialField` import 追加、constructor に `spatialFields` パラメータ追加
- `index.ts`: `spatialFields` Map をサーバーに渡す

### 2.2 Digestor: sphere_hash 計算 + gen-NNN.json 拡張

**場所**: `digestor/src/digestor.ts`

digest() サイクルの Step 0 で `GET /sphere/snapshot` を取得。

```
digest() フロー:
  Step 0: fetchSphereSnapshot()         ← NEW (Sphere オフライン時は null)
  Step 1: scoreAll() (balanced_qv × time_decay)
  Step 2: prune() (survival lottery)
  Step 3: buildProfile() (aggregate + environmental blend)
  Step 4: writeProfile()
  Step 5: saveGeneration() + sphere_hash ← MODIFIED
  Step 6: truncateLog()
```

**sphere_hash 算出**:
```typescript
sphere_hash = sha256({
  nodeCount,
  heatDistribution,
  weightDistribution,
  flagDistribution,
  fertility,
  generation
}).slice(0, 16)  // 64-bit short hash
```

**環境変数**: `SPHERE_URL` (default: `http://localhost:3001`)

### 2.3 gen-NNN.json 新フォーマット

```jsonc
{
  "generation": 9,
  "timestamp": "2026-02-13T...",
  "sphereHash": "a1b2c3d4e5f6g7h8",  // NEW — null if Sphere offline
  "inputEvaluations": 52,
  "survivedEvaluations": 45,
  "hunger": 0.42,
  "halfLifeHours": 72,
  "sphereSnapshot": {                   // NEW — omitted if Sphere offline
    "nodeCount": { "active": 42, "amber": 5, ... },
    "heatDistribution": { "mean": 45.2, "std": 30.1, "min": 0, "max": 100 },
    "weightDistribution": { "mean": 60.0, "std": 15.3, "min": 10, "max": 100 },
    "flagDistribution": { "1": 12, "2": 8, "128": 15 },
    "fertility": { "total": 1234.5 },
    "field": { "intensity": 0.6, "dominantFlags": 130, "volatility": 0.3 }
  },
  "species": { ... },
  "global": { ... }
}
```

---

## 3. 設計判断

### Graceful Degradation
- Sphere がオフラインでも Digestor は動作する
- `sphereHash: null`, `sphereSnapshot` フィールド省略
- 種族記憶の代謝は環境スナップショットなしでも継続

### ハッシュ長: 16文字 (64-bit)
- 完全な SHA-256 (64文字) は過剰 — 世代識別には 64-bit で十分
- 衝突確率: 2^32 世代 (~40億) まで安全 (Birthday Paradox)
- 人間が読める長さ

### generation をハッシュ入力に含める理由
- 同一 Sphere 状態でも世代が異なれば異なるハッシュ
- 世代間の差分追跡が明確になる
- species-profile の内容はハッシュに含めない (Digestor 出力は Sphere 状態ではない)

### field を snapshot に含めるが hash には含めない理由
- field (intensity, volatility) は高頻度で変動する
- ハッシュに含めると同一物理状態でもハッシュが変わる
- field は「気象」、nodeCount/distribution は「地形」— 地形の同一性を記録したい

### flagDistribution のキー形式
- NodeFlag enum 値 (数値) をキーとして使用
- 例: `"1": 12` = TemporalShort が 12 ノードに付与
- 文字列変換は Digestor/Explorers の責務

---

## 4. 活用方法

### 世代間比較
```
gen-008 sphereHash: a1b2c3d4e5f6g7h8
gen-009 sphereHash: b2c3d4e5f6g7h8i9  ← 環境が変化した
gen-010 sphereHash: b2c3d4e5f6g7h8i9  ← 環境は同一 (評価のみ変化)
```

### 実験再現性
- 同じ sphereHash + 同じ loadout → 同じ環境条件で再実験可能
- sphereSnapshot の詳細データで環境の質的変化を追跡

### Explorers 可視化 (将来)
- 世代ごとの nodeCount 推移グラフ
- heat/weight 分布の変化追跡
- flagDistribution の進化パターン

---

## 5. Docker 環境での設定

```yaml
# docker-compose.yml (digestor service)
environment:
  - SPHERE_URL=http://periphery:3001  # Docker ネットワーク内
  - DATA_DIR=/app/data
  - DIGEST_INTERVAL_MS=10800000       # 3h
```

ローカル開発:
```
SPHERE_URL=http://localhost:3001      # default
```

---

## 6. 未実装 (将来構想)

- [ ] `sphere-state.json` — 最新スナップショットの独立ファイル出力
- [ ] `agent_config_hash` — セッション開始時の三つ組完成
- [ ] `evaluation_consistency` — 同一ノード再評価時の一致度
- [ ] `learned_δ` — フラグ重み学習 (効果未知、慎重に段階的)
- [ ] Explorers での sphereSnapshot 可視化

---

*Created: 2026-02-13*
*世代アーカイブが自動的に実験ログになった。追加コストは API 1本 + ハッシュ計算のみ。*
