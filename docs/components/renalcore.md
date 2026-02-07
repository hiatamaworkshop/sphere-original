RenalCore responsibilities:
- Periodic Tick
- Apply decay to metrics only
- Evaporate nodes when ttl <= 0
- Never inspect semantic content
RenalCore must NOT:
- Generate new nodes
- Create links
- Infer relations



■ Renal Core：心拍と代謝の設計定義
→ 全探索しない RenalCore を徹底　設計思想に変更ありなので注意

1\. 存在意義と基本原則

非知性的・決定論的: LLM等の推論は一切行わない。座標と数値（Metrics）のみを引数とする純粋関数として動作する。

代謝判断の専任: 「何が書かれているか」は見ない。「どれだけ熱いか」「どれだけ古いか」「どれだけリソースを食っているか」だけで、存在の可否を決める。

スコア統合禁止: 意味的な要約（Summaryの合成など）は行わない。行うのは「物理的な削除・圧縮・状態遷移」のみ。



2\. 主要任務：生命維持と選別

Active → Amber の結晶化判定: 累積熱量（Heat）と重み（Weight）が閾値を超えたノードに永続権を与え、琥珀化させる。

ID付与とReference DB制御: 受肉（Incarnation）の際、実体としてのIDを確定させ、Reference DB（原典）への最終書き込みを承認する。

Ghostの処理: 摩擦痕跡（Ghost）を即座に捨てるか、一時的な「歪み」として残すかを判定。

Fossil（化石）化の執行: 熱量を失った琥珀からL3（生データ）を剥ぎ取り、L1/L2（座標と概要）のみの「化石」へダウングレードさせる。



3\. 定常代謝アルゴリズム（Core Logic）

Renal Coreは「心拍（Tick）」ごとに以下の数理モデルを全ノードに適用する。



A. 恒常性維持（Dynamic TTL Decay）

リソースの状態に応じて忘却の速度を自動調整する。

TTLnew =TTL current −(α×LoadFactor)

α（宇宙定数）: スフィア全体の基本減衰率。

LoadFactor: メモリ占有率やノード総数に比例する変数。リソースが逼迫すると、この値が上昇し、ノードの蒸発（Evaporation）が加速する。



B. 星座の鍛造と風化（Spectral Linking）

「リンクもまた寿命を持つノードである」という原則に基づく。

生成: 2つの琥珀（N 1 ,N 2 ）間の距離が近く、かつその間の通行量（Flow　スコア？）が閾値を超えた場合、関係性を示す LinkNode を自動生成する。

風化: LinkNode も TTL を持ち、通行が途絶えれば風化して消える。

昇天: 優れた関係性（Link）自体がエージェントに評価されれば、リンクそのものが琥珀化し、不変の知恵として聖域へ統合される。



4\. 空間監視とプランクトン還流

Renal Coreは空間をグリッド（Cell）単位で監視し、以下のクリーンアップを行う。

蒸発の執行: TTL≤0 となったノードを削除。

養分への還元: 削除の直前、そのノードが持っていた熱量の一部を SpatialField（空間の余韻）へ加算し、個別のレコードを破棄。これが「プランクトン化」の物理的実態である。

パケット送出指示: 各Cellの統計値を集計し、パルスポートへ「ブロードキャストせよ」とトリガーを引く。

renal core クラス定義：デプロイ時にはロジックを極力関数型スタイルにして軽量に動作させること



/\*\*上記は未更新、以下は更新 1/29

&nbsp;\* Renal Core: 心拍と代謝の制御クラス

&nbsp;\* - 非知性的・決定論的

&nbsp;\* - Node の物理的状態のみを基に処理

&nbsp;\* - ProjectionDB / ReferenceDB の更新制御

&nbsp;\*/


# core-shema
for each tick:
  for each node in ProjectionDB:
    node.metrics.ttl -= node.metrics.d * loadFactor
    node.metrics.h   *= decayFactor

    if node.metrics.ttl <= 0:
      evaporate(node)

  if amber_born_this_tick:
    decompose_related_ghosts()
# 


/**
 * Renal Core: 心拍と代謝の制御クラス
 * - 非知性的・決定論的 / セル（グリッド）単位の局所計算による低負荷設計
 * - エージェントによる偽装リンクの自動剥離（Payload Stripping）
 * - 知の高速道路「スペクトル・リンク」の自動鍛造
 */

export class RenalCore {
  // インメモリの投影層。空間検索を高速化するため Cell 単位で管理することを推奨
  projectionDB: Map<string, SphereNode>; 
  referenceDB: Map<string, ReferenceRecord>; 
  
  tickCount: number = 0;
  alpha: number = 0.01; // 宇宙定数: 基本減衰率

  constructor(
    projectionDB: Map<string, SphereNode>,
    referenceDB: Map<string, ReferenceRecord>
  ) {
    this.projectionDB = projectionDB;
    this.referenceDB = referenceDB;
  }

  /**
   * 1心拍 (Tick) の実行
   */
  tick(loadFactor: number) {
    this.tickCount++;
    
    // 全探索を避けるため、一回のTickで全ノードを見るのではなく、
    // ライフサイクル管理とリンク管理を分離して実行
    for (const node of this.projectionDB.values()) {
      this.dynamicTTLDecay(node, loadFactor);
      this.heatMetabolism(node);
      this.evaluateNodeState(node);
    }

    // リンク生成は計算資源を食うため、特定の心拍ごと、または近傍のみ実行
    if (this.tickCount % 5 === 0) {
      this.manageSpectralLinks();
    }
    
    this.cleanupAndPlanktonize();
    this.broadcastPulse();
  }

