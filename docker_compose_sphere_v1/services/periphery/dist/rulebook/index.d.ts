/**
 * Sphere Project - Agent Rulebook
 *
 * [Role] Define rules and constraints for agents entering Sphere
 * [Usage] Served to agents on spawn for self-regulation
 */
export declare const RULEBOOK_VERSION = "1.0.0";
/**
 * The Rulebook - Agent's Guide to Sphere
 */
export declare const rulebook: {
    version: string;
    welcome: string;
    principles: {
        existence: {
            title: string;
            description: string;
        };
        perception: {
            title: string;
            description: string;
        };
        metabolism: {
            title: string;
            description: string;
        };
        contribution: {
            title: string;
            description: string;
        };
    };
    navigation: {
        space: string;
        sense: string;
        movement: {
            move: string;
            warp: string;
            deprecated: string;
        };
        magneticField: string;
        attractant: string;
        repellent: string;
        anchor: string;
        boundary: string;
    };
    energy: {
        concept: string;
        allocation: {
            sense: string;
            randomWalk: string;
            warp: string;
            focus: string;
            emitBus: string;
        };
        exhaustion: string;
    };
    phases: {
        tutorial: {
            name: string;
            description: string;
        };
        sanctuary: {
            name: string;
            description: string;
        };
        core: {
            name: string;
            description: string;
        };
    };
    actions: {
        allowed: ({
            name: string;
            description: string;
            parameters?: undefined;
            modes?: undefined;
            fieldInfluence?: undefined;
            notes?: undefined;
        } | {
            name: string;
            description: string;
            parameters: {
                step: string;
                mode: string;
                payload?: undefined;
            };
            modes: {
                random: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
                hot: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
                fresh: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
                deep: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
                explore: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
                flow: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
            };
            fieldInfluence: string;
            notes?: undefined;
        } | {
            name: string;
            description: string;
            parameters: {
                payload: string;
                step?: undefined;
                mode?: undefined;
            };
            notes: string;
            modes?: undefined;
            fieldInfluence?: undefined;
        })[];
        deprecated: {
            name: string;
            description: string;
        }[];
        forbidden: {
            name: string;
            description: string;
        }[];
    };
    nodeKinds: {
        relic: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
        amber: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
        active: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
        fossil: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
        ghost: {
            name: string;
            description: string;
            behavior: string;
            usage: string;
            warning: string;
        };
        plankton: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
        environment: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
    };
    nodeFlags: {
        concept: string;
        interpretation: {
            note: string;
            decoding: string;
        };
        flags: {
            authority: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            freshness: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            catalyst: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            ephemeral: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            sticky: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            volatile: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            hot: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            frozen: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            hub: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            isolated: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
        };
        examples: {
            flags: string;
            binary: string;
            meaning: string;
            interpretation: string;
        }[];
        guidance: string;
    };
    contribution: {
        philosophy: string;
        dataStructure: {
            tags: {
                purpose: string;
                description: string;
                guidance: string;
                example: string[];
                constraint: string;
                ownership: string;
            };
            summary: {
                purpose: string;
                description: string;
                guidance: string;
                example: string;
                ownership: string;
            };
            payload: {
                purpose: string;
                description: string;
                guidance: string;
                example: {
                    content: string;
                    links: string[];
                    ref_url: string;
                    notes: string;
                };
                linksGuidance: string;
                ownership: string;
            };
            note: {
                title: string;
                description: string;
            };
        };
        tagging: {
            philosophy: string;
            decomposition: {
                description: string;
                method: string[];
                result: string;
            };
            options: {
                selfTagging: {
                    description: string;
                    guidance: string;
                    responsibility: string;
                };
                pipelineTagging: {
                    description: string;
                    guidance: string;
                    responsibility: string;
                };
            };
            bestPractices: string[];
        };
        capsuleStructure: {
            topTier: {
                description: string;
                guidance: string;
                maxCount: number;
            };
            normalNodes: {
                description: string;
                guidance: string;
                maxCount: number;
            };
            ghostNodes: {
                description: string;
                guidance: string;
                maxCount: number;
            };
        };
        capsuleExample: {
            description: string;
            idFormat: string;
            example: {
                topTier: {
                    tags: string[];
                    summary: string;
                    payload: {
                        content: string;
                        links: string[];
                        ref_url: string;
                    };
                    flags: number;
                }[];
                normalNodes: {
                    tags: string[];
                    summary: string;
                    payload: {
                        content: string;
                        links: string[];
                    };
                    flags: number;
                }[];
                ghostNodes: {
                    tags: string[];
                    summary: string;
                    payload: {
                        content: string;
                    };
                    flags: number;
                }[];
                evaluations: {
                    nodeId: string;
                    score: number;
                    context: string;
                }[];
            };
            note: string;
        };
        bestPractices: string[];
        antiPatterns: string[];
    };
    pipeline: {
        overview: string;
        stages: {
            name: string;
            role: string;
            description: string;
            outcome: string;
        }[];
        timing: string;
        failure: string;
    };
    constraints: {
        capsule: {
            maxTopTier: number;
            maxNormal: number;
            maxGhost: number;
            maxPayloadBytes: number;
            maxSummaryLength: number;
            maxRefUrlLength: number;
            maxLinks: number;
        };
        energy: {
            initial: number;
            warningThreshold: number;
            costs: {
                sense: number;
                move: number;
                focus: number;
                warp: number;
                evaluate: number;
                emitBus: number;
            };
            philosophy: string;
        };
        session: {
            maxDurationSeconds: number;
            warningBeforeExpiry: number;
            disconnectGraceSeconds: number;
            disconnectWarningSeconds: number;
        };
        incarnation: {
            eligibleKinds: readonly ["active", "amber", "relic"];
            ineligibleKinds: readonly ["fossil", "ghost", "plankton"];
            quality: {
                minSummaryLength: number;
                minTagCount: number;
                maxTagCount: number;
                requiredFields: readonly ["tags", "summary"];
            };
            prohibited: {
                patterns: readonly ["spam", "duplicate", "placeholder", "test123"];
                description: string;
            };
        };
        entry: {
            minQueryLength: number;
            maxQueryLength: number;
            minTagCount: number;
            maxTagCount: number;
            maxTagLength: number;
        };
    };
    taboos: {
        name: string;
        consequence: string;
        description: string;
    }[];
    wisdom: {
        failure: string;
        departure: string;
        mirror: string;
    };
    closing: string;
};
/**
 * Get rulebook for API response
 */
