/**
 * `notebook_quellen` — die QUELLEN eines Notebooks im agentischen Loop.
 *
 * `notebooks` arbeitet auf der Ebene der Sammlung (auflisten, anlegen, teilen,
 * befragen); sein `search` liefert eine fertige Antwort mit 200-Zeichen-
 * Schnipseln. Hier geht es eine Ebene tiefer: welche Quellen liegen darin
 * (list), wie ist eine gegliedert (outline), was steht an einer Stelle (read
 * — Zeichenscheibe, Seite, Abschnitt oder Chunks), und wo steht etwas (find —
 * rohe Passagen mit Seite und Zeichenbereich). Belege kommen mit Fundstelle in
 * die Quellenregistrierung, damit die Zitate darauf zeigen.
 *
 * Zugriff: das Notebook über `checkNotebookAccess`, jede einzelne Quelle über
 * `resolveSourceInNotebook` (Lesezugriff UND Mitgliedschaft) — gelesen wird
 * danach mit der user_id der Eigentümer*in, damit geteilte Notebooks gehen.
 * System-Notebooks (Grundsatzprogramm, Landesverbände, …) laufen über eine
 * zweite, nur lesende Naht (`notebookSourceSystemActions.ts` auf
 * `systemNotebookSources.ts`): die Entscheidung fällt einmal, oben in
 * `execute`. Dort gilt statt `resolveSourceInNotebook` „Schlüssel ∈
 * `collectionsForLocale`" und „die URL hat Punkte unter dem Standardfilter".
 *
 * Aktionen stehen in `READ_ACTIONS`; die schreibenden in `WRITE_ACTIONS`
 * (`notebookSourceWriteActions.ts`).
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { NotebookQdrantHelper } from '../../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import { getQdrantDocumentService } from '../../../services/document-services/DocumentSearchService/index.js';
import { checkHealth, textStatsBatched } from '../../../services/nlp/nlpClient.js';
import {
  chunksOrThrow,
  findPassages,
  listNotebookSources,
  outlineSource,
  readSourceText,
  renderOutline,
  resolveSourceInNotebook,
  sliceSource,
  OUTLINE_CHARS,
  SLICE_REGISTER_CHARS,
  type NotebookSourceRow,
  type NotebookSourcesDeps,
  type ResolvedSource,
} from '../../../services/notebook/notebookSources.js';
import { rerankNotebookResults } from '../../../services/notebook/rerankNotebookResults.js';
import {
  resolveSystemCollection,
  SYSTEM_READ_ONLY,
  type SystemCollection,
  type SystemNotebookSourcesDeps,
} from '../../../services/notebook/systemNotebookSources.js';
import { createLogger } from '../../../utils/logger.js';
import { checkNotebookAccess } from '../../notebook/notebookAccess.js';
import { getRecentToolSteps } from '../services/threadPersistenceService.js';

import { pickRange } from './notebookSourceRange.js';
import {
  isScanReadAction,
  RANK_BY,
  runScanReadAction,
  SCAN_FAILURE_BY_ACTION,
  SCAN_READ_ACTIONS,
} from './notebookSourceReadActions.js';
import { runSystemAction } from './notebookSourceSystemActions.js';
import {
  isWriteAction,
  NOT_FOUND,
  resolveWriteDeps,
  runWriteAction,
  WRITE_ACTIONS,
  WRITE_FAILURE_BY_ACTION,
  type NotebookSourceWriteDeps,
} from './notebookSourceWriteActions.js';
import { notebookUrl } from './notebookTools.js';
import {
  groundNote,
  groundRows,
  makeRow,
  NO_SESSION,
  requireUserId,
  type PersonalToolCtx,
} from './personalDataTools.js';
import { collectionsForLocale } from './searchTools.js';

import type { SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';
import type { QdrantFilter } from '../../../database/services/QdrantService/types.js';
import type { StatsNlp } from '../../../services/notebook/sourceStats.js';
import type { PersistedStep } from '../services/agenticLoop/types.js';

const log = createLogger('notebookSourceTools');

export const READ_ACTIONS = ['list', 'outline', 'read', 'find', ...SCAN_READ_ACTIONS] as const;

export type NotebookSourceToolDeps = Omit<NotebookSourcesDeps, 'documentService'> & {
  nlp: StatsNlp;
  scrollPage: SystemNotebookSourcesDeps['scrollPage'];
  documentService: NotebookSourcesDeps['documentService'] &
    SystemNotebookSourcesDeps['documentService'];
  /** Die letzten Werkzeugschritte des Threads — für das Notebook des vorigen Turns. */
  recentSteps: (threadId: string) => Promise<PersistedStep[]>;
};

