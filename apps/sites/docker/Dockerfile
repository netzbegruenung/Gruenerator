# Gruenerator Sites - Coolify-Ready Dockerfile
# Build context: repository root (../../..)

# Stage 1: Build the sites app
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/sites/package.json ./apps/sites/

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/sites...

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/sites ./apps/sites

# Build environment variables (baked at build time by Vite)
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

# Build the app
WORKDIR /app/apps/sites
RUN pnpm build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Install envsubst for runtime environment variable substitution
RUN apk add --no-cache gettext

# Copy built app to nginx
COPY --from=builder /app/apps/sites/dist /usr/share/nginx/html

# Copy nginx config template
COPY apps/sites/docker/nginx.conf /etc/nginx/templates/default.conf.template

# Copy entrypoint script
COPY apps/sites/docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Coolify injects PORT, default to 3000 (Coolify standard)
ENV PORT=3000
ENV API_BASE_URL=http://localhost:3001

# Expose the port (Coolify reads this)
EXPOSE 3000

# Health check for Coolify
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:${PORT}/health || exit 1

# Use custom entrypoint for env substitution at runtime
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
