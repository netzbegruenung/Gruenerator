/**
 * Per-request MCP server assembly: a fresh McpServer per POST lets tools — and
 * the actions inside a tool — be registered only for granted OAuth scopes, so
 * the model never sees an action it cannot take.
 */
import { buildSourceRef } from '@gruenerator/shared/utils';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  getCanonicalByKey,
  getMcpExposedCollections,
} from '../../config/systemCollectionsConfig.js';
import { Sentry } from '../../lib/sentry.js';
import { lookupUmfragen } from '../../services/monitor/UmfragenService.js';
import { runNotebookSearch } from '../../services/notebook/notebookToolSearch.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { createLogger } from '../../utils/logger.js';
import {
  executeDirectExamplesSearch,
  executeDirectPressemitteilungExamples,
  executeDirectSearch,
} from '../chat/agents/directSearchExecutors.js';
import { makeGroupsTool } from '../chat/agents/groupTools.js';
import { makeNotebooksTool } from '../chat/agents/notebookTools.js';
import {
  makeBoardsTasksTool,
  makeDocumentsTool,
  makeFindContentTool,
  makeMediaTool,
} from '../chat/agents/personalDataTools.js';
import { makeRecurringTasksTool } from '../chat/agents/recurringTaskTools.js';
import { makeRecipesTool } from '../chat/agents/textFormTools.js';
import { makeUserAgentsTool } from '../chat/agents/userAgentTools.js';
import { runBoardGeneration, runDocGeneration } from '../chat/services/intentExecutionService.js';
import {
  computeMergedFilters,
  getCachedFilters,
  setCachedFilters,
} from '../research/researchController.js';

import { registerAgentPrompts } from './agentPrompts.js';
import {
  absolutizeUrl,
  formatToolResult,
  makeMcpPersonalCtx,
  registerAiTool,
} from './chatToolBridge.js';
import { hasLandesverbandAccess, registerLandesverbandTools } from './landesverbandTools.js';
import {
  addCardDirect,
  addWolkeFolderMcp,
  createGroupDirect,
  createNotebookMcp,
  createRecurringTaskMcp,
  createUserAgentMcp,
  joinGroupDirect,
  setGroupVisibilityMcp,
  setNotebookVisibilityMcp,
  shareDocToGroupMcp,
  shareNotebookMcp,
  shareUserAgentMcp,
} from './mcpMutations.js';
import {
  buildCollectionCatalog,
  buildMethodDocument,
  buildNotebookPrompt,
  buildRecherchePrompt,
} from './methodPrompts.js';

import type { McpAuthContext } from './mcpAuth.js';
import type { QAResponse } from '../../services/notebook/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Request } from 'express';

const log = createLogger('McpServerFactory');

/**
 * Derived from the canonical config, NOT from the chat catalog.
 *
 * `ALL_COLLECTIONS` is the chat agent's allow-list. It used to be eight
 * hand-written entries, and using it here silently hid twelve `mcpExposed`
 * collections, every Landesverband among them, from a surface whose whole job
 * is exposure. v1 had served them from `/api/v1/collections` all along, so v2
 * was the narrower of the two.
 *
 * The chat list has since been derived from this same config for exactly that
 * reason (the loop could not search a Landesverband either). The two stay
 * separate anyway: this surface is not locale-filtered and does not bundle
 * Austria behind one key, both of which that list does for the chat client.
 *
 * Deliberately NOT gated by the instance policy either, though `searchTools.ts`
 * gates the chat list. `hide` is curation, not access: it takes content out of
 * galleries, pickers and *implicit* search while a directly named target keeps
 * resolving — and an MCP client naming a collection is naming it, not
 * discovering it. Keeping a deployment's content out of MCP entirely is what
 * `mcpExposed: false` on the collection is for. Gating here would also have
 * dropped `gruene` from production's published enum, which external clients
 * have searched since v1.
 */
const SEARCH_COLLECTIONS = getMcpExposedCollections()
  .map((c) => c.key)
  .filter((key) => key !== 'examples')
  .sort() as [string, ...string[]];

/**
 * The cited answer IS this tool's payload, so it leaves as markdown text:
 * `formatToolResult` passes strings through untouched, while an unrecognised
 * object shape would reach the client as raw JSON.
 */
