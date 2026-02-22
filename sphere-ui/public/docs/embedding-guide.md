# Embedding Model Guide

Recommendations for embedding models, performance characteristics, and scaling considerations.

---

## Current Implementation

| Property | Value |
|----------|-------|
| Model | `all-MiniLM-L6-v2` |
| Dimensions | 384 |
| Model Size | ~23 MB |
| Provider | `transformers.js` (local ONNX) or Hugging Face Inference API |
| Config | `periphery.parser.embeddingProvider: "local"` |

The embedding model converts text (tags + summary + content) into a 384-dimensional vector. This vector determines a node's **position** in semantic space, which drives all spatial operations: sense, scanL1, explore, move, warp.

---

## Model Recommendations

### For Standalone / HF Space (CPU Only)

| Model | Dims | Size | Speed (CPU) | Quality | Best For |
|-------|------|------|-------------|---------|----------|
| **`all-MiniLM-L6-v2`** | 384 | 23MB | ~10ms | Good | **Default. Best balance of size/speed/quality** |
| `all-MiniLM-L12-v2` | 384 | 33MB | ~20ms | Good+ | Slightly better quality, same dimensions |
| `bge-small-en-v1.5` | 384 | 33MB | ~12ms | Good+ | English-only, strong benchmark scores |

### For Multi-Language

| Model | Dims | Size | Speed (CPU) | Quality | Best For |
|-------|------|------|-------------|---------|----------|
| `multilingual-e5-small` | 384 | 118MB | ~15ms | Good | Japanese/Chinese/Korean + English |
| `paraphrase-multilingual-MiniLM-L12-v2` | 384 | 118MB | ~20ms | Good | 50+ languages |

### For GPU Environments

| Model | Dims | Size | Speed (GPU) | Quality | Best For |
|-------|------|------|-------------|---------|----------|
| `nomic-embed-text-v1.5` | 768 | 137MB | ~5ms | Excellent | High-quality semantic search |
| `bge-large-en-v1.5` | 1024 | 335MB | ~8ms | Excellent | English, maximum precision |

**Note**: Changing dimensions (384 → 768 or 1024) requires updating `physical_constants.dimension` in `sphere.config.json` and `periphery.parser.vectorDimension`. All spatial calculations, movement, and perception scale with dimension count.

---

## Choosing the Right Model

### Decision Tree

```
Is your Sphere multilingual?
  ├── Yes → multilingual-e5-small (384d, 118MB)
  └── No
        ├── Do you have a GPU?
        │     ├── Yes → nomic-embed-text-v1.5 (768d)
        │     └── No
        │           ├── Is size critical? (HF Space, edge device)
        │           │     ├── Yes → all-MiniLM-L6-v2 (23MB) ← DEFAULT
        │           │     └── No → all-MiniLM-L12-v2 (33MB)
        └── (Custom domain) → Fine-tune on domain data
```

### Key Trade-offs

| Factor | Smaller Model | Larger Model |
|--------|-------------|-------------|
| Startup time | Seconds | 10-30 seconds |
| Memory per node | 1.5 KB (384d) | 3 KB (768d) / 4 KB (1024d) |
| Search quality | Good for general text | Better for nuanced similarity |
| Batch speed | Fast | Slower (especially CPU) |
| HF Space compatible | Yes | Maybe (2GB RAM limit) |

---

## Performance & Scaling

### Per-Node Memory Cost

| Dimensions | Float32 per vector | Per Node (vector + metadata) |
|-----------|-------------------|------------------------------|
| 384 | 1,536 bytes | ~6.5 KB |
| 768 | 3,072 bytes | ~8 KB |
| 1024 | 4,096 bytes | ~9.5 KB |

### Scaling by Node Count

| Nodes | Memory (384d) | Memory (768d) | Explore O(n) Time |
|-------|-------------|-------------|-------------------|
| 1,000 | ~6 MB | ~8 MB | <10ms |
| 10,000 | ~65 MB | ~80 MB | ~50ms |
| 100,000 | ~650 MB | ~800 MB | ~500ms |
| 1,000,000 | ~6.5 GB | ~8 GB | ~5s (needs index) |

**Bottleneck**: `/sphere/explore` performs full O(n) scan. Beyond 100k nodes, consider adding an approximate nearest neighbor (ANN) index.

### Scaling by Concurrent Agents

Sphere uses dynamic sampling to manage load:

| Agents | Sample Ratio | Effective DB Scan | sense() Limit |
|--------|-------------|-------------------|--------------|
| 1 | 100% | Full scan | 15 nodes |
| 4 | 71% | 71% of nodes | ~8 nodes |
| 10 | 56% | 56% of nodes | ~5 nodes |
| 25 | 45% | 45% of nodes | ~3 nodes |
| 100 | 32% | 32% of nodes | ~2 nodes |

Formula: `sampleRatio = 1 / agentCount^0.25` (minimum 20%)

### Server Architecture by Scale

| Phase | Concurrent | Architecture | Monthly Cost |
|-------|-----------|--------------|-------------|
| 0 | ~1k | Single server | ~$50 |
| 1 | ~10k | nginx LB + 2-3 servers | ~$500 |
| 2 | ~50k | + Redis session cluster | ~$3k |
| 3 | ~100k | 12 gateway servers + Core distribution | ~$5-10k |
| 4 | ~500k | Geographic distribution | $10k+ |

---

## Changing the Embedding Model

**WARNING**: Changing the model invalidates ALL existing vectors. Spatial relationships, search results, and agent perception break completely.

### Procedure

1. **Stop Sphere** (or ensure dormancy)

2. **Update config**:
   ```json
   {
     "physical_constants": {
       "dimension": 384
     },
     "periphery": {
       "parser": {
         "vectorDimension": 384,
         "embeddingProvider": "local"
       }
     }
   }
   ```
   Update `dimension` and `vectorDimension` if the new model has different dimensions.

3. **Clear existing data** — All nodes must be re-vectorized with the new model

4. **Re-populate** — Use `POST /sphere/contribute` (batch mode) to re-inject all data. The new model will generate fresh vectors.

5. **Verify** — Test with `/sphere/explore` to confirm search quality

### Future: sphere-wizard upgrade

```bash
sphere-wizard upgrade --model all-MiniLM-L12-v2
```

This will automate: backup → re-vectorize → verify → swap. Not yet implemented.

---

## Vectorization Pipeline

```
Input text (tags + summary + content)
    ↓
EntryBuffer.vectorize(text)
    ↓
transformers.js / HF Inference API
    ↓
384-dim float32 vector
    ↓
Stored in ProjectionDB (spatial index)
```

### What Gets Vectorized

| Tier | Vectorized | Reason |
|------|-----------|--------|
| topTier | Yes | Full semantic positioning in 384D space |
| normalNodes | No | Lightweight; positioned near parent capsule |
| ghostNodes | No | Too volatile to justify compute cost |

### Batch Processing

Vectorization is batched for efficiency:
- `periphery.parser.batchSize`: 7 (default)
- `periphery.parser.flushTimeoutMs`: 1000ms
- Batch fills up OR timeout triggers → process batch

---

*Last updated: 2026-02-07*
