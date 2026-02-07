# Phase 3.5 & 3.6 完了メモ - 2026-01-30

## 🎯 達成事項

### Phase 3.5: Amber の大量生成テスト
**目標**: 高熱ノードを継続的に投入し、Amber の結晶化プロセスを観測する

**結果**: ✅ 成功 - Resonance スクリプトによる Amber 大量生成を確認

---

### Phase 3.6: Spectral Link のテスト
**目標**: Link ノードを投入し、Link → Amber (Spectral) への昇華を観測する

**結果**: ✅ 成功 - Link → Spectral への昇華を確認

---

## 🔧 実装した機能

### 1. MockEmbeddingProvider の拡張
**ファイル**: `services/periphery/src/parser/embedding-provider.ts`

**機能**: クラスター化されたベクトル生成
```typescript
// [RESONANCE-CLUSTER-X] を含む summary は、クラスター X のベースベクトル近傍にマッピング
// ベクトル距離 < 0.1 を保証（Link 形成閾値: 0.15）

const clusterMatch = text.match(/\[RESONANCE-CLUSTER-([A-Z])\]/);
if (clusterMatch) {
  const clusterId = clusterMatch[1];
  return this.generateClusterVector(clusterId);
}
```

**目的**:
- 近接したベクトルを持つノードを生成し、将来の Spectral Link 形成をテスト可能にする
- ランダムベクトルでは実現できない「クラスター化」を実現

---

### 2. Resonance スクリプトの作成
**ファイル**: `services/periphery/src/mock/resonance.ts`

**機能**: 高熱ノードの継続的投入
```typescript
// 各 capsule に含まれる内容（Phase 3.5 最終版）：
// - 3個の top-tier ノード（heat=85-100）
// - 2個の normal ノード（heat=60-80）
// - Freshness フラグ（0x0002）で heat を増幅

topTier.push({
  summary: `[RESONANCE-CLUSTER-${this.clusterId}] Amber Seed ${iteration}-${i + 1}`,
  initialHeat: 85 + Math.random() * 15, // 85-100
  flags: 0x0002, // Freshness flag
});
```

**実行方法**:
```bash
npm run resonance
```

**パラメータ**（環境変数）:
- `SERVER_URL`: デフォルト `http://localhost:3001`
- `CLUSTER_ID`: デフォルト `"A"`
- `INTERVAL_MS`: デフォルト `5000` (5秒)
- `MAX_INJECTIONS`: デフォルト 無制限

---

### 3. Packer の Link ノード生成機能（テスト用・後で削除）
**ファイル**: `services/periphery/src/packer/packer.ts`

**機能**: `[LINK]` キーワードで Link ノードを直接生成
```typescript
// Summary に [LINK] が含まれている場合、Link ノードとして生成
const isLink = seed.summary.includes("[LINK]");

const node: SphereNode = {
  kind: isLink ? "link" : (tier === "ghost" ? "ghost" : "active"),
  // ...
};

// Link ノードには linkMeta を追加（ダミー値）
if (isLink) {
  node.linkMeta = {
    source_id: "virtual_source",
    target_id: "virtual_target",
    isDirected: true,
  };
}
```

**注意**:
- これは**テスト用の一時的な実装**
- 本来の設計では、Link ノードは Packer が生成するものではない
- **Phase 3.6 完了後に削除すべき**

---

## 📊 動作確認されたログ

### Amber 生成（Phase 3.5）
```
[Bookkeeper] ingested node=4367f37f kind=active heat=99.09 ttl=17280
[RenalCore] ascension node=4367f37f active→amber heat=79.270 weight=0.800
[RenalCore] stats tick=41 relic=0 amber=3 active=2 ...
```

### Spectral Link 生成（Phase 3.6）
```
[Bookkeeper] ingested node=76a32917 kind=link heat=94.95 ttl=17280
[RenalCore] ascension node=76a32917 link→spectral heat=75.963 weight=0.800
```

