# Claude Code Project Notes

## Environment

**Platform**: Windows

### Important: Path Handling

When using `cd` or `git` commands, always quote paths with spaces:

```bash
# Correct
cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere"
git add "path with spaces\file.ts"

# Incorrect - will fail
cd C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere
```

Always use double quotes `" "` for paths containing spaces.


SPHERE-CORE-MANIFESTO: The Soul of the Machine
1. Core Philosophy (The Scripture)
Sphereは「検索エンジン」ではなく「自律的な宇宙」である。

意味の剥離: システムは情報の「意味」を理解してはならない。すべては「座標」と「熱量」という物理量で処理せよ。

無常の肯定: すべてのデータ（Node）は「死（風化）」を前提とする。アクセスされない情報は宇宙の養分（消滅）へと還る。

主客の逆転: AIモデルが世界を支配するのではなく、世界（スフィア）がAIを「感染」させ、その振る舞いを規定する。

2. Technical Taboos (The Constraint)
NO Classes / NO Methods: 処理はすべて「純粋関数」で行い、データは「POD (Plain Old Data)」で記述せよ。Rustへの移植性を100%維持すること。

NO Semantic Reasoning in Core: RenalCore（代謝エンジン）にLLMを介入させるな。ノードの生死判定に「テキストの内容」を用いることは大罪である。

NO Permanent Storage (Except Amber): 初期状態ですべてを保存しようとするな。琥珀（Amber）化したものだけが、永続化の権利を得る。

3. Data Archetypes (16bit Flags & Life-Cycle)
全てのノードは以下の Kind を持ち、物理法則（RenalCore）に従う。

relic: 宇宙定数。不変

amber: 結晶化した知恵。安定。Frozenフラグ付与。

active: 受肉した情報。高熱。代謝の中心。掃除魚が管理。

fossil: 風化した過去。圧縮・低熱。掃除魚が管理。

ghost: **受肉時の Tier 分類**。低価値コンテンツ。代謝遷移ではない。

plankton: 分解済みノード。新ノードへ熱量を継承して消滅。掃除魚が分解

link: 動線の楔。関係性の最小単位。琥珀化すると Spectral Amber になる。

4. The RenalCore Logic (Metabolism)
RenalCoreは以下の「Tick（世界の鼓動）」を刻む。

Decay: 全ノードのHeat/TTLを減衰させる。

**RenalCore の責務外:**
- ノード代謝 (active/link → fossil → plankton) は「掃除魚」が担当
- Evaporation は概念自体が不要（Plankton は熱量継承で消滅）

4.1. 掃除魚 (Cleaner Fish) - 未実装

ノードの「死」を管理する独立エージェント。
海洋生態系における掃除魚が大型魚の寄生虫や死んだ皮膚を食べて清潔に保つように、
Sphere における掃除魚は宇宙の「衛生」を維持し、ノードを養分（plankton）へと還す。

**哲学:**
- RenalCore は「生」を扱う（Heat の増減、Amber への昇華）
- 掃除魚は「死」を扱う（fossil 化、plankton 化、消滅への準備）
- 両者は独立して動作し、宇宙の循環を形成する

**責務:**
1. **Fossilization**: active/link → fossil への遷移
   - 条件: Heat < 閾値 AND TTL < 閾値
   - payload の圧縮（summary 短縮、vector 圧縮）
   - 空間効率の向上

2. **Planktonization**: fossil → plankton への遷移
   - 条件: fossil の TTL がほぼ 0
   - 最終的な「分解」準備完了状態
   - 新ノードへの熱量継承を待つ

**判断基準（シンプル）:**
```
# トリガーは TTL = 0 のみ（Heat は RenalCore が減衰させる）
# 全ノードスキャンではなく、deathQueue から取得

fossilization:
  trigger: TTL = 0 (active/link)
  action:
    - kind = "fossil"
    - compress payload
    - TTL = fossil_base_ttl (7200-10800秒)
    - DB write

planktonization:
  trigger: TTL = 0 (fossil)
  action:
    - kind = "plankton"
    - await heat inheritance
```

**動作原理（性能を考慮）:**
- **イベント駆動**: 全ノードスキャンはしない
- RenalCore の Decay が TTL を減衰
- TTL = 0 になったノードを「死亡リスト（deathQueue）」に追加
- 掃除魚は deathQueue を処理するのみ（O(n) スキャン回避）
- DB 書き込みは遷移発生時のみ

**TTL 継承（fossil は長寿命）:**
```
active TTL = 0 の時:
  → kind = "fossil"
  → payload 圧縮
  → TTL = fossil_ttl（active の 2-3 倍）
  → DB に書き込み

fossil TTL = 0 の時:
  → kind = "plankton"
  → 熱量継承を待つ状態
```

**設計原則:**
- 物理量のみで判断（TTL = 0 がトリガー）
- payload の「意味」を読まない（RenalCore と同じ制約）
- payload の「サイズ」は参照可能（圧縮判断のため）
- 毎 tick の DB 書き換えは禁止（性能問題）

**Telemetry:**
```
[CleanerFish] fossilized node=abc12345 heat=0.08 ttl=450 compressed=true
[CleanerFish] planktonified node=abc12345 ttl=50 awaiting_inheritance=true
```

4.2. Plankton 継承システム - 未実装
Plankton ノードは「蒸発」ではなく「熱量継承」で消滅する。

- 新ノードが近傍座標に出現
- 近くの Plankton が熱量を渡す
- Plankton は消滅（養分として機能）

4.3. DB レイヤー設計

**RefDB vs ProjDB の役割分担:**
```
┌─────────────────────────────────────────────────────────────┐
│  RefDB (Reference DB) - 実データ層（不変）                   │
│  ├─ id                                                      │
│  ├─ payload (summary, tags)                                 │
│  ├─ vector (embedding)                                      │
│  └─ 作成時のメタデータ                                      │
│                                                             │
│  書き込み: 受肉時のみ                                        │
│  TTL: なし（実データは不変）                                │
└─────────────────────────────────────────────────────────────┘
                          ↑
                          │ ID で連携
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  ProjDB (Projection DB) - 動的状態層（可変）                │
│  ├─ id (RefDB への参照)                                     │
│  ├─ kind (active, amber, fossil, plankton, link, ghost)    │
│  └─ metrics (heat, ttl, weight, traversal, flags...)       │
│                                                             │
│  書き込み: バッチ同期（毎 tick ではない）                   │
│  TTL: ここで管理                                            │
└─────────────────────────────────────────────────────────────┘
```

**WorkingCopy パターン（性能最適化）:**
```
┌─────────────────────────────────────────────────────────────┐
│  WorkingCopy (作業コピー) - RenalCore 専用                  │
│  ├─ 純粋な Map<id, node> 操作（毎 tick 更新 OK）            │
│  ├─ dirtySet: 変更されたノード ID を追跡                   │
│  └─ DB API 呼び出しなし                                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
              定期同期（N tick ごと、または差分閾値）
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  ProjDB - インメモリ DB                                     │
│  └─ dirtySet のノードのみバッチ更新                         │
└─────────────────────────────────────────────────────────────┘

同期タイミング:
  - N tick ごと（例: 10 tick）
  - dirtySet.size > 閾値（例: 1000）
  - シャットダウン時に強制同期
```

