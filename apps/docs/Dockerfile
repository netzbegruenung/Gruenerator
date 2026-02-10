# Gruenerator Docs Dockerfile
# Multi-stage: builder compiles TS + Vite, production runs compiled JS with node

# =============================================================================
# Stage 1: Builder - Install deps, build Vite app, compile server TS
# =============================================================================
FROM node:20-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy lockfile and workspace config first (better layer caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

# Copy only package.json files first for dependency caching
COPY packages/shared/package.json ./packages/shared/
COPY packages/docs/package.json ./packages/docs/
COPY apps/docs/package.json ./apps/docs/

# Install only docs and its transitive workspace deps
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/apps-docs...

# Copy source files (including web for CSS imports)
COPY packages/shared ./packages/shared
COPY packages/docs ./packages/docs
COPY apps/web/src/assets/styles ./apps/web/src/assets/styles
COPY apps/docs ./apps/docs

# Build the Vite app
WORKDIR /app/apps/docs
RUN pnpm build

# Compile server TS → JS (server-dist/server.js)
RUN pnpm exec tsc --project tsconfig.server.json

# =============================================================================
# Stage 2: Production runtime (lightweight)
# =============================================================================
FROM node:20-slim AS production

LABEL org.opencontainers.image.title="Gruenerator Docs"
LABEL org.opencontainers.image.description="Gruenerator Documentation App"
LABEL org.opencontainers.image.source="https://github.com/netzbegruenung/Gruenerator"

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

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

# Install production dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --filter @gruenerator/apps-docs

# Fix ownership of pnpm-installed node_modules
RUN chown -R gruenerator:gruenerator node_modules packages/shared/node_modules apps/docs/node_modules 2>/dev/null; true

# Copy Vite-built frontend
COPY --from=builder --chown=gruenerator:gruenerator /app/apps/docs/dist ./apps/docs/dist

# Copy compiled server
COPY --from=builder --chown=gruenerator:gruenerator /app/apps/docs/server-dist ./apps/docs/server-dist

WORKDIR /app/apps/docs

ENV NODE_ENV=production
ENV PORT=3000

USER gruenerator

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server-dist/server.js"]
