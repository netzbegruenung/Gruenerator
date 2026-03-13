import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiArrowsUpDown, HiBarsArrowDown, HiCog6Tooth, HiRectangleStack } from 'react-icons/hi2';
import { IoSearch } from 'react-icons/io5';

import IndexCard from '../../components/common/IndexCard';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import SearchBar from '../search/components/SearchBar';
import '../../assets/styles/components/gallery-layout.css';

import ActiveFilterChips from './components/ActiveFilterChips';
import ResearchFilterPanel from './components/ResearchFilterPanel';
import { useResearch, type ResearchResult } from './useResearch';
import { useResearchFilters, type SearchMode, type SortOption } from './useResearchFilters';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

function formatPublishedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function resultToCardProps(result: ResearchResult) {
  const similarityPercent = Math.round(result.similarity_score * 100);
  const tags = result.collection_name ? [result.collection_name] : [];
  const chunkLabel =
    result.chunk_count === 1 ? '1 Textabschnitt' : `${result.chunk_count} Textabschnitte`;

  const metaParts = [`${chunkLabel} · ${similarityPercent}% Relevanz`];
  if (result.published_at) {
    metaParts.push(formatPublishedDate(result.published_at));
  }

  return {
    title: result.title,
    description: result.relevant_content,
    tags,
    meta: (
      <div className="flex w-full items-center justify-between">
        <span className="text-xs text-grey-500">{metaParts.join(' · ')}</span>
        {result.source_url && (
          <a
            href={result.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-500 hover:underline"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            Quelle öffnen
          </a>
        )}
      </div>
    ),
    onClick: result.source_url
      ? () => window.open(result.source_url!, '_blank', 'noopener,noreferrer')
      : undefined,
  };
}

function ResearchPage() {
  const [query, setQuery] = useState('');
  const { results, metadata, isLoading, error, search } = useResearch();
  const [hasSearched, setHasSearched] = useState(false);
  const lastQueryRef = useRef('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const {
    collections,
    collectionsLoading,
    selectedCollectionIds,
    setSelectedCollectionIds,
    filterFields,
    filtersLoading,
    setFiltersEnabled,
    activeFilters,
    activeFilterCount,
    setKeywordFilter,
    setDateFilter,
    clearFilter,
    clearAllFilters,
    removeFilterValue,
    searchMode,
    setSearchMode,
    sortBy,
    setSortBy,
    buildApiFilters,
  } = useResearchFilters();

  useEffect(() => {
    setFiltersEnabled(true);
  }, [setFiltersEnabled]);

  const contentTypeConfig = filterFields['content_type'];
  const activeContentTypes = useMemo(() => {
    const active = activeFilters['content_type'];
    return Array.isArray(active) ? active : [];
  }, [activeFilters]);

  const dateFilterCount = useMemo(() => {
    let count = 0;
    for (const [, value] of Object.entries(activeFilters)) {
      if (!Array.isArray(value) && (value.date_from || value.date_to)) count += 1;
    }
    return count;
  }, [activeFilters]);

  const clearDateFilters = useCallback(() => {
    for (const [field, config] of Object.entries(filterFields)) {
      if (config.type === 'date_range') clearFilter(field);
    }
  }, [filterFields, clearFilter]);

  const executeSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery || searchQuery.trim().length < 2) return;
      lastQueryRef.current = searchQuery;
      setHasSearched(true);
      void search({
        query: searchQuery,
        collectionIds: selectedCollectionIds.length > 0 ? selectedCollectionIds : undefined,
        filters: buildApiFilters(),
        mode: searchMode,
        sortBy,
      });
    },
    [selectedCollectionIds, buildApiFilters, searchMode, sortBy, search]
  );

  const handleSearch = useCallback(
    (q?: string) => {
      executeSearch(q || query);
    },
    [executeSearch, query]
  );

  useEffect(() => {
    if (!hasSearched || !lastQueryRef.current) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      executeSearch(lastQueryRef.current);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [activeFilters, searchMode, sortBy, selectedCollectionIds, hasSearched, executeSearch]);

  const sortIndicator = sortBy !== 'relevance' ? ` · sortiert nach ${SORT_LABELS[sortBy]}` : '';

  const modeLabel = MODE_OPTIONS.find((o) => o.value === searchMode)?.label ?? 'Hybrid';

  return (
    <ErrorBoundary>
      <div className="gallery-layout">
        <div className="gallery-header">
          <h1>Recherche</h1>
          <p>(Fast) alle grünen Dokumente und Programme an einem Ort durchsuchbar.</p>
        </div>

        <div className="mb-xl">
          <SearchBar
            onSearch={handleSearch}
            loading={isLoading}
            value={query}
            onChange={setQuery}
            placeholder="Suchbegriff eingeben (z.B. Klimaschutz, Mobilität, Bildung)..."
            hideDisclaimer
            submitPlacement="hidden"
            bottomContent={
              <div className="flex flex-wrap items-center gap-xs">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <HiRectangleStack className="size-4" />
                      {collectionsLoading
                        ? 'Laden...'
                        : selectedCollectionIds.length > 0
                          ? `${selectedCollectionIds.length} Kollektion${selectedCollectionIds.length > 1 ? 'en' : ''}`
                          : 'Kollektionen'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {collections.map((c) => (
                      <DropdownMenuCheckboxItem
                        key={c.id}
                        checked={selectedCollectionIds.includes(c.id)}
                        onCheckedChange={(checked) => {
                          setSelectedCollectionIds(
                            checked
                              ? [...selectedCollectionIds, c.id]
                              : selectedCollectionIds.filter((id) => id !== c.id)
                          );
                        }}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {c.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {contentTypeConfig && (contentTypeConfig.values ?? []).length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <HiBarsArrowDown className="size-4" />
                        {filtersLoading
                          ? 'Laden...'
                          : activeContentTypes.length > 0
                            ? `${activeContentTypes.length} Typ${activeContentTypes.length > 1 ? 'en' : ''}`
                            : 'Typ'}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {(contentTypeConfig.values ?? []).map((v) => (
                        <DropdownMenuCheckboxItem
                          key={v.value}
                          checked={activeContentTypes.includes(v.value)}
                          onCheckedChange={(checked) => {
                            setKeywordFilter(
                              'content_type',
                              checked
                                ? [...activeContentTypes, v.value]
                                : activeContentTypes.filter((t) => t !== v.value)
                            );
                          }}
                          onSelect={(e) => e.preventDefault()}
                        >
                          {v.value} ({v.count})
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <HiArrowsUpDown className="size-4" />
                      {SORT_LABELS[sortBy] ?? 'Relevanz'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuRadioGroup
                      value={sortBy}
                      onValueChange={(v) => setSortBy(v as SortOption)}
                    >
                      {SORT_OPTIONS.map((opt) => (
                        <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <ResearchFilterPanel
                  filterFields={filterFields}
                  activeFilters={activeFilters}
                  dateFilterCount={dateFilterCount}
                  filtersLoading={filtersLoading}
                  onSetDateFilter={setDateFilter}
                  onClearDates={clearDateFilters}
                  onFiltersOpen={() => setFiltersEnabled(true)}
                />

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={searchMode !== 'hybrid' ? 'default' : 'outline'}
                      size="sm"
                      aria-label="Suchmodus"
                      title={`Suchmodus: ${modeLabel}`}
                    >
                      <HiCog6Tooth className="size-4" />
                      {modeLabel}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" sideOffset={8} className="w-auto p-2">
                    <div className="space-y-1.5">
                      <span className="block px-1 text-xs font-medium text-grey-500 dark:text-grey-400">
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
                  </PopoverContent>
                </Popover>
              </div>
            }
          />
        </div>

        {activeFilterCount > 0 && (
          <div className="mt-sm mb-md">
            <ActiveFilterChips
              filterFields={filterFields}
              activeFilters={activeFilters}
              onRemoveValue={removeFilterValue}
              onClearFilter={clearFilter}
              onClearAll={clearAllFilters}
            />
          </div>
        )}

        {error && (
          <div className="mb-lg rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {metadata && (
          <p className="mb-sm text-xs text-grey-500 dark:text-grey-400">
            {metadata.totalResults} Ergebnisse in {metadata.timeMs}ms
            {metadata.collections.length > 0 &&
              ` aus ${metadata.collections.length} Kollektion${metadata.collections.length > 1 ? 'en' : ''}`}
            {sortIndicator}
          </p>
        )}

        {results.length > 0 && (
          <div className="gallery-grid">
            {results.map((result, i) => (
              <IndexCard
                key={`${result.document_id}-${result.collection_id ?? i}`}
                {...resultToCardProps(result)}
              />
            ))}
          </div>
        )}

        {hasSearched && !isLoading && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-2xl text-center">
            <IoSearch className="mb-sm size-12 text-grey-300 dark:text-grey-600" />
            <p className="text-sm text-grey-500 dark:text-grey-400">
              Keine Ergebnisse gefunden. Versuche einen anderen Suchbegriff oder entferne Filter.
            </p>
          </div>
        )}

        {!hasSearched && !isLoading && (
          <div className="flex flex-col items-center justify-center py-2xl text-center">
            <IoSearch className="mb-sm size-12 text-grey-300 dark:text-grey-600" />
            <p className="text-sm text-grey-500 dark:text-grey-400">
              Gib einen Suchbegriff ein, um Dokumente zu durchsuchen.
            </p>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default withAuthRequired(ResearchPage, { title: 'Recherche' });
