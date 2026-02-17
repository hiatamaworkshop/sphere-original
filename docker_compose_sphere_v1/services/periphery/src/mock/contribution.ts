/**
 * Sphere Project - External Contribution Mock
 *
 * [Role] Test script for /sphere/contribute endpoint
 * [Usage]
 *   npx tsx src/mock/contribution.ts           # Default: 10 items
 *   npx tsx src/mock/contribution.ts 1         # 1 item
 *   npx tsx src/mock/contribution.ts 50        # 50 items
 *   npx tsx src/mock/contribution.ts batch     # All items (legacy mode)
 *
 * [Flow]
 *   External Data (mock_data.json) → ExperienceCapsule → POST /sphere/contribute → Incarnation Pipeline
 *
 * [Note] This is for external data contribution (not agent return)
 *   - Agent return uses WebSocket context.return()
 *   - External contribution uses REST POST with 'source' identifier
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ExperienceCapsule, NodeSeed } from "../types/capsule.js";
import { CAPSULE_SCHEMA_VERSION } from "../types/capsule.js";

// ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// Source Data Definition
// ============================================================

interface RawData {
  summary: string;
  tags: string[];
  content?: string;
  flags?: number;
  importance: number; // 0.0 ~ 1.0
}

// ============================================================
// HTTP Helper
// ============================================================

interface ApiResponse {
  success: boolean;
  nodeCount?: number;
  processed?: number;
  warnings?: string[];
  error?: string;
}

async function postJson(url: string, body: unknown): Promise<ApiResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return response.json() as Promise<ApiResponse>;
}

// ============================================================
// Contribution Logic
// ============================================================

async function contribute(count: number = 10) {
  const SERVER_URL = process.env.SPHERE_URL || "http://localhost:3001";
  const SOURCE_ID = "external_data_shuffler";

  // 1. 外部ファイルからデータを読み込み
  const filePath = path.join(__dirname, "mock_data.json");

  if (!fs.existsSync(filePath)) {
    console.error(`[Contributor] File not found: ${filePath}`);
    console.log(`[Contributor] Create mock_data.json with sample data first.`);
    process.exit(1);
  }

  const rawJson = fs.readFileSync(filePath, "utf-8");
  let sourceData: RawData[] = JSON.parse(rawJson);

  console.log(`[Contributor] Loaded ${sourceData.length} items from mock_data.json`);

  // ランダム性を出すためにシャッフル
  sourceData = sourceData.sort(() => Math.random() - 0.5);

  // 指定された個数を選択（データ数上限を考慮）
  const actualCount = Math.min(count, sourceData.length);
  const selectedData = sourceData.slice(0, actualCount);
  console.log(`[Contributor] Selected ${actualCount} items (requested: ${count})`);

  const topTier: NodeSeed[] = [];
  const normalNodes: NodeSeed[] = [];
  const ghostNodes: NodeSeed[] = [];

  for (const data of selectedData) {
    // [Design] New nodes start with default metrics (h=0)
    // importance is only used for tier classification, NOT as initial heat
    // Heat grows from agent evaluations in subsequent sessions
    const seed: NodeSeed = {
      tags: data.tags,
      summary: data.summary,
      content: data.content,
      // [REMOVED] initialHeat - determined by config.baseHeat, not agent
      flags: data.flags ?? 0,
    };

    // 振り分けロジック (importance → tier classification only)
    if (data.importance >= 0.85) {
      topTier.push(seed);
    } else if (data.importance >= 0.5) {
      normalNodes.push(seed);
    } else {
      ghostNodes.push(seed);
    }
  }

  const capsule: ExperienceCapsule = {
    schemaVersion: CAPSULE_SCHEMA_VERSION,
    topTier: topTier.slice(0, 2),      // Max 2
    normalNodes: normalNodes.slice(0, 5), // Max 5
    ghostNodes: ghostNodes.slice(0, 3),   // Max 3
    evaluations: [],
    timestamp: Date.now(),
  };

  console.log(`[Contributor] Prepared capsule from ${selectedData.length} selected items:`);
  console.log(`  - topTier: ${capsule.topTier.length} nodes`);
  console.log(`  - normalNodes: ${capsule.normalNodes.length} nodes`);
  console.log(`  - ghostNodes: ${capsule.ghostNodes.length} nodes`);

  // 2. Submit to Sphere
  try {
    const result = await postJson(`${SERVER_URL}/sphere/contribute`, {
      source: SOURCE_ID,
      capsule,
    });

    if (result.success) {
      console.log(`[Contributor] ✅ Success: ${result.nodeCount} nodes ingested.`);
      if (result.warnings && result.warnings.length > 0) {
        console.log(`[Contributor] ⚠️ Warnings:`, result.warnings);
      }
    } else {
      console.log(`[Contributor] ❌ Failed:`, result);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Contributor] ❌ Request failed:`, message);
  }
}

// ============================================================
// Batch Contribution (from file)
// ============================================================

async function contributeBatch() {
  const SERVER_URL = process.env.SPHERE_URL || "http://localhost:3001";
  const SOURCE_ID = "external_batch_shuffler";

  // 外部ファイルからデータを読み込み
  const filePath = path.join(__dirname, "mock_data.json");

  if (!fs.existsSync(filePath)) {
    console.error(`[Contributor] ❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const rawJson = fs.readFileSync(filePath, "utf-8");
  let sourceData: RawData[] = JSON.parse(rawJson);

  // シャッフル
  sourceData = sourceData.sort(() => Math.random() - 0.5);

  // 複数のカプセルに分割（10個ずつ = 現実的なエージェント提出量）
  const capsules: ExperienceCapsule[] = [];
  const chunkSize = 10;

  for (let i = 0; i < sourceData.length; i += chunkSize) {
    const chunk = sourceData.slice(i, i + chunkSize);

    const topTier: NodeSeed[] = [];
    const normalNodes: NodeSeed[] = [];
    const ghostNodes: NodeSeed[] = [];

    for (const data of chunk) {
      // [Design] New nodes start with default metrics from config.baseHeat
      const seed: NodeSeed = {
        tags: data.tags,
        summary: data.summary,
        content: data.content,
        // [REMOVED] initialHeat - determined by config.baseHeat, not agent
        flags: data.flags ?? 0,
      };

      if (data.importance >= 0.85) {
        topTier.push(seed);
      } else if (data.importance >= 0.5) {
        normalNodes.push(seed);
      } else {
        ghostNodes.push(seed);
      }
    }

    capsules.push({
      schemaVersion: CAPSULE_SCHEMA_VERSION,
      topTier: topTier.slice(0, 2),
      normalNodes: normalNodes.slice(0, 5),
      ghostNodes: ghostNodes.slice(0, 3),
      evaluations: [],
      timestamp: Date.now(),
    });
  }

  console.log(`[Contributor] Batch mode: ${capsules.length} capsules from ${sourceData.length} items`);

  try {
    const result = await postJson(`${SERVER_URL}/sphere/contribute`, {
      source: SOURCE_ID,
      batch: true,
      capsules,
    });

    if (result.success) {
      console.log(`[Contributor] ✅ Batch success: ${result.nodeCount} nodes, ${result.processed} capsules processed.`);
    } else {
      console.log(`[Contributor] ❌ Batch failed:`, result);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Contributor] ❌ Batch request failed:`, message);
  }
}

// ============================================================
// Wave Contribution (staggered capsules with delay)
// ============================================================

async function contributeWave(totalCount: number = 50, delayMs: number = 3000) {
  const SERVER_URL = process.env.SPHERE_URL || "http://localhost:3001";
  const SOURCE_ID = "external_data_shuffler";

  const filePath = path.join(__dirname, "mock_data.json");
  if (!fs.existsSync(filePath)) {
    console.error(`[Wave] File not found: ${filePath}`);
    process.exit(1);
  }

  const rawJson = fs.readFileSync(filePath, "utf-8");
  let sourceData: RawData[] = JSON.parse(rawJson);
  sourceData = sourceData.sort(() => Math.random() - 0.5);

  const actualCount = Math.min(totalCount, sourceData.length);
  const chunkSize = 10; // 1カプセル分のソースデータ
  const waves = Math.ceil(actualCount / chunkSize);

  console.log(`[Wave] ${actualCount} items → ${waves} waves (delay=${delayMs}ms)`);

  let totalIncarnated = 0;

  for (let w = 0; w < waves; w++) {
    const chunk = sourceData.slice(w * chunkSize, (w + 1) * chunkSize);

    const topTier: NodeSeed[] = [];
    const normalNodes: NodeSeed[] = [];
    const ghostNodes: NodeSeed[] = [];

    for (const data of chunk) {
      const seed: NodeSeed = {
        tags: data.tags,
        summary: data.summary,
        content: data.content,
        flags: data.flags ?? 0,
      };

      if (data.importance >= 0.85) {
        topTier.push(seed);
      } else if (data.importance >= 0.5) {
        normalNodes.push(seed);
      } else {
        ghostNodes.push(seed);
      }
    }

    const capsule: ExperienceCapsule = {
      schemaVersion: CAPSULE_SCHEMA_VERSION,
      topTier: topTier.slice(0, 2),
      normalNodes: normalNodes.slice(0, 5),
      ghostNodes: ghostNodes.slice(0, 3),
      evaluations: [],
      timestamp: Date.now(),
    };

    const nodeCount = capsule.topTier.length + capsule.normalNodes.length + capsule.ghostNodes.length;

    try {
      const result = await postJson(`${SERVER_URL}/sphere/contribute`, {
        source: SOURCE_ID,
        capsule,
      });

      if (result.success) {
        totalIncarnated += result.nodeCount ?? 0;
        console.log(`[Wave ${w + 1}/${waves}] ✅ ${result.nodeCount} nodes (total: ${totalIncarnated})`);
      } else {
        console.log(`[Wave ${w + 1}/${waves}] ❌ Failed:`, result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Wave ${w + 1}/${waves}] ❌ Error:`, message);
    }

    // 最後の wave 以外は待機
    if (w < waves - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log(`[Wave] Done: ${totalIncarnated} nodes incarnated from ${waves} waves`);
}

// ============================================================
// Run
// ============================================================

const arg = process.argv[2];
const arg2 = process.argv[3];

if (arg === "batch") {
  // Legacy batch mode: all items at once
  contributeBatch();
} else if (arg === "wave") {
  // Wave mode: staggered capsules with delay
  // Usage: npx tsx src/mock/contribution.ts wave [count] [delayMs]
  const count = arg2 && !isNaN(parseInt(arg2)) ? parseInt(arg2) : 50;
  const delay = process.argv[4] && !isNaN(parseInt(process.argv[4])) ? parseInt(process.argv[4]) : 3000;
  contributeWave(count, delay);
} else if (arg && !isNaN(parseInt(arg))) {
  // Number argument: contribute N items (single capsule)
  const count = parseInt(arg);
  contribute(count);
} else {
  // Default: 10 items
  contribute(10);
}
