/**
 * `atlassian` — Jira und Confluence der Person im agentischen Loop.
 *
 * EIN Werkzeug mit `action`-Enum (der Werkzeugkatalog ist der größte
 * Token-Posten jedes Aufrufs), strukturell nur lesend: die Client-Funktionen
 * unten haben keine Schreibmethode, also braucht es auch keine Freigabe.
 *
 * Die Client-Funktionen und die Token-Beschaffung kommen über `ctx` herein,
 * damit der Test ohne Netz und ohne Nango läuft.
 *
 * API-Grundlagen:
 * - Sites (cloudId, Browser-Basis-URL): https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#3--get-a-cloudid-and-baseurl
 * - Jira-Suche: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post
 * - Confluence v2 / CQL: https://developer.atlassian.com/cloud/confluence/rest/v2/intro/
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { type ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import * as atlassianClient from '../../../services/api-clients/atlassianClient.js';
import {
  adfToText,
  buildTextCql,
  buildTextJql,
} from '../../../services/api-clients/atlassianText.js';
import { ConnectionService } from '../../../services/connections/ConnectionService.js';
import { htmlToStructuredText } from '../../../services/scrapers/utils/htmlCleaner.js';
import { createLogger } from '../../../utils/logger.js';
import { type SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import { type AtlassianConnections } from '../services/atlassianConnectionContext.js';

import {
  klassifiziereWurf,
  leeresErgebnis,
  werkzeugFehler,
  type WerkzeugFehler,
} from './toolFailure.js';

import type { AtlassianResource } from '../../../services/api-clients/atlassianClient.js';

const log = createLogger('atlassianTools');

/** Höchstens so viele Treffer/Einträge je Liste in der Antwort. */
const MAX_ITEMS = 20;
/** Textlänge je Abschnitt, wie bei `cloud_files`. */
const READ_CHUNK_CHARS = 4000;
const READ_MAX_CHUNKS = 6;
const COMMENT_COUNT = 5;
const COMMENT_CHARS = 1200;
const LISTING_SNIPPET_CHARS = 4000;

export type AtlassianProduct = 'jira' | 'confluence';

export interface AtlassianApi {
  getAccessibleResources: typeof atlassianClient.getAccessibleResources;
  listJiraProjects: typeof atlassianClient.listJiraProjects;
  searchJiraIssues: typeof atlassianClient.searchJiraIssues;
  getJiraIssue: typeof atlassianClient.getJiraIssue;
  listJiraComments: typeof atlassianClient.listJiraComments;
  listConfluenceSpaces: typeof atlassianClient.listConfluenceSpaces;
  searchConfluenceCql: typeof atlassianClient.searchConfluenceCql;
  getConfluencePageContent: typeof atlassianClient.getConfluencePageContent;
}

export interface AtlassianToolCtx {
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
  /** Welche Produkte dieser Turn verbunden hat (aus `streamContext`). */
  connections: AtlassianConnections;
  /** Injiziert, damit der Test ohne Netz läuft. */
  api?: AtlassianApi;
  getToken?: (userId: string, product: AtlassianProduct) => Promise<string>;
}

const ACTIONS = [
  'list_sites',
  'search_issues',
  'get_issue',
  'list_projects',
  'search_pages',
  'get_page',
  'list_spaces',
] as const;

const PRODUCT_OF: Record<(typeof ACTIONS)[number], AtlassianProduct | null> = {
  list_sites: null,
  search_issues: 'jira',
  get_issue: 'jira',
  list_projects: 'jira',
  search_pages: 'confluence',
  get_page: 'confluence',
  list_spaces: 'confluence',
};

const PRODUCT_LABEL: Record<AtlassianProduct, string> = { jira: 'Jira', confluence: 'Confluence' };

