import {
  Badge,
  Button,
  CardGrid,
  Popover,
  PopoverContent,
  PopoverTrigger,
  StatusBanner,
} from '@gruenerator/ui';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { IoSearch } from 'react-icons/io5';
import { LuSettings2 } from 'react-icons/lu';

import IndexCard from '../../../components/common/IndexCard';
import SearchBar from '../../search/components/SearchBar';
import ActiveFilterChips from '../manual-search/ActiveFilterChips';
import { DateRangeField, KeywordField } from '../manual-search/ResearchFilterPanel';
import { resultToCardProps } from '../manual-search/researchResultCard';
import { useResearch } from '../manual-search/useResearch';
import {
  activeFiltersToApi,
  mergeParsedFilters,
  useResearchFilters,
  type SearchMode,
  type SortOption,
} from '../manual-search/useResearchFilters';
import { parseResearchIntent } from '../omni/parseResearchIntent';

import { cn } from '@/utils/cn';

const MODE_OPTIONS: { value: SearchMode; label: string }[] = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'vector', label: 'Semantisch' },
  { value: 'text', label: 'Volltext' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Relevanz' },
  { value: 'date_desc', label: 'Neueste' },
  { value: 'date_asc', label: 'Älteste' },
];

const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'Relevanz',
  date_desc: 'Neueste zuerst',
  date_asc: 'Älteste zuerst',
};

interface NotebookManualSearchProps {
  collectionIds: string[];
  /**
   * When set, routes search to `/auth/notebook/:id/research-search` (ownership-scoped)
   * AND hides the facet-filter UI. User notebooks have no Qdrant facets.
   */
  notebookId?: string;
  /**
   * Rendered in place of the "Gib einen Suchbegriff ein…" empty state while no
   * search has run — the notebook browse sub-tabs (Zuletzt/Agenten/Statistiken).
   */
  browseSlot?: ReactNode;
  /** Seed query executed on mount (omni composer → "Manuell recherchieren"). */
  initialQuery?: string;
}

