# Gruenerator Hocuspocus Server Dockerfile
# Multi-stage: builder compiles TS, production runs compiled JS with node

# =============================================================================
# Stage 1: Builder - Install deps and compile TypeScript
# =============================================================================
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config + base tsconfigs (contracts/shared tsconfigs extend tsconfig.base.json)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.strict-migration.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY packages/contracts/package.json ./packages/contracts/
COPY services/hocuspocus/package.json ./services/hocuspocus/

# Install dependencies (trailing ... pulls workspace deps: @gruenerator/shared, @gruenerator/contracts)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/hocuspocus...

# Copy source and compile
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY packages/contracts ./packages/contracts
COPY services/hocuspocus ./services/hocuspocus

# Compile contracts (shared depends on it)
WORKDIR /app/packages/contracts
RUN pnpm exec tsc --project tsconfig.json

# Compile core (shared re-exports @gruenerator/core; must build first)
WORKDIR /app/packages/core
RUN pnpm exec tsc --project tsconfig.json

# Compile shared (hocuspocus imports @gruenerator/shared/yjs at runtime)
WORKDIR /app/packages/shared
RUN pnpm exec tsc --project tsconfig.json

# Compile hocuspocus
WORKDIR /app/services/hocuspocus
RUN pnpm exec tsc --project tsconfig.build.json

# =============================================================================
# Stage 2: Production - Fresh install with production deps only
# =============================================================================
FROM node:20-alpine AS production

LABEL org.opencontainers.image.title="Gruenerator Hocuspocus"
LABEL org.opencontainers.image.description="Real-time collaborative editing WebSocket server"
LABEL org.opencontainers.image.source="https://github.com/netzbegruenung/Gruenerator"
LABEL org.opencontainers.image.vendor="netzbegruenung"

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user and /app directory with correct ownership
RUN addgroup -g 1001 gruenerator && \
    adduser -u 1001 -G gruenerator -s /bin/sh -D gruenerator && \
    mkdir -p /app && chown gruenerator:gruenerator /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config and lockfile
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=gruenerator:gruenerator /app/package.json ./
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-lock.yaml ./

# Copy package.json files for workspace structure (needed for pnpm to resolve workspace deps)
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/contracts/package.json ./packages/contracts/
COPY --from=builder --chown=gruenerator:gruenerator /app/services/hocuspocus/package.json ./services/hocuspocus/

# Switch to non-root user before install (files written as gruenerator, no chown needed)
USER gruenerator

# Install production dependencies only (trailing ... pulls workspace deps)
RUN --mount=type=cache,id=pnpm-prod,target=/home/gruenerator/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --filter @gruenerator/hocuspocus...

# Copy compiled workspace packages. The package.json files already ship with
# the correct runtime exports map (`"default": "./dist/*.js"`), so Node's
# resolution picks `default` in prod (the `development` condition is dev-only).
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/contracts/dist ./packages/contracts/dist

# Copy compiled server
COPY --from=builder --chown=gruenerator:gruenerator /app/services/hocuspocus/dist ./services/hocuspocus/dist

# Set working directory
WORKDIR /app/services/hocuspocus

# Environment
ENV NODE_ENV=production
ENV HOCUSPOCUS_PORT=1240
ENV HOCUSPOCUS_HOST=0.0.0.0
ENV HEALTH_PORT=1241

EXPOSE 1240 1241

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:1241/health || exit 1

CMD ["node", "dist/main.js"]