const notConnected = (product: AtlassianProduct) =>
  werkzeugFehler({
    art: 'nicht_verfuegbar',
    ursache: `${PRODUCT_LABEL[product]} ist für dieses Konto nicht verbunden`,
    naechsterSchritt: `Sag der Person, dass sie ${PRODUCT_LABEL[product]} unter Konnektoren verbinden kann`,
  });

/**
 * Ein Fehler des Atlassian-Clients als Werkzeugfehler. Nie die rohe axios-
 * Meldung weitergeben: sie trägt URL und Header-Reste, und das Modell soll nur
 * wissen, was es der Person sagen kann.
 */
export function atlassianFehler(err: unknown, product: AtlassianProduct) {
  const status = klassifiziereWurf(err);
  const label = PRODUCT_LABEL[product];
  const raw = err as { response?: { status?: unknown } } | null;
  const httpStatus = typeof raw?.response?.status === 'number' ? raw.response.status : null;
  if (httpStatus === 401) {
    return werkzeugFehler({
      art: 'keine_berechtigung',
      ursache: `${label} hat den Zugriff abgelehnt (Anmeldung abgelaufen)`,
      naechsterSchritt: `Sag der Person, dass sie ${label} unter Konnektoren neu verbinden muss`,
    });
  }
  if (httpStatus === 403) {
    return werkzeugFehler({
      art: 'keine_berechtigung',
      ursache: `Für diese Anfrage fehlt in ${label} die Berechtigung`,
      naechsterSchritt: `Nicht erneut versuchen; sag der Person, dass ihr Konto das in ${label} nicht sehen darf oder die Verbindung unter Konnektoren neu erteilt werden muss`,
    });
  }
  if (httpStatus === 404) {
    return werkzeugFehler({
      art: 'nicht_gefunden',
      ursache: `${label} kennt das Angefragte nicht oder die Person darf es nicht sehen`,
      naechsterSchritt: 'Prüfe Schlüssel bzw. ID oder suche zuerst danach',
    });
  }
  if (httpStatus === 429) {
    return werkzeugFehler({
      art: 'anbieter_ausfall',
      ursache: `${label} bremst gerade (Rate-Limit)`,
      naechsterSchritt:
        'Nicht direkt wiederholen; sag der Person, dass sie es gleich noch einmal versuchen soll',
    });
  }
  if (httpStatus === 400) {
    return werkzeugFehler({
      art: 'ungueltige_eingabe',
      ursache: `${label} hat die Suchanfrage nicht akzeptiert`,
      naechsterSchritt: 'Prüfe die Suchsyntax oder suche stattdessen mit dem Parameter text',
    });
  }
  return werkzeugFehler({
    art: status.fehlerArt === 'anbieter_ausfall' ? 'anbieter_ausfall' : 'nicht_verfuegbar',
    ursache: `Die Anfrage an ${label} ist fehlgeschlagen`,
    naechsterSchritt:
      'Ein einziger neuer Versuch ist erlaubt, danach sag offen, dass es nicht geklappt hat',
  });
}

const trimUrl = (u: string) => u.replace(/\/+$/, '');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length && chunks.length < READ_MAX_CHUNKS; i += READ_CHUNK_CHARS) {
    chunks.push(text.slice(i, i + READ_CHUNK_CHARS));
  }
  return chunks;
}

type SiteChoice =
  { site: AtlassianResource } | { result: Record<string, unknown> | WerkzeugFehler };

function siteList(sites: AtlassianResource[]) {
  return sites.map((s) => ({ cloudId: s.id, name: s.name, url: s.url }));
}

