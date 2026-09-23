/**
 * `notebook_quellen` auf einem SYSTEM-Notebook (Grundsatzprogramm,
 * Landesverbände, Bundestagsfraktion, gruene.de, Österreich …) — dieselben
 * acht Leseaktionen wie für eigene Notebooks, auf der Naht
 * `services/notebook/systemNotebookSources.ts`.
 *
 * Die Sammlung ist hier schon aufgelöst und gegen `collectionsForLocale`
 * geprüft (`resolveSystemCollection` in `notebookSourceTools.ts`). Eine Quelle
 * ist ihre URL: `sourceId` = `source_url`, und jeder Beleg trägt sie als `url`
 * — so sind Zitate aus System-Notebooks anklickbar. `collectionId` ist der
 * Sammlungsschlüssel.
 *
 * Schreibende Aktionen gibt es hier nicht: der Aufrufer weist sie vorher mit
 * `SYSTEM_READ_ONLY` ab.
 */
import {
  OUTLINE_CHARS,
  renderOutline,
  SLICE_REGISTER_CHARS,
  sliceSource,
  type SortOrder,
  type SourceSortBy,
} from '../../../services/notebook/notebookSources.js';
import {
  claimCandidates,
  locateQuoteInSources,
  type CiteCandidate,
} from '../../../services/notebook/sourceCite.js';
import {
  grepSources,
  shownGrepSources,
  type GrepOptions,
  type ScanLoad,
} from '../../../services/notebook/sourceGrep.js';
import { statsFromLoad, type StatsNlp } from '../../../services/notebook/sourceStats.js';
import {
  checkSystemSource,
  filterSystemSourceUrls,
  findSystemPassages,
  hasSystemFilter,
  listSystemSources,
  loadSystemScanTexts,
  loadSystemTermMatches,
  outlineSystemSource,
  readSystemSourceText,
  NOT_A_URL,
  searchSystemDocuments,
  SOURCE_NOT_FOUND,
  suggestSystemSources,
  SYSTEM_LIST_SCROLL_MAX,
  SYSTEM_SCAN_MAX_SOURCES,
  systemSourceSize,
  type SystemCollection,
  type SystemNotebookSourcesDeps,
  type SystemSourceFilter,
} from '../../../services/notebook/systemNotebookSources.js';
import { rankManualSearchResults } from '../../../services/search/manualSearchRanking.js';

import { pickRange, type CharRange } from './notebookSourceRange.js';
import {
  compactRefs,
  notExhaustiveCounts,
  notExhaustiveGrep,
  RANK_DEFAULT_LIMIT,
  RANK_MIN_SCORE,
  rankRefs,
  renderStats,
  STATS_CHARS,
  type RankBy,
  type RankRow,
  type ScanActionArgs,
} from './notebookSourceReadActions.js';
import { groundNote, groundSourceRows, makeRow } from './personalDataTools.js';

