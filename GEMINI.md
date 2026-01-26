# Grünerator - Project Context

## Project Overview

**Grünerator** is an AI-powered content creation platform built specifically for the German Green Party (Die Grünen). It enables users to generate political content (press releases, social media posts), create sharepics, and subtitle videos with domain-specific AI knowledge.

This is a **monorepo** managed with **pnpm workspaces**, containing a full-stack application with web, mobile, and desktop clients.

### Key Technologies

- **Frontend:** React 19, Vite 7, Zustand (state management).
- **Styling:** **Standard CSS with CSS Variables**. No frameworks like Tailwind or Bootstrap are used.
- **Backend:** Node.js, Express.js (Cluster mode), PostgreSQL, Redis, Keycloak (Auth), Qdrant (Vector DB).
- **AI:** Mistral AI (primary), Anthropic Claude (via Bedrock), Flux (Images), AssemblyAI (Transcription).
- **Mobile:** React Native (Expo).
- **Desktop:** Tauri (Rust + Web Frontend).
- **Package Manager:** pnpm.

## Architecture

The system follows a multi-tier architecture designed for data sovereignty (EU hosting) and scalability.

- **API (`apps/api`):** The core backend.
  - **Cluster Mode:** Uses Node.js `cluster` module for vertical scaling.
  - **AI Worker Pool:** Dedicated worker threads for non-blocking AI operations.
  - **Services:** Decoupled services for Auth, Database, Profiles, and specific AI tasks (Subtitler, Sharepic).
  - **Data Stores:** PostgreSQL (User/Content data), Redis (Sessions/Cache), Qdrant (Vector Embeddings).
- **Web Client (`apps/web`):** The primary user interface.
  - **Feature-Sliced Design:** Modular architecture.
  - **Real-time:** Y.js for collaborative editing.
- **Mobile App (`apps/mobile`):** Expo-based React Native app for iOS and Android.
- **Desktop App (`apps/desktop`):** Tauri wrapper around the web frontend for offline/native capabilities.

## Directory Structure

- `apps/`
  - `api/`: Backend Express server.
  - `web/`: Main React frontend.
  - `mobile/`: React Native (Expo) mobile app.
  - `desktop/`: Tauri desktop app.
  - `sites/`: Static sites/landing pages.
- `packages/`: Shared libraries (e.g., `@gruenerator/shared`).
- `services/`: Microservices, specifically `mcp` (Model Context Protocol).
- `docs/`: Documentation.

## Building and Running

The project uses `pnpm` for script management. Run these commands from the **root directory**.

### Installation

```bash
pnpm install
```

### Development

- **Web + Backend:**
  ```bash
  pnpm dev:web      # Starts frontend at localhost:5173
  pnpm dev:backend  # Starts backend at localhost:3000 (requires DBs running)
  ```
- **Mobile:**
  ```bash
  pnpm dev:mobile   # Starts Expo bundler
  ```
- **Desktop:**
  ```bash
  pnpm --filter @gruenerator/desktop dev # Starts Tauri dev environment
  ```

### Production Build

- **Web:** `pnpm build:web`
- **Desktop:** `pnpm build:desktop`
- **Shared:** `pnpm build:shared`

### Testing

- **Root:** `npm test` (Runs tests across packages)
- **Backend Auth:** `pnpm --filter @gruenerator/api test:auth`

## Development Conventions

- **Language:** TypeScript is used across the entire stack.
- **Styling:**
  - **NO Tailwind.** Use standard CSS files.
  - **Variables:** Use CSS variables defined in `apps/web/src/assets/styles/common/variables.css` for colors (`--primary-600`, `--secondary-600`), spacing, and theming.
  - **Structure:**
    - Global: `apps/web/src/assets/styles/common/`
    - Components: `apps/web/src/assets/styles/components/`
    - Features: `apps/web/src/features/**/*.css`
  - **Dark Mode:** Handled via `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` in `variables.css`.
- **Commits:** Follows Semantic Release/Conventional Commits (e.g., `feat:`, `fix:`, `chore:`).
- **Branching:** Create feature branches (`feature/name`) and PR to `main`.
- **State Management:** `zustand` is preferred for global state in frontend apps.
- **API Communication:** The backend exposes a REST API. Frontend uses `axios` or `tanstack-query` (implied from React context) for data fetching.

## Environment Setup

Ensure the following services are running locally or accessible:

1.  **PostgreSQL** (Port 5432)
2.  **Redis** (Port 6379)
3.  **Keycloak** (Auth Provider)
4.  **Qdrant** (Vector DB)

Copy `.env.example` to `.env` in `apps/api` and `apps/web` and configure secrets (API keys, DB credentials).
