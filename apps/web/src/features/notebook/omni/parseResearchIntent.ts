import { getNotebookConfigBySlug } from '../config/notebookPagesConfig';
import {
  type ActiveFilters,
  type FilterFieldConfig,
  type SortOption,
} from '../manual-search/useResearchFilters';

import { detectNotebookEntities, type OmniTarget } from './omniIntent';

/**
 * Turns a free-text notebook question into the structured research search that
 * the manual-research surface already consumes — "was hat berlin seit 2023 zu
 * thema klima beschlossen" → collection = berlin-system, date_from = 2023-01-01,
 * themes = [klima], content_type = [beschluss], plus the residual semantic query.
 *
 * Deliberately local + deterministic (regex + lexicon, no LLM, no network). The
 * topic/type vocabulary is NOT hardcoded: it is read from the `filterFields` the
 * caller already fetched via `useResearchFilters` (real enumerated facet values),
 * so the parser can only ever emit filters the collections actually carry.
 */
export interface ParsedResearchIntent {
  /** The full query — semantic/hybrid search tolerates the extra words and topic terms help recall. */
  semanticQuery: string;
  /** Region scope, when a Landesverband was named (omitted when the scope is already fixed). */
  collectionIds?: string[];
  filters: ActiveFilters;
  sortBy?: SortOption;
  /** Human-readable summary of what was recognised, for the chip preview. */
  matched: {
    region?: string;
    dateLabel?: string;
    themes?: string[];
    contentType?: string[];
  };
  /** Any structured scope/filter was detected — drives the "Gefiltert suchen" affordance. */
  hasStructure: boolean;
}

/** One recognised filter dimension, as a droppable chip / summary token. */
export interface ParsedFilterChip {
  /** The active-filter key ('region' | 'published_at' | 'themes' | 'content_type'). */
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
  if (parsed.matched.contentType?.length) {
    chips.push({ key: 'content_type', label: parsed.matched.contentType.join(', ') });
  }
  return chips;
}

