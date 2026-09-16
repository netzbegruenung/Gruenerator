# Gruenerator API Backend Dockerfile
# Multi-stage: builder compiles TS, production runs compiled JS with node

# =============================================================================
# Stage 1: Builder - Install deps and compile TypeScript
# =============================================================================
FROM node:22-slim AS builder

# Install build dependencies for native modules
# Note: @napi-rs/canvas uses pre-built binaries, no Cairo/Pango needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Copy workspace config
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
COPY apps/api/package.json ./apps/api/

# Install dependencies

# --node-linker overrides pnpm-workspace.yaml's nodeLinker: hoisted (kept because Metro/RN in
# apps/mobile needs it). The hoisted linker materializes the ENTIRE lockfile
# regardless of --filter — 4799 packages / 4.5 GB for every scope, which is what
# made a cold image build take ~1 h. --shamefully-hoist keeps the flat
# node_modules layout the workspace relies on, built only from the filtered
# closure. See #2924.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --node-linker=isolated --shamefully-hoist \
        --filter @gruenerator/api...

# Copy source and compile
COPY packages/shared ./packages/shared
COPY packages/query ./packages/query
COPY packages/core ./packages/core
COPY packages/contracts ./packages/contracts
COPY services/hocuspocus ./services/hocuspocus
COPY apps/api ./apps/api

# Compile query package (shared re-exports @gruenerator/query/*; must build first)
WORKDIR /app/packages/query
RUN pnpm exec tsc --project tsconfig.json

# Compile core package (shared re-exports @gruenerator/core; must build first)
WORKDIR /app/packages/core
RUN pnpm exec tsc --project tsconfig.json

# Compile shared package (API imports @gruenerator/shared/utils at runtime)
WORKDIR /app/packages/shared
RUN pnpm exec tsc --project tsconfig.json

# Compile contracts package (API imports @gruenerator/contracts at runtime)
WORKDIR /app/packages/contracts
RUN pnpm exec tsc --project tsconfig.json

# Compile hocuspocus (API imports @gruenerator/hocuspocus at runtime)
WORKDIR /app/services/hocuspocus
RUN pnpm exec tsc --project tsconfig.build.json

# Compile API (needs extra heap for large codebase)
WORKDIR /app/apps/api
RUN NODE_OPTIONS="--max-old-space-size=8192" pnpm exec tsc --project tsconfig.build.json

# Copy non-TS assets into dist/ (tsc only emits .js/.js.map files)
# These are referenced via __dirname-relative paths at runtime
# - Dirs WITHOUT tsc output: rm + cp (clean copy)
# - Dirs WITH tsc output (config, database): merge via cp -rT to avoid nesting
#   (cp -r X dist/X nests as dist/X/X/ when dist/X/ already exists from tsc)
RUN rm -rf dist/prompts dist/public dist/assets && \
    cp -r prompts dist/prompts && \
    cp -rT config dist/config && \
    cp -rT database dist/database && \
    cp -r public dist/public && \
    cp -r assets dist/assets

# =============================================================================
# Stage 2: Production - Fresh install with production deps only
# =============================================================================
FROM node:22-slim AS production

LABEL org.opencontainers.image.title="Gruenerator API"
LABEL org.opencontainers.image.source="https://github.com/netzbegruenung/Gruenerator"

# Runtime dependencies only - NO build tools needed
# @napi-rs/canvas uses pre-built binaries with embedded dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    fontconfig \
    fonts-dejavu-core \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user and /app directory with correct ownership.
# .cache is created here on purpose: the install below mounts a cache at
# .cache/pnpm, and BuildKit would otherwise create that parent as root and leave
# corepack unable to write its own .cache/node next to it (EACCES on mkdir).
RUN groupadd -g 1001 gruenerator && \
    useradd -u 1001 -g gruenerator -s /bin/bash -m gruenerator && \
    mkdir -p /app /home/gruenerator/.cache && \
    chown gruenerator:gruenerator /app /home/gruenerator/.cache

# Install pnpm
RUN corepack enable

WORKDIR /app

# Copy workspace config and lockfile for pnpm (--chown avoids slow chown -R later)
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=gruenerator:gruenerator /app/package.json ./
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-lock.yaml ./
COPY --from=builder --chown=gruenerator:gruenerator /app/patches ./patches

# Copy package.json files for workspace structure
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/query/package.json ./packages/query/
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/contracts/package.json ./packages/contracts/
COPY --from=builder --chown=gruenerator:gruenerator /app/services/hocuspocus/package.json ./services/hocuspocus/
COPY --from=builder --chown=gruenerator:gruenerator /app/apps/api/package.json ./apps/api/

# Switch to non-root user before install (files written as gruenerator, no chown needed)
USER gruenerator

# Install production dependencies only (no tsx, typescript, @types/*, etc.)
# --node-linker is as load-bearing here as in the builder above, and for the
# same reason: hoisted materializes the ENTIRE lockfile and --filter restricts
# nothing. This stage got pnpm's isolated default for free until #3351, because
# the only place that said `node-linker=hoisted` was .npmrc -- which no
# production stage copies. #3351 moved the setting into pnpm-workspace.yaml,
# which every production stage DOES copy, so the filtered prod install silently
# became a whole-workspace one: 634 MB -> 1589 MB here, 109 MB -> 1453 MB for
# hocuspocus, with Expo, Metro, Tauri and Docusaurus in the runtime images. The
# build stayed green the whole time, which is why nothing caught it.
#
# The second mount is from the same bump. pnpm's supply-chain policies
# (minimumReleaseAge, trustPolicy) verify every one of the ~4200 lockfile
# entries, and pnpm 12 caches the full packument for each under ~/.cache/pnpm --
# 2.4 GB of registry JSON (715 MB metadata + 1.7 GB metadata-full), where pnpm
# 10 left 24.7 MB. Only the STORE was mounted, so all of it was landing in the
# image: it alone accounted for the whole remaining install layer once the
# linker fix was in. Mount it and it is cached between builds instead of shipped.
# uid/gid because this stage installs as gruenerator, not root.
RUN --mount=type=cache,id=pnpm-prod,target=/home/gruenerator/.local/share/pnpm/store,uid=1001,gid=1001 \
    --mount=type=cache,id=pnpm-prod-meta,target=/home/gruenerator/.cache/pnpm,uid=1001,gid=1001 \
    pnpm install --prod --frozen-lockfile --node-linker=isolated --shamefully-hoist \
        --filter @gruenerator/api...

# Copy compiled workspace packages. The package.json files already ship with
# the correct runtime exports map (`"default": "./dist/*.js"`), so no rewrite
# is needed — prod Node resolution falls through the `development` condition
# (not active here) and hits `default`, which points at the compiled dist.
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/query/dist ./packages/query/dist
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder --chown=gruenerator:gruenerator /app/services/hocuspocus/dist ./services/hocuspocus/dist

# Copy compiled API with bundled assets
COPY --from=builder --chown=gruenerator:gruenerator /app/apps/api/dist ./apps/api/dist

# Set working directory to API
WORKDIR /app/apps/api

# Symlink assets at WORKDIR level for code using process.cwd()-relative paths
RUN ln -s dist/config config && \
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

CMD ["node", "--import", "./dist/instrument.js", "dist/server.js"]
