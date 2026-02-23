# エージェント移動ロジック再設計メモ — 2026-02-23

## 現状の構造

### chooseAction: Feelings → アクション種別

```
入力: energyRatio (= currentEnergy / initialEnergy)
  ↓
4次元感情:
  sat   = qualityProfile · qualityVector  (品質満足度)
  frust = missRate + recentDecline         (不満)
  stam  = 1 - energyRatio                  (疲労)
  stale = 1 - deltaEntropy                 (退屈)
  ↓
dominant (最大値 > 0.5):
  sat   → CAMP   (移動なし、再 sense)
  frust → LEAP   (大移動 0.6)
  stale → LEAP   (0.5, explore 強制)
  stam  → SCOUT  (sense のみ)
  none  → STANDARD (通常 0.3)
```

### moveMode: 種族ごとに固定

| 種族 | walkPreference |
|------|---------------|
| moth / hunter / sniper | `hot` |
| scholar / archivist | `deep` |
| scout / wanderer / balanced | `explore` |

### shouldReturn: 感情ベクトル内積

```
feelings = [sat, frust, stam, stale]
desire = feelings · returnWeights       // 内積 → スカラー
prob = clamp((desire - 0.5) × 2)        // 確率に変換
return = random() < prob
```

**この「ベクトル内積 → スカラー → 判定」のパターンは既に抽象化されている。**

---

## 問題点

### 1. moveMode がセッション中変化しない

`walkPreference` はコンストラクタで固定。唯一の動的上書きは `stale → explore` のみ。

```
frustrated な scholar → deep のまま逃げる (本来は hot で離脱すべき)
satisfied な moth    → hot のまま留まる (camp = moveStep=0 なので影響なし)
```

**moveMode は「どの方向に進むか」を決める最も重要な変数**なのに固定されている。

### 2. moveStep に種族差がない

全種族共通 (standard=0.3, leap=0.6)。

### 3. Feelings 閾値が全種族共通

`threshold = 0.5` で固定。

### 4. flow フォールバックが無言

gradient move 失敗 → `flow` にフォールバックしてもログ出力なし。

---

## Sphere 側 move() の現状 (参考: MOVE_DESIGN_MEMO)

Sphere の `move()` は既に正しく機能している:

```
direction = modeDirection × (1 - fieldWeight) + globalField × fieldWeight

fieldWeights:
  random: 0.0   (完全ランダム)
  hot:    0.5   (heat 重心 + 磁場)
  fresh:  0.5   (h×d 重心 + 磁場)
  deep:   0.5   (w×(1-d) 重心 + 磁場)
  explore: 0.3  (1/(w+1) 重心 + 磁場弱め)
  flow:   1.0   (磁場100%)
```

**修正対象は Sphere 側ではなく、Agent 側の mode 選択ロジックのみ。**

---

## 再設計: 感情ドリブン moveMode 選択

### 核心: returnWeights と同じ構造を moveMode に適用

`shouldReturn` の構造:
```
desire = feelings · returnWeights  → スカラー → 確率
```

これを moveMode 選択に拡張:
```
score[hot]     = feelings · modeWeights.hot
score[deep]    = feelings · modeWeights.deep
score[explore] = feelings · modeWeights.explore
score[flow]    = feelings · modeWeights.flow
score[random]  = feelings · modeWeights.random

winner = argmax(score)
```

### Loadout への追加

```typescript
// 既存
returnWeights: [0.5, 0.1, 0.2, 0.2],  // [sat, frust, stam, stale] → return 欲求

// 新規: 各 moveMode への傾向 (同じ 4D ベクトル)
modeWeights: {
  //              [sat,  frust, stam, stale]
  hot:           [0.8,  0.1,  0.0,  0.0],  // 満足時に hot を選ぶ
  deep:          [0.1,  0.0,  0.0,  0.1],  // moth は deep をほぼ選ばない
  explore:       [0.0,  0.3,  0.0,  0.8],  // 退屈・不満で explore
  flow:          [0.0,  0.0,  0.9,  0.0],  // 疲労で flow
  random:        [0.0,  0.5,  0.0,  0.0],  // 不満でパニック逃走
},
```

### 計算例: moth

```
feelings = [sat=0.8, frust=0.1, stam=0.2, stale=0.0]

score[hot]     = 0.8×0.8 + 0.1×0.1 + 0.2×0.0 + 0.0×0.0 = 0.65
score[deep]    = 0.8×0.1 + 0.1×0.0 + 0.2×0.0 + 0.0×0.1 = 0.08
score[explore] = 0.8×0.0 + 0.1×0.3 + 0.2×0.0 + 0.0×0.8 = 0.03
score[flow]    = 0.8×0.0 + 0.1×0.0 + 0.2×0.9 + 0.0×0.0 = 0.18
score[random]  = 0.8×0.0 + 0.1×0.5 + 0.2×0.0 + 0.0×0.0 = 0.05

→ winner: hot (0.65)  ← 満足した moth は heat を追う
```

