# Judgment Daemon Vision

**Date**: 2026-02-08
**Status**: 構想メモ (実装予定なし、将来参照用)

---

JSONデータであれば　スフィアに受肉させられる　減衰などのパラメタ調整したうえで
特定種族に武器を持たせ　複数スウォーム、評価を付けていく
最終成果物としてのスコアが付き　選別の対象となる　琥珀だけを吸い上げるなど


## 現在の構造

```
phi-agent ──→ ollama:11434  (Sphere 探索の判断)
pool-service ──→ ollama:11434  (外部データのスコアリング)
                    ↑
            同じ ollama、互いを知らない (A案: 独立)
```

## 将来の構造 (B案: Judgment Core)

```
            ┌────────────────┐
外部 JSON →│  Judgment Core  │→ Sphere / Pool / 他世界
            │  (phi-evolved)  │
            └───────┬────────┘
                    │
                 ollama
```

### 三層モデル

| 層 | 役割 | 現在の実体 |
|----|------|-----------|
| ollama | 脳 (推論エンジン) | ollama + phi3:mini |
| phi | 人格付き身体 (判断エンジン) | phi-agent (Sphere 専属) |
| 環境 | 判断対象の供給元 | Sphere / Pool / 他サービス |

### Judgment Service API (構想)

```
POST /judge
{
  data: { title, body, tags, ... },   // 任意の標準 JSON
  loadout: "scout",                    // 人格選択
  weapons: ["sentinel", "curator"],    // フィルタ選択
  metricsSchema: "default"             // metrics 定義
}

→ Response:
{
  scores: { authority: 0.8, novelty: 0.6, coherence: 0.9, catalyst: 0.7 },
  metrics: { heat: 75, weight: 85, decay: 5 },
  flags: 0x0007,
  verdict: "accept",
  weaponScores: [...]
}
```

## 既存部品の対応表

| 既存コンポーネント | Judgment Service での役割 |
|-------------------|-------------------------|
| Loadout (9 presets) | `config.personality` — 何を重視するか |
| Weapon (flagBias × ratioMod) | `config.filters` — 多面評価フィルタ |
| FastGate (4D dot product) | `scoring.core` — 高速スコアリング |
| ThermometerScores (4D) | `metrics.schema` — 測定次元定義 |
| Membrane (標準JSON → 内部) | `input.adapter` — 入口変換 |
| submitToSphere (内部 → Sphere) | `output.adapter` — 出口変換 |
| evalFocus (性格別プロンプト) | `prompt.personality` — LLM への問い方 |

**欠けているのは API 化だけ。部品は全部存在する。**

## phi-agent の進化パス

```
Phase 1 (現在): Sphere Resident
  - Sphere 内を歩き回り、ノードを評価する住人
  - Loadout/Weapon/Feelings は Sphere 体験から生成

Phase 2 (Pool 経由): 判断インフラの外部露出
  - Pool が同じ Weapon パターンを独立実装
  - 標準 JSON 受付で Sphere を知らなくても判断可能

Phase 3 (将来): Judgment Daemon
  - phi-agent が「判断 API」を提供するサービスに昇格
  - Sphere/Pool/他サービスが共通の判断エンドポイントを叩く
  - 人格 (Loadout) × 武器 (Weapon) × 環境 (adapter) の組み合わせ
```

## 設計上の注意点

### Feelings の環境依存性

現在の Feelings は Sphere 内体験から生成:
- satisfaction: ノード品質 (S·Q)
- frustration: 評価失敗率
- stamina: エネルギー消費
- staleness: エントロピー (多様性)

Judgment Daemon 化する際、Feelings の供給元が問題になる:
- **Option 1**: Feelings を環境非依存にする (純粋に入力データから算出)
- **Option 2**: 環境ごとのアダプター (Sphere adapter, Pool adapter, etc.)
- **Option 3**: Feelings を廃止し、Loadout + Weapon だけで判断 (stateless)

Option 2 が自然だが、Option 3 (stateless) の方が API として使いやすい。
Feelings は「長期滞在する住人」の概念であり、1回きりの判断リクエストには不要かもしれない。

→ **Judgment = Loadout + Weapon (stateless), Feeling = 住人の記憶 (stateful)**
  この分離が鍵になる。

→ **See also**: [FEELINGS_AS_ECOSYSTEM_MEMO.md](./FEELINGS_AS_ECOSYSTEM_MEMO.md)
  — Feelings は消えるのではなく、環境に堆積して循環している。
  Sphere の物理エンジン全体が既に Feelings バッファとして機能している。

## なぜ今は A (独立) が正しいか

1. **単一障害点回避**: phi-agent 死亡 ≠ Pool 死亡
2. **境界未確定**: Feelings/Weapon/metrics がまだ流動的。中枢化は固まってから
3. **発見フェーズ**: 構造の発見が先、プロダクション最適化は後
4. **生態系の健全性**: 独立したサービスが互いの障害に影響されない

## 結論

B案は「思想として正しく、時期として早い」。
A案で実運用しながら、部品が安定した段階で自然に B に移行する。
統合は意図的にやるのではなく、部品が揃った時に「もう統合するしかない」と感じた時にやる。
