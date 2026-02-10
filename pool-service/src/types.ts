// ============================================================
// Pool Service — Type Definitions
// ============================================================
//
// Data contracts for the intake quality gate.
// Mirrors Sphere's NodeSeed/ExperienceCapsule where needed,
// adds Pool-specific scoring types.

// --- Node format (subset of Sphere's NodeSeed) ---

export interface PoolEntry {
  /** External source identifier (feed name, service name, etc.) */
  source: string;
  /** Keyword tags / categories */
  tags: string[];
  /** Short title or headline */
  title: string;
  /** Full body text */
  body: string;
  /** Source URL */
  url?: string;
  /** Timestamp of ingestion into pool */
  ingestedAt: number;
}

// --- LLM Thermometer output (Scorer A) ---

export interface ThermometerScores {
  /** Domain expertise, citation-worthiness (0-1) */
  authority: number;
  /** New information, not redundant (0-1) */
  novelty: number;
  /** Internal consistency, well-formed (0-1) */
  coherence: number;
}

// --- Initial metrics assigned by Scorer A ---

export interface InitialMetrics {
  heat: number;
  weight: number;
  decay: number;
  flags: number;
}

// --- Scored entry (after Scorer A) ---

export interface ScoredEntry {
  entry: PoolEntry;
  scores: ThermometerScores;
  metrics: InitialMetrics;
}

// --- Weapon scoring result (Scorers B/C/D) ---

export interface WeaponScore {
  scorerName: string;
  score: number;
  verdict: "accept" | "reject" | "hold";
}

// --- Final pool verdict ---

export interface PoolVerdict {
  entry: PoolEntry;
  thermometer: ThermometerScores;
  weaponScores: WeaponScore[];
  finalScore: number;
  accepted: boolean;
  reason: string;
}

// --- Sphere submission format (mirrors periphery/types/capsule.ts) ---

export interface NodeSeed {
  tags: string[];
  summary: string;
  content: string;
  ref_url?: string;
  flags: number;             // required (16-bit NodeFlag)
}

export interface ExperienceCapsule {
  schemaVersion: 4;
  topTier: NodeSeed[];
  normalNodes: NodeSeed[];
  ghostNodes: NodeSeed[];
  evaluations: never[];
  timestamp: number;
}

/** Wrapper format expected by POST /sphere/contribute */
export interface ContributePayload {
  source: string;
  capsule: ExperienceCapsule;
}

/** Batch wrapper format */
export interface ContributeBatchPayload {
  source: string;
  batch: true;
  capsules: ExperienceCapsule[];
}

// --- Config ---

export interface PoolConfig {
  /** Sphere contribute endpoint URL */
  sphereUrl: string;
  /** Ollama endpoint URL */
  ollamaUrl: string;
  /** Ollama model name */
  ollamaModel: string;
  /** Intake threshold: dot(scores, intakeWeights) must exceed this */
  intakeThreshold: number;
  /** Weights for dot product scoring [authority, novelty, coherence] */
  intakeWeights: [number, number, number];
  /** Coherence floor — reject below this regardless of other scores */
  coherenceFloor: number;
  /** Max entries in pool before forced flush */
  poolCapacity: number;
  /** Scoring interval in ms */
  scoringIntervalMs: number;
  /** Debug logging */
  debug: boolean;
}

export const DEFAULT_CONFIG: PoolConfig = {
  sphereUrl: "http://localhost:3001/sphere/contribute",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "phi3:mini",
  intakeThreshold: 0.5,
  intakeWeights: [0.4, 0.3, 0.3],
  coherenceFloor: 0.3,
  poolCapacity: 100,
  scoringIntervalMs: 5000,
  debug: true,
};
