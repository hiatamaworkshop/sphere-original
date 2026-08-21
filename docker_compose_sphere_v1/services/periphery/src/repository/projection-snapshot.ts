/**
 * Sphere Project - Projection Snapshot (ProjDB → Turso)
 *
 * [Pattern] Periodic Snapshot: インメモリ Map を定期的に Turso へ batch 保存
 *
 * Design:
 *   - ProjDB はインメモリ Map のまま (RenalCore 互換)
 *   - Patrol 間隔 (30分) に合わせて全ノードのメトリクスを Turso に保存
 *   - 起動時: RefDB (ノード本体) + snapshot (進化メトリクス) から ProjDB を再構築
 *   - シャットダウン時: 最終スナップショットを保存
 *
 * [Efficiency] vector/payload は保存しない (RefDB に存在)。
 *   メトリクスのみ: kind, h, w, d, ttl, flg, stay_time, immune_mod
 *   → 1ノード ~100 bytes (vs ~2KB for full SphereNode)
 *
 * [Fork] REFDB_BACKEND=turso の時のみ有効。map モードでは ProjDB も ephemeral。
 */

import { createClient, type Client, type InValue } from "@libsql/client";
import type { SphereNode, ReferenceRecord, NodeKind } from "@sphere/renal-core";

const BATCH_SIZE = 500;

export class ProjectionSnapshot {
  private db: Client;

  constructor(url: string, authToken?: string) {
    this.db = createClient({
      url,
      ...(authToken && { authToken }),
    });
  }

  /** Create projection_state table if not exists */
  async init(): Promise<void> {
    await this.db.executeMultiple(`
      CREATE TABLE IF NOT EXISTS projection_state (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        h REAL NOT NULL,
        w REAL NOT NULL,
        d REAL NOT NULL,
        ttl REAL NOT NULL,
        flg INTEGER NOT NULL,
        stay_time REAL,
        immune_mod REAL,
        updated_at INTEGER NOT NULL
      );
    `);
    console.log("[projdb:snapshot] Schema ready");
  }

  /**
   * Save all current ProjDB metrics to Turso (batch write).
   * Strategy: DELETE all → batch INSERT (clean slate each snapshot).
   */
  async snapshot(projectionMap: Map<string, SphereNode>): Promise<void> {
    const nodes = Array.from(projectionMap.values());
    if (nodes.length === 0) {
      await this.db.execute("DELETE FROM projection_state");
      return;
    }

    const now = Date.now();

    // Clear existing snapshot
    await this.db.execute("DELETE FROM projection_state");

    // Batch insert
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      await this.db.batch(
        batch.map((node) => ({
          sql: `INSERT INTO projection_state (id, kind, h, w, d, ttl, flg, stay_time, immune_mod, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            node.id,
            node.kind,
            node.metrics.h,
            node.metrics.w,
            node.metrics.d,
            node.metrics.ttl,
            node.metrics.flg,
            node.metrics.stayTime ?? null,
            node.metrics.immuneMod ?? null,
            now,
          ] as InValue[],
        })),
        "write",
      );
    }
  }

  /**
   * Restore ProjDB from RefDB + snapshot metrics.
   *
   * For each RefDB record:
   *   - If snapshot has evolved metrics → use them (preserves runtime state)
   *   - If not → use RefDB's initial snapshot (node appears in birth state)
   *
   * RefDB records not in snapshot = newly created since last snapshot → initial state.
   * Snapshot records not in RefDB = deleted since last snapshot → ignored.
   *
   * @returns Number of nodes restored
   */
  async restore(
    projectionMap: Map<string, SphereNode>,
    referenceMap: Map<string, ReferenceRecord>,
  ): Promise<number> {
    // Load snapshot metrics
    const result = await this.db.execute("SELECT * FROM projection_state");
    const snapshotMetrics = new Map<string, {
      kind: string;
      h: number;
      w: number;
      d: number;
      ttl: number;
      flg: number;
      stayTime: number | null;
      immuneMod: number | null;
    }>();

    for (const row of result.rows) {
      snapshotMetrics.set(row.id as string, {
        kind: row.kind as string,
        h: row.h as number,
        w: row.w as number,
        d: row.d as number,
        ttl: row.ttl as number,
        flg: row.flg as number,
        stayTime: row.stay_time as number | null,
        immuneMod: row.immune_mod as number | null,
      });
    }

    console.log(`[projdb:snapshot] Loaded ${snapshotMetrics.size} snapshot records`);

    let restored = 0;
    let fromSnapshot = 0;
    let fromRefDb = 0;

    for (const ref of referenceMap.values()) {
      const metrics = snapshotMetrics.get(ref.id);

      const node: SphereNode = {
        id: ref.id,
        kind: (metrics?.kind ?? ref.kind) as NodeKind,
        vector: ref.snapshot.vector,
        payload: {
          tags: ref.payload.tags,
          summary: ref.payload.summary,
        },
        metrics: metrics
          ? {
              h: metrics.h,
              w: metrics.w,
              d: metrics.d,
              ttl: metrics.ttl,
              flg: metrics.flg,
              ...(metrics.stayTime != null && { stayTime: metrics.stayTime }),
              ...(metrics.immuneMod != null && { immuneMod: metrics.immuneMod }),
            }
          : {
              // Fallback: initial state from RefDB snapshot
              h: ref.snapshot.heat,
              w: ref.snapshot.weight,
              d: ref.snapshot.decay,
              ttl: 1000, // default TTL
              flg: ref.snapshot.flags,
            },
        timestamp: ref.timestamp,
      };

      projectionMap.set(ref.id, node);
      restored++;
      if (metrics) fromSnapshot++;
      else fromRefDb++;
    }

    console.log(
      `[projdb:snapshot] Restored ${restored} nodes ` +
      `(${fromSnapshot} from snapshot, ${fromRefDb} from RefDB initial state)`,
    );
    return restored;
  }

  /** Close Turso connection */
  close(): void {
    this.db.close();
  }
}
