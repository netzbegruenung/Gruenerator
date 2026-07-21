#!/usr/bin/env node

console.log('[Boot] Starting Gruenerator MCP Server...');
console.log(`[Boot] Node.js ${process.version}`);
console.log(`[Boot] Environment: ${process.env.NODE_ENV || 'development'}`);

console.log('[Boot] Loading dependencies...');
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';
console.log('[Boot] Dependencies loaded');

console.log('[Boot] Loading config...');
import { fetchCatalog, getCatalogStatus } from './catalog.ts';
import { clientConfigTool } from './clients/config.ts';
import { config, validateConfig } from './config.ts';
import { registerAgentPrompts, getPromptList } from './prompts/agent-prompts.ts';
import { checkQdrantHealth } from './qdrant/client.ts';
import {
  getCollectionResources,
  getCollectionResource,
  readServerInfoResource,
} from './resources/collections.ts';
import { getSystemPromptResource } from './resources/system-prompt.ts';
import { examplesSearchTool } from './tools/examples-search.ts';
import { filtersTool } from './tools/filters.ts';
import { notebooksGetFiltersTool } from './tools/notebooks-get-filters.ts';
import { notebooksListTool } from './tools/notebooks-list.ts';
import { notebooksSearchTool } from './tools/notebooks-search.ts';
import { searchTool, cacheStatsTool } from './tools/search.ts';
import { getCacheStats } from './utils/cache.ts';
import { classifyError, connectionErrorResponse } from './utils/errors.ts';
import { info, error, logSearch, getStats } from './utils/logger.ts';
console.log('[Boot] Config loaded');

// Konfiguration validieren
console.log('[Config] Validating environment variables...');
try {
  validateConfig();
  console.log('[Config] Validation successful');
} catch (err) {
  console.error(`[Config] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  console.error('[Config] Required: QDRANT_URL, QDRANT_API_KEY, MISTRAL_API_KEY');
  process.exit(1);
}

console.log('[Boot] Setting up Express...');
const app = express();

// Behind the Salt-deployed nginx reverse proxy — trust the first hop so req.ip
// reflects the real client (required for per-IP rate limiting to work).
app.set('trust proxy', 1);

// MCP JSON-RPC payloads are small; reject oversized bodies early.
app.use(express.json({ limit: '64kb' }));

// CORS. Defaults to '*' (public read-only search server). Set
// MCP_ALLOWED_ORIGINS (comma-separated) to restrict to specific origins.
const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization'],
    exposedHeaders: ['Mcp-Session-Id'],
  })
);

// Baseline security headers (helmet-equivalent, kept dependency-free).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
console.log('[Boot] Express configured');

// Helper: Base URL ermitteln
function getBaseUrl(req: express.Request): string {
  return config.server.publicUrl || `${req.protocol}://${req.get('host')}`;
}

// --- Anti-abuse: per-IP rate limiting (in-memory; the server is single-process).
// Anonymous search triggers a Mistral embedding + Qdrant query per call, so an
// unbounded /mcp is a cost-DoS surface. ---
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.MCP_RATE_LIMIT_PER_MIN) || 120;
const rateBuckets = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (rateBuckets.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateBuckets.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

// --- DNS-rebinding protection (MCP spec recommendation). Opt-in via env so it
// can't accidentally lock out a mis-set Host header from a valid client; when
// enabled, set MCP_ALLOWED_HOSTS to the served host(s), e.g. mcp.gruenerator.eu. ---
const dnsRebindingOptions =
  process.env.MCP_DNS_REBINDING_PROTECTION === 'true'
    ? {
        enableDnsRebindingProtection: true,
        allowedHosts: (process.env.MCP_ALLOWED_HOSTS || '')
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean),
        ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
      }
    : {};

