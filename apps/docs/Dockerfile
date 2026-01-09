# Multi-stage Dockerfile for Grünerator Docs
# Optimized for Coolify deployment

# ============================================================================
# Stage 1: Base - Install dependencies
# ============================================================================
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy all workspace packages
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/docs ./apps/docs

# Install all dependencies
RUN pnpm install --frozen-lockfile

# ============================================================================
# Stage 2: Builder - Build the frontend
# ============================================================================
FROM base AS builder

WORKDIR /app/apps/docs

# Build the Vite app
RUN pnpm build

# Verify build output
RUN ls -la dist/

# ============================================================================
# Stage 3: Production - Run the server
# ============================================================================
FROM node:20-alpine AS production

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy necessary workspace packages
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/docs/package.json ./apps/docs/package.json
COPY apps/docs/server.ts ./apps/docs/server.ts
COPY apps/docs/tsconfig.json ./apps/docs/tsconfig.json

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built frontend from builder stage
COPY --from=builder /app/apps/docs/dist ./apps/docs/dist

# Set working directory to docs
WORKDIR /app/apps/docs

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOCUSPOCUS_PORT=1240
ENV HOCUSPOCUS_HOST=0.0.0.0

# Expose ports
EXPOSE 3000
EXPOSE 1240

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the production server
CMD ["pnpm", "start:prod"]