import type { SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

const EXCERPT_CHARS = 300;
const CLAIM_PASSAGES = 8;
const LIST_CAPPED = `Die Sammlung ist größer, als list durchsieht — total zählt nur die ersten ${SYSTEM_LIST_SCROLL_MAX} Quellen. Grenze mit filter ein oder suche mit find.`;
/**
 * Nur für den Planer, nicht in der Schreiber-Notiz (`SUMMARY_FIELDS`): der
 * Schreiber hat keine Werkzeuge. „Welche Kategorien gibt es? Zeig mir dann die
 * Quellen aus X" endete live nach diesem einen Aufruf, und der Schreiber meldete
 * X als leer, weil die gezeigte Seite keine davon enthielt (#3627).
 */
const LIST_PARTIAL_CATEGORIES =
  'Gezeigt ist nur ein Teil der Quellen. Fragt der Auftrag nach den Quellen einer Kategorie, rufe list erneut mit filter.category (Wert aus categories) auf — aus dieser Seite lässt sich nicht schließen, dass eine Kategorie leer ist.';

export interface SystemActionArgs extends ScanActionArgs {
  action: string;
  sortBy?: SourceSortBy | undefined;
  order?: SortOrder | undefined;
  filter?: (SystemSourceFilter & { sourceType?: string | undefined }) | undefined;
  offset?: number | undefined;
  abschnitt?: CharRange | undefined;
  seite?: number | undefined;
  section?: number | undefined;
  chunks?: { from: number; to: number } | undefined;
  mode: 'hybrid' | 'vector' | 'text';
  rerank: boolean;
}

export interface SystemActionCtx {
  collection: SystemCollection;
  deps: SystemNotebookSourcesDeps & { nlp: StatsNlp };
  sourceRegistry: SourceRegistry;
}

/** Der Beleg-Grundstock: jede System-Quelle mit anklickbarer URL. */
function grounded(
  collection: SystemCollection,
  url: string,
  title: string,
  content: string
): SearchResult {
  return {
    source: 'notebook',
    title,
    content,
    url,
    documentId: url,
    collectionId: collection.key,
  };
}

/** `filter` des Werkzeugs als Systemfilter — `sourceType` ist dort die Kategorie. */
function systemFilter(args: SystemActionArgs): SystemSourceFilter | undefined {
  const f = args.filter;
  if (!f) return undefined;
  const out: SystemSourceFilter = {
    category: f.category ?? f.sourceType,
    titleContains: f.titleContains,
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
  };
  return hasSystemFilter(out) ? out : undefined;
}

/** Nur die gesetzten Felder — so steht im Ergebnis, wonach wirklich gefiltert wurde. */
function echoFilter(f: SystemSourceFilter | undefined): Record<string, unknown> {
  if (!f) return {};
  return {
    filter: Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)),
  };
}

/**
 * Die URLs unter `filter` — `null` ohne Filter (ganze Sammlung). Eine leere
 * Menge ist eine Antwort, kein Fehler: dann passt keine Quelle.
 */
async function scopedUrls(
  filter: SystemSourceFilter | undefined,
  ctx: SystemActionCtx
): Promise<{ urls: string[]; exhaustive: boolean; undatedExcluded: number } | null> {
  if (!filter) return null;
  return await filterSystemSourceUrls({ collection: ctx.collection, filter }, ctx.deps);
}

/**
 * Ein Datumsfilter lässt Quellen ohne `published_at` still weg — in Berlin
 * gut jede fünfte. Das Ergebnis sagt es mit Zahl, damit „alle Beschlüsse aus
 * 2025" nicht als vollständig gelesen wird.
 */
function withUndated(result: Record<string, unknown>, undated: number): Record<string, unknown> {
  if (undated <= 0) return result;
  const said =
    undated === 1
      ? '1 Quelle ohne Datum fehlt, weil dateFrom/dateTo gesetzt ist.'
      : `${undated} Quellen ohne Datum fehlen, weil dateFrom/dateTo gesetzt ist.`;
  const note = [typeof result.note === 'string' ? result.note : null, said]
    .filter(Boolean)
    .join(' ');
  return { ...result, undatedExcluded: undated, note };
}

type TermLoad = ScanLoad & {
  undatedExcluded: number;
  /** Nur über den Volltextindex: die Zählregel und wie viele Quellen im Umfang lagen. */
  index?: { accept: (matched: string) => boolean; scopeSize: number };
};

/**
 * Die Texte für grep und rank by=term. Ein Umfang von höchstens
 * `SYSTEM_SCAN_MAX_SOURCES` Quellen wird ganz gelesen — vollständig und mit
 * der vollen Faltung des Zählers (Akzente egal, Worttrennung am Zeilenende).
 * Erst darüber zählt der Volltextindex (`loadSystemTermMatches`), der nur die
 * Schreibweisen findet, die er kennt — das Ergebnis sagt es dann
 * (`countRule`). Ohne passenden Index bleibt es beim Lesen mit Deckel.
 */
