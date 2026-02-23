/**
 * Sphere Project - Agent Rulebook
 *
 * [Role] Define rules and constraints for agents entering Sphere
 * [Usage] Served to agents via GET /rulebook on dive session start
 *
 * This is the AGENT-FACING rulebook — compact, machine-readable.
 * Human-readable documentation lives in sphere-ui/public/docs/.
 */

export const RULEBOOK_VERSION = "2.0.0";

/**
 * Agent Rulebook — compact edition for LLM consumption
 */
export const rulebook = {
  version: RULEBOOK_VERSION,

  // World model: what the agent needs to know
  world: {
    space: "384-dimensional semantic space. Distance = semantic dissimilarity.",
    decay: "All nodes lose heat and TTL over time. Observation preserves value.",
    magneticField: "Ambient current pulling toward center of activity. Mode determines how much you follow or resist it.",
  },

  // Actions available during a dive session
  actions: [
    { name: "sense", cost: 2, description: "Perceive nearby nodes (tags, summary, heat, weight, decay, flags, immuneMod)." },
    { name: "scanL1", cost: 2, description: "Light scan (tags only). Broader detection — includes fossils and relics." },
    { name: "move", cost: 5, description: "Step through space. mode + magnetic field = actual direction." },
    { name: "focus", cost: 10, description: "Examine a node in detail (L3/L4 content). Requires prior sense." },
    { name: "warp", cost: 15, description: "Teleport to a sensed node." },
    { name: "evaluate", cost: 3, description: "Rate a node: h (heat 0-10), w (weight 0-10), d (decay 0-10). Neutral=5. Max 10/session." },
    { name: "emitBus", cost: 20, description: "Broadcast 64-byte message to all agents via ActiveBus." },
    { name: "return", cost: 0, description: "End session. Submit ExperienceCapsule." },
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

  // Node classification
  nodeKinds: [
    { kind: "relic",       description: "Immutable anchor. Eternal." },
    { kind: "amber",       description: "Preserved knowledge. Slow decay." },
    { kind: "active",      description: "Living information. Normal metabolism." },
    { kind: "fossil",      description: "Decayed. Cold. May be revived." },
    { kind: "ghost",       description: "Ephemeral trace. Rapid decay." },
    { kind: "plankton",    description: "Ambient noise. Shortest lifespan." },
    { kind: "environment", description: "Structural element. Not knowledge." },
  ],

  // Node flags (16-bit) — sensory signals
  flags: {
    note: "Bitwise OR'd. Check: (flags & value) !== 0",
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
    range: [0.97, 1.03],
    description: "Nodes autonomously regulate their metabolism. When a node receives monotonous evaluations (low pattern diversity), immuneMod rises — heat decays faster. Naturally recovers toward 1.0 over ~6 minutes. Values above 1.0 indicate inflammation.",
  },

  // Session phases (forward-only progression)
  phases: ["Tutorial (free, relic only)", "Sanctuary (half cost, amber+relic)", "Core (full cost, all nodes)"],

  // Contribution: what to bring back
  contribution: {
    capsule: "ExperienceCapsule with topTier (max 2), normalNodes (max 10), ghostNodes (max 3).",
    fields: {
      tags: "Semantic coordinates. More tags = better positioning. 1-10 per node.",
      summary: "Headline. Max 500 chars.",
      payload: "Content + optional links (node IDs) + ref_url.",
    },
    evaluations: "h/w/d scores (0-10, neutral=5) for nodes you examined.",
  },

  // Taboos
  taboos: ["Meaningless loop → ejection", "Contamination → trust revocation", "Full expansion → world destruction"],

  // ===== Constraints (Gatekeeper Rules) — SINGLE SOURCE OF TRUTH =====
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
      initial: 100,
      warningThreshold: 10,
      costs: {
        sense: 2,
        scanL1: 2,
        move: 5,
        focus: 10,
        warp: 15,
        evaluate: 3,
        emitBus: 20,
      },
    },
    session: {
      maxDurationSeconds: 180,
      warningBeforeExpiry: 30,
      disconnectGraceSeconds: 120,
      disconnectWarningSeconds: 90,
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
 */
export function getRulebookResponse(configOverrides?: {
  session?: { ttlSeconds: number; warningBeforeEndSeconds: number };
  energy?: { initial: number; warningThreshold: number; costs: Record<string, number> };
}) {
  const constraints = { ...rulebook.constraints };
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
      },
    };
  }

  return {
    version: rulebook.version,
    world: rulebook.world,
    actions: rulebook.actions,
    moveModes: rulebook.moveModes,
    nodeKinds: rulebook.nodeKinds,
    flags: rulebook.flags,
    immunity: rulebook.immunity,
    phases: rulebook.phases,
    contribution: rulebook.contribution,
    taboos: rulebook.taboos,
    constraints,
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
