/**
 * Sphere Project - Cleaner Fish
 *
 * [Role] 「死」の管理 - 自律的なガベージコレクション
 * [Principle] RenalCoreとは独立して動作
 * [Principle] DBを直接触らない（変換のみ、書き込みはPeriphery）
 *
 * 掃除魚は「通知を受信する」受動的な存在ではない。
 * 「餌に反応する」能動的な生態として振る舞う。
 */

import type { SphereNode } from "@sphere/renal-core";
import { NodeFlag } from "@sphere/renal-core";

/**
 * CleanerFishPersonality: 掃除魚の性格
 *
 * [Future] 個体差の拡張候補:
 *   - preference: "ghost" | "fossil" — 処理順序の好み (候補 > capacity 時に効く)
 *   - hungerSensitivity: 0.8-1.2 — 個体ごとの hunger 補正 (同じ環境でも反応が異なる)
 */
export interface CleanerFishPersonality {
  processingSpeed: number;
}

/**
 * CleanerFishConfig: システム設定
 */
export interface CleanerFishConfig {
  count: number;
  baseProcessingSpeed: number;
  baseFossilTTL: number;
  /** Max capacity multiplier at hunger=1.0 (linear interpolation from 1.0) */
  hungerCapacityMultiplier: number;
}

/**
 * FossilizationResult: 化石化の結果
 */
export interface FossilizationResult {
  nodeId: string;
  fossilNode: SphereNode;
  originalWeight: number;
  originalHeat: number;
}

/**
 * DecompositionResult: 分解の結果
 */
export interface DecompositionResult {
  nodeId: string;
  cellId: string;
  fertilityGain: number;
}

/**
 * GhostificationResult: ゴースト化の結果
 */
export interface GhostificationResult {
  nodeId: string;
  ghostNode: SphereNode;
}

// =========================================================================
// 環境駆動型 GC インターフェース
// =========================================================================

/**
 * EnvironmentState: 環境状態（CleanerFish の行動を決定する外部要因）
 *
 * [Design] DB容量は必須、磁場は後で接続
 */
export interface EnvironmentState {
  /** DB容量比率 (0.0 - 1.0) */
  dbCapacityRatio: number;
  /** 磁場強度 (0.0 - 1.0) - 後日実装 */
  fieldIntensity?: number;
}

/**
 * BehaviorParams: 行動パラメータ（環境から算出）
 *
 * [Design] Hunger が閾値を押し上げる = TTL > 0 でも捕食対象に
 */
export interface BehaviorParams {
  /** 処理意欲 (0.0 - 1.0) */
  hunger: number;
  /** 捕食対象 TTL 閾値（この TTL 以下を捕食） */
  preyTTLThreshold: number;
}

/**
 * TransitionThresholds: 遷移閾値（config で定義）
 *
 * [Design] TTL ベースの Access Level 遷移
 *   Active (TTL > ghostifyTTL) → Ghost (TTL > fossilizeTTL) → Fossil → End
 */
export interface TransitionThresholds {
  /** Active → Ghost の TTL 閾値 */
  ghostifyTTL: number;
  /** Ghost → Fossil の TTL 閾値 */
  fossilizeTTL: number;
  /** 捕食保護閾値: h + w がこれ以上で decompose から保護 */
  protectionThreshold?: number;
}

/**
 * ProcessResult: 処理結果（全遷移を含む）
 */
export interface ProcessResult {
  /** Active → Ghost */
  ghostified: GhostificationResult[];
  /** Ghost → Fossil */
  fossilized: FossilizationResult[];
  /** Fossil/Ghost → End */
  decomposed: DecompositionResult[];
}

/**
 * デフォルト遷移閾値（仮値、後で調整）
 */
export const DEFAULT_TRANSITION_THRESHOLDS: TransitionThresholds = {
  ghostifyTTL: 500,    // TTL <= 500 で Ghost 化
  fossilizeTTL: 100,   // TTL <= 100 で Fossil 化
};

/**
 * CleanerFish: 掃除魚クラス
 *
 * 自律的な生態として、空間を巡回し餌（TTL=0ノード）を処理する。
 */
export class CleanerFish {
  private readonly id: string;
  private readonly personality: CleanerFishPersonality;
  private readonly config: CleanerFishConfig;


  constructor(
    id: string,
    personality: CleanerFishPersonality,
    config: CleanerFishConfig
  ) {
    this.id = id;
    this.personality = personality;
    this.config = config;
  }


