# Gruenerator MCP Server Dockerfile
# Multi-stage: builder compiles TS, production runs compiled JS with node

# =============================================================================
# Stage 1: Builder - Install deps and compile TypeScript
# =============================================================================
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.strict-migration.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/mcp/package.json ./services/mcp/

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/mcp...

# Copy source and compile
COPY packages/shared ./packages/shared
COPY services/mcp ./services/mcp

# Compile shared package (MCP imports @gruenerator/shared at runtime)
RUN pnpm --filter @gruenerator/shared build

# Compile MCP server
WORKDIR /app/services/mcp
RUN pnpm exec tsc --project tsconfig.build.json

# =============================================================================
# Stage 2: Production - Fresh install with production deps only
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

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config and lockfile (--chown avoids slow chown -R later)
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=gruenerator:gruenerator /app/package.json ./
COPY --from=builder --chown=gruenerator:gruenerator /app/pnpm-lock.yaml ./

# Copy package.json files for workspace structure
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=gruenerator:gruenerator /app/services/mcp/package.json ./services/mcp/

# Install production dependencies only (no tsx, typescript, @types/*, etc.)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --filter @gruenerator/mcp...

# Fix ownership of pnpm-installed node_modules
RUN chown -R gruenerator:gruenerator node_modules packages/shared/node_modules services/mcp/node_modules 2>/dev/null; true

# Copy compiled shared package (resolves @gruenerator/shared imports at runtime)
COPY --from=builder --chown=gruenerator:gruenerator /app/packages/shared/dist ./packages/shared/dist
# Redirect shared package exports from ./src/*.ts to ./dist/*.js for Node.js
RUN sed -i 's|"\./src/\(.*\)\.ts"|"./dist/\1.js"|g' packages/shared/package.json

# Copy compiled MCP server
COPY --from=builder --chown=gruenerator:gruenerator /app/services/mcp/dist ./services/mcp/dist

# Set working directory to MCP service
WORKDIR /app/services/mcp

# Environment
ENV NODE_ENV=production
ENV PORT=3004

# Run as non-root user
USER gruenerator

EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3004/health || exit 1

CMD ["node", "dist/index.js"]
