#!/usr/bin/env node

console.log('[Boot] Starting Gruenerator MCP Server...');
console.log(`[Boot] Node.js ${process.version}`);
console.log(`[Boot] Environment: ${process.env.NODE_ENV || 'development'}`);

console.log('[Boot] Loading dependencies...');
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
console.log('[Boot] Dependencies loaded');

console.log('[Boot] Loading config...');
import { config, validateConfig } from './config.js';
import { searchTool, cacheStatsTool } from './tools/search.js';
import { clientConfigTool } from './tools/clientConfig.js';
import { filtersTool } from './tools/filters.js';
import { personSearchTool } from './tools/personSearch.js';
import { examplesSearchTool } from './tools/examplesSearch.js';
import { getCacheStats } from './utils/cache.js';
import { info, error, logSearch, getStats } from './utils/logger.js';
import { getCollectionResources, getCollectionResource, getServerInfoResource, readServerInfoResource } from './resources/collections.js';
import { getSystemPromptResource } from './resources/systemPrompt.js';
console.log('[Boot] Config loaded');

// Konfiguration validieren
console.log('[Config] Validating environment variables...');
try {
  validateConfig();
  console.log('[Config] Validation successful');
} catch (err) {
  console.error(`[Config] ERROR: ${err.message}`);
  console.error('[Config] Required: QDRANT_URL, QDRANT_API_KEY, MISTRAL_API_KEY');
  process.exit(1);
}

console.log('[Boot] Setting up Express...');
const app = express();
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'mcp-session-id'],
  exposedHeaders: ['Mcp-Session-Id'],
}));
console.log('[Boot] Express configured');

// Helper: Base URL ermitteln
function getBaseUrl(req) {
  return config.server.publicUrl || `${req.protocol}://${req.get('host')}`;
}

// Session-Verwaltung
const transports = {};

