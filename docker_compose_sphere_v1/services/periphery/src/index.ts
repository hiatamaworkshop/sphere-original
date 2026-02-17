/**
 * Sphere Project - Periphery Main Entry Point
 *
 * [Architecture] Initialize all components and start services
 * [Integration] Connect Periphery → RenalCore
 * [Heartbeat] Start RenalCore metabolism tick
 */

import { RenalCore } from "@sphere/renal-core";
import { PeripheryServer } from "./server.js";
import { Gatekeeper } from "./gatekeeper/gatekeeper.js";
import { Tagger } from "./tagger/tagger.js";
import { Packer } from "./packer/packer.js";
import { Parser } from "./parser/parser.js";
import { EntryBuffer, IncarnationBuffer } from "./parser/buffer.js";
import { LocalEmbeddingProvider } from "./parser/embedding-provider.js";
import { Bookkeeper } from "./bookkeeper/bookkeeper.js";
import { NodeIngestBuffer } from "./incarnation/buffer.js";
import { IncarnationPipeline } from "./incarnation/pipeline.js";
import { IncarnationParser } from "./incarnation/incarnation-parser.js";
import { Arbiter } from "./arbiter/arbiter.js";
import {
  CleanerFishPool,
  DEFAULT_CLEANER_FISH_CONFIG,
  DEFAULT_TRANSITION_THRESHOLDS,
  type EnvironmentState,
} from "./cleaner-fish/cleaner-fish.js";
import { GlobalFieldLayer } from "./field/index.js";
import { PulseBroadcaster } from "./pulse/pulse-broadcaster.js";
import { ActiveBusLayer } from "./bus/index.js";
import { DEFAULT_PERIPHERY_CONFIG } from "./types/config.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { resolveDecayPreset } from "./config/decay-presets.js";
import { loadSchemas } from "./schema/index.js";
import { CAPSULE_SCHEMA_VERSION } from "./types/capsule.js";
import type { ExperienceCapsule, NodeSeed } from "./types/capsule.js";

// Repository Pattern - DB abstraction layer
import {
  MapReferenceRepository,
  MapProjectionRepository,
  MapSpatialFieldRepository,
} from "./repository/index.js";
import { SphereCoreAdapter } from "./gateway/sphere-core-adapter.js";

// ===== Configuration =====
const config = DEFAULT_PERIPHERY_CONFIG;

// Load sphere.config.json (ES Module compatible, path overridable via env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sphereConfigPath = process.env.SPHERE_CONFIG
  || join(__dirname, "../../../sphere.config.json");
const sphereConfig = JSON.parse(readFileSync(sphereConfigPath, "utf-8"));

// Environment variable overrides (ports)
if (process.env.PORT) {
  sphereConfig.periphery.server.port = parseInt(process.env.PORT, 10);
}
if (process.env.WS_PORT) {
  sphereConfig.periphery.server.wsPort = parseInt(process.env.WS_PORT, 10);
}
if (process.env.EPHEMERAL === "true") {
  sphereConfig.ephemeral = {
    ...sphereConfig.ephemeral,
    enabled: true,
  };
}

// Resolve decay preset (archive | balanced | flow | dev | custom)
const { resolved: decayValues, presetName } = resolveDecayPreset({
  ...sphereConfig.renal_core.decay,
  fertilityDecayRate: sphereConfig.renal_core.spatial.fertilityDecayRate,
});

