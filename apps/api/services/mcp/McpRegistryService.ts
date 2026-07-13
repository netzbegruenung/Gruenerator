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
  ['Wix', 'https://mcp.wix.com/mcp', 'oauth', 'Wix-Websites erstellen und verwalten.', 'https://wix.com', 'Web & Design'],
  ['Webflow', 'https://mcp.webflow.com/mcp', 'oauth', 'Webflow-Projekte und Inhalte.', 'https://webflow.com', 'Web & Design'],
  ['Zapier', 'https://mcp.zapier.com/api/mcp/mcp', 'bearer', 'Über 7.000 Apps und Workflows verbinden.', 'https://zapier.com', 'Automatisierung'],
  ['Google Maps', 'https://mapstools.googleapis.com/mcp', 'bearer', 'Geocoding, Places, Routing und Kartendaten.', 'https://developers.google.com/maps', 'Karten'],
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

export class McpRegistryService {
  /**
   * Returns the curated directory, optionally filtered by a search term over
   * title/description. `servers` is always empty (the open registry firehose is
   * deliberately not surfaced); the frontend renders `recommended`.
   */
  static list(params: { search?: string; cursor?: string }): McpRegistryPage {
    const search = params.search?.trim().toLowerCase() || '';
    const recommended = search
      ? RECOMMENDED.filter(
          (e) =>
            e.title.toLowerCase().includes(search) ||
            e.description.toLowerCase().includes(search) ||
            (e.category?.toLowerCase().includes(search) ?? false)
        )
      : RECOMMENDED;
    return { recommended, servers: [], nextCursor: null };
  }
}

export default McpRegistryService;
