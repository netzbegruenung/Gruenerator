import { datePresets, daysAgo, isoDay } from './researchDates.js';

import type { ResearchSortOption } from '../api/researchSearch.js';

/**
 * Turns a free-text notebook question into the structured research search that
 * web's and mobile's notebook search consume — "was hat berlin seit 2023 zu
 * thema klima beschlossen" → collection = berlin-system, date_from = 2023-01-01,
 * themes = [klima], plus the residual semantic query.
 *
 * Deliberately local + deterministic (regex + lexicon, no LLM, no network). Only
 * keyword-anchored dates and themes gated to the real facet vocabulary (the
 * `filterFields` the caller fetched from `/research/filters`) are emitted —
 * so the parser can only ever emit filters the collections actually carry, and
 * never a bare-year or free-text-type guess. Which notebook a region name
 * means is the caller's (`regions`): each platform keeps its own
 * notebook → collection map.
 */

/** Research filters as the search UI holds them: keyword facets as value lists,
 *  date fields as ranges. */
export type ActiveFilters = Record<string, string[] | { date_from?: string; date_to?: string }>;

/** The part of a `/research/filters` field the parser reads. */
export interface ResearchFacetVocabulary {
  values?: Array<{ value: string; count: number }> | null;
  /** Maps raw facet values to display labels (e.g. theme code → German name). */
  valueLabels?: Record<string, string> | null;
}

/** A notebook a question can name, with the system collections it searches. */
export interface ResearchRegion {
  title: string;
  /** Lowercased words/phrases that identify the notebook inside a question. */
  aliases: readonly string[];
  /** Empty when the notebook has no searchable system collection. */
  collectionIds: readonly string[];
}

/**
 * Merge parser-derived filters into an existing set: keyword facets union
 * (a parsed topic adds to, never replaces, the user's manual selections); a
 * date range replaces. Pure so the immediate search and the state update can
 * merge identically.
 */
export function mergeParsedFilters(prev: ActiveFilters, next: ActiveFilters): ActiveFilters {
  const out: ActiveFilters = { ...prev };
  for (const [field, value] of Object.entries(next)) {
    if (Array.isArray(value)) {
      const existing = Array.isArray(out[field]) ? (out[field] as string[]) : [];
      out[field] = Array.from(new Set([...existing, ...value]));
    } else {
      out[field] = value;
    }
  }
  return out;
}

/**
 * Flatten `ActiveFilters` to the research-search request shape: keyword facets
 * stay keyed arrays; date ranges collapse to top-level `date_from`/`date_to`.
 * Pure (no hook state) so callers can build a request from a merged filter set.
 */