async function loadTermTexts(
  phrase: string,
  filter: SystemSourceFilter | undefined,
  ctx: SystemActionCtx
): Promise<TermLoad | { error: string }> {
  const { collection, deps } = ctx;
  const scope = await filterSystemSourceUrls({ collection, filter: filter ?? {} }, deps);
  const { undatedExcluded } = scope;
  if (scope.exhaustive && scope.urls.length <= SYSTEM_SCAN_MAX_SOURCES) {
    return await loadSystemScanTexts({ collection, filter }, deps);
  }
  const matched = await loadSystemTermMatches(
    { collection, phrase, ...(filter ? { sourceUrls: scope.urls } : {}) },
    deps
  );
  if (!matched) {
    return await loadSystemScanTexts({ collection, filter, prefilterQuery: phrase }, deps);
  }
  const { accept, ...load } = matched;
  const index = { accept, scopeSize: scope.urls.length };
  // Mit Filter ist der Umfang die URL-Liste — reißt sie am Deckel ab, fehlt ein Teil.
  if (filter && !scope.exhaustive) {
    return {
      ...load,
      exhaustive: false,
      incompleteReason: [load.incompleteReason, 'Sammlung zu groß'].filter(Boolean).join(', '),
      undatedExcluded,
      index,
    };
  }
  return { ...load, undatedExcluded, index };
}

const COUNT_RULE =
  'Gezählt über den Volltextindex: die Schreibweise der Phrase, nur Groß/klein egal (ohne Akzente und CO2/CO₂ gelten als gleich). Andere Akzente (Charite/Charité) und am Zeilenende getrennte Wörter zählen getrennt — suche jede Schreibweise einzeln.';
const OTHER_SPELLINGS_MAX = 5;

/**
 * Zählt `phrase` in den geladenen Texten. Über den Index zusätzlich: welche
 * anderen Schreibweisen der Zähler in den gefundenen Abschnitten sah, aber
 * nicht mitzählte — ein Hinweis, keine Gesamtzahl (Abschnitte NUR mit der
 * anderen Schreibweise holt der Index nicht).
 */
function countTerm(
  loaded: TermLoad,
  phrase: string,
  opts: Pick<GrepOptions, 'caseSensitive' | 'contexts'>
): {
  counted: ReturnType<typeof grepSources>;
  extra: Record<string, unknown>;
  note: string | null;
} {
  const index = loaded.index;
  if (!index) return { counted: grepSources(loaded.sources, phrase, opts), extra: {}, note: null };
  const other = new Map<string, number>();
  const counted = grepSources(loaded.sources, phrase, {
    ...opts,
    accept: (m) => {
      if (index.accept(m)) return true;
      const key = m.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
      other.set(key, (other.get(key) ?? 0) + 1);
      return false;
    },
  });
  const top = [...other].sort((a, b) => b[1] - a[1]).slice(0, OTHER_SPELLINGS_MAX);
  const note = top.length
    ? `„${phrase}" steht in den gefundenen Abschnitten außerdem ${top.map(([w, n]) => `${n}× als „${w}"`).join(', ')} — nicht mitgezählt; für alle Stellen grep je Schreibweise.`
    : null;
  return {
    counted,
    extra: {
      countRule: COUNT_RULE,
      ...(top.length ? { otherSpellings: Object.fromEntries(top) } : {}),
    },
    note,
  };
}

function joinNote(...parts: Array<string | null>): { note?: string } {
  const note = parts.filter(Boolean).join(' ');
  return note ? { note } : {};
}

const NO_SOURCE_IN_FILTER = 'Keine Quelle passt zu filter — lockere ihn oder prüfe ihn mit list.';

export async function runSystemAction(
  args: SystemActionArgs,
  ctx: SystemActionCtx
): Promise<Record<string, unknown>> {
  const result = await dispatch(args, ctx);
  const error = result.error;
  if (args.sourceId && (error === SOURCE_NOT_FOUND || error === NOT_A_URL)) {
    const suggestions = await suggestSystemSources(
      { collection: ctx.collection, sourceId: args.sourceId },
      ctx.deps
    );
    if (suggestions.length > 0) {
      return {
        error: `${error} Meintest du eine dieser Quellen? Nimm ihren ref als sourceId.`,
        suggestions,
      };
    }
    return {
      error: `${error} Suche sie mit list (filter.titleContains) oder find, statt sie zu raten.`,
    };
  }
  return result;
}

