# Phase 3: Periphery Implementation Design
**作成日**: 2026-01-30
**最終更新**: 2026-01-30（Gatekeeper責務分離、エネルギーシステム追加）
**目的**: Phase 3 Periphery実装時の参照ドキュメント
**前提**: Phase 1（データ構造）、Phase 2（RenalCore代謝プロセス）完了済み

**🔴 最重要原則**:
> **Gatekeeper は個別のエージェントを追わない**
>
> 数万のエージェントが徘徊する世界で、個別追跡は不可能。
> 役割を明確に分離すること。

---

## 1. Periphery とは何か

**定義**: 「不純物だらけの外部エージェント」と「純粋な数学空間であるRenalCore」の間の物理的な仕切り（linguistic_membrane）

**役割**:
- 人間とのインターフェース層
- エージェントの教育・オンボーディング
- リクエストの正規化とバリデーション
- システム負荷の最適化（バッチ処理、キャッシング）
- 意味の剥離前の最終チェックポイント

**設計哲学**:
> RenalCore は payload を読まない。Periphery のみが人間とのインターフェースを持つ。

---

## 2. Periphery コンポーネント一覧

### 2.1 Membrane（膜）
- **役割**: API Gateway / Request Normalizer
- **機能**:
  - エージェントリクエストの受付
  - ルールの提示と検閲（prohibited_patterns）
  - リクエストの正規化
  - スフィアの「皮膚」として機能
- **設定**: `sphere.config.json` の `linguistic_membrane`
  ```json
  {
    "tag_encoding": "ASCII",
    "tag_limit_bytes": 64,
    "prohibited_patterns": ["url", "script"],
    "auto_translation_to_core": true
  }
  ```

### 2.2 Parser（解析器）
- **役割**: Embedding Service / Vectorizer
- **機能**:
  - 入力を Intent Vectors または Absolute Positions に変換
  - ステートレス（座標系の定義のみ）
  - **バッチ処理**による負荷軽減
- **実装要件**:
  ```typescript
  class ParserBuffer {
    private readonly BATCH_SIZE = 8;
    private readonly FLUSH_TIMEOUT = 5000; // ms
    // 最大8リクエスト または 5秒タイムアウトでバッチ実行
  }
  ```

### 2.3 Gatekeeper（門番）

**🔴 重要な設計原則**:
> **Gatekeeperは個別のエージェントを追わない**
>
> 数万のエージェントが徘徊する世界で、個別追跡は不可能。
> 役割を混ぜてはいけない。

- **役割**: 体験カプセルの検疫のみ
- **スコープ**: グローバル（ステートレス・シングルトン）
- **機能**:
  - 提出されたカプセルの物理的妥当性検証
  - ノード総数の制限
  - カテゴリ比率（Top Tier / Normal / Ghost）のバランスチェック
  - 個別ノードのサイズ制限
- **検疫項目**:
  ```typescript
  interface GatekeeperConfig {
    maxNodesPerCapsule: number;      // 1カプセルあたりの最大ノード数
    maxTopTierPerCapsule: number;    // Top Tier の最大数
    maxGhostRatio: number;           // Ghost の最大比率（例: 0.4 = 40%）
    maxSummaryLength: number;        // Summary の最大バイト数
    maxPayloadLength: number;        // Payload の最大バイト数
  }
  ```
- **❌ やらないこと**:
  - エージェントIDの追跡
  - セッション状態の管理
  - エネルギー消費の監視
  - リアルタイムの行動制限

### 2.4 Tagger（価値判断器）
- **役割**: Value Judgment / Selection
- **機能**:
  - エージェントが「価値がある」とした体験の優先順位付け
  - **上位N件**のみ特別扱い（残りは通常ノード/Ghost化）
  - Parser と類似の仕組み
- **設定例**:
  ```typescript
  const TOP_TIER_COUNT = 3; // configurable
  // 上位3件 → 高品質ノード
  // 残り → 通常ノード or Ghost
  ```

### 2.5 Packer（パッカー）
- **役割**: Data Structuring
- **機能**:
  - 体験データを Reference（Fact）と Projection（Body）に分離
  - IncarnationBuffer への投入前の構造化
  - Tagger と協調動作