  /**
   * Ghostification: Active → Ghost
   * kind 変更のみ、データは全て維持
   *
   * [Design 2026-02-06] 遷移 = Access Level 切り替え
   *   - データ削除は decompose 時のみ
   *   - アクセス制限は API レスポンス時にフィルタリング
   */
  public ghostify(node: SphereNode): GhostificationResult {
    if (node.kind !== "active") {
      throw new Error(`Cannot ghostify non-active node: ${node.kind}`);
    }

    // Ghost ノードを生成（全データ維持、kind のみ変更）
    const ghostNode: SphereNode = {
      ...node,
      kind: "ghost",
      timestamp: Date.now(),
    };

    console.log(
      `[CleanerFish:${this.id}] ghostified node=${node.id.slice(0, 8)} ` +
        `ttl=${node.metrics.ttl.toFixed(0)}`
    );

    return {
      nodeId: node.id,
      ghostNode,
    };
  }

  /**
   * Fossilization: Ghost → Fossil
   * kind 変更 + Frozen フラグのみ、データは全て維持
   *
   * [Design 2026-02-06] 遷移 = Access Level 切り替え
   *   - データ削除は decompose 時のみ
   *   - アクセス制限は API レスポンス時にフィルタリング
   *   - TTL は Frozen フラグで凍結
   */
  public fossilize(node: SphereNode): FossilizationResult {
    if (node.kind !== "ghost") {
      throw new Error(`Cannot fossilize non-ghost node: ${node.kind}`);
    }

    // 元の情報を保存（結果用）
    const originalWeight = node.metrics.w;
    const originalHeat = node.metrics.h;

    // fossil ノードを生成（全データ維持、kind + flags のみ変更）
    const fossilNode: SphereNode = {
      ...node,
      kind: "fossil",
      metrics: {
        ...node.metrics,
        flg: node.metrics.flg | NodeFlag.Compressed | NodeFlag.SystemCore,  // Frozen metabolism
      },
      timestamp: Date.now(),
    };

    console.log(
      `[CleanerFish:${this.id}] fossilized node=${node.id.slice(0, 8)} ` +
        `ghost→fossil ttl=${node.metrics.ttl.toFixed(0)}`
    );

    return {
      nodeId: node.id,
      fossilNode,
      originalWeight,
      originalHeat,
    };
  }

  /**
   * Decomposition: fossil TTL=0 → fertility還元 + 削除
   */
  public decompose(fossilNode: SphereNode, cellId: string): DecompositionResult {
    if (fossilNode.kind !== "fossil") {
      throw new Error(`Cannot decompose non-fossil node: ${fossilNode.kind}`);
    }

    // fertility = heat × weight
    const fertilityGain = fossilNode.metrics.h * fossilNode.metrics.w;

    console.log(
      `[CleanerFish:${this.id}] decomposed node=${fossilNode.id.slice(0, 8)} ` +
        `cell=${cellId} fertility=+${fertilityGain.toFixed(4)}`
    );

    return {
      nodeId: fossilNode.id,
      cellId,
      fertilityGain,
    };
  }

  /**
   * Evaporation: ghost TTL=0 → 痕跡なし消滅
   *
   * [Design] Ghost は実体を持たないため、fertility 還元なし
   */
  public evaporate(ghostNode: SphereNode): DecompositionResult {
    if (ghostNode.kind !== "ghost") {
      throw new Error(`Cannot evaporate non-ghost node: ${ghostNode.kind}`);
    }

    console.log(
      `[CleanerFish:${this.id}] evaporated ghost=${ghostNode.id.slice(0, 8)}`
    );

    return {
      nodeId: ghostNode.id,
      cellId: "",  // 空（fertility なし）
      fertilityGain: 0,
    };
  }

  /**
   * 1tickで処理できるノード数
   */
  public getProcessingCapacity(): number {
    return Math.floor(
      this.config.baseProcessingSpeed * this.personality.processingSpeed
    );
  }

}

/**
 * CleanerFishPool: 掃除魚のメモリプール
 * 固定数の掃除魚を管理
 *
 * [Design] 環境駆動型 GC
 *   - DB容量 + 磁場 → Hunger → 捕食閾値
 *   - TTL ベースの Access Level 遷移
 */
export class CleanerFishPool {
  private readonly fish: CleanerFish[] = [];
  private readonly config: CleanerFishConfig;

