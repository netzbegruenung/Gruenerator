<div align="center">
  <img src="gruenerator_frontend/public/images/Sonnenblume_RGB_gelb.png" alt="Grünerator" width="120"/>

  # Grünerator

  **The Green AI — AI-powered content creation for sustainable politics**

  [![Version](https://img.shields.io/badge/version-2.5.0-046A38?style=flat-square)](CHANGELOG.md)
  [![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
  [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
  [![Mistral AI](https://img.shields.io/badge/Mistral-AI-FF7000?style=flat-square&logo=mistral&logoColor=white)](https://mistral.ai/)
  [![License](https://img.shields.io/badge/license-Proprietary-blue?style=flat-square)](LICENSE.md)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

  [Live Demo](https://gruenerator.de) · [Documentation](https://doku.services.moritz-waechter.de/) · [Report Bug](https://github.com/netzbegruenung/Gruenerator/issues) · [Request Feature](https://github.com/netzbegruenung/Gruenerator/issues)

</div>

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Architecture](#architecture)
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

**Grünerator** is a purpose-built AI platform for members and supporters of the German Green Party (Die Grünen). It combines state-of-the-art AI models with domain-specific knowledge to generate high-quality political content while maintaining transparency, privacy, and EU compliance.

### Pro-EU: Digital Sovereignty First

Grünerator is built on **100% European infrastructure** with a commitment to digital sovereignty:

| Principle | Implementation |
|-----------|----------------|
| **100% EU Hosting** | All servers located exclusively in the European Union |
| **European AI Providers** | Default: Mistral AI (France), Images: Black Forest Labs (Germany) |
| **Privacy Mode** | Self-hosted by netzbegrünung e.V. on German servers |
| **75% EU Target** | Minimum 75% of spending with European companies |

### Key Features

| Feature | Description |
|---------|-------------|
| **AI Modes** | Kreativ (Mistral), Reasoning (Magistral), Ultra (Claude via EU Bedrock), Self-hosted (LiteLLM) |
| **Web Search** | Real-time integration of facts, statistics, and political developments |
| **Privacy Mode** | Maximum data protection — self-hosted AI on German servers |
| **Knowledge Base** | Custom instructions and organizational knowledge for tailored outputs |
| **EU Compliance** | GDPR-focused design with transparency guidelines |

### Built With

<p>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express"/>
  <img src="https://img.shields.io/badge/PostgreSQL-15+-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Redis-7+-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"/>
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

### Sharepic Generator
Create branded social media graphics:
- Quote cards and infographics
- Campaign visuals
- Consistent party branding
- Multiple export formats

### Video Subtitler
Professional subtitle generation for videos:
- AI-powered transcription
- Multiple styling options
- Instagram/TikTok optimized formats
- HD+ resolution support

### Real-time Collaboration
Y.js-powered collaborative editing:
- Multi-user document editing
- Conflict-free synchronization
- Persistent document storage

### Additional Features
- **Grüne Wolke** — Nextcloud integration for file sharing
- **Custom Instructions** — Personalized AI guidelines
- **Multi-domain Support** — .de, .at, .eu domains
- **PWA Support** — Install as native app on mobile devices

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  React 19 + Vite 7 │ Zustand │ React Query │ React Router v7    │
└────────────────────────────────┬────────────────────────────────┘
                                 │ REST API
┌────────────────────────────────▼────────────────────────────────┐
│                         BACKEND                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Express   │  │   Cluster   │  │      AI Worker Pool     │  │
│  │   Server    │──│   Workers   │──│  Claude │ OpenAI │ etc  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Keycloak   │  │    Redis    │  │       PostgreSQL        │  │
│  │    OIDC     │  │   Sessions  │  │        Database         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                  │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐   │
│  │   Qdrant    │  │              Y.js WebSocket             │   │
│  │   Vectors   │  │         Real-time Collaboration         │   │
│  └─────────────┘  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Patterns

- **Cluster-based Workers** — Express servers scaled across CPU cores
- **AI Worker Pool** — Dedicated threads for AI API calls (non-blocking)
- **Feature-Sliced Design** — Modular frontend architecture
- **Multi-Source SSO** — Keycloak with identity brokering (SAML/OIDC)

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **PostgreSQL** >= 15
- **Redis** >= 7
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
   # Backend
   cd gruenerator_backend
   npm install

   # Frontend
   cd ../gruenerator_frontend
   npm install
   ```

3. **Configure environment**
   ```bash
   # Copy example configs
   cp gruenerator_backend/.env.example gruenerator_backend/.env
   cp gruenerator_frontend/.env.example gruenerator_frontend/.env

   # Edit with your values (see Configuration section)
   ```

4. **Initialize database**
   ```bash
   # Run PostgreSQL schema
   psql -d gruenerator -f gruenerator_backend/database/postgres/schema.sql
   ```

5. **Start development servers**
   ```bash
   # Terminal 1: Backend
   cd gruenerator_backend
   npm run dev

   # Terminal 2: Frontend
   cd gruenerator_frontend
   npm start

   # Terminal 3: Y.js collaboration server (optional)
   cd gruenerator_backend
   npm run start:yjs
   ```

6. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - Y.js WebSocket: ws://localhost:1234

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

# Base URLs
BASE_URL=http://localhost:3000
AUTH_BASE_URL=http://localhost:5173
```

### Frontend Environment Variables

```bash
VITE_BACKEND_URL=http://localhost:3000
VITE_SUPABASE_URL=...  # Legacy, being migrated
VITE_SUPABASE_ANON_KEY=...
```

---

## Usage

### Development Commands

```bash
# Frontend
npm start           # Start dev server
npm run build       # Production build
npm run analyze     # Bundle analysis

# Backend
npm run dev         # Start with nodemon
npm run start:yjs   # Y.js collaboration server
npm test            # Run tests
npm run test:auth   # Authentication tests
```

### Mobile Installation (PWA)

**Android (Chrome)**
1. Open https://gruenerator.de
2. Tap menu (⋮)
3. Select "Add to Home Screen"

**iOS (Safari)**
1. Open https://gruenerator.de
2. Tap Share button
3. Select "Add to Home Screen"

---

## Roadmap

- [x] Core text generation
- [x] Sharepic generator
- [x] Video subtitler
- [x] Real-time collaboration
- [x] Multi-domain support (.de, .at, .eu)
- [ ] Native mobile apps
- [ ] Plugin system
- [ ] API for third-party integrations
- [ ] Multi-language interface (EN, FR)

See the [CHANGELOG](CHANGELOG.md) for recent updates.

---

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Use CSS variables from `variables.css` — never hardcode colors
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
- **Documentation**: [doku.services.moritz-waechter.de](https://doku.services.moritz-waechter.de/)

---

<div align="center">
  <sub>Built with 💚 in Europe for sustainable politics</sub>
</div>