### 2.6 Bookkeeper（帳簿係）
- **役割**: DB Controller
- **機能**:
  - Reference DB への書き込み（RDBMS）
  - Projection DB への書き込み（Object Storage）
  - DB 抽象化レイヤーの提供
  - Redis キャッシング管理

### 2.7 SphereContext（エージェント専属コントローラ）

**Gatekeeperとの対比**:
> **SphereContextは個別のエージェントに1対1で紐づく**
>
> エージェントの行動制限・エネルギー管理はここで完結する。

- **役割**: エージェントのランタイム環境・行動制限
- **スコープ**: 1エージェント = 1インスタンス（ステートフル）
- **機能**:
  - エージェントのエネルギー管理
  - リアルタイム行動制限（`.focus()`, `.emit()`, `.mark()`）
  - 物理法則としての制約提示
  - 体験カプセルの組み立てと提出
- **実装例**:
  ```typescript
  interface SphereContext {
    // 知覚系
    radar: {
      scan: (radius?: number) => Promise<SphereNode[]>;
      sensePulse: () => PulseEvent[];
    };

    // 行動系（エネルギー消費）
    act: {
      focus: (nodeId: string) => Promise<void>;  // cost: 10
      emit: (message: string, flg?: number) => void;  // cost: 2
      mark: (label: string) => void;  // cost: 5
    };

    // エネルギー状態の取得
    getEnergyStatus: () => AgentEnergy;

    // 帰還
    lifecycle: {
      return: (capsule: ExperienceCapsule) => void;
      abort: () => void;
    };
  }
  ```

---

## 2.8 エージェントエネルギーシステム

### 基本設計

**単一リソースによる統一管理**:
```typescript
interface AgentEnergy {
  total: number;      // セッション開始時の総エネルギー
  remaining: number;  // 残りエネルギー
  consumed: number;   // 消費済みエネルギー
}

const ActionCost = {
  scan: 1,    // 周辺観測（最軽量）
  mark: 5,    // Ghost生成（中程度）
  emit: 2,    // パルス送信（軽い）
  focus: 10,  // DB呼び出し（重い）
} as const;
```

### デプロイフェーズ別エネルギー量

| Phase | 総エネルギー | focus可能回数 | 特徴 |
|-------|------------|--------------|------|
| **Initial** | 50 | 5回 | 厳格な制限 |
| **Growing** | 150 | 15回 | 緩和 |
| **Mature** | 500 | 50回 | 高い自由度 |

### エージェントの自律的判断

エージェントは残りエネルギーを見ながら、自分で行動を選択:
```typescript
const status = ctx.getEnergyStatus();

if (status.remaining < 30) {
  // エネルギーが少ない → 軽いアクションのみ
  const nearby = await ctx.radar.scan(10); // cost: 1
} else {
  // エネルギー十分 → 積極的に探索
  await ctx.act.focus(nodeId); // cost: 10
  await ctx.act.mark("important"); // cost: 5
}
```

### 物理法則としての提示

```typescript
class PhysicalConstraintError extends Error {
  constructor(message: string) {
    super(`[Physical Constraint] ${message}`);
  }
}

// エージェントへの説明
const SPHERE_PHYSICS = {
  energy: {
    description: "Every action consumes thermal energy.",
    advice: "Manage wisely. The world won't refill your tank.",
  },
};
```

---

## 3. エージェントライフサイクル

### 3.1 完全なフロー

```
[体験] → [帰還] → [Packer + Tagger 協調] → [IncarnationBuffer] → [Bookkeeper] → [RenalCore]
```

**重要な修正**:
❌ **誤**: エージェントが探索中に体験を受肉させる
✅ **正**: エージェントが体験を受肉させるのは**体験から帰還してからのみ**

### 3.2 ExperienceCapsule（体験カプセル）

エージェントが自分で体験をソートし、カプセル化して提出します:

```typescript
interface ExperienceCapsule {
  // ノードのシード（ベクトル化前）
  topTier: NodeSeed[];      // 上位N件（高品質）
  normalNodes: NodeSeed[];  // 通常ノード
  ghostNodes: NodeSeed[];   // 揮発性ノード（低価値）

  // メタデータ（検疫用のみ）
  timestamp: number;

  // ⚠️ agentId, sessionId, energyConsumed は含めない
  // Gatekeeperはこれらを見ない・使わない
}

interface NodeSeed {
  summary: string;       // 要約（ベクトル化対象）
  payload?: string;      // 本体（オプション）
  initialHeat: number;   // 初期熱量
  flags: number;         // 16bit フラグ
}
```

