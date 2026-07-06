/**
 * MCP server discovery via the official registry (EXPERIMENTAL).
 *
 * Proxies the official Model Context Protocol registry
 * (https://registry.modelcontextprotocol.io/v0/servers), filtered to servers
 * that expose a **remote StreamableHTTP** endpoint — the only transport we
 * support. Results are cached briefly. A small hand-curated RECOMMENDED list
 * (verified official URLs) is featured on top; the registry provides the
 * searchable long tail.
 *
 * We fetch a single trusted host (no user-supplied URL), so no SSRF surface
 * here — the returned server URLs are only ever handed to the user, never
 * fetched by us at this layer.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('mcp-registry');

const REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0/servers';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

export interface McpRegistryEntry {
  /** Registry identifier or a stable synthetic id for curated entries. */
  name: string;
  title: string;
  description: string;
  url: string;
  websiteUrl?: string | null;
  /** Hint for the UI so it can label auth expectations before connecting. */
  authHint: 'none' | 'bearer' | 'oauth' | 'unknown';
  recommended: boolean;
}

export interface McpRegistryPage {
  recommended: McpRegistryEntry[];
  servers: McpRegistryEntry[];
  nextCursor: string | null;
}

/**
 * Curated, URL-verified marquee servers. Keyed by their canonical remote URL so
 * we never depend on a registry `name` (official endpoints are often submitted
 * under community names). Extend freely — this is the single source of truth
 * for "featured". OAuth entries only fully connect once the OAuth flow ships
 * (v2); until then the UI labels them accordingly.
 */
const RECOMMENDED: McpRegistryEntry[] = [
  {
    name: 'com.notion/mcp',
    title: 'Notion',
    description: 'Seiten, Datenbanken und Aufgaben in Notion durchsuchen und bearbeiten.',
    url: 'https://mcp.notion.com/mcp',
    websiteUrl: 'https://notion.com',
    authHint: 'oauth',
    recommended: true,
  },
  {
    name: 'com.linear/mcp',
    title: 'Linear',
    description: 'Issues, Projekte und Zyklen in Linear abfragen und anlegen.',
    url: 'https://mcp.linear.app/mcp',
    websiteUrl: 'https://linear.app',
    authHint: 'oauth',
    recommended: true,
  },
];

const RECOMMENDED_URLS = new Set(RECOMMENDED.map((r) => r.url.replace(/\/$/, '')));

interface RawRegistryServer {
  name?: string;
  title?: string;
  description?: string;
  websiteUrl?: string;
  remotes?: Array<{ type?: string; url?: string }>;
}
interface RawRegistryResponse {
  servers?: Array<{ server?: RawRegistryServer }>;
  metadata?: { nextCursor?: string | null; count?: number };
}

const cache = new Map<string, { at: number; page: McpRegistryPage }>();

function mapEntry(s: RawRegistryServer): McpRegistryEntry | null {
  const remote = s.remotes?.find((r) => r.type === 'streamable-http' && r.url);
  if (!remote?.url || !s.name) return null;
  // Skip URL templates (e.g. https://{HOST}/mcp) — not directly connectable.
  if (/\{[^}]+\}/.test(remote.url)) return null;
  const normalized = remote.url.replace(/\/$/, '');
  return {
    name: s.name,
    title: s.title || s.name,
    description: s.description || '',
    url: remote.url,
    websiteUrl: s.websiteUrl ?? null,
    authHint: 'unknown',
    recommended: RECOMMENDED_URLS.has(normalized),
  };
}

export class McpRegistryService {
  static async list(params: { search?: string; cursor?: string }): Promise<McpRegistryPage> {
    const search = params.search?.trim() || '';
    const cursor = params.cursor || '';
    const cacheKey = `${search}|${cursor}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.page;

    const query = new URLSearchParams({ limit: '50' });
    if (search) query.set('search', search);
    if (cursor) query.set('cursor', cursor);

    let servers: McpRegistryEntry[] = [];
    let nextCursor: string | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(`${REGISTRY_URL}?${query.toString()}`, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`Registry HTTP ${res.status}`);
      const data = (await res.json()) as RawRegistryResponse;
      servers = (data.servers ?? [])
        .map((row) => (row.server ? mapEntry(row.server) : null))
        .filter((e): e is McpRegistryEntry => e !== null);
      nextCursor = data.metadata?.nextCursor ?? null;
    } catch (err) {
      log.warn('Registry fetch failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Degrade gracefully: still surface the curated recommendations.
    }

    // Featured recommendations only on the first (unsearched) page; when the
    // user is searching, fold matches into the results instead.
    const page: McpRegistryPage = {
      recommended: search || cursor ? [] : RECOMMENDED,
      servers,
      nextCursor,
    };
    cache.set(cacheKey, { at: Date.now(), page });
    return page;
  }
}

export default McpRegistryService;
