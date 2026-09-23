/**
 * Die zählenden und prüfenden Leseaktionen von `notebook_quellen`: grep
 * (wörtliche Vorkommen), stats (Umfang und Lemmata), rank (Quellen ordnen)
 * und cite (Zitat wiederfinden, Belegsätze für eine Behauptung).
 *
 * Eigene Datei, damit schreibende Aktionen (`notebookSourceWriteActions.ts`)
 * daneben wachsen können, ohne dass sich die Zweige in die Quere kommen.
 * Die Logik liegt in `services/notebook/source{Grep,Stats,Cite}.ts`; hier
 * stehen nur Eingabeprüfung, Quellenregistrierung und die Antwortform.
 *
 * Jede Zählung über mehr als eine Quelle trägt `exhaustive`: wurde nicht alles
 * gelesen, sagt das Ergebnis es in Worten dazu — eine Untergrenze darf nicht
 * als Gesamtzahl beim Modell ankommen.
 */
import {
  listNotebookSources,
  type NotebookSourceRow,
  type NotebookSourcesDeps,
} from '../../../services/notebook/notebookSources.js';
import {
  citeQuote,
  supportClaim,
  type CiteCandidate,
} from '../../../services/notebook/sourceCite.js';
import {
  grepSources,
  loadScanTexts,
  shownGrepSources,
} from '../../../services/notebook/sourceGrep.js';
import {
  computeSourceStats,
  type SourceStatsResult,
  type StatsNlp,
} from '../../../services/notebook/sourceStats.js';
import { rankManualSearchResults } from '../../../services/search/manualSearchRanking.js';
import { applyContextCap } from '../../../utils/contextCap.js';

import { notebookUrl } from './notebookTools.js';
import { groundNote, groundRows, makeRow } from './personalDataTools.js';

