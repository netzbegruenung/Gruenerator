# Gruenerator Web Frontend Dockerfile
# Multi-stage build: Vite build -> nginx static serving

# =============================================================================
# Stage 1: Build the frontend
# =============================================================================
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace configuration first (for better caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.strict-migration.json ./

# Copy all workspace packages that web depends on
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Copy root files needed by web build (CHANGELOG.md for Changelog component)
COPY CHANGELOG.md ./

# Install ALL dependencies (pnpm hoists to root node_modules)
RUN pnpm install --frozen-lockfile

# Build environment variables (can be overridden at build time)
ARG VITE_API_BASE_URL=/api
ARG VITE_APP_ENV=production
ARG VITE_MAINTENANCE_MODE=false
ARG VITE_SENTRY_DSN
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_ENV=$VITE_APP_ENV
ENV VITE_MAINTENANCE_MODE=$VITE_MAINTENANCE_MODE
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

# Build the frontend
RUN pnpm --filter @gruenerator/web build

# =============================================================================
# Stage 2: Production nginx server
# =============================================================================
FROM nginx:alpine AS production

# OCI Image Labels
LABEL org.opencontainers.image.title="Gruenerator Web"
LABEL org.opencontainers.image.description="Gruenerator Frontend Application"
LABEL org.opencontainers.image.source="https://github.com/netzbegruenung/Gruenerator"
LABEL org.opencontainers.image.vendor="netzbegruenung"
LABEL org.opencontainers.image.licenses="MIT"

# Install curl for healthcheck
RUN apk add --no-cache curl

# Remove default nginx config
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy custom nginx config for SPA
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    # Cache static assets
    location ~* \.(css|js|map|jpe?g|gif|png|svg|ico|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # SPA fallback - serve index.html for client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Copy built frontend
COPY --from=builder /app/apps/web/build /usr/share/nginx/html

# Verify build output
RUN ls -la /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
