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
];

// prettier-ignore
const SEEDS: Seed[] = [
  ['Notion', 'https://mcp.notion.com/mcp', 'oauth', 'Seiten, Datenbanken und Aufgaben durchsuchen und bearbeiten.', 'https://notion.com'],
  ['Coda', 'https://coda.io/apis/mcp', 'oauth', 'Dokumente erstellen, Tabellen lesen und Inhalte aktualisieren.', 'https://coda.io'],
  ['Canva', 'https://mcp.canva.com/mcp', 'oauth', 'Designs, Präsentationen und visuelle Inhalte erstellen und bearbeiten.', 'https://canva.com'],
  ['Asana', 'https://mcp.asana.com/mcp', 'oauth', 'Aufgaben, Projekte und Team-Workflows.', 'https://asana.com'],
  ['ClickUp', 'https://mcp.clickup.com/mcp', 'oauth', 'Projektmanagement und Zusammenarbeit für Teams.', 'https://clickup.com'],
  ['monday.com', 'https://mcp.monday.com/sse', 'oauth', 'Work OS für Projekte, Aufgaben und Team-Workflows.', 'https://monday.com'],
  ['HubSpot', 'https://app.hubspot.com/mcp/v1/http', 'bearer', 'Kontakte, Deals, Unternehmen und Marketing-Daten.', 'https://hubspot.com'],
  ['Attio', 'https://mcp.attio.com/mcp', 'oauth', 'CRM für Beziehungen, Kontakte und Deals.', 'https://attio.com'],
  ['Intercom', 'https://mcp.intercom.com/sse', 'oauth', 'Kundenkommunikation, Support und Engagement.', 'https://intercom.com'],
  ['Zapier', 'https://mcp.zapier.com/api/mcp/mcp', 'bearer', 'Über 7.000 Apps und Workflows verbinden.', 'https://zapier.com'],
  ['Fireflies.ai', 'https://api.fireflies.ai/mcp', 'oauth', 'Meeting-Transkripte und Notizen verwalten.', 'https://fireflies.ai'],
  ['Jamie', 'https://mcp.meetjamie.ai/mcp', 'oauth', 'Meeting-Notizen durchsuchen und Action Items extrahieren.', 'https://meetjamie.ai'],
  ['Statista', 'https://api.statista.ai/v1/mcp', 'bearer', 'Statistiken, Konsumenten- und Marktdaten.', 'https://statista.com'],
  ['SISTRIX', 'https://api.sistrix.com/mcp/', 'bearer', 'SEO-Metriken, Sichtbarkeit und Keyword-Rankings.', 'https://sistrix.com'],
  ['Google Maps', 'https://mapstools.googleapis.com/mcp', 'bearer', 'Geocoding, Places, Routing und Kartendaten.', 'https://developers.google.com/maps'],
  ['Wix', 'https://mcp.wix.com/mcp', 'oauth', 'Wix-Websites erstellen und verwalten.', 'https://wix.com'],
  ['Webflow', 'https://mcp.webflow.com/mcp', 'oauth', 'Webflow-Projekte und Inhalte.', 'https://webflow.com'],
];

const RECOMMENDED: McpRegistryEntry[] = SEEDS.map(
  ([title, url, authHint, description, websiteUrl]) => ({
    name: new URL(url).host,
    title,
    url,
    authHint,
    description,
    websiteUrl,
    recommended: true,
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
            e.title.toLowerCase().includes(search) || e.description.toLowerCase().includes(search)
        )
      : RECOMMENDED;
    return { recommended, servers: [], nextCursor: null };
  }
}

export default McpRegistryService;