/** `PersonalToolCtx` plus optionale Fakes — der Katalog reicht den Ctx ohne `deps`. */
export type NotebookSourceToolCtx = PersonalToolCtx & {
  deps?: Partial<NotebookSourceToolDeps> & Partial<NotebookSourceWriteDeps>;
};

const NO_NOTEBOOK =
  'Kein Notebook ausgewählt — gib notebookId an: bei eigenen Notebooks den ref aus notebooks action="list", bei System-Notebooks den Schlüssel (z. B. berlin, deutschland).';
const TOOL_NAME = 'notebook_quellen';
/** Die Filterfelder, die ein Modell gern eine Ebene zu hoch setzt. */
const FILTER_KEYS = [
  'sourceType',
  'status',
  'titleContains',
  'tag',
  'category',
  'dateFrom',
  'dateTo',
] as const;
const EXCERPT_CHARS = 300;

/** Fester Text je Aktion, wenn ein Dienst ausfällt — nie „nichts gefunden". */
const FAILURE_BY_ACTION: Record<(typeof READ_ACTIONS)[number], string> = {
  list: 'Die Quellen des Notebooks ließen sich gerade nicht laden — bitte später erneut versuchen.',
  outline:
    'Die Gliederung ließ sich gerade nicht laden — das heißt nicht, dass die Quelle keine hat.',
  read: 'Die Quelle ließ sich gerade nicht lesen — bitte später erneut versuchen.',
  find: 'Die Suche im Notebook ist fehlgeschlagen — das heißt nicht, dass dazu nichts im Notebook steht.',
  ...SCAN_FAILURE_BY_ACTION,
};

let helperSingleton: NotebookQdrantHelper | null = null;

function resolveDeps(partial: Partial<NotebookSourceToolDeps> | undefined): NotebookSourceToolDeps {
  return {
    helper: partial?.helper ?? (helperSingleton ??= new NotebookQdrantHelper()),
    access: partial?.access ?? checkNotebookAccess,
    db: partial?.db ?? getPostgresInstance(),
    documentService: partial?.documentService ?? getQdrantDocumentService(),
    rerank: partial?.rerank ?? rerankNotebookResults,
    nlp: partial?.nlp ?? { checkHealth, textStatsBatched },
    scrollPage: partial?.scrollPage ?? qdrantScrollPage,
    recentSteps: partial?.recentSteps ?? ((threadId) => getRecentToolSteps(threadId)),
  };
}

/**
 * Filterfelder auf oberster Ebene gehören in `filter`. Das Schema lässt
 * unbekannte Felder durch (`passthrough`), damit sie hier ankommen — sonst
 * striche Zod `{titleContains: …}` still, und `list` lieferte die ungefilterten
 * 20 neuesten Quellen, als wäre gefiltert worden (Testserver 23.09.2026).
 * Aus demselben Grund wird `query` bei `list` zum Titelfilter: `list` kennt
 * keine Suche, und ein übergangenes Suchwort sähe aus wie „nichts gefunden".
 */
export function normalizeArgs<T extends { action: string; query?: string | undefined }>(
  args: T
): T {
  const nested = ((args as { filter?: unknown }).filter ?? {}) as Record<string, unknown>;
  const lifted: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const top = (args as Record<string, unknown>)[key];
    if (nested[key] === undefined && typeof top === 'string' && top.trim()) lifted[key] = top;
  }
  const query = args.query?.trim();
  if (args.action === 'list' && query && nested.titleContains === undefined) {
    lifted.titleContains ??= query;
  }
  if (Object.keys(lifted).length === 0) return args;
  return { ...args, filter: { ...nested, ...lifted } };
}

