# Sphere Project - Session State
**Last Updated**: 2026-01-31 (外部サービス化・Agent準備完了)
**Current Phase**: Phase 1-3 完了 / Phase 4 Agent基盤完了 / 外部サービスアーキテクチャ整備

---

## Project Root
```
c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1
```

---

## ✅ Phase 1: 純粋なデータ構造（完全準拠）

### 実装完了項目

| 要素 | ファイル | 状態 |
|------|---------|------|
| **Node** (座標/16bit フラグ/linkMeta) | [types/sphere_node.ts](services/renalCore/src/types/sphere_node.ts) | ✅ 完了 |
| **Amber** (結晶化したノード) | [types/amber.ts](services/renalCore/src/types/amber.ts) | ✅ 完了 |
| **Stable_Config** (物理定数) | [types/stable_config.ts](services/renalCore/src/types/stable_config.ts) | ✅ 完了 |
| **NodeKind 全8種** (environment追加) | [types/sphere_node.ts](services/renalCore/src/types/sphere_node.ts) | ✅ 完了 |

### Phase 1 Success Criteria

- ✅ **Nodes disappear over time**: `ttl` による自動消滅設計
- ✅ **No node becomes permanent by logic**: ロジックで永続化しない
- ✅ **The system never explains meaning**: payload は物理演算から完全分離

### 原則の遵守

- ✅ 関数を一切含まない（`types/` 配下）
- ✅ POD (Plain Old Data) のみ
- ✅ Rust への移植性 100% 維持

---

## ✅ Phase 2+: ビジネスロジック（実装完了）

### Core Components

#### 1. **16bit Flags & Physics**
- [core/types.ts](services/renalCore/src/core/types.ts) - NodeFlag enum（型定義のみ）
- [lib/physics.ts](services/renalCore/src/lib/physics.ts) - フラグ→物理量変換関数
- [lib/bit_math.ts](services/renalCore/src/lib/bit_math.ts) - 純粋関数群

**16bit NodeFlag:**
```
0x0001: Authority   - decay_rate × 0.95
0x0002: Freshness   - heat_boost × 1.2
0x0004: Catalyst    - 通過点として機能
0x0008: Ephemeral   - decay_rate × 1.5
0x0010: Sticky      - ttl_decay × 0.8
0x0020: Volatile    - ttl_decay × 1.3
0x0040: Hot         - 高熱
0x0080: Frozen      - 代謝停止
0x0100: Hub         - weight × 1.1
0x0200: Isolated    - 孤立
0x0400: Spectral    - 洗練された経路
0x0800: Constellation - 星座
0x1000: UserMarked  - ユーザーマーク
0x2000: SystemCore  - システムコア
0x4000: Compressed  - 圧縮済み
0x8000: Reserved    - 予約
```

#### 2. **RenalCore: 5つの代謝プロセス**
[renalcore.ts](services/renalCore/src/renalcore.ts)

1. **Decay（減衰）**
   - 全ノードの Heat と TTL を減衰
   - フラグに基づいて減衰率を動的調整
   - `Frozen` フラグで代謝停止

2. **Ghostification（ゴースト化）** ✨新規追加
   - 熱量が極小の Active/Fossil を Ghost へ遷移
   - `ghostHeatThreshold` で判定
   - TTL を大幅短縮（`ghostTTLMultiplier`）
   - 摩擦の痕跡として一時的に残存

3. **Erosion（侵食）**
   - アクセスのない Amber を Active へ退行
   - `erosionHeatThreshold` で判定
   - **Pause判定**: 放置時（`idleTickCount > pauseIdleThreshold`）は退行しやすくなる

4. **Ascension（昇華）**
   - 閾値を超えた Active を Amber へ結晶化
   - Reference DB への永続化
   - **ハック検知強化**: 通過点 + 短いsummary の偽装リンクを検出

5. **Evaporation（蒸発）**
   - TTL ≤ 0 または Heat ≈ 0 のノードを削除
   - **Fertility 還元**: 蒸発した熱量の一部を SpatialField へ還元
   - `planktonConversionRate` で還元率を制御

#### 3. **追加機能**
- **Spectral Link 鍛造**: Amber 間の洗練された経路を自動生成
  - **方向保持**: `linkMeta` フィールドで source → target を明示
  - RenalCore のみが生成可能（エージェント/パッカー不可）
- **Payload 剥奪**: 意味を剥ぎ取り Link へ変換
  - 通過点ノード: linkMeta なし（方向不明）
  - Spectral Link: linkMeta あり（方向明示）
- **Telemetry**: 座標・熱量の変化のみを記録
- **Pause 判定**: アイドル状態の検知と琥珀の退行促進

---

## プロジェクト構造