  constructor(config: CleanerFishConfig) {
    this.config = config;
    // 固定数の掃除魚を生成
    for (let i = 0; i < config.count; i++) {
      const personality = this.generatePersonality();
      const fish = new CleanerFish(`fish-${i}`, personality, config);
      this.fish.push(fish);
    }

    console.log(
      `[CleanerFishPool] initialized with ${config.count} fish`
    );
  }

  /**
   * 性格を生成（基本は高圧縮、小さな揺らぎ）
   */
  private generatePersonality(): CleanerFishPersonality {
    return {
      processingSpeed: 0.8 + Math.random() * 0.4, // 0.8 - 1.2
    };
  }

  /**
   * 環境状態から行動パラメータを算出
   *
   * [Design] DB容量ベースの閾値テーブル（やや過敏な性格）
   *   - 通常 (<50%): TTL <= 40 (積極的に遷移)
   *   - 警戒 (~70%): TTL <= 80 (Fossil 対象)
   *   - 限界 (>90%): TTL <= 200 (Ghost/Fossil 対象)
   */
  private computeBehavior(env: EnvironmentState): BehaviorParams {
    const dbRatio = env.dbCapacityRatio;
    const fieldIntensity = env.fieldIntensity ?? 0;

    // Hunger 算出: DB容量が主、磁場は補助
    // [2026-02-06] 基底値を上げて過敏な性格に調整
    let hunger: number;
    if (dbRatio < 0.5) {
      hunger = 0.2;  // 通常: やや積極的
    } else if (dbRatio < 0.7) {
      hunger = 0.4 + (dbRatio - 0.5) * 2;  // 警戒: 徐々に上昇
    } else if (dbRatio < 0.9) {
      hunger = 0.6 + (dbRatio - 0.7) * 2;  // 高警戒: さらに上昇
    } else {
      hunger = 1.0;  // 限界: 最大
    }

    // 磁場による補正
    hunger = Math.min(1.0, hunger + fieldIntensity * 0.2);

    // 捕食閾値: Hunger に比例
    // hunger 0.1 → TTL <= 0
    // hunger 0.5 → TTL <= 50
    // hunger 1.0 → TTL <= 200
    const preyTTLThreshold = hunger < 0.2 ? 0 : Math.floor(hunger * 200);

    return { hunger, preyTTLThreshold };
  }

  /**
   * 保護チェック: エージェントの関心があるノードは捕食しない
   *
   * [Design] 関心スコアが閾値以上 = 誰かが見ている = 消すべきではない
   *   - Ghost: h + w で判定（weight も decay する）
   *   - Fossil: h のみで判定（weight は Frozen で凍結されているため）
   *
   * @param node 判定対象ノード
   * @param threshold 保護閾値
   * @returns true if protected, false otherwise
   */
  private shouldProtect(node: SphereNode, threshold?: number): boolean {
    if (threshold === undefined || threshold <= 0) return false;

    // Fossil: heat のみで判定（weight は Frozen フラグで凍結）
    // Ghost: h + w で判定（両方 decay する）
    const interestScore = node.kind === "fossil"
      ? node.metrics.h
      : node.metrics.h + node.metrics.w;

    return interestScore >= threshold;
  }

  /**
   * 遷移候補を抽出
   *
   * [Design] TTL ベースの Access Level 遷移
   *   - Active (TTL <= ghostifyTTL) → Ghost
   *   - Ghost (TTL <= fossilizeTTL) → Fossil
   *   - Fossil/Ghost (TTL <= preyTTLThreshold) → End
   */
  private findTransitionCandidates(
    nodes: SphereNode[],
    behavior: BehaviorParams,
    thresholds: TransitionThresholds
  ): {
    toGhostify: SphereNode[];
    toFossilize: SphereNode[];
    toDecompose: SphereNode[];
  } {
    const toGhostify: SphereNode[] = [];
    const toFossilize: SphereNode[] = [];
    const toDecompose: SphereNode[] = [];

    for (const node of nodes) {
      // 不滅ノードは対象外
      if (node.kind === "relic" || node.kind === "amber" || node.kind === "environment") {
        continue;
      }

      const ttl = node.metrics.ttl;

      if (node.kind === "active") {
        // Active → Ghost: TTL が ghostifyTTL 以下
        if (ttl <= thresholds.ghostifyTTL) {
          toGhostify.push(node);
        }
      } else if (node.kind === "ghost") {
        // Ghost → Fossil: TTL が fossilizeTTL 以下
        if (ttl <= thresholds.fossilizeTTL) {
          toFossilize.push(node);
        }
        // Ghost → End: TTL が preyTTLThreshold 以下（高 Hunger 時）
        else if (ttl <= behavior.preyTTLThreshold) {
          // 保護チェック: h + w が閾値以上なら捕食しない
          if (!this.shouldProtect(node, thresholds.protectionThreshold)) {
            toDecompose.push(node);
          }
        }
      } else if (node.kind === "fossil") {
        // Fossil → End: TTL が preyTTLThreshold 以下
        // TTL は継続減少するため、TTL <= 0 で自然に対象になる
        // Hunger 高時は preyTTLThreshold > 0 で早期 decompose
        if (ttl <= behavior.preyTTLThreshold) {
          // 保護チェック: h が閾値以上なら捕食しない（復活の可能性あり）
          const isProtected = this.shouldProtect(node, thresholds.protectionThreshold);
          if (isProtected) {
            console.log(
              `[CleanerFish] PROTECTED fossil=${node.id.slice(0, 8)} ` +
              `h=${node.metrics.h.toFixed(1)} w=${node.metrics.w.toFixed(1)} ` +
              `threshold=${thresholds.protectionThreshold}`
            );
          } else {
            toDecompose.push(node);
          }
        }
      }
    }

    return { toGhostify, toFossilize, toDecompose };
  }