export interface ParseContext {
  /** Omni targets for region detection (from `buildSystemTargets` + own notebooks). */
  targets?: OmniTarget[];
  /** Runtime facet config from `useResearchFilters` — the topic/type vocabulary source. */
  filterFields: Record<string, FilterFieldConfig>;
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

const CONTENT_TYPE_LEXICON: { code: string; re: RegExp }[] = [
  { code: 'beschluss', re: /\bbeschl(uss|üsse|uesse|ossen|ießen|iessen)\w*/i },
  { code: 'antrag', re: /\b(anträge|antraege|antrag|beantragt)\w*/i },
  { code: 'presse', re: /\b(pressemitteilung\w*|pressemeldung\w*|presse)\b/i },
  { code: 'wahlprogramm', re: /\bwahlprogramm\w*/i },
  { code: 'blog', re: /\bblog\w*/i },
  { code: 'position', re: /\bposition\w*/i },
  { code: 'rede', re: /\breden?\b/i },
];

const RECENCY_RE = /\b(neuest\w*|neust\w*|aktuell\w*|jüngst\w*|juengst\w*|zuletzt)\b/i;

const pad = (n: number): string => String(n).padStart(2, '0');
const startOfYear = (y: number): string => `${y}-01-01`;
const endOfYear = (y: number): string => `${y}-12-31`;
const startOfMonth = (y: number, m: number): string => `${y}-${pad(m)}-01`;
const endOfMonth = (y: number, m: number): string =>
  `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;

const isLetter = (ch: string | undefined): boolean => !!ch && /\p{L}/u.test(ch);

/** Word-bounded containment (`\b` breaks on umlauts, so bounds are checked manually). */
function containsWord(haystack: string, needle: string): boolean {
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
}

/** Best-effort German temporal phrase → ISO date range. */
function detectDate(text: string): DateMatch {
  // zwischen 2022 und 2024 / von 2022 bis 2024
  const between = text.match(
    /\b(?:zwischen|von)\s+((?:19|20)\d{2})\s+(?:und|bis)\s+((?:19|20)\d{2})/i
  );
  if (between) {
    const a = Number(between[1]);
    const b = Number(between[2]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return { date_from: startOfYear(lo), date_to: endOfYear(hi), label: `${lo}–${hi}` };
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
    };
  }

  // letzten N Jahren
  const lastN = text.match(/\bletzten?\s+(\d+|\w+)\s+jahren?\b/i);
  if (lastN) {
    const raw = lastN[1].toLowerCase();
    const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
    if (n && n > 0 && n <= 50) {
      const from = new Date().getFullYear() - n;
      return { date_from: startOfYear(from), label: `letzte ${n} Jahre` };
    }
  }

  // bare standalone year → treat as that full year, but only within a plausible
  // recent window so round quantities ("über 2000 Geflüchtete", "1990
  // Unterschriften") aren't misread as dates.
  const bare = text.match(/(?:^|\s)((?:19|20)\d{2})(?:$|\s|\?|\.)/);
  if (bare) {
    const y = Number(bare[1]);
    const now = new Date().getFullYear();
    if (y >= now - 15 && y <= now + 2) {
      return { date_from: startOfYear(y), date_to: endOfYear(y), label: String(y) };
    }
  }

  return {};
}

/** Resolve a matched notebook target to its searchable system collection ids. */
function targetToCollectionIds(target: OmniTarget): string[] {
  const slug = target.path.split('/').filter(Boolean).pop();
  if (!slug) return [];
  const config = getNotebookConfigBySlug(slug);
  if (!config) return [];
  return config.collections.map((c) => c.id).filter((id) => id.endsWith('-system'));
}

export function parseResearchIntent(query: string, ctx: ParseContext): ParsedResearchIntent {
  const trimmed = query.trim();
  const text = trimmed.toLowerCase();
  const filters: ActiveFilters = {};
  const matched: ParsedResearchIntent['matched'] = {};

  // ── Region → collection scope ──────────────────────────────────────────────
  let collectionIds: string[] | undefined;
  if (!ctx.scopeFixed && ctx.targets?.length) {
    const [first] = detectNotebookEntities(trimmed, ctx.targets);
    if (first) {
      const ids = targetToCollectionIds(first.target);
      if (ids.length > 0) {
        collectionIds = ids;
        matched.region = first.target.title;
      }
    }
  }

  // ── Date range ─────────────────────────────────────────────────────────────
  const date = detectDate(text);
  if (date.date_from || date.date_to) {
    filters[DATE_FIELD] = {
      ...(date.date_from ? { date_from: date.date_from } : {}),
      ...(date.date_to ? { date_to: date.date_to } : {}),
    };
    matched.dateLabel = date.label;
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

  // ── Content type — lexicon, gated to values the collections actually have ────
  // When the facet is present (even empty) only its values may pass; when it is
  // absent entirely the lexicon is ungated (best-effort).
  const contentTypeConfig = ctx.filterFields['content_type'];
  const hasTypeFacet = contentTypeConfig != null;
  const availableTypes = new Set((contentTypeConfig?.values ?? []).map((v) => v.value));
  const typeHits: string[] = [];
  const typeLabels: string[] = [];
  for (const { code, re } of CONTENT_TYPE_LEXICON) {
    if (re.test(text) && (!hasTypeFacet || availableTypes.has(code))) {
      typeHits.push(code);
      typeLabels.push(contentTypeConfig?.valueLabels?.[code] ?? code);
    }
  }
  if (typeHits.length > 0) {
    filters['content_type'] = typeHits;
    matched.contentType = typeLabels;
  }

  // ── Recency → sort ──────────────────────────────────────────────────────────
  const sortBy: SortOption | undefined = RECENCY_RE.test(text) ? 'date_desc' : undefined;

  const hasStructure =
    (collectionIds?.length ?? 0) > 0 || Object.keys(filters).length > 0 || sortBy != null;

  return {
    semanticQuery: trimmed,
    ...(collectionIds ? { collectionIds } : {}),
    filters,
    ...(sortBy ? { sortBy } : {}),
    matched,
    hasStructure,
  };
}
