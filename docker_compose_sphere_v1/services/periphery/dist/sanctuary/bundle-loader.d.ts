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
import type { SanctuaryBundle, SanctuaryNode, BundleValidation } from "../types/experience-layer.js";
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
export declare class BundleLoader {
    private bundle;
    private nodeIndex;
    private vectorDimension;
    /**
     * Load bundle from file
     */
    loadFromFile(path: string): Promise<BundleValidation>;
    /**
     * Load bundle from memory
     */
    loadBundle(bundle: SanctuaryBundle): BundleValidation;
    /**
     * Build in-memory index for fast access
     */
    private buildIndex;
    /**
     * Verify bundle signature
     */
    private verifySignature;
    /**
     * Query nodes by vector proximity
     */
    query(agentVector: number[], radius: number, limit?: number): BundleQueryResult[];
    /**
     * Get node by ID
     */
    getNode(nodeId: string): SanctuaryNode | undefined;
    /**
     * Get all nodes of specific kind
     */
    getNodesByKind(kind: string): SanctuaryNode[];
    /**
     * Get bundle statistics
     */
    getStats(): BundleStats | null;
    /**
     * Check if bundle is loaded
     */
    isLoaded(): boolean;
    /**
     * Unload bundle (free memory)
     */
    unload(): void;
}
/**
 * Get default bundle loader instance
 */
export declare function getDefaultBundleLoader(): BundleLoader;
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
export declare function createSanctuaryBundle(options: CreateBundleOptions): SanctuaryBundle;
//# sourceMappingURL=bundle-loader.d.ts.map