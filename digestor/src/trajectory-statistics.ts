// ============================================================
// Trajectory Statistics — spatial ecology metrics (v1)
// ============================================================
//
// Pure computation functions for trail analysis.
// No I/O — receives data, returns computed metrics.
//
// Design: TRAJECTORY_ANALYSIS_DESIGN.md
//
// v1 Metrics (per-session):
//   spread       — normalized spatial distribution breadth
//   heatBias     — tendency toward high/low-heat nodes
//   weightBias   — tendency toward high/low-weight nodes
//   decayBias    — tendency toward high/low-decay nodes
//   pathLength   — total movement distance in 384D
//   straightness — goal orientation (direct vs winding)
//
// Signature: [spread, heatBias, weightBias, decayBias, straightness]
//
// Future:
//   revisitRate  — needs cross-session centroid (Phase 3)

// ---- Constants ----

export const MIN_WAYPOINTS = 2;
export const MIN_SPECIES_TRAILS = 5;

// ---- Types ----

/** Raw trail event as stored in trail-log.jsonl */
export interface TrailEvent {
  type: string;
  timestamp: number;
  nodeId?: string;
  positionSnapshot?: number[];
  heat?: number;
  weight?: number;
  decay?: number;
}

/** Trail entry (1 line in trail-log.jsonl) */
export interface TrailEntry {
  sessionId?: string;
  loadout: string;
  timestamp: number;
  events: TrailEvent[];
}

/** Extracted waypoint from focus event */
interface Waypoint {
  position: number[];
  heat: number;
  weight?: number;
  decay?: number;
}

/** Per-session computed metrics */
export interface SessionMetrics {
  sessionId?: string;
  loadout: string;
  spread: number;
  heatBias?: number;
  weightBias?: number;
  decayBias?: number;
  pathLength: number;
  straightness: number;
  centroid: number[];
  waypointCount: number;
}

/** Per-species aggregated trajectory stats */
export interface TrajectoryStats {
  sessions: number;
  avgSpread: number;
  avgHeatBias?: number;
  avgWeightBias?: number;
  avgDecayBias?: number;
  avgPathLength: number;
  avgStraightness: number;
  /** [spread, heatBias, weightBias, decayBias, straightness] — species fingerprint */
  signature: [number, number, number, number, number];
}

/** Sphere averages for bias computation */
export interface SphereAverages {
  avgHeat: number;
  avgWeight: number;
  avgDecay?: number;
}

// ---- Vector math (384D) ----

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function computeCentroid(points: number[][]): number[] {
  if (points.length === 0) return [];
  const dim = points[0].length;
  const result = new Array<number>(dim).fill(0);
  for (const p of points) {
    for (let i = 0; i < dim; i++) result[i] += p[i] ?? 0;
  }
  const n = points.length;
  for (let i = 0; i < dim; i++) result[i] /= n;
  return result;
}

// ---- Waypoint extraction ----

function extractWaypoints(trail: TrailEntry): Waypoint[] {
  const waypoints: Waypoint[] = [];
  for (const e of trail.events) {
    if (e.type === "focus" && e.positionSnapshot && e.positionSnapshot.length > 0) {
      waypoints.push({
        position: e.positionSnapshot,
        heat: e.heat ?? 0,
        weight: e.weight,
        decay: e.decay,
      });
    }
  }
  return waypoints;
}

// ---- Per-session metrics ----

/**
 * Compute v1 metrics for a single trail session.
 * Returns null if insufficient waypoints (< MIN_WAYPOINTS).
 */