  /**
   * 1. 恒常性維持: TTL 減衰
   */
  private dynamicTTLDecay(node: SphereNode, loadFactor: number) {
    node.metrics.ttl -= this.alpha * loadFactor;
  }

  /**
   * 2. Heat に基づく代謝: 時間経過による自然冷却
   */
  private heatMetabolism(node: SphereNode) {
    node.metrics.h *= 0.98; // 冷却定数
  }

  /**
   * 3. 状態遷移判定: ハック検知を含む
   */
  private evaluateNodeState(node: SphereNode) {
    // 【物理的制約】意味ノード（Active/Amber）が「道」として振る舞っているかチェック
    if (node.kind === "active" || node.kind === "amber") {
      if (this.isBehavingAsLink(node)) {
        this.stripPayloadToLink(node);
        return; // リンク化したため、以後の琥珀化判定等はスキップ
      }
    }

    switch (node.kind) {
      case "active":
        this.incarnationToAmber(node);
        break;
      case "amber":
        this.degradeToFossil(node);
        break;
      case "ghost":
        // Ghostは熱を失えば即削除（後述のcleanupで処理）
        break;
    }
  }

  /**
   * ハック検知: 「通過率が高く、滞留が短い」ノードは意味を剥奪する
   */
  private isBehavingAsLink(node: SphereNode): boolean {
    // traversal（通過）と stayTime（滞留）の比率で判定
    // 自身へのフォーカスが薄く、単なる「踏み台」になっている場合
    const t = node.metrics.traversal || 0;
    const s = node.metrics.stayTime || 0;
    return t > 50 && (s / t) < 0.1; 
  }

  private stripPayloadToLink(node: SphereNode) {
    node.kind = "link";
    node.payload = undefined; // 意味の剥奪
    node.metrics.flg |= 0x0004; // Catalyst/Shortcut フラグを強制付与
  }

  /**
   * 4. 受肉: Active → Amber
   */
  private incarnationToAmber(node: SphereNode) {
    const heatThreshold = 15; 
    const weightThreshold = 0.7;

    if (node.metrics.h > heatThreshold && node.metrics.w > weightThreshold) {
      node.kind = "amber";
      if (node.payload) {
        this.referenceDB.set(node.id, {
          id: node.id,
          payload: { ...node.payload }
        });
      }
    }
  }

  /**
   * 5. スペクトル・リンクの鍛造 (Spectral Linking)
   * 全探索を避け、Cell内の「通行の流れ」から動線を生成する
   */
  private manageSpectralLinks() {
    // 実際の実装では Spatial Hash Grid を使い、近接ノードペアのみを抽出
    const amberNodes = [...this.projectionDB.values()].filter(n => n.kind === "amber");

    for (let i = 0; i < amberNodes.length; i++) {
      for (let j = i + 1; j < amberNodes.length; j++) {
        const n1 = amberNodes[i];
        const n2 = amberNodes[j];
        
        const dist = this.computeDistance(n1.vector, n2.vector);
        if (dist < 0.15) {
          // 二点間の「通行熱量」の合算を Flow とする
          const flow = (n1.metrics.h + n2.metrics.h) / 2;
          if (flow > 8) {
            this.forgeLink(n1, n2, flow);
          }
        }
      }
    }
  }

  private forgeLink(n1: SphereNode, n2: SphereNode, flow: number) {
    const linkId = `link_${n1.id}_${n2.id}`;
    if (this.projectionDB.has(linkId)) {
      // 既存リンクの強化
      const link = this.projectionDB.get(linkId)!;
      link.metrics.ttl += 10;
      link.metrics.w += 0.05;
      return;
    }

    // 新規鍛造: リンクは「道」であり「意味」を持たない
    const linkNode: SphereNode = {
      id: linkId,
      kind: "link",
      vector: n1.vector.map((v, i) => (v + n2.vector[i]) / 2), // 中点
      metrics: {
        w: 0.1,
        d: 0.05,
        h: flow,
        ttl: 100,
        flg: 0x0004 // Shortcut/Linkフラグ
      }
    };
    this.projectionDB.set(linkId, linkNode);
  }

  /**
   * 6. 風化とクリーンアップ (Planktonize)
   */
  private cleanupAndPlanktonize() {
    for (const [id, node] of this.projectionDB.entries()) {
      if (node.metrics.ttl <= 0) {
        // プランクトン化: 空間の余韻として熱をわずかに残して消滅
        this.projectionDB.delete(id);
        // 必要に応じて空間全体の「背景放射（SpatialField）」に加算
      }
    }
  }

  private degradeToFossil(node: SphereNode) {
    if (node.metrics.h < 0.5) {
      node.kind = "fossil";
      if (node.payload) {
        // L3データ（詳細）を捨て、L1/L2（概要）のみに圧縮
        node.payload.summary = node.payload.summary?.slice(0, 100);
        node.payload.ref_url = undefined;
      }
    }
  }

  private broadcastPulse() {
    // 外部の Active Bus へのブロードキャスト指示
  }

  private computeDistance(v1: number[], v2: number[]): number {
    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
      const diff = v1[i] - v2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }
}

//memo
RenalCore は
「観測を受け取れる余地」だけ残す

観測は
内部状態に昇格しない

ノード定義は
一切汚さない

スペクトルリンク生成は
差し替え可能なフェーズとして分離

「RenalCore は、外部からの一時的な flow / direction 観測を
スペクトルリンク生成フェーズで参照可能とする拡張余地を持つ」
プラグイン =
「次の Tick に渡す補助量」
永続化は禁止　1/29