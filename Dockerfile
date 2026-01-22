# Grünerator Production Dockerfile
# Multi-stage build for frontend + backend

# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Install dependencies and build
RUN pnpm install --frozen-lockfile --filter @gruenerator/web --filter @gruenerator/shared
RUN pnpm --filter @gruenerator/shared build
RUN pnpm --filter @gruenerator/web build

# Stage 2: Build backend
FROM node:22-alpine AS backend-builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @gruenerator/api --filter @gruenerator/shared --prod

# Stage 3: Production image
FROM node:22-alpine AS production

WORKDIR /app

# Install runtime dependencies and create user
RUN apk add --no-cache ffmpeg \
    && addgroup -g 1001 -S gruenerator \
    && adduser -S gruenerator -u 1001 -G gruenerator

# Copy built frontend
COPY --from=frontend-builder /app/apps/web/build ./public

# Copy backend with dependencies
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/packages ./packages
COPY --from=backend-builder /app/apps/api ./apps/api

# Set working directory to backend
WORKDIR /app/apps/api

# Environment
ENV NODE_ENV=production
ENV PORT=3001

# Run as non-root user
USER gruenerator

EXPOSE 3001

CMD ["node", "server.mjs"]