// RenalCore configuration (decay values from preset, rest from sphere.config.json)
const renalConfig = {
  alpha: decayValues.alpha,
  heatDecayFactor: decayValues.heatDecayFactor,
  weightDecayFactor: decayValues.weightDecayFactor,
  amberHeatThreshold: sphereConfig.renal_core.thresholds.amberHeat,
  amberWeightThreshold: sphereConfig.renal_core.thresholds.amberWeight,
  fossilHeatThreshold: sphereConfig.renal_core.thresholds.fossilHeat,
  erosionHeatThreshold: sphereConfig.renal_core.thresholds.erosionHeat,
  ghostHeatThreshold: sphereConfig.renal_core.thresholds.ghostHeat,
  ghostTTLMultiplier: sphereConfig.renal_core.ghost.ttlMultiplier,
  planktonConversionRate: sphereConfig.renal_core.spatial.planktonConversionRate,
  fertilityDecayRate: decayValues.fertilityDecayRate,
  pauseIdleThreshold: sphereConfig.renal_core.pause.idleThreshold,
  pauseErosionBoost: sphereConfig.renal_core.pause.erosionBoost,
  // Dormancy settings (metabolism hibernation when no agents)
  dormancyThresholdMs: sphereConfig.renal_core.dormancy?.thresholdMs ?? 60000,
};

// Pulse configuration (now handled by PulseBroadcaster in Periphery)
const pulseConfig = sphereConfig.renal_core.pulse;

console.log(`[Config] Loaded: ${sphereConfigPath}`);
console.log(
  `[Config] Decay preset: "${presetName}" ` +
  `(alpha=${renalConfig.alpha} heatDecay=${renalConfig.heatDecayFactor} weightDecay=${renalConfig.weightDecayFactor} minLoadFactor=${decayValues.minLoadFactor})`
);

console.log("=".repeat(60));
console.log("🌐 Sphere Project - Phase 3: Periphery");
console.log("=".repeat(60));

// ===== Initialize Repositories (DB Abstraction Layer) =====
console.log("\n[Init] Creating repositories (Map implementation for dev)...");

// Repository instances (swap to Redis/PostgreSQL in production)
const referenceRepo = new MapReferenceRepository();
const projectionRepo = new MapProjectionRepository();
const spatialRepo = new MapSpatialFieldRepository();

// Get underlying Maps for RenalCore (backward compatibility)
// TODO: Refactor RenalCore to use repository interfaces
const projectionDB = projectionRepo.getInternalMap();
const referenceDB = referenceRepo.getInternalMap();
const spatialFields = spatialRepo.getInternalMap();

console.log("  ✅ MapReferenceRepository (RefDB)");
console.log("  ✅ MapProjectionRepository (ProjDB)");
console.log("  ✅ MapSpatialFieldRepository");

// ===== Initialize RenalCore =====
console.log("[Init] Initializing RenalCore metabolism engine...");
const renalCore = new RenalCore(
  projectionDB,
  referenceDB,
  spatialFields,
  renalConfig
);

// ===== Start RenalCore Heartbeat =====
console.log("[Init] Starting RenalCore heartbeat (1 tick/second)...");

// Arbiter - observes, judges, and queues state transitions
// [Design] RenalCore handles physics only, Arbiter queues transitions, Bookkeeper executes
const arbiterSettings = sphereConfig.periphery?.arbiter ?? {};
// [Config Priority] nodeFlags.dynamicThresholds > arbiter.dynamicFlags
const dynamicThresholds = config.nodeFlags?.dynamicThresholds;
const arbiterConfig = {
  erosionHeatThreshold: renalConfig.erosionHeatThreshold,
  pauseErosionBoost: renalConfig.pauseErosionBoost,
  // Dynamic Flags thresholds (from unified nodeFlags config)
  hotHeatThreshold: dynamicThresholds?.hotHeatThreshold
    ?? arbiterSettings.dynamicFlags?.hotHeatThreshold ?? 150,
  // Ascension cooldown settings (evaluation freeze + composite score)
  ascensionCooldownMs: arbiterSettings.ascension?.cooldownMs ?? 600000,
  ascensionScoreThreshold: arbiterSettings.ascension?.scoreThreshold ?? 500,
  lowerThresholdRatio: arbiterSettings.ascension?.lowerThresholdRatio ?? 0.9,
  // Dropout reset: metrics reset on cooldown failure (integer scale)
  dropoutResetH: arbiterSettings.ascension?.dropoutReset?.h ?? 0,
  dropoutResetW: arbiterSettings.ascension?.dropoutReset?.w ?? 500,
  dropoutResetD: arbiterSettings.ascension?.dropoutReset?.d ?? 1000,
  // Crystallization settings (absorption on successful ascension)
  absorptionEnabled: arbiterSettings.ascension?.absorption?.enabled ?? true,
  absorptionRadius: arbiterSettings.ascension?.absorption?.radius ?? 0.3,
  absorptionFactor: arbiterSettings.ascension?.absorption?.factor ?? 0.1,
  maxAbsorbedNodes: arbiterSettings.ascension?.absorption?.maxNodes ?? 5,
  // Revival settings (Fossil → Active)
  revivalThreshold: arbiterSettings.revival?.threshold ?? 2500,
  revivalDThreshold: arbiterSettings.revival?.dThreshold ?? 800,
  protectionThreshold: arbiterSettings.revival?.protectionThreshold ?? 100,
};
const arbiter = new Arbiter(arbiterConfig);

