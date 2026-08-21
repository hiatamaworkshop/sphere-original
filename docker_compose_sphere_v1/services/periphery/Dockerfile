FROM node:20-slim AS builder

# --- Build renalCore first (periphery depends on file:../renalCore) ---
WORKDIR /renalCore
COPY renalCore/package*.json ./
RUN npm ci
COPY renalCore/ ./
RUN npm run build

# --- Build periphery ---
WORKDIR /app
COPY periphery/package*.json ./
RUN npm ci
COPY periphery/ ./
RUN npm run build

# --- Production stage ---
FROM node:20-slim

WORKDIR /renalCore
COPY --from=builder /renalCore/package*.json ./
COPY --from=builder /renalCore/dist/ ./dist/

WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ ./dist/

EXPOSE 3001

CMD ["node", "dist/index.js"]
