<div align="center">
  <img src="apps/web/public/images/gruenerator_logo_gruen.svg" alt="Grünerator" width="200"/>

# Grünerator

**The Green AI — AI-powered content creation for sustainable politics**

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Expo](https://img.shields.io/badge/Expo-55-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Mistral AI](https://img.shields.io/badge/Mistral-AI-FF7000?style=flat-square&logo=mistral&logoColor=white)](https://mistral.ai/)
[![License](https://img.shields.io/badge/license-Proprietary-blue?style=flat-square)](LICENSE.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

[Live Demo](https://gruenerator.de) · [Documentation](https://doku.gruenerator.de/) · [Report Bug](https://github.com/netzbegruenung/Gruenerator/issues) · [Request Feature](https://github.com/netzbegruenung/Gruenerator/issues)

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

| Principle                 | Implementation                                                    |
| ------------------------- | ----------------------------------------------------------------- |
| **100% EU Hosting**       | All servers located exclusively in the European Union             |
| **European AI Providers** | Default: Mistral AI (France), Images: Black Forest Labs (Germany) |
| **Privacy Mode**          | Self-hosted by netzbegrünung e.V. on German servers               |
| **75% EU Target**         | Minimum 75% of spending with European companies                   |

### Key Features

| Feature              | Description                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| **AI Modes**         | Kreativ (Mistral), Reasoning (Magistral), Ultra (Claude via EU Bedrock), Self-hosted (LiteLLM) |
| **LangGraph Agents** | 7+ specialized AI agents for chat, web research, social content, press releases, and more      |
| **Web Search**       | Real-time integration of facts, statistics, and political developments                         |
| **Notebook Q&A**     | RAG-powered knowledge base over party documents with cross-collection search                   |
| **Canvas Studio**    | Advanced image editor for social media graphics with AI-assisted content                       |
| **Privacy Mode**     | Maximum data protection — self-hosted AI on German servers                                     |
| **Knowledge Base**   | Custom instructions and organizational knowledge for tailored outputs                          |
| **EU Compliance**    | GDPR-focused design with transparency guidelines                                               |

### Built With

<p>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Expo-55-000020?style=for-the-badge&logo=expo&logoColor=white" alt="Expo"/>
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

### Text Generation

Generate professional political content with AI assistance:

- Press releases and statements
- Social media posts (optimized per platform)
- Policy documents and motions
- Accessible language translations

### Canvas / Image Studio

Create and edit branded social media graphics:

- Full canvas editor with layers, text, and shapes
- AI-assisted content generation
- Quote cards and infographics
- Campaign visuals with consistent party branding
- Multiple export formats

### Video Subtitler

Professional subtitle generation for videos:

- AI-powered transcription
- Multiple styling options
- Instagram/TikTok optimized formats
- HD+ resolution support

### Real-time Collaboration

Hocuspocus-powered collaborative editing:

- Multi-user document editing
- Conflict-free synchronization
- Persistent document storage

### Additional Features

- **Native Mobile App** — Expo 55 / React Native app with full feature support
- **Desktop App** — Tauri 2 desktop application for Windows, macOS, and Linux
- **Docs Editor** — Collaborative document editor with real-time sync
- **Sites Builder** — Website builder for Green party organizations
- **Grün-O-Mat** — Political compass / decision-making tool
- **MCP Server** — Model Context Protocol server for AI integrations ([mcp.gruenerator.eu](https://mcp.gruenerator.eu))
- **Notebook Q&A** — RAG-powered knowledge base with Landesverband-specific content
- **Austrian Support** — Full de-AT locale with Austrian Green party content
- **WordPress Plugin** — Integration for Green party WordPress sites
- **Grüne Wolke** — Nextcloud integration for file sharing
- **Custom Instructions** — Personalized AI guidelines
- **Multi-domain Support** — .de, .at, .eu domains
- **PWA Support** — Install as native app on mobile devices

---

## Architecture

```
┌────────────────────────── CLIENTS ───────────────────────────┐
│  Web (React 19 + Vite 7)       │  Mobile (Expo 55 / RN)     │
│  Desktop (Tauri 2)             │  WordPress Plugin           │
└───────────────────────────┬──────────────────────────────────┘
                            │ REST API + SSE
┌───────────────────────────▼──────────────────────────────────┐
│                         BACKEND                               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Express 5   │  │   Cluster    │  │   AI Worker Pool   │  │
│  │   Server     │──│   Workers    │──│ Mistral │ Claude   │  │
│  └──────────────┘  └──────────────┘  │ Flux    │ LiteLLM  │  │
│                                      └────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  LangGraph   │  │  Keycloak    │  │    PostgreSQL      │  │
│  │  Agents (7+) │  │  OIDC SSO    │  │    Database        │  │
│  └──────────────┘  └──────────────┘  └────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │    Redis     │  │   Qdrant     │                          │
│  │  Cache/PubSub│  │   Vectors    │                          │
│  └──────────────┘  └──────────────┘                          │
└──────────────────────────────────────────────────────────────┘
         │                                    │
┌────────▼─────────┐              ┌───────────▼────────┐
│   Hocuspocus     │              │    MCP Server      │
│   (Realtime)     │              │ mcp.gruenerator.eu │
└──────────────────┘              └────────────────────┘
```

### Key Patterns

- **Cluster-based Workers** — Express servers scaled across CPU cores
- **LangGraph Agent Pipeline** — Classify, search, rerank, respond with specialized AI agents
- **RAG Pipeline** — Qdrant vector search with cross-collection dedup and reranking
- **Feature-Sliced Design** — Modular frontend architecture with 26 feature modules
- **Multi-Source SSO** — Keycloak with identity brokering (SAML/OIDC)

---

## Monorepo Structure

This is a **pnpm + Turborepo** monorepo with 10 apps, 7 packages, and 4 services.

### Apps

| Workspace          | Description                             |
| ------------------ | --------------------------------------- |
| `apps/web`         | React 19 + Vite 7 frontend              |
| `apps/api`         | Express 5 backend + LangGraph agents    |
| `apps/mobile`      | Expo 55 / React Native mobile app       |
| `apps/desktop`     | Tauri 2 desktop wrapper                 |
| `apps/docs`        | Collaborative document editor (Mantine) |
| `apps/docs-expo`   | Document editor for mobile (Expo)       |
| `apps/sites`       | Site builder                            |
| `apps/gruen-o-mat` | Political compass tool                  |
| `apps/wordpress`   | WordPress plugin                        |

### Packages

| Workspace                | Description                                   |
| ------------------------ | --------------------------------------------- |
| `packages/chat`          | Shared chat UI, runtime adapters, stores      |
| `packages/shared`        | Shared stores, hooks, API clients, components |
| `packages/canvas-editor` | Image/canvas editor library                   |
| `packages/docs`          | Document types, Tiptap utilities              |
| `packages/voice`         | Voice synthesis utilities                     |

### Services

| Workspace             | Description                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `services/mcp`        | Model Context Protocol server ([mcp.gruenerator.eu](https://mcp.gruenerator.eu)) |
| `services/hocuspocus` | Real-time collaboration server                                                   |
| `services/remotion`   | Video rendering                                                                  |

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
# AI APIs
MISTRAL_API_KEY=...                    # Primary AI provider
AWS_ACCESS_KEY_ID=...                  # For Ultra mode (Claude via Bedrock)
AWS_SECRET_ACCESS_KEY=...
LITELLM_API_KEY=...                    # Self-hosted fallback

# Keycloak Authentication
KEYCLOAK_BASE_URL=https://auth.example.com
KEYCLOAK_REALM=Gruenerator
KEYCLOAK_CLIENT_ID=gruenerator
KEYCLOAK_CLIENT_SECRET=...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/gruenerator

# Redis
REDIS_URL=redis://localhost:6379

# Qdrant
QDRANT_URL=http://localhost:6333

# Base URLs
BASE_URL=http://localhost:3001
AUTH_BASE_URL=http://localhost:3000
```

### Frontend Environment Variables

```bash
VITE_BACKEND_URL=http://localhost:3001
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

User-facing documentation is maintained in the `/documentation` directory using Docusaurus.

### Development

```bash
pnpm run dev:documentation     # Start documentation dev server
pnpm run build:documentation   # Build documentation site
```

### Documentation Structure

```
documentation/
├── docs/           # Main documentation pages
│   ├── Grundlagen/        # Basics and guides
│   ├── Profil/            # Profile and cloud features
│   ├── gruenerieren/      # Content generation features
│   ├── llm-basics/        # AI/LLM fundamentals
│   └── ueber-den-gruenerator/  # About Grünerator
├── blog/           # News and updates
├── src/            # Custom pages and components
└── static/         # Images and assets
```

---

## Roadmap

- [x] Core text generation
- [x] Sharepic / Canvas image studio
- [x] Video subtitler
- [x] Real-time collaboration
- [x] Multi-domain support (.de, .at, .eu)
- [x] Native mobile apps (Expo)
- [x] API for third-party integrations (MCP server, WordPress plugin)
- [ ] Plugin system
- [ ] Multi-language interface (EN, FR)

See the [CHANGELOG](CHANGELOG.md) for recent updates.

---

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

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

- [Netzbegrünung e.V.](https://netzbegruenung.de/) — Technical support, hosting, and Privacy Mode infrastructure
- [Mistral AI](https://mistral.ai/) — Primary AI provider (France)
- [Black Forest Labs](https://blackforestlabs.ai/) — Image generation (Germany)
- All contributors and supporters of European digital sovereignty

---

## Contact

- **Email**: [info@moritz-waechter.de](mailto:info@moritz-waechter.de)
- **Issues**: [GitHub Issue Tracker](https://github.com/netzbegruenung/Gruenerator/issues)
- **Documentation**: [doku.gruenerator.de](https://doku.gruenerator.de/)

---

<div align="center">
  <sub>Built with 💚 in Europe for sustainable politics</sub>
</div>
