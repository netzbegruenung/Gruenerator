import { type CategoryFilterConfig } from '@gruenerator/chat';
import { useEffect, useMemo, useState } from 'react';

import useDebounce from '../../../components/hooks/useDebounce';
import ActiveFilterChips from '../manual-search/ActiveFilterChips';
import { ParsedFilterChips } from '../manual-search/ParsedFilterChips';
import { ResearchResultsList } from '../manual-search/ResearchResultsList';
import { ResearchSearchOptions, SORT_LABELS } from '../manual-search/ResearchSearchOptions';
import { LIVE_SEARCH_MIN_LENGTH, useLiveResearch } from '../manual-search/useLiveResearch';
import {
  activeFiltersToApi,
  mergeParsedFilters,
  useResearchFilters,
  type ActiveFilters,
} from '../manual-search/useResearchFilters';
import { describeParsedFilters, parseResearchIntent } from '../omni/parseResearchIntent';

const DEBOUNCE_MS = 300;

/** Facets the hit list can offer itself; any of them the settings menu already
 *  carries is taken from there instead, so chat and list filter alike. */
const LIST_FACETS = ['themes', 'persons'];

/** Filter dimensions the query parser can recognise (see describeParsedFilters). */
const PARSED_KEYS = ['published_at', 'themes'] as const;

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
}: NotebookLiveSearchProps) {
  const trimmed = text.trim();
  const debounced = useDebounce(trimmed, DEBOUNCE_MS);
  const query = submitted !== null && submitted === trimmed ? trimmed : debounced;
  const typing = trimmed.length >= LIVE_SEARCH_MIN_LENGTH;
  const hasFacets = !notebookId;

  const filters = useResearchFilters(collectionIds);
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

  // A dropped chip belongs to the query it was dropped from; typing on brings
  // the recognised filters back.
  const [dropped, setDropped] = useState<{ query: string; keys: string[] }>({
    query: '',
    keys: [],
  });
  const droppedKeys = useMemo(
    () => (dropped.query === query ? dropped.keys : []),
    [dropped, query]
  );
  const chips = parsed
    ? describeParsedFilters(parsed).filter((c) => !droppedKeys.includes(c.key))
    : [];

  const apiFilters = useMemo(() => {
    if (!hasFacets) return undefined;
    const fromQuery: ActiveFilters = {};
    for (const key of PARSED_KEYS) {
      const value = parsed?.filters[key];
      if (value && !droppedKeys.includes(key)) fromQuery[key] = value;
    }
    return activeFiltersToApi(
      mergeParsedFilters(
        mergeParsedFilters(sharedFilters?.activeFilters ?? {}, filters.activeFilters),
        fromQuery
      )
    );
  }, [hasFacets, parsed, droppedKeys, sharedFilters, filters.activeFilters]);

  // An explicit order wins; otherwise the query may ask for one („neueste …“).
  const sortBy = filters.sortBy !== 'relevance' ? filters.sortBy : (parsed?.sortBy ?? 'relevance');

  const live = useLiveResearch({
    enabled: true,
    query,
    ...(notebookId ? { notebookId } : {}),
    collectionIds: collectionIds.length > 0 ? collectionIds : undefined,
    filters: apiFilters,
    mode: filters.searchMode,
    sortBy,
  });

  if (!typing) return null;

  const sharedKeys = new Set(sharedFilters?.fields.map((f) => f.field) ?? []);
  const debouncing = query !== trimmed && live.results.length === 0;

  return (
    <ResearchResultsList
      results={live.results}
      metadata={live.metadata}
      isPending={live.isPending || debouncing}
      isError={live.isError}
      emptyHint={emptyHint}
      metaSuffix={sortBy !== 'relevance' ? ` · sortiert nach ${SORT_LABELS[sortBy]}` : ''}
      toolbar={
        hasFacets ? (
          <>
            <ResearchSearchOptions
              filters={filters}
              facetFields={LIST_FACETS.filter((f) => !sharedKeys.has(f))}
            />
            {filters.activeFilterCount > 0 && (
              <ActiveFilterChips
                filterFields={filters.filterFields}
                activeFilters={filters.activeFilters}
                onRemoveValue={filters.removeFilterValue}
                onClearFilter={filters.clearFilter}
                onClearAll={filters.clearAllFilters}
              />
            )}
            <ParsedFilterChips
              chips={chips}
              onDrop={(key) => setDropped({ query, keys: [...droppedKeys, key] })}
            />
          </>
        ) : undefined
      }
    />
  );
}
