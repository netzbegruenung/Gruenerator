import { type CategoryFilterConfig } from '@gruenerator/chat';
import { useEffect, useMemo, useState } from 'react';

import useDebounce from '../../../components/hooks/useDebounce';
import { ParsedFilterChips } from '../manual-search/ParsedFilterChips';
import { type ResearchView } from '../manual-search/ResearchHitCard';
import { ResearchResultsList } from '../manual-search/ResearchResultsList';
import {
  ResearchResultsToolbar,
  researchOptionsAdjusted,
  resetResearchOptions,
} from '../manual-search/ResearchResultsToolbar';
import { LIVE_SEARCH_MIN_LENGTH, useLiveResearch } from '../manual-search/useLiveResearch';
import {
  activeFiltersToApi,
  mergeParsedFilters,
  useResearchFilters,
  type ActiveFilters,
} from '../manual-search/useResearchFilters';
import { describeParsedFilters, parseResearchIntent } from '../omni/parseResearchIntent';

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

  const debouncing = query !== trimmed && live.results.length === 0;
  const answered = typing && !live.isPending && !debouncing;
  useEffect(() => {
    if (answered) onAnswered?.();
  }, [answered, onAnswered]);

  if (!typing) return null;
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
        {...(researchOptionsAdjusted(filters)
          ? { onResetOptions: () => resetResearchOptions(filters) }
          : {})}
        toolbar={
          <ResearchResultsToolbar
            filters={filters}
            facetFields={hasFacets ? LIST_FACETS.filter((f) => !sharedKeys.has(f)) : []}
            view={view}
            onViewChange={setView}
          >
            <ParsedFilterChips
              chips={chips}
              onDrop={(key) => setDropped({ query, keys: [...droppedKeys, key] })}
            />
          </ResearchResultsToolbar>
        }
      />
    </div>
  );
}