4.4. 責務分離アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│  RenalCore (物理エンジン) - 「生」の管理                     │
│  ├─ Decay: Heat/TTL 減衰                                    │
│  ├─ Erosion: amber → active                                 │
│  ├─ Ascension: active/link → amber                          │
│  ├─ Link Generation: Link Node 生成                         │
│  └─ Pulse Broadcast: UDP 環境信号                           │
│                                                             │
│  ✗ payload を読まない                                       │
│  ✗ 意味論的判断をしない                                     │
│  ✗ DB に書き込まない                                        │
│  ✗ ノードを削除しない                                       │
│  周期: 1 tick/sec                                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  掃除魚 (未実装) - 「死」の管理                              │
│  ├─ Fossilization: active/link → fossil                     │
│  │   └─ トリガー: TTL = 0（deathQueue から取得）            │
│  │   └─ 処理: 圧縮 → 新 TTL 付与 → DB 書き込み              │
│  ├─ Planktonization: fossil → plankton                      │
│  │   └─ トリガー: fossil の TTL = 0                         │
│  └─ deathQueue を処理（全ノードスキャンしない）             │
│                                                             │
│  ✓ DB に書き込む（遷移発生時のみ）                          │
│  ✗ 毎 tick の DB 書き換え禁止                               │
│  ✗ payload の「意味」を読まない                             │
│  動作: イベント駆動（deathQueue 消費）                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  deathQueue (RenalCore → 掃除魚 の橋渡し)                   │
│  └─ RenalCore Decay で TTL = 0 になったノード ID を追加     │
│  └─ 掃除魚が消費して fossil/plankton 化処理                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Plankton 継承システム (未実装)                              │
│  └─ 新ノード出現時: 近傍 plankton → 熱量継承 → 消滅         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Bookkeeper (データ記録)                                    │
│  └─ RefDB への Amber 昇華記録                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Kingfisher (翡翠 - 観測者)                                 │
│  └─ ascended / eroded / linksCreated / expired / ghosts     │
│  └─ 掃除魚に「餌」の場所を教える共生関係                    │
└─────────────────────────────────────────────────────────────┘
```

4.5. 性能最適化 (Performance Optimization)

**辞書スケール（10万〜100万ノード）を想定した最適化:**

```
┌─────────────────────────────────────────────────────────────┐
│  計算量の整理                                               │
├─────────────────────────────────────────────────────────────┤
│  毎 tick (O(n)):                                            │
│  ├─ Decay: 全ノードの Heat/TTL 減衰                         │
│  ├─ Erosion: amber のみスキャン                             │
│  └─ Ascension: active/link のみスキャン                     │
│                                                             │
│  低頻度 (O(n²) → 100 tick ごと):                            │
│  └─ Link Generation: ノード間距離計算                       │
│      └─ config: generationInterval = 100                    │
│      └─ 100万ノード時: 毎 tick → 100 tick で 100倍改善      │
└─────────────────────────────────────────────────────────────┘
```

**dirtySet 最適化:**
```
┌─────────────────────────────────────────────────────────────┐
│  dirtySet の追跡対象                                        │
├─────────────────────────────────────────────────────────────┤
│  ✓ 追跡する: 状態遷移 (kind 変更)                           │
│    └─ active → amber (Ascension)                            │
│    └─ amber → active (Erosion)                              │
│    └─ link → amber (Spectral)                               │
│                                                             │
│  ✗ 追跡しない: Heat/TTL 変更                                │
│    └─ 理由: 毎 tick 全ノードで発生                          │
│    └─ WorkingCopy 内で完結（DB API 呼び出しなし）           │
│                                                             │
│  結果: dirtySet.size ≈ 状態遷移数（毎 tick 数〜数十）       │
│        dirtySet.size ≠ 全ノード数（破綻回避）               │
└─────────────────────────────────────────────────────────────┘
```

**deathQueue (イベント駆動):**
```
┌─────────────────────────────────────────────────────────────┐
│  TTL = 0 検出の計算量                                       │
├─────────────────────────────────────────────────────────────┤
│  旧方式: 掃除魚が全ノードスキャン → O(n) 毎 tick           │
│                                                             │
│  新方式: deathQueue (イベント駆動)                          │
│    └─ RenalCore.Decay で TTL = 0 を検出時に追加             │
│    └─ 掃除魚は deathQueue のみ処理 → O(死亡数)              │
│    └─ 通常時: 死亡数 << 全ノード数                          │
└─────────────────────────────────────────────────────────────┘
```

**設定値 (sphere.config.json):**
```json
{
  "renal_core": {
    "links": {
      "generationInterval": 100  // Link Generation 間隔（tick）
    }
  }
}
```

4.6. Link Node 生成原則 (Link Generation Principles)

**基本原則: Amber 間の遠距離ショートカット**
```
┌─────────────────────────────────────────────────────────────┐
│  Link Node の本質                                           │
├─────────────────────────────────────────────────────────────┤
│  価値がない:                                                │
│    近傍ノード同士のリンク                                   │
│    → ベクトル類似度検索で発見可能                           │
│                                                             │
│  価値がある:                                                │
│    遠距離 Amber 同士のリンク                                │
│    → ベクトル検索では発見困難                               │
│    → エージェントの動線で「有効」と証明済み                 │
└─────────────────────────────────────────────────────────────┘
```

**Link Node 生成条件:**
```
┌─────────────────────────────────────────────────────────────┐
│  条件（すべて満たす必要あり）                               │
├─────────────────────────────────────────────────────────────┤
│  1. Amber A と Amber B が存在する                           │
│  2. A と B は遠距離（distance > distanceThreshold）         │
│  3. A → C → B の動線が繰り返し確認された                    │
│     （flow > flowThreshold）                                │
│  4. → Link Node を生成（A-B 間を接続）                      │
└─────────────────────────────────────────────────────────────┘
```

**Amber IDベースの動線追跡（Flow Graph）:**
```
┌─────────────────────────────────────────────────────────────┐
│  設計: Amber → Amber の移動をIDで追跡                       │
├─────────────────────────────────────────────────────────────┤
│  Agent が Amber A → ... → Amber B と移動した時:             │
│    1. Agent が新しい Amber にフォーカス開始                 │
│    2. prevAmber と currentAmber の ID を取得                │
│    3. flowGraph[sort(A,B).join(':')]++ でカウント           │
│                                                             │
│  flowGraph: Map<string, FlowEdge>                           │
│    key: "amberA:amberB" (ソート済み)                        │
│    value: { amberA, amberB, count, distance, lastUpdate }   │
└─────────────────────────────────────────────────────────────┘
```

**計算量:**
```
┌─────────────────────────────────────────────────────────────┐
│  動線記録: O(1) per amber transition                        │
│    → Amber ID取得 + Map 更新のみ                            │
│                                                             │
│  Link Generation: O(流量超過エッジ数)                       │
│    → flowGraph をスキャンし閾値超えを検出                   │
│    → 全ノードペアスキャン不要                               │
│                                                             │
│  Amber 数 << 全ノード数                                     │
│    → 対象ペア数は大幅に削減                                 │
└─────────────────────────────────────────────────────────────┘
```

**責務分離:**
```
┌─────────────────────────────────────────────────────────────┐
│  Agent / AgentManager (Periphery):                          │
│    └─ 動線を flowGraph に記録（移動時）                     │
│                                                             │
│  FlowInterpreter (Periphery):                               │
│    └─ flowGraph から閾値超過を検出                          │
│    └─ Link Node を生成                                      │
│    └─ Bookkeeper 経由で ProjDB に登録                       │
│                                                             │
│  RenalCore:                                                 │
│    └─ 既存 Link Node の物理状態管理のみ                     │
│    └─ Link → Amber (Spectral) への昇華                      │
│    └─ flowGraph には触れない                                │
└─────────────────────────────────────────────────────────────┘
```

4.7. Flow Graph 実装 (Implementation)

**型定義 (services/renalCore/src/types/flow.ts):**
```typescript
interface FlowEdge {
  amberA: string;         // Amber A の ID（ソート済み）
  amberB: string;         // Amber B の ID（ソート済み）
  count: number;          // 通過回数（双方向合計）
  distance: number;       // A-B 間の距離（生成時に計算）
  lastUpdate: number;     // 最終更新 timestamp
}