export function renderNotebookAnswer(result: QAResponse, notebookName: string): string {
  const citations = result.citations ?? [];
  if (citations.length === 0) return result.answer;
  const lines = citations.map((c) => {
    const title = c.document_title ?? c.title ?? 'Ohne Titel';
    const url = c.source_url ?? c.url;
    // Hashed from the STORED url, shown absolutized: `absolutizeUrl` prepends
    // APP_BASE_URL, so hashing its output would give one document two different
    // refs on test and prod.
    const ref = buildSourceRef({ url, documentId: c.document_id });
    return `[${c.index}] ${title}${url ? ` — ${absolutizeUrl(url)}` : ''}${ref ? ` [ref: ${ref}]` : ''}`;
  });
  return `${result.answer}\n\nQuellen (${notebookName}):\n${lines.join('\n')}`;
}

const INSTRUCTIONS = `Grünerator MCP (angemeldet): Zugriff auf die eigenen Grünerator-Inhalte der angemeldeten Person (Dokumente, Boards/Aufgaben, Notebooks, Gruppen, Medien) plus die Programm- und Beschlusssuche von Bündnis 90/Die Grünen (DE) und den Grünen (AT).

Für belegte Antworten aus mehreren Quellen gilt ein festes Vorgehen: die Resource gruenerator://methode beschreibt Ablauf und Zitierprotokoll, gruenerator://sammlungen listet die durchsuchbaren Sammlungen. Die Prompts "recherche" und "notebook-antwort" bringen beides fertig mit.

Regeln:
- Kein Tool schreibt dir den Text der Recherche — die Synthese aus den Treffern ist deine Aufgabe. Ausnahme: notebooks mit action="search" liefert bereits eine belegte Antwort.
- Ein ref benennt eine Sache über Aufrufe hinweg: zitiere darüber (nicht über rank, der nur innerhalb einer Antwort gilt), führe zwei Treffer mit gleichem ref als eine Quelle, nummeriere deine Quellenliste selbst — und gib ihn dort zurück, wo ein Tool ihn erwartet. IDs und refs stammen immer aus einem vorherigen list-/search-Aufruf, niemals raten.
- Destruktive oder nach außen sichtbare Aktionen (löschen, teilen) verlangen das zweistufige Protokoll: erster Aufruf ohne confirm liefert eine Rückfrage; erst nach Zustimmung der Person mit confirm=true erneut aufrufen.
- create_document/create_board erzeugen echte Inhalte im Konto — Ergebnis-Link nennen.
- Antworten auf Deutsch, Quellen-URLs nennen.`;

/** The SDK's own result type — it carries an index signature that a hand-rolled
 *  interface would not satisfy. */
type ToolResponse = CallToolResult;

