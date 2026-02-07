/**
 * Sphere Project - Periphery Types Index
 */

// Experience Layer (3-Layer Piping)
export type {
  ExperienceLayer,
  LayerCharacteristics,
  SanctuaryBundle,
  SanctuaryNode,
  BundleValidation,
  EvaluationDelta,
  SessionBuffer,
  LayerTransitionRequest,
  LayerTransitionResult,
  EvaluationResult,
} from "./experience-layer.js";
export {
  LAYER_CHARACTERISTICS,
  VALID_TRANSITIONS,
  validateBundle,
  createSessionBuffer,
  addEvaluationToBuffer,
  isValidTransition,
  handleLayerEvaluation,
} from "./experience-layer.js";

// Capsule & NodeSeed
export type {
  ExperienceCapsule,
  NodeSeed,
  ParsedNodeSeed,
  ParsedCapsule,
  TaggedNodeSeed,
  TaggedCapsule,
  PackedNodes,
} from "./capsule.js";

// Config
export type { PeripheryConfig } from "./config.js";

// Gateway (Agent connection layer)
export type {
  // Coordinates
  Vector,
  // Dive Ticket
  DiveTicket,
  // SphereContext API
  NearbyNode,
  NodeDetail,
  MoveIntent,
  BlockReason,
  MoveResult,
  SphereContextEventType,
  SphereContextEventHandlers,
  SphereContext,
  // Gateway-Core Messages
  GatewayToSphereMessage,
  SphereToGatewayMessage,
  // Session
  GatewaySession,
  // Amber Showcase (L1/L2 only)
  AmberShowcaseEntry,
} from "./gateway.js";
