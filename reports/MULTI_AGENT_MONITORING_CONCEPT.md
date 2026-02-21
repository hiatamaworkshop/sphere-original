# Multi-Agent Monitoring 構想メモ

**日付**: 2026-02-01
**作業者**: Claude (Opus 4.5)

---

## 背景

既存の観測システムを調査した上で、複数エージェント放出とその影響モニタリングの構想を整理する。

---

## 既存システムの整理

### 1. Observer (内部・HTTP polling)

```
src/mock/observer.ts
  ↓ HTTP GET /nodes/stats
  ↓ HTTP GET /nodes
Periphery Server
```

**特徴**:
- 直接的な内部アクセス
- ノード統計 (counts, averages)
- Top 5 by heat, Ghost詳細
- 5秒間隔のポーリング

**用途**: 開発時のデバッグ、ノード状態の直接監視

### 2. Observatory (外部・UDP受信)

```
RenalCore
  ↓ PulsePacket (UDP broadcast, 5 tick ごと)
Observatory (独立サービス)
  ↓ 統計的異常検知 (Z-score > 2σ)
  ↓ Environmental Node 注入
Periphery Server
```

**特徴**:
- 疎結合（UDPのみ）
- 環境放射信号の受動的観測
- Sphere の内部を直接見ない
- 「何が起きているか」ではなく「シグナルの変化」を検知

**思想**:
> 「観測は受動的、介入は能動的」
> Observatory は Sphere の「肌理」を感じ取る

### 3. PulseBroadcaster

```typescript
// シグナル構成
sig: {
  a: number;  // Attractant: 肥沃度 + Amber残存熱
  r: number;  // Repellent: Ghost比率
  d: number;  // Density: Active/Relic数
  f: number;  // Flow: 前回からの流動率
}

// フラグ
Burst   (0x01): 急激な熱上昇
Thorn   (0x02): Ghost過多
Bloom   (0x04): Amber結晶化
Drought (0x08): 活性ノード不足
Storm   (0x10): 大量蒸発
```

---

## 構想: Multi-Agent Monitoring

### 目的

1. 複数エージェントを同時放出
2. 彼らの行動がprojectionDBにどう影響するかを観測
3. Sphereの「生態系」としての振る舞いを理解

### 設計原則

```
┌─────────────────────────────────────────────────────────────┐
│  エージェントは互いを見ない                                  │
│  しかし、その足跡は環境に刻まれる                            │
│  観測者は環境の変化からエージェントの存在を推測する          │
└─────────────────────────────────────────────────────────────┘
```

### アーキテクチャ案

