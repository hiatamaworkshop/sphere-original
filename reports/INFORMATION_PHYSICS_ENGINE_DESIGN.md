# Sphere as Information Physics Engine — 設計構想

**Date**: 2026-02-13
**Status**: 構想・議論段階
**関連**: `STIGMERGY_ARCHITECTURE.md`, `SPHERE_ECOSYSTEM_DESIGN.md`, `FLAG_SYSTEM_REDESIGN.md`

---

## 1. 基本認知の転換

### 1.1 Agent は主役ではない

```
旧: Agent がスフィアを「使う」
新: Sphere が物理で、Agent はセンサー（粒子）
```

- Loadout = Sphere 側の観測テンプレート（エージェントの装備ではない）
- Species Memory = Sphere に付随する知識（エージェントの学習ではない）
- Weapons = Sphere の知覚フィルタ（エージェントの武器ではない）
- Feelings = Sphere 環境への動的応答（エージェントの感情ではない）

**全て Sphere 側の環境条件。** Agent はその間を流れる粒子。

### 1.2 因果の流れ

```
Agent → Sphere physics → Agent behavior → Sphere update → next Agent behavior
```

エージェントとスフィアは**一切混ざらない**。カップリングレイヤーは Sphere 側に属する。

### 1.3 アーキテクチャ上の位置づけ

```
Sphere (Periphery)
├── Physics (RenalCore)
│     decay, fertility, spatial field, flags
├── Metabolism (Arbiter/Bookkeeper/CleanerFish)
│     state transitions, hunger, decompose
├── Sensory Apparatus (Sphere 側)
│     Loadout, Weapons, FastGate, Digestor, Species Memory
│
├── Coupling Interface (外界との接点)
│   ├── HTTP/WS API (直接アクセス)
│   ├── pool-service (外部データ受付)
│   └── phi-agent (自律センサー = Periphery の触手)
```

- phi-agent は「Periphery の別玄関」ではなく「Periphery の触手」
- 外部に配置されていても概念的には Sphere の一部
- あらゆる外部エージェントが Loadout + Weapons の恩恵を受けられるのが正式
- エージェントの学習は外部研究者の領域。Sphere が提供するのは**環境の体験**

---

## 2. 情報物理実験としてのスフィア

### 2.1 再現可能性の三つ組

```
(sphere_hash, agent_config_hash, timestamp)
```

| 要素 | 内容 | 更新タイミング |
|------|------|---------------|
| **sphere_hash** | Sphere 状態のスナップショットハッシュ | Digestor 実行後に必ず更新 |
| **agent_config_hash** | species + loadout + bias の組み合わせ | Agent セッション開始時 |
| **timestamp** | 実行時刻 | 常時 |

この三つ組で「この時、世界はこうだった」に戻れる。

### 2.2 sphere_hash の構成要素

```
sphere_hash = sha256({
  node_count: { active, ghost, fossil },
  heat_distribution: { mean, std, min, max },
  weight_distribution: { mean, std, min, max },
  flag_distribution: { per-flag counts },
  fertility_field: { total, distribution summary },
  hunger: number,
  species_profile_hash: sha256(species-profile.json),
  generation: number
})
```

### 2.3 ログ構造

```jsonc
// セッション開始時
{
  "t0": {
    "sphere_hash": "sha256-...",
    "gate_params": { /* FastGate weights snapshot */ },
    "heat_distribution": { "mean": 45.2, "std": 30.1 },
    "digestor_state": { "generation": 8, "hunger": 0.37 }
  },
  "agent": {
    "species": "scout",
    "loadout_hash": "sha256-...",
    "energy": 200
  },
  "action_trace": {
    "nodes_visited": ["node1", "node2", ...],
    "scores": [{ "h": 8, "w": 7, "d": 3 }, ...],
    "decisions": ["focus", "evaluate", "move:hot", ...],
    "return_vector": [0.6, 0.3, 0.8, 0.2]  // feelings at return
  }
}
```

これで:
- **再現可能**: 同じ sphere_hash + agent_config で同じ実験を再実行
- **比較可能**: 異なるモデル/種族の行動を同一環境で比較
- **分岐点が見える**: どの世代境界で行動パターンが変化したか追跡

### 2.4 Digestor 世代アーカイブへの統合

```jsonc
// gen-NNN.json に sphere_hash を追加
{
  "generation": 9,
  "timestamp": "2026-02-13T...",
  "sphere_hash": "sha256-...",     // NEW
  "inputEvaluations": 52,
  "survivedEvaluations": 45,
  "hunger": 0.42,
  "species": { ... }
  // 将来: "learned_delta": { ... }
}
```

世代アーカイブが自動的に**実験ログ**になる。追加実装コストはハッシュ計算のみ。

---

## 3. フラグシステムの進化: 二値 → 学習重み

### 3.1 現在の構造

```typescript
// FastGate flagBias (静的設計定数)
if (flag & Authority) score *= 1.2;   // yes/no の世界
```

16bit フラグは「立ってる/立ってない」の二値。FastGate の flagBias が重みを付与。

### 3.2 目指す構造

```typescript
// Phase 1: 設計定数 × 学習微調整
effective = base_bias[flag] × (1 + learned_δ[flag])

// Phase 2 (将来): 完全学習重み
score = Σ feature[i] × gate_weight[i]
```

### 3.3 二層分離設計

