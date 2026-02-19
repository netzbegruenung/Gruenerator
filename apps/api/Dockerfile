# Gruenerator API Backend Dockerfile
# Multi-stage: builder compiles TS, production runs compiled JS with node

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
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.strict-migration.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/hocuspocus/package.json ./services/hocuspocus/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/api...

# Copy source and compile
COPY packages/shared ./packages/shared
COPY services/hocuspocus ./services/hocuspocus
COPY apps/api ./apps/api

# Compile shared package (API imports @gruenerator/shared/utils at runtime)
WORKDIR /app/packages/shared
RUN pnpm exec tsc --project tsconfig.json

# Compile hocuspocus (API imports @gruenerator/hocuspocus at runtime)
WORKDIR /app/services/hocuspocus
RUN pnpm exec tsc --project tsconfig.build.json

# Compile API
WORKDIR /app/apps/api
RUN pnpm exec tsc --project tsconfig.json

# Copy non-TS assets into dist/ (tsc only emits .js/.js.map files)
# These are referenced via __dirname-relative paths at runtime
# - Dirs WITHOUT tsc output: rm + cp (clean copy)
# - Dirs WITH tsc output (config, database): merge via cp -rT to avoid nesting
#   (cp -r X dist/X nests as dist/X/X/ when dist/X/ already exists from tsc)
RUN rm -rf dist/prompts dist/static-data dist/public dist/assets && \
    cp -r prompts dist/prompts && \
    cp -r static-data dist/static-data && \
    cp -rT config dist/config && \
    cp -rT database dist/database && \
    cp -r public dist/public && \
    cp -r assets dist/assets

# =============================================================================
# Stage 2: Production - Fresh install with production deps only
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
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user and /app directory with correct ownership
RUN groupadd -g 1001 gruenerator && \
    useradd -u 1001 -g gruenerator -s /bin/bash -m gruenerator && \
    mkdir -p /app && chown gruenerator:gruenerator /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config and lockfile for pnpm (--chown avoids slow chown -R later)
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=gruenerator:gruenerator /app/package.json ./
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-lock.yaml ./

# Copy package.json files for workspace structure
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=gruenerator:gruenerator /app/services/hocuspocus/package.json ./services/hocuspocus/
COPY --from=builder --chown=gruenerator:gruenerator /app/apps/api/package.json ./apps/api/

# Switch to non-root user before install (files written as gruenerator, no chown needed)
USER gruenerator

# Install production dependencies only (no tsx, typescript, @types/*, etc.)
RUN --mount=type=cache,id=pnpm-prod,target=/home/gruenerator/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --filter @gruenerator/api...

# Copy compiled shared package (resolves @gruenerator/shared/* imports at runtime)
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/shared/dist ./packages/shared/dist
# Redirect shared package exports from ./src/*.ts to ./dist/*.js for Node.js
RUN sed -i 's|"\./src/\(.*\)\.ts"|"./dist/\1.js"|g' packages/shared/package.json

# Copy compiled hocuspocus package (resolves @gruenerator/hocuspocus imports at runtime)
COPY --from=builder --chown=gruenerator:gruenerator /app/services/hocuspocus/dist ./services/hocuspocus/dist
RUN sed -i 's|"\./src/\(.*\)\.ts"|"./dist/\1.js"|g' services/hocuspocus/package.json

# Copy compiled API with bundled assets
COPY --from=builder --chown=gruenerator:gruenerator /app/apps/api/dist ./apps/api/dist

# Set working directory to API
WORKDIR /app/apps/api

# Symlink assets at WORKDIR level for code using process.cwd()-relative paths
RUN ln -s dist/static-data static-data && \
    ln -s dist/config config && \
    ln -s dist/public public

# Create runtime directories owned by app user
RUN mkdir -p uploads logs

# Symlink uploads/logs inside dist/ for code using __dirname-relative paths
# (compiled JS runs from dist/, so __dirname resolves inside dist/)
RUN ln -s /app/apps/api/uploads dist/uploads && \
    ln -s /app/apps/api/logs dist/logs

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