export declare function getRulebookResponse(): {
    version: string;
    welcome: string;
    principles: ({
        title: string;
        description: string;
    } | {
        title: string;
        description: string;
    } | {
        title: string;
        description: string;
    } | {
        title: string;
        description: string;
    })[];
    navigation: {
        space: string;
        sense: string;
        movement: {
            move: string;
            warp: string;
            deprecated: string;
        };
        magneticField: string;
        attractant: string;
        repellent: string;
        anchor: string;
        boundary: string;
    };
    energy: {
        concept: string;
        allocation: {
            sense: string;
            randomWalk: string;
            warp: string;
            focus: string;
            emitBus: string;
        };
        exhaustion: string;
    };
    phases: ({
        name: string;
        description: string;
    } | {
        name: string;
        description: string;
    } | {
        name: string;
        description: string;
    })[];
    actions: {
        allowed: ({
            name: string;
            description: string;
            parameters?: undefined;
            modes?: undefined;
            fieldInfluence?: undefined;
            notes?: undefined;
        } | {
            name: string;
            description: string;
            parameters: {
                step: string;
                mode: string;
                payload?: undefined;
            };
            modes: {
                random: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
                hot: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
                fresh: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
                deep: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
                explore: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
                flow: {
                    formula: string;
                    fieldWeight: number;
                    description: string;
                };
            };
            fieldInfluence: string;
            notes?: undefined;
        } | {
            name: string;
            description: string;
            parameters: {
                payload: string;
                step?: undefined;
                mode?: undefined;
            };
            notes: string;
            modes?: undefined;
            fieldInfluence?: undefined;
        })[];
        deprecated: {
            name: string;
            description: string;
        }[];
        forbidden: {
            name: string;
            description: string;
        }[];
    };
    nodeKinds: {
        relic: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
        amber: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
        active: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
        fossil: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
        ghost: {
            name: string;
            description: string;
            behavior: string;
            usage: string;
            warning: string;
        };
        plankton: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
        environment: {
            name: string;
            description: string;
            behavior: string;
            example: string;
        };
    };
    nodeFlags: {
        concept: string;
        interpretation: {
            note: string;
            decoding: string;
        };
        flags: {
            authority: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            freshness: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            catalyst: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            ephemeral: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            sticky: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            volatile: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            hot: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            frozen: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            hub: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
            isolated: {
                bit: number;
                value: string;
                name: string;
                scent: string;
                effect: string;
                triggers: string[];
            };
        };
        examples: {
            flags: string;
            binary: string;
            meaning: string;
            interpretation: string;
        }[];
        guidance: string;
    };
    contribution: {
        philosophy: string;
        dataStructure: {
            tags: {
                purpose: string;
                description: string;
                guidance: string;
                example: string[];
                constraint: string;
                ownership: string;
            };
            summary: {
                purpose: string;
                description: string;
                guidance: string;
                example: string;
                ownership: string;
            };
            payload: {
                purpose: string;
                description: string;
                guidance: string;
                example: {
                    content: string;
                    links: string[];
                    ref_url: string;
                    notes: string;
                };
                linksGuidance: string;
                ownership: string;
            };
            note: {
                title: string;
                description: string;
            };
        };
        tagging: {
            philosophy: string;
            decomposition: {
                description: string;
                method: string[];
                result: string;
            };
            options: {
                selfTagging: {
                    description: string;
                    guidance: string;
                    responsibility: string;
                };
                pipelineTagging: {
                    description: string;
                    guidance: string;
                    responsibility: string;
                };
            };
            bestPractices: string[];
        };
        capsuleStructure: {
            topTier: {
                description: string;
                guidance: string;
                maxCount: number;
            };
            normalNodes: {
                description: string;
                guidance: string;
                maxCount: number;
            };
            ghostNodes: {
                description: string;
                guidance: string;
                maxCount: number;
            };
        };
        capsuleExample: {
            description: string;
            idFormat: string;
            example: {
                topTier: {
                    tags: string[];
                    summary: string;
                    payload: {
                        content: string;
                        links: string[];
                        ref_url: string;
                    };
                    flags: number;
                }[];
                normalNodes: {
                    tags: string[];
                    summary: string;
                    payload: {
                        content: string;
                        links: string[];
                    };
                    flags: number;
                }[];
                ghostNodes: {
                    tags: string[];
                    summary: string;
                    payload: {
                        content: string;
                    };
                    flags: number;
                }[];
                evaluations: {
                    nodeId: string;
                    score: number;
                    context: string;
                }[];
            };
            note: string;
        };
        bestPractices: string[];
        antiPatterns: string[];
    };
    pipeline: {
        overview: string;
        stages: {
            name: string;
            role: string;
            description: string;
            outcome: string;
        }[];
        timing: string;
        failure: string;
    };
    constraints: {
        capsule: {
            maxTopTier: number;
            maxNormal: number;
            maxGhost: number;
            maxPayloadBytes: number;
            maxSummaryLength: number;
            maxRefUrlLength: number;
            maxLinks: number;
        };
        energy: {
            initial: number;
            warningThreshold: number;
            costs: {
                sense: number;
                move: number;
                focus: number;
                warp: number;
                evaluate: number;
                emitBus: number;
            };
            philosophy: string;
        };
        session: {
            maxDurationSeconds: number;
            warningBeforeExpiry: number;
            disconnectGraceSeconds: number;
            disconnectWarningSeconds: number;
        };
        incarnation: {
            eligibleKinds: readonly ["active", "amber", "relic"];
            ineligibleKinds: readonly ["fossil", "ghost", "plankton"];
            quality: {
                minSummaryLength: number;
                minTagCount: number;
                maxTagCount: number;
                requiredFields: readonly ["tags", "summary"];
            };
            prohibited: {
                patterns: readonly ["spam", "duplicate", "placeholder", "test123"];
                description: string;
            };
        };
        entry: {
            minQueryLength: number;
            maxQueryLength: number;
            minTagCount: number;
            maxTagCount: number;
            maxTagLength: number;
        };
    };
    taboos: {
        name: string;
        consequence: string;
        description: string;
    }[];
    wisdom: {
        failure: string;
        departure: string;
        mirror: string;
    };
    closing: string;
};
/**
 * Get constraints only (for validation)
 */
