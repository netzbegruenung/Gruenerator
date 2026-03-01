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

RUN apk add --no-cache curl

# Remove default nginx config
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Custom nginx config: SPA routing + API reverse proxy
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Docker DNS resolver (re-resolve container IPs after restarts)
    resolver 127.0.0.11 valid=10s ipv6=off;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    # Cache static assets (Vite hashed filenames)
    location ~* \.(css|js|map|jpe?g|gif|png|webp|svg|ico|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Reverse proxy API requests to the backend service
    # SSE streaming requires buffering off + long timeouts
    location /api/ {
        set $upstream_api http://api:3001;
        proxy_pass $upstream_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_set_header X-Forwarded-Host $host;

        # SSE streaming support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # SPA fallback — serve index.html for client-side routing
    location / {
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

# Copy built frontend from builder
COPY --from=builder /app/apps/gruen-o-mat/dist /usr/share/nginx/html

# Verify build output
RUN ls -la /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
