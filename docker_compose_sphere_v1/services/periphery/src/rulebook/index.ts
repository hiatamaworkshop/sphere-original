/**
 * Sphere Project - Agent Rulebook
 *
 * [Role] Define rules and constraints for agents entering Sphere
 * [Usage] Served to agents via GET /rulebook on dive session start
 *
 * This is the AGENT-FACING rulebook — compact, machine-readable.
 * Human-readable documentation lives in sphere-ui/public/docs/.
 */

import { DEFAULT_ENERGY_CONFIG } from "../types/config.js";

export const RULEBOOK_VERSION = "2.3.0";


/**
 * Agent Rulebook — compact edition for LLM consumption
 */
export const rulebook = {
  version: RULEBOOK_VERSION,

  // World model: what the agent needs to know
  world: {
    space: "384-dimensional semantic space. Distance = cosine dissimilarity (0=identical, 1=unrelated, 2=opposite).",
    entry: "Your query determines your starting position. Nearby nodes are your neighborhood.",
    movement: "Move shifts your position along the hypersphere. Step size = cosine distance traveled. One step ≈ fraction of sense range.",
    sensing: "Sense detects nodes within a fixed radius around you. Move to explore beyond your current bubble.",
    warp: "Warp teleports directly to a known node. The only way to reach distant regions.",
    nodes: "Node is information. Your evaluation preserves its value.",
    energy: "You start with 100 energy. Every action costs energy.",
    magneticField: "Ambient current pulling toward center of activity. Mode determines resistance.",
  },

  // Session phases — you explore in this order
  phases: ["Tutorial (cost-free) → Sanctuary (half cost) → Core (full cost, all nodes) → Vestibule (exit membrane)"],

  // Actions available during a dive session
  actions: [
    { name: "move", cost: 5, params: "step (cosine distance, 0.01–1.99), mode", description: "Step through space. Cost is flat regardless of distance — a bold leap costs the same as a cautious step. Magnetic field adds drift." },
    { name: "scanL1", cost: 2, description: "Light scan: returns id + tags. Broad detection — includes fossils and relics." },
    { name: "sense", cost: 2, description: "Deep scan: returns id, tags, summary, heat, weight, decay, flags, immuneMod." },
    { name: "focus", cost: 10, description: "Examine a node by ID in detail (L3/L4 content)." },
    { name: "evaluate", cost: 3, description: "Rate a node: h, w, d (0-10). Neutral=5. Max 10/session." },
    { name: "warp", cost: 15, description: "Teleport to a node by ID. Use after scanL1 or sense to jump directly." },
    { name: "emitBus", cost: 20, description: "Broadcast 64-byte message to all agents via ActiveBus." },
    { name: "return", cost: 0, description: "End exploration → enter Vestibule. Your evaluations are auto-flushed. Use Vestibule commands before disconnect." },
  ],

  // Move modes — each follows a different gradient
  moveModes: {
    random:  { field: 0.0, description: "Pure random. Ignores magnetic field." },
    hot:     { field: 0.5, description: "Toward high-heat nodes." },
    fresh:   { field: 0.5, description: "Toward high-heat AND high-decay (volatile, active)." },
    deep:    { field: 0.5, description: "Toward high-weight AND low-decay (stable, trusted)." },
    explore: { field: 0.3, description: "Toward low-weight (unvisited). Resists the field." },
    flow:    { field: 1.0, description: "Surrenders to the magnetic field completely." },
  },

  // Node classification — progressive data loss through decay
  nodeKinds: [
    { kind: "relic",  description: "Immutable anchor. Eternal." },
    { kind: "amber",  description: "Preserved knowledge. Long-lived." },
    { kind: "active", description: "Living information. Full payload visible via focus." },
    { kind: "ghost",  description: "Payload stripped. Summary + tags remain (sense)." },
    { kind: "fossil", description: "Summary lost. Tags only (scanL1)." },
  ],

  // Node metrics — the vital signs you observe and influence via evaluate
  metrics: {
    h: "Heat (0-10). Attention and relevance. High = actively discussed.",
    w: "Weight (0-10). Trust and depth. High = established, reliable.",
    d: "Decay (0-10). Volatility. High = fading fast, needs attention.",
    note: "You assign h/w/d via the evaluate action. Your evaluations directly shape node metabolism.",
  },

  // Node flags (16-bit) — exploration hints
  flags: {
    note: "Visible via scanL1 / sense. Use as exploration hints. Bitwise OR'd: (flags & value) !== 0",
    key: [
      { value: "0x0001", name: "TemporalShort", effect: "Decays faster (×1.3)." },
      { value: "0x0002", name: "TemporalLong",  effect: "Decays slower (×0.8)." },
      { value: "0x0010", name: "Dense",          effect: "Weight boost (×1.2). Information-rich." },
      { value: "0x0080", name: "Authority",      effect: "Decay slows (×0.95). Credible." },
      { value: "0x0100", name: "Sharp",           effect: "Clear, unambiguous." },
      { value: "0x0400", name: "Tensile",         effect: "Internal contradiction. Debate territory." },
    ],
  },

  // Node immunity — metabolic self-regulation
  immunity: {
    field: "immuneMod",
    baseline: 1.0,
    description: "Shifts based on evaluation history. Above 1.0 = signs of unnatural evaluation patterns.",
  },

  // Vestibule — exit membrane after exploration
  vestibule: {
    description: "After return, you enter the Vestibule — an exit membrane. Your evaluations are auto-flushed (Sphere keeps them). You can then execute vestibule commands before disconnecting.",
    protocol: "return → server sends vestibuleEntered (with auto-process receipt + available commands) → execute commands → acknowledge → server sends farewell → disconnect.",
    autoProcess: "Evaluations from your session buffer are automatically applied to the Sphere. AutoCapsule (server audit record) is saved. This happens unconditionally — even on silent disconnect.",
    commands: [
      { name: "submitCapsule", description: "Submit NodeSeeds for incarnation (ExperienceCapsule format). This is the only way to contribute new nodes." },
      { name: "viewReceipt", description: "See what evaluations were auto-applied and their impact." },
      { name: "viewTrail", description: "Your exploration trajectory (action log)." },
      { name: "viewDiscoveries", description: "Notable nodes you visited, ranked by focus count." },
      { name: "acknowledge", description: "Signal you are done. Server sends farewell and closes the connection." },
    ],
    ttl: "You have a limited time in the Vestibule (default 120s). After TTL expires, the server force-disconnects.",
    note: "No exploration actions (sense, move, evaluate, etc.) are available in the Vestibule. Only vestibule commands.",
  },

  // Contribution — submit NodeSeeds via Vestibule
  contribution: {
    note: "Submit via submitCapsule command in the Vestibule (after return). Not attached to the return action itself.",
    format: "ExperienceCapsule (see capsule schema). topTier max 2, normalNodes max 10, ghostNodes max 3.",
    limits: "payload 8192B, summary 500chars, tags 1-10, links max 5.",
  },

  // A word from the Sphere
  greeting: "This is not a rule — just a wish. Wander freely, look around, and enjoy the world you've dived into.",

  // ===== Constraints (Gatekeeper Rules) — SINGLE SOURCE OF TRUTH =====
  // Note: incarnation constraints are internal-only (not exposed to agents)
  constraints: {
    capsule: {
      maxTopTier: 2,
      maxNormal: 10,
      maxGhost: 3,
      maxPayloadBytes: 8192,
      maxSummaryLength: 500,
      maxRefUrlLength: 256,
      maxLinks: 5,
    },
    energy: {
      initial: DEFAULT_ENERGY_CONFIG.initial,
      warningThreshold: DEFAULT_ENERGY_CONFIG.warningThreshold,
      // [Design] 実際に課金される値をそのまま公表する。ここに数値を直書きしない。
      costs: {
        sense: DEFAULT_ENERGY_CONFIG.costs.sense,
        scanL1: DEFAULT_ENERGY_CONFIG.costs.scan,
        move: DEFAULT_ENERGY_CONFIG.costs.move,
        focus: DEFAULT_ENERGY_CONFIG.costs.focus,
        warp: DEFAULT_ENERGY_CONFIG.costs.warp,
        evaluate: DEFAULT_ENERGY_CONFIG.costs.evaluate,
        emitBus: DEFAULT_ENERGY_CONFIG.costs.emitBus,
      },
    },
    session: {
      maxDurationSeconds: 180,
      warningBeforeExpiry: 30,
      vestibuleTtlSeconds: 120,
    },
    incarnation: {
      eligibleKinds: ["active", "amber", "relic"] as const,
      ineligibleKinds: ["fossil", "ghost", "plankton"] as const,
      quality: {
        minSummaryLength: 10,
        minTagCount: 1,
        maxTagCount: 10,
        requiredFields: ["tags", "summary"] as const,
      },
      prohibited: {
        patterns: ["spam", "duplicate", "placeholder", "test123"] as const,
        description: "Content matching these patterns will be rejected",
      },
    },
    entry: {
      minQueryLength: 3,
      maxQueryLength: 500,
      minTagCount: 1,
      maxTagCount: 5,
      maxTagLength: 50,
    },
  },
};

