/**
 * Curated directory of official, remote-hosted MCP servers (EXPERIMENTAL).
 *
 * A hand-verified list of servers officially operated by their vendors, sourced
 * from the public Langdock MCP directory + vendor docs, and culled to the ones
 * relevant for a content/communications/campaign organisation (no developer,
 * infra, database, observability or payments tooling). Only remote servers are
 * listed; `UserMCPClient` auto-selects the StreamableHTTP or SSE transport by
 * URL. `authHint` tells the UI what to expect before connecting.
 */

import { type McpRegistryEntry } from '@gruenerator/contracts';

export type { McpRegistryEntry };

export interface McpRegistryPage {
  recommended: McpRegistryEntry[];
  servers: McpRegistryEntry[];
  nextCursor: string | null;
}

type Seed = [
  title: string,
  url: string,
  authHint: McpRegistryEntry['authHint'],
  description: string,
  websiteUrl: string,
  category: string,
  // Provider rejects DCR → user creates an app and pastes Client-ID/Secret.
  opts?: { setupUrl: string },
];

// prettier-ignore
const SEEDS: Seed[] = [
  ['Notion', 'https://mcp.notion.com/mcp', 'oauth', 'Seiten, Datenbanken und Aufgaben durchsuchen und bearbeiten.', 'https://notion.com', 'Produktivität'],
  ['Coda', 'https://coda.io/apis/mcp', 'oauth', 'Dokumente erstellen, Tabellen lesen und Inhalte aktualisieren.', 'https://coda.io', 'Produktivität'],
  ['monday.com', 'https://mcp.monday.com/sse', 'oauth', 'Work OS für Projekte, Aufgaben und Team-Workflows.', 'https://monday.com', 'Produktivität'],
  ['Jamie', 'https://mcp.meetjamie.ai/mcp', 'oauth', 'Meeting-Notizen durchsuchen und Action Items extrahieren.', 'https://meetjamie.ai', 'Produktivität'],
  ['Sally', 'https://app.sally.io/api/v1/McpExternal', 'bearer', 'Termine, Aufzeichnungen, Zusammenfassungen und Transkripte abfragen.', 'https://sally.io', 'Produktivität'],
  ['HubSpot', 'https://app.hubspot.com/mcp/v1/http', 'bearer', 'Kontakte, Deals, Unternehmen und Marketing-Daten.', 'https://hubspot.com', 'CRM & Marketing'],
  // websiteUrl deep-links to the API-keys page — the MCP token is created there
  // (Account > SMTP & API > API Keys, "MCP" option checked).
  ['Brevo', 'https://mcp.brevo.com/v1/brevo/mcp', 'bearer', 'Kontakte, E-Mail-Kampagnen, Newsletter-Listen und CRM verwalten.', 'https://app.brevo.com/settings/keys/api', 'CRM & Marketing'],
  ['Attio', 'https://mcp.attio.com/mcp', 'oauth', 'CRM für Beziehungen, Kontakte und Deals.', 'https://attio.com', 'CRM & Marketing'],
  ['Statista', 'https://api.statista.ai/v1/mcp', 'bearer', 'Statistiken, Konsumenten- und Marktdaten.', 'https://statista.com', 'Analyse & SEO'],
  ['SISTRIX', 'https://api.sistrix.com/mcp/', 'bearer', 'SEO-Metriken, Sichtbarkeit und Keyword-Rankings.', 'https://sistrix.com', 'Analyse & SEO'],
  ['Zapier', 'https://mcp.zapier.com/api/mcp/mcp', 'bearer', 'Über 7.000 Apps und Workflows verbinden.', 'https://zapier.com', 'Automatisierung'],
  ['Google Maps', 'https://mapstools.googleapis.com/mcp', 'bearer', 'Geocoding, Places, Routing und Kartendaten.', 'https://developers.google.com/maps', 'Karten'],
  ['Tally', 'https://api.tally.so/mcp', 'oauth', 'Formulare erstellen, bearbeiten und Antworten auswerten.', 'https://tally.so', 'Formulare'],
  ['Todoist', 'https://ai.todoist.net/mcp', 'oauth', 'Aufgaben, Projekte und To-do-Listen verwalten.', 'https://todoist.com', 'Produktivität'],
  ['Miro', 'https://mcp.miro.com/', 'oauth', 'Whiteboards, Boards und Diagramme lesen und bearbeiten.', 'https://miro.com', 'Produktivität'],
  // Goodnotes serves MCP without any auth (verified 2026-07-21).
  ['Goodnotes', 'https://claude-mcp-api.ml.goodnotes.com/mcp', 'none', 'Notizen und handschriftliche Dokumente durchsuchen und verwalten.', 'https://goodnotes.com', 'Produktivität'],
  // Removed (audit 2026-07-21): IFTTT, Booking.com, Expedia — allowlisted
  // clients only (no DCR for our domain, no public app registration); Typeform,
  // Typeform (EU), Zoom, DocuSign — would require users to register their own
  // vendor app (manual Client-ID/Secret), deliberately shelved for now.
  ['Yahoo Finance', 'https://gateway.mcpservers.org/yahoo-finance/mcp', 'none', 'Marktdaten, Finanznachrichten, Kennzahlen und Kursverläufe abfragen.', 'https://finance.yahoo.com', 'Finanzen'],
  ['Jotform', 'https://mcp.jotform.com/mcp-app', 'oauth', 'Formulare erstellen und Antworten auswerten.', 'https://jotform.com', 'Formulare'],
  ['Swat.io', 'https://mcp.swatio.app/mcp', 'oauth', 'Social-Media-Beiträge planen und vorbereiten (Beta; kein Direkt-Publishing).', 'https://swat.io', 'Social Media'],
  ['Ansvar', 'https://gateway.ansvar.eu/mcp', 'oauth', 'EU-Recht und Compliance recherchieren — mit verifizierten Zitaten und Quellenangaben.', 'https://ansvar.eu', 'Recht & Compliance'],
];