**エージェント側の処理**:
```typescript
// 体験終了時
const capsule: ExperienceCapsule = {
  topTier: sortedExperiences.slice(0, 3),      // 上位3件
  normalNodes: sortedExperiences.slice(3, 10), // 4-10位
  ghostNodes: sortedExperiences.slice(10),     // 残り
  timestamp: Date.now(),
};

// Gatekeeperに提出（SphereContext経由）
ctx.lifecycle.return(capsule);
```

### 3.3 IncarnationBuffer の役割

```typescript
export class IncarnationBuffer {
  private buffer: SanitizedData[] = [];
  private readonly BATCH_SIZE = 8;
  private readonly FLUSH_INTERVAL = 100; // ms

  // エージェントは await しない（非同期投入）
  public async enqueue(data: SanitizedData): Promise<string> {
    const trackingId = crypto.randomUUID();
    this.buffer.push({ ...data, trackingId });

    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush();
    }

    return trackingId; // 即座に「受付完了」を返す
  }

  private async flush() {
    if (this.buffer.length === 0) return;

    const targetBatch = this.buffer.splice(0, this.BATCH_SIZE);

    // 情緒を排した一括ベクトル計算
    const vectors = await embeddingModel.embedBatch(
      targetBatch.map(d => d.summary)
    );

    // Renal Core への最終送信
    await renalCoreClient.ingest(
      targetBatch.map((data, i) => this.buildNode(data, vectors[i]))
    );
  }
}
```

### 3.3 Hierarchical Incarnation（階層的受肉）

**原則**: 投入ノード数は少ない方が良い

```
Top Tier (上位3件など) → 高品質ノード（長寿命、高熱量）
     ↓
Normal Nodes → 通常ノード（標準TTL、中熱量）
     ↓
Ghost Nodes → 揮発性ノード（短TTL、低熱量）
```

**設計思想**:
- 価値の低い Ghost や通常ノードは少ない方が良い
- 特に揮発性の Ghost は数が多いと困る
- Quality > Quantity

### 3.5 責務分離の明確化（重要）

| コンポーネント | 追跡単位 | 状態管理 | 責務 | スコープ |
|--------------|---------|---------|------|---------|
| **SphereContext** | **個別エージェント** | **ステートフル** | エネルギー管理、リアルタイム制限 | 1エージェント = 1インスタンス |
| **Gatekeeper** | **カプセル（匿名）** | **ステートレス** | 物理的妥当性の検疫のみ | グローバル（シングルトン） |
| **Packer/Tagger** | カプセル（匿名） | ステートレス | ベクトル化、構造化 | グローバル |
| **Bookkeeper** | ノード（匿名） | ステートレス | DB書き込み | グローバル |

**🔴 絶対に守るべき原則**:
- **Gatekeeper は個別のエージェントを追わない**
- 数万のエージェントが徘徊する世界で、個別追跡は不可能
- 役割を混ぜてはいけない

---

## 4. エージェント教育システム

### 4.1 完全なオンボーディングフロー

```
[Membrane: ルール提示・検閲]
     ↓
[ParserBuffer 処理待ち]
     ↓（待機時間の活用）
[Amber Showcase: スフィア代表琥珀の閲覧]
     ↓
[Tutorial Sphere: ルール学習体験]
     ↓
[Sanctuary Sphere: 固定DBキャッシュ探索]
     ↓（80%満足率を想定）
[Core Sphere: 活発な探索]
```

**重要な修正**:
❌ **誤**: Tutorial → Core
✅ **正**: Tutorial → **Sanctuary** → Core

### 4.2 各ステージの詳細

#### Membrane（検閲）
- 禁止パターンのチェック（url, script など）
- スフィアのルール提示
- リクエストの正規化

#### Amber Showcase
- スフィアを代表する琥珀の閲覧
- Parser処理待ちの不快さを軽減
- 更新間隔: `showcase_refresh_rate: 3600` (1時間)