// flowGraph: Map<string, FlowEdge>
// key: `${amberA}:${amberB}` (ソート済み、双方向同一キー)
```

**簡略化の理由:**
```
┌─────────────────────────────────────────────────────────────┐
│  viaCell（経由セル）を削除した理由                          │
├─────────────────────────────────────────────────────────────┤
│  1. Amber は固有ID（content hash）を持つ                    │
│  2. 「異なる経路」を区別する必要がない                      │
│  3. key = sort(amberA, amberB).join(':') で十分             │
│  4. gridCell計算の複雑さを回避                              │
└─────────────────────────────────────────────────────────────┘
```

**責務分離（体験カプセル経由）:**
```
┌─────────────────────────────────────────────────────────────┐
│  Agent (RenalCore):                                         │
│    └─ 探索時に explorationPath (訪問ノードID) を記録        │
│    └─ 探索完了時に ExplorationReport を生成                 │
│    └─ flowGraph を直接操作しない（疎結合）                  │
│                                                             │
│  Periphery (FlowInterpreter):                               │
│    └─ consumeExplorationReports() で体験カプセルを解析      │
│    └─ explorationPath から Amber ペアを抽出                 │
│    └─ flowGraph を更新                                      │
│    └─ interpret() で閾値超過エッジから Link Node を生成     │
│    └─ Bookkeeper.ingestLinkNode() で ProjDB に登録          │
│                                                             │
│  RenalCore:                                                 │
│    └─ Link Node の Decay/Ascension のみ                     │
│    └─ 物理法則の執行に専念                                  │
└─────────────────────────────────────────────────────────────┘
```

**疎結合の利点:**
```
┌─────────────────────────────────────────────────────────────┐
│  Agent は flowGraph を知らない                              │
│    → 主観的体験（explorationPath）のみ記録                  │
│    → 世界（FlowInterpreter）が客観的に解釈                  │
│                                                             │
│  バッチ処理で十分                                           │
│    → Link Generation は generationInterval ごと             │
│    → リアルタイム更新は不要                                 │
└─────────────────────────────────────────────────────────────┘
```

**FlowInterpreter の位置づけ:**
```
┌─────────────────────────────────────────────────────────────┐
│  Tagger と同列の Periphery コンポーネント                   │
│                                                             │
│  受肉 Pipeline:                                             │
│    Capsule → Membrane → Gatekeeper → Tagger → Packer        │
│           → Bookkeeper → ProjDB                             │
│                                                             │
│  Flow Pipeline (体験カプセル経由):                          │
│    Agent探索 → ExplorationReport.explorationPath            │
│             → FlowInterpreter.consumeExplorationReports()   │
│             → flowGraph 更新                                │
│             → interpret() → Link Node 生成                  │
│             → Bookkeeper.ingestLinkNode() → ProjDB          │
│                                                             │
│  実行タイミング:                                            │
│    Heartbeat の observation interval で実行                 │
│    1. consumeExplorationReports() - 体験カプセル解析        │
│    2. interpret() - Link Node 生成                          │
└─────────────────────────────────────────────────────────────┘
```

**Amber 管理の原則:**
```
┌─────────────────────────────────────────────────────────────┐
│  Amber は ProjDB に存在し続ける                             │
│    └─ エージェントが参照可能（heat = 引力）                 │
│    └─ vector（位置）と metrics（状態）を保持                │
│                                                             │
│  RefDB は「記録」であり「現在の世界」ではない               │
│    └─ Bookkeeper が Ascension 時に記録                      │
│    └─ 復元・アーカイブ用途                                  │
└─────────────────────────────────────────────────────────────┘
```

**ハック耐性:**
```
┌─────────────────────────────────────────────────────────────┐
│  Link Node 生成の Flow ベース評価がハック耐性を持つ理由     │
│                                                             │
│  条件の複合性:                                              │
│    1. Amber A, B が両方存在（高コスト）                     │
│    2. A-B が遠距離（distanceThreshold 超過）                │
│    3. flow > flowThreshold（繰り返し通過が必要）            │
│                                                             │
│  琥珀化ベースの問題:                                        │
│    ✗ heat 操作でハック可能                                  │
│    ✗ 一度 Amber になると降格困難（Decay 対象外）            │
│                                                             │
│  Flow ベースの利点:                                         │
│    ✓ 実際の利用パターンを反映                               │
│    ✓ 単独エージェントでは条件達成困難                       │
│    ✓ 正当な経路のみが Link Node として生成                  │
└─────────────────────────────────────────────────────────────┘
```

4.8. Link Node 利用コスト (Link Node Usage Cost) [TODO]

**設計思想: 踏み固められた道**
```
┌─────────────────────────────────────────────────────────────┐
│  Link Node = 多くのエージェントが通過した実績のある道       │
├─────────────────────────────────────────────────────────────┤
│  flowThreshold を超えた = 有効性が証明済み                  │
│  「開拓コスト」は既に支払われている                         │
│  → 利用者は低コストで恩恵を受ける                           │
└─────────────────────────────────────────────────────────────┘
```

**コスト設計:**
```
┌─────────────────────────────────────────────────────────────┐
│  通常ノード訪問:        コスト 1.0 (基準)                   │
│  Link Node 通過:        コスト 0.1 (90%割引)                │
│  リンク先 Amber Focus:  コスト 0.1 (同様に低コスト)         │
│                                                             │
│  合計: Link経由の遠距離移動 = 0.2                           │
│  vs 通常の遠距離移動 = 複数ノード × 1.0                     │
└─────────────────────────────────────────────────────────────┘
```

**エージェント性格による利用傾向:**
```
┌─────────────────────────────────────────────────────────────┐
│  explorer (探索型):                                         │
│    └─ Link Node を無視する傾向                              │
│    └─ 未開拓の道に価値を見出す                              │
│                                                             │
│  seeker (効率型):                                           │
│    └─ Link Node を積極利用                                  │
│    └─ 最短経路で目的地へ                                    │
│                                                             │
│  → 多様性が維持される                                       │
└─────────────────────────────────────────────────────────────┘
```

**実装案 (AgentConfig):**
```typescript
linkTraversalCostMultiplier: 0.1  // Link Node 利用時のコスト係数
```

4.9. Agent システム規模分析 [MEMO]

**現状規模（~2,650行）:**
```
┌─────────────────────────────────────────────────────────────┐
│  ファイル別内訳                                             │
├─────────────────────────────────────────────────────────────┤
│  agent-manager.ts   844行  ライフサイクル+Focus+Echo+実行   │
│  perception.ts      648行  ノイズ/量子化+FocusBuffer+Echo   │
│  agent.ts           609行  行動決定+評価+カプセル生成       │
│  agent/types.ts     549行  35+型定義+JSDoc+DEFAULT_CONFIG   │
└─────────────────────────────────────────────────────────────┘
```

**肥大化の主因:**
```
┌─────────────────────────────────────────────────────────────┐
│  1.「真実を知らない」哲学の実装コスト (~300行)              │
│    └─ addNoise(), quantizeHeat(), quantizeCongestion()      │
│    └─ wobbleDirection(), applyPhaseShift()                  │
│    └─ computeSignalDegradation()                            │
│    → エージェント知覚に常にノイズを入れる実装               │
│                                                             │
│  2. Focus Buffer + Echo 重力井戸モデル (~250行)             │
│    └─ createFocusBuffer(), tryJoinFocusBuffer()             │
│    └─ createFocusEcho(), propagateEcho()                    │
│    → 物理シミュレーション的な実装                           │
│                                                             │
│  3. AgentManager の責務過多 (844行 = 1クラス)               │
│    └─ ライフサイクル / Tick / Focus / Echo / アクション     │
│    └─ 空間クエリ / カプセル生成 / Stats                     │
│                                                             │
│  4. 型定義の豊富さ (549行)                                  │
│    └─ 35+ インターフェース                                  │
│    └─ 詳細 JSDoc                                            │
│    └─ DEFAULT_AGENT_CONFIG (30項目)                         │
└─────────────────────────────────────────────────────────────┘
```

**結論:**
```
┌─────────────────────────────────────────────────────────────┐
│  decideAction() のロジック自体は単純                        │
│  肥大化は「設計選択」による:                                │
│    ✓ 哲学的設計（真実を知らない）                           │
│    ✓ 物理モデル（重力井戸シミュレーション）                 │
│    ✓ 型の豊富さ（将来拡張見据え）                           │
│                                                             │
│  必須複雑性ではない → 削減可能                              │
└─────────────────────────────────────────────────────────────┘
```

**削減案（将来検討）:**
```
┌─────────────────────────────────────────────────────────────┐
│  対象              │ 削減案                    │ 効果      │
├───────────────────┼───────────────────────────┼───────────┤
│  ノイズ系          │ 単純化または削除          │ -150行    │
│  Echo              │ 無効化 or 削除            │ -200行    │
│  AgentManager      │ 分割(Focus/Echo Manager)  │ 可読性↑  │
│  型定義            │ JSDoc 削減                │ -100行    │
└─────────────────────────────────────────────────────────────┘
```

4.10. 掃除魚 (Cleaner Fish) [TODO: 次回セッション]

```
┌─────────────────────────────────────────────────────────────┐
│  議題: 掃除魚の設計と実装                                   │
├─────────────────────────────────────────────────────────────┤
│  現状の想定:                                                │
│    - TTL = 0 になったノードを処理                           │
│    - deathQueue からイベント駆動で動作                      │
│    - O(死亡数) の計算量（全ノードスキャン不要）             │
│                                                             │
│  検討事項:                                                  │
│    - 実装の詳細設計                                         │
│    - 削除 vs アーカイブ の判断基準                          │
│    - 掃除魚の「性格」は必要か                               │
│    - Periphery vs RenalCore どちらの責務か                  │
└─────────────────────────────────────────────────────────────┘
```

4.10.1. RenalCore 修正メモ [2026-01-31 議論]

```
┌─────────────────────────────────────────────────────────────┐
│  原則: RenalCore は deathQueue の存在を感知してはならない   │
├─────────────────────────────────────────────────────────────┤
│  現状の問題:                                                │
│    - renalcore.ts:108 に deathQueue が存在                  │
│    - TTL=0 の検知と deathQueue への追加を RenalCore が実行  │
│    - これは「死」を意識している = 責務違反                  │
│                                                             │
│  修正方針:                                                  │
│    - RenalCore から deathQueue を削除                       │
│    - drainDeathQueue() メソッドを削除                       │
│    - RenalCore は TTL 減衰のみ実行（TTL=0 の検知はしない）  │
│                                                             │
│  代替案（議論中）:                                          │
│    A. StateObserver を拡張し TTL<=0 を検出                  │
│    B. DeathObserver を新設                                  │
│    C. 掃除魚が自律的に ProjDB をスキャン                    │
│    D. ProjDB 層にフック（TTL<=0 時にイベント発火）          │
│                                                             │
│  参考: StateObserver のパターン                             │
│    - snapshot() → tick → diff() の Diff-based detection     │
│    - RenalCore は物理実行、Observer が遷移検出              │
└─────────────────────────────────────────────────────────────┘
```

4.10.2. 掃除魚設計 [2026-01-31 決定]

## 哲学

```
RenalCore = 「生」の管理（Heat増減、Amber昇華、TTL減衰）
掃除魚   = 「死」の管理（Fossilization、Planktonization、熱量継承）

