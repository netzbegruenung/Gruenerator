/**
 * Per-request MCP server assembly: a fresh McpServer per POST lets tools — and
 * the actions inside a tool — be registered only for granted OAuth scopes, so
 * the model never sees an action it cannot take.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  getCanonicalByKey,
  getMcpExposedCollections,
} from '../../config/systemCollectionsConfig.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { Sentry } from '../../lib/sentry.js';
import { lookupUmfragen } from '../../services/monitor/UmfragenService.js';
import { notebookQAService } from '../../services/notebook/NotebookQAService.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';
import {
  executeDirectExamplesSearch,
  executeDirectPressemitteilungExamples,
  executeDirectSearch,
} from '../chat/agents/directSearchExecutors.js';
import {
  makeBoardsTasksTool,
  makeDocumentsTool,
  makeFindContentTool,
  makeGroupsTool,
  makeMediaTool,
  makeNotebooksTool,
} from '../chat/agents/personalDataTools.js';
import { runBoardGeneration, runDocGeneration } from '../chat/services/intentExecutionService.js';
import {
  computeMergedFilters,
  getCachedFilters,
  setCachedFilters,
} from '../research/researchController.js';

import {
  absolutizeUrl,
  formatToolResult,
  makeMcpPersonalCtx,
  registerAiTool,
} from './chatToolBridge.js';
import {
  addCardDirect,
  createGroupDirect,
  joinGroupDirect,
  shareDocToGroupMcp,
} from './mcpMutations.js';
import {
  buildCollectionCatalog,
  buildMethodDocument,
  buildNotizbuchPrompt,
  buildRecherchePrompt,
} from './methodPrompts.js';

import type { QAResponse } from '../../services/notebook/types.js';
import type { Request } from 'express';

const log = createLogger('McpServerFactory');

/**
 * Derived from the canonical config, NOT from the chat catalog.
 *
 * `ALL_COLLECTIONS` is the chat agent's allow-list — eight entries, tuned for
 * what a chat agent should reach by default. Using it here silently hid twelve
 * `mcpExposed` collections, every Landesverband among them, from a surface
 * whose whole job is exposure. v1 has served them from `/api/v1/collections`
 * all along, so v2 was the narrower of the two.
 */
const SEARCH_COLLECTIONS = getMcpExposedCollections()
  .map((c) => c.key)
  .filter((key) => key !== 'examples')
  .sort() as [string, ...string[]];

let notebookHelperSingleton: NotebookQdrantHelper | null = null;
function notebookHelper(): NotebookQdrantHelper {
  notebookHelperSingleton ??= new NotebookQdrantHelper();
  return notebookHelperSingleton;
}

/**
 * `askSingleCollection` signals these two states by throwing. They are ordinary
 * outcomes for a tool call, not failures, so they get their own German text
 * instead of the bridge's generic "prüfe die übergebenen IDs".
 */
const NOTEBOOK_QA_ERRORS: Record<string, string> = {
  'Collection not found or access denied': 'Notizbuch nicht gefunden oder kein Zugriff.',
  'No documents found in this collection': 'Dieses Notizbuch enthält noch keine Dokumente.',
};

/**
 * The cited answer IS this tool's payload, so it leaves as markdown text:
 * `formatToolResult` passes strings through untouched, while an unrecognised
 * object shape would reach the client as raw JSON.
 */
function renderNotebookAnswer(result: QAResponse, notebookName: string): string {
  const citations = result.citations ?? [];
  if (citations.length === 0) return result.answer;
  const lines = citations.map((c) => {
    const title = c.document_title ?? c.title ?? 'Ohne Titel';
    const url = c.source_url ?? c.url;
    return `[${c.index}] ${title}${url ? ` — ${absolutizeUrl(url)}` : ''}`;
  });
  return `${result.answer}\n\nQuellen (${notebookName}):\n${lines.join('\n')}`;
}