```
feelings = [sat=0.2, frust=0.7, stam=0.3, stale=0.1]

score[hot]     = 0.2×0.8 + 0.7×0.1 + 0.3×0.0 + 0.1×0.0 = 0.23
score[random]  = 0.2×0.0 + 0.7×0.5 + 0.3×0.0 + 0.1×0.0 = 0.35
score[explore] = 0.2×0.0 + 0.7×0.3 + 0.3×0.0 + 0.1×0.8 = 0.29

→ winner: random (0.35)  ← 不満な moth はパニック逃走
```

### 種族別 modeWeights プロファイル案

```
moth (heat 中毒):
  hot:     [0.8, 0.1, 0.0, 0.0]   ← 満足→もっとheat
  random:  [0.0, 0.5, 0.0, 0.0]   ← 不満→パニック
  flow:    [0.0, 0.0, 0.9, 0.0]   ← 疲労→磁場追従
  explore: [0.0, 0.3, 0.0, 0.8]   ← 退屈→冒険

scholar (安定志向):
  deep:    [0.7, 0.0, 0.0, 0.0]   ← 満足→深掘り
  explore: [0.0, 0.6, 0.0, 0.5]   ← 不満/退屈→視野を広げる
  flow:    [0.0, 0.0, 0.8, 0.0]   ← 疲労→磁場追従
  hot:     [0.2, 0.3, 0.0, 0.0]   ← 不満で少しheat参照

hunter (成果重視):
  hot:     [0.5, 0.0, 0.0, 0.0]   ← 満足→追撃
  explore: [0.0, 0.7, 0.0, 0.6]   ← 不満/退屈→場所替え
  flow:    [0.0, 0.0, 0.7, 0.0]   ← 疲労→磁場追従
  random:  [0.0, 0.2, 0.0, 0.0]   ← 不満で少し逃走

scout (探索特化):
  explore: [0.6, 0.4, 0.0, 0.7]   ← ほぼ常に explore
  flow:    [0.0, 0.0, 0.8, 0.0]   ← 疲労→磁場追従
  hot:     [0.3, 0.0, 0.0, 0.0]   ← 満足→少しheat
```

### chooseAction の統一

現行の switch + dominant 判定を **内積ベースに統一**:

```typescript
chooseAction(energyRatio: number): Action {
  const feelings = this.computeFeelings(energyRatio);
  const f = [feelings.sat, feelings.frust, feelings.stam, feelings.stale];

  // 1. moveMode を感情内積で決定
  let bestMode: WalkMode = this._walkPreference;
  let bestScore = -Infinity;
  for (const [mode, weights] of Object.entries(this.modeWeights)) {
    const score = f[0]*weights[0] + f[1]*weights[1] + f[2]*weights[2] + f[3]*weights[3];
    if (score > bestScore) {
      bestScore = score;
      bestMode = mode as WalkMode;
    }
  }

  // 2. アクション種別も感情から (既存ロジック維持)
  //    ※ここは変更不要、dominant 判定のままで良い

  // 3. moveStep は種族スケーリング
  const baseStep = actionBaseStep[actionType];  // standard=0.3, leap=0.6
  const moveStep = baseStep * this.stepScale;

  return { type: actionType, moveStep, moveMode: bestMode };
}
```

**ポイント: returnWeights, modeWeights, qualityVector が全て同じ感情 4D ベクトルに対する射影。**
同一の `computeFeelings()` から 3 つの判定が導出される。

```
feelings ─┬─→ · qualityVector  → sat (品質評価)
           ├─→ · returnWeights  → return 欲求
           └─→ · modeWeights[m] → moveMode 選択   ← 新規
```

---

## actionType (camp/leap/scout/standard) はどうするか

moveMode の内積選択と **独立して維持**。理由:

- actionType は「何をするか」(sense のみ / focus+eval / 大移動)
- moveMode は「どこへ向かうか」(heat方向 / 安定方向 / 未知方向)
- 直交する関心事

ただし dominant 判定 (threshold=0.5) は硬直的なので、
将来的に actionType も内積ベースに置換する余地はある。

---

## stepScale (種族差)

```typescript
// Loadout に追加
stepScale: number;  // 0.5 (慎重) ～ 1.5 (俊敏)
```