  /**
   * 全掃除魚で餌を処理（環境駆動版）
   *
   * [Design] 環境状態から行動パラメータを算出し、遷移を実行
   */
  public process(
    nodes: SphereNode[],
    getCellId: (nodeId: string) => string,
    env: EnvironmentState,
    thresholds: TransitionThresholds = DEFAULT_TRANSITION_THRESHOLDS
  ): ProcessResult {
    const ghostified: GhostificationResult[] = [];
    const fossilized: FossilizationResult[] = [];
    const decomposed: DecompositionResult[] = [];

    // 環境から行動パラメータを算出
    const behavior = this.computeBehavior(env);

    // 遷移候補を抽出
    const candidates = this.findTransitionCandidates(nodes, behavior, thresholds);

    // Log candidates if any transitions will occur
    const totalCandidates = candidates.toGhostify.length + candidates.toFossilize.length + candidates.toDecompose.length;
    if (totalCandidates > 0 || behavior.hunger > 0.3) {
      console.log(
        `[CleanerFishPool] hunger=${behavior.hunger.toFixed(2)} ` +
          `preyTTL<=${behavior.preyTTLThreshold} ` +
          `candidates: ghost=${candidates.toGhostify.length} ` +
          `fossil=${candidates.toFossilize.length} ` +
          `decompose=${candidates.toDecompose.length}`
      );
    }

    // Hunger → capacity scaling: hunger 高 → 1匹あたりの処理量増加
    const hungerMultiplier = 1.0 + behavior.hunger * (this.config.hungerCapacityMultiplier - 1.0);

    // 各掃除魚が処理を分担
    let ghostifyIdx = 0;
    let fossilizeIdx = 0;
    let decomposeIdx = 0;

    for (const fish of this.fish) {
      const capacity = Math.floor(fish.getProcessingCapacity() * hungerMultiplier);
      let processed = 0;

      // 1. Ghostification (Active → Ghost)
      while (processed < capacity && ghostifyIdx < candidates.toGhostify.length) {
        const node = candidates.toGhostify[ghostifyIdx++];
        const result = fish.ghostify(node);
        ghostified.push(result);
        processed++;
      }

      // 2. Fossilization (Ghost → Fossil)
      while (processed < capacity && fossilizeIdx < candidates.toFossilize.length) {
        const node = candidates.toFossilize[fossilizeIdx++];
        const result = fish.fossilize(node);
        fossilized.push(result);
        processed++;
      }

      // 3. Decomposition (Fossil/Ghost → End)
      while (processed < capacity && decomposeIdx < candidates.toDecompose.length) {
        const node = candidates.toDecompose[decomposeIdx++];
        if (node.kind === "ghost") {
          const result = fish.evaporate(node);
          decomposed.push(result);
        } else if (node.kind === "fossil") {
          const cellId = getCellId(node.id);
          const result = fish.decompose(node, cellId);
          decomposed.push(result);
        }
        processed++;
      }
    }

    return { ghostified, fossilized, decomposed };
  }

}

/**
 * デフォルト設定
 */
export const DEFAULT_CLEANER_FISH_CONFIG: CleanerFishConfig = {
  count: 10,
  baseProcessingSpeed: 5,
  baseFossilTTL: 500,
  hungerCapacityMultiplier: 4,
};