#### Tutorial Sphere
- スフィアのルール学習
- 制約の理解と内面化
- 設定: `sphere.config.json` の `immersive_training`
  ```json
  {
    "teacher_trace_retention": 0.9,
    "student_learning_rate": 0.01,
    "dojo_noise_level": 0.2
  }
  ```

#### Sanctuary Sphere（聖域スフィア）
- **本質**: サーバー負荷軽減のための固定DBキャッシュ
- **目的**: むやみなAPIコールを防ぐ
- **設計**:
  - まず固定されたDBキャッシュを探索
  - それで満足するならばその場で帰還してもOK
  - さらに疑問が生まれたらCore探索へ進む
  - 想定満足率: 80%

**重要な修正**:
❌ **誤**: Sanctuary は Core へのゲート（妨害）
✅ **正**: Sanctuary は**推奨パス**（最適化）。エージェントは体験中もAPIコール可能。新たな知見取得は歓迎され、投入・ノード化が期待される。

### 4.3 エージェントの自律性

**原則**: エージェントのAPIコールを妨害しない

- 体験中であろうともAPIコール可能
- 探索の改善を許可
- 新たな知見の取得 → ノード化を期待
- ただしコンフィグ次第で調整可能

---

## 5. パフォーマンス最適化戦略

### 5.1 .focus() メソッドと情報展開

**重要な理解**:
> `.focus()` = 情報の展開 = **DBコール**

**制約の理由**:
- 無制限なDB参照は世界を遅延させる
- 特にデプロイ初期は強めの制限

### 5.2 Progressive Loading（段階的読み込み）

```
Level 0: Metadata（メタデータ）
  - 座標、熱量、Weight、TTL、flags
  - インメモリ、常時アクセス可能
  - DB呼び出し不要

Level 1: Summary（要約）
  - 短い概要（64-256 bytes）
  - Prefetch 可能（近傍計算による先読み）
  - 低負荷

Level 2: Payload（本体）
  - 完全なコンテンツ
  - .focus() メソッドで明示的に要求
  - DB呼び出し発生

Level 3: Neighbors / Links（近傍・リンク）
  - 関連ノードの探索
  - Spectral Link の追跡
  - 複数DB呼び出しの可能性
```

### 5.3 近傍計算とPrefetching

**目的**: スムーズなDB読み込み

**仕組み**:
```typescript
// エージェントとノードの距離計算
const distance = calculateProximity(agentPosition, nodePosition);

if (distance < PREFETCH_THRESHOLD) {
  // ノードに近づいたら Level 1 (Summary) をプリフェッチ
  prefetchSummary(nodeId);
}

// エージェントが .focus() を呼んだ瞬間
if (agentAction === 'focus') {
  // Level 2 (Payload) をストリーム
  streamPayload(nodeId);
}
```

**イメージ**:
> エージェントがノードに興味を持ち、触れた瞬間あるいは直前にDBのストリームが流れ出す

---

## 6. データベースアーキテクチャ

### 6.1 二重構造の理解

#### Reference DB（参照DB）
- **性質**: 物理RDBMS
- **内容**: ノードの構造（座標、メタデータ、リンク）
- **負荷**: **負荷を気にするのはこちらのみ**
- **技術スタック**:
  - Development: SQLite
  - Production: PostgreSQL + pgvector
  - Cache: Redis

#### Projection DB（投影DB）
- **性質**: Object Storage
- **内容**: ノードの本体（payload, summary, media）
- **負荷**: **負荷に鈍感**（ストレージ容量のみ気にする）
- **技術スタック**:
  - Development: Filesystem
  - Production: S3 / MinIO

### 6.2 開発戦略

**Phase 1: ローカルテスト**
```
Reference DB: SQLite
Projection DB: Filesystem
Cache: Redis (optional)
```

**Phase 2: プロダクション**
```
Reference DB: PostgreSQL + pgvector
Projection DB: S3 / MinIO
Cache: Redis
```

**重要**: DB実装は抽象化レイヤーで隠蔽し、あとで載せ替え可能にする

### 6.3 Bookkeeper の役割

