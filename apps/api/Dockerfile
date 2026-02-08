# Gruenerator API Backend Dockerfile
# Multi-stage: builder validates TS, production runs with tsx

# =============================================================================
# Stage 1: Builder - Install deps and compile TypeScript
# =============================================================================
FROM node:20-slim AS builder

# Install build dependencies for native modules
# Note: @napi-rs/canvas uses pre-built binaries, no Cairo/Pango needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json tsconfig.strict-migration.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/api...

# Copy source and compile (validates TypeScript)
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

WORKDIR /app/apps/api
RUN pnpm exec tsc --project tsconfig.json

# =============================================================================
# Stage 2: Production - Fresh install with pnpm
# =============================================================================
FROM node:20-slim AS production

LABEL org.opencontainers.image.title="Gruenerator API"
LABEL org.opencontainers.image.source="https://github.com/netzbegruenung/Gruenerator"

# Runtime dependencies only - NO build tools needed
# @napi-rs/canvas uses pre-built binaries with embedded dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    fontconfig \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 gruenerator && \
    useradd -u 1001 -g gruenerator -s /bin/bash -m gruenerator

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config and lockfile for pnpm
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Copy package.json files for workspace structure
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/api/package.json ./apps/api/

# Install all dependencies (tsx is needed to run TypeScript)
# @napi-rs/canvas uses pre-built binaries - no rebuild needed
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/api...

# Copy shared package source (needed for workspace resolution at runtime)
COPY --from=builder /app/packages/shared ./packages/shared

# Copy API source (tsx runs TypeScript directly)
COPY --from=builder /app/apps/api ./apps/api

# Set working directory to API
WORKDIR /app/apps/api

# Create runtime directories
RUN mkdir -p uploads logs && chown -R gruenerator:gruenerator /app

ENV NODE_ENV=production
ENV PORT=3001

USER gruenerator

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["pnpm", "exec", "tsx", "--import", "./lib/instrument.ts", "server.ts"]