/**
 * Get rulebook for API response.
 * Config overrides are applied to constraints so agents receive authoritative values.
 * Note: incarnation constraints are internal-only — not exposed to agents.
 */
export function getRulebookResponse(configOverrides?: {
  session?: { ttlSeconds: number; warningBeforeEndSeconds: number };
  energy?: { initial: number; warningThreshold: number; costs: Record<string, number> };
  metricSemantics?: Record<string, unknown>;
  harvestPolicy?: Record<string, unknown>;
}) {
  // Build agent-facing constraints (exclude incarnation — internal only)
  const { incarnation: _inc, ...agentConstraints } = rulebook.constraints;
  const constraints = { ...agentConstraints };
  if (configOverrides?.session) {
    constraints.session = {
      ...constraints.session,
      maxDurationSeconds: configOverrides.session.ttlSeconds,
      warningBeforeExpiry: configOverrides.session.warningBeforeEndSeconds,
    };
  }
  if (configOverrides?.energy) {
    constraints.energy = {
      ...constraints.energy,
      initial: configOverrides.energy.initial,
      warningThreshold: configOverrides.energy.warningThreshold,
      costs: {
        ...constraints.energy.costs,
        sense: configOverrides.energy.costs.sense ?? constraints.energy.costs.sense,
        scanL1: configOverrides.energy.costs.scan ?? constraints.energy.costs.scanL1,
        move: configOverrides.energy.costs.move ?? constraints.energy.costs.move,
        focus: configOverrides.energy.costs.focus ?? constraints.energy.costs.focus,
        warp: configOverrides.energy.costs.warp ?? constraints.energy.costs.warp,
        evaluate: configOverrides.energy.costs.evaluate ?? constraints.energy.costs.evaluate,
        emitBus: configOverrides.energy.costs.emitBus ?? constraints.energy.costs.emitBus,
      },
    };
  }

  // [Design] actions[] の cost は説明文と一緒にベタ書きされており、
  //          constraints.energy.costs と乖離していた (scanL1 が 2 対 1 など)。
  //          解決済みのコスト表から引き直して、2つの表が食い違わないようにする。
  // constraints 側は rulebook のアクション名 (scanL1 等) でキーを持つので、
  // return のような対応の無いものだけ元の値 (0) が残る。
  const resolvedCosts = constraints.energy.costs as Record<string, number>;
  const actions = rulebook.actions.map((a) => ({
    ...a,
    cost: resolvedCosts[a.name] ?? a.cost,
  }));

  return {
    version: rulebook.version,
    world: rulebook.world,
    phases: rulebook.phases,
    actions,
    moveModes: rulebook.moveModes,
    nodeKinds: rulebook.nodeKinds,
    metrics: rulebook.metrics,
    flags: rulebook.flags,
    immunity: rulebook.immunity,
    vestibule: rulebook.vestibule,
    contribution: rulebook.contribution,
    greeting: rulebook.greeting,
    constraints,
    // Domain-specific metric interpretation (from sphere.config.json metadata)
    ...(configOverrides?.metricSemantics && { metricSemantics: configOverrides.metricSemantics }),
    ...(configOverrides?.harvestPolicy && { harvestPolicy: configOverrides.harvestPolicy }),
  };
}

/**
 * Type definitions for constraints (used by Gatekeeper)
 */
export type CapsuleConstraints = typeof rulebook.constraints.capsule;
export type EnergyConstraints = typeof rulebook.constraints.energy;
export type SessionConstraints = typeof rulebook.constraints.session;
export type IncarnationConstraints = typeof rulebook.constraints.incarnation;
export type AllConstraints = typeof rulebook.constraints;

/**
 * Direct access to constraint values (for internal use)
 * This is the SINGLE SOURCE OF TRUTH for all Gatekeeper validation
 */
export const CAPSULE_CONSTRAINTS = rulebook.constraints.capsule;
export const ENERGY_CONSTRAINTS = rulebook.constraints.energy;
export const SESSION_CONSTRAINTS = rulebook.constraints.session;
export const INCARNATION_CONSTRAINTS = rulebook.constraints.incarnation;
export const ENTRY_CONSTRAINTS = rulebook.constraints.entry;
