/**
 * Sphere Project - EnvForge
 *
 * [Role] Environmental Node の成型（環境調整）
 *
 * [Design] 異常検知に対応する環境ノードを生成
 *   - 配置位置は異常タイプに応じて決定
 *   - 環境への介入点として機能
 *
 * [Philosophy] Observatory からの環境調整リクエストに応答
 *   - 統計的異常に対する「処方箋」
 */

import type { SphereNode } from "@sphere/renal-core";
import type {
  IEnvForge,
  EnvironmentalRequest,
  EnvForgeConfig,
  AnomalyType,
} from "./types.js";
import { createHash } from "crypto";

/**
 * デフォルト設定（整数スケール: h/w閾値1000, d基準1000）
 */
const DEFAULT_CONFIG: EnvForgeConfig = {
  strategy: "statistical",
  initialTTL: 500,
  initialHeat: 50,       // 控えめ
  initialWeight: 400,    // 広範囲の影響
  decayRate: 1500,       // やや早めに減衰（処方箋は短命）
};

/**
 * StatisticalEnvForge: 統計的配置による Environmental Node 生成
 */
export class StatisticalEnvForge implements IEnvForge {
  private config: EnvForgeConfig;

  constructor(config: Partial<EnvForgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Environmental Node を成型する
   */
  forge(
    request: EnvironmentalRequest,
    projDB: Map<string, SphereNode>
  ): SphereNode | null {
    // 1. 配置位置を決定
    const position = this.computePlacement(request, projDB);

    if (!position) {
      console.warn(
        `[EnvForge] Could not determine placement for ${request.anomalyType}`
      );
      return null;
    }

    // 2. 環境ノード ID 生成
    const envId = this.generateEnvId(request.anomalyType);

    // 3. Environmental Node 構造生成
    // [Design] Environmental は一時的な処方箋、RefDB に記録しない
    const envNode: SphereNode = {
      id: envId,
      kind: "environment",
      vector: position,
      timestamp: Date.now(),
      payload: {
        summary: `Environmental: ${request.anomalyType} (severity: ${request.severity.toFixed(2)})`,
        tags: ["environmental", request.anomalyType],
      },
      metrics: {
        ttl: this.config.initialTTL ?? 500,
        h: this.config.initialHeat ?? 50,
        w: this.config.initialWeight ?? 400,  // 広範囲の影響を放出
        d: this.config.decayRate ?? 1500,     // やや早めに減衰
        flg: 0,  // 代謝する（役目を終えたら Fossil化 → 消滅）
      },
    };

    console.log(
      `[EnvForge] Forged environmental: ${envId.slice(0, 8)} ` +
        `type=${request.anomalyType} severity=${request.severity.toFixed(2)}`
    );

    return envNode;
  }

  // =========================================================================
  // Top-K Placement Strategy（軽量版）
  // =========================================================================
  // [Design] 重心計算（O(n × 384)）を避け、Top-K 抽出（O(n)）で配置位置を決定
  // Observatory は Pulse で異常を検知し、EnvForge は projDB から位置を特定

  /**
   * 異常タイプに応じた配置位置を決定（Top-K 方式）
   */
  private computePlacement(
    request: EnvironmentalRequest,
    projDB: Map<string, SphereNode>
  ): number[] | null {
    if (projDB.size === 0) {
      return this.randomPosition(projDB);
    }

    switch (request.anomalyType) {
      case "density_drop":
        // 最も heat の低いノードの位置（過疎地帯）
        return this.pickNodeByMetric(projDB, "coldest");

      case "repellent_spike":
        // traversal 高 + heat 低 = 忌避されているノード
        return this.pickNodeByMetric(projDB, "avoided");

      case "attractant_drop":
        // 最も heat の高い Active の位置（活性地帯の中心）
        return this.pickNodeByMetric(projDB, "hottest");

      case "flow_drop":
        // 最も traversal の低いノードの位置（流動性が低い地帯）
        return this.pickNodeByMetric(projDB, "stagnant");

      default:
        return this.pickRandomNode(projDB);
    }
  }

  /**
   * メトリクス基準でノードを選択
   */
  private pickNodeByMetric(
    projDB: Map<string, SphereNode>,
    criteria: "coldest" | "hottest" | "stagnant" | "avoided"
  ): number[] | null {
    let target: SphereNode | null = null;
    let bestValue = criteria === "hottest" ? -Infinity : Infinity;

    for (const node of projDB.values()) {
      // Active/Amber のみ対象
      if (node.kind !== "active" && node.kind !== "amber") continue;

      let value: number;
      switch (criteria) {
        case "coldest":
          value = node.metrics.h;
          if (value < bestValue) {
            bestValue = value;
            target = node;
          }
          break;
        case "hottest":
          value = node.metrics.h;
          if (value > bestValue) {
            bestValue = value;
            target = node;
          }
          break;
        case "stagnant":
          value = node.metrics.traversal ?? 0;
          if (value < bestValue) {
            bestValue = value;
            target = node;
          }
          break;
        case "avoided":
          // 忌避 = traversal 高 + heat 低
          // スコア = traversal / (heat + 0.01) → 高いほど避けられている
          const traversal = node.metrics.traversal ?? 0;
          const heat = node.metrics.h + 0.01; // ゼロ除算回避
          value = traversal / heat;
          if (value > bestValue) {
            bestValue = value;
            target = node;
          }
          break;
      }
    }

    if (target) {
      // ノードの位置をそのまま使用（ベクトル演算なし）
      return target.vector;
    }

    return this.pickRandomNode(projDB);
  }

  /**
   * ランダムにノードを選択
   */
  private pickRandomNode(projDB: Map<string, SphereNode>): number[] | null {
    const nodes = Array.from(projDB.values());
    if (nodes.length === 0) {
      return this.randomPosition(projDB);
    }

    const picked = nodes[Math.floor(Math.random() * nodes.length)];
    return picked.vector;
  }

  /**
   * ランダム位置（フォールバック：ノードが0の場合のみ）
   */
  private randomPosition(projDB: Map<string, SphereNode>): number[] {
    // 既存ノードから次元数を推定
    const firstNode = projDB.values().next().value;
    const dimension = firstNode?.vector?.length ?? 384;

    // 小さなランダムベクトル
    return Array.from({ length: dimension }, () => (Math.random() - 0.5) * 0.5);
  }

  /**
   * Environmental Node ID を生成
   */
  private generateEnvId(anomalyType: AnomalyType): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const combined = `env:${anomalyType}:${timestamp}:${random}`;

    return createHash("sha256").update(combined).digest("hex").slice(0, 16);
  }
}
