/**
 * Curated directory of official, remote-hosted MCP servers (EXPERIMENTAL).
 *
 * A hand-verified list of servers officially operated by their vendors, sourced
 * from the public Langdock MCP directory (docs.langdock.com/mcp-servers) and
 * vendor docs. Only remote servers are listed; `UserMCPClient` auto-selects the
 * StreamableHTTP or SSE transport by URL. `authHint` tells the UI what to expect
 * before connecting — `oauth` entries fully connect once the OAuth flow ships;
 * `bearer` = paste an API key/token; `none` = connect directly.
 *
 * The noisy open registry firehose was intentionally dropped — this vetted list
 * is the single source of truth for what we surface.
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
  ['Canva', 'https://mcp.canva.com/mcp', 'oauth', 'Designs, Präsentationen und visuelle Inhalte erstellen und bearbeiten.', 'https://canva.com'],
  ['Linear', 'https://mcp.linear.app/mcp', 'oauth', 'Issue-Tracking und Projektmanagement für Entwicklungsteams.', 'https://linear.app'],
  ['Atlassian Rovo', 'https://mcp.atlassian.com/v1/sse', 'oauth', 'Jira, Confluence und Compass mit natürlicher Sprache verwalten.', 'https://atlassian.com'],
  ['GitHub', 'https://api.githubcopilot.com/mcp/', 'bearer', 'Repositories, Issues, PRs und Code-Analyse.', 'https://github.com'],
  ['Asana', 'https://mcp.asana.com/mcp', 'oauth', 'Aufgaben, Projekte und Team-Workflows.', 'https://asana.com'],
  ['ClickUp', 'https://mcp.clickup.com/mcp', 'oauth', 'Projektmanagement und Zusammenarbeit für Teams.', 'https://clickup.com'],
  ['monday.com', 'https://mcp.monday.com/sse', 'oauth', 'Work OS für Projekte, Aufgaben und Team-Workflows.', 'https://monday.com'],
  ['Coda', 'https://coda.io/apis/mcp', 'oauth', 'Dokumente erstellen, Tabellen lesen und Inhalte aktualisieren.', 'https://coda.io'],
  ['Stripe', 'https://mcp.stripe.com/', 'bearer', 'Zahlungen akzeptieren, Abos verwalten, Finanzdaten abfragen.', 'https://stripe.com'],
  ['PayPal', 'https://mcp.paypal.com/sse', 'oauth', 'Zugriff auf PayPal-Zahlungs- und Commerce-APIs.', 'https://paypal.com'],
  ['HubSpot', 'https://app.hubspot.com/mcp/v1/http', 'bearer', 'Kontakte, Deals, Unternehmen und Marketing-Daten.', 'https://hubspot.com'],
  ['Intercom', 'https://mcp.intercom.com/sse', 'oauth', 'Kundenkommunikation, Support und Engagement.', 'https://intercom.com'],
  ['Attio', 'https://mcp.attio.com/mcp', 'oauth', 'CRM für Beziehungen, Kontakte und Deals.', 'https://attio.com'],
  ['Close CRM', 'https://mcp.close.com/mcp', 'oauth', 'Vertriebs-CRM für Kontakte, Leads und Pipelines.', 'https://close.com'],
  ['Zapier', 'https://mcp.zapier.com/api/mcp/mcp', 'bearer', 'Über 7.000 Apps und Workflows verbinden.', 'https://zapier.com'],
  ['Pipedream', 'https://mcp.pipedream.net', 'bearer', 'Mit APIs und Workflows verbinden.', 'https://pipedream.com'],
  ['Supabase', 'https://mcp.supabase.com/mcp', 'oauth', 'Supabase-Projekte erstellen und verwalten.', 'https://supabase.com'],
  ['Neon', 'https://mcp.neon.tech/mcp', 'oauth', 'Serverless Postgres: Datenbanken und Branches.', 'https://neon.tech'],
  ['Prisma', 'https://mcp.prisma.io/mcp', 'oauth', 'Prisma-Postgres verwalten und Schema-Migrationen ausführen.', 'https://prisma.io'],
  ['InstantDB', 'https://mcp.instantdb.com/mcp', 'oauth', 'InstantDB abfragen und verwalten.', 'https://instantdb.com'],
  ['Vercel', 'https://mcp.vercel.com/', 'oauth', 'Frontend-Projekte und Serverless Functions deployen.', 'https://vercel.com'],
  ['Netlify', 'https://netlify-mcp.netlify.app/mcp', 'oauth', 'Webprojekte und Functions bauen, deployen, verwalten.', 'https://netlify.com'],
  ['Render', 'https://mcp.render.com/mcp', 'bearer', 'Render-Services verwalten.', 'https://render.com'],
  ['Cloudflare Workers', 'https://bindings.mcp.cloudflare.com/sse', 'oauth', 'Workers, KV, R2 und Bindings verwalten.', 'https://cloudflare.com'],
  ['Wix', 'https://mcp.wix.com/mcp', 'oauth', 'Wix-Websites erstellen und verwalten.', 'https://wix.com'],
  ['Webflow', 'https://mcp.webflow.com/mcp', 'oauth', 'Webflow-Projekte und Inhalte.', 'https://webflow.com'],
  ['Sentry', 'https://mcp.sentry.dev/mcp', 'bearer', 'Error-Tracking und Performance-Monitoring.', 'https://sentry.io'],
  ['PostHog', 'https://mcp.posthog.com/sse', 'bearer', 'Analytics, Error-Tracking und Feature Flags.', 'https://posthog.com'],
  ['Honeycomb', 'https://mcp.honeycomb.io/mcp', 'bearer', 'Observability-Daten und SLOs abfragen.', 'https://honeycomb.io'],
  ['PagerDuty', 'https://mcp.pagerduty.com/sse', 'oauth', 'Incidents, Bereitschaftspläne und Eskalationen.', 'https://pagerduty.com'],
  ['Amplitude', 'https://mcp.amplitude.com/mcp', 'oauth', 'Verhaltensanalyse und Experimentierplattform.', 'https://amplitude.com'],
  ['Semgrep', 'https://mcp.semgrep.ai/mcp', 'bearer', 'Code auf Sicherheitslücken scannen.', 'https://semgrep.dev'],
  ['Buildkite', 'https://mcp.buildkite.com/mcp', 'oauth', 'Pipeline-Management und Build-Automatisierung.', 'https://buildkite.com'],
  ['Postman', 'https://mcp.postman.com/minimal', 'bearer', 'API-Zusammenarbeit und -Tests.', 'https://postman.com'],
  ['Stytch', 'https://mcp.stytch.dev/mcp', 'oauth', 'Authentifizierung, Sessions und Benutzeridentität.', 'https://stytch.com'],
  ['Sanity', 'https://mcp.sanity.io', 'oauth', 'Inhalte, Releases, Datasets und Schemas verwalten.', 'https://sanity.io'],
  ['Square', 'https://mcp.squareup.com/sse', 'oauth', 'Zahlungen, Bestellungen, Inventar und Kunden.', 'https://squareup.com'],
  ['Plaid', 'https://api.dashboard.plaid.com/mcp/sse', 'oauth', 'Finanz- und Banking-Integrationen.', 'https://plaid.com'],
  ['Ramp', 'https://ramp-mcp-remote.ramp.com/mcp', 'oauth', 'Firmenkreditkarten, Ausgaben und Ausgabedaten.', 'https://ramp.com'],
  ['SISTRIX', 'https://api.sistrix.com/mcp/', 'bearer', 'SEO-Metriken, Sichtbarkeit und Keyword-Rankings.', 'https://sistrix.com'],
  ['Statista', 'https://api.statista.ai/v1/mcp', 'bearer', 'Statistiken, Konsumenten- und Marktdaten.', 'https://statista.com'],
  ['Stack Overflow', 'https://mcp.stackoverflow.com', 'oauth', 'Entwickler-Wissen aus Fragen und Antworten.', 'https://stackoverflow.com'],
  ['Hugging Face', 'https://hf.co/mcp', 'none', 'Zugriff auf den Hugging Face Hub und Gradio MCP.', 'https://huggingface.co'],
  ['Replicate', 'https://mcp.replicate.com/sse', 'bearer', 'KI-Modelle suchen, vergleichen und ausführen.', 'https://replicate.com'],
  ['Google Maps', 'https://mapstools.googleapis.com/mcp', 'bearer', 'Geocoding, Places, Routing und Kartendaten.', 'https://developers.google.com/maps'],
  ['Cloudinary', 'https://asset-management.mcp.cloudinary.com/sse', 'oauth', 'Bild- und Video-Assets verwalten und transformieren.', 'https://cloudinary.com'],
  ['Apify', 'https://mcp.apify.com', 'bearer', 'Daten von jeder Website extrahieren.', 'https://apify.com'],
  ['Browser Use', 'https://api.browser-use.com/mcp', 'bearer', 'Browser-Use-Dokumentation für Agenten.', 'https://browser-use.com'],
  ['Fireflies.ai', 'https://api.fireflies.ai/mcp', 'oauth', 'Meeting-Transkripte und Notizen verwalten.', 'https://fireflies.ai'],
  ['Jamie', 'https://mcp.meetjamie.ai/mcp', 'oauth', 'Meeting-Notizen durchsuchen und Action Items extrahieren.', 'https://meetjamie.ai'],
  ['Demodesk', 'https://demodesk.com/mcp', 'oauth', 'Sales-Meeting-Aufnahmen, Transkripte und Scorecards.', 'https://demodesk.com'],
  ['Mobbin', 'https://api.mobbin.com/mcp', 'oauth', 'Design-Pattern-Referenzen aus echten App-Screens.', 'https://mobbin.com'],
  ['Braintrust', 'https://api.braintrust.dev/mcp', 'bearer', 'Dokumentation, Experimente und Logs in Braintrust.', 'https://braintrust.dev'],
  ['Superglue', 'https://mcp.superglue.ai', 'bearer', 'Vorgefertigte Tools entdecken und ausführen.', 'https://superglue.ai'],
  ['Context7', 'https://mcp.context7.com/mcp', 'bearer', 'Aktuelle, versionsspezifische Code-Dokumentation.', 'https://context7.com'],
  ['DeepWiki', 'https://mcp.deepwiki.com/mcp', 'none', 'Repo-Architekturdiagramme, Doku und Quellcode-Links.', 'https://deepwiki.com'],
  ['Microsoft Learn', 'https://learn.microsoft.com/api/mcp', 'none', 'Microsoft-Dokumentation durchsuchen.', 'https://learn.microsoft.com'],
  ['Astro Docs', 'https://mcp.docs.astro.build/mcp', 'none', 'Zugriff auf die offizielle Astro-Dokumentation.', 'https://astro.build'],
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