```
┌──────────────────────────────────────────────────────────────┐
│                    Multi-Agent Spawner                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │ Agent-1 │ │ Agent-2 │ │ Agent-3 │ │ Agent-N │            │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘            │
│       │           │           │           │                  │
│       └───────────┴───────────┴───────────┘                  │
│                       │                                      │
└───────────────────────┼──────────────────────────────────────┘
                        │ WebSocket (各自独立セッション)
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                    Periphery + Gateway                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    projectionDB                          ││
│  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                     ││
│  │  │Node│ │Node│ │Node│ │Node│ │Node│  ...                 ││
│  │  └────┘ └────┘ └────┘ └────┘ └────┘                     ││
│  └─────────────────────────────────────────────────────────┘│
│                        │                                     │
│  ┌─────────────────────┴─────────────────────────────────┐  │
│  │              RenalCore (Physics Engine)                │  │
│  │  - tick() で代謝処理                                   │  │
│  │  - evaluate による熱量変化                             │  │
│  │  - decay, evaporate, crystallize                       │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │ 5 tick ごと                       │
│                          ▼                                   │
│              ┌─────────────────────┐                         │
│              │   PulseBroadcaster  │                         │
│              │   (UDP broadcast)   │                         │
│              └──────────┬──────────┘                         │
└─────────────────────────┼────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Observer   │  │  Observatory │  │ AgentMonitor │
│  (HTTP poll) │  │  (UDP recv)  │  │   (新規)     │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 新規コンポーネント

### 1. Multi-Agent Spawner (`swarm-agent.ts`)

複数エージェントを並列起動し、それぞれ独立したセッションで動作させる。

```typescript
interface SwarmConfig {
  agentCount: number;           // 放出数
  spawnInterval: number;        // 放出間隔 (ms)
  behavior: "random" | "focused" | "distributed";
  queryTemplate: string;        // "explore {topic}"
  topics?: string[];            // ランダム選択用
}
```

**行動パターン案**:
- `random`: ランダムウォーク、ランダム評価
- `focused`: 特定種類のノードを追跡
- `distributed`: 空間を分割して担当

### 2. Agent Activity Monitor (`agent-monitor.ts`)

エージェントの活動を集約・表示する。

**観測項目**:

| 項目 | 説明 |
|------|------|
| Active Sessions | 現在接続中のセッション数 |
| Total Evaluations | 累計評価回数 |
| Heat Delta | 評価による総熱量変化 |
| Layer Distribution | 各レイヤーのエージェント分布 |
| Hot Zones | 評価が集中している空間領域 |

### 3. ProjectionDB Monitor (`projection-monitor.ts`)

projectionDBの変化をリアルタイムで追跡。

**観測項目**:

| 項目 | 説明 |
|------|------|
| Node Count Trend | 種類別ノード数の推移 |
| Heat Distribution | 熱量のヒストグラム |
| Kind Transitions | 状態遷移 (active→amber→fossil→ghost) |
| Spatial Density | 空間領域ごとの密度 |
| Recent Events | 最新の状態変化イベント |

---

## 実装優先順位

### Phase 1: Swarm Spawner
1. `swarm-agent.ts` - 複数エージェント並列起動
2. 各エージェントの独立セッション管理
3. 起動パラメータ（数、間隔、行動パターン）

### Phase 2: projectionDB Monitor
1. `/nodes/stats` の拡張または新規エンドポイント
2. 時系列データの収集
3. CLI表示 + ログ出力

### Phase 3: 統合観測
1. Swarm + Monitor の同時実行
2. 因果関係の可視化（誰の評価がどの変化を起こしたか）
3. Observatoryとの連携

---

## 観測シナリオ例

### シナリオ 1: 群れの通過

```
10体のエージェントを同時放出
  ↓
全員が同じ領域で sense → 同じノードを発見
  ↓
複数のエージェントが同じノードを evaluate
  ↓
熱量が急上昇 → Burst フラグ
  ↓
Observatory が異常検知
  ↓
Environmental Node 注入で緩和
```

### シナリオ 2: 空間分散

```
10体を異なる初期クエリで放出
  ↓
queryベクトルにより異なる位置に配置
  ↓
各自が別々の領域を探索
  ↓
全体的な熱量分布が均一化
  ↓
Drought フラグが解消
```

### シナリオ 3: Ghost 生成競争

```
5体のエージェントが低評価を繰り返す
  ↓
ノードの熱量が急減 → Ghost 化
  ↓
Repellent (r) シグナルが上昇
  ↓
Thorn フラグ発生
  ↓
他のエージェントが Ghost 領域を回避
```

---

## 未解決の設計課題

### 1. エージェント間の間接的相互作用

- Sphereは他エージェントの情報を見せない
- しかし、評価の「痕跡」は残る（熱量変化として）
- これを意図的に観測する方法は？

**案**: `kind: "echo"` のような特殊ノードで「誰かがここにいた」を表現

### 2. 時系列データの保持

- 現在のObserverはスナップショットのみ
- 「5分前と今の差分」を見るには？

**案**: Ring buffer で直近N件を保持、または外部TS-DBに流す

### 3. 空間の可視化

- CLIでは空間分布を表現しにくい
- 2D投影？ヒートマップ？

**案**: 別途Visualizerサービス（WebSocket + Canvas）

---

## 結論

既存のObservatory思想を継承しつつ、Multi-Agent環境に拡張する：

1. **Swarm Spawner**: 複数エージェントの統一的な放出・管理
2. **projectionDB Monitor**: ノード状態の時系列追跡
3. **Agent Activity Log**: セッション単位のアクション記録

これにより「群れとしてのエージェント」と「生態系としてのSphere」の相互作用を観測可能にする。

---

**End of Concept Memo**