// CleanerFishPool - autonomous garbage collection with personality
const cleanerFishConfig = {
  ...DEFAULT_CLEANER_FISH_CONFIG,
  count: sphereConfig.cleanerFish?.count ?? 10,
  baseFossilTTL: sphereConfig.cleanerFish?.baseFossilTTL ?? 500,
  hungerCapacityMultiplier: sphereConfig.cleanerFish?.hungerCapacityMultiplier ?? 4,
};
const cleanerFishPool = new CleanerFishPool(cleanerFishConfig);

// Transition thresholds for CleanerFish (TTL-based state transitions)
// [2026-02-06] protectionThreshold re-enabled - weight decay now implemented
const transitionThresholds = {
  ...DEFAULT_TRANSITION_THRESHOLDS,
  protectionThreshold: arbiterConfig.protectionThreshold,  // h+w >= 100 で保護
};

// GlobalFieldLayer - ambient field calculation (climate of sphere)
const fieldConfig = sphereConfig.field ?? {};
const globalFieldLayer = new GlobalFieldLayer(
  sphereConfig.physical_constants?.dimension ?? 384,
  {
    updateIntervalTicks: fieldConfig.updateIntervalTicks ?? 10,
    targetSampleOps: fieldConfig.targetSampleOps ?? 50000,
    minSampleSize: fieldConfig.minSampleSize ?? 10,
    maxSampleSize: fieldConfig.maxSampleSize ?? 500,
    intensityDecay: fieldConfig.intensityDecay ?? 0.1,
    emptyIntensity: fieldConfig.emptyIntensity ?? 0,
  }
);

// ActiveBusLayer - AI-to-AI volatile broadcast communication
const activeBusConfig = sphereConfig.activeBus ?? {};
const activeBusLayer = new ActiveBusLayer({
  enabled: activeBusConfig.enabled ?? true,
  protocol: activeBusConfig.protocol ?? "AI_NATIVE",
  maxPayloadBytes: activeBusConfig.maxPayloadBytes ?? 64,
  bufferSize: activeBusConfig.bufferSize ?? 10,
  samplingRate: activeBusConfig.samplingRate ?? 0.7,
});

// PulseBroadcaster - UDP broadcast of environment signals
const pulseBroadcaster = new PulseBroadcaster({
  pulse: pulseConfig,
  amberHeatThreshold: renalConfig.amberHeatThreshold,
});

// Observation interval: Arbiter + CleanerFish cycle (10 ticks = 10 sec)
// [Design] Synced with Pulse for consistent observation timing
const observationInterval = 10;
let tickCounter = 0;
let patrolCounter = 0; // CleanerFish patrol frequency control