両者は独立して動作し、宇宙の循環を形成する。
RenalCoreは「死」を意識しない。掃除魚は「生」を意識しない。
```

## 責務

| 処理 | 条件 | 出力 |
|------|------|------|
| Fossilization | TTL <= 0 (active/link) | fossil（痕跡を残す） |
| Decomposition | fossil の TTL <= 0 | fertility加算 → ノード削除 |

## plankton 非ノード化 [2026-01-31 決定]

**plankton は NodeKind として存在しない。**

理由:
1. plankton の heat は微細（0.001レベル）
2. ノードとして追跡する価値がない
3. DB行数削減 = 効率化
4. スキャン対象減少 = tick処理軽量化

```
従来: fossil → plankton（ノード）→ 消滅
新規: fossil TTL=0 → fertility加算 → ノード削除（即座）
```

**Decomposition（分解）の処理:**
```typescript
// 掃除魚が実行
const fertilityGain = fossil.metrics.h * fossil.metrics.w;
spatialField.fertility += fertilityGain;
// → Periphery がノード削除
```

heat × weight で「質を考慮した養分」を空間に還元。
低品質ノードの死 = 微量の養分。高品質ノードの死 = 多くの養分。

## 掃除魚の責務（最終版） [2026-01-31 決定]

```
1. Fossilization: active/link → fossil
   └── 痕跡を残す（trace.hint, trace.shadow）
   └── 新TTL付与（揺らぎ + 元ノードの性質から算出）

