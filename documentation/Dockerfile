# Multi-stage build for the Docusaurus documentation site.
#
# Installs from the workspace's pnpm lockfile, NOT with a bare `npm install`.
# The old Dockerfile built from `context: ./documentation`, where no lockfile
# exists (the root `pnpm-lock.yaml` covers this package, and `package-lock.json`
# is gitignored repo-wide) — so `COPY package*.json` copied only the manifest
# and every build re-resolved the `^` ranges against the registry. Combined with
# `no-cache: true` in the workflow, that made each build a fresh dice roll.
#
# It came up on 2026-08-24: npm silently dropped the optional
# `lightningcss-linux-x64-musl` binary — `added 1323 packages` against master's
# 1324, no warning, exit 0. Docusaurus then failed with the misleading "your
# site must add the @docusaurus/faster package as a dependency", though it is
# declared; the real cause sat two `[cause]` levels down. The lockfile pins both
# musl variants, so `--frozen-lockfile` cannot lose one.

# Node 22, not 20: the lockfile install pulls undici 8.10 (root `pnpm.overrides`
# pins `undici: >=8.9.0`), which declares `engines: node >=22.19.0` and calls
# `worker_threads.markAsUncloneable` — a Node 22 API. On node:20-alpine that is
# `undefined`, and the docs build died three `[cause]` levels down in
# `@easyops-cn/docusaurus-search-local` → cheerio → undici with
# "webidl.util.markAsUncloneable is not a function". pnpm does not enforce
# `engines`, so the install stayed green. The docs-build.yml lane never saw it:
# it runs on setup-node 22.

# Cache busting argument for forced rebuilds
ARG CACHEBUST=1

FROM node:22-alpine AS builder

# Install pnpm — same activation as apps/web/Dockerfile
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Workspace configuration first (better layer caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./

# Only this package's manifest: documentation declares no workspace dependency,
# so the filtered install needs nothing else.
COPY documentation/package.json ./documentation/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/documentation...

# The native bundler binary is an OPTIONAL dependency: a resolver that skips it
# leaves the install green and fails much later behind a misleading message.
# Fail here instead, where the cause is still legible.
RUN node -e "require('/app/node_modules/lightningcss')" \
    || (echo 'lightningcss native binary missing — the install dropped an optional platform package' && exit 1)

# Copy source (changes here don't bust the install cache)
COPY documentation ./documentation

WORKDIR /app/documentation

# Build the static site
RUN pnpm run build

# Production stage - minimal nginx image
FROM nginx:alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Clean nginx directory to remove old files
RUN rm -rf /usr/share/nginx/html/*

# Copy built files to nginx web root
COPY --from=builder /app/documentation/build /usr/share/nginx/html

# Debug: List files to ensure they're copied correctly
RUN ls -la /usr/share/nginx/html/

# Remove default nginx config and copy our custom config
RUN rm /etc/nginx/conf.d/default.conf
COPY documentation/nginx.conf /etc/nginx/conf.d/default.conf

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