// === Dormancy State ===
// [Design] When no agents are connected for dormancyThresholdMs, metabolism hibernates.
let isDormant = false;
let lastAgentZeroTime: number | null = Date.now(); // Server starts with 0 agents

setInterval(async () => {
  tickCounter++;

  // === Dormancy Check ===
  if (lastAgentZeroTime !== null && !isDormant) {
    if (Date.now() - lastAgentZeroTime >= renalConfig.dormancyThresholdMs) {
      isDormant = true;
      console.log(`[Dormancy] Entering hibernation — no agents for ${renalConfig.dormancyThresholdMs / 1000}s`);
    }
  }
  if (isDormant) return;

  // loadFactor: 負荷係数（preset の minLoadFactor で下限を調整）
  const rawLoadFactor = projectionDB.size / 50000;
  const loadFactor = Math.max(
    decayValues.minLoadFactor,
    Math.min(2.0, rawLoadFactor * 100)
  );

  // Take snapshot before tick (at observation interval)
  const shouldObserve = tickCounter % observationInterval === 0;
  const snapshot = shouldObserve ? arbiter.snapshot(projectionDB) : null;

  // Execute physics (Decay only - RenalCore is pure physics engine)
  renalCore.tick(loadFactor);

  // Update Global Ambient Field (climate of sphere)
  globalFieldLayer.tick(projectionRepo);

  // Pulse broadcast (now handled by Periphery)
  pulseBroadcaster.broadcast(tickCounter, projectionDB, spatialFields);

  // Observe and process state changes (at observation interval, same as Pulse)
  // [Design] Batch processing to reduce RefDB access frequency
  if (shouldObserve && snapshot) {
    // Arbiter judges and queues state transitions
    const isPaused = renalCore.idleTickCount > renalConfig.pauseIdleThreshold;
    const queue = arbiter.observe(projectionDB, { isPaused });

    // Execute queued transitions (Bookkeeper applies changes to ProjDB/RefDB)
    await bookkeeper.applyTransitions(queue);

    // Detect changes for logging and CleanerFish
    const changes = arbiter.diff(snapshot, projectionDB);
    arbiter.logChanges(changes);

    // === Cleaner Fish Processing ===
    // [Design] Two-tier processing:
    //   1. Autonomous (毎 observation): 自律型、fieldIntensity で活性化
    //   2. Patrol (30 observations ごと): バックアップ、全スイープ

    // Helper to get cellId from nodeId (for fertility distribution)
    const getCellId = (nodeId: string): string => {
      let hash = 0;
      for (let i = 0; i < nodeId.length; i++) {
        hash += nodeId.charCodeAt(i);
      }
      return `${hash % 10}:${Math.floor(hash / 10) % 10}:${Math.floor(hash / 100) % 10}`;
    };

    // === Environment State for CleanerFish ===
    // [Design] DB容量と磁場 intensity から環境状態を算出
    const estimatedMaxNodes = 50000;  // 仮の最大ノード数
    const currentField = globalFieldLayer.getGlobalField();
    const env: EnvironmentState = {
      dbCapacityRatio: Math.min(1.0, projectionDB.size / estimatedMaxNodes),
      fieldIntensity: currentField.intensity,  // 磁場接続完了
    };

    // === Autonomous CleanerFish (Main): Every Observation ===
    // [Design] fieldIntensity 高 → 「夏」 → 活発化、intensity 低 → 「冬」 → 休眠
    const allNodes = Array.from(projectionDB.values());

    // 環境駆動で全ノードを処理（内部で候補抽出）
    const { ghostified, fossilized, decomposed } = cleanerFishPool.process(
      allNodes,
      getCellId,
      env,
      transitionThresholds
    );

    // Apply transitions via Bookkeeper
    if (ghostified.length > 0) {
      const ghostNodes = ghostified.map((r) => r.ghostNode);
      await bookkeeper.applyGhostification(ghostNodes);
    }

    if (fossilized.length > 0) {
      const fossilNodes = fossilized.map((r) => r.fossilNode);
      await bookkeeper.applyFossilization(fossilNodes);
    }

    if (decomposed.length > 0) {
      await bookkeeper.applyDecomposition(decomposed);
    }

    // Log summary if any transitions occurred
    const totalTransitions = ghostified.length + fossilized.length + decomposed.length;
    if (totalTransitions > 0) {
      console.log(
        `[CleanerFish] Cycle: ghostified=${ghostified.length} ` +
        `fossilized=${fossilized.length} decomposed=${decomposed.length}`
      );
    }

    // === Patrol CleanerFish (Backup): Every 180 Observations (30 min) ===
    // [Design] Failsafe sweep for any nodes that escaped TTL management
    // [Note] Debug-oriented, runs infrequently. Autonomous CleanerFish handles most cases.
    const PATROL_INTERVAL = 180;
    patrolCounter++;
    if (patrolCounter % PATROL_INTERVAL === 0) {
      // Re-fetch nodes to avoid processing already-transitioned nodes
      const patrolNodes = Array.from(projectionDB.values());
      // Patrol uses more aggressive thresholds (full sweep)
      const patrolResult = cleanerFishPool.process(
        patrolNodes,
        getCellId,
        { ...env, dbCapacityRatio: Math.max(0.5, env.dbCapacityRatio) }, // Force higher hunger
        transitionThresholds
      );

      // Log patrol activity if any nodes processed
      const patrolTotal = patrolResult.ghostified.length +
        patrolResult.fossilized.length +
        patrolResult.decomposed.length;
      if (patrolTotal > 0) {
        console.log(
          `[CleanerFish] Patrol sweep: ghostified=${patrolResult.ghostified.length} ` +
          `fossilized=${patrolResult.fossilized.length} decomposed=${patrolResult.decomposed.length}`
        );
      }

      // Apply patrol transitions (may catch nodes missed by autonomous)
      if (patrolResult.ghostified.length > 0) {
        const ghostNodes = patrolResult.ghostified.map((r) => r.ghostNode);
        await bookkeeper.applyGhostification(ghostNodes);
      }
      if (patrolResult.fossilized.length > 0) {
        const fossilNodes = patrolResult.fossilized.map((r) => r.fossilNode);
        await bookkeeper.applyFossilization(fossilNodes);
      }
      if (patrolResult.decomposed.length > 0) {
        await bookkeeper.applyDecomposition(patrolResult.decomposed);
      }
    }
  }
}, 1000); // 1 tick per second