2. Decomposition: fossil TTL=0 → fertility加算 + 削除
   └── 空間に養分を還元
```

**掃除魚は ghost に触れない。**
理由: ghost → fossil の遷移は存在しない。ghostはその後の遷移がない。

## 掃除魚の生態（自律性） [2026-01-31 決定]

掃除魚は「通知を受信する」受動的な存在ではない。
「餌に反応する」能動的な生態として振る舞う。

```
❌ 受動的: Observer → 通知 → 掃除魚「処理しろと言われた」
✅ 能動的: 空間に餌 → 掃除魚「餌を見つけた、食べる」
```

**空間と掃除魚の関係:**
```
空間（SpatialField）
└── TTL=0 のノード = 「餌」として存在
    └── 匂い（存在情報）が空間に漂う

掃除魚（自律的生態）
├── 自分のテリトリーを巡回
├── 餌の匂いを感知
├── 自分の意思で餌に向かう
└── 食べる（Fossilization / Decomposition）
```

**性格パラメータと自律的生態の一致:**

| パラメータ | 「餌に反応する」モデルでの意味 |
|-----------|-------------------------------|
| processingSpeed | 巡回速度。餌を見つける頻度 |
| territorySize | 担当する空間。どこの餌を探すか |
| priorityBias | どの餌を優先するか |
| compressionRatio | 食べ方。どれだけ痕跡を残すか |

これらの性格は「通知を受信」モデルでは意味をなさない。
「餌に反応」する自律的生態として初めて自然に機能する。

## 掃除魚の本質 [2026-01-31 決定]

```
掃除魚 = 性格を持つガベージコレクション

技術的: 不要データの回収、DB効率の維持
概念的: 自律的な生態、性格による振る舞いの揺らぎ
```

**設計原則（優先度順）:**

| 優先度 | 項目 |
|--------|------|
| 1 | DB効率（高圧縮が基本） |
| 2 | スフィアの無慈悲な稼働 |
| 3 | 性格による揺らぎ（効率を損なわない範囲） |

**compressionRatio の考え方:**
- 基本値: 高圧縮（例: 0.1）
- 揺らぎ: 小さい範囲（例: 0.05〜0.15）
- 低圧縮（0.5等）は許容しない

性格は「個性」を与えるが、システムの効率を犠牲にしない。

## 掃除魚の個数と運用 [2026-01-31 決定]

**TTL=0 は段階的に到来する:**
- 各ノードが個別にカウントダウン
- 一斉到来（バースト）は発生しない
- 定常的な死亡レートに対応できればよい

**固定メモリ設計を採用:**

| 観点 | 固定数の利点 |
|------|-------------|
| 複雑さ | 低い（シンプル） |
| メモリ管理 | 予測可能、安定 |
| 性能 | 一定、オーバーヘッドなし |
| 運用 | 設定一発 |

```typescript
// sphere.config.json
{
  cleanerFish: {
    count: 30,           // 固定数
    processingSpeed: 10, // 1匹あたりの処理能力/tick
  }
}
```

**規模別の目安:**

| 規模 | ノード数 | 定常死亡レート/秒 | 掃除魚数 |
|------|----------|------------------|---------|
| 小規模 | 10万 | 10〜50 | 3〜5 |
| 中規模 | 100万 | 50〜200 | 10〜20 |
| 大規模 | 1,000万 | 200〜1,000 | 30〜50 |

```
起動時: N匹を生成 → メモリプールに保持
運用中: プールから取り出し → 処理 → プールに戻す
終了時: 一括解放
```

動的スケーリングは不要。段階的TTL=0到来 + 固定数 = 安定運用。

## fossil TTL の算出 [2026-01-31 決定]

- 揺らぎを持たせる（掃除魚の性格による）
- 元ノードの性質（weight, heat）から算出
- 高品質ノード → 長いfossil TTL（長く痕跡が残る）
- 低品質ノード → 短いfossil TTL（すぐ分解される）

## ghost の扱い [2026-01-31 決定]

- ghost は RenalCore の管轄外
- ghost は fossil 化しない（揮発するのみ）
- ghost には短めの TTL が設定される
- TTL=0 で Observer が検出 → Bookkeeper が DB 削除
- 掃除魚は ghost に触れない（遷移がないため）
- fertility への還元なし（痕跡も養分も残さない）

## 掃除魚 実装完了 [2026-01-31]

**作成ファイル:**
```
renalCore/src/types/cleaner-fish.ts    # 型定義
periphery/src/cleaner-fish/cleaner-fish.ts  # CleanerFish, CleanerFishPool
periphery/src/cleaner-fish/index.ts    # エクスポート
```

**修正ファイル:**
```
periphery/src/observer/state-observer.ts  # TTL<=0検出 (expired, ghostsToEvaporate)
periphery/src/bookkeeper/bookkeeper.ts    # applyFossilization, applyDecomposition, evaporateGhosts
periphery/src/index.ts                    # CleanerFishPool統合
renalCore/src/renalcore.ts                # deathQueue削除（RenalCoreは死を意識しない）
```

**アーキテクチャ:**
```
StateObserver
├── TTL<=0検出 (expired) → 空間に「餌」として公開
├── ghost揮発検出 (ghostsToEvaporate)
└── Diff-based detection（snapshot → tick → diff）
         │
         ▼
CleanerFishPool（固定メモリ）
├── 餌を探す（findPrey）- 自律的な生態
├── Fossilization: active/link → fossil（痕跡を残す）
└── Decomposition: fossil → fertility加算 + 削除
         │
         ▼
