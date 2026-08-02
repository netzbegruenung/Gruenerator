/**
 * Per-request MCP server assembly: a fresh McpServer per POST lets tools — and
 * the actions inside a tool — be registered only for granted OAuth scopes, so
 * the model never sees an action it cannot take.
 */
import { buildSourceRef } from '@gruenerator/shared/utils';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

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
import { ALL_COLLECTIONS } from '../chat/agents/searchTools.js';
import { runBoardGeneration, runDocGeneration } from '../chat/services/intentExecutionService.js';

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

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Request } from 'express';

const log = createLogger('McpServerFactory');

// Derived from the chat search catalog — 'examples' has its own tool here.
const SEARCH_COLLECTIONS = ALL_COLLECTIONS.filter((c) => c !== 'examples') as unknown as [
  string,
  ...string[],
];

let notebookHelperSingleton: NotebookQdrantHelper | null = null;
function notebookHelper(): NotebookQdrantHelper {
  notebookHelperSingleton ??= new NotebookQdrantHelper();
  return notebookHelperSingleton;
}

const INSTRUCTIONS = `Grünerator MCP (angemeldet): Zugriff auf die eigenen Grünerator-Inhalte der angemeldeten Person (Dokumente, Boards/Aufgaben, Notizbücher, Gruppen, Medien) plus die Programm- und Beschlusssuche von Bündnis 90/Die Grünen (DE) und den Grünen (AT).

Regeln:
- IDs und refs stammen immer aus einem vorherigen list-/search-Aufruf — niemals raten.
- Destruktive oder nach außen sichtbare Aktionen (löschen, teilen) verlangen das zweistufige Protokoll: erster Aufruf ohne confirm liefert eine Rückfrage; erst nach Zustimmung der Person mit confirm=true erneut aufrufen.
- create_document/create_board erzeugen echte Inhalte im Konto — Ergebnis-Link nennen.
- Zitiere Suchtreffer über ihr Feld ref, nicht über rank: rank gilt nur innerhalb einer Antwort, ref bleibt über Aufrufe hinweg dasselbe. Nummeriere deine Quellenliste selbst und führe zwei Treffer mit gleichem ref als eine Quelle.
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
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  );

  const ctx = makeMcpPersonalCtx(userId);

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
        description: `Semantische Suche in Programmen, Beschlüssen und Positionen von Bündnis 90/Die Grünen (DE) und den Grünen (AT). Sammlungen: ${SEARCH_COLLECTIONS.join(', ')}.`,
        inputSchema: {
          query: z.string().min(1).describe('Suchbegriff oder Frage'),
          collection: z.enum(SEARCH_COLLECTIONS).default('deutschland'),
          limit: z.number().int().min(1).max(20).default(5),
        },
        outputSchema: SEARCH_OUTPUT_SCHEMA,
        annotations: READONLY,
      },
      guarded('gruenerator_search', async ({ query, collection, limit }) => {
        const result = await executeDirectSearch({ query, collection, limit });
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
            ...(platform ? { platform } : {}),
          });
          // executeDirectExamplesSearch has no limit param
          const examples = result.examples.slice(0, limit);
          return emit({
            ...result,
            examples,
            resultsCount: Math.min(result.resultsCount, examples.length),
          });
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
        ? `Zugriff auf die EIGENEN Notizbücher (Quellensammlungen): auflisten (list), inhaltlich durchsuchen (search mit id + query), umbenennen (rename), löschen (delete mit confirm-Protokoll).`
        : `Die EIGENEN Notizbücher auflisten (list) oder inhaltlich durchsuchen (search mit id + query).`,
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
          if (!collection || collection.user_id !== userId) {
            return { error: 'Notizbuch nicht gefunden oder kein Zugriff.' };
          }
          const result = await notebookQAService.askSingleCollection({
            collectionId: id,
            question: query,
            userId,
            aiWorkerPool: getAIWorkerPool(req),
            fastMode: true,
          });
          return { notebook: collection.name, sources: result.sources ?? [] };
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
