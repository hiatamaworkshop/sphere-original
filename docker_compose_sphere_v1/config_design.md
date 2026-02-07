# Sphere Configuration Design
**Date**: 2026-01-30
**Purpose**: Centralize all hardcoded values into configuration

---

## Configuration Structure

### File: `sphere.config.json`

```json
{
  "metadata": {
    "sphere_name": "Sphere Genesis",
    "version": "0.3.0",
    "forked_from": "origin",
    "ethos": "Metabolism over Preservation"
  },

  "physical_constants": {
    "dimension": 1536,
    "gravity_constant": 0.1,
    "ambient_temperature": 0.5,
    "vacuum_decay": 0.01
  },

  "periphery": {
    "membrane": {
      "prohibited_patterns": ["<script>", "javascript:", "http://", "https://"],
      "tag_limit_bytes": 64
    },

    "parser": {
      "batch_size": 8,
      "flush_timeout_ms": 5000,
      "embedding_provider": "mock",
      "vector_dimension": 1536
    },

    "gatekeeper": {
      "max_nodes_per_capsule": 50,
      "max_top_tier_per_capsule": 5,
      "max_ghost_ratio": 0.4,
      "max_summary_length": 512
    },

    "tagger": {
      "top_tier_count": 3
    },

    "packer": {
      "tier_weights": {
        "top": 0.8,
        "normal": 0.5,
        "ghost": 0.2
      },
      "tier_ttls": {
        "top": 172800,
        "normal": 86400,
        "ghost": 3600
      },
      "standard_decay_coefficient": 0.05,
      "tier_flags": {
        "top": "0x0002",
        "normal": "0x0000",
        "ghost": "0x0000"
      },
      "initial_metrics": {
        "traversal": 0,
        "stay_time": 0
      }
    },

    "incarnation_buffer": {
      "batch_size": 8,
      "flush_interval_ms": 100
    },

    "server": {
      "port": 3001
    }
  },

  "renal_core": {
    "heartbeat": {
      "tick_interval_ms": 1000
    },

    "decay": {
      "alpha": 0.01,
      "heat_decay_factor": 0.02
    },

    "thresholds": {
      "amber_heat": 15,
      "amber_weight": 0.7,
      "fossil_heat": 0.5,
      "erosion_heat": 1.0,
      "ghost_heat": 0.5,
      "evaporation_heat": 0.01
    },

    "ghost": {
      "ttl_multiplier": 0.1
    },

    "spatial": {
      "grid_size": 0.1,
      "plankton_conversion_rate": 0.3,
      "fertility_decay_rate": 0.01
    },

    "links": {
      "spectral_link_interval": 5,
      "distance_threshold": 0.15,
      "flow_threshold": 8,
      "traversal_threshold": 10,
      "stay_time_threshold": 5,
      "branching_threshold": 3,
      "semantic_distance_threshold": 0.2,
      "node_defaults": {
        "weight": 0.1,
        "decay": 0.05,
        "ttl": 100,
        "flags": 0
      }
    },

    "hack_detection": {
      "traversal_threshold": 50,
      "stay_ratio_threshold": 0.1,
      "min_payload_length": 10
    },

    "pause": {
      "idle_threshold": 300,
      "erosion_boost": 2.0
    },

    "flags": {
      "physics_modifiers": {
        "Authority": {
          "decay_rate_multiplier": 0.95,
          "description": "decay減速"
        },
        "Freshness": {
          "heat_boost_multiplier": 1.2,
          "description": "heat増幅"
        },
        "Ephemeral": {
          "decay_rate_multiplier": 1.5,
          "description": "decay加速"
        },
        "Sticky": {
          "ttl_decay_multiplier": 0.8,
          "description": "ttl減衰に抵抗"
        },
        "Volatile": {
          "ttl_decay_multiplier": 1.3,
          "description": "高速蒸発"
        },
        "Hub": {
          "weight_multiplier": 1.1,
          "description": "weight増加"
        },
        "Frozen": {
          "decay_rate_multiplier": 0,
          "ttl_decay_multiplier": 0,
          "description": "代謝停止(Relic用)"
        }
      }
    }
  },

  "active_bus": {
    "enabled": false,
    "protocol": "AI_NATIVE",
    "max_payload_bytes": 64,
    "sampling_rate": 0.5
  },

  "crystallization_logic": {
    "amber_trigger_threshold": 0.8,
    "is_amber_enabled": true,
    "linking_sensitivity": 0.7,
    "constellation_limit": 10,
    "amber_erosion_rate": 0.01,
    "min_amber_heat": 1.0
  },

  "immersive_training": {
    "teacher_trace_retention": 0.8,
    "student_learning_rate": 0.1,
    "dojo_noise_level": 0.2
  },

  "interface_hint": {
    "rendering_mode": "point_cloud",
    "lod_distance": 1.0,
    "showcase_refresh_rate": 60
  }
}
```

---

## Implementation Plan

### Phase 1: Type Definitions
1. Update `stable_config.ts` with new sections
2. Create `PeripheryPackerConfig` interface
3. Create `RenalCoreFlagsConfig` interface

### Phase 2: Config Loading
1. Create config loader utility
2. Validate config on startup
3. Provide defaults for missing values

### Phase 3: Code Refactoring
1. **Packer**: Use `config.periphery.packer.*`
2. **RenalCore**: Use `config.renal_core.*`
3. **Physics**: Use `config.renal_core.flags.physics_modifiers`
4. **ParserBuffer**: Use `config.periphery.parser.vector_dimension`

### Phase 4: Documentation
1. Add comments for each config value
2. Document valid ranges
3. Provide tuning guidance

---

## Migration Checklist

- [ ] Update `stable_config.ts`
- [ ] Create default `sphere.config.json`
- [ ] Update `PeripheryConfig` interface
- [ ] Update `RenalCoreConfig` interface
- [ ] Refactor `Packer` to use config
- [ ] Refactor `RenalCore` to use config
- [ ] Refactor `physics.ts` to use config
- [ ] Update index.ts to load unified config
- [ ] Test with default config
- [ ] Test with custom config values

---

## Benefits

1. **No Magic Numbers**: すべての数値が明示的
2. **Easy Tuning**: 設定ファイル編集のみで調整可能
3. **Forkability**: ユーザーが独自設定でForkしやすい
4. **Documentation**: 設定値自体がドキュメント
5. **Testing**: 異なる設定でのテストが容易
6. **Version Control**: 設定の変更履歴を追跡可能

---

## Notes

- すべての数値は `sphere.config.json` から読み込み
- ハードコード禁止（CLAUDE.mdの鉄則）
- デフォルト値は stable_config.ts の DEFAULT_CONFIG で定義
- 型安全性を保つため、すべて TypeScript interfaceで定義