import type { SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

export const SCAN_READ_ACTIONS = ['grep', 'stats', 'rank', 'cite'] as const;
export type ScanReadAction = (typeof SCAN_READ_ACTIONS)[number];

export const RANK_BY = ['relevance', 'term', 'date', 'length', 'pages'] as const;
export type RankBy = (typeof RANK_BY)[number];

/** Fester Text je Aktion, wenn ein Dienst ausfällt — nie „nichts gefunden". */
export const SCAN_FAILURE_BY_ACTION: Record<ScanReadAction, string> = {
  grep: 'Die Zählung ist fehlgeschlagen — das heißt nicht, dass der Begriff nicht vorkommt.',
  stats: 'Die Statistik ließ sich gerade nicht berechnen — bitte später erneut versuchen.',
  rank: 'Die Rangfolge ließ sich gerade nicht bilden — bitte später erneut versuchen.',
  cite: 'Die Zitatprüfung ist fehlgeschlagen — das heißt nicht, dass das Zitat nicht in den Quellen steht.',
};

const NOT_FOUND = 'Notebook nicht gefunden oder kein Zugriff.';
/** Der Grund steht dabei: „Notebook zu groß" und „nicht lesbar" verlangen verschiedene Auskünfte. */
export const notExhaustiveGrep = (reason: string | null) =>
  `Nicht alle Quellen wurden gelesen (${reason ?? 'unvollständig'}) — totalHits ist eine Untergrenze, keine Gesamtzahl.`;
export const notExhaustiveCounts = (reason: string | null) =>
  `Nicht alle Quellen wurden (ganz) gelesen (${reason ?? 'unvollständig'}) — die Zahlen sind Untergrenzen, keine Gesamtzahlen.`;
export const STATS_CHARS = 4000;
export const RANK_DEFAULT_LIMIT = 10;
export const RANK_MIN_SCORE = 0.2;

/**
 * Die Zeilen eines list-/rank-Ergebnisses als eine Zeile je Quelle (Titel —
 * ref, Datum bzw. Wert). Nur für den Replay späterer Turns (`mcpReplay.ts`
 * erkennt `refs`): dort bliebe vom ganzen Ergebnis sonst eine 500-Zeichen-
 * Vorschau, und die Folgefrage „lies die dritte" fände keinen ref mehr (#3561).
 */
export function compactRefs(
  rows: ReadonlyArray<{ title: string; ref: string; detail?: string | null }>
): string {
  return rows
    .map((r) => `${shortTitle(r.title)} — ${r.ref}${r.detail ? ` (${r.detail})` : ''}`)
    .join('\n');
}

/** Gescrapte Titel tragen Tab-Kaskaden und Teaser („…: Die Berliner Grünen haben am..."). */
const REF_TITLE_CHARS = 80;
function shortTitle(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim();
  return t.length > REF_TITLE_CHARS ? `${t.slice(0, REF_TITLE_CHARS - 1)}…` : t;
}

export const rankRefs = (ranking: readonly RankRow[]): string =>
  compactRefs(
    ranking.map((r) => ({
      title: `${r.rank}. ${r.title}`,
      ref: r.sourceId,
      detail: `${r.value ?? '—'} ${r.unit}`,
    }))
  );

export function isScanReadAction(action: string): action is ScanReadAction {
  return (SCAN_READ_ACTIONS as readonly string[]).includes(action);
}

export interface ScanActionArgs {
  sourceId?: string | undefined;
  phrase?: string | undefined;
  caseSensitive?: boolean | undefined;
  contexts?: number | undefined;
  lemmas?: boolean | undefined;
  lemmaOf?: string[] | undefined;
  topN?: number | undefined;
  by?: RankBy | undefined;
  query?: string | undefined;
  limit?: number | undefined;
  zitat?: string | undefined;
  claim?: string | undefined;
}

export interface ScanActionCtx {
  collection: NotebookCollection;
  userId: string;
  deps: NotebookSourcesDeps & { nlp: StatsNlp };
  sourceRegistry: SourceRegistry;
}

export async function runScanReadAction(
  action: ScanReadAction,
  args: ScanActionArgs,
  ctx: ScanActionCtx
): Promise<Record<string, unknown>> {
  switch (action) {
    case 'grep':
      return await grep(args, ctx);
    case 'stats':
      return await stats(args, ctx);
    case 'rank':
      return await rank(args, ctx);
    case 'cite':
      return await cite(args, ctx);
  }
}

// ---------------------------------------------------------------------------
// grep
// ---------------------------------------------------------------------------

async function grep(args: ScanActionArgs, ctx: ScanActionCtx): Promise<Record<string, unknown>> {
  const phrase = args.phrase?.trim() ?? '';
  if (phrase.length < 2) return { error: 'grep braucht phrase (mindestens 2 Zeichen).' };
  const { collection, userId, deps, sourceRegistry } = ctx;

  const loaded = await loadScanTexts(
    {
      collectionId: collection.id,
      userId,
      sourceId: args.sourceId,
      prefilterQuery: phrase,
    },
    deps
  );
  if ('error' in loaded) return loaded;
  const counted = grepSources(loaded.sources, phrase, {
    caseSensitive: args.caseSensitive,
    contexts: args.contexts,
  });
  const shown = shownGrepSources(counted.perSource, args.limit);

  if (counted.perSource.length === 0) {
    groundNote(
      sourceRegistry,
      `Notebook „${collection.name}"`,
      `Keine Treffer für „${phrase}".${loaded.exhaustive ? '' : ` ${notExhaustiveGrep(loaded.incompleteReason)}`}`
    );
  } else {
    sourceRegistry.register(
      shown.map((s): SearchResult => {
        const first = s.contexts[0];
        return {
          source: 'notebook',
          title: s.title,
          content: `${s.count}× „${phrase}"\n${s.contexts.map((c) => c.text).join('\n…\n')}`,
          documentId: s.sourceId,
          collectionId: collection.id,
          ...(first
            ? { charStart: first.charStart, pageNumber: first.pageNumber, citedText: first.text }
            : {}),
        };
      })
    );
  }
  return {
    notebook: collection.name,
    phrase,
    exhaustive: loaded.exhaustive,
    totalHits: counted.totalHits,
    sourcesScanned: loaded.sources.length,
    sourcesWithHits: counted.perSource.length,
    perSource: shown,
    ...(loaded.exhaustive ? {} : { note: notExhaustiveGrep(loaded.incompleteReason) }),
  };
}

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

export function renderStats(heading: string, s: SourceStatsResult): string {
  const counts = (c: {
    chars: number;
    words: number;
    sentences: number;
    paragraphs: number;
    pages: number | null;
    chunks: number | null;
  }) =>
    [
      `${c.words} Wörter`,
      `${c.chars} Zeichen`,
      `${c.sentences} Sätze`,
      `${c.paragraphs} Absätze`,
      c.pages ? `${c.pages} Seiten` : null,
      c.chunks !== null ? `${c.chunks} Chunks` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  const lines = [`Statistik: ${heading}`, `Gesamt: ${counts(s.totals)}`];
  if (!s.exhaustive) lines.push(notExhaustiveCounts(s.incompleteReason));
  for (const r of s.perSource ?? []) lines.push(`${r.title}: ${counts(r)}`);
  if (s.lemmas?.length) {
    lines.push(
      `Häufigste Lemmata: ${s.lemmas.map((l) => `${l.lemma} (${l.pos}) ${l.count}`).join(', ')}`
    );
  }
  for (const l of s.lemmaOf ?? []) {
    const forms = l.forms.map((f) => `${f.form} ${f.count}`).join(', ') || 'kommt nicht vor';
    lines.push(`Formen von „${l.lemma}" (gesamt ${l.total}): ${forms}`);
  }
  if (s.lemmasExhaustive === false) {
    lines.push('Lemma-Zahlen sind Untergrenzen: nicht der ganze Text ging an den Sprachdienst.');
  }
  if (s.note) lines.push(s.note);
  return applyContextCap(lines.join('\n'), STATS_CHARS, 'notebook_quellen:stats');
}

async function stats(args: ScanActionArgs, ctx: ScanActionCtx): Promise<Record<string, unknown>> {
  const { collection, userId, deps, sourceRegistry } = ctx;
  const result = await computeSourceStats(
    {
      collectionId: collection.id,
      userId,
      sourceId: args.sourceId,
      lemmas: args.lemmas ?? false,
      lemmaOf: args.lemmaOf,
      topN: args.topN ?? 30,
    },
    deps
  );
  if ('error' in result) return result;

  const heading = result.source?.title ?? collection.name;
  sourceRegistry.register(
    [
      {
        source: 'notebook',
        title: `Statistik: ${heading}`,
        content: renderStats(heading, result),
        collectionId: collection.id,
        ...(result.source ? { documentId: result.source.id } : {}),
      },
    ],
    { snippetChars: STATS_CHARS }
  );
  const note = [
    result.exhaustive ? null : notExhaustiveCounts(result.incompleteReason),
    result.note ?? null,
  ]
    .filter(Boolean)
    .join(' ');
  return { notebook: collection.name, ...result, ...(note ? { note } : {}) };
}

// ---------------------------------------------------------------------------
// rank
// ---------------------------------------------------------------------------

export type RankUnit = 'score' | 'Treffer' | 'Datum' | 'Zeichen' | 'Seiten';

export interface RankRow {
  rank: number;
  sourceId: string;
  title: string;
  value: number | string | null;
  unit: RankUnit;
}

const METADATA_RANK: Record<
  'date' | 'length' | 'pages',
  {
    sortBy: 'date' | 'chars' | 'pages';
    unit: RankUnit;
    value: (r: NotebookSourceRow) => number | string | null;
  }
> = {
  date: { sortBy: 'date', unit: 'Datum', value: (r) => r.createdAt?.slice(0, 10) ?? null },
  length: { sortBy: 'chars', unit: 'Zeichen', value: (r) => r.chars },
  pages: { sortBy: 'pages', unit: 'Seiten', value: (r) => r.pages },
};

async function canRead(ctx: ScanActionCtx): Promise<boolean> {
  const access = await ctx.deps.access(ctx.collection.id, ctx.userId);
  return access.exists && access.canRead;
}

async function rank(args: ScanActionArgs, ctx: ScanActionCtx): Promise<Record<string, unknown>> {
  const by = args.by;
  if (!by) return { error: 'rank braucht by (relevance, term, date, length oder pages).' };
  const query = args.query?.trim() ?? '';
  if (by === 'relevance' && !query) return { error: 'rank by="relevance" braucht query.' };
  if (by === 'term' && query.length < 2) {
    return { error: 'rank by="term" braucht query (mindestens 2 Zeichen).' };
  }
  const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? RANK_DEFAULT_LIMIT)));
  const { collection, userId, deps } = ctx;

  let rows: Array<Omit<RankRow, 'rank'>>;
  let exhaustive: boolean | null = null;
  let incompleteReason: string | null = null;

  if (by === 'term') {
    const loaded = await loadScanTexts(
      { collectionId: collection.id, userId, prefilterQuery: query },
      deps
    );
    if ('error' in loaded) return loaded;
    const counted = grepSources(loaded.sources, query, {});
    exhaustive = loaded.exhaustive;
    incompleteReason = loaded.incompleteReason;
    rows = counted.perSource.slice(0, limit).map((s) => ({
      sourceId: s.sourceId,
      title: s.title,
      value: s.count,
      unit: 'Treffer',
    }));
  } else if (by === 'relevance') {
    if (!(await canRead(ctx))) return { error: NOT_FOUND };
    const documentIds = (await deps.helper.getCollectionDocuments(collection.id)).map(
      (d) => d.document_id
    );
    rows = documentIds.length ? await rankByRelevance(documentIds, query, limit, ctx) : [];
  } else {
    if (!(await canRead(ctx))) return { error: NOT_FOUND };
    const spec = METADATA_RANK[by];
    const { items } = await listNotebookSources(
      { collectionId: collection.id, sortBy: spec.sortBy, limit },
      deps
    );
    rows = items.map((r) => ({
      sourceId: r.id,
      title: r.title,
      value: spec.value(r),
      unit: spec.unit,
    }));
  }

  const ranking: RankRow[] = rows.map((r, i) => ({ rank: i + 1, ...r }));
  const url = notebookUrl(collection);
  if (ranking.length === 0) {
    groundNote(ctx.sourceRegistry, `Notebook „${collection.name}"`, 'Keine Quellen zum Ordnen.');
  } else {
    groundRows(
      ctx.sourceRegistry,
      ranking.map((r) =>
        makeRow(
          r.title,
          url,
          'Notebook-Quelle',
          `${r.rank}. ${r.value ?? '—'} ${r.unit}`,
          r.sourceId
        )
      )
    );
  }
  return {
    notebook: collection.name,
    by,
    ...(query ? { query } : {}),
    ...(exhaustive === null ? {} : { exhaustive }),
    ...(exhaustive === false ? { note: notExhaustiveCounts(incompleteReason) } : {}),
    refs: rankRefs(ranking),
    ranking,
  };
}

