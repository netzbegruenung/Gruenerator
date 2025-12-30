# Gruenerator MCP Server

[![CI](https://github.com/Movm/Gruenerator-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/Movm/Gruenerator-MCP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

> **Note**: This repository is automatically mirrored from the [gruenerator monorepo](https://github.com/Movm/gruenerator/tree/main/packages/mcp). For contributions, you can open PRs here or directly in the monorepo.

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives AI assistants direct access to Green Party political programs from Germany and Austria.

## Table of Contents

- [Demo](#demo)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [MCP Tools & Resources](#mcp-tools--resources)
- [Search Modes](#search-modes)
- [Contributing](#contributing)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## Demo

<!-- Add screenshot or GIF of MCP client using Gruenerator -->
*Coming soon: Demo of search functionality in action*

## Features

- **Hybrid Search** - Combines vector and text search with RRF fusion
- **German Optimization** - Umlaut handling (ä→ae, ö→oe, etc.) and query variants
- **Quality Scoring** - Results weighted by document quality
- **Semantic Caching** - Fast responses for repeated queries
- **Metadata Filtering** - Filter by document type, section, category, etc.
- **Filter Discovery** - Query available filter values before searching
- **MCP Resources** - Direct access to collection information and AI guidance

## Available Document Collections

| Collection | Description | Filters |
|------------|-------------|---------|
| `oesterreich` | Die Grünen Austria: EU Election, Basic Program, National Council | `title` |
| `deutschland` | Bündnis 90/Die Grünen: Basic Program, EU Election, Government Program | `title` |
| `bundestagsfraktion` | Green Parliamentary Group: Positions and expert content | `section` |
| `gruene-de` | gruene.de website: Positions, topics, and news | `section` |
| `gruene-at` | gruene.at website: Positions, topics, and news | `section` |
| `kommunalwiki` | KommunalWiki: Municipal politics knowledge (Heinrich Böll Foundation) | `article_type`, `category` |
| `boell-stiftung` | Heinrich-Böll-Stiftung: Analyses, dossiers, and atlases | `content_type`, `topic`, `region` |

## Prerequisites

Before you begin, ensure you have:

- **Node.js** >= 18.0.0
- **Qdrant** vector database instance ([cloud](https://cloud.qdrant.io/) or self-hosted)
- **Mistral API key** for embedding generation ([get one here](https://console.mistral.ai/))

## Installation

### With Docker (Recommended)

```bash
# Build image
docker build -t gruenerator-mcp .

# Run container
docker run -d \
  --name gruenerator-mcp \
  -p 3000:3000 \
  -e QDRANT_URL=https://your-qdrant.com \
  -e QDRANT_API_KEY=your-api-key \
  -e MISTRAL_API_KEY=your-mistral-key \
  gruenerator-mcp
```

### Local Development

```bash
# Clone repository
git clone https://github.com/Movm/Gruenerator-MCP.git
cd Gruenerator-MCP

# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your credentials

# Start server
npm start

# Or with auto-reload
npm run dev
```

### With Coolify

1. Create a new project
2. Connect Git repository: `https://github.com/Movm/Gruenerator-MCP`
3. Set environment variables (see below)
4. Deploy

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `QDRANT_URL` | URL to Qdrant instance | Yes |
| `QDRANT_API_KEY` | API key for Qdrant | Yes |
| `MISTRAL_API_KEY` | API key for Mistral embeddings | Yes |
| `PORT` | Server port | No (default: 3000) |
| `PUBLIC_URL` | Public URL for config generation | No |
| `LOG_LEVEL` | Log level: DEBUG, INFO, WARN, ERROR | No (default: INFO) |

### MCP Client Setup

#### Cursor / Claude Desktop

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "gruenerator": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

After configuration, you can ask questions like:

- "Search the Austrian Green programs for climate policy"
- "What does the German Green basic program say about energy transition?"
- "Find municipal politics guidance on waste management in KommunalWiki"
- "What are the Bundestagsfraktion's positions on renewable energy?"
- "Search Böll-Stiftung for analyses on feminism and gender equality"

## API Reference

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP communication |
| `/mcp` | GET | SSE stream |
| `/mcp` | DELETE | End session |
| `/health` | GET | Health check with cache and request statistics |
| `/metrics` | GET | Detailed server metrics |
| `/.well-known/mcp.json` | GET | Auto-discovery metadata |
| `/config/:client` | GET | Generate client configuration |
| `/info` | GET | Server information |

### Health Check Response

```json
{
  "status": "ok",
  "service": "gruenerator-mcp",
  "version": "1.0.0",
  "collections": ["oesterreich", "deutschland", "bundestagsfraktion", "gruene-de", "gruene-at", "kommunalwiki", "boell-stiftung"],
  "uptime": { "ms": 3600000, "hours": 1.0 },
  "cache": {
    "embeddingHitRate": "65%",
    "searchHitRate": "42%"
  },
  "requests": { "total": 150, "searches": 120, "errors": 0 },
  "performance": { "avgResponseTimeMs": 250, "cacheHitRate": "65%" }
}
```

### Metrics Response

```json
{
  "server": { "name": "gruenerator-mcp", "version": "1.0.0" },
  "uptime": { "hours": 1.0 },
  "requests": { "total": 150, "searches": 120 },
  "breakdown": {
    "byCollection": { "deutschland": 40, "oesterreich": 30, "kommunalwiki": 25, "bundestagsfraktion": 20, "gruene-de": 15, "gruene-at": 20 },
    "bySearchMode": { "hybrid": 100, "vector": 15, "text": 5 }
  },
  "cache": {
    "embeddings": { "entries": 50, "hitRate": "65%" },
    "search": { "entries": 30, "hitRate": "42%" }
  },
  "memory": { "heapUsedMB": 45, "rssMB": 120 }
}
```

## MCP Tools & Resources

### Tools

#### `gruenerator_search`

Searches party programs and content with hybrid, vector, or text search.

**Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `query` | string | Search term or question | required |
| `collection` | string | Collection to search (see table above) | required |
| `searchMode` | string | `hybrid`, `vector`, or `text` | `hybrid` |
| `limit` | number | Maximum number of results (1-20) | 5 |
| `filters` | object | Metadata filters (see below) | optional |
| `useCache` | boolean | Use cache | true |

**Available Filters by Collection:**

| Filter | Collections | Description |
|--------|-------------|-------------|
| `documentType` | oesterreich, deutschland | Document type (grundsatzprogramm, wahlprogramm, eu-wahlprogramm) |
| `title` | oesterreich, deutschland | Exact document title |
| `section` | bundestagsfraktion, gruene-de, gruene-at | Content section (Positionen, Themen, etc.) |
| `article_type` | kommunalwiki | Article type (literatur, praxishilfe, faq, etc.) |
| `category` | kommunalwiki | Thematic category (Haushalt, Umwelt, etc.) |
| `content_type` | boell-stiftung | Content type (artikel, dossier, atlas, schwerpunkt) |
| `topic` | boell-stiftung | Topic (klima, feminismus, migration, digitalisierung, etc.) |
| `region` | boell-stiftung | Geographic region (afrika, europa, asien, lateinamerika, etc.) |

**Example:**
```json
{
  "query": "climate protection and renewable energy",
  "collection": "kommunalwiki",
  "searchMode": "hybrid",
  "limit": 5,
  "filters": { "article_type": "praxishilfe", "category": "Umwelt" }
}
```

#### `gruenerator_get_filters`

Discovers available filter values for a collection. Use this before filtering to know valid values.

**Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `collection` | string | Collection to get filters for | required |

**Example Response:**
```json
{
  "collection": "KommunalWiki",
  "collectionId": "kommunalwiki",
  "description": "Municipal politics knowledge (Heinrich Böll Foundation)",
  "filters": {
    "article_type": {
      "label": "Article Type",
      "type": "keyword",
      "values": ["literatur", "praxishilfe", "faq", "sachgebiet"],
      "count": 4
    },
    "category": {
      "label": "Category",
      "type": "keyword",
      "values": ["Haushalt", "Umwelt", "Verkehr", "..."],
      "count": 25
    }
  }
}
```

#### `gruenerator_cache_stats`

Shows cache statistics for embeddings and search results.

**Parameters:** None

**Example Response:**
```json
{
  "embeddings": { "entries": 50, "hits": 120, "misses": 30, "hitRate": "80%" },
  "search": { "entries": 30, "hits": 80, "misses": 40, "hitRate": "67%" }
}
```

#### `get_client_config`

Generates ready-to-use MCP configurations for various clients.

**Parameters:**
- `client` (string, required) - `claude`, `cursor`, or `vscode`

### Resources

The server provides the following resources via MCP protocol:

| URI | Description |
|-----|-------------|
| `gruenerator://system-prompt` | **Read first!** Usage instructions for AI assistants |
| `gruenerator://info` | Server information and capabilities |
| `gruenerator://collections` | List of all available collections |
| `gruenerator://collections/{key}` | Details of a specific collection (oesterreich, deutschland, bundestagsfraktion, gruene-de, gruene-at, kommunalwiki, boell-stiftung) |

## Search Modes

### Hybrid (Default)
Combines vector and text search with Reciprocal Rank Fusion (RRF). Best results for most queries.

### Vector
Pure semantic search based on embeddings. Good for conceptual questions.

### Text
Classic text search with German optimizations. Good for exact terms or names.

## Contributing

Contributions are welcome! Here's how you can help:

1. **Report bugs** - Open an issue using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
2. **Request features** - Open an issue using the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md)
3. **Submit PRs** - Fork the repo, create a branch, and submit a pull request

Please ensure your PR:
- Passes CI checks
- Follows existing code style
- Includes appropriate documentation updates

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol powering this server
- [Qdrant](https://qdrant.tech/) - Vector database for semantic search
- [Mistral AI](https://mistral.ai/) - Embedding generation
- [Die Grünen Österreich](https://www.gruene.at/) & [Bündnis 90/Die Grünen](https://www.gruene.de/) - Source documents
- [Grüne Bundestagsfraktion](https://www.gruene-bundestag.de/) - Parliamentary group content
- [Heinrich-Böll-Stiftung](https://www.boell.de/) - Political analyses, dossiers, and atlases
- [Heinrich-Böll-Stiftung KommunalWiki](https://kommunalwiki.boell.de/) - Municipal politics knowledge base

## License

MIT License - see [LICENSE](LICENSE)