/** Eine Site wählen; bei Mehrdeutigkeit die Liste zurückgeben statt zu raten. */
export function chooseSite(sites: AtlassianResource[], wanted: string | undefined): SiteChoice {
  if (sites.length === 0) {
    return {
      result: werkzeugFehler({
        art: 'nicht_verfuegbar',
        ursache: 'Das Konto hat keinen Zugriff auf eine Atlassian-Site',
        naechsterSchritt:
          'Sag der Person, dass sie die Verbindung unter Konnektoren neu erteilen soll',
      }),
    };
  }
  const w = wanted?.trim().toLowerCase();
  if (!w) {
    if (sites.length === 1) return { site: sites[0] as AtlassianResource };
    return {
      result: {
        needsSite: true,
        sites: siteList(sites),
        hinweis:
          'Es gibt mehrere Sites. Frag die Person, welche gemeint ist, oder wähle anhand ihrer Angabe und wiederhole den Aufruf mit site (cloudId oder Name).',
      },
    };
  }
  const match = sites.find(
    (s) =>
      s.id.toLowerCase() === w ||
      s.name.toLowerCase() === w ||
      trimUrl(s.url)
        .toLowerCase()
        .replace(/^https?:\/\//, '') === w.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  );
  if (match) return { site: match };
  return {
    result: {
      ...werkzeugFehler({
        art: 'ungueltige_eingabe',
        ursache: `Keine Site passt zu „${wanted}"`,
        naechsterSchritt: 'Wähle eine der genannten Sites (cloudId oder Name)',
      }),
      sites: siteList(sites),
    },
  };
}

export function makeAtlassianTool(ctx: AtlassianToolCtx): Tool {
  const { state, sourceRegistry, connections } = ctx;
  const api: AtlassianApi = ctx.api ?? atlassianClient;
  const getToken =
    ctx.getToken ??
    (async (userId: string, product: AtlassianProduct) =>
      (await ConnectionService.getConnection(userId, product)).accessToken);

  const ground = (
    source: string,
    title: string,
    content: string,
    url?: string,
    inventory = false
  ) => {
    if (!content.trim()) return;
    sourceRegistry.register([{ source, title, content, ...(url ? { url } : {}) }], {
      snippetChars: LISTING_SNIPPET_CHARS,
      ...(inventory ? { inventory: true } : {}),
    });
  };

  const connected: AtlassianProduct[] = [
    ...(connections.jira ? (['jira'] as const) : []),
    ...(connections.confluence ? (['confluence'] as const) : []),
  ];

  return tool({
    description: `Lesender Zugriff auf Jira (Vorgänge/Issues, Projekte) und Confluence (Seiten, Spaces) der Person. Verbunden: ${connected.map((p) => PRODUCT_LABEL[p]).join(', ')}.

NUTZE WENN die Person nach Tickets, Issues, Sprints, Projekten oder nach Wiki-Seiten/Dokumentation in Jira bzw. Confluence fragt: Vorgänge suchen (search_issues, mit text oder JQL), einen Vorgang lesen (get_issue, Schlüssel wie ABC-123), Projekte listen (list_projects), Seiten suchen (search_pages, mit text oder CQL), eine Seite lesen (get_page, pageId aus search_pages), Spaces listen (list_spaces), Sites anzeigen (list_sites). Bei mehreren Sites gibt das Werkzeug die Liste zurück — dann site setzen.

NICHT für: Dateien der Wolke (dafür 'cloud_files'), Grünerator-Dokumente (dafür 'documents'), das Web (dafür 'web_search'). Ausschließlich lesend — Anlegen, Ändern, Kommentieren gibt es nicht.`,
    inputSchema: z.object({
      action: z.enum(ACTIONS),
      site: z
        .string()
        .optional()
        .describe('cloudId, Name oder URL der Site; bei genau einer Site weglassbar'),
      text: z
        .string()
        .optional()
        .describe(
          'Suchbegriff in normaler Sprache (search_issues / search_pages) — wird sicher in JQL/CQL umgesetzt'
        ),
      jql: z
        .string()
        .optional()
        .describe('Eigene JQL-Abfrage (search_issues); hat Vorrang vor text'),
      cql: z
        .string()
        .optional()
        .describe('Eigene CQL-Abfrage (search_pages); hat Vorrang vor text'),
      projectKey: z
        .string()
        .optional()
        .describe('Projektschlüssel als Filter für text (search_issues)'),
      spaceKey: z
        .string()
        .optional()
        .describe('Space-Schlüssel als Filter für text (search_pages)'),
      key: z.string().optional().describe('Vorgangsschlüssel, z. B. ABC-123 (get_issue)'),
      pageId: z.string().optional().describe('Seiten-ID aus search_pages (get_page)'),
      nextPageToken: z
        .string()
        .optional()
        .describe('Token aus einer vorherigen search_issues-Antwort für die nächste Seite'),
    }),
    execute: async ({
      action,
      site,
      text,
      jql,
      cql,
      projectKey,
      spaceKey,
      key,
      pageId,
      nextPageToken,
    }) => {
      const userId = state.agentConfig?.userId ?? null;
      if (!userId) {
        return werkzeugFehler({
          art: 'nicht_verfuegbar',
          ursache: 'Keine Nutzer-Sitzung — diese Aktion braucht eine angemeldete Person',
        });
      }

      const needed = PRODUCT_OF[action];
      // list_sites ohne Produkt: das erste verbundene (die Site-Liste ist je Konto gleich).
      const product: AtlassianProduct | null = needed ?? connected[0] ?? null;
      if (!product) return notConnected('jira');
      if (!connections[product]) return notConnected(product);

      try {
        const token = await getToken(userId, product);
        const sites = await api.getAccessibleResources(token);

        if (action === 'list_sites') {
          const list = siteList(sites);
          ground(
            'atlassian:sites',
            'Atlassian-Sites',
            list.map((s) => `${s.name} — ${s.url} (cloudId ${s.cloudId})`).join('\n'),
            undefined,
            true
          );
          return { siteCount: list.length, sites: list };
        }

        const choice = chooseSite(sites, site);
        if ('result' in choice) return choice.result;
        const cloudId = choice.site.id;
        const siteUrl = trimUrl(choice.site.url);
        const siteName = choice.site.name;

        switch (action) {
          case 'list_projects': {
            const projects = await api.listJiraProjects(token, cloudId);
            if (projects.length === 0)
              return leeresErgebnis({ hinweis: 'Keine sichtbaren Projekte' });
            const shown = projects.slice(0, MAX_ITEMS);
            ground(
              `atlassian:${cloudId}:projects`,
              `Jira-Projekte (${siteName})`,
              shown.map((p) => `${p.key} — ${p.name}`).join('\n'),
              undefined,
              true
            );
            return {
              site: siteName,
              projectCount: projects.length,
              projects: shown.map((p) => ({ key: p.key, name: p.name })),
              ...(projects.length > shown.length
                ? {
                    note: `Nur die ersten ${shown.length} von ${projects.length} Projekten sind aufgeführt.`,
                  }
                : {}),
            };
          }

          case 'search_issues': {
            const query = jql?.trim() || (text ? buildTextJql(text, projectKey) : null);
            if (!query) {
              return werkzeugFehler({
                art: 'ungueltige_eingabe',
                ursache: 'search_issues braucht text oder jql',
                naechsterSchritt: 'Wiederhole den Aufruf mit einem Suchbegriff',
              });
            }
            const page = await api.searchJiraIssues(token, cloudId, query, {
              maxResults: MAX_ITEMS,
              nextPageToken: nextPageToken ?? null,
            });
            if (page.issues.length === 0) return leeresErgebnis({ filter: query });
            const issues = page.issues.map((i) => ({
              key: i.key,
              summary: i.fields.summary,
              status: i.fields.status.name,
              type: i.fields.issuetype.name,
              assignee: i.fields.assignee?.displayName ?? null,
              priority: i.fields.priority?.name ?? null,
              updated: i.fields.updated,
              link: `${siteUrl}/browse/${i.key}`,
            }));
            ground(
              `atlassian:${cloudId}:search:${query}`,
              `Jira-Suche (${siteName})`,
              issues
                .map(
                  (i) =>
                    `${i.key}: ${i.summary} [${i.status}${i.assignee ? `, ${i.assignee}` : ''}] ${i.link}`
                )
                .join('\n')
            );
            return {
              site: siteName,
              jql: query,
              resultCount: issues.length,
              issues,
              ...(page.nextPageToken
                ? {
                    nextPageToken: page.nextPageToken,
                    note: `Es gibt weitere Treffer; die Liste zeigt nur ${issues.length}. Für die nächste Seite nextPageToken übergeben.`,
                  }
                : {}),
            };
          }

          case 'get_issue': {
            const issueKey = key?.trim();
            if (!issueKey) {
              return werkzeugFehler({
                art: 'ungueltige_eingabe',
                ursache: 'get_issue braucht den Vorgangsschlüssel (key)',
                naechsterSchritt: 'Suche zuerst mit search_issues',
              });
            }
            const issue = await api.getJiraIssue(token, cloudId, issueKey);
            // Kommentare sind Beiwerk: schlagen sie fehl, bleibt der Vorgang lesbar.
            let comments: Array<{ author: string | null; created: string; text: string }> = [];
            let commentNote: string | null = null;
            try {
              comments = (await api.listJiraComments(token, cloudId, issue.key, COMMENT_COUNT)).map(
                (c) => ({
                  author: c.author?.displayName ?? null,
                  created: c.created,
                  text: clip(adfToText(c.body), COMMENT_CHARS),
                })
              );
            } catch (err) {
              log.warn('listJiraComments failed', err);
              commentNote = 'Die Kommentare ließen sich nicht laden.';
            }
            const description = adfToText(issue.fields.description);
            const link = `${siteUrl}/browse/${issue.key}`;
            const detail = {
              key: issue.key,
              summary: issue.fields.summary,
              status: issue.fields.status.name,
              type: issue.fields.issuetype.name,
              assignee: issue.fields.assignee?.displayName ?? null,
              priority: issue.fields.priority?.name ?? null,
              updated: issue.fields.updated,
              link,
            };
            const body = [
              `${detail.key}: ${detail.summary}`,
              `Status: ${detail.status} · Typ: ${detail.type} · Zuständig: ${detail.assignee ?? 'niemand'} · Priorität: ${detail.priority ?? '—'}`,
              description ? `Beschreibung:\n${description}` : 'Keine Beschreibung.',
              ...(comments.length
                ? [
                    `Letzte Kommentare (neueste zuerst):\n${comments.map((c) => `- ${c.author ?? 'Unbekannt'} (${c.created.slice(0, 10)}): ${c.text}`).join('\n')}`,
                  ]
                : []),
            ].join('\n\n');
            const chunks = chunkText(body);
            const sources = sourceRegistry.register(
              chunks.map((content, idx) => ({
                source: `atlassian:${cloudId}:${issue.key}`,
                title: `${detail.key}: ${detail.summary}`,
                content,
                url: link,
                relevance: 0.7,
                chunkIndex: idx,
              }))
            );
            return {
              ...detail,
              description: clip(description, READ_CHUNK_CHARS),
              comments,
              resultCount: chunks.length,
              sources: sources ?? '',
              ...(description.length > READ_CHUNK_CHARS ||
              body.length > READ_CHUNK_CHARS * READ_MAX_CHUNKS
                ? {
                    note: 'Die Beschreibung ist länger als der hier gezeigte Ausschnitt; im Quellenblock steht der gelesene Text.',
                  }
                : {}),
              ...(commentNote ? { commentNote } : {}),
            };
          }

          case 'list_spaces': {
            const spaces = await api.listConfluenceSpaces(token, cloudId);
            if (spaces.length === 0) return leeresErgebnis({ hinweis: 'Keine sichtbaren Spaces' });
            const shown = spaces.slice(0, MAX_ITEMS);
            ground(
              `atlassian:${cloudId}:spaces`,
              `Confluence-Spaces (${siteName})`,
              shown.map((s) => `${s.key} — ${s.name}`).join('\n'),
              undefined,
              true
            );
            return {
              site: siteName,
              spaceCount: spaces.length,
              spaces: shown.map((s) => ({ key: s.key, name: s.name, type: s.type })),
              ...(spaces.length > shown.length
                ? {
                    note: `Nur die ersten ${shown.length} von ${spaces.length} Spaces sind aufgeführt.`,
                  }
                : {}),
            };
          }

          case 'search_pages': {
            const query = cql?.trim() || (text ? buildTextCql(text, spaceKey) : null);
            if (!query) {
              return werkzeugFehler({
                art: 'ungueltige_eingabe',
                ursache: 'search_pages braucht text oder cql',
                naechsterSchritt: 'Wiederhole den Aufruf mit einem Suchbegriff',
              });
            }
            const { results, base } = await api.searchConfluenceCql(
              token,
              cloudId,
              query,
              MAX_ITEMS
            );
            const wiki = trimUrl(base ?? `${siteUrl}/wiki`);
            const pages = results
              .filter((r) => r.content?.id)
              .map((r) => ({
                pageId: r.content?.id as string,
                title: r.content?.title ?? r.title ?? '',
                excerpt: clip((r.excerpt ?? '').replace(/\s+/g, ' ').trim(), 300),
                lastModified: r.lastModified ?? null,
                link: r.url ? `${wiki}${r.url}` : null,
              }));
            if (pages.length === 0) return leeresErgebnis({ filter: query });
            ground(
              `atlassian:${cloudId}:cql:${query}`,
              `Confluence-Suche (${siteName})`,
              pages
                .map(
                  (p) =>
                    `${p.title} (pageId ${p.pageId})${p.excerpt ? ` — ${p.excerpt}` : ''}${p.link ? ` ${p.link}` : ''}`
                )
                .join('\n')
            );
            return { site: siteName, cql: query, resultCount: pages.length, pages };
          }

          case 'get_page': {
            const id = pageId?.trim();
            if (!id) {
              return werkzeugFehler({
                art: 'ungueltige_eingabe',
                ursache: 'get_page braucht die Seiten-ID (pageId)',
                naechsterSchritt: 'Suche zuerst mit search_pages',
              });
            }
            const page = await api.getConfluencePageContent(token, cloudId, id, 'view');
            const html = page.body.view?.value ?? page.body.storage?.value ?? '';
            const content = htmlToStructuredText(html);
            const webui = page._links?.webui;
            const link = webui
              ? `${trimUrl(page._links?.base ?? `${siteUrl}/wiki`)}${webui}`
              : null;
            if (!content.trim()) {
              return {
                pageId: page.id,
                title: page.title,
                link,
                resultCount: 0,
                note: 'Die Seite hat keinen Text.',
              };
            }
            const chunks = chunkText(content);
            const sources = sourceRegistry.register(
              chunks.map((c, idx) => ({
                source: `atlassian:${cloudId}:page:${page.id}`,
                title: page.title,
                content: c,
                ...(link ? { url: link } : {}),
                relevance: 0.7,
                chunkIndex: idx,
              }))
            );
            return {
              pageId: page.id,
              title: page.title,
              link,
              resultCount: chunks.length,
              sources: sources ?? '',
              ...(content.length > READ_CHUNK_CHARS * READ_MAX_CHUNKS
                ? { note: 'Die Seite ist länger als der gelesene Ausschnitt.' }
                : {}),
            };
          }
        }
      } catch (err) {
        log.warn(`[atlassian] ${action} failed`, err);
        const fehler = atlassianFehler(err, product);
        sourceRegistry.note('Atlassian-Zugriff fehlgeschlagen', fehler.error);
        return fehler;
      }
    },
  });
}
