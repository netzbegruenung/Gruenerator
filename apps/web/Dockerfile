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
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json tsconfig.strict-migration.json ./

# Copy only package.json files needed by pnpm filter (better layer caching)
COPY packages/shared/package.json ./packages/shared/
COPY packages/docs/package.json ./packages/docs/
COPY packages/chat/package.json ./packages/chat/
COPY packages/voice/package.json ./packages/voice/
COPY packages/canvas-editor/package.json ./packages/canvas-editor/
COPY packages/ui/package.json ./packages/ui/
COPY packages/collab/package.json ./packages/collab/
COPY packages/wolke/package.json ./packages/wolke/
COPY packages/slides/package.json ./packages/slides/
COPY apps/web/package.json ./apps/web/

# Install only web + transitive workspace deps (not all ~6 workspaces)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/web...

# Copy source (changes here don't bust the install cache)
COPY packages/shared ./packages/shared
COPY packages/docs ./packages/docs
COPY packages/chat ./packages/chat
COPY packages/voice ./packages/voice
COPY packages/canvas-editor ./packages/canvas-editor
COPY packages/ui ./packages/ui
COPY packages/collab ./packages/collab
COPY packages/wolke ./packages/wolke
COPY packages/slides ./packages/slides
COPY apps/web ./apps/web
COPY CHANGELOG.md ./

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

    # Hashed assets under /assets/ — cache forever
    # Vite outputs all content-hashed files here (js, css, images, fonts)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Everything else (index.html, config.js, manifest.json, SW, illustrations)
    # no-cache = store but revalidate via ETag → efficient 304 responses
    location / {
        add_header Cache-Control "no-cache";
        try_files $uri /index.html;
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
