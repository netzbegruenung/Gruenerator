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
import { grepSources } from '../../../services/notebook/sourceGrep.js';
import { statsFromLoad, type StatsNlp } from '../../../services/notebook/sourceStats.js';
import {
  checkSystemSource,
  filterSystemSourceUrls,
  findSystemPassages,
  hasSystemFilter,
  listSystemSources,
  loadSystemScanTexts,
  outlineSystemSource,
  readSystemSourceText,
  NOT_A_URL,
  searchSystemDocuments,
  SOURCE_NOT_FOUND,
  suggestSystemSources,
  SYSTEM_LIST_SCROLL_MAX,
  systemSourceSize,
  type SystemCollection,
  type SystemNotebookSourcesDeps,
  type SystemSourceFilter,
} from '../../../services/notebook/systemNotebookSources.js';
import { rankManualSearchResults } from '../../../services/search/manualSearchRanking.js';

import { pickRange, type CharRange } from './notebookSourceRange.js';
import {
  notExhaustiveCounts,
  notExhaustiveGrep,
  RANK_DEFAULT_LIMIT,
  RANK_MIN_SCORE,
  renderStats,
  STATS_CHARS,
  type RankBy,
  type RankRow,
  type ScanActionArgs,
} from './notebookSourceReadActions.js';
import { groundNote, groundRows, makeRow } from './personalDataTools.js';