const RECOMMENDED: McpRegistryEntry[] = SEEDS.map(
  ([title, url, authHint, description, websiteUrl, category, opts]) => ({
    name: new URL(url).host,
    title,
    url,
    authHint,
    description,
    websiteUrl,
    category,
    recommended: true,
    ...(opts ? { requiresManualRegistration: true, setupUrl: opts.setupUrl } : {}),
  })
);

const SEED_BY_HOST = new Map(RECOMMENDED.map((e) => [e.name, e]));

/**
 * Resolve a curated seed for a server URL by host (falls back to exact URL).
 * Enriches per-user server records with a stable German description and lets the
 * classifier name a connected service — without re-deriving copy on the client.
 */
export function findSeedByUrl(url: string): McpRegistryEntry | null {
  try {
    return SEED_BY_HOST.get(new URL(url).host) ?? null;
  } catch {
    return RECOMMENDED.find((e) => e.url === url) ?? null;
  }
}

const OFFICIAL_REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0/servers';
const REGISTRY_TIMEOUT_MS = 6000;
const REGISTRY_PAGE_SIZE = 30;

interface OfficialServer {
  name?: string;
  description?: string;
  remotes?: Array<{ type?: string; url?: string }>;
}

/** Prettify a reverse-DNS registry name ("io.github.acme/notion-mcp" → "notion mcp"). */
function officialTitle(name: string, host: string): string {
  const seg = name.split('/').pop() ?? name;
  const cleaned = seg.replace(/[._-]+/g, ' ').trim();
  return cleaned || host;
}

/**
 * Best-effort "Server suchen": search the official MCP registry for REMOTE
 * servers and map them to McpRegistryEntry (authHint 'unknown' — the registry
 * doesn't declare auth; the add-form lets the user pick). Curated hosts are
 * filtered out so we don't double-list. Any error/timeout degrades to an empty
 * page — the external register never blocks the curated directory. Only a fixed,
 * trusted host is fetched (search/cursor ride as URL-encoded query params), so no
 * SSRF surface.
 */
async function fetchOfficialRegistry(
  search: string,
  cursor: string | undefined
): Promise<{ servers: McpRegistryEntry[]; nextCursor: string | null }> {
  const url = new URL(OFFICIAL_REGISTRY_URL);
  url.searchParams.set('search', search);
  url.searchParams.set('limit', String(REGISTRY_PAGE_SIZE));
  if (cursor) url.searchParams.set('cursor', cursor);

  let json: unknown;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return { servers: [], nextCursor: null };
    json = await res.json();
  } catch {
    return { servers: [], nextCursor: null };
  }

  // The registry has wrapped each entry as `{ server, _meta }` in some versions
  // and as a bare object in others — handle both. Cursor is `metadata.next_cursor`.
  const root = json as {
    servers?: Array<OfficialServer & { server?: OfficialServer }>;
    metadata?: { next_cursor?: string | null; nextCursor?: string | null };
  };
  const raw = Array.isArray(root.servers) ? root.servers : [];
  const seen = new Set(SEED_BY_HOST.keys());
  const servers: McpRegistryEntry[] = [];
  for (const item of raw) {
    const s = item.server ?? item;
    const remoteUrl = s.remotes?.find((r) => typeof r?.url === 'string' && r.url)?.url;
    if (!remoteUrl) continue; // remote servers only (skip stdio/npm-only)
    let host: string;
    try {
      host = new URL(remoteUrl).host;
    } catch {
      continue;
    }
    if (seen.has(host)) continue; // dedup vs curated + within the page
    seen.add(host);
    servers.push({
      name: host,
      title: officialTitle(s.name ?? host, host),
      url: remoteUrl,
      authHint: 'unknown',
      description: (s.description ?? '').slice(0, 200),
      websiteUrl: null,
      recommended: false,
    });
  }
  const nextCursor = root.metadata?.next_cursor ?? root.metadata?.nextCursor ?? null;
  return { servers, nextCursor: servers.length ? nextCursor : null };
}

export class McpRegistryService {
  /**
   * Curated directory (filtered by search over title/description/category) plus,
   * when a search term is present, remote servers discovered in the official MCP
   * registry (`servers`, paginated by `nextCursor`). The external "Server suchen"
   * is best-effort — any failure degrades to an empty `servers` list.
   */
  static async list(params: { search?: string; cursor?: string }): Promise<McpRegistryPage> {
    const term = params.search?.trim() ?? '';
    const search = term.toLowerCase();
    const recommended = search
      ? RECOMMENDED.filter(
          (e) =>
            e.title.toLowerCase().includes(search) ||
            e.description.toLowerCase().includes(search) ||
            (e.category?.toLowerCase().includes(search) ?? false)
        )
      : RECOMMENDED;
    // Only poll the open registry on an actual search (no firehose on load).
    const external = term
      ? await fetchOfficialRegistry(term, params.cursor)
      : { servers: [] as McpRegistryEntry[], nextCursor: null };
    return { recommended, servers: external.servers, nextCursor: external.nextCursor };
  }
}

export default McpRegistryService;
