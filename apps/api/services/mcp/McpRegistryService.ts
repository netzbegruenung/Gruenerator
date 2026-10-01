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

import { type McpAuthType, type McpRegistryEntry } from '@gruenerator/contracts';

import { env } from '../../config/env.js';

export type { McpRegistryEntry };

export interface McpRegistryPage {
  recommended: McpRegistryEntry[];
  servers: McpRegistryEntry[];
  nextCursor: string | null;
}

type Seed = [
  title: string,
  url: string,
  authHint: McpAuthType,
  description: string,
  websiteUrl: string,
  category: string,
  opts?: SeedOpts,
];

interface SeedOpts {
  // Provider rejects DCR → user creates an app and pastes Client-ID/Secret.
  setupUrl?: string;
  // Further auth ways after `authHint`, e.g. a provider that offers OAuth AND
  // API keys. The UI offers them as "Stattdessen …".
  alt?: McpAuthType[];
  // Where the user creates the API key for the bearer path.
  keyUrl?: string;
  // Server-side only. The provider wants the key raw in this header instead of
  // `Authorization: Bearer` (Google answers that with "Expected OAuth 2 access
  // token").
  keyHeader?: string;
  // Server-side only. Env names of a client we registered with the provider
  // ourselves — for an AS that admits only allowlisted or portal-created
  // clients. Unset env → dynamic registration as usual.
  clientEnv?: { id: string; secret: string };
  // The provider has no dynamic registration either: without `clientEnv`
  // configured, nobody can connect, so the entry is not listed at all.
  platformOnly?: true;
}

/** Connection details a seed carries that never go over the wire. */
export interface SeedConnectionHints {
  keyHeader?: string;
  clientEnv?: { id: string; secret: string };
}