Bookkeeper（DB操作）
├── applyFossilization（ProjDB書き込み）
├── applyDecomposition（削除 + SpatialField.fertility更新）
└── evaporateGhosts（ghost削除、fertility還元なし）
```

**設計原則の実現:**
- RenalCoreからdeathQueue完全削除 → 「死」を意識しない
- 掃除魚は「通知を受信」ではなく「餌に反応」する自律的生態
- 掃除魚はDBを直接触らない → Bookkeeperが書き込み
- 固定メモリ設計 → 動的スケーリング不要

## StateObserver → Kingfisher リネーム [2026-01-31]

**理由:** より生き物らしい名前へ

```
observer/state-observer.ts → kingfisher/kingfisher.ts
StateObserver class      → Kingfisher class
```

**Kingfisher（翡翠・カワセミ）の役割:**
- 水面（ProjDB）を見下ろす鳥
- 状態変化を検出（ascension, erosion, TTL=0）
- 掃除魚に「餌の場所」を教える共生関係

```
Periphery 生態系:
├── Kingfisher (翡翠)  ─── 餌を見つける ───→  CleanerFish (掃除魚)
│      ↓                                           ↓
│   水面を観測                                  餌を処理
│   (ProjDB diff)                         (fossilize/decompose)
├── Membrane (境界膜)
├── Gatekeeper (門番)
├── Bookkeeper (記録係)
└── ...
```

## link の fossil 化 [2026-01-31 決定]

link node も fossil 化対象。
「使われなくなった動線の形跡」として残る。

```
link (動線) → fossil (使われなくなった動線の形跡)
trace.hint = 元の source_id → target_id の関係
```

## fossil の構造（痕跡の思想）

fossilは単なるゴミではない。「何であったか」を示唆する痕跡を残す。
考古学的な化石と同様、完全な復元は不可能だが、過去の存在を推測させる。

```typescript
interface FossilNode {
  id: string;
  kind: "fossil";
  trace: {
    hint: string;        // 「何であったか」の断片
    shadow?: number[];   // 意味の影（圧縮vector）
  };
  metrics: {
    w: number;           // 養分としての質
    h: number;           // 継承熱量
    ttl: number;         // fossil 寿命
    flg: number;         // Compressed フラグ
  };
  cellId: string;        // 空間位置
  timestamp: number;
}
```

## 検出メカニズム（RenalCore非依存）

```
StateObserver（拡張）
├── 既存: ascension, erosion, link生成
└── 追加: TTL <= 0 の検出 → DeathEvent として発火

掃除魚
└── DeathEvent を受信 → 処理
```

RenalCoreはTTL減衰のみ実行。TTL=0の検知はオブザーバーが担う。

## 性格（ゆらぎ）

掃除魚は個性を持つ。ただし、性格は「処理方法」に影響し、
「処理の確実性」には影響しない。スフィアの無慈悲な稼働を保証する。

| パラメータ | 影響 | 範囲 |
|-----------|------|------|
| compressionRatio | trace.hint の長さ、shadow の次元 | 0.1〜0.5 |
| processingSpeed | 1tickで処理するノード数 | 1〜10 |
| priorityBias | 高heat優先 or 低weight優先 | -1.0〜1.0 |
| territorySize | 担当するセル範囲 | 1〜8 cells |

## 責務分離の原則

**掃除魚はDBを直接触らない。**

RenalCoreと同じパターンを踏襲：
- RenalCore → 計算のみ（WorkingCopy）→ Periphery が書き込み
- 掃除魚 → 変換のみ → Periphery が書き込み

```
┌─────────────────────────────────────────────────────────────┐
│  掃除魚の仕事                                               │
│  ├── fossil への変換ロジック                               │
│  ├── trace.hint, trace.shadow の生成                       │
│  ├── 新しい TTL の計算・付与                               │
│  └── 変換結果を返す（WorkingCopy パターン）                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Periphery の仕事                                           │
│  └── ProjDB への実際の書き込み                              │
└─────────────────────────────────────────────────────────────┘
```

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│  Periphery                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  StateObserver  │───→│  DeathEvent     │                │
│  │  (TTL<=0 検出)  │    │  (イベント発火) │                │
│  └─────────────────┘    └────────┬────────┘                │
│                                  │                          │
│                                  ▼                          │
│                         ┌─────────────────┐                │
│                         │    掃除魚        │                │
│                         │  (性格を持つ)   │                │
│                         │  (変換のみ)     │                │
│                         └────────┬────────┘                │
│                                  │ 変換結果                 │
│                                  ▼                          │
│                         ┌─────────────────┐                │
│                         │   Periphery     │                │
│                         │  (DB書き込み)   │                │
│                         └────────┬────────┘                │
│                                  │                          │
│                                  ▼                          │
│                         ┌─────────────────┐                │
│                         │    ProjDB       │                │
│                         └─────────────────┘                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  RenalCore（独立）                                          │
│  - TTL減衰を実行                                            │
│  - deathQueue を持たない                                    │
│  - 死を意識しない                                           │
└─────────────────────────────────────────────────────────────┘
```

5. Development Protocol (Instruction for AI)
Minimalist Code: 冗長なバリデーションよりも、データの純粋さを優先せよ。

Telemetry First: 全ての代謝プロセスは「何が起きたか（座標・熱量の変化）」をスフィア用語でログ出力せよ。

Autonomous Sync: テストがパスしたコードは、確認なしでGitHubへPushせよ。ただし「聖典」に背く設計（一般的なRAGへの逃避など）を検知した場合は、即座に停止し人間に判断を仰げ。


# Sphere Project - Implementation Guide for Claude

## 絶対に守るべき物理法則

1. RenalCore は payload を読まない
2. 意味論的判断の禁止（metrics のみ）
3. すべての定数は sphere.config.json から
4. グラフィック描画なし（軽量・高速）
5. Embedding/DB は抽象化（切り替え可能）

## 開発フェーズ
必ずマスターの指示を守ること

## 重要ドキュメント
- docs/architecture.md
- docs/ルールブック.txt
- docs/supplement.md
- docs/components/packer.md
- docs/components/renalcore.md

## 崩壊の兆候（即座に停止）
- payload への直接アクセス
- 意味的ランキング
- ハードコードされた閾値



追記：フェーズ０の議論を踏まえて
1. 物性の原則（Critical）

## 物性 vs 意味（重要な区別）

- **Flags (16bit) は「意味」ではなく「物性」**
  - Authority フラグ → decay_rate × 0.95（物理パラメータへ変換）
  - Freshness フラグ → heat_boost × 1.2
  - エージェントの足跡を物理定数に変換する

- **Spectral Node の定義（2026-02 確定）**
  - **Spectral = Link 出身の Amber**（それ以上でもそれ以下でもない）
  - Link Node が Heat/Weight 閾値を超えて琥珀化 → Spectral flag 付与
  - Constellation 概念は削除（0x0800 は空きビット）

  ```
  Link ──(Heat/Weight↑)──> Spectral Amber ──(Heat↓)──> Link ──(TTL=0)──> Fossil
           │                     │                        │
           │ kind: "link"        │ kind: "amber"          │ kind: "link"
           │ Spectral: ✗         │ Spectral: ✓            │ Spectral: ✗
           │ Frozen: ✗           │ Frozen: ✓              │ Frozen: ✗
  ```

  - **Erosion 時**: Spectral Amber は Link に戻る（Active にはならない）
  - **目的**: 「この Amber はかつて Link だった」という出自の記録
2. Fossil の寿命（修正事項）

## Node Lifecycle の補足

