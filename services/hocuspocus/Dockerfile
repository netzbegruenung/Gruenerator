# Gruenerator Hocuspocus Server Dockerfile
# Multi-stage: builder compiles TS, production runs compiled JS with node

# =============================================================================
# Stage 1: Builder - Install deps and compile TypeScript
# =============================================================================
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY services/hocuspocus/package.json ./services/hocuspocus/

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/hocuspocus...

# Copy source and compile
COPY services/hocuspocus ./services/hocuspocus

WORKDIR /app/services/hocuspocus
RUN pnpm exec tsc --project tsconfig.build.json

# =============================================================================
# Stage 2: Production - Fresh install with production deps only
# =============================================================================
FROM node:20-slim AS production

LABEL org.opencontainers.image.title="Gruenerator Hocuspocus"
LABEL org.opencontainers.image.description="Real-time collaborative editing WebSocket server"
LABEL org.opencontainers.image.source="https://github.com/netzbegruenung/Gruenerator"
LABEL org.opencontainers.image.vendor="netzbegruenung"

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1001 gruenerator && \
    useradd -u 1001 -g gruenerator -s /bin/bash -m gruenerator

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config and lockfile
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=gruenerator:gruenerator /app/package.json ./
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-lock.yaml ./

# Copy package.json for workspace structure
COPY --from=builder --chown=gruenerator:gruenerator /app/services/hocuspocus/package.json ./services/hocuspocus/

# Install production dependencies only
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --filter @gruenerator/hocuspocus

# Fix ownership of pnpm-installed node_modules
RUN chown -R gruenerator:gruenerator node_modules services/hocuspocus/node_modules 2>/dev/null; true

# Copy compiled server
COPY --from=builder --chown=gruenerator:gruenerator /app/services/hocuspocus/dist ./services/hocuspocus/dist

# Set working directory
WORKDIR /app/services/hocuspocus

# Environment
ENV NODE_ENV=production
ENV HOCUSPOCUS_PORT=1240
ENV HOCUSPOCUS_HOST=0.0.0.0
ENV HEALTH_PORT=1241

# Run as non-root user
USER gruenerator

EXPOSE 1240 1241

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:1241/health || exit 1

CMD ["node", "dist/main.js"]