function text(value: string, isError = false): ToolResponse {
  return {
    content: [{ type: 'text' as const, text: value }],
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * A successful result in both forms: prose for the model, object for the client.
 *
 * `content` is not optional — the SDK does NOT derive it from
 * `structuredContent` (a tool that returns only the object sends `content: []`).
 * And once a tool declares an `outputSchema`, EVERY success path has to come
 * through here: `validateToolOutput` rejects a schema-carrying tool that returns
 * no `structuredContent`, which would turn a valid "Keine Treffer" into
 * `-32602`. Error paths are exempt — the SDK skips validation when `isError` is
 * set — so `guarded()` and the `text(…, true)` returns stay as they are.
 */
function structured(value: string, structuredContent: Record<string, unknown>): ToolResponse {
  return { content: [{ type: 'text' as const, text: value }], structuredContent };
}

/** Never leak raw service/driver errors to external MCP clients. */
function guarded<A>(name: string, fn: (args: A) => Promise<ToolResponse>) {
  return async (args: A): Promise<ToolResponse> => {
    try {
      return await fn(args);
    } catch (err) {
      log.error(`tool ${name} failed:`, err);
      Sentry.captureException(err, { tags: { mcp_tool: name } });
      return text('Aktion fehlgeschlagen — prüfe die übergebenen Parameter.', true);
    }
  };
}

const READONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

/** Every field is set on every success path — including "Keine Treffer", which
 *  returns the same object with an empty `results`. */
const SEARCH_OUTPUT_SCHEMA = {
  collection: z.string(),
  query: z.string(),
  resultsCount: z.number(),
  results: z.array(
    z.object({
      ref: z
        .string()
        .nullable()
        .describe(
          'Stabiler Schlüssel dieser Quelle — über Aufrufe hinweg gleich. Zum Zitieren und Deduplizieren; rank gilt nur in dieser Antwort.'
        ),
      rank: z.number(),
      title: z.string(),
      url: z.string().nullable(),
      excerpt: z.string(),
      relevance: z.string(),
      collection: z.string(),
    })
  ),
};

const EXAMPLES_OUTPUT_SCHEMA = {
  type: z.string(),
  query: z.string(),
  country: z.string(),
  resultsCount: z.number(),
  examples: z.array(z.record(z.string(), z.unknown())),
};

/** `values` carries the full facet list — the 25-value cap below is a property
 *  of the prose, not of the data. A collection without filter fields returns
 *  `fields: []`; that is a success and needs the object like any other. */
const FILTERS_OUTPUT_SCHEMA = {
  collection: z.string(),
  fields: z.array(
    z.object({
      field: z.string(),
      label: z.string(),
      type: z.enum(['keyword', 'date_range']),
      values: z.array(z.object({ value: z.string(), count: z.number() })).optional(),
      min: z.string().optional(),
      max: z.string().optional(),
    })
  ),
};

/**
 * Prompts and resources are scope-independent: they describe how to work with
 * this server, not what the connection may touch. A client that has been
 * granted nothing can still read the method — and should, because the first
 * thing it does with a new scope is search.
 */
function registerMethod(server: McpServer): void {
  registerAgentPrompts(server);

  server.registerPrompt(
    'recherche',
    {
      title: 'Recherche in Programmen und Beschlüssen',
      description:
        'Mehrstufige Suche in den Grünen-Sammlungen mit anschließender belegter Zusammenfassung — nach demselben Zitierprotokoll, das die Grünerator-Oberfläche verwendet.',
      argsSchema: {
        frage: z.string().describe('Die inhaltliche Frage'),
        land: z.enum(['DE', 'AT']).describe('DE = Deutschland, AT = Österreich'),
      },
    },
    ({ frage, land }) => ({
      description: 'Recherche mit Zitaten',
      messages: buildRecherchePrompt(frage, land as 'DE' | 'AT'),
    })
  );

  server.registerPrompt(
    'notebook-antwort',
    {
      title: 'Antwort aus einem eigenen Notebook',
      description:
        'Befragt den eigenen Quellenbestand und fasst die Treffer mit Quellenangaben zusammen.',
      argsSchema: {
        frage: z.string().describe('Die inhaltliche Frage'),
        notebook: z.string().optional().describe('Name des Notebooks, falls bekannt'),
      },
    },
    ({ frage, notebook }) => ({
      description: 'Notebook-Antwort mit Quellen',
      messages: buildNotebookPrompt(frage, notebook),
    })
  );

  // Deprecated alias for `notebook-antwort`, retired 27.08.2027. MCP prompt
  // names are frozen the moment a client references one, so the rename
  // Notizbuch → Notebook (27.08.2026) had to be additive: same handler, old
  // name, old argument name. Drop this block once no client asks for it.
  server.registerPrompt(
    'notizbuch-antwort',
    {
      title: 'Antwort aus einem eigenen Notebook (veraltet: notizbuch-antwort)',
      description:
        'Veraltet — nutze `notebook-antwort`. Befragt den eigenen Quellenbestand und fasst die Treffer mit Quellenangaben zusammen.',
      argsSchema: {
        frage: z.string().describe('Die inhaltliche Frage'),
        notizbuch: z.string().optional().describe('Name des Notebooks, falls bekannt'),
      },
    },
    ({ frage, notizbuch }) => ({
      description: 'Notebook-Antwort mit Quellen',
      messages: buildNotebookPrompt(frage, notizbuch),
    })
  );

  server.registerResource(
    'methode',
    'gruenerator://methode',
    {
      title: 'Methode: belegt aus mehreren Quellen antworten',
      description:
        'Ablauf und Zitierprotokoll für Antworten aus den Grünen-Sammlungen und aus eigenen Notebooks.',
      mimeType: 'text/markdown',
    },
    () => ({
      contents: [
        {
          uri: 'gruenerator://methode',
          mimeType: 'text/markdown',
          text: buildMethodDocument(),
        },
      ],
    })
  );

  server.registerResource(
    'sammlungen',
    'gruenerator://sammlungen',
    {
      title: 'Verfügbare Sammlungen',
      description:
        'Alle über gruenerator_search erreichbaren Sammlungen mit Inhalt, Land und Filterfeldern.',
      mimeType: 'text/markdown',
    },
    () => ({
      contents: [
        {
          uri: 'gruenerator://sammlungen',
          mimeType: 'text/markdown',
          text: buildCollectionCatalog(),
        },
      ],
    })
  );
}

export interface McpServerBuildOptions {
  userId: string;
  scopes: Set<string>;
  /** Nur beim Schlüssel-Weg gesetzt — trägt die Landesverbands-Freigabe. */
  apiKey?: McpAuthContext['apiKey'];
  /** The live Express request — carries req.user. */
  req: Request;
}

export function buildAuthenticatedMcpServer(opts: McpServerBuildOptions): McpServer {
  const { userId, scopes, apiKey, req } = opts;
  const has = (s: string) => scopes.has(s);
  const contentRead = has('content:read');
  const contentWrite = has('content:write');

  const server = new McpServer(
    // 3.0.0 markiert die Vereinigung der beiden Server, keine dritte
    // Generation: v1 war 1.0.0, der authentifizierte Server 2.0.0.
    { name: 'gruenerator', version: '3.0.0' },
    {
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: INSTRUCTIONS,
    }
  );

  const ctx = makeMcpPersonalCtx(userId);

  registerMethod(server);

  // ── whoami (always available) ─────────────────────────────────────────────
  server.registerTool(
    'whoami',
    {
      title: 'Angemeldete Person',
      description:
        'Zeigt, als wer diese Verbindung angemeldet ist und welche Berechtigungen (Scopes) sie hat. Nutze dies als ersten Verbindungstest.',
      inputSchema: {},
      annotations: READONLY,
    },
    guarded('whoami', async () => {
      const profile = await getProfileService().getProfileById(userId);
      if (!profile) return text('Profil nicht gefunden.', true);
      return text(
        [
          `Angemeldet als: ${profile.display_name ?? profile.email ?? userId}`,
          `Locale: ${profile.locale ?? 'de-DE'}`,
          `Scopes: ${[...scopes].sort().join(', ') || '(keine)'}`,
        ].join('\n')
      );
    })
  );

  // ── search scope: party corpus, examples, polls ───────────────────────────
  if (has('search')) {
    server.registerTool(
      'gruenerator_search',
      {
        title: 'Grüne Programme & Beschlüsse durchsuchen',
        description: `Semantische Suche in Programmen, Beschlüssen und Positionen von Bündnis 90/Die Grünen (DE) und den Grünen (AT). Einzelne Begriffe treffen besser als ganze Sätze — suche lieber mehrfach mit Varianten. Der Katalog aller ${SEARCH_COLLECTIONS.length} Sammlungen steht in der Resource gruenerator://sammlungen; das Vorgehen samt Zitierprotokoll in gruenerator://methode. Sammlungen: ${SEARCH_COLLECTIONS.join(', ')}.`,
        inputSchema: {
          query: z.string().min(1).describe('Suchbegriff oder Frage'),
          collection: z.enum(SEARCH_COLLECTIONS).default('deutschland'),
          limit: z.number().int().min(1).max(20).default(5),
          filters: z
            .record(z.string(), z.union([z.string(), z.array(z.string())]))
            .optional()
            .describe(
              'Feldfilter, z.B. {"content_type":"praxishilfe"}. Werte NIE raten — vorher gruenerator_get_filters aufrufen.'
            ),
          searchMode: z
            .enum(['hybrid', 'vector', 'text'])
            .default('hybrid')
            .describe(
              'hybrid kombiniert Bedeutung und Wortlaut und passt fast immer. text sucht rein nach Wortlaut — für wörtliche Zitate, Eigennamen und Paragraphen. vector rein nach Bedeutung.'
            ),
        },
        outputSchema: SEARCH_OUTPUT_SCHEMA,
        annotations: READONLY,
      },
      guarded('gruenerator_search', async ({ query, collection, limit, filters, searchMode }) => {
        const result = await executeDirectSearch({
          query,
          collection,
          limit,
          searchMode,
          ...(filters ? { filters } : {}),
        });
        if (result.error) return text(result.message ?? 'Suche fehlgeschlagen.', true);
        const hits = result.results.map((r) => ({
          // `rank` orders THIS response, `ref` identifies the source across
          // responses. A client citing by rank re-labels the same document on
          // every call.
          ref: buildSourceRef({ url: r.url, documentId: r.documentId }),
          rank: r.rank,
          title: r.source,
          url: r.url ?? null,
          excerpt: r.excerpt,
          relevance: r.relevance,
          collection,
        }));
        const payload = { collection, query, resultsCount: hits.length, results: hits };
        if (hits.length === 0) return structured('Keine Treffer.', payload);
        const lines = hits.map(
          (r) =>
            `[${r.rank}] **${r.title}** (${r.relevance})${r.url ? ` — ${r.url}` : ''}${r.ref ? ` [ref: ${r.ref}]` : ''}\n${r.excerpt}`
        );
        return structured(lines.join('\n\n'), payload);
      })
    );

    server.registerTool(
      'gruenerator_get_filters',
      {
        title: 'Filterwerte einer Sammlung',
        description:
          'Nennt die tatsächlich belegten Filterwerte einer Sammlung samt Trefferzahl. Vor jeder gefilterten Suche aufrufen — die Werte unterscheiden sich pro Sammlung und lassen sich nicht erraten.',
        inputSchema: { collection: z.enum(SEARCH_COLLECTIONS) },
        outputSchema: FILTERS_OUTPUT_SCHEMA,
        annotations: READONLY,
      },
      guarded('gruenerator_get_filters', async ({ collection }) => {
        const config = getCanonicalByKey(collection);
        if (!config) return text(`Unbekannte Sammlung: ${collection}`, true);

        // Same 30-minute cache the Recherche page uses; the aggregation is a
        // fan-out of Qdrant facet queries and far too costly per tool call.
        const cacheKey = config.id;
        const merged = getCachedFilters(cacheKey) ?? (await computeMergedFilters([config.id]));
        setCachedFilters(cacheKey, merged);

        const entries = Object.entries(merged.filters);
        const fields = entries.map(([field, entry]) => ({
          field,
          label: entry.label,
          type: entry.type,
          ...(entry.values ? { values: entry.values } : {}),
          ...(entry.min ? { min: entry.min } : {}),
          ...(entry.max ? { max: entry.max } : {}),
        }));
        if (entries.length === 0) {
          return structured(`Sammlung "${collection}" hat keine Filterfelder.`, {
            collection,
            fields,
          });
        }

        const blocks = entries.map(([field, entry]) => {
          if (entry.type === 'date_range') {
            return `**${field}** (${entry.label}, Zeitraum): ${entry.min ?? '?'} bis ${entry.max ?? '?'}`;
          }
          const values = (entry.values ?? [])
            .slice(0, 25)
            .map((v) => `${v.value} (${v.count})`)
            .join(', ');
          return `**${field}** (${entry.label}): ${values || '— keine Werte'}`;
        });
        return structured(`Filterfelder für "${collection}":\n\n${blocks.join('\n')}`, {
          collection,
          fields,
        });
      })
    );

    server.registerTool(
      'gruenerator_examples_search',
      {
        title: 'Beispiele durchsuchen',
        description:
          'Findet redaktionelle Vorbilder der Grünen: Social-Media-Posts (type="social") oder Pressemitteilungen (type="pressemitteilung") zu einem Thema.',
        inputSchema: {
          type: z.enum(['social', 'pressemitteilung']).default('social'),
          query: z.string().min(1),
          country: z.enum(['DE', 'AT']).default('DE'),
          platform: z
            .string()
            .optional()
            .describe('Nur bei type="social": z.B. instagram, facebook'),
          limit: z.number().int().min(1).max(12).default(6),
        },
        outputSchema: EXAMPLES_OUTPUT_SCHEMA,
        annotations: READONLY,
      },
      guarded('gruenerator_examples_search', async ({ type, query, country, platform, limit }) => {
        // Both branches carry their own item shape (a social post is not a press
        // release), so `examples` stays open in the schema. What is guaranteed is
        // the envelope — and a `ref` on every item, derived from its permalink.
        const emit = (result: { resultsCount: number; examples: unknown[] }) => {
          const { text: body, isError } = formatToolResult(result);
          if (isError) return text(body, true);
          const examples = result.examples.map((ex) => {
            const item = ex as Record<string, unknown>;
            const url =
              typeof item.url === 'string'
                ? item.url
                : typeof (item.metadata as Record<string, unknown> | undefined)?.url === 'string'
                  ? ((item.metadata as Record<string, unknown>).url as string)
                  : null;
            return { ...item, ref: buildSourceRef({ url, documentId: String(item.id ?? '') }) };
          });
          return structured(body, {
            type,
            query,
            country,
            resultsCount: examples.length,
            examples,
          });
        };

        if (type === 'social') {
          const result = await executeDirectExamplesSearch({
            query,
            country,
            limit,
            ...(platform ? { platform } : {}),
          });
          return emit(result);
        }
        return emit(await executeDirectPressemitteilungExamples({ query, country, limit }));
      })
    );

    server.registerTool(
      'umfragen',
      {
        title: 'Wahlumfragen',
        description:
          'Aktuelle Wahlumfragen: Sonntagsfrage (bundesweit, Bundesländer, Österreich) und themenbezogene Meinungsbilder.',
        inputSchema: {
          topic: z
            .string()
            .default('')
            .describe('Thema für das Meinungsbild; leer für die reine Sonntagsfrage'),
          bundesland: z.string().optional().describe('Bundesland/Region; weglassen für bundesweit'),
        },
        annotations: READONLY,
      },
      guarded('umfragen', async ({ topic, bundesland }) => {
        const result = await lookupUmfragen(topic ?? '', bundesland).catch(() => null);
        return result ? text(result) : text('Keine Umfragedaten verfügbar.', true);
      })
    );
  }

  // ── content: find_content, documents, boards_tasks, notebooks ─────────────
  if (contentRead) {
    registerAiTool(server, 'find_content', makeFindContentTool(ctx), { readOnly: true });

    registerAiTool(server, 'documents', makeDocumentsTool(ctx), {
      description: contentWrite
        ? `Zugriff auf die EIGENEN Dokumente, Tabellen und Präsentationen (nicht Boards — dafür 'boards_tasks'): auflisten (list), ansehen (get), umbenennen (rename), löschen (delete), mit einer Gruppe teilen (share_to_group). delete und share_to_group verlangen das zweistufige confirm-Protokoll; die id stammt aus list.`
        : `Die EIGENEN Dokumente, Tabellen und Präsentationen auflisten (list) oder eines per id ansehen (get).`,
      actions: contentWrite
        ? ['list', 'get', 'rename', 'delete', 'share_to_group']
        : ['list', 'get'],
      ...(contentWrite
        ? { overrides: { share_to_group: (args) => shareDocToGroupMcp(userId, args) } }
        : { readOnly: true }),
    });

    registerAiTool(server, 'boards_tasks', makeBoardsTasksTool(ctx), {
      description: contentWrite
        ? `Zugriff auf die EIGENEN Boards (Kanban) und Aufgaben: Boards auflisten (list_boards), Karten lesen (get_cards), offene Aufgaben boardübergreifend (my_tasks), Karte hinzufügen (add_card), bearbeiten (edit_card), verschieben (move_card), Fälligkeit setzen (set_due), zuweisen (assign). boardId/cardId stammen aus einer vorherigen Liste.`
        : `Die EIGENEN Boards (Kanban) lesen: Boards auflisten (list_boards), Karten eines Boards lesen (get_cards), offene Aufgaben boardübergreifend (my_tasks).`,
      actions: contentWrite
        ? [
            'list_boards',
            'get_cards',
            'my_tasks',
            'add_card',
            'edit_card',
            'move_card',
            'set_due',
            'assign',
          ]
        : ['list_boards', 'get_cards', 'my_tasks'],
      ...(contentWrite
        ? { overrides: { add_card: (args) => addCardDirect(userId, args) } }
        : { readOnly: true }),
    });

    registerAiTool(server, 'notebooks', makeNotebooksTool(ctx), {
      description: contentWrite
        ? `Zugriff auf die Notebooks der Person (Wissenssammlungen): auflisten (list — die id steht im ref), Details mit Dokumenten, Wolke-Ordnern und Freigaben (get), inhaltlich befragen (search mit id + query), anlegen (create; mit wolkeFolder {connectionId, path} wird der Ordner importiert), Wolke-Ordner anhängen (add_wolke_folder), Dokumente hinzufügen (add_documents), umbenennen (rename), Sichtbarkeit ändern (set_visibility), mit einem Projekt teilen (share_to_group), löschen (delete). create mit wolkeFolder, add_wolke_folder, set_visibility, share_to_group und delete verlangen das zweistufige confirm-Protokoll. search liefert eine belegte Antwort mit [n]-Markern und der dazugehörigen Quellenliste — gib die Marker und Quellen in deiner Antwort weiter.`
        : `Die Notebooks der Person auflisten (list — die id steht im ref), Details ansehen (get) oder inhaltlich befragen (search mit id + query). search liefert eine belegte Antwort mit [n]-Markern und der dazugehörigen Quellenliste — gib die Marker und Quellen in deiner Antwort weiter.`,
      actions: contentWrite
        ? [
            'list',
            'get',
            'search',
            'create',
            'add_wolke_folder',
            'add_documents',
            'rename',
            'set_visibility',
            'share_to_group',
            'delete',
          ]
        : ['list', 'get', 'search'],
      overrides: {
        // Die belegte Antwort IST das Ergebnis — als Markdown, nicht als
        // Registry-Eintrag wie im Chat.
        search: async (args) => {
          const id = typeof args.id === 'string' ? args.id : '';
          const query = typeof args.query === 'string' ? args.query : '';
          const outcome = await runNotebookSearch({ collectionId: id, query, userId });
          if (!outcome.ok) return { error: outcome.error };
          return renderNotebookAnswer(outcome.result, outcome.notebookName);
        },
        // Die Karten des Chats als zweistufiges confirm-Protokoll.
        ...(contentWrite
          ? {
              create: (args) => createNotebookMcp(userId, args),
              add_wolke_folder: (args) => addWolkeFolderMcp(userId, args),
              set_visibility: (args) => setNotebookVisibilityMcp(userId, args),
              share_to_group: (args) => shareNotebookMcp(userId, args),
            }
          : {}),
      },
      ...(contentWrite ? {} : { readOnly: true }),
    });
  }

  // ── recurring_tasks (content-Scope: die Aufgabe erzeugt Inhalte im Konto) ──
  if (contentRead) {
    registerAiTool(server, 'recurring_tasks', makeRecurringTasksTool(ctx), {
      description: contentWrite
        ? `Zugriff auf die wiederkehrenden Aufgaben der Person (ein Grünerator-Agent läuft von selbst im Takt): auflisten (list — die id steht im ref), Details samt letzten Läufen (get), einrichten (create mit title, instruction, recurrence {frequency, hour, minute, byweekday?, bymonthday?}; optional delivery, agentIdentifier, emailNotify, timezone), ändern (update), pausieren (pause), fortsetzen (resume), einmal sofort laufen lassen (run_now), löschen (delete). create und delete verlangen das zweistufige confirm-Protokoll.`
        : `Die wiederkehrenden Aufgaben der Person auflisten (list — die id steht im ref) oder Details samt letzten Läufen ansehen (get).`,
      actions: contentWrite
        ? ['list', 'get', 'create', 'update', 'pause', 'resume', 'run_now', 'delete']
        : ['list', 'get'],
      ...(contentWrite
        ? { overrides: { create: (args) => createRecurringTaskMcp(userId, args) } }
        : { readOnly: true }),
    });
  }

  // ── user_agents (content-Scope: der Agent ist Inhalt des Kontos) ──────────
  if (contentRead) {
    registerAiTool(server, 'user_agents', makeUserAgentsTool(ctx), {
      description: contentWrite
        ? `Zugriff auf die eigenen Grünerator-Agenten der Person (Agentura): auflisten (list — der identifier steht im ref, geteilte Agenten sind markiert), Details mit Rolle, Werkzeugen, Rezepten, Notebooks und Sichtbarkeit (get), aus einer Beschreibung neu anlegen (create mit brief; optional title, systemRole, enabledTools, skillMentions, defaultNotebookIds — die Rolle wird entworfen), ändern (update), mit einem Projekt teilen (share_to_group mit groupName), löschen (delete). create, share_to_group und delete verlangen das zweistufige confirm-Protokoll. System-Grüneratoren (gruenerator-…) sind hier nicht erreichbar.`
        : `Die eigenen und die aus Projekten geteilten Grünerator-Agenten der Person auflisten (list — der identifier steht im ref) oder Details ansehen (get).`,
      actions: contentWrite
        ? ['list', 'get', 'create', 'update', 'share_to_group', 'delete']
        : ['list', 'get'],
      ...(contentWrite
        ? {
            overrides: {
              create: (args) => createUserAgentMcp(userId, args),
              share_to_group: (args) => shareUserAgentMcp(userId, args),
            },
          }
        : { readOnly: true }),
    });
  }

  // ── recipes (content-Scope: die Textform ist Inhalt des Kontos) ───────────
  // Keine Overrides nötig: create und add_examples laufen direkt, delete
  // fragt selbst über confirm=true. Die Rümpfe der Systemrezepte gibt das
  // Werkzeug auch hier nicht heraus (parteiinterne Grenze).
  if (contentRead) {
    registerAiTool(server, 'recipes', makeRecipesTool(ctx), {
      description: contentWrite
        ? `Rezepte und eigene Textformen der Person („Texte anlernen"): alle Rezepte und eigenen Textformen auflisten (list — die mention steht im ref), Details ansehen (get — bei eigenen Textformen mit Beispielen und Stilblock, bei mitgelieferten Rezepten nur Titel und Beschreibung), aus Beispieltexten eine eigene Textform anlernen (create mit title, examples; optional mention, textType — die Mention eines mitgelieferten Rezepts ersetzt dessen Stilvorgaben), Beispiele ergänzen (add_examples), löschen (delete, zweistufiges confirm-Protokoll). Anwenden eines Rezepts ist Sache des Chats, nicht dieses Werkzeugs.`
        : `Die Rezepte und eigenen Textformen der Person auflisten (list — die mention steht im ref) oder Details ansehen (get).`,
      actions: contentWrite ? ['list', 'get', 'create', 'add_examples', 'delete'] : ['list', 'get'],
      ...(contentWrite ? {} : { readOnly: true }),
    });
  }

  // ── content:write: generation fat tools ───────────────────────────────────
  if (contentWrite) {
    server.registerTool(
      'create_document',
      {
        title: 'Dokument/Tabelle/Präsentation erstellen',
        description:
          'Erstellt ein neues Textdokument (kind="document"), eine Tabelle (kind="sheet") oder eine Präsentation (kind="presentation") im Grünerator-Konto der Person. Übergib in "prompt" einen konkreten Auftrag mit allen Inhalten/Fakten, die vorkommen sollen.',
        inputSchema: {
          kind: z.enum(['document', 'sheet', 'presentation']),
          prompt: z.string().min(1).describe('Konkreter Auftrag: Thema plus gewünschte Inhalte'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      guarded('create_document', async ({ kind, prompt }) => {
        const created = await runDocGeneration({
          kind,
          userContent: prompt,
          req,
          userId,
        });
        if (!created) return text('Erstellung fehlgeschlagen.', true);
        return text(`${created.title} wurde erstellt: ${absolutizeUrl(created.url)}`);
      })
    );

    server.registerTool(
      'create_board',
      {
        title: 'Kanban-Board erstellen',
        description:
          'Erstellt ein neues Kanban-Board (Aufgabenboard) im Grünerator-Konto der Person. Übergib in "prompt" einen konkreten Auftrag (Thema, Aufgaben, Spalten).',
        inputSchema: {
          prompt: z.string().min(1).describe('Konkreter Auftrag: Thema plus Aufgaben/Spalten'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      guarded('create_board', async ({ prompt }) => {
        const created = await runBoardGeneration({
          userContent: prompt,
          req,
          userId,
        });
        if (!created) return text('Board-Erstellung fehlgeschlagen.', true);
        return text(
          `Board „${created.title}" wurde erstellt: ${absolutizeUrl(`/boards/${created.boardId}`)}`
        );
      })
    );
  }

  // ── groups ────────────────────────────────────────────────────────────────
  if (has('groups:read')) {
    const groupsWrite = has('groups:write');
    registerAiTool(server, 'groups', makeGroupsTool(ctx), {
      description: groupsWrite
        ? `Zugriff auf die Projekte (Gruppen) der Person: auflisten (list — die id steht im ref), per Name finden (find), Details ansehen (get), die geteilten Inhalte mit Links auflisten (content), neues Projekt anlegen (create), per Einladungstoken beitreten (join), Name/Beschreibung ändern (update, nur Admins), öffentlich listen oder privat stellen (set_visibility mit isPublic, nur Admins). join und set_visibility verlangen das zweistufige confirm-Protokoll. Mitglieder verwalten ist hier nicht möglich.`
        : `Die Projekte (Gruppen) der Person auflisten (list — die id steht im ref), per Name finden (find), Details ansehen (get) oder die geteilten Inhalte mit Links auflisten (content).`,
      actions: groupsWrite
        ? ['list', 'find', 'get', 'content', 'create', 'join', 'update', 'set_visibility']
        : ['list', 'find', 'get', 'content'],
      ...(groupsWrite
        ? {
            extraShape: {
              confirm: z
                .boolean()
                .default(false)
                .describe(
                  'Nur bei join und set_visibility: erst true setzen, nachdem die Person zugestimmt hat.'
                ),
            },
            overrides: {
              create: (args) => createGroupDirect(userId, args),
              join: (args) => joinGroupDirect(userId, args),
              set_visibility: (args) => setGroupVisibilityMcp(userId, args),
            },
          }
        : { readOnly: true }),
    });
  }

  // ── Landesverbände (eigene Achse, kein OAuth-Scope) ───────────────────────
  if (apiKey && hasLandesverbandAccess(apiKey.landesverbaende)) {
    registerLandesverbandTools(server, {
      userId,
      landesverbaende: apiKey.landesverbaende,
    });
  }

  // ── media ─────────────────────────────────────────────────────────────────
  if (has('media:read')) {
    const mediaWrite = has('media:write');
    registerAiTool(server, 'media', makeMediaTool(ctx), {
      actions: mediaWrite ? ['list', 'delete'] : ['list'],
      ...(mediaWrite ? {} : { readOnly: true }),
    });
  }

  return server;
}