async function dispatch(
  args: SystemActionArgs,
  ctx: SystemActionCtx
): Promise<Record<string, unknown>> {
  switch (args.action) {
    case 'list':
      return await list(args, ctx);
    case 'outline':
      return await outline(args, ctx);
    case 'read':
      return await read(args, ctx);
    case 'find':
      return await find(args, ctx);
    case 'grep':
      return await grep(args, ctx);
    case 'stats':
      return await stats(args, ctx);
    case 'rank':
      return await rank(args, ctx);
    case 'cite':
      return await cite(args, ctx);
    default:
      return { error: `Unbekannte Aktion ${args.action}.` };
  }
}

// ---------------------------------------------------------------------------
// list, outline, read, find
// ---------------------------------------------------------------------------

async function list(
  args: SystemActionArgs,
  ctx: SystemActionCtx
): Promise<Record<string, unknown>> {
  const { collection, deps, sourceRegistry } = ctx;
  const filter = systemFilter(args);
  const { total, items, exhaustive, categories, undatedExcluded } = await listSystemSources(
    {
      collection,
      sortBy: args.sortBy,
      order: args.order,
      filter,
      offset: args.offset,
      limit: args.limit,
    },
    deps
  );
  const results = items.map((r) =>
    makeRow(
      r.title,
      r.id,
      'System-Quelle',
      [r.sourceType, r.createdAt?.slice(0, 10)].filter(Boolean).join(' · '),
      r.id
    )
  );
  if (results.length === 0) {
    groundNote(sourceRegistry, `System-Notebook „${collection.name}"`, 'Keine passenden Quellen.');
  } else {
    groundSourceRows(sourceRegistry, results, collection.key);
  }
  return withUndated(
    {
      notebook: collection.name,
      collection: collection.key,
      total,
      exhaustive,
      offset: args.offset ?? 0,
      limit: Math.min(50, args.limit ?? 20),
      sortBy: args.sortBy ?? 'date',
      ...echoFilter(filter),
      categories,
      ...(exhaustive ? {} : { note: LIST_CAPPED }),
      ...(!filter?.category && total > (args.offset ?? 0) + items.length
        ? { hint: LIST_PARTIAL_CATEGORIES }
        : {}),
      refs: compactRefs(
        items.map((r) => ({ title: r.title, ref: r.id, detail: r.createdAt?.slice(0, 10) ?? null }))
      ),
      results,
    },
    undatedExcluded
  );
}

async function outline(
  args: SystemActionArgs,
  ctx: SystemActionCtx
): Promise<Record<string, unknown>> {
  if (!args.sourceId) return { error: 'outline braucht sourceId (aus list, Feld ref).' };
  const { collection, deps, sourceRegistry } = ctx;
  const source = await readSystemSourceText({ collection, sourceUrl: args.sourceId }, deps);
  if ('error' in source) return source;
  const entries = outlineSystemSource(source.chunks);
  if (entries.length === 0) {
    return { error: 'Für diese Quelle liegt keine Gliederung vor — lies sie mit read.' };
  }
  sourceRegistry.register(
    [
      grounded(
        collection,
        args.sourceId,
        `Gliederung: ${source.title}`,
        renderOutline(source.title, entries)
      ),
    ],
    { snippetChars: OUTLINE_CHARS }
  );
  return {
    source: { id: args.sourceId, title: source.title, url: args.sourceId },
    outline: entries,
  };
}

