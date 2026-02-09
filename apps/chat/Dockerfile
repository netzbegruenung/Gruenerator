# Gruenerator Chat Dockerfile
# Multi-stage build for Next.js app with monorepo workspace dependencies

# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy lockfile and workspace config first (better layer caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files for dependency caching
COPY packages/shared/package.json ./packages/shared/
COPY packages/chat/package.json ./packages/chat/
COPY apps/chat/package.json ./apps/chat/

# Install dependencies for chat and its workspace deps
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @gruenerator/apps-chat...

# Copy source
COPY packages/shared ./packages/shared
COPY packages/chat ./packages/chat
COPY apps/chat ./apps/chat

# Build
WORKDIR /app/apps/chat
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm build

# =============================================================================
# Stage 2: Production (lightweight)
# =============================================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build (monorepo structure preserved)
COPY --from=builder /app/apps/chat/public ./apps/chat/public
COPY --from=builder /app/apps/chat/.next/standalone ./
COPY --from=builder /app/apps/chat/.next/static ./apps/chat/.next/static
COPY --from=builder /app/apps/chat/agents ./apps/chat/agents

USER nextjs

EXPOSE 3210

ENV PORT=3210
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/chat/server.js"]
