# Gruenerator Docs Dockerfile
# Multi-stage: builder compiles TS + Vite, production runs compiled JS with node

# =============================================================================
# Stage 1: Builder (Debian for native module compatibility)
# =============================================================================
FROM node:20-slim AS builder

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy lockfile and workspace config first (better layer caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.strict-migration.json ./

# Copy only package.json files first for dependency caching
COPY packages/shared/package.json ./packages/shared/
COPY packages/docs/package.json ./packages/docs/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/docs/package.json ./apps/docs/

# Install ALL workspace dependencies (shared uses deps from other packages)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source files (including web for CSS imports)
COPY packages/shared ./packages/shared
COPY packages/docs ./packages/docs
COPY apps/api ./apps/api
COPY apps/web/src/assets/styles ./apps/web/src/assets/styles
COPY apps/docs ./apps/docs

# Build the Vite app
WORKDIR /app/apps/docs
RUN pnpm build

# Compile server TS → JS (server-dist/docs/server.js + server-dist/api/...)
RUN pnpm exec tsc --project tsconfig.server.json

# =============================================================================
# Stage 2: Production runtime (lightweight - no build tools needed)
# =============================================================================
FROM node:20-slim AS production

LABEL org.opencontainers.image.title="Gruenerator Docs"
LABEL org.opencontainers.image.description="Gruenerator Documentation App"
LABEL org.opencontainers.image.source="https://github.com/netzbegruenung/Gruenerator"

# Install only runtime dependencies (no build tools!)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

# Create non-root user
RUN groupadd -g 1001 gruenerator && \
    useradd -u 1001 -g gruenerator -s /bin/bash -m gruenerator

WORKDIR /app

# Copy workspace config and lockfile (--chown avoids slow chown -R later)
COPY --chown=gruenerator:gruenerator pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

# Copy only package.json files for production install
COPY --chown=gruenerator:gruenerator packages/shared/package.json ./packages/shared/
COPY --chown=gruenerator:gruenerator packages/docs/package.json ./packages/docs/
COPY --chown=gruenerator:gruenerator apps/docs/package.json ./apps/docs/
COPY --chown=gruenerator:gruenerator apps/api/package.json ./apps/api/

# Install production dependencies (include api for hocuspocus service deps)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --filter @gruenerator/apps-docs --filter @gruenerator/api

# Fix ownership of pnpm-installed node_modules
RUN chown -R gruenerator:gruenerator node_modules packages/shared/node_modules apps/api/node_modules apps/docs/node_modules 2>/dev/null; true

# Copy Vite-built frontend
COPY --from=builder --chown=gruenerator:gruenerator /app/apps/docs/dist ./apps/docs/dist

# Copy compiled server (replaces raw TS from apps/api/services, utils, database + server.ts)
COPY --from=builder --chown=gruenerator:gruenerator /app/apps/docs/server-dist ./apps/docs/server-dist

WORKDIR /app/apps/docs

ENV NODE_ENV=production
ENV PORT=3000
ENV HOCUSPOCUS_PORT=1240
ENV HOCUSPOCUS_HOST=0.0.0.0

USER gruenerator

EXPOSE 3000 1240

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server-dist/docs/server.js"]
