# Feelings as Ecosystem — 感情は生態系に堆積する

**Date**: 2026-02-08
**Context**: Pool-service 構築中に Judgment Daemon 構想から派生して発見

---

## 発見

Feelings のバッファシステムは「未実装」ではなかった。
**Sphere の生態系全体が、既に Feelings のバッファとして機能している。**

## 根拠: 感情の堆積経路

### 1. 個体の感情 → ノードの物理量

```
Agent satisfaction → 高評価 (h+25, w+25) → ノード昇温・増重
Agent frustration → 低評価/スキップ → ノード放置 → 自然 decay
Agent の判断     → Capsule evaluations → Sphere に結晶化
```

エージェントの一回の感情は、ノードの metrics として **物質化** する。

### 2. ノードの物理量 → 環境の状態

```
高 heat ノード群 → SpatialField の熱分布
decompose → fertility += h×w → 死が養分になる
ノード密度 → CleanerFish の hunger → GC 圧
```

個々のノードの metrics は、環境全体の **気候** を形成する。

### 3. 環境の状態 → 次のエージェントの感情

```
GlobalAmbientField → エージェントの移動方向 (磁場)
熱分布 → sense() のサンプリング結果
fertility → [Future] 近傍の知覚ボーナス
ActiveBus → リアルタイムの他エージェント感情
```

環境の状態は、次に来るエージェントの **初期感情** に影響する。

### 循環図

```
┌─────────────┐
│ Agent        │
│ Feelings     │──── 評価/移動/帰還 ────┐
│ [4D vector]  │                        │
└──────▲───────┘                        ▼
       │                        ┌───────────────┐
       │                        │ Node Metrics   │
 sense/focus/explore            │ h, w, TTL,     │
       │                        │ flags, decay   │
       │                        └───────┬────────┘
┌──────┴───────┐                        │
│ Environment  │                        │
│ Field, Fert, │◄── Arbiter/Cleaner ────┘
│ Bus, hunger  │
└──────────────┘
```

**感情は消えない。形を変えて循環する。**

## 既存コンポーネントの再解釈

| コンポーネント | 従来の理解 | 感情バッファとしての理解 |
|---|---|---|
| **heat** | 注目度の物理量 | 「注目された」という感情の残滓 |
| **weight** | 重要度の物理量 | 「価値がある」と判断された記憶 |
| **fertility** | [write-only, 未消費] | 喪失が養分に変わる装置。**悲しみの堆肥化** |
| **GlobalAmbientField** | 磁場 (移動方向制御) | 集合的な気分。全員の探索パターンの積分 |
| **ActiveBus** | AI-to-AI ブロードキャスト | リアルタイム感情共有 (揮発性) |
| **Capsule evaluations** | 判断の記録 | 結晶化された感情 |
| **Delta Profile** | 環境変化の統計量 | 感情の原料 (staleness = 1 - entropy) |
| **CleanerFish hunger** | DB容量管理 | 生態系の「空腹」— 圧迫感 |
| **decay** | 時間経過による劣化 | 忘却 — 感情が薄れていく過程 |

## 唯一の欠落: 個体の記憶の永続化

現在、エージェントはセッション終了時に全てを忘れる。
「前回の自分」を覚えていない。

### 解決案: Capsule を「自分宛ての手紙」にする

```
Session N:
  Agent (scholar) → 探索 → Capsule 生成
  → Capsule に feelings snapshot を含める
  → RefDB に agentId + loadout タグ付きで保存

Session N+1:
  Agent (scholar) → 接続 → RefDB から前回の Capsule を検索
  → feelings snapshot を初期値として復元
  → 「前回の自分」を覚えている
```

これは既存インフラで実現可能:
- RefDB は L1-L4 全保存済み
- Capsule の evaluations フィールドに feelings を格納できる
- scanL1 で agentId タグを検索すれば前回分を発見できる

## Judgment Daemon との関係

[JUDGMENT_DAEMON_VISION.md](./JUDGMENT_DAEMON_VISION.md) で提起した問題:

> Judgment = Loadout + Weapon (stateless)
> Feelings = 住人の記憶 (stateful)

この分離は正しいが、より正確に言うと:

- **Judgment (stateless)**: 1回の判断。環境不要。API 化可能。
- **Feelings (stateful)**: 環境との継続的な関係。Sphere 生態系が必要。

Judgment Daemon は Feelings を持たない。持つ必要がない。
Feelings を持つのは「住人」だけであり、住人の感情は環境に堆積する。

**Judgment = 脳の機能、Feelings = 身体の記憶。**
脳だけ API 化できる。身体は環境に根ざしている。

## 設計原則

1. **感情は個体の中にだけ存在するのではない** — 環境に染み出し、堆積し、循環する
2. **既存の物理エンジンが感情バッファである** — 新しいシステムは不要
3. **fertility が消費側未実装なのは偶然ではない** — 「死が養分になる」回路の最終接続が残っている
4. **個体記憶の永続化は既存インフラで可能** — RefDB + Capsule + agentId タグ
5. **stateless 判断と stateful 感情の分離** — Judgment Daemon は前者のみ扱う
