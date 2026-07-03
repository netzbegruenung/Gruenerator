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
COPY packages/core/package.json ./packages/core/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/docs/package.json ./packages/docs/
COPY packages/chat/package.json ./packages/chat/
COPY packages/voice/package.json ./packages/voice/
COPY packages/canvas-editor/package.json ./packages/canvas-editor/
COPY packages/ui/package.json ./packages/ui/
COPY packages/collab/package.json ./packages/collab/
COPY packages/wolke/package.json ./packages/wolke/
COPY packages/sites/package.json ./packages/sites/
COPY packages/sites-design/package.json ./packages/sites-design/

COPY apps/web/package.json ./apps/web/

# Install only web + transitive workspace deps (not all ~6 workspaces)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/web...

# Copy source (changes here don't bust the install cache)
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY packages/contracts ./packages/contracts
COPY packages/docs ./packages/docs
COPY packages/chat ./packages/chat
COPY packages/voice ./packages/voice
COPY packages/canvas-editor ./packages/canvas-editor
COPY packages/ui ./packages/ui
COPY packages/collab ./packages/collab
COPY packages/wolke ./packages/wolke
COPY packages/sites ./packages/sites
COPY packages/sites-design ./packages/sites-design

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
# Stage 2: Compile ngx_brotli as a dynamic module against nginx:alpine
# =============================================================================
# nginx:alpine ships its own nginx binary (built from source by Docker Inc.),
# not Alpine's `nginx` package — so Alpine's `nginx-mod-http-brotli` is ABI-
# incompatible. The supported way to add Brotli is to fetch the matching
# nginx source and build ngx_brotli against it, then copy the .so files
# into the production image. The build stage is throwaway; only ~150 KB of
# .so files land in the final image.
FROM nginx:alpine AS brotli-builder
# brotli-dev provides libbrotlienc / libbrotlicommon headers + static libs.
# Recent ngx_brotli versions link against the system libs at the .so step
# (not the bundled deps/brotli/ submodule the configure step sees), so
# without brotli-dev the linker fails with "cannot find -lbrotlienc".
RUN apk add --no-cache git build-base libtool automake autoconf \
    zlib-dev pcre2-dev openssl-dev linux-headers cmake wget brotli-dev
RUN NGINX_VERSION=$(nginx -v 2>&1 | grep -oE '[0-9.]+$') && \
    wget -q "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" && \
    tar -xzf "nginx-${NGINX_VERSION}.tar.gz" && \
    git clone --recursive https://github.com/google/ngx_brotli.git && \
    cd "nginx-${NGINX_VERSION}" && \
    ./configure --with-compat --add-dynamic-module=../ngx_brotli && \
    make -j"$(nproc)" modules && \
    mkdir -p /modules && \
    cp objs/ngx_http_brotli_filter_module.so /modules/ && \
    cp objs/ngx_http_brotli_static_module.so /modules/

# =============================================================================
# Stage 3: Production nginx server
# =============================================================================
FROM nginx:alpine AS production

# OCI Image Labels
LABEL org.opencontainers.image.title="Gruenerator Web"
LABEL org.opencontainers.image.description="Gruenerator Frontend Application"
LABEL org.opencontainers.image.source="https://github.com/netzbegruenung/Gruenerator"
LABEL org.opencontainers.image.vendor="netzbegruenung"
LABEL org.opencontainers.image.licenses="MIT"

# Install curl for healthcheck. brotli-libs is the runtime shared library
# the ngx_brotli .so files dlopen at nginx startup — without it nginx
# would fail to load the module with "libbrotlienc.so.1: not found".
RUN apk add --no-cache curl brotli-libs

# Install compiled Brotli modules + load them in the main context.
# load_module directives must appear before events/http blocks, so we
# inject them at the top of /etc/nginx/nginx.conf right after `pid`.
COPY --from=brotli-builder /modules/*.so /usr/lib/nginx/modules/
RUN sed -i '/^pid /a load_module /usr/lib/nginx/modules/ngx_http_brotli_filter_module.so;\nload_module /usr/lib/nginx/modules/ngx_http_brotli_static_module.so;' /etc/nginx/nginx.conf

# Remove default nginx config
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy custom nginx config for SPA
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Brotli compression. Negotiated via Accept-Encoding: br; browsers that
    # only send gzip still hit the gzip path below. On-the-fly compression
    # (no pre-compressed .br files) — CPU cost is small for the modest
    # request rate, and avoids touching the Vite build pipeline.
    brotli on;
    brotli_comp_level 5;
    brotli_min_length 1024;
    brotli_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml font/woff2;

    # Gzip compression (fallback for clients that don't send Accept-Encoding: br)
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

    # Robot avatars — stable filenames (1.webp..13.webp) served from /public,
    # so they miss the hashed /assets/ rule. New avatars are added as new ids
    # (never overwriting an existing one), so caching them immutable is safe and
    # makes repeat loads a zero-byte (disk-cache) hit.
    location /images/profileimages/ {
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