/** Dokumente nach Relevanz — dieselbe Suche und Rangfolge wie das Suchfeld der Notebook-Seite. */
async function rankByRelevance(
  documentIds: string[],
  query: string,
  limit: number,
  ctx: ScanActionCtx
): Promise<Array<Omit<RankRow, 'rank'>>> {
  const resp = await ctx.deps.documentService.search({
    query,
    userId: ctx.userId,
    options: {
      limit: limit * 3,
      mode: 'hybrid',
      vectorWeight: 0.7,
      textWeight: 0.3,
      threshold: RANK_MIN_SCORE,
      searchCollection: 'documents',
    },
    filters: { documentIds },
  });
  if (!resp.success) {
    throw new Error(`notebook search failed: ${resp.error ?? resp.message ?? 'unknown error'}`);
  }
  return rankManualSearchResults({
    results: resp.results ?? [],
    sortBy: 'relevance',
    minScore: RANK_MIN_SCORE,
    limit,
  }).map((r) => ({
    sourceId: r.document_id,
    title: r.title || r.filename || '(ohne Titel)',
    value: Math.round(r.similarity_score * 1000) / 1000,
    unit: 'score',
  }));
}

// ---------------------------------------------------------------------------
// cite
// ---------------------------------------------------------------------------

function candidateSource(c: CiteCandidate, collectionId: string): SearchResult {
  return {
    source: 'notebook',
    title: c.title,
    content: c.sentence,
    documentId: c.sourceId,
    collectionId,
    ...(c.chunkIndex !== null ? { chunkIndex: c.chunkIndex } : {}),
    pageNumber: c.pageNumber,
    charStart: c.charStart,
    charEnd: c.charEnd,
    citedText: c.sentence,
  };
}