// ===== Initialize Periphery Components =====
console.log("\n[Init] Initializing Periphery components...");

// Load schema registry (single source of truth for capsule validation)
console.log("[Init] Loading schema definitions...");
const schemaRegistry = loadSchemas();

// Parser system
const embeddingProvider = new LocalEmbeddingProvider();
const parser = new Parser(embeddingProvider, config);
// EntryBuffer: Agent entry vectorization (responsiveness priority)
// [Design] entryIdleTimeoutMs=200ms for quick response, entryMaxWaitTimeMs=2000ms as upper bound
const entryBuffer = new EntryBuffer(parser, {
  maxTextsPerBatch: config.parser.batchSize,
  entryIdleTimeoutMs: 200,       // Quick flush when idle (agent is waiting)
  entryMaxWaitTimeMs: 2000,      // Upper bound for batch accumulation
});

// Periphery components
// [Note] Membrane removed from pipeline - it validates AgentMessage at Gateway layer
const gatekeeper = new Gatekeeper(schemaRegistry);  // Schema-driven validation
const incarnationVectorBuffer = new IncarnationBuffer(parser);  // summary vectorization buffer (batch)
const incarnationParser = new IncarnationParser(incarnationVectorBuffer);  // summary → vector (spatial coordinates)
const tagger = new Tagger();  // tags → 16bit flags (semantic classification)
const packer = new Packer(config);

