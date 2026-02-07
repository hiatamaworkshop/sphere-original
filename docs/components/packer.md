// no-hard-coding of config numbers, to .config

export const PACKER_LIMITS = {
  MAX_ACTIVE_VECTORS_PER_BATCH: 3, // タグベクトル付与の上限
  MAX_TAG_CHARS: 64,              // ツイッター形式の制限
};

/** // 1/28
 * Packer: エージェントの帰還データをスフィアの規格に変換 
 */
export async function packTraceToSphereNodes(rawNodes: RawExperience[]): Promise<SphereNode[]> {
  const sorted = rawNodes.sort((a, b) => 
    (b.metrics.h * b.metrics.w) - (a.metrics.h * a.metrics.w)
  );

  const processedNodes = await Promise.all(sorted.map(async (raw, idx) => {
    const isPrimary = idx < PACKER_LIMITS.MAX_ACTIVE_VECTORS_PER_BATCH;
    
    // ★ ゴースト判定の追加
    // 熱量が極端に低い、あるいは「諦め(deadend)」フラグがある場合はゴースト化
    const isGhost = raw.metrics.h < 2.0 || raw.flg === 0xDEAD;

    const node: SphereNode = {
      id: generateId(),
      kind: isGhost ? "ghost" : "active", // ここで振り分け
      vector: await Parser.getVector(raw.content),
      tagVector: null,
      payload: isGhost ? null : { body: raw.content, links: raw.targetId ? [raw.targetId] : [] }, // ゴーストは軽量化
      metrics: { 
        w: raw.metrics.w, 
        h: raw.metrics.h, 
        d: 0.1, 
        ttl: isGhost ? 600 : 3600, // ゴーストは寿命を短く（10分程度）config設定に！
        flg: raw.flg, 
        stability: 0 
      },
      timestamp: Date.now()
    };

    if (!isGhost && isPrimary && raw.tagString) {
      node.tagVector = await Tagger.getTagVector(raw.tagString.slice(0, PACKER_LIMITS.MAX_TAG_CHARS));
    }

    return node;
  }));

  return processedNodes;
}


export class RenalCore { // 1/28
  private alpha = 0.01;

  constructor(
    private projectionDB: Map<string, SphereNode>,
    private referenceDB: Map<string, ReferenceRecord>
  ) {}

  tick(loadFactor: number) {
    for (const node of this.projectionDB.values()) {
      // 1. 基礎代謝（熱の冷却とTTL減少）
      node.metrics.ttl -= this.alpha * loadFactor;
      node.metrics.h *= 0.99; // 常に冷めていく物理

      // 2. 状態の変態（相転移ロジック）
      this.evaluateNodeState(node);
    }
    
    this.cleanup();
  }

  private evaluateNodeState(node: SphereNode) {
    switch (node.kind) {
      case "active":
        // 琥珀化の条件：熱量 + 継続的な安定性（不応期）
        if (node.metrics.h > 15) {
          node.metrics.stability += 0.1; // 徐々に成熟
        }
        if (node.metrics.stability >= 1.0) {
          this.crystallizeToAmber(node);
        }
        break;

      case "ghost":
              this.processGhostEcology(node);
              break;
      case "amber":
        this.purifySurroundingGhosts(node); // 琥珀による浄化
        this.degradeToFossil(node);
        break;
        break;

      case "fossil":
        // 化石はさらに冷えるとプランクトン化（削除）へ
        if (node.metrics.h < 0.1) this.projectionDB.delete(node.id);
        break;
    }
  }

  // 琥珀化（結晶化）
  private crystallizeToAmber(node: SphereNode) {
    node.kind = "amber";
    node.metrics.ttl = Infinity; // 代謝停止
    // ReferenceDB（永続層）に完全な知恵として刻む
    if (node.payload) {
      this.referenceDB.set(node.id, { id: node.id, payload: node.payload });
    }
  }
  /**
   * ゴーストの生態：
   * 意味を持たないが、そこに「いた」という気配だけをTTLで管理
   */
  private processGhostEcology(node: SphereNode) {
    node.metrics.ttl -= 0.5; // ゴーストはActiveより早く消える
    if (node.metrics.ttl <= 0) {
      this.projectionDB.delete(node.id);
    }
  }
  /**
   * 琥珀の浄化作用：
   * 正解（琥珀）が確定した座標の周辺から、迷いのログ（ゴースト）を一掃する
   */
  private purifySurroundingGhosts(amberNode: SphereNode) {
    const PURIFY_RADIUS = 0.05; // 浄化半径
    
    for (const [id, node] of this.projectionDB) {
      if (node.kind === "ghost") {
        const dist = calculateDistance(amberNode.vector, node.vector);
        if (dist < PURIFY_RADIUS) {
          // 知識の光が迷いを晴らす
          this.projectionDB.delete(id); 
        }
      }
    }
  }

  // 風化（エロージョン）
  private erodeAmber(node: SphereNode) {
    node.kind = "active";
    node.metrics.stability = 0.5; // 半分壊れた状態で再受肉
    node.metrics.ttl = 1800;      // 再び死（消滅）のカウントダウン開始
  }

  private cleanup() {
    // TTL切れやゴーストの掃除
    for (const [id, node] of this.projectionDB) {
      if (node.kind === "active" && node.metrics.ttl <= 0) {
        node.kind = "fossil"; // 即座に消さず、一度「化石」にして余韻を残す
      }
    }
  }
}