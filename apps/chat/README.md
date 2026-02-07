# Grünerator Chat

KI-gestützter Textassistent für Bündnis 90/Die Grünen.

## Features

- 10 spezialisierte KI-Assistenten für verschiedene Textformen
- Semantische Suche in Parteiprogrammen via MCP
- Streaming-Antworten mit Mistral AI
- Dark/Light Theme
- Thread-Persistenz (PostgreSQL)
- Deutsche Benutzeroberfläche

## Assistenten

| Assistent | Beschreibung |
|-----------|--------------|
| Universal Assistent | Vielseitiger Textgenerator mit MCP-Suche |
| Antragsschreiber*in | Kommunalpolitische Anträge und Anfragen |
| Bürgerservice | Bürgeranfragen professionell beantworten |
| Grüne Jugend Manager*in | Aktivistische Social-Media-Inhalte |
| Leichte Sprache | Texte barrierefrei übersetzen |
| Pressesprecher*in | Professionelle Pressemitteilungen |
| Rede-Schreiber*in | Überzeugende politische Reden |
| Sharepic Texter*in | Texte für Social-Media-Grafiken |
| Social Media Manager*in | Plattformgerechte Social-Media-Inhalte |
| Wahlprogramm-Autor*in | Strukturierte Wahlprogramm-Kapitel |

## Entwicklung

### Voraussetzungen

- Node.js 22+
- pnpm
- PostgreSQL (oder Docker)

### Setup

```bash
# Abhängigkeiten installieren
pnpm install

# Umgebungsvariablen kopieren
cp .env.example .env
# .env bearbeiten und MISTRAL_API_KEY eintragen

# Datenbank starten (Docker)
docker compose --profile dev up -d

# Entwicklungsserver starten
pnpm dev
```

Die Anwendung läuft dann unter http://localhost:3210.

### Datenbank

```bash
# Schema generieren
pnpm db:generate

# Schema anwenden
pnpm db:push

# Drizzle Studio öffnen
pnpm db:studio
```

## Docker

```bash
# Alles starten (inkl. App)
docker compose up -d

# Nur Datenbank für Entwicklung
docker compose --profile dev up -d
```

## Umgebungsvariablen

| Variable | Beschreibung |
|----------|--------------|
| `DATABASE_URL` | PostgreSQL Connection String |
| `MISTRAL_API_KEY` | Mistral AI API Key |
| `MCP_SERVER_URL` | MCP Server URL (default: https://mcp.gruenerator.eu/mcp) |
| `NEXTAUTH_SECRET` | Auth Secret für Sessions |
| `NEXTAUTH_URL` | Base URL der Anwendung |

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **UI:** React 19, Tailwind CSS
- **AI:** Vercel AI SDK, Mistral AI
- **Database:** PostgreSQL, Drizzle ORM
- **State:** Zustand, TanStack Query