const INSTRUCTIONS = `Grünerator MCP (angemeldet): Zugriff auf die eigenen Grünerator-Inhalte der angemeldeten Person (Dokumente, Boards/Aufgaben, Notizbücher, Gruppen, Medien) plus die Programm- und Beschlusssuche von Bündnis 90/Die Grünen (DE) und den Grünen (AT).

Für belegte Antworten aus mehreren Quellen gilt ein festes Vorgehen: die Resource gruenerator://methode beschreibt Ablauf und Zitierprotokoll, gruenerator://sammlungen listet die durchsuchbaren Sammlungen. Die Prompts "recherche" und "notizbuch-antwort" bringen beides fertig mit.

Regeln:
- Kein Tool schreibt dir den Text der Recherche — die Synthese aus den Treffern ist deine Aufgabe. Ausnahme: notebooks mit action="search" liefert bereits eine belegte Antwort.
- IDs und refs stammen immer aus einem vorherigen list-/search-Aufruf — niemals raten.
- Destruktive oder nach außen sichtbare Aktionen (löschen, teilen) verlangen das zweistufige Protokoll: erster Aufruf ohne confirm liefert eine Rückfrage; erst nach Zustimmung der Person mit confirm=true erneut aufrufen.
- create_document/create_board erzeugen echte Inhalte im Konto — Ergebnis-Link nennen.
- Antworten auf Deutsch, Quellen-URLs nennen.`;

function text(value: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text: value }],
    ...(isError ? { isError: true } : {}),
  };
}

type ToolResponse = ReturnType<typeof text>;

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

/**
 * Prompts and resources are scope-independent: they describe how to work with
 * this server, not what the connection may touch. A client that has been
 * granted nothing can still read the method — and should, because the first
 * thing it does with a new scope is search.
 */
