# Gruen-O-Mat Frontend Dockerfile
# Multi-stage: Vite build → nginx with API reverse proxy
#
# Build context: repository root (../..)
# Usage: docker build -f apps/gruen-o-mat/Dockerfile .

# =============================================================================
# Stage 1: Build the Vite frontend
# =============================================================================
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace configuration (layer caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json tsconfig.strict-migration.json ./

# Copy package.json files for workspace resolution
COPY packages/chat/package.json ./packages/chat/
COPY apps/gruen-o-mat/package.json ./apps/gruen-o-mat/

# Install only gruen-o-mat + transitive workspace deps
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/gruen-o-mat...

# Copy source (changes here don't bust the install cache)
COPY packages/chat ./packages/chat
COPY apps/gruen-o-mat ./apps/gruen-o-mat

# Build the frontend
RUN pnpm --filter @gruenerator/gruen-o-mat build

# =============================================================================
# Stage 2: Production nginx server with API reverse proxy
# =============================================================================
FROM nginx:alpine AS production

LABEL org.opencontainers.image.title="Gruen-O-Mat"
LABEL org.opencontainers.image.description="Public Green Party Q&A Bot Frontend"
LABEL org.opencontainers.image.source="https://github.com/netzbegruenung/Gruenerator"

RUN apk add --no-cache curl gettext apache2-utils

# Remove default nginx config
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy nginx config template (envsubst substitutes ${API_BASE_URL} at startup)
COPY apps/gruen-o-mat/nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy entrypoint script
COPY apps/gruen-o-mat/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built frontend from builder
COPY --from=builder /app/apps/gruen-o-mat/dist /usr/share/nginx/html

# Verify build output
RUN ls -la /usr/share/nginx/html/

# Default API target — backward-compatible with the 3-service docker-compose.yml
ENV API_BASE_URL=http://api:3001

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