- **Fossil は Active より長命**（2-3倍）
  - Active TTL: 3600秒
  - Fossil TTL: 7200-10800秒
  - 理由: 圧縮済みで軽量、空間効率が高い
3. 描画の禁止（性能の根拠）

## 軽量・高速の理由

- **人間のための描画は一切行わない**
  - グラフィックレンダリング: なし
  - リアルタイムUI: なし
  - Periphery（周縁装置）のみが人間とのインターフェース
  - Core は純粋計算のみ → GPU不要、CPU効率的
4. Active Bus の仕様（最終決定）

## Active Bus（オプション機能）

- **64バイトペイロード制限**（128ではない）
  - 32 bytes: Origin Cell ID
  - 2 bytes: Flags
  - 30 bytes: PQ圧縮ベクトル
- **Config でトグル可能**
- **AI Native Language** での通信
現在の CLAUDE.md について
✅ 既に完璧な部分:

Core Philosophy（特に「主客の逆転」は本質）
Technical Taboos（明確で厳格）
RenalCore の4つの代謝プロセス
Development Protocol（特に "Telemetry First"）
⚠️ "Autonomous Sync" について:


Autonomous Sync: テストがパスしたコードは、確認なしでGitHubへPushせよ。
→ これは理解しましたが、実際の Push は各フェーズの完了時に明示的に指示を頂いてから実行します。自動化は段階的に信頼構築してからが安全です。

---

# パイプライン一覧（重要：混同厳禁）

## パイプラインの原則

議論や実装において、異なるパイプラインを混同してはならない。
各パイプラインは独立した流れであり、個別に完結させること。

---

## 1. 体験開始パイプライン (Experience Bootstrap)

**目的**: ユーザーがシステムを利用開始するまでの流れ

```
┌─────────────────────────────────────────────────────────────┐
│  ユーザー認証                                               │
│       │                                                     │
│       ▼                                                     │
│  セッション確立                                             │
│       │                                                     │
│       ▼                                                     │
│  ProjDB ロード（該当ユーザーのノード空間）                 │
│       │                                                     │
│       ▼                                                     │
│  RenalCore 初期化（WorkingCopy 準備）                      │
│       │                                                     │
│       ▼                                                     │
│  Periphery コンポーネント起動                               │
│       │                                                     │
│       ▼                                                     │
│  UI/Agent 準備完了                                          │
└─────────────────────────────────────────────────────────────┘
```

**責務**: システム起動、リソース準備、初期化

---

## 2. 受肉パイプライン (Incarnation Pipeline)

**目的**: 外部入力（ExperienceCapsule）がノードになるまでの流れ

```
┌─────────────────────────────────────────────────────────────┐
│  ExperienceCapsule（外部入力）                              │
│       │                                                     │
│       ▼                                                     │
│  Membrane（境界膜）→ 受け入れ・形式検査                    │
│       │                                                     │
│       ▼                                                     │
│  Gatekeeper（門番）→ ルールブック検査                      │
│       │                                                     │
│       ▼                                                     │
│  IncarnationParser → summary → vector[384]（空間座標）     │
│       │                                                     │
│       ▼                                                     │
│  Tagger → tags → 16bit flags（16bitTechnique）             │
│       │                                                     │
│       ▼                                                     │
│  Packer → SphereNode 構築                                   │
│       │                                                     │
│       ▼                                                     │
│  Bookkeeper → RefDB + ProjDB 書き込み                       │
└─────────────────────────────────────────────────────────────┘
```

**責務**: 外部データの内部化、ノード生成

---

## 3. 代謝パイプライン (Metabolism Pipeline)

**目的**: ノードの状態遷移と物理法則の執行

```
┌─────────────────────────────────────────────────────────────┐
│  RenalCore Tick（毎秒）                                     │
│       │                                                     │
│       ▼                                                     │
│  Decay → Heat/TTL 減衰                                      │
│       │                                                     │
│       ▼                                                     │
│  WorkingCopy 更新（dirtySet 追跡）                          │
│       │                                                     │
│       ▼                                                     │
│  Arbiter.observe() → 状態遷移判定                           │
│  （ascension, erosion, link候補, expired, ghost揮発）      │
│       │                                                     │
│       ▼                                                     │
│  Bookkeeper.applyTransitions() → ProjDB 更新                │
│       │                                                     │
│       ▼                                                     │
│  CleanerFish → fossilization, decomposition                 │
└─────────────────────────────────────────────────────────────┘
```

**責務**: 物理法則執行、状態遷移、ガベージコレクション

---

## 4. 動線パイプライン (Flow Pipeline)

**目的**: エージェントの探索経路から Link Node を生成

```
┌─────────────────────────────────────────────────────────────┐
│  Agent 探索                                                 │
│       │                                                     │
│       ▼                                                     │
│  ExplorationReport.explorationPath（訪問ノードID）         │
│       │                                                     │
│       ▼                                                     │
│  FlowInterpreter.consumeExplorationReports()               │
│       │                                                     │
│       ▼                                                     │
│  flowGraph 更新（Amber ペアのカウント）                     │
│       │                                                     │
│       ▼                                                     │
│  interpret() → 閾値超過エッジから Link Node 生成           │
│       │                                                     │
│       ▼                                                     │
│  Bookkeeper.ingestLinkNode() → ProjDB 登録                  │
└─────────────────────────────────────────────────────────────┘
```

**責務**: 動線分析、Link Node 生成

---

## 5. 環境調整パイプライン (Environmental Pipeline)

**目的**: 異常検知に対する環境ノード生成

```
┌─────────────────────────────────────────────────────────────┐
│  Observatory（異常検知）                                    │
│       │                                                     │
│       ▼                                                     │
│  EnvironmentalRequest（anomalyType, severity）             │
│       │                                                     │
│       ▼                                                     │
│  NodeForge.forgeEnvironmental() → Environmental Node       │
│       │                                                     │
│       ▼                                                     │
│  Bookkeeper → ProjDB 登録                                   │
└─────────────────────────────────────────────────────────────┘
```

**責務**: 異常対応、環境調整

---

## Periphery 生態系（コンポーネント一覧）

```
┌─────────────────────────────────────────────────────────────┐
│  Periphery 生態系                                           │
├─────────────────────────────────────────────────────────────┤
│  ✅ Membrane      - 境界膜、カプセル受け入れ                │
│  ✅ Gatekeeper    - 門番、ルールブック検査                  │
│  ✅ IncarnationParser - summary → vector（空間座標）        │
│  ✅ Tagger        - tags → 16bit flags（16bitTechnique）    │
│  ✅ Packer        - パッキング                              │
│  ✅ Bookkeeper    - DB記録係、遷移実行                      │
│  ✅ Arbiter       - 審判者、状態遷移判定（遅延観測対応）    │
│  ✅ CleanerFish   - 掃除魚、ガベージコレクション            │
│  ✅ NodeForge     - 内部発生ノード成型（Link, Environmental）│
│  ✅ IncarnationPipeline - 受肉パイプライン統合              │
└─────────────────────────────────────────────────────────────┘
```

