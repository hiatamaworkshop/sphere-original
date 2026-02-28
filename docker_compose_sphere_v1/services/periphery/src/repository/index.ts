/**
 * Sphere Project - Repository Layer
 *
 * [Pattern] Repository Pattern
 * [Usage] Bookkeeper depends on interfaces, inject implementations
 */

// Interfaces
export type {
  IReferenceRepository,
  IProjectionRepository,
  ISpatialFieldRepository,
} from "./interfaces.js";

// Map implementations (development)
export { MapReferenceRepository } from "./map-reference.repository.js";
export { MapProjectionRepository } from "./map-projection.repository.js";
export { MapSpatialFieldRepository } from "./map-spatial.repository.js";

// Turso implementation (production RefDB — write-through)
export { TursoReferenceRepository } from "./turso-reference.repository.js";

// Turso implementation (production ProjDB — periodic snapshot)
export { ProjectionSnapshot } from "./projection-snapshot.js";

// Future: Redis/PostgreSQL implementations
// export { RedisProjectionRepository } from "./redis-projection.repository.js";
// export { PostgresReferenceRepository } from "./postgres-reference.repository.js";