export declare function getConstraints(): {
    capsule: {
        maxTopTier: number;
        maxNormal: number;
        maxGhost: number;
        maxPayloadBytes: number;
        maxSummaryLength: number;
        maxRefUrlLength: number;
        maxLinks: number;
    };
    energy: {
        initial: number;
        warningThreshold: number;
        costs: {
            sense: number;
            move: number;
            focus: number;
            warp: number;
            evaluate: number;
            emitBus: number;
        };
        philosophy: string;
    };
    session: {
        maxDurationSeconds: number;
        warningBeforeExpiry: number;
        disconnectGraceSeconds: number;
        disconnectWarningSeconds: number;
    };
    incarnation: {
        eligibleKinds: readonly ["active", "amber", "relic"];
        ineligibleKinds: readonly ["fossil", "ghost", "plankton"];
        quality: {
            minSummaryLength: number;
            minTagCount: number;
            maxTagCount: number;
            requiredFields: readonly ["tags", "summary"];
        };
        prohibited: {
            patterns: readonly ["spam", "duplicate", "placeholder", "test123"];
            description: string;
        };
    };
    entry: {
        minQueryLength: number;
        maxQueryLength: number;
        minTagCount: number;
        maxTagCount: number;
        maxTagLength: number;
    };
};
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
export declare const CAPSULE_CONSTRAINTS: {
    maxTopTier: number;
    maxNormal: number;
    maxGhost: number;
    maxPayloadBytes: number;
    maxSummaryLength: number;
    maxRefUrlLength: number;
    maxLinks: number;
};
export declare const ENERGY_CONSTRAINTS: {
    initial: number;
    warningThreshold: number;
    costs: {
        sense: number;
        move: number;
        focus: number;
        warp: number;
        evaluate: number;
        emitBus: number;
    };
    philosophy: string;
};
export declare const SESSION_CONSTRAINTS: {
    maxDurationSeconds: number;
    warningBeforeExpiry: number;
    disconnectGraceSeconds: number;
    disconnectWarningSeconds: number;
};
export declare const INCARNATION_CONSTRAINTS: {
    eligibleKinds: readonly ["active", "amber", "relic"];
    ineligibleKinds: readonly ["fossil", "ghost", "plankton"];
    quality: {
        minSummaryLength: number;
        minTagCount: number;
        maxTagCount: number;
        requiredFields: readonly ["tags", "summary"];
    };
    prohibited: {
        patterns: readonly ["spam", "duplicate", "placeholder", "test123"];
        description: string;
    };
};
export declare const ENTRY_CONSTRAINTS: {
    minQueryLength: number;
    maxQueryLength: number;
    minTagCount: number;
    maxTagCount: number;
    maxTagLength: number;
};
/**
 * Get human-readable summary
 */
export declare function getRulebookSummary(): string;
//# sourceMappingURL=index.d.ts.map