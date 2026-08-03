/**
 * Bridge route for MCP-Apps widgets — SYSTEM MCP SOURCES ONLY.
 *
 * The sandboxed widget iframe (assistant-ui McpAppRenderer + McpAppsRemoteHost)
 * POSTs `{ method, params }` here to fetch its HTML and drive its interactive
 * bridge. The MCP client lives server-side so credentials + transport never
 * reach the browser.
 *
 * TRUST GATE: the widget metadata carries no serverId, so we resolve the owning
 * source by PROBING the env-configured first-party sources only (bahn/wetter/
 * news/hotel via `getSystemMcpSources`). A user-added connector is never in that
 * set, so it can never be reached — user connectors can't render or drive a
 * widget. `requireAuth` is applied at the prefix in routes.ts; tool calls honor
 * the source `toolAllowlist`.
 */
import { Router, type Request, type Response } from 'express';

import {
  getSystemMcpSources,
  toSystemConnectionConfig,
  type SystemMcpSource,
} from '../../services/mcp/systemMcpServers.js';
import { UserMCPClient, type McpResource } from '../../services/mcp/UserMCPClient.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('mcpApps');

const CACHE_TTL_MS = 10 * 60_000;

interface WidgetCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
}
interface ReadResourcePayload {
  uri: string;
  mimeType: string | null;
  html: string;
  csp: WidgetCsp | null;
}

/** uri → owning system source key, learned on first successful read. */
const uriOwner = new Map<string, string>();
/** widget HTML cache, keyed by uri. */
const widgetCache = new Map<string, { at: number; payload: ReadResourcePayload }>();

function extractCsp(meta: Record<string, unknown> | undefined): WidgetCsp | null {
  if (!meta) return null;
  const ui = meta.ui as { csp?: WidgetCsp } | undefined;
  if (ui?.csp && typeof ui.csp === 'object') return ui.csp;
  const openai = meta['openai/widgetCSP'];
  return openai && typeof openai === 'object' ? (openai as WidgetCsp) : null;
}

/** Run `fn` against connected system clients until one returns a non-null value,
 *  preferring a previously-learned owner. Only system sources are ever touched. */
async function probeSystemSources<T>(
  preferKey: string | undefined,
  fn: (client: UserMCPClient, source: SystemMcpSource) => Promise<T | null>
): Promise<T | null> {
  const sources = getSystemMcpSources();
  const ordered = preferKey
    ? [...sources].sort((a, b) => (a.key === preferKey ? -1 : b.key === preferKey ? 1 : 0))
    : sources;
  for (const source of ordered) {
    const client = new UserMCPClient(toSystemConnectionConfig(source));
    try {
      await client.connect();
      const out = await fn(client, source);
      if (out != null) return out;
    } catch (err) {
      log.warn('probe source failed', { source: source.key, error: String(err) });
    } finally {
      await client.close();
    }
  }
  return null;
}

async function handleReadResource(uri: string, res: Response): Promise<void> {
  const cached = widgetCache.get(uri);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    res.json(cached.payload);
    return;
  }
  const payload = await probeSystemSources<ReadResourcePayload>(
    uriOwner.get(uri),
    async (client, source) => {
      const resource = await client.readResource(uri);
      if (!resource || resource.text == null) return null;
      uriOwner.set(uri, source.key);
      return {
        uri,
        mimeType: resource.mimeType ?? null,
        html: resource.text,
        csp: extractCsp(resource.meta),
      };
    }
  );
  if (!payload) {
    res.status(404).json({ error: 'Widget-Ressource nicht gefunden' });
    return;
  }
  widgetCache.set(uri, { at: Date.now(), payload });
  res.json(payload);
}

export function createMcpAppsRouter(): Router {
  const router = Router();

  // Single dispatch endpoint matching assistant-ui's McpAppsRemoteHost.
  router.post('/', async (req: Request, res: Response) => {
    const { method, params } = (req.body ?? {}) as { method?: unknown; params?: unknown };
    const p = (params ?? {}) as Record<string, unknown>;
    try {
      switch (method) {
        case 'mcp-apps/read-resource':
        case 'resources/read': {
          const uri = p.uri;
          if (typeof uri !== 'string' || uri.length === 0) {
            res.status(400).json({ error: 'uri erforderlich' });
            return;
          }
          await handleReadResource(uri, res);
          return;
        }
        case 'tools/call': {
          const name = p.name;
          const args = (p.arguments ?? {}) as Record<string, unknown>;
          if (typeof name !== 'string' || name.length === 0) {
            res.status(400).json({ error: 'name erforderlich' });
            return;
          }
          const result = await probeSystemSources(undefined, async (client, source) => {
            if (source.toolAllowlist && !source.toolAllowlist.includes(name)) return null;
            const tools = await client.listTools();
            if (!tools.some((t) => t.name === name)) return null;
            return client.callTool(name, args);
          });
          if (!result) {
            res.status(403).json({ error: 'Tool nicht verfügbar' });
            return;
          }
          res.json(result);
          return;
        }
        case 'resources/list': {
          const all: McpResource[] = [];
          await probeSystemSources(undefined, async (client) => {
            all.push(...(await client.listResources()));
            return null; // visit every source
          });
          res.json({ resources: all });
          return;
        }
        default:
          res.status(400).json({ error: 'Unbekannte Methode' });
      }
    } catch (err) {
      log.warn('mcp-apps dispatch failed', { method, error: String(err) });
      res.status(502).json({ error: 'MCP-Apps-Anfrage fehlgeschlagen' });
    }
  });

  return router;
}
