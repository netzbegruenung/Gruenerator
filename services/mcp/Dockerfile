# Gruenerator MCP Server Dockerfile
# Multi-stage build for the Model Context Protocol server

# =============================================================================
# Stage 1: Build/Type-check
# =============================================================================
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.strict-migration.json ./

# Copy shared package (dependency)
COPY packages/shared ./packages/shared

# Copy MCP service
COPY services/mcp ./services/mcp

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @gruenerator/mcp...

# Build shared package
RUN pnpm --filter @gruenerator/shared build

# Type-check MCP server (build script runs tsc with noEmit)
RUN pnpm --filter @gruenerator/mcp build

# =============================================================================
# Stage 2: Production runtime
# =============================================================================
FROM node:20-slim AS production

# OCI Image Labels
LABEL org.opencontainers.image.title="Gruenerator MCP Server"
LABEL org.opencontainers.image.description="MCP Server for Green Party Programs (Germany & Austria)"
LABEL org.opencontainers.image.source="https://github.com/netzbegruenung/Gruenerator"
LABEL org.opencontainers.image.vendor="netzbegruenung"
LABEL org.opencontainers.image.licenses="MIT"

# MCP Discovery Labels
LABEL mcp.discoverable="true"
LABEL mcp.transport="streamable-http"
LABEL mcp.endpoint="/mcp"

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1001 gruenerator && \
    useradd -u 1001 -g gruenerator -s /bin/bash -m gruenerator

WORKDIR /app

# Copy workspace config and lock file
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Copy shared package (built)
COPY --from=builder /app/packages/shared ./packages/shared

# Copy MCP service source (tsx runs TypeScript directly)
COPY --from=builder /app/services/mcp ./services/mcp

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Set working directory to mcp service
WORKDIR /app/services/mcp

# Environment
ENV NODE_ENV=production
ENV PORT=3004

# Run as non-root user
USER gruenerator

EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3004/health || exit 1

# Use tsx to run TypeScript directly (installed as devDependency)
CMD ["npx", "tsx", "src/index.ts"]
