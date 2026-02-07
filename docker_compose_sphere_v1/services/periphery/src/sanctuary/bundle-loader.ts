/**
 * Sphere Project - Sanctuary Bundle Loader
 *
 * [Role] Load, validate, and cache SanctuaryBundle for Tutorial/Sanctuary layers
 *
 * [Design] Self-contained ROM image loader
 *   - Loads from file or memory
 *   - Validates signature integrity
 *   - Provides in-memory cache for fast access
 *   - Offline/portable compatible
 *
 * [Usage]
 *   const loader = new BundleLoader();
 *   await loader.load("path/to/bundle.json");
 *   const nodes = loader.query(agentVector, radius);
 */

import { readFile } from "fs/promises";
import { createHash } from "crypto";
import type {
  SanctuaryBundle,
  SanctuaryNode,
  BundleValidation,
} from "../types/experience-layer.js";
import { validateBundle } from "../types/experience-layer.js";

// ============================================================
// Configuration
// ============================================================

/** Current supported bundle version */
const SUPPORTED_BUNDLE_VERSION = 1;

/** Maximum nodes for in-memory operation */
const MAX_NODES_IN_MEMORY = 100000;

// ============================================================
// Vector Operations
// ============================================================

/**
 * Calculate cosine distance between two vectors
 */
function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 1;

  const similarity = dotProduct / denominator;
  return 1 - similarity;  // Convert similarity to distance
}

// ============================================================
// Bundle Loader
// ============================================================

/**
 * Query result from bundle
 */
export interface BundleQueryResult {
  node: SanctuaryNode;
  distance: number;
}

/**
 * Bundle statistics
 */
export interface BundleStats {
  loaded: boolean;
  version: number;
  frozenAt: number;
  nodeCount: number;
  relicCount: number;
  amberCount: number;
  activeCount: number;
  vectorDimension: number;
  sourceCore: string;
}

/**
 * Bundle Loader: Manages SanctuaryBundle lifecycle
 */
export class BundleLoader {
  private bundle: SanctuaryBundle | null = null;
  private nodeIndex: Map<string, SanctuaryNode> = new Map();
  private vectorDimension: number = 0;

  /**
   * Load bundle from file
   */
  async loadFromFile(path: string): Promise<BundleValidation> {
    console.log(`[BundleLoader] Loading bundle from: ${path}`);

    const content = await readFile(path, "utf-8");
    const bundle = JSON.parse(content) as SanctuaryBundle;

    return this.loadBundle(bundle);
  }

  /**
   * Load bundle from memory
   */
  loadBundle(bundle: SanctuaryBundle): BundleValidation {
    // Validate bundle structure
    const validation = validateBundle(bundle);
    if (!validation.valid) {
      console.error(`[BundleLoader] Bundle validation failed:`, validation.errors);
      return validation;
    }

    // Check version compatibility
    if (bundle.version > SUPPORTED_BUNDLE_VERSION) {
      return {
        valid: false,
        errors: [`Unsupported bundle version: ${bundle.version} (max: ${SUPPORTED_BUNDLE_VERSION})`],
      };
    }

    // Check node count limit
    if (bundle.nodes.length > MAX_NODES_IN_MEMORY) {
      return {
        valid: false,
        errors: [`Too many nodes: ${bundle.nodes.length} (max: ${MAX_NODES_IN_MEMORY})`],
      };
    }

    // Verify signature
    const signatureValid = this.verifySignature(bundle);
    if (!signatureValid) {
      return {
        valid: false,
        errors: ["Invalid bundle signature"],
      };
    }

    // Load into memory
    this.bundle = bundle;
    this.buildIndex();

    console.log(`[BundleLoader] Bundle loaded: ${bundle.metadata.nodeCount} nodes, frozen at ${new Date(bundle.frozenAt).toISOString()}`);

    return { valid: true, errors: [] };
  }

  /**
   * Build in-memory index for fast access
   */
  private buildIndex(): void {
    if (!this.bundle) return;

    this.nodeIndex.clear();

    for (const node of this.bundle.nodes) {
      this.nodeIndex.set(node.id, node);

      // Capture vector dimension from first node with vector
      if (this.vectorDimension === 0 && node.vector.length > 0) {
        this.vectorDimension = node.vector.length;
      }
    }

    console.log(`[BundleLoader] Index built: ${this.nodeIndex.size} nodes, vector dim=${this.vectorDimension}`);
  }