```
services/renalCore/
├── package.json           # プロジェクト設定
├── tsconfig.json          # TypeScript 設定
├── .gitignore             # Git 除外設定
├── README.md              # プロジェクト説明
│
└── src/
    ├── index.ts           # エントリーポイント
    │
    ├── types/             # ✅ Phase 1: 純粋なデータ構造
    │   ├── sphere_node.ts # Node, SpatialField
    │   ├── amber.ts       # AmberRecord, SpectralLink, Constellation
    │   ├── stable_config.ts # StableConfig（物理定数）
    │   └── index.ts       # 型エクスポート
    │
    ├── core/              # Phase 1 型定義 + Phase 2+ ロジック分離
    │   └── types.ts       # NodeFlag enum（型のみ）
    │
    ├── lib/               # Phase 2+: 純粋関数
    │   ├── physics.ts     # フラグ→物理量変換
    │   └── bit_math.ts    # 物理演算関数群
    │
    └── renalcore.ts       # Phase 2+: ビジネスロジック（4つの代謝プロセス）
```

---

## 設計原則の厳守状況

### CLAUDE.md の要求事項

| 要件 | 状態 | 実装箇所 |
|------|------|---------|
| RenalCore は payload を読まない | ✅ | renalcore.ts - payload へのアクセスなし |
| 意味論的判断の禁止（metrics のみ） | ✅ | すべての判定は w, d, h, ttl, flg のみ |
| すべての定数は config から | ✅ | RenalCoreConfig インターフェース |
| グラフィック描画なし | ✅ | 描画機能なし |
| Embedding/DB は抽象化 | ✅ | インターフェース分離設計 |
| Telemetry First | ✅ | 物理量の変化のみをログ出力 |
| 無口な神 | ✅ | 理由や判断を語らない |
| パラメータ地獄の警戒 | ✅ | 各プロセス最大3パラメータ |

---

## TypeScript ビルド状況

- **総行数**: 約1200行（ゴースト化・Pause判定追加）
- **型安全性**: strict モード有効
- **ビルド**: ✅ 完了（エラーなし）
- **最終ビルド**: 2026-01-30

---

## ✅ 熱力学・風化システム（2026-01-30 実装完了）

### 実装された機能

#### 1. NodeKind の拡張
```typescript
export type NodeKind =
  | "relic"        // 宇宙定数（不変）
  | "amber"        // 結晶化（安定）
  | "active"       // 受肉直後（高熱）
  | "fossil"       // 風化（低熱・圧縮・長寿命）
  | "ghost"        // 摩擦痕跡（揮発）← 新規実装
  | "plankton"     // 最終養分（意味消失・揮発）
  | "link"         // 動線の楔
  | "environment"; // 調整用（指定寿命）← 新規追加
```

#### 2. リンクノードの方向保持
```typescript
linkMeta?: {
  source_id: string;   // 始点ノードID
  target_id: string;   // 終点ノードID
  isDirected: boolean; // 方向性の有無
};
```
- **Spectral Link**: RenalCore が自動生成、方向あり
- **通過点 Link**: ハック検知で変換、方向なし

#### 3. ゴースト化プロセス (processGhostification)
- **トリガー**: `heat < ghostHeatThreshold`
- **対象**: Active/Fossil ノード
- **処理**:
  - kind を "ghost" へ変更
  - TTL を大幅短縮（`ghostTTLMultiplier` 倍）
  - Telemetry 出力

#### 4. ハック検知の強化
**パターン1**: 通過点として振る舞うノード
```typescript
traversal > hackTraversalThreshold &&
stayTime / traversal < hackStayRatioThreshold
```

**パターン2**: 意味のない要約を持つ偽装リンク
```typescript
summary.length > 0 &&
summary.length < minPayloadLength &&
traversal > hackTraversalThreshold
```

#### 5. Pause 判定
- **検知**: `idleTickCount` でノード数の変化を監視
- **発動**: `idleTickCount > pauseIdleThreshold`
- **効果**: Erosion 閾値を `pauseErosionBoost` 倍に引き上げ
- **結果**: **「放置すると琥珀すら通常ノードに還る」** （無常観の実装）

### 設定パラメータの追加

```typescript
export interface RenalCoreConfig {
  // ... 既存のフィールド ...

  // ゴースト化設定
  ghostHeatThreshold: number;         // Ghost化する Heat閾値
  ghostTTLMultiplier: number;         // Ghost の TTL 減衰倍率

  // ハック検知
  minPayloadLength: number;           // ハック検知用の最小要約長

  // Pause判定
  pauseIdleThreshold: number;         // Pause判定の Tick 数閾値
  pauseErosionBoost: number;          // Pause時の Erosion 促進倍率
}
```

### Telemetry 出力例