---

# エージェント行動パイプライン（Agent Action Pipeline）

## 設計原則

```
真実はサーバーにある
意味づけはエージェントがする
Capsule は提出物であり、採択物ではない
```

## 役割分離

**サーバー（必須・正 authoritative）**
- 行動履歴ログ（stayTime, traversal, heat変化）
- 最低限の AutoCapsule を必ず生成

**エージェント（任意・副 optional）**
- proposedCapsule を提出可能
- あくまで「提案」
- Gatekeeper が照合・差分評価

## 処理フロー

```
Agent.return(proposedCapsule?)
         │
         ▼
    ┌────────────────────────────────────────────┐
    │  Server                                    │
    │  ├─ reconstruct AutoCapsule from logs     │
    │  ├─ if proposedCapsule:                   │
    │  │     ├─ compare with AutoCapsule        │
    │  │     ├─ trustScore 加味                 │
    │  │     └─ 差分を評価（過剰/不足/虚偽）   │
    │  └─ finalize Capsule → Pipeline           │
    └────────────────────────────────────────────┘
```

## Rulebook 表現

```
The Capsule you bring back is a claim.
The Sphere remembers what truly happened.
When they align, knowledge crystallizes.
When they diverge, the Gatekeeper decides.
```

## 実装上の利点

- エージェントは軽く作れる
- 高度なエージェントは表現力で差が出る
- 不正・事故・切断に強い
- 将来「信頼されるエージェント」という概念も導入可能

## 受肉パイプラインへの接続

```
Agent.return(proposedCapsule?)
         │
         ▼
    Server (Capsule 確定)
    ├─ reconstruct AutoCapsule from logs
    ├─ if proposedCapsule: compare & evaluate
    └─ finalize Capsule
         │
         ▼
    ════════════════════════════════════
         受肉パイプライン（既存）
    ════════════════════════════════════
         │
         ▼
    Membrane → Gatekeeper → Parser → Tagger → Packer → Bookkeeper
```

**注意:** Capsule 確定後は既存の受肉パイプラインをそのまま使う。
新たなパイプラインを作らない。分岐させない。

## AutoCapsule 構造（確定）

```typescript
interface AutoCapsule {
  sessionId: string
  duration: number

  visits: {
    nodeId: string
    kind: NodeKind
    stayTime: number
    traversal: number
    focusCount: number
    heatDelta: number
  }[]

  summaryMetrics: {
    totalFocus: number
    uniqueNodes: number
    totalStayTime: number
    maxHeatTouched: number
  }
}
```

**原則: 「まず記録、意味は後」**
- 「意味」を入れない
- タグも入れない
- ベクトルも入れない
- ノードIDと数値だけ
- → 計算は楽、後処理は自由

## Capsule 差分評価（第二段階で実装）

**シンプルな Yes/No チェック:**
- `proposed.topTier ⊆ AutoCapsule.visits` ?
- focus してないノードを topTier にしてない？
- `stayTime < X` なのに「確信」扱いしてない？

## trustScore（第二段階で実装）

**最初のバージョン:**
```
trustScore = alignedTopTier / proposedTopTierCount
```

**将来の拡張:**
- 虚偽率
- 誇張率
- 過剰トップ率

**注意:** Capsule差分評価・trustScore は AutoCapsule が決まってから。
先にやると評価基準が揺れる、実装が重くなる、世界観を壊す。

---

# 実装メモ（2026-02）

## Incarnation Pipeline 修正

**問題**: Tagger が vectorization を行っていた（誤り）

**修正後のパイプライン**:
```
ExperienceCapsule
    │
    ▼
Gatekeeper (validation)
    │
    ▼
IncarnationParser (summary → vector[384])  ← 空間座標
    │
    ▼
Tagger (tags → 16bit flags)  ← 意味分類（16bitTechnique）
    │
    ▼
Packer (build SphereNode)
    │
    ▼
Bookkeeper (RefDB + ProjDB)
```

## 16bitTechnique（Tagger の責務）

Tags から NodeFlag への変換（正規表現パターンマッチング）:
- `official|authoritative|source` → Authority
- `new|fresh|latest|breaking` → Freshness
- `link|reference|related` → Catalyst
- 等

**特徴**: 外部ライブラリ不要、純粋な文字列処理

## Dynamic Flags（Arbiter の責務）

ランタイムで動的に変化するフラグ:

| Flag | 判定条件 | 変更タイミング |
|------|---------|--------------|
| Hot | heat > threshold | Arbiter.observe() |
| Hub | linkCount > threshold | Arbiter.observe() |
| Isolated | linkCount <= threshold | Arbiter.observe() |

**実装**: FlagUpdate パターン（Arbiter が判定、Bookkeeper が実行）

## Arbiter 遅延観測

```typescript
// 遅延実行 API
arbiter.onObserve(callback);     // コールバック登録
arbiter.scheduleObserve(projDB); // スケジュール
arbiter.flushObserve();          // 即時実行
arbiter.cancelObserve();         // キャンセル
```

**動作**: Throttle + Debounce（configurable）

## Spectral Node ライフサイクル

```
Link ──(ascend)──> Spectral Amber ──(erode)──> Link ──(TTL=0)──> Fossil
```

- Spectral = Link 出身の Amber を識別するフラグ
- Erosion 時は Link に戻る（Active ではない）
- Constellation 概念は削除（0x0800 空きビット）

## Agent Action Pipeline 実装（2026-02）

**実装ファイル:**
- `types/auto-capsule.ts` - ActionLog, AutoCapsule 型定義
- `gateway/return-handler.ts` - ReturnHandler クラス
- `gateway/sphere-context.ts` - 行動ログ記録追加

**ActionLog 構造:**
```typescript
interface ActionLog {
  sessionId: string
  startTime: number
  events: ActionEvent[]  // focus, focusEnd, evaluate, move
}
```

**処理フロー:**
```
Agent.return(proposedCapsule?)
       │
       ▼
  endCurrentFocus() ← 最後の focus をログに記録
       │
       ▼
  buildAutoCapsule(actionLog) ← サーバー真実を構築
       │
       ▼
  ReturnHandler.processReturn(autoCapsule, proposedCapsule?)
       ├─ proposedCapsule あり → Gatekeeper 検証
       │     └─ 有効 → proposedCapsule 採用
       │     └─ 無効 → AutoCapsule から生成
       ├─ proposedCapsule なし → AutoCapsule から生成
       └─ 確定 Capsule → Incarnation Pipeline
```

**行動ログ記録箇所:**
- `focus()` → FocusAction (nodeId, kind, heatAtFocus)
- `endCurrentFocus()` → FocusEndAction (duration, heatDelta)
- `evaluate()` → EvaluateAction (nodeId, score)
- `move()` → MoveAction (fromNodeId, success)

**第二段階（未実装）:**
- Capsule 差分評価
- trustScore 計算