import type { SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

const EXCERPT_CHARS = 300;
const CLAIM_PASSAGES = 8;
const LIST_CAPPED = `Die Sammlung ist größer, als list durchsieht — total zählt nur die ersten ${SYSTEM_LIST_SCROLL_MAX} Quellen. Grenze mit filter ein oder suche mit find.`;

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
): Promise<string[] | null> {
  if (!filter) return null;
  return (await filterSystemSourceUrls({ collection: ctx.collection, filter }, ctx.deps)).urls;
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
  const { total, items, exhaustive, categories } = await listSystemSources(
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
    groundRows(sourceRegistry, results);
  }
  return {
    notebook: collection.name,
    collection: collection.key,
    total,
    exhaustive,
    offset: args.offset ?? 0,
    limit: Math.min(50, args.limit ?? 20),
    sortBy: args.sortBy ?? 'date',
    ...echoFilter(filter),
    categories,
    results,
    ...(exhaustive ? {} : { note: LIST_CAPPED }),
  };
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
  const urls = await scopedUrls(filter, ctx);
  if (urls?.length === 0) return { error: NO_SOURCE_IN_FILTER, ...echoFilter(filter) };
  const { passages, reranked } = await findSystemPassages(
    {
      collection,
      query,
      sourceUrl: args.sourceId,
      ...(urls ? { sourceUrls: urls } : {}),
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
    return { ...base, resultCount: 0, passages: [] };
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
  return {
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
  };
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
  const loaded = await loadSystemScanTexts(
    { collection, sourceUrl: args.sourceId, filter, prefilterQuery: phrase },
    deps
  );
  if ('error' in loaded) return loaded;
  const counted = grepSources(loaded.sources, phrase, {
    caseSensitive: args.caseSensitive,
    contexts: args.contexts,
  });
  if (counted.perSource.length === 0) {
    groundNote(
      sourceRegistry,
      `System-Notebook „${collection.name}"`,
      `Keine Treffer für „${phrase}".${loaded.exhaustive ? '' : ` ${notExhaustiveGrep(loaded.incompleteReason)}`}`
    );
  } else {
    sourceRegistry.register(
      counted.perSource.map((s): SearchResult => {
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
  return {
    notebook: collection.name,
    collection: collection.key,
    phrase,
    ...echoFilter(filter),
    exhaustive: loaded.exhaustive,
    totalHits: counted.totalHits,
    sourcesScanned: loaded.sources.length,
    sourcesWithHits: counted.perSource.length,
    perSource: counted.perSource.map((s) => ({ ...s, url: s.sourceId })),
    ...(loaded.exhaustive ? {} : { note: notExhaustiveGrep(loaded.incompleteReason) }),
  };
}

async function stats(
  args: SystemActionArgs,
  ctx: SystemActionCtx
): Promise<Record<string, unknown>> {
  const { collection, deps, sourceRegistry } = ctx;
  const filter = args.sourceId ? undefined : systemFilter(args);
  const loaded = await loadSystemScanTexts({ collection, sourceUrl: args.sourceId, filter }, deps);
  if ('error' in loaded) return loaded;
  const result = await statsFromLoad(
    loaded,
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
  return {
    notebook: collection.name,
    collection: collection.key,
    ...echoFilter(filter),
    ...result,
    ...(note ? { note } : {}),
  };
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

  if (by === 'relevance') {
    const urls = await scopedUrls(filter, ctx);
    if (urls?.length === 0) return { error: NO_SOURCE_IN_FILTER, ...echoFilter(filter) };
    const docs = await searchSystemDocuments(
      {
        collection,
        query,
        ...(urls ? { sourceUrls: urls } : {}),
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
    exhaustive = listed.exhaustive;
    incompleteReason = listed.exhaustive ? null : 'Sammlung zu groß';
    rows = listed.items.map((r) => ({
      sourceId: r.id,
      title: r.title,
      value: r.createdAt?.slice(0, 10) ?? null,
      unit: 'Datum',
    }));
  } else {
    // term, length, pages: aus den gelesenen Texten — Länge und Seiten stehen
    // bei System-Quellen in keiner Liste.
    const loaded = await loadSystemScanTexts(
      { collection, filter, ...(by === 'term' ? { prefilterQuery: query } : {}) },
      deps
    );
    if ('error' in loaded) return loaded;
    exhaustive = loaded.exhaustive;
    incompleteReason = loaded.incompleteReason;
    if (by === 'term') {
      rows = grepSources(loaded.sources, query, {})
        .perSource.slice(0, limit)
        .map((s) => ({ sourceId: s.sourceId, title: s.title, value: s.count, unit: 'Treffer' }));
    } else {
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
  }

  const ranking: RankRow[] = rows.map((r, i) => ({ rank: i + 1, ...r }));
  if (ranking.length === 0) {
    groundNote(
      ctx.sourceRegistry,
      `System-Notebook „${collection.name}"`,
      'Keine Quellen zum Ordnen.'
    );
  } else {
    groundRows(
      ctx.sourceRegistry,
      ranking.map((r) =>
        makeRow(
          r.title,
          r.sourceId,
          'System-Quelle',
          `${r.rank}. ${r.value ?? '—'} ${r.unit}`,
          r.sourceId
        )
      )
    );
  }
  return {
    notebook: collection.name,
    collection: collection.key,
    by,
    ...(query ? { query } : {}),
    ...echoFilter(filter),
    ...(exhaustive === null ? {} : { exhaustive }),
    ...(exhaustive === false ? { note: notExhaustiveCounts(incompleteReason) } : {}),
    ranking,
  };
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
    const urls = await scopedUrls(filter, ctx);
    if (urls?.length === 0) return { error: NO_SOURCE_IN_FILTER, ...echoFilter(filter) };
    const { passages } = await findSystemPassages(
      {
        collection,
        query: claim,
        sourceUrl: args.sourceId,
        ...(urls ? { sourceUrls: urls } : {}),
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
      return { claim, candidates: [] };
    }
    const sources = sourceRegistry.register(candidates.map((c) => candidateSource(c, collection)));
    return { claim, candidates, sources };
  }

  const quote = zitat as string;
  const loaded = await loadSystemScanTexts(
    { collection, sourceUrl: args.sourceId, filter, prefilterQuery: quote },
    deps
  );
  if ('error' in loaded) return loaded;
  const out = locateQuoteInSources(loaded, quote);
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
    return { ...out, url: out.sourceId, sources };
  }
  if (out.candidates.length > 0) {
    const sources = sourceRegistry.register(
      out.candidates.map((c) => candidateSource(c, collection))
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
  groundNote(sourceRegistry, label, missing);
  return { ...out, note: missing };
}