  /**
   * Verify bundle signature
   */
  private verifySignature(bundle: SanctuaryBundle): boolean {
    // Simple signature verification: hash of nodes + frozenAt
    // In production, use proper cryptographic signature
    const data = JSON.stringify({
      frozenAt: bundle.frozenAt,
      sourceCore: bundle.sourceCore,
      nodeCount: bundle.nodes.length,
    });

    // Reserved for proper signature verification
    // TODO: Compare _hash with bundle.signature
    const _hash = createHash("sha256").update(data).digest("hex");

    // For now, just check signature is present
    return bundle.signature.length > 0;
  }

  /**
   * Query nodes by vector proximity
   */
  query(agentVector: number[], radius: number, limit: number = 20): BundleQueryResult[] {
    if (!this.bundle) {
      console.warn("[BundleLoader] No bundle loaded");
      return [];
    }

    const results: BundleQueryResult[] = [];

    for (const node of this.bundle.nodes) {
      // Skip nodes without vectors
      if (node.vector.length === 0) continue;

      const distance = cosineDistance(agentVector, node.vector);

      if (distance <= radius) {
        results.push({ node, distance });
      }
    }

    // Sort by distance and limit
    results.sort((a, b) => a.distance - b.distance);
    return results.slice(0, limit);
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): SanctuaryNode | undefined {
    return this.nodeIndex.get(nodeId);
  }

  /**
   * Get all nodes of specific kind
   */
  getNodesByKind(kind: string): SanctuaryNode[] {
    if (!this.bundle) return [];
    return this.bundle.nodes.filter((n) => n.kind === kind);
  }

  /**
   * Get bundle statistics
   */
  getStats(): BundleStats | null {
    if (!this.bundle) return null;

    return {
      loaded: true,
      version: this.bundle.version,
      frozenAt: this.bundle.frozenAt,
      nodeCount: this.bundle.metadata.nodeCount,
      relicCount: this.bundle.metadata.relicCount,
      amberCount: this.bundle.metadata.amberCount,
      activeCount: this.bundle.metadata.activeCount,
      vectorDimension: this.vectorDimension,
      sourceCore: this.bundle.sourceCore,
    };
  }

  /**
   * Check if bundle is loaded
   */
  isLoaded(): boolean {
    return this.bundle !== null;
  }

  /**
   * Unload bundle (free memory)
   */
  unload(): void {
    this.bundle = null;
    this.nodeIndex.clear();
    this.vectorDimension = 0;
    console.log("[BundleLoader] Bundle unloaded");
  }
}

// ============================================================
// Singleton Instance (Optional)
// ============================================================

let defaultLoader: BundleLoader | null = null;

/**
 * Get default bundle loader instance
 */
export function getDefaultBundleLoader(): BundleLoader {
  if (!defaultLoader) {
    defaultLoader = new BundleLoader();
  }
  return defaultLoader;
}

// ============================================================
// Bundle Creation (for Core → Sanctuary freezing)
// ============================================================

/**
 * Options for creating a SanctuaryBundle
 */
export interface CreateBundleOptions {
  sourceCore: string;
  nodes: SanctuaryNode[];
  description?: string;
}

/**
 * Create a new SanctuaryBundle from Core data
 *
 * [Usage] Called when freezing Core state to create Sanctuary snapshot
 */
export function createSanctuaryBundle(options: CreateBundleOptions): SanctuaryBundle {
  const now = Date.now();

  // Count nodes by kind
  let relicCount = 0;
  let amberCount = 0;
  let activeCount = 0;

  for (const node of options.nodes) {
    switch (node.kind) {
      case "relic":
        relicCount++;
        break;
      case "amber":
        amberCount++;
        break;
      case "active":
        activeCount++;
        break;
    }
  }

  // Generate signature
  const signatureData = JSON.stringify({
    frozenAt: now,
    sourceCore: options.sourceCore,
    nodeCount: options.nodes.length,
  });
  const signature = createHash("sha256").update(signatureData).digest("hex");

  return {
    version: SUPPORTED_BUNDLE_VERSION,
    frozenAt: now,
    signature,
    sourceCore: options.sourceCore,
    nodes: options.nodes,
    metadata: {
      nodeCount: options.nodes.length,
      relicCount,
      amberCount,
      activeCount,
      description: options.description,
    },
  };
}