// Bookkeeper with Repository injection (loose coupling)
const bookkeeper = new Bookkeeper(projectionRepo, referenceRepo, spatialRepo);

// IncarnationPipeline - unified capsule processing for both internal and external agents
// [Flow] Capsule → Gatekeeper → Parser → Tagger → Packer → Bookkeeper
// [Important] "Direct" means skipping HTTP, NOT skipping the pipeline!
const incarnationPipeline = new IncarnationPipeline(
  gatekeeper,
  incarnationParser,
  tagger,
  packer,
  bookkeeper
);

const nodeIngestBuffer = new NodeIngestBuffer(
  bookkeeper,
  config.incarnationBuffer.batchSize,
  config.incarnationBuffer.flushIntervalMs
);

// SphereCoreAdapter - Bridge between Gateway and Sphere Core (for real node access)
const coreAdapter = new SphereCoreAdapter(projectionRepo, referenceRepo, parser, {
  basePerceptionRadius: sphereConfig.perception?.basePerceptionRadius ?? config.perception?.basePerceptionRadius ?? 0.5,
  maxSenseResults: sphereConfig.perception?.maxSenseResults ?? config.perception?.maxSenseResults ?? 15,
});
coreAdapter.setSpatialRepo(spatialRepo);

console.log("  ✅ Gatekeeper (schema-driven)");
console.log("  ✅ Parser + Buffer (Agent entry)");
console.log("  ✅ IncarnationBuffer (summary vectorization batch)");
console.log("  ✅ IncarnationParser (summary → vector)");
console.log("  ✅ Tagger (tags → 16bit flags)");
console.log("  ✅ Packer");
console.log("  ✅ Bookkeeper");
console.log("  ✅ IncarnationPipeline (direct injection path)");
console.log("  ✅ IncarnationBuffer");
console.log("  ✅ SphereCoreAdapter (real node access)");

// ===== Start API Server =====
console.log("\n[Init] Starting Periphery API server...");
const server = new PeripheryServer(
  incarnationPipeline,  // Unified pipeline for both HTTP API and internal agents
  config,
  entryBuffer,          // For GatewayServer (EntryRequest vectorization via buffer)
  projectionDB,
  bookkeeper,           // For NodeForge integration
  coreAdapter,          // For real node access in SphereContext
  globalFieldLayer,     // For magnetic field influence on agent movement
  activeBusLayer,       // For AI-to-AI volatile broadcast communication
  spatialFields         // For /sphere/snapshot fertility data
);

server.start();

// Connect agent count changes to RenalCore Dormancy and SphereCoreAdapter dynamic sampling
server.setOnAgentCountChange((count: number) => {
  renalCore.updateAgentCount(count);
  coreAdapter.setAgentCount(count);

  if (count === 0) {
    lastAgentZeroTime = Date.now();
  } else {
    if (isDormant) {
      console.log(`[Dormancy] Waking up — agent connected`);
    }
    isDormant = false;
    lastAgentZeroTime = null;
  }
});

// ===== Seed Data (startup data injection) =====
interface RawSeedItem {
  summary: string;
  content?: string;
  tags: string[];
  importance: number;
  flags?: number;
}

