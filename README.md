<div align="center">
  <img src="apps/web/public/images/gruenerator_logo_gruen.svg" alt="Grünerator" width="200"/>

# Grünerator

**The Green AI — AI-powered content creation for sustainable politics**

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Expo](https://img.shields.io/badge/Expo-57-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Mistral AI](https://img.shields.io/badge/Mistral-AI-FF7000?style=flat-square&logo=mistral&logoColor=white)](https://mistral.ai/)
[![License](https://img.shields.io/badge/license-Proprietary-blue?style=flat-square)](LICENSE.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](.github/CONTRIBUTING.md)

[Live Demo](https://gruenerator.de) · [Documentation](https://doku.gruenerator.eu/) · [Report Bug](https://github.com/netzbegruenung/Gruenerator/issues) · [Request Feature](https://github.com/netzbegruenung/Gruenerator/issues)

</div>

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Architecture](#architecture)
- [Monorepo Structure](#monorepo-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Usage](#usage)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## About

### The Problem

Political organizations need to create compelling, consistent content across multiple channels — press releases, social media graphics, video subtitles, and more. Traditional AI tools lack the specialized knowledge and ethical considerations required for political communication, and generic solutions don't understand party-specific terminology, style guides, or compliance requirements.

### The Solution

**Grünerator** is a purpose-built AI platform for members and supporters of the German and Austrian Green Parties. It combines state-of-the-art AI models with domain-specific knowledge to generate high-quality political content while maintaining transparency, privacy, and EU compliance.

### Pro-EU: Digital Sovereignty First

Grünerator is built on **100% European infrastructure** with a commitment to digital sovereignty:

| Principle                 | Implementation                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **100% EU Hosting**       | All servers located exclusively in the European Union                                                                              |
| **European AI Providers** | Mistral AI (France), Cortecs & Regolo (EU-hosted open models), Black Forest Labs (Germany), KugelAudio (Germany, speech synthesis) |
| **Self-hosted AI**        | Green-powered inference hosted by netzbegrünung e.V. and EU partners                                                               |
| **75% EU Target**         | Minimum 75% of spending with European companies                                                                                    |

### Key Features

| Feature              | Description                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| **Agentic AI Chat**  | Tool-using chat that searches the web, queries knowledge bases, and creates documents on demand |
| **Grüneratoren**     | Specialized generators for press releases, motions, social posts, speeches, and more            |
| **Office Suite**     | Collaborative Docs, Sheets, Presentations, and Boards with built-in AI editing                  |
| **Notebook Q&A**     | RAG-powered knowledge bases over party documents, websites, PDFs, and WordPress sources         |
| **Canvas Studio**    | Image editor for social media graphics with party branding (DE + AT corporate design)           |
| **Video Subtitler**  | AI transcription and styled subtitle export for social video                                    |
| **MCP Integrations** | Own MCP server plus user-managed MCP connectors with OAuth                                      |
| **Accessible PDFs**  | Tagged, barrier-free PDF generation straight from chat                                          |
| **Austrian Support** | de-AT is a first-class locale with Austrian Green party content and branding                    |
| **EU Compliance**    | GDPR-focused design with transparency guidelines                                                |

### Built With

<p>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Expo-57-000020?style=for-the-badge&logo=expo&logoColor=white" alt="Expo"/>
  <img src="https://img.shields.io/badge/Tauri-2-FFC131?style=for-the-badge&logo=tauri&logoColor=black" alt="Tauri"/>
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express"/>
  <img src="https://img.shields.io/badge/PostgreSQL-15+-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Redis-7+-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"/>
  <img src="https://img.shields.io/badge/Qdrant-Vector_DB-DC244C?style=for-the-badge" alt="Qdrant"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/Mistral-AI-FF7000?style=for-the-badge&logo=mistral&logoColor=white" alt="Mistral AI"/>
  <img src="https://img.shields.io/badge/Keycloak-OIDC-4D4D4D?style=for-the-badge&logo=keycloak&logoColor=white" alt="Keycloak"/>
</p>

---

## Features

### AI Chat & Grüneratoren

An agentic chat that goes beyond text generation:

- Tool-using agent loop: web search, knowledge-base retrieval, document creation in one conversation
- Creates presentations, spreadsheets, sharepics, and accessible (tagged) PDFs directly from chat
- Specialized **Grüneratoren** for press releases, motions (Anträge), social media posts, speeches, and accessible-language rewrites
- Chat folders, thread search/recall, shareable thread URLs, and recurring scheduled tasks
- Product self-knowledge: the chat can answer questions about Grünerator itself from the documentation

### Office Suite

Four collaborative editors sharing one document model:

- **Docs** — rich-text editor with real-time collaboration (Tiptap + Yjs)
- **Sheets** — spreadsheet editor (Univer) with AI-driven operations and .xlsx/.csv import
- **Presentations** — slide editor with party branding (DE + AT corporate design)
- **Boards** — task boards with AI-created cards
- A unified AI editor assistant works across all four surfaces

### Knowledge (Notebooks)

RAG-powered knowledge bases:

- Sources: uploaded files, websites, PDFs, and WordPress sites
- Cross-collection semantic search with reranking (Qdrant)
- Landesverband-specific notebooks with automated content sync
- Natural-language filtering and citation-backed answers

### Canvas / Image Studio

Create and edit branded social media graphics:

- Full canvas editor with layers, text, shapes, and multi-page documents
- AI-assisted content and image generation
- Quote cards, infographics, and campaign visuals with consistent party branding (DE and AT corporate design)
- Asset library with illustrations, icons, and templates

### Video Subtitler

Professional subtitle generation for videos:

- AI-powered transcription (EU-hosted providers)
- Multiple styling options and burned-in subtitle export
- Instagram/TikTok optimized formats
- Background processing with hardware-accelerated export

### Integrations

- **MCP Server** — Model Context Protocol server, served in-process by the API ([mcp.gruenerator.eu](https://mcp.gruenerator.eu)). Search across Green party programs DE/AT plus the signed-in user's own documents, boards, notebooks and groups; OAuth 2.1 login required.
- **User-managed MCP connectors** — connect third-party MCP servers to the chat, with OAuth support
- **System search sources** — Deutsche Bahn, weather, and news available as chat tools
- **Grüne Wolke** — Nextcloud integration for file storage and sharing
- **WordPress Plugin** — candidate sites for Green party WordPress installations

### Additional Features

- **Native Mobile App** — Expo / React Native app with full feature support
- **Desktop App** — Tauri 2 desktop application for Windows, macOS, and Linux
- **Sites Builder** — embedded candidate-site builder at `/sites`, powered by `packages/sites`
- **Grün-O-Mat** — political compass / decision-making tool
- **Monitor** — experimental media/topic monitoring
- **Real-time Collaboration** — Hocuspocus/Yjs-powered multi-user editing across the office suite
- **Custom Instructions** — personalized AI guidelines and organizational knowledge
- **Multi-domain Support** — .de, .at, .eu domains with locale-aware content
- **PWA Support** — install as native app on mobile devices

---

## Architecture

```
┌────────────────────────── CLIENTS ───────────────────────────┐
│  Web (React 19 + Vite)         │  Mobile (Expo / RN)         │
│  Desktop (Tauri 2)             │  WordPress Plugin           │
└───────────────────────────┬──────────────────────────────────┘
                            │ REST API (ts-rest) + SSE
┌───────────────────────────▼──────────────────────────────────┐
│                         BACKEND                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Express 5   │  │   Cluster    │  │    AI (in-process) │  │
│  │   Server     │──│   Workers    │──│ Mistral │ Regolo   │  │
│  │              │  │              │  │ GreenPT │ Scaleway │  │
│  └──────────────┘  └──────────────┘  │      Cortecs       │  │
│                                      └────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  ChatGraph   │  │  Keycloak    │  │    PostgreSQL      │  │
│  │  Agent Loop  │  │  OIDC SSO    │  │    Database        │  │
│  └──────────────┘  └──────────────┘  └────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │    Redis     │  │   Qdrant     │  │     MCP Server     │  │
│  │  Cache/PubSub│  │   Vectors    │  │ mcp.gruenerator.eu │  │
│  └──────────────┘  └──────────────┘  └────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
         │
┌────────▼─────────┐
│   Hocuspocus     │
│ (Yjs Realtime)   │
└──────────────────┘
```

`litellm` (Verdigado) is a retired alias rather than a backend: stored configs still naming it are read tolerantly and transparently remapped to Cortecs (`apps/api/services/ai/litellmRetired.ts`), so `LITELLM_API_KEY` remains an accepted, optional variable.

### Key Patterns

- **Cluster Mode + In-Process AI** — Express 5 runs in Node cluster mode across CPU cores; AI calls execute in-process through `services/ai/generate.ts` (no separate worker pool)
- **Agentic Chat Pipeline** — ChatGraph (classify → search → respond) with a tool-executing agent loop
- **RAG Pipeline** — Qdrant vector search with cross-collection dedup and reranking
- **Typed API Contracts** — ts-rest contracts + Zod schemas in `packages/contracts` as the single source of truth
- **Feature-Sliced Design** — modular frontend architecture with ~50 feature modules
- **Multi-Source SSO** — Keycloak with identity brokering (SAML/OIDC) across .de/.at/.eu

---

## Monorepo Structure

This is a **pnpm + Turborepo** monorepo: 6 apps, 16 packages, and 3 services.

### Apps

| Workspace          | Description                          |
| ------------------ | ------------------------------------ |
| `apps/web`         | React 19 + Vite frontend             |
| `apps/api`         | Express 5 backend + ChatGraph agents |
| `apps/mobile`      | Expo / React Native mobile app       |
| `apps/desktop`     | Tauri 2 desktop wrapper              |
| `apps/gruen-o-mat` | Political compass tool               |
| `apps/wordpress`   | WordPress plugin for candidate sites |

### Packages

| Workspace                | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `packages/chat`          | Shared chat UI, runtime adapters, composer configs       |
| `packages/shared`        | Shared stores, hooks, API clients, components            |
| `packages/contracts`     | ts-rest API contracts + Zod schemas (typed API boundary) |
| `packages/canvas-editor` | Config-driven react-konva image/canvas editor            |
| `packages/docs`          | Collaborative rich-text document editor (Tiptap)         |
| `packages/sheets`        | Spreadsheet editor (Univer) with AI operations           |
| `packages/presentations` | Presentation editor with party branding                  |
| `packages/collab`        | Shared Yjs collaboration components and hooks            |
| `packages/sites`         | Embedded candidate site builder                          |
| `packages/sites-design`  | Site builder design tokens + presentational components   |
| `packages/wolke`         | Grüne Wolke (Nextcloud) integration                      |
| `packages/voice`         | Voice input/synthesis utilities                          |
| `packages/query`         | Shared search/retrieval logic (text + vector)            |
| `packages/core`          | AI model catalog and shared core primitives              |
| `packages/ui`            | Shared UI component library                              |
| `packages/eslint-config` | Shared ESLint flat config                                |

### Services

| Workspace             | Description                                         |
| --------------------- | --------------------------------------------------- |
| `services/hocuspocus` | Real-time collaboration server (Yjs)                |
| `services/nlp`        | Python NLP enrichment for notebook content          |
| `services/nango`      | Self-hosted OAuth broker for third-party connectors |

User documentation lives in `documentation/` (Docusaurus, deployed to [doku.gruenerator.eu](https://doku.gruenerator.eu/)).

---

## Getting Started

### Prerequisites

- **pnpm** >= 10
- **Node.js** >= 22.x
- **PostgreSQL** >= 15
- **Redis** >= 7
- **Qdrant** (vector database for semantic search)
- **Keycloak** (for authentication)
- **FFmpeg** (for video processing)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/netzbegruenung/Gruenerator.git
   cd gruenerator
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Configure environment**

   ```bash
   # Create .env files based on the Configuration section below
   # Root .env is symlinked to apps/api/.env
   cp .env.example .env

   # Edit with your values (see Configuration section)
   ```

4. **Initialize database**

   ```bash
   psql -d gruenerator -f apps/api/database/postgres/schema.sql
   ```

   Migrations in `apps/api/database/postgres/migrations/` run automatically on backend startup.

5. **Start development servers**

   ```bash
   # Terminal 1: Backend (localhost:3001)
   pnpm dev:backend

   # Terminal 2: Frontend (localhost:3000)
   pnpm dev:web
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

---

## Configuration

### Backend Environment Variables

```bash
# AI APIs (EU providers)
MISTRAL_API_KEY=...                    # Primary AI provider (France)
CORTECS_API_KEY=...                    # EU-hosted open models via Cortecs (serves former LiteLLM/verdigado targets)
REGOLO_API_KEY=...                     # EU-hosted open models via Regolo (Italy)
LITELLM_API_KEY=...                    # Retired alias — still read for CI/scripts; requests are remapped to Cortecs
BFL_API_KEY=...                        # Image generation (Black Forest Labs, Germany)
KUGELAUDIO_API_KEY=...                 # Speech synthesis (KugelAudio, Berlin; EU endpoint)

# Keycloak Authentication
KEYCLOAK_BASE_URL=https://auth.example.com
KEYCLOAK_REALM=Gruenerator
KEYCLOAK_CLIENT_ID=gruenerator
KEYCLOAK_CLIENT_SECRET=...

# Database — either the POSTGRES_* set (as in .env.example) …
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=gruenerator
POSTGRES_PASSWORD=...
POSTGRES_DATABASE=gruenerator
POSTGRES_SSL=false
# … or DATABASE_URL as a single-string override, which wins over all of them
# DATABASE_URL=postgresql://user:pass@localhost:5432/gruenerator

# Redis
REDIS_URL=redis://localhost:6379

# Qdrant
QDRANT_URL=http://localhost:6333

# Base URLs
BASE_URL=http://localhost:3001
AUTH_BASE_URL=http://localhost:3000
```

See `.env.example` for the full list.

### Frontend Environment Variables

```bash
VITE_API_BASE_URL=/api                 # API origin; defaults to /api (same-origin via the dev proxy)
```

---

## Usage

### Development Commands

```bash
pnpm dev:web              # Frontend dev server (localhost:3000)
pnpm dev:backend          # Backend dev server (localhost:3001)
pnpm build                # Build all packages
pnpm build:web            # Build web only
pnpm typecheck            # TypeScript check across all packages
pnpm lint                 # ESLint across all packages
pnpm format:check         # Prettier check
pnpm test                 # Run all tests
pnpm ci                   # Full CI: typecheck + lint + format:check + test
```

### Mobile

A native mobile app is available via Expo (`apps/mobile`). The web app can also be installed as a PWA:

**Android (Chrome)**

1. Open https://gruenerator.de
2. Tap menu (...)
3. Select "Add to Home Screen"

**iOS (Safari)**

1. Open https://gruenerator.de
2. Tap Share button
3. Select "Add to Home Screen"

---

## Documentation

User-facing documentation is maintained in the `documentation/` directory using Docusaurus and deployed to [doku.gruenerator.eu](https://doku.gruenerator.eu/).

### Development

```bash
pnpm run dev:documentation     # Start documentation dev server
pnpm run build:documentation   # Build documentation site
```

### Documentation Structure

```
documentation/
├── docs/           # Main documentation pages
│   ├── basics/            # What the Grünerator is, how LLMs work
│   ├── konto/             # Profile and cloud features
│   ├── chat/              # Content generation features
│   ├── grueneratoren/     # Specialized generators
│   ├── wissen/            # Notebooks and knowledge sources
│   ├── office/            # Docs, boards, sheets, presentations
│   ├── integrationen/     # MCP and third-party connectors
│   ├── experimente/       # Monitor and other experimental features
│   └── archiv/            # Newsletter and Signal message archive
├── blog/           # News and updates
├── src/            # Custom pages and components
└── static/         # Images and assets
```

### Keeping Docs (and this README) Fresh

A weekly CI workflow (`docs-freshness.yml`) runs a read-only AI audit that checks every documentation article — and this README — against the current source code, and files an issue when claims have drifted. PRs that touch related source get the same audit via `docs-freshness-pr.yml`.

---

## Roadmap

- [x] Core text generation & Grüneratoren
- [x] Agentic AI chat with tool loop
- [x] Sharepic / Canvas image studio
- [x] Video subtitler
- [x] Office suite (Docs, Sheets, Presentations, Boards)
- [x] Real-time collaboration
- [x] Notebooks / RAG knowledge bases
- [x] Multi-domain support (.de, .at, .eu) with first-class Austrian locale
- [x] Native mobile apps (Expo)
- [x] API for third-party integrations (MCP server, WordPress plugin)
- [x] User-managed MCP connectors (OAuth)
- [x] Accessible (tagged) PDF generation
- [ ] Plugin system
- [ ] Multi-language interface (EN, FR)

See the [CHANGELOG](CHANGELOG.md) for recent updates.

---

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](.github/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Write everything that lands on GitHub in **English** — commit messages, branch names, pull request titles and descriptions, issues and comments.

### Development Guidelines

- Use **pnpm** for all commands (not npm or yarn)
- Use Tailwind CSS v4 utility classes for new UI code
- Follow feature-sliced architecture patterns
- Test in both light and dark modes
- Check authentication flows after auth-related changes

---

## License

**All Rights Reserved** — See [LICENSE.md](LICENSE.md) for details.

---

## Acknowledgments

- [Netzbegrünung e.V.](https://netzbegruenung.de/) — Technical support, hosting, and self-hosted AI infrastructure
- [Mistral AI](https://mistral.ai/) — Primary AI provider (France)
- [Black Forest Labs](https://blackforestlabs.ai/) — Image generation (Germany)
- [KugelAudio](https://kugelaudio.com/) — Speech synthesis (Germany)
- All contributors and supporters of European digital sovereignty

---

## Contact

- **Email**: [info@moritz-waechter.de](mailto:info@moritz-waechter.de)
- **Issues**: [GitHub Issue Tracker](https://github.com/netzbegruenung/Gruenerator/issues)
- **Documentation**: [doku.gruenerator.eu](https://doku.gruenerator.eu/)

---

<div align="center">
  <sub>Built with 💚 in Europe for sustainable politics</sub>
</div>
