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
 * System-Notebooks sind (noch) außen vor: ihre Inhalte liegen in eigenen
 * Qdrant-Sammlungen ohne `documents`-Zeilen.
 *
 * Aktionen stehen in `READ_ACTIONS`; schreibende Aktionen kommen als eigene
 * Liste dazu.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import {
  getCanonicalByKey,
  getSystemCollectionConfig,
} from '../../../config/systemCollectionsConfig.js';
import { NotebookQdrantHelper } from '../../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { getQdrantDocumentService } from '../../../services/document-services/DocumentSearchService/index.js';
import { checkHealth, textStatsBatched } from '../../../services/nlp/nlpClient.js';
import {
  charRangeOfChunks,
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
  type ChunkLocator,
  type NotebookSourceRow,
  type NotebookSourcesDeps,
  type ResolvedSource,
} from '../../../services/notebook/notebookSources.js';
import { rerankNotebookResults } from '../../../services/notebook/rerankNotebookResults.js';
import { createLogger } from '../../../utils/logger.js';
import { checkNotebookAccess } from '../../notebook/notebookAccess.js';

import {
  isScanReadAction,
  RANK_BY,
  runScanReadAction,
  SCAN_FAILURE_BY_ACTION,
  SCAN_READ_ACTIONS,
} from './notebookSourceReadActions.js';
import { notebookUrl } from './notebookTools.js';
import {
  groundNote,
  groundRows,
  makeRow,
  NO_SESSION,
  requireUserId,
  type PersonalToolCtx,
} from './personalDataTools.js';

import type { SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';
import type { DocumentChunkItem } from '../../../services/document-services/DocumentSearchService/types.js';
import type { StatsNlp } from '../../../services/notebook/sourceStats.js';

const log = createLogger('notebookSourceTools');

export const READ_ACTIONS = ['list', 'outline', 'read', 'find', ...SCAN_READ_ACTIONS] as const;

export type NotebookSourceToolDeps = NotebookSourcesDeps & { nlp: StatsNlp };

/** `PersonalToolCtx` plus optionale Fakes — der Katalog reicht den Ctx ohne `deps`. */
export type NotebookSourceToolCtx = PersonalToolCtx & {
  deps?: Partial<NotebookSourceToolDeps>;
};

const NOT_FOUND = 'Notebook nicht gefunden oder kein Zugriff.';
const NO_NOTEBOOK =
  'Kein Notebook ausgewählt — gib notebookId an (aus notebooks action="list", Feld ref).';
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
  };
}

function systemCollectionError(id: string): { error: string } | null {
  const config = getSystemCollectionConfig(id) ?? getCanonicalByKey(id);
  if (!config) return null;
  return {
    error: `System-Notebooks werden von notebook_quellen noch nicht unterstützt — nutze gruenerator_search mit collection="${config.key}".`,
  };
}

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
});

type CharRange = { von: number; zeichen?: number | undefined };

/** Die eine Navigationsangabe von `read` als Zeichenbereich im Text. */
function pickRange(
  args: {
    abschnitt?: CharRange | undefined;
    seite?: number | undefined;
    section?: number | undefined;
    chunks?: { from: number; to: number } | undefined;
  },
  chunkMap: readonly ChunkLocator[],
  chunks: readonly DocumentChunkItem[]
): CharRange | { error: string } {
  if (args.seite !== undefined) {
    const pages = chunkMap.flatMap((c) => (c.pageNumber === null ? [] : [c.pageNumber]));
    if (pages.length === 0) {
      return {
        error:
          'Diese Quelle hat keine Seitenzahlen — lies mit abschnitt{von} (Zeichen) oder chunks{from,to}.',
      };
    }
    return (
      charRangeOfChunks(chunkMap, (c) => c.pageNumber === args.seite) ?? {
        error: `Seite ${args.seite} gibt es nicht (Seiten ${Math.min(...pages)}–${Math.max(...pages)}).`,
      }
    );
  }
  if (args.section !== undefined) {
    const entry = outlineSource(chunks).find((e) => e.sectionIndex === args.section);
    const range = entry
      ? charRangeOfChunks(chunkMap, (c) => c.index >= entry.chunkFrom && c.index <= entry.chunkTo)
      : null;
    return (
      range ?? { error: `section ${args.section} gibt es nicht — die Nummern stehen in outline.` }
    );
  }
  if (args.chunks !== undefined) {
    const { from, to } = args.chunks;
    return (
      charRangeOfChunks(chunkMap, (c) => c.index >= from && c.index <= to) ?? {
        error: `Keine Chunks im Bereich ${from}–${to}.`,
      }
    );
  }
  return args.abschnitt ?? { von: 0 };
}

export function makeNotebookSourcesTool(ctx: NotebookSourceToolCtx): Tool {
  const { state, sourceRegistry } = ctx;
  const deps = resolveDeps(ctx.deps);

  /** Ausdrückliche id, sonst das erste im Chat gewählte eigene Notebook. */
  async function resolveNotebook(
    explicit: string | undefined
  ): Promise<{ collection: NotebookCollection } | { error: string }> {
    if (explicit) {
      const system = systemCollectionError(explicit);
      if (system) return system;
      const collection = await deps.helper.getNotebookCollection(explicit);
      return collection ? { collection } : { error: NOT_FOUND };
    }
    let firstSystem: { error: string } | null = null;
    for (const id of state.notebookIds ?? []) {
      const system = systemCollectionError(id);
      if (system) {
        firstSystem ??= system;
        continue;
      }
      const collection = await deps.helper.getNotebookCollection(id);
      if (collection) return { collection };
    }
    return firstSystem ?? { error: NO_NOTEBOOK };
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

Die sourceId stammt aus list (Feld ref) — rate sie nie. Ohne notebookId gilt das im Chat ausgewählte Notebook.`,
    inputSchema: z.object({
      action: z.enum(READ_ACTIONS),
      notebookId: z.string().optional().describe('Notebook-ID; ohne Angabe das ausgewählte'),
      sourceId: z
        .string()
        .optional()
        .describe('Quelle aus list (ref) — outline, read; bei find, grep, stats, cite optional'),
      sortBy: z
        .enum(['name', 'date', 'pages', 'size', 'words', 'status', 'type'])
        .optional()
        .describe('list'),
      order: z.enum(['asc', 'desc']).optional().describe('list'),
      filter: filterSchema.optional().describe('list'),
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
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      // `return await` in allen Zweigen: ohne `await` liefe eine abgelehnte
      // Zusage am `catch` vorbei, samt Rohtext bis zum Modell.
      try {
        const target = await resolveNotebook(args.notebookId);
        if ('error' in target) return target;
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

        if (!args.sourceId)
          return { error: `${args.action} braucht sourceId (aus list, Feld ref).` };
        const source = await resolveSourceInNotebook(
          { collectionId: collection.id, sourceId: args.sourceId, userId },
          deps
        );
        if (!source.ok) return { error: source.error };
        if (args.action === 'outline') return await outline(collection, args.sourceId, source);
        return await read(collection, args.sourceId, source, args);
      } catch (err) {
        // Der Rohtext bleibt im Log: englische Interna („Too many document
        // IDs") sind keine Auskunft für das Modell.
        log.warn(`[notebook_quellen] ${args.action} failed`, err);
        return { error: FAILURE_BY_ACTION[args.action] };
      }
    },
  });

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
