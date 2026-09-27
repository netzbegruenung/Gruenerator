import { type CategoryFilterConfig } from '@gruenerator/chat';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import useDebounce from '../../../components/hooks/useDebounce';
import { type ResearchView } from '../manual-search/ResearchHitCard';
import { ResearchResultsList } from '../manual-search/ResearchResultsList';
import {
  ResearchResultsToolbar,
  researchOptionsAdjusted,
  resetResearchOptions,
  type ResearchOptions,
} from '../manual-search/ResearchResultsToolbar';
import { LIVE_SEARCH_MIN_LENGTH, useLiveResearch } from '../manual-search/useLiveResearch';
import {
  activeFiltersToApi,
  mergeParsedFilters,
  useResearchFilters,
  type ActiveFilters,
  type SortOption,
} from '../manual-search/useResearchFilters';
import { parseResearchIntent } from '../omni/parseResearchIntent';

const DEBOUNCE_MS = 300;

/** Per-browser memory of grid vs. list; storage may be unavailable. */
const VIEW_KEY = 'gr-notebook-research-view';

function readView(): ResearchView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function useResearchView() {
  const [view, setView] = useState<ResearchView>(readView);
  const change = (next: ResearchView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered, still switched.
    }
  };
  return [view, change] as const;
}

/** Facets the hit list can offer itself; any of them the settings menu already
 *  carries is taken from there instead, so chat and list filter alike. */
const LIST_FACETS = ['themes', 'persons'];

/** Filter dimensions the query parser can recognise (see describeParsedFilters). */
const PARSED_KEYS = ['published_at', 'themes', 'persons'] as const;
type ParsedKey = (typeof PARSED_KEYS)[number];

/** Toolbar choices on a dimension the query set; `null` means back to the default. */
interface QueryOverrides {
  query: string;
  filters: Partial<Record<ParsedKey, ActiveFilters[string] | null>>;
  sortBy?: SortOption;
}

const isParsedKey = (field: string): field is ParsedKey =>
  (PARSED_KEYS as readonly string[]).includes(field);

interface NotebookLiveSearchProps {
  /** The composer's current text. */
  text: string;
  /** Text submitted with Enter in „Manuell“ — searched at once, no debounce. */
  submitted: string | null;
  collectionIds: string[];
  /** A user notebook: its own route is the scope, it has no facets. */
  notebookId?: string;
  /** The composer settings' facet filters — what the chat is filtered by. */
  sharedFilters?: CategoryFilterConfig;
  emptyHint: string;
  /** Shown until the text is long enough to search (the browse sub-tabs). */
  idle?: ReactNode;
  /** A search's answer (hits or none) is on screen. */
  onAnswered?: () => void;
}

/**
 * The notebook start page's hits under the composer: the manual research,
 * running as the person types.
 */