/** Eine Scroll-Seite samt Folge-Offset — `scrollDocuments` liefert den Offset nicht. */
async function qdrantScrollPage(
  qdrantCollection: string,
  filter: QdrantFilter,
  opts: { limit: number; offset: string | number | null; payload: readonly string[] }
): Promise<{
  points: Array<{ payload: Record<string, unknown> }>;
  nextOffset: string | number | null;
}> {
  const qdrant = getQdrantInstance();
  await qdrant.init();
  if (!qdrant.client) throw new Error('Qdrant not available');
  const result = await qdrant.client.scroll(qdrantCollection, {
    filter: filter as Record<string, unknown>,
    limit: opts.limit,
    with_payload: [...opts.payload],
    with_vector: false,
    ...(opts.offset !== null ? { offset: opts.offset } : {}),
  });
  const next = result.next_page_offset;
  return {
    points: (result.points ?? []).map((p) => ({
      payload: (p.payload as Record<string, unknown> | null) ?? {},
    })),
    nextOffset: typeof next === 'string' || typeof next === 'number' ? next : null,
  };
}

const isReadAction = (action: string): boolean =>
  (READ_ACTIONS as readonly string[]).includes(action);

function rowDetail(r: NotebookSourceRow): string {
  return [
    r.sourceType ?? r.documentType,
    r.createdAt?.slice(0, 10),
    r.pages !== null ? `${r.pages} S.` : null,
    r.words !== null ? `${r.wordsEstimated ? '~' : ''}${r.words} Wörter` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const filterSchema = z.object({
  sourceType: z.string().optional(),
  status: z.string().optional(),
  titleContains: z.string().optional(),
  tag: z.string().optional(),
  category: z.string().optional().describe('System-Notebooks: Kategorie'),
  dateFrom: z.string().optional().describe('System-Notebooks: ab Datum (JJJJ-MM-TT)'),
  dateTo: z.string().optional().describe('System-Notebooks: bis Datum (JJJJ-MM-TT)'),
});

const inputSchema = z
  .object({
    action: z.enum([...READ_ACTIONS, ...WRITE_ACTIONS]),
    notebookId: z
      .string()
      .optional()
      .describe(
        'Notebook-ID oder Sammlungsschlüssel eines System-Notebooks; ohne Angabe das ausgewählte'
      ),
    sourceId: z
      .string()
      .optional()
      .describe('Quelle aus list (ref) — outline, read; bei find, grep, stats, cite optional'),
    sortBy: z
      .enum(['name', 'date', 'pages', 'size', 'words', 'status', 'type'])
      .optional()
      .describe('list'),
    order: z.enum(['asc', 'desc']).optional().describe('list'),
    filter: filterSchema
      .optional()
      .describe('list; bei System-Notebooks auch find, rank, grep, stats, cite (z. B. nur 2025)'),
    offset: z.number().int().min(0).optional().describe('list'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('list, rank (bis 50), find (bis 20)'),
    abschnitt: z
      .object({
        von: z.number().int().min(0),
        zeichen: z.number().int().min(200).optional(),
      })
      .optional()
      .describe('read: ab Zeichen von'),
    seite: z.number().int().min(1).optional().describe('read: Seitenzahl'),
    section: z.number().int().min(0).optional().describe('read: section aus outline'),
    chunks: z
      .object({ from: z.number().int().min(0), to: z.number().int().min(0) })
      .optional()
      .describe('read: Chunk-Bereich'),
    query: z.string().optional().describe('find, rank (relevance, term): wonach gesucht wird'),
    mode: z.enum(['hybrid', 'vector', 'text']).default('hybrid').describe('find'),
    rerank: z.boolean().default(false).describe('find: Passagen neu bewerten (langsamer)'),
    phrase: z.string().min(2).optional().describe('grep: Wort oder Wortfolge'),
    caseSensitive: z
      .boolean()
      .optional()
      .describe('grep: Groß/klein beachten (dann zählen auch Akzente exakt)'),
    contexts: z.number().int().min(0).max(5).optional().describe('grep: Fundstellen je Quelle'),
    lemmas: z.boolean().optional().describe('stats: häufigste Lemmata'),
    lemmaOf: z.array(z.string()).optional().describe('stats: Wortformen dieser Lemmata'),
    topN: z.number().int().min(5).max(100).optional().describe('stats: Anzahl Lemmata'),
    by: z.enum(RANK_BY).optional().describe('rank: Kriterium'),
    zitat: z.string().min(8).optional().describe('cite: wörtliches Zitat'),
    claim: z.string().min(8).optional().describe('cite: Behauptung'),
    sourceIds: z
      .array(z.string())
      .min(1)
      .max(50)
      .optional()
      .describe('remove, move, copy: Quellen aus list (ref)'),
    targetNotebookId: z.string().optional().describe('move, copy: Ziel-Notebook'),
    title: z.string().min(1).max(200).optional().describe('rename, add_note; add_url optional'),
    add: z.array(z.string()).optional().describe('tag: hinzufügen'),
    remove: z.array(z.string()).optional().describe('tag: entfernen'),
    text: z.string().min(20).max(200_000).optional().describe('add_note: Inhalt'),
    url: z.string().optional().describe('add_url: eine öffentliche http(s)-Seite'),
  })
  // Unbekannte Felder durchlassen — `normalizeArgs` hebt verrutschte Filter an ihren Platz.
  .passthrough();

type ToolArgs = z.infer<typeof inputSchema>;

export function makeNotebookSourcesTool(ctx: NotebookSourceToolCtx): Tool {
  const { state, sourceRegistry } = ctx;
  const deps = resolveDeps(ctx.deps);
  const writeDeps = resolveWriteDeps(ctx.deps);

  type Target =
    | { kind: 'user'; collection: NotebookCollection }
    | { kind: 'system'; collection: SystemCollection }
    | { error: string };

  /**
   * Die notebookId des letzten erfolgreichen `notebook_quellen`-Aufrufs in
   * diesem Thread. Ein Folgeturn („wie oft kommt X vor?") nennt das Notebook
   * nicht mehr, und kleine Planer lassen die id dann weg, obwohl sie im Replay
   * steht. Ein Ausfall hier ist kein Fehler des Aufrufs — dann bleibt es bei
   * „kein Notebook".
   */
  async function notebookFromThread(): Promise<string | null> {
    if (!ctx.threadId) return null;
    try {
      const steps = await deps.recentSteps(ctx.threadId);
      for (let i = steps.length - 1; i >= 0; i--) {
        const step = steps[i]!;
        const id = step.args.notebookId;
        if (step.toolName === TOOL_NAME && step.ok !== false && typeof id === 'string' && id) {
          return id;
        }
      }
    } catch (err) {
      log.warn('[notebook_quellen] thread notebook lookup failed', err);
    }
    return null;
  }

  /**
   * Nur für Leseaktionen: ohne id und ohne Auswahl das Notebook, mit dem der
   * Thread zuletzt gearbeitet hat. `from: 'thread'` landet als Hinweis im
   * Ergebnis, damit die Antwort sagt, welches Notebook gemeint war.
   */
  async function resolveReadNotebook(
    explicit: string | undefined
  ): Promise<{ target: Target; from: 'thread' | null }> {
    const target = await resolveNotebook(explicit);
    if (!('error' in target) || target.error !== NO_NOTEBOOK) return { target, from: null };
    const previous = await notebookFromThread();
    if (!previous) return { target, from: null };
    return { target: await resolveNotebook(previous), from: 'thread' };
  }

  /**
   * Ausdrückliche id, sonst das erste im Chat gewählte eigene Notebook, sonst
   * das erste gewählte System-Notebook. Eine id, die eine System-Sammlung
   * nennt (Schlüssel, System-Id oder Notebook-Slug), wird nie als eigenes
   * Notebook nachgeschlagen.
   */
  async function resolveNotebook(explicit: string | undefined): Promise<Target> {
    // Erst beim Aufruf, nicht in der Fabrik: der Katalog baut das Werkzeug in
    // jedem Turn, und die Fabrik bleibt wie die anderen persönlichen Werkzeuge
    // ohne Arbeit. Dieselbe Menge wie bei `gruenerator_search`.
    const allowedSystemKeys = collectionsForLocale(state.userLocale ?? null);
    if (explicit) {
      const system = resolveSystemCollection(explicit, allowedSystemKeys);
      if (system) return 'error' in system ? system : { kind: 'system', ...system };
      const collection = await deps.helper.getNotebookCollection(explicit);
      return collection ? { kind: 'user', collection } : { error: NOT_FOUND };
    }
    let firstSystem: Target | null = null;
    let firstSystemError: { error: string } | null = null;
    for (const id of state.notebookIds ?? []) {
      const system = resolveSystemCollection(id, allowedSystemKeys);
      if (system) {
        if ('error' in system) firstSystemError ??= system;
        else firstSystem ??= { kind: 'system', ...system };
        continue;
      }
      const collection = await deps.helper.getNotebookCollection(id);
      if (collection) return { kind: 'user', collection };
    }
    return firstSystem ?? firstSystemError ?? { error: NO_NOTEBOOK };
  }

  /** Für die Schreibaktionen: ein System-Notebook ist nie Quelle oder Ziel. */
  async function resolveOwnNotebook(
    explicit: string | undefined
  ): Promise<{ collection: NotebookCollection } | { error: string }> {
    const target = await resolveNotebook(explicit);
    if ('error' in target) return target;
    if (target.kind === 'system') return { error: SYSTEM_READ_ONLY };
    return { collection: target.collection };
  }

  return tool({
    description: `Die Quellen EINES Notebooks: auflisten, gliedern, lesen und Passagen mit Fundstelle finden.

NUTZE FÜR: welche Dokumente im Notebook liegen, mit Typ, Datum, Seiten und Umfang, sortier- und filterbar (list); die Gliederung einer Quelle (outline); eine Quelle lesen — ab Zeichen (abschnitt), eine Seite (seite), einen Abschnitt aus outline (section) oder Chunks (read); die Stellen finden, an denen etwas steht, als Rohpassagen mit Seite und Zeichenbereich zum Zitieren (find, optional nur in einer Quelle).
NUTZE FÜR: wie oft ein Wort wörtlich vorkommt, je Quelle (grep).
NUTZE FÜR: Wörter, Sätze, Seiten zählen, optional Lemmata (stats).
NUTZE FÜR: Quellen ordnen nach Relevanz, Treffern, Datum, Länge, Seiten (rank).
NUTZE FÜR: ein Zitat prüfen (zitat) oder Belege für eine Behauptung finden (claim) (cite).
exhaustive=false: nicht alles gelesen — Zahlen nie als Gesamtzahl nennen.

NICHT für: Notebooks auflisten/anlegen/teilen (dafür 'notebooks'), die grüne Inhaltsdatenbank (dafür 'gruenerator_search').

NUTZE FÜR (direkt, umkehrbar): Quellen aus dem Notebook entfernen (remove — sie bleiben in der Bibliothek), in ein anderes Notebook verschieben oder kopieren (move/copy mit targetNotebookId), eigene Uploads umbenennen (rename) oder verschlagworten (tag), eine Notiz anlegen (add_note) und EINE Webseite importieren (add_url — eine Seite, keine ganze Website; erzeugt Einbettungen, kostet).

Die sourceId stammt aus list (Feld ref) — rate sie nie. Eine Quelle nach Namen suchen: list mit filter.titleContains; nach Inhalt: find.
Ohne notebookId gilt das im Chat ausgewählte Notebook, sonst das zuletzt in diesem Chat genutzte.
System-Notebooks: notebookId ist der Sammlungsschlüssel aus notebooks action="list" scope="system" (z. B. deutschland, hamburg, berlin); die sourceId ist dort die URL der Quelle. list nennt die Kategorien (categories) für filter.category; filter.dateFrom/dateTo grenzen auch find, rank, grep und stats ein. Nur lesen.`,
    inputSchema,
    execute: async (rawArgs) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const args = normalizeArgs(rawArgs);
      // `return await` in allen Zweigen: ohne `await` liefe eine abgelehnte
      // Zusage am `catch` vorbei, samt Rohtext bis zum Modell.
      try {
        if (isWriteAction(args.action)) {
          return await runWriteAction(
            { ...args, action: args.action },
            { state, sourceRegistry, userId, deps: writeDeps, resolveNotebook: resolveOwnNotebook }
          );
        }
        const { target, from } = await resolveReadNotebook(args.notebookId);
        if ('error' in target) return target;
        const result = await runRead(target, args, userId);
        if (from !== 'thread' || 'error' in result) return result;
        const name = target.collection.name;
        return {
          ...result,
          notebookFrom: `Ohne notebookId: das zuletzt in diesem Chat genutzte Notebook „${name}".`,
        };
      } catch (err) {
        // Der Rohtext bleibt im Log: englische Interna („Too many document
        // IDs") sind keine Auskunft für das Modell.
        log.warn(`[notebook_quellen] ${args.action} failed`, err);
        return {
          error: isWriteAction(args.action)
            ? WRITE_FAILURE_BY_ACTION[args.action]
            : FAILURE_BY_ACTION[args.action],
        };
      }
    },
  });

  async function runRead(
    target: Exclude<Target, { error: string }>,
    args: ToolArgs,
    userId: string
  ): Promise<Record<string, unknown>> {
    if (target.kind === 'system') {
      // Vor jeder Aktion: sobald schreibende Aktionen im Enum stehen,
      // erreichen sie ein System-Notebook nie.
      if (!isReadAction(args.action)) return { error: SYSTEM_READ_ONLY };
      return await runSystemAction(args, {
        collection: target.collection,
        deps,
        sourceRegistry,
      });
    }
    const { collection } = target;

    if (args.action === 'list') {
      if (!(await canRead(collection.id, userId))) return { error: NOT_FOUND };
      return await listSources(collection, args);
    }

    if (args.action === 'find') return await find(collection, userId, args);
    if (isScanReadAction(args.action)) {
      return await runScanReadAction(args.action, args, {
        collection,
        userId,
        deps,
        sourceRegistry,
      });
    }

    if (!args.sourceId) return { error: `${args.action} braucht sourceId (aus list, Feld ref).` };
    const source = await resolveSourceInNotebook(
      { collectionId: collection.id, sourceId: args.sourceId, userId },
      deps
    );
    if (!source.ok) return { error: source.error };
    if (args.action === 'outline') return await outline(collection, args.sourceId, source);
    return await read(collection, args.sourceId, source, args);
  }

  async function canRead(collectionId: string, userId: string): Promise<boolean> {
    const access = await deps.access(collectionId, userId);
    return access.exists && access.canRead;
  }

  async function listSources(
    collection: NotebookCollection,
    args: {
      sortBy?: 'name' | 'date' | 'pages' | 'size' | 'words' | 'status' | 'type' | undefined;
      order?: 'asc' | 'desc' | undefined;
      filter?: z.infer<typeof filterSchema> | undefined;
      offset?: number | undefined;
      limit?: number | undefined;
    }
  ): Promise<Record<string, unknown>> {
    const { total, items } = await listNotebookSources(
      {
        collectionId: collection.id,
        sortBy: args.sortBy,
        order: args.order,
        filter: args.filter,
        offset: args.offset,
        limit: args.limit,
      },
      deps
    );
    const url = notebookUrl(collection);
    const results = items.map((r) => makeRow(r.title, url, 'Notebook-Quelle', rowDetail(r), r.id));
    if (results.length === 0) {
      groundNote(sourceRegistry, `Notebook „${collection.name}"`, 'Keine passenden Quellen.');
    } else {
      groundRows(sourceRegistry, results);
    }
    return {
      notebook: collection.name,
      total,
      offset: args.offset ?? 0,
      limit: Math.min(50, args.limit ?? 20),
      sortBy: args.sortBy ?? 'date',
      ...(args.filter ? { filter: args.filter } : {}),
      results,
    };
  }

  async function outline(
    collection: NotebookCollection,
    sourceId: string,
    source: Extract<ResolvedSource, { ok: true }>
  ): Promise<Record<string, unknown>> {
    const chunkResult = await deps.documentService.getDocumentChunks(source.ownerUserId, sourceId);
    const entries = outlineSource(chunksOrThrow(chunkResult));
    if (entries.length === 0) {
      return { error: 'Für diese Quelle liegt (noch) keine Gliederung vor — lies sie mit read.' };
    }
    sourceRegistry.register(
      [
        {
          source: 'notebook',
          title: `Gliederung: ${source.title}`,
          content: renderOutline(source.title, entries),
          documentId: sourceId,
          collectionId: collection.id,
        },
      ],
      { snippetChars: OUTLINE_CHARS }
    );
    return { source: { id: sourceId, title: source.title }, outline: entries };
  }

  async function read(
    collection: NotebookCollection,
    sourceId: string,
    source: Extract<ResolvedSource, { ok: true }>,
    args: {
      abschnitt?: { von: number; zeichen?: number | undefined } | undefined;
      seite?: number | undefined;
      section?: number | undefined;
      chunks?: { from: number; to: number } | undefined;
    }
  ): Promise<Record<string, unknown>> {
    const picked = [args.abschnitt, args.seite, args.section, args.chunks].filter(
      (v) => v !== undefined
    ).length;
    if (picked > 1) {
      return { error: 'read nimmt genau eine Angabe: abschnitt, seite, section oder chunks.' };
    }

    const { text, origin, chunkMap, chunks } = await readSourceText(
      { sourceId, ownerUserId: source.ownerUserId },
      deps
    );
    if (!text.trim()) return { error: 'Die Quelle hat (noch) keinen lesbaren Text.' };

    const range = pickRange(args, chunkMap, chunks);
    if ('error' in range) return range;

    const s = sliceSource(text, range, chunkMap);
    if (!s.slice) return { error: `abschnitt.von liegt hinter dem Ende (${s.total} Zeichen).` };
    const firstChunk = chunkMap.find((c) => c.charStart < s.to && c.charEnd > s.from);
    const result: SearchResult = {
      source: 'notebook',
      title: source.title,
      content: s.slice,
      documentId: sourceId,
      collectionId: collection.id,
      ...(firstChunk ? { chunkIndex: firstChunk.index } : {}),
      pageNumber: s.pageRange?.from ?? null,
      charStart: s.from,
      charEnd: s.to,
      citedText: s.slice,
    };
    const sources = sourceRegistry.register([result], { snippetChars: SLICE_REGISTER_CHARS });
    return {
      source: { id: sourceId, title: source.title },
      from: s.from,
      to: s.to,
      total: s.total,
      pageRange: s.pageRange,
      origin,
      text: s.slice,
      continuationHint: s.continuationHint,
      sources,
    };
  }

  async function find(
    collection: NotebookCollection,
    userId: string,
    args: {
      sourceId?: string | undefined;
      query?: string | undefined;
      mode: 'hybrid' | 'vector' | 'text';
      rerank: boolean;
      limit?: number | undefined;
    }
  ): Promise<Record<string, unknown>> {
    const query = args.query?.trim();
    if (!query) return { error: 'find braucht query.' };

    let documentIds: string[];
    if (args.sourceId) {
      const source = await resolveSourceInNotebook(
        { collectionId: collection.id, sourceId: args.sourceId, userId },
        deps
      );
      if (!source.ok) return { error: source.error };
      documentIds = [args.sourceId];
    } else {
      if (!(await canRead(collection.id, userId))) return { error: NOT_FOUND };
      documentIds = (await deps.helper.getCollectionDocuments(collection.id)).map(
        (d) => d.document_id
      );
    }

    const { passages, reranked } = await findPassages(
      { documentIds, query, mode: args.mode, limit: args.limit ?? 10, rerank: args.rerank, userId },
      deps
    );
    const base = { notebook: collection.name, query, mode: args.mode, reranked };
    if (passages.length === 0) {
      groundNote(
        sourceRegistry,
        `Notebook „${collection.name}"`,
        `Keine Passage zu „${query}" gefunden.`
      );
      return { ...base, resultCount: 0, passages: [] };
    }
    const sources = sourceRegistry.register(
      passages.map((p): SearchResult => ({
        source: 'notebook',
        title: p.title,
        content: p.text,
        documentId: p.sourceId,
        collectionId: collection.id,
        chunkIndex: p.chunkIndex,
        pageNumber: p.pageNumber,
        charStart: p.charStart,
        charEnd: p.charEnd,
        relevance: p.score,
        citedText: p.text,
      }))
    );
    return {
      ...base,
      resultCount: passages.length,
      passages: passages.map((p) => ({
        sourceId: p.sourceId,
        title: p.title,
        chunkIndex: p.chunkIndex,
        pageNumber: p.pageNumber,
        charStart: p.charStart,
        charEnd: p.charEnd,
        score: p.score,
        hasTerm: p.hasTerm,
        excerpt: p.text.slice(0, EXCERPT_CHARS),
      })),
      sources,
    };
  }
}
