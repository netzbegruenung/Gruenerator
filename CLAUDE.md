# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Grünerator is an AI-powered content creation platform for the German Green Party (Die Grünen). It's a pnpm monorepo with web, mobile, and desktop clients sharing a common backend. All infrastructure is EU-hosted for data sovereignty.

## Commands

All commands run from the **repository root** using pnpm + Turborepo:

```bash
pnpm install                  # Install all dependencies
pnpm dev:web                  # Frontend dev server (localhost:5173)
pnpm dev:backend              # Backend dev server (requires Postgres, Redis, Keycloak)
pnpm build                    # Build all packages
pnpm build:web                # Build web only
pnpm typecheck                # TypeScript check across all packages
pnpm lint                     # ESLint across all packages
pnpm format:check             # Prettier check
pnpm ci                       # Full CI: typecheck + lint + format:check + test
pnpm test                     # Run all tests
```

Single workspace commands:
```bash
pnpm --filter @gruenerator/api test:auth         # Run auth tests
pnpm --filter @gruenerator/api test:integration  # Run integration tests
pnpm --filter @gruenerator/desktop dev           # Tauri desktop dev
```

## Architecture

### Monorepo Layout

- **`apps/web`** — React 19 + Vite 7 frontend. Feature-sliced design with ~27 feature modules in `src/features/`. Routes defined in `src/config/routes.ts`.
- **`apps/api`** — Express 5 backend running in Node.js cluster mode. AI calls are offloaded to a dedicated worker pool (`workers/aiWorkerPool.ts`). Routes in `routes/`, business logic in `services/`.
- **`apps/mobile`** — Expo 54 / React Native app with Expo Router.
- **`apps/desktop`** — Tauri 2 wrapper around the web frontend.
- **`packages/shared`** — Shared stores (Zustand), hooks, API clients, and feature modules (sharepic, image-studio, subtitle-editor, tiptap-editor, media-library, search).
- **`services/mcp`** — Model Context Protocol server.
- **`services/comfyui`** — ComfyUI workflows for local GPU image generation.

### Data Stores

- **PostgreSQL** — Primary DB. Schema at `apps/api/database/postgres/schema.sql`.
- **Redis** — Sessions, caching, rate limiting.
- **Qdrant** — Vector embeddings for semantic search.

### Authentication

Keycloak OIDC via Passport.js. Supports multiple identity providers (.de, .at, .eu domains). Sessions stored in Redis.

### AI Providers

- **Mistral AI** — Primary text generation (EU-hosted).
- **Anthropic Claude via AWS Bedrock** — "Ultra" mode (EU region).
- **Flux (Black Forest Labs)** — Image generation.
- **AssemblyAI / Gladia** — Audio transcription.

## Development Conventions

### Styling

**No Tailwind or CSS frameworks.** Use plain CSS with CSS variables.

- Design tokens: `apps/web/src/assets/styles/common/variables.css`
- Global styles: `apps/web/src/assets/styles/common/`
- Component styles: `apps/web/src/assets/styles/components/`
- Feature styles: co-located in `apps/web/src/features/**/*.css`
- Dark mode: `[data-theme="dark"]` attribute selectors with CSS variable overrides
- Always test UI changes in both light and dark modes

### State Management

Zustand for global state. TanStack Query (React Query v5) for server state/data fetching with axios.

### Commits

Conventional Commits enforced by commitlint: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, etc.

### TypeScript

Strict mode. The entire stack is TypeScript — frontend, backend, shared packages, and mobile.

### Code Quality

ESLint (flat config), Prettier, Husky pre-commit hooks (lint-staged), Knip for unused code detection.

## Deployment

### Test Environment
- **Test URL**: https://beta.gruenerator.de
- **Server**: gruenerator-test.netzbegruenung.verdigado.net
- **Branch**: `test-branch`

### Docker Images
- **Workflow**: "Build and Push Docker Images" (`build-images.yml`)
  - Triggers on push to `master` or `test-branch` (when app/service files change)
  - Manual dispatch with `force_all: true` to rebuild everything
  - Individual services: `build_web`, `build_api`, `build_docs`, `build_mcp`, `build_doku`
  - Registry: `ghcr.io/netzbegruenung/gruenerator-{web,api,docs,mcp,doku}`

### Deploying to Test
1. Merge changes into `test-branch` (e.g. via PR from `master`)
2. Build images run automatically on push, or trigger manually: `gh workflow run "Build and Push Docker Images" --ref test-branch`
3. Deploy runs automatically on push, or trigger manually: `gh workflow run "Deploy to Test Environment" --ref test-branch`
4. Deploy always force-recreates containers (`--force-recreate`)

### Production
- **Workflow**: "Deploy to Production" (`deploy-prod.yml`)
- **Branch**: `master`