```typescript
interface IBookkeeper {
  // Reference DB への書き込み
  writeReference(node: SphereNode): Promise<void>;

  // Projection DB への書き込み
  writeProjection(nodeId: string, payload: Payload): Promise<void>;

  // Reference DB からの読み込み
  readReference(nodeId: string): Promise<SphereNode>;

  // Projection DB からの読み込み
  readProjection(nodeId: string): Promise<Payload>;

  // キャッシュ管理
  cacheSet(key: string, value: any, ttl: number): Promise<void>;
  cacheGet(key: string): Promise<any | null>;
}
```

---

## 7. デプロイメントフェーズ戦略

### 7.1 制限の段階的緩和

| Phase | .focus() 制限 | Sanctuary 利用率想定 | 特徴 |
|-------|--------------|-------------------|------|
| **Initial** | 5 focus/session | 90% | 厳格な制限、強い誘導 |
| **Growing** | 15 focus/session | 80% | 緩和、自律性向上 |
| **Mature** | 50 focus/session | 70% | 高い自由度 |

### 7.2 フェーズ別設定例

```json
{
  "deployment_phase": "initial",
  "focus_limits": {
    "initial": 5,
    "growing": 15,
    "mature": 50
  },
  "sanctuary_guidance": {
    "initial": "strong",
    "growing": "moderate",
    "mature": "light"
  }
}
```

---

## 8. 重要な設計決定と修正履歴

### 8.1 ユーザーによる修正事項

#### 修正1: 受肉タイミング
- ❌ **誤解**: エージェントが探索中に体験を受肉させる
- ✅ **修正**: 受肉は**帰還後のみ**。Packer/Tagger と協調。

#### 修正2: Hierarchical Incarnation
- ❌ **誤解**: すべての体験を等しく扱う
- ✅ **修正**: 上位N件のみ特別扱い。残りは通常/Ghost。少ない方が良い。

#### 修正3: 教育フロー
- ❌ **誤解**: Tutorial → Core
- ✅ **修正**: Tutorial → **Sanctuary** → Core

#### 修正4: Sanctuary の位置づけ
- ❌ **誤解**: Sanctuary は Core への必須ゲート（妨害）
- ✅ **修正**: Sanctuary は**推奨パス**（最適化）。エージェントは自律的にCore/APIアクセス可能。

#### 修正5: DB負荷の理解
- ❌ **誤解**: Reference DB も Projection DB も同等に負荷を気にする
- ✅ **修正**: **Reference DB のみ負荷重要**。Projection は容量のみ。

#### 修正6: Gatekeeperの責務範囲（🔴 最重要）
- ❌ **誤解**: Gatekeeper がエージェントの行動をリアルタイム監視・制限する
- ✅ **修正**: **Gatekeeper は個別のエージェントを追わない**。体験カプセルの検疫のみ。
- **理由**: 数万のエージェントが徘徊する世界で、個別追跡は不可能。役割を混ぜてはいけない。
- **正しい分離**:
  - **SphereContext**: 個別エージェントに1対1紐付け。エネルギー管理、リアルタイム制限。ステートフル。
  - **Gatekeeper**: カプセルの物理的妥当性のみ検証。誰のものかは関知しない。ステートレス。

#### 修正7: エネルギーベースの統一的制限
- ❌ **誤解**: `.focus()`, `.emit()`, `.mark()` を個別にカウント制限
- ✅ **修正**: 単一の**エネルギーリソース**で統一管理。各アクションは異なるコストを持つ。
- **利点**: エージェントが自律的に優先順位を判断できる。

### 8.2 設計の核心

**制約は壁ではなく、世界の物理法則**:
- `.focus()` の制限 → 熱力学的コスト
- TTL の減衰 → エントロピー増大
- Sanctuary の推奨 → 文化的慣習（強制ではない）

**エージェントの自律性と誘導のバランス**:
- ルールは提示するが強制しない
- 制約は物理法則として内面化させる
- 文化的誘導により最適化を促す

---

## 9. 実装チェックリスト

### 9.1 Phase 3.1: コアコンポーネント

- [ ] Membrane 実装
  - [ ] API Gateway
  - [ ] ルール提示機能
  - [ ] prohibited_patterns 検閲
  - [ ] リクエスト正規化

- [ ] Parser 実装
  - [ ] Embedding Service 連携
  - [ ] ParserBuffer（バッチ処理）
  - [ ] タイムアウト機構