**重要な発見**:
Link ノードは投入後すぐに Amber に昇華するため、stats では `link=0` と表示される。
これは正常な動作で、Spectral Link は **Amber としてカウント**される。

---

## 🔍 設計上の確認事項

### Link ノードの生成方法

**Phase 3.6 でのテスト方法**:
- Packer が `[LINK]` キーワードで Link ノードを直接生成（テスト用）

**本来の設計**:
- Active ノードが経路として使われる（traversal/stayTime が蓄積）
- 条件を満たすと RenalCore の `processLinkGeneration()` が Link ノードを生成
- Link ノードがさらに使われ続けると Amber に昇華 → Spectral Link

**ユーザーの見解**:
> "Active node が link node になることはありえない"

**今後の検討事項**:
- `processLinkGeneration()` の動作を再確認
- または、Link の生成方法を再設計

---

## 🎓 学んだこと

### 1. Link ノードの一時的な性質
Link ノードは高熱で投入すると即座に Amber に昇華するため、stats では観測できない。
これは設計上正しく、Link は「経路」としての役割を果たした後、Spectral Link として結晶化する。

### 2. クラスター化されたベクトルの有効性
MockEmbeddingProvider の拡張により、近接したベクトルを持つノード群を生成できるようになった。
これは将来、Amber 同士の関連性を視覚化する際に有用。

### 3. Resonance スクリプトの汎用性
Resonance スクリプトは高熱ノードの継続的投入だけでなく、様々なテストシナリオに応用可能：
- Cluster-A, B, C で異なるベクトル空間をテスト
- 環境変数で柔軟にパラメータ調整

---

## 📁 重要なファイル

### 新規作成
- `services/periphery/src/mock/resonance.ts` - Resonance スクリプト
- `PHASE3.5_3.6_COMPLETION_MEMO.md` - このメモ

### 修正
- `services/periphery/src/parser/embedding-provider.ts` - クラスター化ベクトル生成
- `services/periphery/src/packer/packer.ts` - Link ノード生成（テスト用、要削除）
- `services/periphery/package.json` - `npm run resonance` スクリプト追加

### Scripts
```bash
npm run dev        # サーバー起動
npm run observe    # リアルタイム監視
npm run resonance  # 高熱ノード継続投入
```

---

## 🚀 Phase 3 全体の完了状況

### Phase 3: Periphery - 世界の代謝システム

#### 確認済み代謝プロセス
- [x] Decay（減衰）- Active, Ghost の heat/TTL が減衰
- [x] Ascension（結晶化）- Active → Amber, Link → Amber (Spectral)
- [x] Evaporation（蒸発）- TTL ≤ 0 または Heat < 0.01 で削除
- [x] Fertility（還元）- 蒸発したノードの熱量が空間へ還元
- [x] Amber の大量生成（Resonance スクリプト）
- [x] Spectral Link の昇華（Link → Amber）

#### 未確認の代謝プロセス
- [ ] Erosion（風化）- Amber → Active への逆行
- [ ] Fossilization（化石化）- 長期未使用ノードの Fossil 化
- [ ] Plankton 生成 - Fertility からの Plankton 化
- [ ] Link Generation（経路検出）- traversal/stayTime による Link 生成（エージェント必要）

---

## 💡 次回セッションで検討すべきこと

1. **Packer の Link 生成機能を削除**
   - テスト用に追加した `[LINK]` キーワード機能を削除
   - resonance.ts も元の状態（Amber のみ）に戻す

2. **Link 生成の本来の設計を明確化**
   - `processLinkGeneration()` の役割を再確認
   - または新しい Link 生成メカニズムを設計

3. **Erosion / Fossilization のテスト**
   - Amber が長時間放置されると風化するかを確認
   - Fossil 化の条件をテスト

4. **Phase 4 の準備**
   - エージェント実装に向けた設計
   - Claude API との統合方法

---

**作成日**: 2026-01-30
**状態**: Phase 3.5 & 3.6 完了、テスト用コードの削除待ち
**動作確認**: ✅ Amber 大量生成、✅ Spectral Link 昇華