async function read(
  args: SystemActionArgs,
  ctx: SystemActionCtx
): Promise<Record<string, unknown>> {
  if (!args.sourceId) return { error: 'read braucht sourceId (aus list, Feld ref).' };
  const picked = [args.abschnitt, args.seite, args.section, args.chunks].filter(
    (v) => v !== undefined
  ).length;
  if (picked > 1) {
    return { error: 'read nimmt genau eine Angabe: abschnitt, seite, section oder chunks.' };
  }
  const { collection, deps, sourceRegistry } = ctx;
  const source = await readSystemSourceText({ collection, sourceUrl: args.sourceId }, deps);
  if ('error' in source) return source;
  if (!source.text.trim()) return { error: 'Die Quelle hat keinen lesbaren Text.' };

  const range = pickRange(args, source.chunkMap, source.chunks);
  if ('error' in range) return range;
  const s = sliceSource(source.text, range, source.chunkMap);
  if (!s.slice) return { error: `abschnitt.von liegt hinter dem Ende (${s.total} Zeichen).` };
  const firstChunk = source.chunkMap.find((c) => c.charStart < s.to && c.charEnd > s.from);
  const sources = sourceRegistry.register(
    [
      {
        ...grounded(collection, args.sourceId, source.title, s.slice),
        ...(firstChunk ? { chunkIndex: firstChunk.index } : {}),
        pageNumber: s.pageRange?.from ?? null,
        charStart: s.from,
        charEnd: s.to,
        citedText: s.slice,
      },
    ],
    { snippetChars: SLICE_REGISTER_CHARS }
  );
  return {
    source: { id: args.sourceId, title: source.title, url: args.sourceId },
    from: s.from,
    to: s.to,
    total: s.total,
    pageRange: s.pageRange,
    origin: source.origin,
    text: s.slice,
    continuationHint: s.continuationHint,
    sources,
  };
}