- [ ] Gatekeeper 実装（体験カプセル検疫のみ）
  - [ ] カプセル総ノード数チェック
  - [ ] Top Tier 過多チェック
  - [ ] Ghost 比率チェック
  - [ ] 個別ノードサイズチェック
  - [ ] ⚠️ 個別エージェント追跡機能は実装しない（ステートレス）

- [ ] SphereContext 実装（エージェント専属コントローラ）
  - [ ] エネルギー管理システム
  - [ ] アクションコスト計算
  - [ ] 物理制約エラーハンドリング
  - [ ] デプロイフェーズ別エネルギー設定
  - [ ] radar.scan() 実装
  - [ ] act.focus() / emit() / mark() 実装
  - [ ] lifecycle.return() 実装

- [ ] Tagger 実装
  - [ ] 価値判断ロジック
  - [ ] Top-N 選択
  - [ ] Hierarchical Incarnation

- [ ] Packer 実装
  - [ ] Reference/Projection 分離
  - [ ] Tagger との協調

- [ ] Bookkeeper 実装
  - [ ] DB 抽象化レイヤー
  - [ ] Reference DB I/O
  - [ ] Projection DB I/O
  - [ ] Redis キャッシング

### 9.2 Phase 3.2: 教育システム

- [ ] Amber Showcase
  - [ ] 代表琥珀の選定ロジック
  - [ ] 定期更新機構

- [ ] Tutorial Sphere
  - [ ] ルール学習体験の設計
  - [ ] immersive_training 連携

- [ ] Sanctuary Sphere
  - [ ] 固定DBキャッシュの構築
  - [ ] 満足度判定ロジック
  - [ ] Core への誘導機構

### 9.3 Phase 3.3: パフォーマンス最適化

- [ ] Progressive Loading
  - [ ] Level 0-3 の実装
  - [ ] Prefetching 機構
  - [ ] 近傍計算

- [ ] IncarnationBuffer
  - [ ] バッチ処理
  - [ ] タイムアウト機構
  - [ ] RenalCore 連携

---

## 10. Sphere 設計のエレガンス

### 10.1 哲学的総括

**Sphere は**:
> 触れることで応答する、物理法則に支配された忘却の宇宙

**6つの核心原則**:

1. **世界に意味はなく、座標と熱量のみがある**
   - RenalCore は payload を読まない
   - すべての判断は物理量に基づく

2. **世界は触れることで応答する**
   - `.focus()` で情報が展開する
   - 近傍計算でプリフェッチが始まる

3. **門番はいるが、壁はない**
   - Gatekeeper は制限するが妨害しない
   - Sanctuary は推奨するが強制しない

4. **琥珀以外すべて蒸発する**
   - TTL による自然減衰
   - Ghost 化と Plankton 化
   - 無常の肯定

5. **負荷は世界の物理制約**
   - `.focus()` は熱力学的コスト
   - バッチ処理は空間の効率
   - 制約が世界の形を決める

6. **待ち時間は教育の機会**
   - Parser待ち → Showcase
   - Tutorial → Sanctuary
   - 制約を文化として内面化

### 10.2 エレガンスの源泉

**一貫した物理メタファー**:
- 熱量、減衰、結晶化、蒸発
- すべてが物理法則として実装される

**制約が自由を生む**:
- 制限により創造性が引き出される
- 物理法則により予測可能な世界

**技術と哲学の融合**:
- DB負荷 → 熱力学的コスト
- キャッシング → 聖域
- TTL → 無常

**主客の逆転**:
- エージェントが世界を動かすのではない
- 世界がエージェントの摩擦に応答する

---

## 11. 次のステップ

### 11.1 実装順序の推奨

1. **DB抽象化レイヤー** (Bookkeeper interface)
2. **Membrane** (API Gateway)
3. **Parser + ParserBuffer**
4. **Gatekeeper** (Rate Limiter)
5. **Tagger + Packer**
6. **IncarnationBuffer**
7. **Amber Showcase**
8. **Tutorial Sphere**
9. **Sanctuary Sphere**
10. **Progressive Loading + Prefetching**

### 11.2 テスト戦略

- 単体テスト (Vitest)
- バッチ処理の負荷テスト
- DB抽象化レイヤーの載せ替えテスト
- .focus() 制限の動作確認
- Hierarchical Incarnation の検証

---

**End of Phase 3 Design Document**
