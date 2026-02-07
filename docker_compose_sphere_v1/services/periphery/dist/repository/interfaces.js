/**
 * Sphere Project - Repository Interfaces
 *
 * [Pattern] Repository Pattern for DB abstraction
 * [Principle] Loose coupling - Bookkeeper depends on interfaces, not implementations
 *
 * Implementations:
 * - MapXxxRepository: In-memory (development)
 * - RedisProjectionRepository: Redis (production ProjDB)
 * - PostgresReferenceRepository: PostgreSQL + pgvector (production RefDB)
 */
export {};
//# sourceMappingURL=interfaces.js.map