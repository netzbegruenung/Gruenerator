import { useCallback, useEffect, useRef, useState } from 'react';
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
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const EXAMPLE_QUESTIONS = [
  { icon: '🌍', text: 'Klimaschutz Maßnahmen' },
  { icon: '🚲', text: 'Verkehrswende in Kommunen' },
  { icon: '📚', text: 'Bildungspolitik Positionen' },
];

const MODE_LABELS: Record<SearchMode, string> = {
  hybrid: 'Hybrid',
  vector: 'Semantisch',
  text: 'Volltext',
};

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
    activeFilters,
    activeFilterCount,
    toggleFilter,
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

  const executeSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery || searchQuery.trim().length < 2) return;
      lastQueryRef.current = searchQuery;
      setHasSearched(true);
      search({
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

  // Auto-search on filter/mode/sort changes after initial search
  useEffect(() => {
    if (!hasSearched || !lastQueryRef.current) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      executeSearch(lastQueryRef.current);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [activeFilters, searchMode, sortBy, selectedCollectionIds, hasSearched, executeSearch]);

  const sortIndicator = sortBy !== 'relevance' ? ` · sortiert nach ${SORT_LABELS[sortBy]}` : '';

  return (
    <ErrorBoundary>
      <div className="gallery-layout">
        <div className="gallery-header">
          <h1>Research</h1>
          <p>
            Durchsuche alle gescrapten Dokumente und Programme direkt in den Qdrant-Kollektionen.
          </p>
        </div>

        <SearchBar
          onSearch={handleSearch}
          loading={isLoading}
          value={query}
          onChange={setQuery}
          placeholder="Suchbegriff eingeben (z.B. Klimaschutz, Mobilität, Bildung)..."
          exampleQuestions={EXAMPLE_QUESTIONS}
          hideExamples={hasSearched}
          hideDisclaimer
        />

        <div className="mb-xs mt-md flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-grey-500 dark:text-grey-400">Kollektionen</span>

          <ResearchFilterPanel
            filterFields={filterFields}
            activeFilters={activeFilters}
            activeFilterCount={activeFilterCount}
            filtersLoading={filtersLoading}
            onToggleFilter={toggleFilter}
            onSetDateFilter={setDateFilter}
            onClearAll={clearAllFilters}
            disabled={isLoading}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {MODE_LABELS[searchMode]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={searchMode}
                onValueChange={(v) => setSearchMode(v as SearchMode)}
              >
                <DropdownMenuRadioItem value="hybrid">Hybrid</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="vector">Semantisch</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="text">Volltext</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {SORT_LABELS[sortBy]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={sortBy}
                onValueChange={(v) => setSortBy(v as SortOption)}
              >
                <DropdownMenuRadioItem value="relevance">Relevanz</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="date_desc">Neueste zuerst</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="date_asc">Älteste zuerst</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mb-lg">
          {collectionsLoading ? (
            <p className="text-xs text-grey-400">Kollektionen werden geladen…</p>
          ) : (
            <ToggleGroup
              type="multiple"
              value={selectedCollectionIds}
              onValueChange={setSelectedCollectionIds}
              variant="outline"
              size="sm"
              className="flex-wrap"
            >
              {collections.map((col) => (
                <ToggleGroupItem key={col.id} value={col.id}>
                  {col.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </div>

        {activeFilterCount > 0 && (
          <div className="mb-md">
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

export default withAuthRequired(ResearchPage, { title: 'Research' });