// prettier-ignore
const SEEDS: Seed[] = [
  ['Notion', 'https://mcp.notion.com/mcp', 'oauth', 'Seiten, Datenbanken und Aufgaben durchsuchen und bearbeiten.', 'https://notion.com', 'Produktivität'],
  ['Coda', 'https://coda.io/apis/mcp', 'oauth', 'Dokumente erstellen, Tabellen lesen und Inhalte aktualisieren.', 'https://coda.io', 'Produktivität'],
  ['monday.com', 'https://mcp.monday.com/sse', 'oauth', 'Work OS für Projekte, Aufgaben und Team-Workflows.', 'https://monday.com', 'Produktivität'],
  ['Jamie', 'https://mcp.meetjamie.ai/mcp', 'oauth', 'Meeting-Notizen durchsuchen und Action Items extrahieren.', 'https://meetjamie.ai', 'Produktivität'],
  // OAuth-or-key providers below: discovery + DCR checked live 2026-10-01.
  ['Sally', 'https://app.sally.io/api/v1/McpExternal', 'oauth', 'Termine, Aufzeichnungen, Zusammenfassungen und Transkripte abfragen.', 'https://sally.io', 'Produktivität', { alt: ['bearer'] }],
  ['HubSpot', 'https://app.hubspot.com/mcp/v1/http', 'bearer', 'Kontakte, Deals, Unternehmen und Marketing-Daten.', 'https://hubspot.com', 'CRM & Marketing'],
  // Key path: Account > SMTP & API > API Keys, "MCP" option checked. The AS
  // accepts public clients only (`token_endpoint_auth_methods_supported: none`).
  ['Brevo', 'https://mcp.brevo.com/v1/brevo/mcp', 'oauth', 'Kontakte, E-Mail-Kampagnen, Newsletter-Listen und CRM verwalten.', 'https://brevo.com', 'CRM & Marketing', { alt: ['bearer'], keyUrl: 'https://app.brevo.com/settings/keys/api' }],
  ['Attio', 'https://mcp.attio.com/mcp', 'oauth', 'CRM für Beziehungen, Kontakte und Deals.', 'https://attio.com', 'CRM & Marketing'],
  ['Statista', 'https://api.statista.ai/v1/mcp', 'oauth', 'Statistiken, Konsumenten- und Marktdaten.', 'https://statista.com', 'Analyse & SEO', { alt: ['bearer'] }],
  ['SISTRIX', 'https://api.sistrix.com/mcp/', 'oauth', 'SEO-Metriken, Sichtbarkeit und Keyword-Rankings.', 'https://sistrix.com', 'Analyse & SEO', { alt: ['bearer'] }],
  ['Zapier', 'https://mcp.zapier.com/api/mcp/mcp', 'oauth', 'Über 7.000 Apps und Workflows verbinden.', 'https://zapier.com', 'Automatisierung', { alt: ['bearer'] }],
  // A Maps API key, sent as X-Goog-Api-Key — as `Authorization: Bearer` Google
  // takes it for an OAuth token and rejects every tool call (checked 2026-10-01).
  ['Google Maps', 'https://mapstools.googleapis.com/mcp', 'bearer', 'Geocoding, Places, Routing und Kartendaten.', 'https://developers.google.com/maps', 'Karten', { keyUrl: 'https://console.cloud.google.com/google/maps-apis/credentials', keyHeader: 'X-Goog-Api-Key' }],
  ['Tally', 'https://api.tally.so/mcp', 'oauth', 'Formulare erstellen, bearbeiten und Antworten auswerten.', 'https://tally.so', 'Formulare', { alt: ['bearer'], keyUrl: 'https://tally.so/settings/api-keys' }],
  // Typeform allowlists gruenerator.eu for DCR (verified 2026-09-14). Its
  // account regions are separate MCP resources, so offer each documented
  // endpoint rather than routing a user's OAuth token across regions.
  ['Typeform', 'https://api.typeform.com/mcp', 'oauth', 'Formulare erstellen, bearbeiten, veröffentlichen und Antworten auswerten.', 'https://typeform.com', 'Formulare'],
  ['Typeform (EU – .com)', 'https://api.eu.typeform.com/mcp', 'oauth', 'Formulare und Antworten im EU-Rechenzentrum (api.eu.typeform.com) verwalten.', 'https://typeform.com', 'Formulare'],
  ['Typeform (EU – .eu)', 'https://api.typeform.eu/mcp', 'oauth', 'Formulare und Antworten im EU-Rechenzentrum (api.typeform.eu) verwalten.', 'https://typeform.com', 'Formulare'],
  ['Todoist', 'https://ai.todoist.net/mcp', 'oauth', 'Aufgaben, Projekte und To-do-Listen verwalten.', 'https://todoist.com', 'Produktivität', { alt: ['bearer'], keyUrl: 'https://app.todoist.com/app/settings/integrations/developer' }],
  ['Miro', 'https://mcp.miro.com/', 'oauth', 'Whiteboards, Boards und Diagramme lesen und bearbeiten.', 'https://miro.com', 'Produktivität'],
  // Goodnotes serves MCP without any auth (verified 2026-07-21).
  ['Goodnotes', 'https://claude-mcp-api.ml.goodnotes.com/mcp', 'none', 'Notizen und handschriftliche Dokumente durchsuchen und verwalten.', 'https://goodnotes.com', 'Produktivität'],
  // Removed (audit 2026-07-21): IFTTT, Booking.com, Expedia — allowlisted
  // clients only (no DCR for our domain, no public app registration); DocuSign
  // still requires users to register their own vendor app.
  // Zoom: OAuth without DCR or CIMD (checked 2026-10-01), so it runs on our own
  // Marketplace app (General app, user-level OAuth). The PRM names the global
  // host as the resource; the regional gateways answer for the same resource.
  ['Zoom', 'https://mcp.zoom.us/mcp/zoom/streamable', 'oauth', 'Meetings planen, Aufzeichnungen und Meeting-Zusammenfassungen durchsuchen.', 'https://zoom.us', 'Kommunikation', { clientEnv: { id: 'ZOOM_MCP_CLIENT_ID', secret: 'ZOOM_MCP_CLIENT_SECRET' }, platformOnly: true }],
  ['Yahoo Finance', 'https://gateway.mcpservers.org/yahoo-finance/mcp', 'none', 'Marktdaten, Finanznachrichten, Kennzahlen und Kursverläufe abfragen.', 'https://finance.yahoo.com', 'Finanzen'],
  ['Jotform', 'https://mcp.jotform.com/mcp-app', 'oauth', 'Formulare erstellen und Antworten auswerten.', 'https://jotform.com', 'Formulare'],
  ['Swat.io', 'https://mcp.swatio.app/mcp', 'oauth', 'Social-Media-Beiträge planen und vorbereiten (Beta; kein Direkt-Publishing).', 'https://swat.io', 'Social Media'],
  // Canva admits portal-created or allowlisted clients only; DCR is deprecated
  // there. Without CANVA_MCP_* set, connecting falls back to DCR and shows the
  // manual-registration form if Canva refuses it.
  ['Canva', 'https://mcp.canva.com/mcp', 'oauth', 'Designs erstellen, bearbeiten und exportieren, Vorlagen und Marken-Kits nutzen.', 'https://canva.com', 'Design', { clientEnv: { id: 'CANVA_MCP_CLIENT_ID', secret: 'CANVA_MCP_CLIENT_SECRET' } }],
  ['Ansvar', 'https://gateway.ansvar.eu/mcp', 'oauth', 'EU-Recht und Compliance recherchieren — mit verifizierten Zitaten und Quellenangaben.', 'https://ansvar.eu', 'Recht & Compliance'],
];