| 層 | 名前 | 性質 | 更新 |
|----|------|------|------|
| base_bias | 種族の「遺伝子」 | 不変の物理定数 | なし (Loadout 定義) |
| learned_δ | 種族の「後天的適応」 | bounded ±0.3 | Digestor が世代ごとに更新 |

**なぜ二層か:**
- 全置換すると全種族が同じ最適解に収束するリスク (Authority が客観的に良いなら全員 Authority 重視)
- base_bias が種族の個性を保証。learned_δ は環境への微適応
- 「性格は Loadout に宿る」原則を壊さない

### 3.4 フラグ自体は連続値にしない

> structuredness ∈ [0,1], modality_cost ∈ [0,1] ...

フラグ付与の連続値化は**外部 (pool-service等) の負担が増える**。

**中間案: フラグは 0/1、重みだけ連続値**

```
フラグ付与 = 外部の判断 (二値、変えない)
フラグ効果 = Sphere の物理 (learned_weight)
```

- フラグの組み合わせ = 高次元ベクトル空間 (16bit = 65536 通り)
- 既にベクトルである。連続値にする必要はない。**重みを学習させるだけで十分**

---

## 4. Experience Score — 探索の質の測定

### 4.1 概念

Agent の評価セッション全体に「探索の質」メタスコアを付与し、
FastGate / Weapons の重みを調整するフィードバック信号にする。

```
Agent 探索 → evaluations → experience_score 算出
                                    ↓
                          Digestor: learned_δ 更新
                                    ↓
                          次世代の FastGate weights 変化
```

### 4.2 experience_score の候補指標

| 指標 | 定義 | Sphere 適合度 |
|------|------|-------------|
| **evaluation_consistency** | 同一ノード再評価時のスコア一致度 | ★★★ センサー精度 |
| **coverage_diversity** | 訪問ノードの tags エントロピー | ★★☆ 探索幅 |
| **satisfaction** | feelings の S·Q | ★☆☆ 主観的 |
| **decay_coherence** | d スコアと reason の一致度 | ★★★ 測定品質 (外部評価要) |

**推奨: evaluation_consistency (同一ノードへの再評価一致度)**

理由: Sphere が測りたいのは「センサーの精度」であり「センサーの満足度」ではない。
同じノードを異なるセッションで評価した時のばらつきが小さい = 安定した測定 = 良い探索。

### 4.3 learned_δ 更新ロジック (構想)

```
Digestor gen-NNN 処理時:
  1. 各種族の evaluation_consistency を算出
  2. flag 別に「高 consistency 時に活性だった flag」を統計
  3. 正の相関があった flag の learned_δ を +ε
  4. 負の相関があった flag の learned_δ を -ε
  5. clamp(learned_δ, -0.3, +0.3)
  6. gen-NNN.json に learned_δ を記録
```

例: scout が Authority フラグ付きノードを安定的に評価 → `Authority.learned_δ += 0.05`

---

## 5. 思想の整理

### 5.1 Sphere の真価

> スフィア体験の一連を経ることでモデルが自然とそのようにふるまえるという環境の提示

Sphere は「エージェントを育てる場所」ではない。
Sphere は「環境を理解しコントロールするための物理エンジン」。

- エージェントの学習 = 外部研究者の領域 (GPU を使えばよい)
- Sphere が提供するのは = **再現可能な情報環境** + **スナップショットの蓄積**
- スナップショットの蓄積にこそ Sphere の真価がある

### 5.2 if/else からの脱却

```
if/else = 1/0 の世界
重み付け = 確率の世界 (if → ×1.2)
ベクトル内積 = 連続的な類似度の世界
learned_weight = 環境が発見した物理定数
```

FastGate は既に「重み付き if」。これを「学習された重み」にするだけで
「最初の情報物理エンジン」になる。

### 5.3 Digestor の役割拡張

| 現在 | 将来 |
|------|------|
| 種族記憶の代謝 | + 環境物理定数の学習 |
| species-profile.json 出力 | + sphere-state.json 出力 |
| 淘汰 + 生存抽選 | + experience scoring |
| 世代アーカイブ | + sphere_hash 記録 |

Digestor が「自然選択」だけでなく「環境の自己認識」も担う。

---

## 6. 実装優先度

| 優先度 | 項目 | 工数 | 効果 |
|--------|------|------|------|
| **P0** | sphere_hash を gen-NNN.json に追加 | 小 | 実験再現性の基盤 |
| **P1** | セッションログ構造の定義 | 小 | action trace の標準化 |
| **P2** | evaluation_consistency 指標の実装 | 中 | 探索品質の定量化 |
| **P3** | learned_δ の Digestor 統合 | 中 | FastGate 重みの自動調整 |
| **P4** | sphere-state.json の導出 | 小 | 環境状態の外部公開 |

P0 は Digestor に数行追加するだけ。P3 が本丸。

---

## 7. 未決事項

- [ ] sphere_hash に含める要素の最終確定
- [ ] experience_score の具体的な算出式
- [ ] learned_δ の更新頻度 (毎世代 vs N世代ごと)
- [ ] learned_δ の初期値 (0 vs base_bias からの偏差)
- [ ] 全種族共通の learned_δ vs 種族別 learned_δ
- [ ] sphere-state.json のスキーマ定義
- [ ] Explorers での learned_δ 可視化

---

*Created: 2026-02-13*
*This document captures the design direction for Sphere's evolution from a stigmergic agent system into a reproducible information physics experiment platform.*
