# Sphere Standalone Dockerfile
# For Render / Hugging Face Spaces deployment (no PostgreSQL/Redis needed)
#
# Build context: repository root
#   docker build -f Dockerfile.standalone -t sphere-standalone .

# === Stage 1: Build ===
FROM node:20-alpine AS build
WORKDIR /build

# Build renalCore first (periphery depends on it via file: reference)
COPY docker_compose_sphere_v1/services/renalCore/ ./services/renalCore/
WORKDIR /build/services/renalCore
RUN npm ci && npm run build

# Build periphery
WORKDIR /build/services/periphery
COPY docker_compose_sphere_v1/services/periphery/package*.json ./
RUN npm ci
COPY docker_compose_sphere_v1/services/periphery/ ./
RUN npm run build

# === Stage 2: Production ===
FROM node:20-alpine
WORKDIR /app

# Copy built artifacts
COPY --from=build /build/services/periphery/dist ./dist
COPY --from=build /build/services/periphery/node_modules ./node_modules
COPY --from=build /build/services/periphery/package.json ./

# Copy renalCore dist (resolve file: dependency)
COPY --from=build /build/services/renalCore/dist ./node_modules/@sphere/renal-core/dist
COPY --from=build /build/services/renalCore/package.json ./node_modules/@sphere/renal-core/package.json

# Copy config (production overrides via env vars)
COPY docker_compose_sphere_v1/sphere.config.json ./config/sphere.config.json

# Copy UI static files
COPY sphere-ui/public/ ./public/
COPY docs/ ./public/docs/

ENV NODE_ENV=production
ENV SPHERE_CONFIG=./config/sphere.config.json
ENV STATIC_DIR=./public
ENV PORT=7860

# HF Spaces uses port 7860, Render uses $PORT env var
EXPOSE 7860

CMD ["node", "dist/index.js"]