// Tool annotations (MCP + Anthropic Directory requirement). Every tool here is a
// pure read. The search-family additionally reaches external data sources
// (Qdrant/Mistral/backend API) → openWorldHint; cache/config are internal → false.
const READONLY_EXTERNAL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
const READONLY_INTERNAL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function wrapToolHandler(
  label: string,
  handler: (params: Record<string, unknown>) => Promise<Record<string, unknown>>
) {
  return async (params: Record<string, unknown>) => {
    try {
      const result = await handler(params);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        isError: !!result.error,
      };
    } catch (err) {
      const { detail, isConnection } = classifyError(err);
      error(label, `${label} failed: ${detail}`);
      // Report unexpected exceptions to GlitchTip. Connection errors are expected
      // infra hiccups (Qdrant/API unreachable) and would flood the project during
      // an outage, so they are logged but not captured.
      if (!isConnection) {
        Sentry.captureException(err, { tags: { mcp_tool: label } });
      }
      const body = isConnection
        ? connectionErrorResponse(detail)
        : { error: true, message: detail };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
        isError: true,
      };
    }
  };
}

function extractBearerKey(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1]?.trim() ?? null;
}

// MCP Server Factory
function createMcpServer(baseUrl: string, apiKey: string | null) {
  const server = new McpServer(
    {
      name: 'gruenerator-mcp',
      version: '1.0.0',
    },
    {
      // Server-level tool-use guidance — lands in the client's system prompt.
      // This is the sanctioned place for "call X before Y" hints (unlike tool
      // descriptions, which must not instruct behaviour). Kept short: it costs
      // tokens every session. Full guidance stays in the system-prompt resource.
      instructions: [
        'Grünerator-MCP: durchsucht Programme, Beschlüsse und Positionen von Bündnis 90/Die Grünen (Deutschland) und den Grünen Österreich.',
        '- gruenerator_search ist das Haupttool. Formuliere die Antwort aus den Treffern und verweise auf deren Quelle/URL.',
        '- Der Parameter country ist Pflicht (DE oder AT) und bestimmt, welche Sammlungen durchsucht werden.',
        '- Rufe gruenerator_get_filters für eine Sammlung auf, bevor du mit filters einschränkst — Filterwerte nicht raten.',
        '- Für DE-vs-AT-Vergleiche zweimal suchen (country DE und AT) und gegenüberstellen.',
      ].join('\n'),
    }
  );

  // === MCP RESOURCES ===

  // List available resources
  server.registerResource(
    'collections',
    'gruenerator://collections',
    {
      title: 'Verfügbare Dokumentsammlungen',
      description: 'Alle durchsuchbaren Sammlungen mit Metadaten.',
      mimeType: 'application/json',
    },
    async () => {
      const resources = await getCollectionResources();
      return {
        contents: [
          {
            uri: 'gruenerator://collections',
            mimeType: 'application/json',
            text: JSON.stringify({ collections: resources }, null, 2),
          },
        ],
      };
    }
  );

  // Server info resource
  server.registerResource(
    'server-info',
    'gruenerator://info',
    {
      title: 'Server-Informationen und Fähigkeiten',
      description: 'Überblick über Endpunkte, Tools und Sammlungen.',
      mimeType: 'application/json',
    },
    () => readServerInfoResource()
  );

  // System prompt resource - AI systems should read this first
  server.registerResource(
    'system-prompt',
    'gruenerator://system-prompt',
    {
      title: 'Anleitung zur Nutzung des MCP Servers (für AI-Assistenten)',
      description: 'Tool-Auswahl, Sammlungen und Filter-Workflow.',
      mimeType: 'text/markdown',
    },
    () => getSystemPromptResource()
  );

  // Dynamic collection resources
  for (const [key, col] of Object.entries(config.collections)) {
    server.registerResource(
      `collection-${key}`,
      `gruenerator://collections/${key}`,
      {
        title: col.displayName,
        description: col.description,
        mimeType: 'application/json',
      },
      async () => {
        const resource = await getCollectionResource(`gruenerator://collections/${key}`);
        return (
          resource || {
            contents: [
              {
                uri: `gruenerator://collections/${key}`,
                mimeType: 'application/json',
                text: JSON.stringify({ error: 'Collection not found' }),
              },
            ],
          }
        );
      }
    );
  }

  // === MCP TOOLS ===

  // Search Tool with annotations
  server.registerTool(
    searchTool.name,
    {
      title: 'Grünen-Dokumente durchsuchen',
      description: searchTool.description,
      inputSchema: searchTool.inputSchema,
      annotations: READONLY_EXTERNAL,
    },
    async ({
      query,
      country,
      collection,
      searchMode = 'hybrid',
      limit = 5,
      filters,
      useCache = true,
    }) => {
      const startTime = Date.now();

      try {
        const result = (await searchTool.handler({
          query,
          country,
          collection,
          searchMode,
          limit,
          filters,
          useCache,
        })) as Record<string, unknown>;
        const responseTime = Date.now() - startTime;

        // Log the search
        logSearch(
          query,
          collection || `country:${country}`,
          searchMode,
          (result.resultsCount as number) || 0,
          responseTime,
          (result.cached as boolean) || false
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !!result.error,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error('Search', `Search failed: ${message}`);
        Sentry.captureException(err, { tags: { mcp_tool: 'Search' } });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: true, message }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Cache Stats Tool
  server.registerTool(
    cacheStatsTool.name,
    {
      title: 'Cache-Statistiken',
      description: cacheStatsTool.description,
      inputSchema: cacheStatsTool.inputSchema,
      annotations: READONLY_INTERNAL,
    },
    async () => {
      const result = await cacheStatsTool.handler();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // Client Config Tool
  server.registerTool(
    clientConfigTool.name,
    {
      title: 'MCP-Client-Konfiguration',
      description: clientConfigTool.description,
      inputSchema: clientConfigTool.inputSchema,
      annotations: READONLY_INTERNAL,
    },
    async ({ client }) => {
      const result = clientConfigTool.handler({ client }, baseUrl);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // Filters Tool
  server.registerTool(
    filtersTool.name,
    {
      title: 'Verfügbare Filter abrufen',
      description: filtersTool.description,
      inputSchema: filtersTool.inputSchema,
      annotations: READONLY_EXTERNAL,
    },
    wrapToolHandler('Filters', (params) => filtersTool.handler(params as { collection: string }))
  );

  // === MCP PROMPTS ===
  registerAgentPrompts(server);

  // Examples Search Tool
  server.registerTool(
    examplesSearchTool.name,
    {
      title: 'Social-Media-Beispiele durchsuchen',
      description: examplesSearchTool.description,
      inputSchema: examplesSearchTool.inputSchema,
      annotations: READONLY_EXTERNAL,
    },
    wrapToolHandler('ExamplesSearch', (params) =>
      examplesSearchTool.handler(params as Parameters<typeof examplesSearchTool.handler>[0])
    )
  );

  // Authenticated notebook tools — only registered when caller forwarded a
  // Bearer API key. Without a key, these are not advertised in tools/list,
  // and the MCP server stays anonymous-callable for the existing public tools.
  if (apiKey) {
    server.registerTool(
      notebooksListTool.name,
      {
        title: 'Notebooks auflisten',
        description: notebooksListTool.description,
        inputSchema: notebooksListTool.inputSchema,
        annotations: READONLY_EXTERNAL,
      },
      wrapToolHandler('NotebooksList', (p) => notebooksListTool.handler(p, apiKey))
    );
    server.registerTool(
      notebooksSearchTool.name,
      {
        title: 'Notebook durchsuchen',
        description: notebooksSearchTool.description,
        inputSchema: notebooksSearchTool.inputSchema,
        annotations: READONLY_EXTERNAL,
      },
      wrapToolHandler('NotebooksSearch', (p) =>
        notebooksSearchTool.handler(p as Parameters<typeof notebooksSearchTool.handler>[0], apiKey)
      )
    );
    server.registerTool(
      notebooksGetFiltersTool.name,
      {
        title: 'Notebook-Filter abrufen',
        description: notebooksGetFiltersTool.description,
        inputSchema: notebooksGetFiltersTool.inputSchema,
        annotations: READONLY_EXTERNAL,
      },
      wrapToolHandler('NotebooksGetFilters', (p) =>
        notebooksGetFiltersTool.handler(
          p as Parameters<typeof notebooksGetFiltersTool.handler>[0],
          apiKey
        )
      )
    );
  }

  return server;
}

// Health Check Endpoint with comprehensive metrics
app.get('/health', (req, res) => {
  const cacheStats = getCacheStats();
  const serverStats = getStats();

  res.json({
    status: 'ok',
    service: 'gruenerator-mcp',
    version: '1.0.0',
    collections: Object.keys(config.collections),
    uptime: serverStats.uptime,
    cache: {
      embeddingHitRate: cacheStats.embeddings.hitRate,
      searchHitRate: cacheStats.search.hitRate,
      embeddingEntries: cacheStats.embeddings.entries,
      searchEntries: cacheStats.search.entries,
    },
    requests: serverStats.requests,
    performance: serverStats.performance,
  });
});

// Deep MCP diagnostics — dependency health + client-readiness. Kept separate
// from /health (liveness) so a dependency hiccup never fails the Docker
// healthcheck and triggers a restart loop. Use this for monitoring/CI and to
// catch the claude.ai-compat regressions we debugged (JSON mode, stateless
// transport, declared capabilities, registered tools).
app.get('/health/mcp', async (_req, res) => {
  const qdrant = await checkQdrantHealth();
  const catalog = getCatalogStatus();
  const mistralConfigured = !!config.mistral.apiKey;

  const publicTools = [
    searchTool.name,
    filtersTool.name,
    cacheStatsTool.name,
    examplesSearchTool.name,
    clientConfigTool.name,
  ];

  // Transport contract that keeps tools visible in the claude.ai connector —
  // must stay in sync with the POST /mcp handler (stateless + enableJsonResponse).
  const mcp = {
    transport: 'streamable-http',
    jsonResponseMode: true,
    stateless: true,
    supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    capabilities: ['tools', 'resources', 'prompts'],
    publicToolCount: publicTools.length,
    publicTools,
    claudeAiReady: publicTools.length > 0,
  };

  const dependencies = {
    qdrant,
    mistral: { configured: mistralConfigured },
    catalogApi: {
      configured: catalog.apiConfigured,
      source: catalog.source,
      collections: catalog.collectionCount,
      lastFetchedAt: catalog.lastFetchedAt,
      ageSeconds: catalog.ageSeconds,
    },
  };

  // Search needs Qdrant + Mistral; tool discovery itself does not. Report
  // degraded (503) only when a search dependency is down.
  const healthy = qdrant.ok && mistralConfigured;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    service: 'gruenerator-mcp',
    version: '1.0.0',
    mcp,
    dependencies,
  });
});

// Metrics endpoint (detailed stats)
app.get('/metrics', (req, res) => {
  const cacheStats = getCacheStats();
  const serverStats = getStats();

  res.json({
    server: {
      name: 'gruenerator-mcp',
      version: '1.0.0',
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    },
    uptime: serverStats.uptime,
    requests: serverStats.requests,
    performance: serverStats.performance,
    breakdown: serverStats.breakdown,
    cache: cacheStats,
    memory: {
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
});

// Served identically from /info and /.well-known/mcp.json — keep in one place.
const DEPRECATION = {
  deprecated: true,
  successor: 'https://mcp.gruenerator.eu/v2',
  note: 'Nachfolger mit OAuth-Login und persönlichen Tools (Dokumente, Boards, Notizbücher, Gruppen, Medien). Die anonyme Programm-Suche bleibt hier vorerst verfügbar.',
  sunset: null,
} as const;

// Auto-Discovery Endpoint
app.get('/.well-known/mcp.json', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.json({
    name: 'gruenerator-mcp',
    version: '1.0.0',
    description: 'Suche in Grünen Parteiprogrammen (Deutschland & Österreich)',
    homepage: 'https://github.com/Movm/Gruenerator-MCP',
    mcp_endpoint: `${baseUrl}/mcp`,
    transport: 'streamable-http',
    deprecation: DEPRECATION,
    tools: [
      {
        name: 'gruenerator_search',
        description: 'Durchsucht Grüne Parteiprogramme mit hybrid/vector/text Suche',
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      {
        name: 'gruenerator_get_filters',
        description: 'Gibt verfügbare Filterwerte für eine Sammlung zurück',
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      {
        name: 'gruenerator_cache_stats',
        description: 'Zeigt Cache-Statistiken für die Suche',
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      {
        name: 'get_client_config',
        description: 'Generiert fertige MCP-Client-Konfigurationen',
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      {
        name: 'gruenerator_examples_search',
        description: 'Sucht nach Social-Media-Beispielen der Grünen (Instagram, Facebook)',
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
    ],
    resources: [
      {
        uri: 'gruenerator://system-prompt',
        name: 'Anleitung für AI-Assistenten',
        priority: 'high',
      },
      { uri: 'gruenerator://info', name: 'Server Info' },
      { uri: 'gruenerator://collections', name: 'Alle Sammlungen' },
      ...Object.entries(config.collections).map(([key, col]) => ({
        uri: `gruenerator://collections/${key}`,
        name: col.displayName,
      })),
    ],
    collections: Object.entries(config.collections).map(([key, col]) => ({
      id: key,
      name: col.displayName,
      description: col.description,
    })),
    prompts: getPromptList().map((p) => ({
      name: p.name,
      title: p.title,
      description: p.description,
    })),
    supported_clients: ['claude', 'cursor', 'vscode', 'chatgpt'],
  });
});

// Client-spezifische Konfiguration
app.get('/config/:client', (req, res) => {
  const { client } = req.params;
  const baseUrl = getBaseUrl(req);
  const validClients = ['claude', 'cursor', 'vscode', 'chatgpt'];

  if (!validClients.includes(client)) {
    return res.status(404).json({
      error: 'Unbekannter Client',
      message: `Unterstützte Clients: ${validClients.join(', ')}`,
      available: validClients,
    });
  }

  const result = clientConfigTool.handler({ client }, baseUrl);
  res.json(result);
});

// Server-Info Endpoint
app.get('/info', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const serverStats = getStats();

  res.json({
    server: {
      name: 'gruenerator-mcp',
      version: '1.0.0',
      description: 'MCP Server für Grüne Parteiprogramme (Deutschland & Österreich)',
      uptime: serverStats.uptime,
    },
    deprecation: DEPRECATION,
    endpoints: {
      mcp: `${baseUrl}/mcp`,
      health: `${baseUrl}/health`,
      metrics: `${baseUrl}/metrics`,
      discovery: `${baseUrl}/.well-known/mcp.json`,
      config: `${baseUrl}/config/:client`,
      info: `${baseUrl}/info`,
    },
    tools: [
      {
        name: 'gruenerator_search',
        description: 'Durchsucht Grüne Parteiprogramme mit hybrid/vector/text Suche',
        collections: Object.keys(config.collections),
        searchModes: ['hybrid', 'vector', 'text'],
        features: ['caching', 'metadata-filtering', 'german-optimization'],
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      {
        name: 'gruenerator_get_filters',
        description: 'Gibt verfügbare Filterwerte für eine Sammlung zurück',
        collections: Object.keys(config.collections),
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      {
        name: 'gruenerator_cache_stats',
        description: 'Zeigt Cache-Statistiken für Embeddings und Suche',
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      {
        name: 'get_client_config',
        description: 'Generiert MCP-Client-Konfigurationen',
        clients: ['claude', 'cursor', 'vscode'],
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      {
        name: 'gruenerator_examples_search',
        description: 'Sucht nach Social-Media-Beispielen der Grünen',
        platforms: ['instagram', 'facebook'],
        countries: ['DE', 'AT'],
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
    ],
    resources: [
      {
        uri: 'gruenerator://system-prompt',
        description: 'Anleitung für AI-Assistenten (zuerst lesen!)',
      },
      { uri: 'gruenerator://info', description: 'Server-Informationen' },
      { uri: 'gruenerator://collections', description: 'Alle verfügbaren Sammlungen' },
      ...Object.entries(config.collections).map(([key, col]) => ({
        uri: `gruenerator://collections/${key}`,
        description: col.description,
      })),
    ],
    prompts: getPromptList().map((p) => ({
      name: p.name,
      title: p.title,
      description: p.description,
    })),
    collections: Object.entries(config.collections).map(([key, col]) => ({
      id: key,
      name: col.displayName,
      description: col.description,
    })),
    links: {
      github: 'https://github.com/Movm/Gruenerator-MCP',
      documentation: 'https://github.com/Movm/Gruenerator-MCP#readme',
    },
  });
});

// MCP POST Endpoint (Hauptkommunikation)
app.post('/mcp', async (req, res) => {
  if (isRateLimited(req.ip ?? req.socket.remoteAddress ?? 'unknown')) {
    res.status(429).json({
      jsonrpc: '2.0',
      error: { code: -32029, message: 'Zu viele Anfragen – bitte kurz warten.' },
      id: null,
    });
    return;
  }

  // Stateless mode: every POST gets a fresh McpServer + transport and a JSON
  // response. claude.ai's connector tool-discovery (and ChatGPT) don't carry an
  // mcp-session-id — a stateful-only server rejects their session-less tools/list
  // so the tools never get indexed (resources work via a different path). A fresh
  // instance per request is required from SDK ≥1.26 to avoid cross-request state
  // leaks. Mirrors the reference Claude.ai HTTP-MCP setup and our Bundestag MCP.
  try {
    const server = createMcpServer(getBaseUrl(req), extractBearerKey(req));
    const transport = new StreamableHTTPServerTransport({
      ...dnsRebindingOptions,
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    error('MCP', `handleRequest failed: ${err instanceof Error ? err.message : String(err)}`);
    Sentry.captureException(err, { tags: { mcp_endpoint: 'POST /mcp' } });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Interner Serverfehler' },
        id: null,
      });
    }
  }
});

// Stateless mode has no server-initiated SSE stream and no sessions to terminate,
// so GET/DELETE on /mcp are not applicable.
const methodNotAllowed = (_req: express.Request, res: express.Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method Not Allowed – der Server läuft im stateless JSON-Modus.',
    },
    id: null,
  });
};
app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);

// Server starten
const PORT = process.env.PORT || 3003;
console.log(`[Boot] Starting server on port ${PORT}...`);

// Capture unhandled errors thrown from Express route handlers (registered after
// all routes, before listen). Tool-level exceptions are captured in-handler above.
Sentry.setupExpressErrorHandler(app);

// Periodic sweep: drop the rate-limit bucket map if it grows large so the
// in-memory state stays bounded. unref() so it never keeps the process alive.
setInterval(() => {
  if (rateBuckets.size > 10_000) rateBuckets.clear();
}, 5 * 60_000).unref();

app.listen(PORT, () => {
  // Warm the runtime collection catalog from the backend (non-blocking; falls
  // back to the bundled static catalog on failure). Lets newly added collections
  // appear without an MCP rebuild.
  void fetchCatalog();

  const localUrl = `http://localhost:${PORT}`;
  const publicUrl = config.server.publicUrl;

  console.log('='.repeat(50));
  console.log('Gruenerator MCP Server v1.0.0');
  console.log('='.repeat(50));
  console.log(`Port: ${PORT}`);
  console.log(`Qdrant: ${config.qdrant.url}`);
  console.log(`Sammlungen: ${Object.keys(config.collections).join(', ')}`);
  if (publicUrl) {
    console.log(`Public URL: ${publicUrl}`);
  }
  console.log('='.repeat(50));
  console.log('Endpoints:');
  console.log(`  MCP:        ${localUrl}/mcp`);
  console.log(`  Health:     ${localUrl}/health`);
  console.log(`  Diag:       ${localUrl}/health/mcp`);
  console.log(`  Metrics:    ${localUrl}/metrics`);
  console.log(`  Discovery:  ${localUrl}/.well-known/mcp.json`);
  console.log(`  Info:       ${localUrl}/info`);
  console.log(`  Config:     ${localUrl}/config/:client`);
  console.log('='.repeat(50));
  console.log('Resources:');
  console.log('  gruenerator://system-prompt  <-- AI should read this first');
  console.log('  gruenerator://info');
  console.log('  gruenerator://collections');
  Object.keys(config.collections).forEach((key) => {
    console.log(`  gruenerator://collections/${key}`);
  });
  console.log('='.repeat(50));
  console.log('Prompts:');
  getPromptList().forEach((p) => {
    console.log(`  ${p.name} — ${p.title}`);
  });
  console.log('='.repeat(50));
  info('Boot', 'Server ready for requests');
});
