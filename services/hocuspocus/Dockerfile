# Gruenerator Hocuspocus Server Dockerfile
# Multi-stage: builder compiles TS, production runs compiled JS with node

# =============================================================================
# Stage 1: Builder - Install deps and compile TypeScript
# =============================================================================
FROM node:22-slim AS builder

RUN corepack enable

WORKDIR /app

# Copy workspace config + base tsconfigs (contracts/shared tsconfigs extend tsconfig.base.json)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# pnpm validates every `patchedDependencies` entry in pnpm-workspace.yaml
# before it installs anything, so the patch files have to be in the image
# even when the patched package is outside this filter's closure.
COPY patches ./patches
COPY tsconfig.base.json tsconfig.strict-migration.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/query/package.json ./packages/query/
COPY packages/core/package.json ./packages/core/
COPY packages/contracts/package.json ./packages/contracts/
COPY services/hocuspocus/package.json ./services/hocuspocus/

# Install dependencies (trailing ... pulls workspace deps: @gruenerator/shared, @gruenerator/contracts)
# --node-linker overrides pnpm-workspace.yaml's nodeLinker: hoisted (kept because Metro/RN in
# apps/mobile needs it). The hoisted linker materializes the ENTIRE lockfile
# regardless of --filter — 4799 packages / 4.5 GB for every scope, which is what
# made a cold image build take ~1 h. --shamefully-hoist keeps the flat
# node_modules layout the workspace relies on, built only from the filtered
# closure. See #2924.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --node-linker=isolated --shamefully-hoist \
        --filter @gruenerator/hocuspocus...

# Copy source and compile
COPY packages/shared ./packages/shared
COPY packages/query ./packages/query
COPY packages/core ./packages/core
COPY packages/contracts ./packages/contracts
COPY services/hocuspocus ./services/hocuspocus

# Compile query (shared re-exports @gruenerator/query/*; must build first)
WORKDIR /app/packages/query
RUN pnpm exec tsc --project tsconfig.json

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
FROM node:22-alpine AS production

LABEL org.opencontainers.image.title="Gruenerator Hocuspocus"
LABEL org.opencontainers.image.description="Real-time collaborative editing WebSocket server"
LABEL org.opencontainers.image.source="https://github.com/netzbegruenung/Gruenerator"
LABEL org.opencontainers.image.vendor="netzbegruenung"

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user and /app directory with correct ownership.
# .cache is created here on purpose: the install below mounts a cache at
# .cache/pnpm, and BuildKit would otherwise create that parent as root and leave
# corepack unable to write its own .cache/node next to it (EACCES on mkdir).
RUN addgroup -g 1001 gruenerator && \
    adduser -u 1001 -G gruenerator -s /bin/sh -D gruenerator && \
    mkdir -p /app /home/gruenerator/.cache && \
    chown gruenerator:gruenerator /app /home/gruenerator/.cache

# Install pnpm
RUN corepack enable

WORKDIR /app

# Copy workspace config and lockfile
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=gruenerator:gruenerator /app/package.json ./
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-lock.yaml ./
COPY --from=builder --chown=gruenerator:gruenerator /app/patches ./patches

# Copy package.json files for workspace structure (needed for pnpm to resolve workspace deps)
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/query/package.json ./packages/query/
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/contracts/package.json ./packages/contracts/
COPY --from=builder --chown=gruenerator:gruenerator /app/services/hocuspocus/package.json ./services/hocuspocus/

# Switch to non-root user before install (files written as gruenerator, no chown needed)
USER gruenerator

# Install production dependencies only (trailing ... pulls workspace deps)
# --node-linker is as load-bearing here as in the builder above, and for the
# same reason. See the note at the matching line in apps/api/Dockerfile: #3351
# moved nodeLinker: hoisted from .npmrc (which no production stage copies) into
# pnpm-workspace.yaml (which every production stage copies), so --filter stopped
# restricting anything. This image went 109 MB -> 1453 MB, installing Expo,
# Metro, Tauri and Docusaurus into a server with no cross-package deps at all.
# The second mount is from the same bump: pnpm 12 caches a full packument per
# lockfile entry under ~/.cache/pnpm while verifying the supply-chain policies,
# 2.4 GB of registry JSON that was being baked into the image because only the
# store was mounted. See the longer note in apps/api/Dockerfile.
RUN --mount=type=cache,id=pnpm-prod,target=/home/gruenerator/.local/share/pnpm/store,uid=1001,gid=1001 \
    --mount=type=cache,id=pnpm-prod-meta,target=/home/gruenerator/.cache/pnpm,uid=1001,gid=1001 \
    pnpm install --prod --frozen-lockfile --node-linker=isolated --shamefully-hoist \
        --filter @gruenerator/hocuspocus...

# Copy compiled workspace packages. The package.json files already ship with
# the correct runtime exports map (`"default": "./dist/*.js"`), so Node's
# resolution picks `default` in prod (the `development` condition is dev-only).
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/query/dist ./packages/query/dist
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