export function computeSessionMetrics(
  trail: TrailEntry,
  sphereAvg?: SphereAverages,
): SessionMetrics | null {
  const waypoints = extractWaypoints(trail);
  if (waypoints.length < MIN_WAYPOINTS) return null;

  const positions = waypoints.map(w => w.position);
  const centroid = computeCentroid(positions);

  // Spread: mean(dist_to_centroid) / max(dist_to_centroid)
  const dists = positions.map(p => euclidean(p, centroid));
  const maxDist = Math.max(...dists);
  const meanDist = dists.reduce((s, d) => s + d, 0) / dists.length;
  const spread = maxDist > 0 ? meanDist / maxDist : 0;

  // Path length: Σ|pos[i+1] - pos[i]|
  let pathLength = 0;
  for (let i = 1; i < positions.length; i++) {
    pathLength += euclidean(positions[i - 1], positions[i]);
  }

  // Straightness: dist(first, last) / pathLength
  const directDist = euclidean(positions[0], positions[positions.length - 1]);
  const straightness = pathLength > 0 ? directDist / pathLength : 1.0;

  // Heat bias: (mean_visited_heat - sphere_avg) / sphere_avg
  let heatBias: number | undefined;
  if (sphereAvg && sphereAvg.avgHeat > 0) {
    const meanHeat = waypoints.reduce((s, w) => s + w.heat, 0) / waypoints.length;
    heatBias = (meanHeat - sphereAvg.avgHeat) / sphereAvg.avgHeat;
  }

  // Weight bias: (mean_visited_weight - sphere_avg) / sphere_avg
  let weightBias: number | undefined;
  const withWeight = waypoints.filter(w => w.weight !== undefined);
  if (sphereAvg && sphereAvg.avgWeight > 0 && withWeight.length > 0) {
    const meanWeight = withWeight.reduce((s, w) => s + (w.weight ?? 0), 0) / withWeight.length;
    weightBias = (meanWeight - sphereAvg.avgWeight) / sphereAvg.avgWeight;
  }

  // Decay bias: (mean_visited_decay - sphere_avg) / sphere_avg
  let decayBias: number | undefined;
  const withDecay = waypoints.filter(w => w.decay !== undefined);
  if (sphereAvg?.avgDecay && sphereAvg.avgDecay > 0 && withDecay.length > 0) {
    const meanDecay = withDecay.reduce((s, w) => s + (w.decay ?? 0), 0) / withDecay.length;
    decayBias = (meanDecay - sphereAvg.avgDecay) / sphereAvg.avgDecay;
  }

  return {
    sessionId: trail.sessionId,
    loadout: trail.loadout,
    spread,
    heatBias,
    weightBias,
    decayBias,
    pathLength,
    straightness,
    centroid,
    waypointCount: waypoints.length,
  };
}

// ---- Per-species aggregation ----

/**
 * Aggregate session metrics into species-level trajectory stats.
 * Returns null if insufficient sessions (< MIN_SPECIES_TRAILS).
 */
export function aggregateSpeciesTrajectory(
  sessions: SessionMetrics[],
): TrajectoryStats | null {
  if (sessions.length < MIN_SPECIES_TRAILS) return null;

  const n = sessions.length;
  const avgSpread = sessions.reduce((s, m) => s + m.spread, 0) / n;
  const avgPathLength = sessions.reduce((s, m) => s + m.pathLength, 0) / n;
  const avgStraightness = sessions.reduce((s, m) => s + m.straightness, 0) / n;

  // Bias averages (only from sessions that have bias values)
  const heatBiased = sessions.filter(m => m.heatBias !== undefined);
  const avgHeatBias = heatBiased.length > 0
    ? heatBiased.reduce((s, m) => s + m.heatBias!, 0) / heatBiased.length
    : undefined;

  const weightBiased = sessions.filter(m => m.weightBias !== undefined);
  const avgWeightBias = weightBiased.length > 0
    ? weightBiased.reduce((s, m) => s + m.weightBias!, 0) / weightBiased.length
    : undefined;

  const decayBiased = sessions.filter(m => m.decayBias !== undefined);
  const avgDecayBias = decayBiased.length > 0
    ? decayBiased.reduce((s, m) => s + m.decayBias!, 0) / decayBiased.length
    : undefined;

  // Signature: [spread, heatBias, weightBias, decayBias, straightness]
  const signature: [number, number, number, number, number] = [
    avgSpread,
    avgHeatBias ?? 0,
    avgWeightBias ?? 0,
    avgDecayBias ?? 0,
    avgStraightness,
  ];

  return {
    sessions: n,
    avgSpread,
    avgHeatBias,
    avgWeightBias,
    avgDecayBias,
    avgPathLength,
    avgStraightness,
    signature,
  };
}
