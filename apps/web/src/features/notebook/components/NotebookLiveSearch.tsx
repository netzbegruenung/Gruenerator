import { type CategoryFilterConfig, type SourceFilterConfig } from '@gruenerator/chat';
import { LIVE_SEARCH_MIN_LENGTH, liveSearchDelayMs } from '@gruenerator/shared/api';
import { useIsBreakpoint, useLiveResearch } from '@gruenerator/shared/hooks';
import {
  activeFiltersToApi,
  mergeParsedFilters,
  parseResearchIntent,
  type ActiveFilters,
} from '@gruenerator/shared/utils';
import { useEffect, useMemo, useState } from 'react';

import useDebounce from '../../../components/hooks/useDebounce';
import { type ResearchView } from '../manual-search/ResearchHitCard';
import { ResearchResultsList } from '../manual-search/ResearchResultsList';
import {
  ResearchResultsToolbar,
  researchOptionsAdjusted,
  resetResearchOptions,
  type ResearchOptions,
} from '../manual-search/ResearchResultsToolbar';
import { useResearchFilters, type SortOption } from '../manual-search/useResearchFilters';

/** Per-browser memory of the hit layout; storage may be unavailable. */
const VIEW_KEY = 'gr-notebook-research-view';

function readView(): ResearchView {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    return stored === 'list' || stored === 'wide' ? stored : 'grid';
  } catch {
    return 'grid';
  }
}

function useResearchView() {
  const [view, setView] = useState<ResearchView>(readView);
  // Below md the wide grid has one column and no switch; it stays remembered.
  const wideFits = useIsBreakpoint('min', 768);
  const change = (next: ResearchView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered, still switched.
    }
  };
  return [view === 'wide' && !wideFits ? 'grid' : view, change] as const;
}

/** Facets the hit list can offer itself; any of them the notebook already
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
  /** The notebook's facet filters — what the chat is filtered by too. */
  sharedFilters?: CategoryFilterConfig;
  /** A multi-source notebook's sources; the chat searches the same selection. */
  sourceFilters?: SourceFilterConfig;
  emptyHint: string;
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
  sourceFilters,
  emptyHint,
  onAnswered,
}: NotebookLiveSearchProps) {
  const trimmed = text.trim();
  const debounced = useDebounce(trimmed, liveSearchDelayMs(text));
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

  // Per dimension (time span, themes, persons, order): a toolbar choice made for
  // this query > what the query recognised > the toolbar's own, persisted state.
  // A choice on a recognised dimension holds for this query only — typing on
  // brings recognition back. Recognised facets add to persisted selections.
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
  let sortBy = filters.sortBy;
  if (parsed?.sortBy) {
    sortBy = overrides.sortBy ?? parsed.sortBy;
    if (!overrides.sortBy) recognised.push('sortBy');
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
      if (!parsed?.sortBy) return filters.setSortBy(next);
      override({ sortBy: next });
      // Relevanz is the default, so it also drops a persisted order (reset).
      if (next === 'relevance') filters.setSortBy(next);
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
    ...(hasFacets && sharedFilters ? { shared: sharedFilters } : {}),
    ...(sourceFilters ? { sources: sourceFilters } : {}),
  };

  const apiFilters = hasFacets
    ? activeFiltersToApi(mergeParsedFilters(sharedFilters?.activeFilters ?? {}, effectiveFilters))
    : undefined;

  // The recognised date phrase and filler words are filters now, not search
  // words — unless too little is left to search for.
  const residual = parsed?.residualQuery ?? query;
  const searchQuery = residual.length >= LIVE_SEARCH_MIN_LENGTH ? residual : query;

  // Without the facet vocabulary the parser reads the query differently, so a
  // search before it arrives would be replaced by a second one right after.
  // Only its first load holds the search; a refetch never takes the hits away.
  const awaitingVocabulary = hasFacets && !filters.filtersFetched;

  const live = useLiveResearch({
    enabled: !awaitingVocabulary,
    query: searchQuery,
    ...(notebookId ? { notebookId } : {}),
    collectionIds: collectionIds.length > 0 ? collectionIds : undefined,
    filters: apiFilters,
    mode: filters.searchMode,
    sortBy,
  });

  // Only before any answer: a settled one (even an empty one) stays on screen
  // while the next keystrokes wait out the pause.
  const debouncing = (query !== trimmed || awaitingVocabulary) && live.metadata === null;
  const answered = typing && !live.isPending && !debouncing;
  useEffect(() => {
    if (answered) onAnswered?.();
  }, [answered, onAnswered]);

  if (!typing) return null;
  // Nothing half-built while the first search runs: the list arrives with its
  // answer, together with the composer moving up.
  if (!answered && live.results.length === 0) return null;

  const sharedKeys = new Set(sharedFilters?.fields.map((f) => f.field) ?? []);
  // A list facet the notebook also carries shows as the notebook's control,
  // except while the query sets it, so what filters the hits stays editable.
  const facetFields = LIST_FACETS.filter(
    (f) =>
      !sharedKeys.has(f) || recognised.includes(f) || (isParsedKey(f) && f in overrides.filters)
  );

  return (
    <div className="duration-500 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
      <ResearchResultsList
        query={query}
        notebookId={notebookId ?? null}
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
            facetFields={hasFacets ? facetFields : []}
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
