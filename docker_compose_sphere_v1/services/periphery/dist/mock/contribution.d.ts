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
export {};
//# sourceMappingURL=contribution.d.ts.map