async function seedSphere(): Promise<void> {
  const seedPath = process.env.SEED_DATA_PATH
    || join(__dirname, "mock/mock_data.json");
  if (!existsSync(seedPath)) {
    console.log("[Seed] No seed data found, starting empty");
    return;
  }

  const rawData: RawSeedItem[] = JSON.parse(readFileSync(seedPath, "utf-8"));
  console.log(`[Seed] Loading ${rawData.length} items from ${seedPath}`);

  // Build capsules (same logic as contribution.ts, 10 items per capsule)
  const chunkSize = 10;
  let totalNodes = 0;

  for (let i = 0; i < rawData.length; i += chunkSize) {
    const chunk = rawData.slice(i, i + chunkSize);
    const topTier: NodeSeed[] = [];
    const normalNodes: NodeSeed[] = [];
    const ghostNodes: NodeSeed[] = [];

    for (const item of chunk) {
      const seed: NodeSeed = {
        tags: item.tags,
        summary: item.summary,
        content: item.content,
        flags: item.flags ?? 0,
      };
      if (item.importance >= 0.85) topTier.push(seed);
      else if (item.importance >= 0.5) normalNodes.push(seed);
      else ghostNodes.push(seed);
    }

    const capsule: ExperienceCapsule = {
      schemaVersion: CAPSULE_SCHEMA_VERSION,
      topTier: topTier.slice(0, 3),
      normalNodes: normalNodes.slice(0, 5),
      ghostNodes: ghostNodes.slice(0, 3),
      evaluations: [],
      timestamp: Date.now(),
    };

    const result = await incarnationPipeline.ingest(capsule);
    if (result.success) {
      totalNodes += result.nodeCount;
    }
  }

  console.log(`[Seed] Seeded ${totalNodes} nodes`);
}

// Run seed (async, non-blocking — health check available immediately)
seedSphere().catch((err) => {
  console.error("[Seed] Failed:", err);
});

// ===== Ephemeral Mode (periodic reset for public demo) =====
const ephemeralConfig = sphereConfig.ephemeral;
if (ephemeralConfig?.enabled && ephemeralConfig.resetIntervalMs > 0) {
  const intervalSec = ephemeralConfig.resetIntervalMs / 1000;
  console.log(`[Ephemeral] Enabled — reset every ${intervalSec}s`);
  setInterval(async () => {
    console.log("[Ephemeral] Resetting sphere state...");
    server.expelAll("Ephemeral reset: sphere is restarting");
    projectionDB.clear();
    referenceDB.clear();
    spatialFields.clear();
    tickCounter = 0;
    isDormant = false;
    lastAgentZeroTime = Date.now();
    await seedSphere();
    console.log("[Ephemeral] Reset complete");
  }, ephemeralConfig.resetIntervalMs);
}

console.log("\n" + "=".repeat(60));
console.log("Sphere Phase 3: Periphery initialized successfully");
console.log("=".repeat(60));
console.log("\n RenalCore heartbeat: ACTIVE");
console.log(`Global Field: UPDATE every ${fieldConfig.updateIntervalTicks ?? 10} ticks`);
if (pulseConfig?.enabled) {
  console.log(`Pulse broadcast: UDP ${pulseConfig.broadcastAddress}:${pulseConfig.port} (every ${pulseConfig.intervalTicks} ticks)`);
}
console.log("Periphery server: LISTENING");
console.log(`Submit capsules to: POST http://localhost:${config.server.port}/sphere/submit`);
console.log("Start Mock Bot: npm run mock-bot");
console.log("Start Observatory: cd ../observatory && npm run dev\n");

// ===== Export IncarnationPipeline for AgentManager injection =====
// Usage: AgentManager.setIncarnationPipeline(getIncarnationPipeline())
export function getIncarnationPipeline() {
  return incarnationPipeline;
}

// Also export type for TypeScript consumers
export type { IIncarnationPipeline, IncarnationResult } from "./incarnation/pipeline.js";

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n\n[Shutdown] ${signal} received, shutting down...`);

  // Stop server (WebSocket + HTTP)
  server.stop();
  console.log("[Shutdown] ✅ Server stopped");

  // Close pulse socket
  pulseBroadcaster.close();
  console.log("[Shutdown] ✅ Pulse socket closed");

  // Flush buffers
  await entryBuffer.forceFlush();
  await incarnationVectorBuffer.forceFlush();
  await nodeIngestBuffer.forceFlush();
  console.log("[Shutdown] ✅ Buffers flushed");

  console.log("[Shutdown] 👋 Goodbye");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