// MCP Server Factory
function createMcpServer(baseUrl) {
  const server = new McpServer({
    name: 'gruenerator-mcp',
    version: '1.0.0'
  });

  // === MCP RESOURCES ===

  // List available resources
  server.resource(
    'gruenerator://collections',
    'Verfügbare Dokumentsammlungen',
    async () => {
      const resources = await getCollectionResources();
      return {
        contents: [{
          uri: 'gruenerator://collections',
          mimeType: 'application/json',
          text: JSON.stringify({ collections: resources }, null, 2)
        }]
      };
    }
  );

  // Server info resource
  server.resource(
    'gruenerator://info',
    'Server-Informationen und Fähigkeiten',
    () => readServerInfoResource()
  );

  // System prompt resource - AI systems should read this first
  server.resource(
    'gruenerator://system-prompt',
    'Anleitung zur Nutzung des MCP Servers (für AI-Assistenten)',
    () => getSystemPromptResource()
  );

  // Dynamic collection resources
  for (const [key, col] of Object.entries(config.collections)) {
    server.resource(
      `gruenerator://collections/${key}`,
      `${col.displayName}: ${col.description}`,
      async () => {
        const resource = await getCollectionResource(`gruenerator://collections/${key}`);
        return resource || {
          contents: [{
            uri: `gruenerator://collections/${key}`,
            mimeType: 'application/json',
            text: JSON.stringify({ error: 'Collection not found' })
          }]
        };
      }
    );
  }

  // === MCP TOOLS ===

  // Search Tool with annotations
  server.tool(
    searchTool.name,
    searchTool.inputSchema,
    async ({ query, collection, searchMode = 'hybrid', limit = 5, filters, useCache = true }) => {
      const startTime = Date.now();

      try {
        const result = await searchTool.handler({ query, collection, searchMode, limit, filters, useCache });
        const responseTime = Date.now() - startTime;

        // Log the search
        logSearch(
          query,
          collection,
          searchMode,
          result.resultsCount || 0,
          responseTime,
          result.cached || false
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }],
          isError: !!result.error
        };
      } catch (err) {
        error('Search', `Search failed: ${err.message}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: true, message: err.message })
          }],
          isError: true
        };
      }
    }
  );

  // Cache Stats Tool
  server.tool(
    cacheStatsTool.name,
    cacheStatsTool.inputSchema,
    async () => {
      const result = await cacheStatsTool.handler();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  );

  // Client Config Tool
  server.tool(
    clientConfigTool.name,
    clientConfigTool.inputSchema,
    async ({ client }) => {
      const result = clientConfigTool.handler({ client }, baseUrl);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  );

  // Filters Tool
  server.tool(
    filtersTool.name,
    filtersTool.inputSchema,
    async ({ collection }) => {
      try {
        const result = await filtersTool.handler({ collection });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }],
          isError: !!result.error
        };
      } catch (err) {
        error('Filters', `Filter fetch failed: ${err.message}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: true, message: err.message })
          }],
          isError: true
        };
      }
    }
  );

  // Person Search Tool
  server.tool(
    personSearchTool.name,
    personSearchTool.inputSchema,
    async (params) => {
      try {
        const result = await personSearchTool.handler(params);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }],
          isError: !!result.error
        };
      } catch (err) {
        error('PersonSearch', `Person search failed: ${err.message}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: true, message: err.message, isPersonQuery: false })
          }],
          isError: true
        };
      }
    }
  );

  // Examples Search Tool
  server.tool(
    examplesSearchTool.name,
    examplesSearchTool.inputSchema,
    async (params) => {
      try {
        const result = await examplesSearchTool.handler(params);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }],
          isError: !!result.error
        };
      } catch (err) {
        error('ExamplesSearch', `Examples search failed: ${err.message}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: true, message: err.message, resultsCount: 0, examples: [] })
          }],
          isError: true
        };
      }
    }
  );

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
      searchEntries: cacheStats.search.entries
    },
    requests: serverStats.requests,
    performance: serverStats.performance
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
      environment: process.env.NODE_ENV || 'development'
    },
    uptime: serverStats.uptime,
    requests: serverStats.requests,
    performance: serverStats.performance,
    breakdown: serverStats.breakdown,
    cache: cacheStats,
    memory: {
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }
  });
});

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
    tools: [
      {
        name: 'gruenerator_search',
        description: 'Durchsucht Grüne Parteiprogramme mit hybrid/vector/text Suche',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'gruenerator_get_filters',
        description: 'Gibt verfügbare Filterwerte für eine Sammlung zurück',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'gruenerator_cache_stats',
        description: 'Zeigt Cache-Statistiken für die Suche',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'get_client_config',
        description: 'Generiert fertige MCP-Client-Konfigurationen',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'gruenerator_person_search',
        description: 'Sucht nach Grünen-Abgeordneten mit angereicherten Daten aus der DIP-API',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'gruenerator_examples_search',
        description: 'Sucht nach Social-Media-Beispielen der Grünen (Instagram, Facebook)',
        annotations: { readOnlyHint: true, idempotentHint: true }
      }
    ],
    resources: [
      { uri: 'gruenerator://system-prompt', name: 'Anleitung für AI-Assistenten', priority: 'high' },
      { uri: 'gruenerator://info', name: 'Server Info' },
      { uri: 'gruenerator://collections', name: 'Alle Sammlungen' },
      ...Object.entries(config.collections).map(([key, col]) => ({
        uri: `gruenerator://collections/${key}`,
        name: col.displayName
      }))
    ],
    collections: Object.entries(config.collections).map(([key, col]) => ({
      id: key,
      name: col.displayName,
      description: col.description
    })),
    supported_clients: ['claude', 'cursor', 'vscode', 'chatgpt']
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
      available: validClients
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
      uptime: serverStats.uptime
    },
    endpoints: {
      mcp: `${baseUrl}/mcp`,
      health: `${baseUrl}/health`,
      metrics: `${baseUrl}/metrics`,
      discovery: `${baseUrl}/.well-known/mcp.json`,
      config: `${baseUrl}/config/:client`,
      info: `${baseUrl}/info`
    },
    tools: [
      {
        name: 'gruenerator_search',
        description: 'Durchsucht Grüne Parteiprogramme mit hybrid/vector/text Suche',
        collections: Object.keys(config.collections),
        searchModes: ['hybrid', 'vector', 'text'],
        features: ['caching', 'metadata-filtering', 'german-optimization'],
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'gruenerator_get_filters',
        description: 'Gibt verfügbare Filterwerte für eine Sammlung zurück',
        collections: Object.keys(config.collections),
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'gruenerator_cache_stats',
        description: 'Zeigt Cache-Statistiken für Embeddings und Suche',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'get_client_config',
        description: 'Generiert MCP-Client-Konfigurationen',
        clients: ['claude', 'cursor', 'vscode'],
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'gruenerator_person_search',
        description: 'Sucht nach Grünen-Abgeordneten mit angereicherten Daten aus der DIP-API',
        features: ['Personenprofil', 'Drucksachen', 'Aktivitäten', 'Erwähnungen'],
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'gruenerator_examples_search',
        description: 'Sucht nach Social-Media-Beispielen der Grünen',
        platforms: ['instagram', 'facebook'],
        countries: ['DE', 'AT'],
        annotations: { readOnlyHint: true, idempotentHint: true }
      }
    ],
    resources: [
      { uri: 'gruenerator://system-prompt', description: 'Anleitung für AI-Assistenten (zuerst lesen!)' },
      { uri: 'gruenerator://info', description: 'Server-Informationen' },
      { uri: 'gruenerator://collections', description: 'Alle verfügbaren Sammlungen' },
      ...Object.entries(config.collections).map(([key, col]) => ({
        uri: `gruenerator://collections/${key}`,
        description: col.description
      }))
    ],
    collections: Object.entries(config.collections).map(([key, col]) => ({
      id: key,
      name: col.displayName,
      description: col.description
    })),
    links: {
      github: 'https://github.com/Movm/Gruenerator-MCP',
      documentation: 'https://github.com/Movm/Gruenerator-MCP#readme'
    }
  });
});

// MCP POST Endpoint (Hauptkommunikation)
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  let transport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport;
        info('Session', `New session: ${id}`);
      },
      onsessionclosed: (id) => {
        delete transports[id];
        info('Session', `Session closed: ${id}`);
      }
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    const baseUrl = getBaseUrl(req);
    const server = createMcpServer(baseUrl);
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Ungültige Session' },
      id: null
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// MCP GET Endpoint (SSE Stream)
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const transport = transports[sessionId];

  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: 'Ungültige Session' });
  }
});

// MCP DELETE Endpoint (Session beenden)
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const transport = transports[sessionId];

  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: 'Ungültige Session' });
  }
});

// Server starten
const PORT = process.env.PORT || 3000;
console.log(`[Boot] Starting server on port ${PORT}...`);

app.listen(PORT, () => {
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
  console.log(`  Metrics:    ${localUrl}/metrics`);
  console.log(`  Discovery:  ${localUrl}/.well-known/mcp.json`);
  console.log(`  Info:       ${localUrl}/info`);
  console.log(`  Config:     ${localUrl}/config/:client`);
  console.log('='.repeat(50));
  console.log('Resources:');
  console.log('  gruenerator://system-prompt  <-- AI should read this first');
  console.log('  gruenerator://info');
  console.log('  gruenerator://collections');
  Object.keys(config.collections).forEach(key => {
    console.log(`  gruenerator://collections/${key}`);
  });
  console.log('='.repeat(50));
  info('Boot', 'Server ready for requests');
});