export function NotebookLiveSearch({
  text,
  submitted,
  collectionIds,
  notebookId,
  sharedFilters,
  emptyHint,
  idle,
  onAnswered,
}: NotebookLiveSearchProps) {
  const trimmed = text.trim();
  const debounced = useDebounce(trimmed, DEBOUNCE_MS);
  const query = submitted !== null && submitted === trimmed ? trimmed : debounced;
  const typing = trimmed.length >= LIVE_SEARCH_MIN_LENGTH;
  const hasFacets = !notebookId;

  const filters = useResearchFilters(collectionIds);
  const [view, setView] = useResearchView();
  const { setFiltersEnabled } = filters;
  // The facet vocabulary feeds the query parser, so it is needed as soon as a
  // search runs, not only when the options open. Cached for ten minutes.
  useEffect(() => {
    if (hasFacets && typing) setFiltersEnabled(true);
  }, [hasFacets, typing, setFiltersEnabled]);

  const parsed = useMemo(
    () =>
      hasFacets && query.length >= LIVE_SEARCH_MIN_LENGTH
        ? parseResearchIntent(query, { filterFields: filters.filterFields, scopeFixed: true })
        : null,
    [hasFacets, query, filters.filterFields]
  );

  // What the query recognised is the toolbar's value; changing a recognised
  // dimension there holds for this query only — typing on brings recognition
  // back. Dimensions the query leaves alone stay with the toolbar's own state.
  const [overridden, setOverridden] = useState<QueryOverrides>({ query: '', filters: {} });
  const overrides: QueryOverrides =
    overridden.query === query ? overridden : { query, filters: {} };

  const recognised: string[] = [];
  const effectiveFilters: ActiveFilters = { ...filters.activeFilters };
  for (const key of PARSED_KEYS) {
    const value = parsed?.filters[key];
    if (!value) continue;
    const own = overrides.filters[key];
    if (own === null) {
      delete effectiveFilters[key];
    } else if (own) {
      effectiveFilters[key] = own;
    } else {
      effectiveFilters[key] = mergeParsedFilters(effectiveFilters, { [key]: value })[key];
      recognised.push(key);
    }
  }
  // An explicit order wins; otherwise the query may ask for one („neueste …“).
  let sortBy = filters.sortBy;
  if (parsed?.sortBy) {
    if (overrides.sortBy) sortBy = overrides.sortBy;
    else if (sortBy === 'relevance') {
      sortBy = parsed.sortBy;
      recognised.push('sortBy');
    }
  }

  const override = (patch: Omit<Partial<QueryOverrides>, 'query'>) =>
    setOverridden((prev) => {
      const base = prev.query === query ? prev : { query, filters: {} };
      return { ...base, ...patch, filters: { ...base.filters, ...patch.filters } };
    });

  const options: ResearchOptions = {
    filterFields: filters.filterFields,
    activeFilters: effectiveFilters,
    searchMode: filters.searchMode,
    setSearchMode: filters.setSearchMode,
    sortBy,
    setSortBy: (next) => {
      if (recognised.includes('sortBy') || overrides.sortBy) return override({ sortBy: next });
      filters.setSortBy(next);
      // Back to relevance means relevance, not the order the query asked for.
      if (parsed?.sortBy && next === 'relevance') override({ sortBy: next });
    },
    toggleFilter: (field, value) => {
      if (!isParsedKey(field) || !parsed?.filters[field]) return filters.toggleFilter(field, value);
      const current = effectiveFilters[field];
      const values = Array.isArray(current) ? current : [];
      const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
      override({ filters: { [field]: next.length > 0 ? next : null } });
    },
    setDateFilter: (field, dateFrom, dateTo) => {
      if (!isParsedKey(field) || !parsed?.filters[field]) {
        return filters.setDateFilter(field, dateFrom, dateTo);
      }
      override({
        filters: {
          [field]: dateFrom || dateTo ? { date_from: dateFrom, date_to: dateTo } : null,
        },
      });
    },
    clearAllFilters: () => {
      filters.clearAllFilters();
      const cleared: QueryOverrides['filters'] = {};
      for (const key of PARSED_KEYS) if (parsed?.filters[key]) cleared[key] = null;
      override({ filters: cleared });
    },
  };

  const apiFilters = hasFacets
    ? activeFiltersToApi(mergeParsedFilters(sharedFilters?.activeFilters ?? {}, effectiveFilters))
    : undefined;

  // The recognised date phrase and filler words are filters now, not search
  // words — unless too little is left to search for.
  const residual = parsed?.residualQuery ?? query;
  const searchQuery = residual.length >= LIVE_SEARCH_MIN_LENGTH ? residual : query;

  const live = useLiveResearch({
    enabled: true,
    query: searchQuery,
    ...(notebookId ? { notebookId } : {}),
    collectionIds: collectionIds.length > 0 ? collectionIds : undefined,
    filters: apiFilters,
    mode: filters.searchMode,
    sortBy,
  });

  const debouncing = query !== trimmed && live.results.length === 0;
  const answered = typing && !live.isPending && !debouncing;
  useEffect(() => {
    if (answered) onAnswered?.();
  }, [answered, onAnswered]);

  if (!typing) return <>{idle}</>;
  // Nothing half-built while the first search runs: the list arrives with its
  // answer, together with the composer moving up.
  if (!answered && live.results.length === 0) return null;

  const sharedKeys = new Set(sharedFilters?.fields.map((f) => f.field) ?? []);

  return (
    <div className="duration-500 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
      <ResearchResultsList
        results={live.results}
        metadata={live.metadata}
        isPending={live.isPending || debouncing}
        isError={live.isError}
        emptyHint={emptyHint}
        view={view}
        {...(researchOptionsAdjusted(options)
          ? { onResetOptions: () => resetResearchOptions(options) }
          : {})}
        toolbar={
          <ResearchResultsToolbar
            filters={options}
            facetFields={hasFacets ? LIST_FACETS.filter((f) => !sharedKeys.has(f)) : []}
            view={view}
            onViewChange={setView}
            recognised={recognised}
            {...(parsed?.matched.dateLabel ? { dateLabel: parsed.matched.dateLabel } : {})}
          />
        }
      />
    </div>
  );
}