async function cite(args: ScanActionArgs, ctx: ScanActionCtx): Promise<Record<string, unknown>> {
  const zitat = args.zitat?.trim();
  const claim = args.claim?.trim();
  if (!zitat === !claim) return { error: 'cite braucht genau eines: zitat oder claim.' };
  const { collection, userId, deps, sourceRegistry } = ctx;
  const base = { collectionId: collection.id, userId, sourceId: args.sourceId };

  if (claim) {
    const out = await supportClaim({ ...base, claim }, deps);
    if ('error' in out) return out;
    if (out.candidates.length === 0) {
      groundNote(
        sourceRegistry,
        `Notebook „${collection.name}"`,
        `Kein Satz in den gefundenen Passagen deckt sich mit „${claim}".`
      );
      return { claim, candidates: [] };
    }
    const sources = sourceRegistry.register(
      out.candidates.map((c) => candidateSource(c, collection.id))
    );
    return { claim, candidates: out.candidates, sources };
  }

  const quote = zitat as string;
  const out = await citeQuote({ ...base, quote }, deps);
  if ('error' in out) return out;
  if (out.found) {
    const sources = sourceRegistry.register([
      {
        source: 'notebook',
        title: out.title,
        content: out.context,
        documentId: out.sourceId,
        collectionId: collection.id,
        ...(out.chunkIndex !== null ? { chunkIndex: out.chunkIndex } : {}),
        pageNumber: out.pageNumber,
        charStart: out.charStart,
        charEnd: out.charEnd,
        citedText: out.matched,
      },
    ]);
    return { ...out, sources };
  }
  if (out.candidates.length > 0) {
    const sources = sourceRegistry.register(
      out.candidates.map((c) => candidateSource(c, collection.id))
    );
    return {
      ...out,
      note: 'Das Zitat steht in mehreren Quellen — nenne die gemeinte oder frage nach.',
      sources,
    };
  }
  const missing = out.exhaustive
    ? `Das Zitat „${quote}" steht so in keiner Quelle.`
    : `Das Zitat „${quote}" steht in keiner der gelesenen Quellen — nicht alle Quellen wurden gelesen (${out.incompleteReason ?? 'unvollständig'}).`;
  groundNote(sourceRegistry, `Notebook „${collection.name}"`, missing);
  return { ...out, note: missing };
}