export function NotebookManualSearch({
  collectionIds,
  notebookId,
  browseSlot,
  initialQuery,
}: NotebookManualSearchProps) {
  const hideFilters = !!notebookId;
  const [query, setQuery] = useState(initialQuery ?? '');
  const [hasSearched, setHasSearched] = useState(false);
  const lastQueryRef = useRef('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { results, metadata, isLoading, error, search } = useResearch(
    notebookId ? { notebookId } : undefined
  );
  const {
    filterFields,
    filtersLoading,
    filtersEnabled,
    setFiltersEnabled,
    activeFilters,
    activeFilterCount,
    toggleFilter,
    setDateFilter,
    clearFilter,
    clearAllFilters,
    applyParsedFilters,
    removeFilterValue,
    searchMode,
    setSearchMode,
    sortBy,
    setSortBy,
    buildApiFilters,
  } = useResearchFilters(collectionIds);

  useEffect(() => {
    if (hideFilters) return;
    setFiltersEnabled(true);
  }, [hideFilters, setFiltersEnabled]);

  const getKeywordConfig = (field: string) => filterFields[field];
  const getActiveValues = useCallback(
    (field: string) => {
      const active = activeFilters[field];
      return Array.isArray(active) ? active : [];
    },
    [activeFilters]
  );

  // Signature of the last search actually dispatched — lets the debounced
  // re-search skip an identical follow-up (e.g. the one triggered when
  // runParsedSearch applies its own parsed filters). Prevents a duplicate fetch.
  const lastSigRef = useRef('');

  const executeSearch = useCallback(
    (
      searchQuery: string,
      override?: { filters?: Record<string, unknown>; sortBy?: SortOption }
    ) => {
      if (!searchQuery || searchQuery.trim().length < 2) return;
      // Always pass the notebook's collectionIds explicitly — never relies on the
      // hook's selectedCollectionIds. Defense in depth: search can't escape scope.
      const scopedCollectionIds = collectionIds.length > 0 ? collectionIds : undefined;
      const apiFilters = override ? override.filters : buildApiFilters();
      const effectiveSort = override?.sortBy ?? sortBy;
      const sig = JSON.stringify([
        searchQuery,
        apiFilters ?? null,
        searchMode,
        effectiveSort,
        scopedCollectionIds ?? null,
      ]);
      if (sig === lastSigRef.current) return;
      lastSigRef.current = sig;
      lastQueryRef.current = searchQuery;
      setHasSearched(true);
      void search({
        query: searchQuery,
        collectionIds: scopedCollectionIds,
        filters: apiFilters,
        mode: searchMode,
        sortBy: effectiveSort,
      });
    },
    [collectionIds, buildApiFilters, searchMode, sortBy, search]
  );

  // Explicit submit (typed / seeded query): parse the natural-language query into
  // date/topic/type filters (region is fixed — this notebook is the scope), reflect
  // them as removable chips (unioned with the user's manual selections), and search
  // with them merged in. User notebooks (hideFilters) carry no facets, so only the
  // sort hint applies. Chip/mode/sort adjustments re-search via the plain
  // executeSearch below, which does NOT re-parse.
  const runParsedSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery || searchQuery.trim().length < 2) return;
      const parsed = parseResearchIntent(searchQuery, { filterFields, scopeFixed: true });
      const parsedFilters = hideFilters ? {} : parsed.filters;
      applyParsedFilters(parsedFilters, parsed.sortBy);
      executeSearch(searchQuery, {
        filters: hideFilters
          ? undefined
          : activeFiltersToApi(mergeParsedFilters(activeFilters, parsedFilters)),
        sortBy: parsed.sortBy ?? sortBy,
      });
    },
    [activeFilters, filterFields, hideFilters, sortBy, applyParsedFilters, executeSearch]
  );

  const handleSearch = useCallback(
    (q?: string) => {
      runParsedSearch(q || query);
    },
    [runParsedSearch, query]
  );

  // Run the seeded query once — but only after the facet vocabulary has loaded,
  // otherwise the parser can't recognise topic/type filters (user notebooks have
  // no facets, so they seed immediately).
  const didSeedRef = useRef(false);
  useEffect(() => {
    if (didSeedRef.current) return;
    if (!initialQuery || initialQuery.trim().length < 2) return;
    const facetsReady = hideFilters || (filtersEnabled && !filtersLoading);
    if (!facetsReady) return;
    didSeedRef.current = true;
    runParsedSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, hideFilters, filtersEnabled, filtersLoading]);

  // Debounced re-search when filters/sort/mode change after the first search.
  // `hasSearched` is read as a gate but deliberately NOT a dependency: its
  // false→true transition happens *inside* the first executeSearch, and
  // re-running this effect on it would fire the identical query a second time
  // ~300ms later (once per first/seeded search). Real filter/sort/mode changes
  // still re-search via activeFilters/searchMode/sortBy/executeSearch.
  useEffect(() => {
    if (!hasSearched || !lastQueryRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      executeSearch(lastQueryRef.current);
    }, 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters, searchMode, sortBy, executeSearch]);

  const sortIndicator = sortBy !== 'relevance' ? ` · sortiert nach ${SORT_LABELS[sortBy]}` : '';

  const dateFields = Object.entries(filterFields).filter(([, c]) => c.type === 'date_range');
  const facetFields = (['themes', 'persons'] as const).filter(
    (f) => (getKeywordConfig(f)?.values ?? []).length > 0
  );
  const settingsBadgeCount =
    activeFilterCount + (searchMode !== 'hybrid' ? 1 : 0) + (sortBy !== 'relevance' ? 1 : 0);

  const filterControls = hideFilters ? undefined : (
    <Popover
      onOpenChange={(open) => {
        if (open) setFiltersEnabled(true);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Sucheinstellungen">
          <LuSettings2 className="size-4" />
          Einstellungen
          {settingsBadgeCount > 0 && (
            <Badge className="ml-1 h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]">
              {settingsBadgeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[70vh] w-[22rem] space-y-4 overflow-y-auto p-3"
      >
        <div className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
            Sortierung
          </span>
          <div className="flex flex-col gap-0.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSortBy(opt.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                  sortBy === opt.value
                    ? 'bg-primary-500 text-white'
                    : 'text-foreground hover:bg-background-alt'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {dateFields.length > 0 && (
          <div className="space-y-2 border-t border-grey-200 pt-3 dark:border-grey-700">
            {filtersLoading && (
              <div className="h-3 w-20 animate-pulse rounded bg-grey-200 dark:bg-grey-700" />
            )}
            {dateFields.map(([field, config]) => {
              const value = activeFilters[field];
              const parsed = value && !Array.isArray(value) ? value : undefined;
              return (
                <DateRangeField
                  key={field}
                  field={field}
                  config={config}
                  value={parsed}
                  onSetDateFilter={setDateFilter}
                  collapsible={false}
                />
              );
            })}
          </div>
        )}

        {facetFields.length > 0 && (
          <div className="space-y-3 border-t border-grey-200 pt-3 dark:border-grey-700">
            {facetFields.map((field) => {
              const config = getKeywordConfig(field);
              if (!config) return null;
              return (
                <KeywordField
                  key={field}
                  field={field}
                  config={config}
                  selectedValues={getActiveValues(field)}
                  onToggleFilter={toggleFilter}
                  collapsible={false}
                />
              );
            })}
          </div>
        )}

        <div className="space-y-1.5 border-t border-grey-200 pt-3 dark:border-grey-700">
          <span className="text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
            Suchmodus
          </span>
          <div className="flex flex-col gap-0.5">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSearchMode(opt.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                  searchMode === opt.value
                    ? 'bg-primary-500 text-white'
                    : 'text-foreground hover:bg-background-alt'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {settingsBadgeCount > 0 && (
          <div className="flex justify-end border-t border-grey-200 pt-3 dark:border-grey-700">
            <button
              type="button"
              onClick={() => {
                clearAllFilters();
                setSearchMode('hybrid');
                setSortBy('relevance');
              }}
              className="text-xs text-primary-500 hover:underline"
            >
              Zurücksetzen
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="flex flex-col gap-md">
      <SearchBar
        onSearch={handleSearch}
        loading={isLoading}
        value={query}
        onChange={setQuery}
        placeholder="Im Notizbuch suchen..."
        hideDisclaimer
        variant="composer"
        submitPlacement="tray"
        bottomContent={filterControls}
      />

      {!hideFilters && activeFilterCount > 0 && (
        <ActiveFilterChips
          filterFields={filterFields}
          activeFilters={activeFilters}
          onRemoveValue={removeFilterValue}
          onClearFilter={clearFilter}
          onClearAll={clearAllFilters}
        />
      )}

      {error && <StatusBanner variant="error">{error}</StatusBanner>}

      {metadata && (
        <p className="text-xs text-grey-500 dark:text-grey-400">
          {metadata.totalResults} Ergebnisse in {metadata.timeMs}ms{sortIndicator}
        </p>
      )}

      {results.length > 0 && (
        <CardGrid columns="auto" gap="2xl" className="max-md:gap-4">
          {results.map((result, i) => (
            <IndexCard
              key={`${result.document_id}-${result.collection_id ?? i}`}
              {...resultToCardProps(result)}
            />
          ))}
        </CardGrid>
      )}

      {hasSearched && !isLoading && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-2xl text-center">
          <IoSearch className="mb-sm size-12 text-grey-300 dark:text-grey-600" />
          <p className="text-sm text-grey-500 dark:text-grey-400">
            Keine Ergebnisse gefunden. Versuche einen anderen Suchbegriff oder entferne Filter.
          </p>
        </div>
      )}

      {!hasSearched &&
        !isLoading &&
        (browseSlot ?? (
          <div className="flex flex-col items-center justify-center py-2xl text-center">
            <IoSearch className="mb-sm size-12 text-grey-300 dark:text-grey-600" />
            <p className="text-sm text-grey-500 dark:text-grey-400">
              Gib einen Suchbegriff ein, um in diesem Notizbuch zu suchen.
            </p>
          </div>
        ))}
    </div>
  );
}
