# Sphere Explorers — HF Spaces Dockerfile
# Multi-stage build: Node.js (phi-agent) + Python (Gradio UI)
#
# Build context: repository root
#   docker build -f Dockerfile.hf -t sphere-explorers .

# === Stage 1: Build phi-agent ===
FROM node:20-slim AS phi-build
WORKDIR /build
COPY phi-agent/package*.json ./
RUN npm ci --omit=dev
COPY phi-agent/tsconfig.json ./
COPY phi-agent/src/ ./src/
RUN npx tsc

# === Stage 2: Runtime (Python + Node.js) ===
FROM python:3.11-slim

# Install Node.js
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies
COPY explorers/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Explorers (Gradio app)
COPY explorers/*.py ./explorers/

# phi-agent (pre-built)
COPY --from=phi-build /build/dist ./phi-agent/dist
COPY --from=phi-build /build/node_modules ./phi-agent/node_modules
COPY --from=phi-build /build/package.json ./phi-agent/

# Bundled generation data (fixed, read-only)
COPY phi-agent/data/generations/gen-005.json ./phi-agent/data/generations/gen-005.json
COPY phi-agent/data/generations/gen-011.json ./phi-agent/data/generations/gen-011.json
COPY phi-agent/data/species-profile.json ./phi-agent/data/species-profile.json

ENV PHI_AGENT_DIR=/app/phi-agent
ENV LLM_BACKEND=huggingface
ENV HF_MODEL=google/gemma-2-2b-it

# HF Spaces uses port 7860
EXPOSE 7860

WORKDIR /app/explorers
CMD ["python", "app.py"]