const RECOMMENDED: McpRegistryEntry[] = SEEDS.map(
  ([title, url, authHint, description, websiteUrl, category, opts]) => ({
    name: new URL(url).host,
    title,
    url,
    authHint,
    authOptions: [authHint, ...(opts?.alt ?? [])],
    description,
    websiteUrl,
    category,
    recommended: true,
    ...(opts?.keyUrl ? { keyUrl: opts.keyUrl } : {}),
    ...(opts?.setupUrl ? { requiresManualRegistration: true, setupUrl: opts.setupUrl } : {}),
  })
);

const SEED_BY_HOST = new Map(RECOMMENDED.map((e) => [e.name, e]));

const HINTS_BY_HOST = new Map<string, SeedConnectionHints>(
  SEEDS.flatMap(([, url, , , , , opts]) =>
    opts?.keyHeader || opts?.clientEnv
      ? [
          [
            new URL(url).host,
            {
              ...(opts.keyHeader ? { keyHeader: opts.keyHeader } : {}),
              ...(opts.clientEnv ? { clientEnv: opts.clientEnv } : {}),
            },
          ],
        ]
      : []
  )
);

/**
 * The OAuth client we registered with this host's provider ourselves, from env.
 * Read on every use — never copied into a row — so a rotated secret reaches
 * every user at once. Null when the seed has none or the env is unset.
 */
export function platformClient(url: string): { clientId: string; clientSecret: string } | null {
  const names = seedConnectionHints(url).clientEnv;
  if (!names) return null;
  // Boundary read: the seed names env keys as plain strings.
  const vars = env as unknown as Record<string, string | undefined>;
  const clientId = vars[names.id];
  const clientSecret = vars[names.secret];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

const PLATFORM_ONLY_URLS = new Set(
  SEEDS.filter(([, , , , , , opts]) => opts?.platformOnly).map(([, url]) => url)
);

/** Server-side connection hints for a curated host; empty for anything else. */
export function seedConnectionHints(url: string): SeedConnectionHints {
  try {
    return HINTS_BY_HOST.get(new URL(url).host) ?? {};
  } catch {
    return {};
  }
}

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
    const offered = RECOMMENDED.filter(
      (e) => !PLATFORM_ONLY_URLS.has(e.url) || platformClient(e.url) !== null
    );
    const recommended = search
      ? offered.filter(
          (e) =>
            e.title.toLowerCase().includes(search) ||
            e.description.toLowerCase().includes(search) ||
            (e.category?.toLowerCase().includes(search) ?? false)
        )
      : offered;
    // Only poll the open registry on an actual search (no firehose on load).
    const external = term
      ? await fetchOfficialRegistry(term, params.cursor)
      : { servers: [] as McpRegistryEntry[], nextCursor: null };
    return { recommended, servers: external.servers, nextCursor: external.nextCursor };
  }
}

export default McpRegistryService;