function registerMethod(server: McpServer): void {
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
    'notizbuch-antwort',
    {
      title: 'Antwort aus einem eigenen Notizbuch',
      description:
        'Befragt den eigenen Quellenbestand und fasst die Treffer mit Quellenangaben zusammen.',
      argsSchema: {
        frage: z.string().describe('Die inhaltliche Frage'),
        notizbuch: z.string().optional().describe('Name des Notizbuchs, falls bekannt'),
      },
    },
    ({ frage, notizbuch }) => ({
      description: 'Notizbuch-Antwort mit Quellen',
      messages: buildNotizbuchPrompt(frage, notizbuch),
    })
  );

  server.registerResource(
    'methode',
    'gruenerator://methode',
    {
      title: 'Methode: belegt aus mehreren Quellen antworten',
      description:
        'Ablauf und Zitierprotokoll für Antworten aus den Grünen-Sammlungen und aus eigenen Notizbüchern.',
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
  /** The live Express request — carries app.locals.aiWorkerPool and req.user. */
  req: Request;
}

export function buildAuthenticatedMcpServer(opts: McpServerBuildOptions): McpServer {
  const { userId, scopes, req } = opts;
  const has = (s: string) => scopes.has(s);
  const contentRead = has('content:read');
  const contentWrite = has('content:write');

  const server = new McpServer(
    { name: 'gruenerator', version: '2.0.0' },
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
        },
        annotations: READONLY,
      },
      guarded('gruenerator_search', async ({ query, collection, limit, filters }) => {
        const result = await executeDirectSearch({
          query,
          collection,
          limit,
          ...(filters ? { filters } : {}),
        });
        if (result.error) return text(result.message ?? 'Suche fehlgeschlagen.', true);
        if (result.resultsCount === 0) return text('Keine Treffer.');
        const lines = result.results.map(
          (r) =>
            `[${r.rank}] **${r.source}** (${r.relevance})${r.url ? ` — ${r.url}` : ''}\n${r.excerpt}`
        );
        return text(lines.join('\n\n'));
      })
    );

    server.registerTool(
      'gruenerator_get_filters',
      {
        title: 'Filterwerte einer Sammlung',
        description:
          'Nennt die tatsächlich belegten Filterwerte einer Sammlung samt Trefferzahl. Vor jeder gefilterten Suche aufrufen — die Werte unterscheiden sich pro Sammlung und lassen sich nicht erraten.',
        inputSchema: { collection: z.enum(SEARCH_COLLECTIONS) },
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
        if (entries.length === 0) return text(`Sammlung "${collection}" hat keine Filterfelder.`);

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
        return text(`Filterfelder für "${collection}":\n\n${blocks.join('\n')}`);
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
        annotations: READONLY,
      },
      guarded('gruenerator_examples_search', async ({ type, query, country, platform, limit }) => {
        if (type === 'social') {
          const result = await executeDirectExamplesSearch({
            query,
            country,
            ...(platform ? { platform } : {}),
          });
          // executeDirectExamplesSearch has no limit param
          const examples = result.examples.slice(0, limit);
          const { text: body, isError } = formatToolResult({
            ...result,
            examples,
            resultsCount: Math.min(result.resultsCount, examples.length),
          });
          return text(body, isError);
        }
        const result = await executeDirectPressemitteilungExamples({ query, country, limit });
        const { text: body, isError } = formatToolResult(result);
        return text(body, isError);
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
        ? `Zugriff auf die EIGENEN Notizbücher (Quellensammlungen): auflisten (list), inhaltlich befragen (search mit id + query), umbenennen (rename), löschen (delete mit confirm-Protokoll). search liefert eine belegte Antwort mit [n]-Markern und der dazugehörigen Quellenliste — gib die Marker und Quellen in deiner Antwort weiter.`
        : `Die EIGENEN Notizbücher auflisten (list) oder inhaltlich befragen (search mit id + query). search liefert eine belegte Antwort mit [n]-Markern und der dazugehörigen Quellenliste — gib die Marker und Quellen in deiner Antwort weiter.`,
      actions: contentWrite ? ['list', 'search', 'rename', 'delete'] : ['list', 'search'],
      extraShape: {
        query: z.string().optional().describe('Suchfrage (nur bei action="search")'),
      },
      overrides: {
        search: async (args) => {
          const id = typeof args.id === 'string' ? args.id : null;
          const query = typeof args.query === 'string' ? args.query.trim() : '';
          if (!id || !query) return { error: 'search braucht id (aus list) und query.' };
          const collection = await notebookHelper().getNotebookCollection(id);
          if (!collection) return { error: 'Notizbuch nicht gefunden oder kein Zugriff.' };
          try {
            const result = await notebookQAService.askSingleCollection({
              collectionId: id,
              question: query,
              userId,
              aiWorkerPool: getAIWorkerPool(req),
              // Both are REQUIRED for user collections — the service throws
              // without them. Passing the already-fetched row mirrors
              // notebookContractRouter and hands the access decision to
              // `checkNotebookAccess` inside the service, which is the
              // canonical predicate (owner / share_mode / group membership).
              getCollectionFn: async () => collection,
              getDocumentIdsFn: async (cid) =>
                (await notebookHelper().getCollectionDocuments(cid)).map((d) => d.document_id),
            });
            return renderNotebookAnswer(result, collection.name);
          } catch (err) {
            const mapped = NOTEBOOK_QA_ERRORS[(err as Error).message];
            if (mapped) return { error: mapped };
            throw err;
          }
        },
      },
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
          aiWorkerPool: getAIWorkerPool(req),
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
          aiWorkerPool: getAIWorkerPool(req),
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
        ? `Zugriff auf die Gruppen der Person: auflisten (list), per Name finden (find), neue Gruppe anlegen (create), per Einladungstoken beitreten (join). join verlangt das zweistufige confirm-Protokoll (Mitglieder werden benachrichtigt).`
        : `Die Gruppen der Person auflisten (list) oder per Name finden (find).`,
      actions: groupsWrite ? ['list', 'find', 'create', 'join'] : ['list', 'find'],
      ...(groupsWrite
        ? {
            extraShape: {
              confirm: z
                .boolean()
                .default(false)
                .describe('Nur bei join: erst true setzen, nachdem die Person zugestimmt hat.'),
            },
            overrides: {
              create: (args) => createGroupDirect(userId, args),
              join: (args) => joinGroupDirect(userId, args),
            },
          }
        : { readOnly: true }),
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