```
[RenalCore] tick=1 loadFactor=1.000 idle=0
[RenalCore] decay node=abc12345 ttl=3599.0 heat=15.234
[RenalCore] ghostification node=def67890 →ghost heat=0.002 ttl=5.0
[RenalCore] erosion node=ghi13579 amber→active heat=8.123 paused=true
[RenalCore] forged_link link=link_aaa_bbb n1=aaa n2=bbb flow=12.500
[RenalCore] stripped_payload node=jkl24680 →link traversal=150
[RenalCore] stats tick=1 relic=2 amber=45 active=1203 fossil=12 ghost=8 plankton=0 link=15 environment=0 fertility=0.127
```

### 実装ファイル

| ファイル | 変更内容 | 状態 |
|---------|---------|------|
| [types/sphere_node.ts](services/renalCore/src/types/sphere_node.ts) | NodeKind に environment 追加、linkMeta フィールド追加 | ✅ 完了 |
| [renalcore.ts](services/renalCore/src/renalcore.ts) | 5つの設定追加、processGhostification() 実装、Pause判定、ハック検知強化 | ✅ 完了 |

---

## Next Steps

### すぐに実行可能

1. **依存関係のインストール**
   ```bash
   cd services/renalCore
   npm install
   ```

2. **ビルド**
   ```bash
   npm run build
   ```

3. **テストの作成**
   - Vitest による単体テスト
   - 異常系テスト（NaN heat, zero vectors, etc.）

### Phase 3 以降の候補

- Spatial Hash Grid の最適化実装
- sphere.config.json の実ファイル読み込み
- Periphery との連携
- Observatory UI からの可視化
- Agents の実装

---

## 重要な設計決定

### 1. **関数の分離**
Phase 1 の純粋性を保つため、関数は `lib/` と `core/` に分離。

### 2. **Fertility 還元ロジック**
蒸発したノードの熱量は完全に消滅せず、空間セルの Fertility として還元される。これにより「プランクトン化」を物理的に実装。

### 3. **ハック検知**
`traversal` と `stayTime` の比率で「通過点」として振る舞うノードを検出し、自動的に Link へ変換。意味を剥奪する。

### 4. **フラグ駆動の物理演算**
16bit フラグが物理パラメータの修正倍率に変換され、各ノードの減衰率・熱量・Weight が動的に調整される。

### 5. **ゴースト化と無常観の実装**
熱量が極小のノードは Ghost へ遷移し、速やかに蒸発する。これにより「摩擦の痕跡」を可視化。

### 6. **Pause 判定による強制風化**
ノード数が変化しない状態が続くと `idleTickCount` が増加し、閾値を超えると Amber の退行が促進される。「放置すると琥珀すら通常ノードに還る」という無常観をコードで実装。

### 7. **リンクノードの方向性**
RenalCore が生成する Spectral Link は `linkMeta` フィールドで始点・終点を明示的に保持。通過点から変換されたリンクは方向情報なし。

---

## ✅ 外部サービスアーキテクチャ（2026-01-31 完了）

### Observatory 完全独立化

| 項目 | 状態 |
|------|------|
| 型定義の内部化 (`PulseSignal`, `PulsePacket`) | ✅ |
| `@sphere/renal-core` 依存削除 | ✅ |
| `observatory.config.json` 作成 | ✅ |
| `.env.example` 作成 | ✅ |
| 起動スクリプト (`start.bat`, `start.sh`) | ✅ |
| ディレクトリ移動後も動作可能 | ✅ |

### sphere.config.json 外部サービス設定

```json
"external_services": {
  "observatory": { "protocol": "UDP", ... },
  "visualizer": { "protocol": "WebSocket", ... },
  "archive": { "protocol": "HTTP", ... },
  "agent_gateway": { "protocol": { "rest": ..., "websocket": ... }, ... }
}
```

### エージェント外部化設計

| 原則 | 説明 |
|------|------|
| 来訪者の匿名性 | Sphere はエージェントの「種類」を知らない |
| 物理情報のみ | payload, 評価ロジック, 他エージェント情報は見えない |
| 双方向通信 | WebSocket + REST |
| レート制限 | 世界を停めないための速度制限 |

### テストエージェント

```bash
cd services/periphery
npm run agent          # 単発探索（ランダムミッション）
npm run agent:watch    # 継続監視モード

# または
start-agent.bat        # 対話式メニュー
```

---

## 既知の制限事項

1. **Spatial Hash Grid**: 簡易実装（最初の3次元のみ使用）
2. **Config 読み込み**: ハードコードされた設定（実ファイル未統合）
3. **テスト**: 未実装（Vitest による単体テストが必要）
4. **Agent Gateway**: 設計済み、REST/WebSocket 実装は未着手

---

## Session Start Template (For User)

```markdown
Project Root: c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1
Read SESSION_STATE.md and continue from where we left off.
Today's focus: [具体的なタスク]
```

---

**End of Session State**