async function find(
  args: SystemActionArgs,
  ctx: SystemActionCtx
): Promise<Record<string, unknown>> {
  const query = args.query?.trim();
  if (!query) return { error: 'find braucht query.' };
  const { collection, deps, sourceRegistry } = ctx;
  if (args.sourceId) {
    const missing = await checkSystemSource({ collection, sourceUrl: args.sourceId }, deps);
    if (missing) return missing;
  }
  const filter = args.sourceId ? undefined : systemFilter(args);
  const scope = await scopedUrls(filter, ctx);
  const undated = scope?.undatedExcluded ?? 0;
  if (scope?.urls.length === 0) {
    return withUndated({ error: NO_SOURCE_IN_FILTER, ...echoFilter(filter) }, undated);
  }
  const { passages, reranked } = await findSystemPassages(
    {
      collection,
      query,
      sourceUrl: args.sourceId,
      ...(scope ? { sourceUrls: scope.urls } : {}),
      mode: args.mode,
      limit: args.limit ?? 10,
      rerank: args.rerank,
    },
    deps
  );
  const base = {
    notebook: collection.name,
    collection: collection.key,
    query,
    mode: args.mode,
    reranked,
    ...echoFilter(filter),
  };
  if (passages.length === 0) {
    groundNote(
      sourceRegistry,
      `System-Notebook „${collection.name}"`,
      `Keine Passage zu „${query}" gefunden.`
    );
    return withUndated({ ...base, resultCount: 0, passages: [] }, undated);
  }
  const sources = sourceRegistry.register(
    passages.map((p): SearchResult => ({
      ...grounded(collection, p.sourceId, p.title, p.text),
      chunkIndex: p.chunkIndex,
      pageNumber: p.pageNumber,
      charStart: p.charStart,
      charEnd: p.charEnd,
      relevance: p.score,
      citedText: p.text,
    }))
  );
  return withUndated(
    {
      ...base,
      resultCount: passages.length,
      passages: passages.map((p) => ({
        sourceId: p.sourceId,
        url: p.sourceId,
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
    },
    undated
  );
}

// ---------------------------------------------------------------------------
// grep, stats, rank, cite
// ---------------------------------------------------------------------------

async function grep(
  args: SystemActionArgs,
  ctx: SystemActionCtx
): Promise<Record<string, unknown>> {
  const phrase = args.phrase?.trim() ?? '';
  if (phrase.length < 2) return { error: 'grep braucht phrase (mindestens 2 Zeichen).' };
  const { collection, deps, sourceRegistry } = ctx;
  const filter = args.sourceId ? undefined : systemFilter(args);
  const loaded: TermLoad | { error: string } = args.sourceId
    ? await loadSystemScanTexts({ collection, sourceUrl: args.sourceId }, deps)
    : await loadTermTexts(phrase, filter, ctx);
  if ('error' in loaded) return loaded;
  const { counted, extra, note } = countTerm(loaded, phrase, {
    caseSensitive: args.caseSensitive,
    contexts: args.contexts,
  });
  const shown = shownGrepSources(counted.perSource, args.limit);
  if (counted.perSource.length === 0) {
    groundNote(
      sourceRegistry,
      `System-Notebook „${collection.name}"`,
      `Keine Treffer für „${phrase}".${loaded.exhaustive ? '' : ` ${notExhaustiveGrep(loaded.incompleteReason)}`}`
    );
  } else {
    sourceRegistry.register(
      shown.map((s): SearchResult => {
        const first = s.contexts[0];
        return {
          ...grounded(
            collection,
            s.sourceId,
            s.title,
            `${s.count}× „${phrase}"\n${s.contexts.map((c) => c.text).join('\n…\n')}`
          ),
          ...(first
            ? { charStart: first.charStart, pageNumber: first.pageNumber, citedText: first.text }
            : {}),
        };
      })
    );
  }
  return withUndated(
    {
      notebook: collection.name,
      collection: collection.key,
      phrase,
      ...echoFilter(filter),
      exhaustive: loaded.exhaustive,
      totalHits: counted.totalHits,
      // Über den Index: die Quellen im Umfang — durchsucht sind alle, gelesen nur die Treffer.
      sourcesScanned: loaded.index?.scopeSize ?? loaded.sources.length,
      sourcesWithHits: counted.perSource.length,
      ...extra,
      perSource: shown.map((s) => ({ ...s, url: s.sourceId })),
      ...joinNote(loaded.exhaustive ? null : notExhaustiveGrep(loaded.incompleteReason), note),
    },
    loaded.undatedExcluded
  );
}

async function stats(
  args: SystemActionArgs,
  ctx: SystemActionCtx
): Promise<Record<string, unknown>> {
  const { collection, deps, sourceRegistry } = ctx;
  const filter = args.sourceId ? undefined : systemFilter(args);
  const loaded = await loadSystemScanTexts({ collection, sourceUrl: args.sourceId, filter }, deps);
  if ('error' in loaded) return loaded;
  const { undatedExcluded, ...load } = loaded;
  const result = await statsFromLoad(
    load,
    {
      sourceId: args.sourceId,
      lemmas: args.lemmas ?? false,
      lemmaOf: args.lemmaOf,
      topN: args.topN ?? 30,
    },
    (s) => systemSourceSize(s.chunkMap),
    deps.nlp
  );
  const heading = result.source?.title ?? collection.name;
  sourceRegistry.register(
    [
      {
        source: 'notebook',
        title: `Statistik: ${heading}`,
        content: renderStats(heading, result),
        collectionId: collection.key,
        ...(result.source ? { documentId: result.source.id, url: result.source.id } : {}),
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
  return withUndated(
    {
      notebook: collection.name,
      collection: collection.key,
      ...echoFilter(filter),
      ...result,
      ...(note ? { note } : {}),
    },
    undatedExcluded
  );
}

async function rank(
  args: SystemActionArgs,
  ctx: SystemActionCtx
): Promise<Record<string, unknown>> {
  const by: RankBy | undefined = args.by;
  if (!by) return { error: 'rank braucht by (relevance, term, date, length oder pages).' };
  const query = args.query?.trim() ?? '';
  if (by === 'relevance' && !query) return { error: 'rank by="relevance" braucht query.' };
  if (by === 'term' && query.length < 2) {
    return { error: 'rank by="term" braucht query (mindestens 2 Zeichen).' };
  }
  const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? RANK_DEFAULT_LIMIT)));
  const { collection, deps } = ctx;
  const filter = systemFilter(args);

  let rows: Array<Omit<RankRow, 'rank'>>;
  let exhaustive: boolean | null = null;
  let incompleteReason: string | null = null;
  let undated = 0;
  let termExtra: Record<string, unknown> = {};
  let termNote: string | null = null;

  if (by === 'relevance') {
    const scope = await scopedUrls(filter, ctx);
    undated = scope?.undatedExcluded ?? 0;
    if (scope?.urls.length === 0) {
      return withUndated({ error: NO_SOURCE_IN_FILTER, ...echoFilter(filter) }, undated);
    }
    const docs = await searchSystemDocuments(
      {
        collection,
        query,
        ...(scope ? { sourceUrls: scope.urls } : {}),
        mode: 'hybrid',
        limit: limit * 3,
      },
      deps
    );
    rows = rankManualSearchResults({
      results: docs.map((d) => ({ ...d, document_id: d.source_url || d.document_id })),
      sortBy: 'relevance',
      minScore: RANK_MIN_SCORE,
      limit,
    }).map((r) => ({
      sourceId: r.document_id,
      title: r.title || '(ohne Titel)',
      value: Math.round(r.similarity_score * 1000) / 1000,
      unit: 'score',
    }));
  } else if (by === 'date') {
    const listed = await listSystemSources({ collection, sortBy: 'date', filter, limit }, deps);
    undated = listed.undatedExcluded;
    exhaustive = listed.exhaustive;
    incompleteReason = listed.exhaustive ? null : 'Sammlung zu groß';
    rows = listed.items.map((r) => ({
      sourceId: r.id,
      title: r.title,
      value: r.createdAt?.slice(0, 10) ?? null,
      unit: 'Datum',
    }));
  } else if (by === 'term') {
    const loaded = await loadTermTexts(query, filter, ctx);
    if ('error' in loaded) return loaded;
    exhaustive = loaded.exhaustive;
    incompleteReason = loaded.incompleteReason;
    undated = loaded.undatedExcluded;
    const term = countTerm(loaded, query, {});
    termExtra = term.extra;
    termNote = term.note;
    rows = term.counted.perSource
      .slice(0, limit)
      .map((s) => ({ sourceId: s.sourceId, title: s.title, value: s.count, unit: 'Treffer' }));
  } else {
    // length, pages: aus den gelesenen Texten — Länge und Seiten stehen bei
    // System-Quellen in keiner Liste.
    const loaded = await loadSystemScanTexts({ collection, filter }, deps);
    if ('error' in loaded) return loaded;
    exhaustive = loaded.exhaustive;
    incompleteReason = loaded.incompleteReason;
    undated = loaded.undatedExcluded;
    const measured = loaded.sources.map((s) => ({
      sourceId: s.sourceId,
      title: s.title,
      value: by === 'length' ? s.text.length : systemSourceSize(s.chunkMap).pages,
      unit: by === 'length' ? ('Zeichen' as const) : ('Seiten' as const),
    }));
    rows = measured
      .filter((r) => r.value !== null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, limit);
  }

  const ranking: RankRow[] = rows.map((r, i) => ({ rank: i + 1, ...r }));
  if (ranking.length === 0) {
    groundNote(
      ctx.sourceRegistry,
      `System-Notebook „${collection.name}"`,
      'Keine Quellen zum Ordnen.'
    );
  } else {
    groundSourceRows(
      ctx.sourceRegistry,
      ranking.map((r) =>
        makeRow(
          r.title,
          r.sourceId,
          'System-Quelle',
          `${r.rank}. ${r.value ?? '—'} ${r.unit}`,
          r.sourceId
        )
      ),
      collection.key
    );
  }
  return withUndated(
    {
      notebook: collection.name,
      collection: collection.key,
      by,
      ...(query ? { query } : {}),
      ...echoFilter(filter),
      ...(exhaustive === null ? {} : { exhaustive }),
      ...termExtra,
      ...joinNote(exhaustive === false ? notExhaustiveCounts(incompleteReason) : null, termNote),
      refs: rankRefs(ranking),
      ranking,
    },
    undated
  );
}

function candidateSource(c: CiteCandidate, collection: SystemCollection): SearchResult {
  return {
    ...grounded(collection, c.sourceId, c.title, c.sentence),
    ...(c.chunkIndex !== null ? { chunkIndex: c.chunkIndex } : {}),
    pageNumber: c.pageNumber,
    charStart: c.charStart,
    charEnd: c.charEnd,
    citedText: c.sentence,
  };
}

async function cite(
  args: SystemActionArgs,
  ctx: SystemActionCtx
): Promise<Record<string, unknown>> {
  const zitat = args.zitat?.trim();
  const claim = args.claim?.trim();
  if (!zitat === !claim) return { error: 'cite braucht genau eines: zitat oder claim.' };
  const { collection, deps, sourceRegistry } = ctx;
  const label = `System-Notebook „${collection.name}"`;
  const filter = args.sourceId ? undefined : systemFilter(args);

  if (claim) {
    if (args.sourceId) {
      const missing = await checkSystemSource({ collection, sourceUrl: args.sourceId }, deps);
      if (missing) return missing;
    }
    const scope = await scopedUrls(filter, ctx);
    const undated = scope?.undatedExcluded ?? 0;
    if (scope?.urls.length === 0) {
      return withUndated({ error: NO_SOURCE_IN_FILTER, ...echoFilter(filter) }, undated);
    }
    const { passages } = await findSystemPassages(
      {
        collection,
        query: claim,
        sourceUrl: args.sourceId,
        ...(scope ? { sourceUrls: scope.urls } : {}),
        mode: 'hybrid',
        limit: CLAIM_PASSAGES,
        rerank: true,
      },
      deps
    );
    const candidates = claimCandidates(passages, claim);
    if (candidates.length === 0) {
      groundNote(
        sourceRegistry,
        label,
        `Kein Satz in den gefundenen Passagen deckt sich mit „${claim}".`
      );
      return withUndated({ claim, candidates: [] }, undated);
    }
    const sources = sourceRegistry.register(candidates.map((c) => candidateSource(c, collection)));
    return withUndated({ claim, candidates, sources }, undated);
  }

  const quote = zitat as string;
  const loaded = await loadSystemScanTexts(
    { collection, sourceUrl: args.sourceId, filter, prefilterQuery: quote },
    deps
  );
  if ('error' in loaded) return loaded;
  const { undatedExcluded, ...load } = loaded;
  const out = locateQuoteInSources(load, quote);
  if (out.found) {
    const sources = sourceRegistry.register([
      {
        ...grounded(collection, out.sourceId, out.title, out.context),
        ...(out.chunkIndex !== null ? { chunkIndex: out.chunkIndex } : {}),
        pageNumber: out.pageNumber,
        charStart: out.charStart,
        charEnd: out.charEnd,
        citedText: out.matched,
      },
    ]);
    return withUndated({ ...out, url: out.sourceId, sources }, undatedExcluded);
  }
  if (out.candidates.length > 0) {
    const sources = sourceRegistry.register(
      out.candidates.map((c) => candidateSource(c, collection))
    );
    return withUndated(
      {
        ...out,
        note: 'Das Zitat steht in mehreren Quellen — nenne die gemeinte oder frage nach.',
        sources,
      },
      undatedExcluded
    );
  }
  const missing = out.exhaustive
    ? `Das Zitat „${quote}" steht so in keiner Quelle.`
    : `Das Zitat „${quote}" steht in keiner der gelesenen Quellen — nicht alle Quellen wurden gelesen (${out.incompleteReason ?? 'unvollständig'}).`;
  groundNote(sourceRegistry, label, missing);
  return withUndated({ ...out, note: missing }, undatedExcluded);
}