export function activeFiltersToApi(filters: ActiveFilters): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      if (value.length > 0) result[field] = value;
    } else {
      if (value.date_from) result['date_from'] = value.date_from;
      if (value.date_to) result['date_to'] = value.date_to;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export interface ParsedResearchIntent {
  /** The full query — semantic/hybrid search tolerates the extra words and topic terms help recall. */
  semanticQuery: string;
  /** The query minus recognised date phrases, recency words and standalone filler words; the full query when nothing is left. */
  residualQuery: string;
  /** Region scope, when a Landesverband was named (omitted when the scope is already fixed). */
  collectionIds?: string[];
  filters: ActiveFilters;
  sortBy?: ResearchSortOption;
  /** Human-readable summary of what was recognised, for the chip preview. */
  matched: {
    region?: string;
    dateLabel?: string;
    themes?: string[];
    persons?: string[];
  };
  /** Any structured scope/filter was detected — drives the "Gefiltert suchen" affordance. */
  hasStructure: boolean;
}

/** One recognised filter dimension, as a droppable chip / summary token. */
export interface ParsedFilterChip {
  /** The active-filter key ('region' | 'published_at' | 'themes' | 'persons'). */
  key: string;
  label: string;
}

/**
 * Enumerate the recognised filter dimensions of a parse in a stable order —
 * one source of truth for the composer's summary line and the results panel's
 * droppable chips (adding a future facet updates both).
 */
export function describeParsedFilters(parsed: ParsedResearchIntent): ParsedFilterChip[] {
  const chips: ParsedFilterChip[] = [];
  if (parsed.collectionIds?.length && parsed.matched.region) {
    chips.push({ key: 'region', label: parsed.matched.region });
  }
  if (parsed.filters['published_at'] && parsed.matched.dateLabel) {
    chips.push({ key: 'published_at', label: parsed.matched.dateLabel });
  }
  if (parsed.matched.themes?.length) {
    chips.push({ key: 'themes', label: parsed.matched.themes.join(', ') });
  }
  if (parsed.matched.persons?.length) {
    chips.push({ key: 'persons', label: parsed.matched.persons.join(', ') });
  }
  return chips;
}

/**
 * What a parse searches once some of its chips were dropped: the region chip
 * takes the collection scope with it, every other chip its filter field.
 */
export function parsedSearchScope(
  parsed: ParsedResearchIntent,
  dropped: ReadonlySet<string>
): { collectionIds?: string[]; filters: ActiveFilters } {
  const filters: ActiveFilters = {};
  for (const [field, value] of Object.entries(parsed.filters)) {
    if (!dropped.has(field)) filters[field] = value;
  }
  return {
    ...(parsed.collectionIds && !dropped.has('region') && { collectionIds: parsed.collectionIds }),
    filters,
  };
}

export interface ParseContext {
  /** Notebooks a question can name, in match priority order. */
  regions?: readonly ResearchRegion[];
  /** Runtime facet config from `/research/filters` — the topic/person vocabulary source. */
  filterFields: Record<string, ResearchFacetVocabulary>;
  /** When true the collection scope is already fixed (inside a notebook) → skip region detection. */
  scopeFixed?: boolean;
}

const DATE_FIELD = 'published_at';

const MONTHS: Record<string, number> = {
  januar: 1,
  jan: 1,
  februar: 2,
  feb: 2,
  märz: 3,
  maerz: 3,
  mär: 3,
  april: 4,
  apr: 4,
  mai: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  dezember: 12,
  dez: 12,
};

const NUMBER_WORDS: Record<string, number> = {
  einem: 1,
  einer: 1,
  eins: 1,
  ein: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  fuenf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
};

// „Aktuelle Stunde“ is a parliamentary debate format, not recency. The leading
// group stands in for a lookbehind (Safari 15 has none); replacements put it back.
const RECENCY_WORDS = String.raw`(^|[^\p{L}])(?:neuest\p{L}*|neust\p{L}*|aktuell\p{L}*(?!\p{L})(?!\s+stunde)|jüngst\p{L}*|juengst\p{L}*|zuletzt)(?!\p{L})`;
const RECENCY_RE = new RegExp(RECENCY_WORDS, 'iu');
const RECENCY_WORD_RE = new RegExp(RECENCY_WORDS, 'giu');
const FILLER_WORD_RE = /(^|[^\p{L}])(?:dokumente|texte|beiträge|artikel|alles|alle)(?!\p{L})/giu;

const pad = (n: number): string => String(n).padStart(2, '0');
const startOfYear = (y: number): string => `${y}-01-01`;
const endOfYear = (y: number): string => `${y}-12-31`;
const startOfMonth = (y: number, m: number): string => `${y}-${pad(m)}-01`;
const endOfMonth = (y: number, m: number): string =>
  `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;

const isLetter = (ch: string | undefined): boolean => !!ch && /\p{L}/u.test(ch);

/** Word-bounded containment (`\b` breaks on umlauts, so bounds are checked manually). */
export function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    if (!isLetter(haystack[idx - 1]) && !isLetter(haystack[idx + needle.length])) return true;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return false;
}

interface DateMatch {
  date_from?: string;
  date_to?: string;
  label?: string;
  /** Where the phrase sits in the text, so it can be cut from the residual query. */
  span?: [number, number];
}

const spanOf = (m: RegExpMatchArray): [number, number] => [
  m.index ?? 0,
  (m.index ?? 0) + m[0].length,
];

const parseCount = (raw: string): number | undefined => {
  const lower = raw.toLowerCase();
  return /^\d+$/.test(lower) ? Number(lower) : NUMBER_WORDS[lower];
};

/** Same day `n` calendar months back, clamped to the target month's last day (31 Mar → 28/29 Feb). */
function monthsAgo(now: Date, n: number): string {
  const target = new Date(now.getFullYear(), now.getMonth() - n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return isoDay(
    new Date(target.getFullYear(), target.getMonth(), Math.min(now.getDate(), lastDay))
  );
}

/** A toolbar preset's label when the range is exactly that preset, so the control can show it. */
function presetLabel(now: Date, from?: string, to?: string): string | undefined {
  return datePresets(now).find((p) => p.range.date_from === from && p.range.date_to === to)?.label;
}

/** Relative ranges ending today: "seit 30 Tagen", "letzte 2 Wochen", "letzten Monat", "dieses Jahr". */
function detectRelativeDate(text: string, now: Date): DateMatch | null {
  const counted = text.match(
    /\b(?:seit|(?:in\s+den\s+)?letzte[nr]?)\s+(\d+|\p{L}+)\s+(tag(?:e|en)?|wochen?|monat(?:e|en)?)(?!\p{L})/iu
  );
  const n = counted?.[1] ? parseCount(counted[1]) : undefined;
  if (counted && n && n > 0 && n <= 366) {
    const unit = (counted[2] ?? '').toLowerCase();
    let from: string;
    let fallback: string;
    if (unit.startsWith('tag')) {
      from = daysAgo(now, n);
      fallback = n === 1 ? 'Letzter Tag' : `Letzte ${n} Tage`;
    } else if (unit.startsWith('woche')) {
      from = daysAgo(now, 7 * n);
      fallback = n === 1 ? 'Letzte Woche' : `Letzte ${n} Wochen`;
    } else {
      // Twelve months is the toolbar's "Letzte 12 Monate" preset (365 days).
      from = n === 12 ? daysAgo(now, 365) : monthsAgo(now, n);
      fallback = n === 1 ? 'Letzter Monat' : `Letzte ${n} Monate`;
    }
    return { date_from: from, label: presetLabel(now, from) ?? fallback, span: spanOf(counted) };
  }

  const single = text.match(/\b(?:(?:in\s+der|im)\s+)?letzte[nr]?\s+(woche|monat)(?!\p{L})/iu);
  if (single) {
    const isWeek = single[1]?.toLowerCase() === 'woche';
    const from = isWeek ? daysAgo(now, 7) : monthsAgo(now, 1);
    return {
      date_from: from,
      label: isWeek ? 'Letzte Woche' : 'Letzter Monat',
      span: spanOf(single),
    };
  }

  const year = now.getFullYear();
  const thisYear = text.match(/\b(?:in\s+)?dies(?:em|es)\s+jahr(?!\p{L})/iu);
  const lastYear = text.match(
    /\b(?:im\s+)?(?:letzte[ns]?|vergangene[ns]?|vorige[ns]?)\s+jahr(?!\p{L})/iu
  );
  const yearMatch = thisYear ?? lastYear;
  if (yearMatch) {
    const y = thisYear ? year : year - 1;
    return {
      date_from: startOfYear(y),
      date_to: endOfYear(y),
      label: String(y),
      span: spanOf(yearMatch),
    };
  }

  return null;
}

/** Best-effort German temporal phrase → ISO date range. */
function detectDate(text: string, now: Date = new Date()): DateMatch {
  const relative = detectRelativeDate(text, now);
  if (relative) return relative;

  // zwischen 2022 und 2024 / von 2022 bis 2024
  const between = text.match(
    /\b(?:zwischen|von)\s+((?:19|20)\d{2})\s+(?:und|bis)\s+((?:19|20)\d{2})/i
  );
  if (between) {
    const a = Number(between[1]);
    const b = Number(between[2]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return {
      date_from: startOfYear(lo),
      date_to: endOfYear(hi),
      label: `${lo}–${hi}`,
      span: spanOf(between),
    };
  }

  const monthAlt = Object.keys(MONTHS).join('|');

  // seit / ab [Monat] YYYY
  const since = text.match(
    new RegExp(`\\b(seit|ab)\\s+(?:(${monthAlt})\\s+)?((?:19|20)\\d{2})`, 'i')
  );
  if (since) {
    const y = Number(since[3]);
    const m = since[2] ? MONTHS[since[2].toLowerCase()] : undefined;
    return {
      date_from: m ? startOfMonth(y, m) : startOfYear(y),
      label: `seit ${since[2] ? `${since[2]} ` : ''}${y}`,
      span: spanOf(since),
    };
  }

  // bis / vor [Monat] YYYY
  const until = text.match(
    new RegExp(`\\b(bis|vor)\\s+(?:(${monthAlt})\\s+)?((?:19|20)\\d{2})`, 'i')
  );
  if (until) {
    const y = Number(until[3]);
    const m = until[2] ? MONTHS[until[2].toLowerCase()] : undefined;
    return {
      date_to: m ? endOfMonth(y, m) : endOfYear(y),
      label: `bis ${until[2] ? `${until[2]} ` : ''}${y}`,
      span: spanOf(until),
    };
  }

  // aus 2023 / in 2023 / im Jahr 2023 — keyword-anchored, never a bare year.
  const inYear = text.match(/\b(?:aus(?:\s+dem\s+jahr)?|in|im\s+jahr)\s+((?:19|20)\d{2})\b/i);
  if (inYear) {
    const y = Number(inYear[1]);
    return {
      date_from: startOfYear(y),
      date_to: endOfYear(y),
      label: String(y),
      span: spanOf(inYear),
    };
  }

  // letzten N Jahren
  const lastN = text.match(/\bletzten?\s+(\d+|\w+)\s+jahren?\b/i);
  if (lastN?.[1]) {
    const n = parseCount(lastN[1]);
    if (n && n > 0 && n <= 50) {
      const from = now.getFullYear() - n;
      return { date_from: startOfYear(from), label: `letzte ${n} Jahre`, span: spanOf(lastN) };
    }
  }

  // No bare-year fallback: a standalone year mid-sentence ("Drucksache 2020",
  // "2024 Stimmen") is too often not a date. Dates must be keyword-anchored above.
  return {};
}

/** Drop date phrase, recency and filler words; fall back to the full query when nothing is left. */
function buildResidualQuery(trimmed: string, dateSpan?: [number, number]): string {
  const withoutDate = dateSpan
    ? `${trimmed.slice(0, dateSpan[0])} ${trimmed.slice(dateSpan[1])}`
    : trimmed;
  const residual = withoutDate
    .replace(RECENCY_WORD_RE, '$1 ')
    .replace(FILLER_WORD_RE, '$1 ')
    .replace(/\s+([,;:.!?])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '');
  return residual || trimmed;
}

/** The first region the query names, word-bounded ("Berliner Luft" names no region). */
export function findNamedRegion<R extends ResearchRegion>(
  query: string,
  regions: readonly R[]
): R | undefined {
  const text = query.toLowerCase();
  if (text.trim().length < 2) return undefined;
  return regions.find((region) => region.aliases.some((alias) => containsWord(text, alias)));
}

export function parseResearchIntent(query: string, ctx: ParseContext): ParsedResearchIntent {
  const trimmed = query.trim();
  const text = trimmed.toLowerCase();
  const filters: ActiveFilters = {};
  const matched: ParsedResearchIntent['matched'] = {};

  // ── Region → collection scope ──────────────────────────────────────────────
  let collectionIds: string[] | undefined;
  if (!ctx.scopeFixed && ctx.regions?.length) {
    const region = findNamedRegion(trimmed, ctx.regions);
    if (region && region.collectionIds.length > 0) {
      collectionIds = [...region.collectionIds];
      matched.region = region.title;
    }
  }

  // ── Date range ─────────────────────────────────────────────────────────────
  const date = detectDate(text);
  if (date.date_from || date.date_to) {
    filters[DATE_FIELD] = {
      ...(date.date_from ? { date_from: date.date_from } : {}),
      ...(date.date_to ? { date_to: date.date_to } : {}),
    };
    if (date.label) matched.dateLabel = date.label;
  }

  // ── Topic (themes) — matched against the real facet vocabulary ──────────────
  const themesConfig = ctx.filterFields['themes'];
  if (themesConfig?.values?.length) {
    const hits: string[] = [];
    const labels: string[] = [];
    for (const { value } of themesConfig.values) {
      const label = themesConfig.valueLabels?.[value] ?? value;
      if (label.length < 3) continue;
      if (containsWord(text, label.toLowerCase()) || containsWord(text, value.toLowerCase())) {
        hits.push(value);
        labels.push(label);
      }
    }
    if (hits.length > 0) {
      filters['themes'] = hits;
      matched.themes = labels;
    }
  }

  // ── Persons — multi-word names from the facet vocabulary only ──────────────
  const personsConfig = ctx.filterFields['persons'];
  if (personsConfig?.values?.length) {
    const hits: string[] = [];
    const labels: string[] = [];
    for (const { value } of personsConfig.values) {
      const label = personsConfig.valueLabels?.[value] ?? value;
      if (label.trim().split(/\s+/).length < 2) continue;
      if (containsWord(text, label.toLowerCase()) || containsWord(text, value.toLowerCase())) {
        hits.push(value);
        labels.push(label);
      }
    }
    if (hits.length > 0) {
      filters['persons'] = hits;
      matched.persons = labels;
    }
  }

  // ── Recency → sort ──────────────────────────────────────────────────────────
  const sortBy: ResearchSortOption | undefined = RECENCY_RE.test(text) ? 'date_desc' : undefined;

  const hasStructure =
    (collectionIds?.length ?? 0) > 0 || Object.keys(filters).length > 0 || sortBy != null;

  return {
    semanticQuery: trimmed,
    residualQuery: buildResidualQuery(trimmed, date.span),
    ...(collectionIds ? { collectionIds } : {}),
    filters,
    ...(sortBy ? { sortBy } : {}),
    matched,
    hasStructure,
  };
}