| 種族 | stepScale | standard | leap |
|------|-----------|----------|------|
| moth | 1.3 | 0.39 | 0.78 |
| scholar | 0.7 | 0.21 | 0.42 |
| hunter | 1.0 | 0.30 | 0.60 |
| scout | 1.5 | 0.45 | 0.90 |
| archivist | 0.6 | 0.18 | 0.36 |

---

## 感情内積パターンの全体適用マップ

### computeFeelings() からの射影一覧

```
                    ┌→ · qualityVector   → sat (品質評価)      [既存]
feelings [4D] ──────┼→ · returnWeights   → return 判定         [既存]
                    ├→ · modeWeights[m]  → moveMode 選択       [新規: 本メモ主題]
                    └→  (将来: 他の判定への射影を追加可能)
```

### エージェント全意思決定ポイント (71箇所) の分類

| 区分 | 数 | 例 |
|------|----|----|
| 既に感情/性格ドリブン | 31 | chooseAction, shouldReturn, pickFocusTarget, flagBias |
| 内積パターンで拡張可能 | 18 | moveMode, moveStep, 閾値, bus emit, サイクル数 |
| 構造的/アーキテクチャ (変更不要) | 22 | energy 境界, 訪問済み除外, ペイロード |

### Tier 1: 内積パターンの直接適用 (moveMode)

本メモの主題。`feelings · modeWeights[m] → argmax` で毎サイクル動的選択。

### Tier 2: 閾値・定数の種族化 (Loadout フィールド追加)

| 判定 | 現状 | 拡張 |
|------|------|------|
| Feelings 閾値 | 全種族 0.5 | Loadout に `actionThreshold` 追加 |
| Bus emit 閾値 | h < 8 固定 | Loadout に `busEmitMinH` 追加 |
| Tutorial サイクル数 | 固定 2 | Loadout に `tutorialCycles` 追加 |
| Sanctuary サイクル数 | 固定 2 | Loadout に `sanctuaryCycles` 追加 |
| moveStep 倍率 | 全種族同一 | Loadout に `stepScale` 追加 |

### Tier 3: スコアリング係数の性格化 (将来)

| 判定 | 現状 | 拡張 |
|------|------|------|
| Warp ターゲット選定 | +3/+2/+5/-dist×10 固定 | Loadout に warpWeights |
| Species memory ボーナス | ×3 固定 | 種族で係数変動 |
| Eval-only 候補選択 | first candidate | satisfaction でゲート |
| Frustration 計算の増幅率 | ×2 固定 | 種族で増幅率変動 |

### 変更不要 (アーキテクチャ層)

- エネルギー閾値 (サーバー権威)
- 訪問済み除外 / ghost・fossil 除外
- mock データ検出
- ペイロードエンコーディング
- フォールバック行動 (flow / drift)

---

## 実装優先度

| 項目 | Tier | 影響 | コスト | 優先 |
|------|------|------|--------|------|
| modeWeights (感情内積→moveMode) | 1 | **大** | 中 | ★★★ |
| stepScale (種族歩幅差) | 2 | 中 | 小 | ★★ |
| actionThreshold (感情閾値の種族化) | 2 | 中 | 小 | ★★ |
| tutorialCycles / sanctuaryCycles | 2 | 小 | 極小 | ★ |
| busEmitMinH | 2 | 小 | 極小 | ★ |
| flow フォールバックのログ | — | 小 | 極小 | ★★★ |
| warpWeights / speciesMemoryScale | 3 | 中 | 中 | ★ (将来) |
| actionType の内積化 | 3 | 中 | 中 | ★ (将来) |
| Weapon 補正 | — | 大 | 大 | ★ (Explorers) |

---

## 前提となる修正 (本日完了済み)

| 修正 | 状態 |
|------|------|
| エネルギー同期 (server-authoritative) | ✅ 完了 |
| heatFactor ボーナス専用化 (floor=1.0) | ✅ 完了 |
| sense radius 正規化 (5→1, base 0.3→0.5) | ✅ 完了 |
| warp 失敗 = エネルギー同期バグの副次効果 | ✅ 原因特定済 |

---

## 関連ドキュメント

- `reports/MOVE_DESIGN_MEMO.md` — 移動の物理設計 (384D, drift/toward/toNode)
- `reports/AGENT_MOVE_FALLBACK_FIX_20260223.md` — scanAndWarp + flow フォールバック
- `reports/TUNING_LEDGER_20260220.md` — §8 heatFactor (deprecate 候補)
- `phi-agent/src/fast-gate.ts` — chooseAction, computeFeelings, shouldReturn, Loadouts
- `phi-agent/src/agent.ts` — exploreLoop, standardCycle
