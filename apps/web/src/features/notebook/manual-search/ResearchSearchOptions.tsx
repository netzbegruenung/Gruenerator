import { Badge, Button, Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { LuSlidersHorizontal } from 'react-icons/lu';

import { DateRangeField, KeywordField } from './ResearchFilterPanel';
import { type SearchMode, type SortOption, type useResearchFilters } from './useResearchFilters';

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

export const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'Relevanz',
  date_desc: 'Neueste zuerst',
  date_asc: 'Älteste zuerst',
};

type ResearchFilters = ReturnType<typeof useResearchFilters>;

const SECTION_TITLE =
  'text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400';

function OptionList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-left text-sm transition-colors',
            value === opt.value
              ? 'bg-primary-500 text-white'
              : 'text-foreground hover:bg-background-alt'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The knobs that only shape the hit list: order, search kind, date range and
 * the facets the composer's settings menu does not already carry. Facets the
 * menu has are shared with the chat and live there.
 */
export function ResearchSearchOptions({
  filters,
  facetFields,
}: {
  filters: ResearchFilters;
  /** Keyword facets offered here (the rest come from the settings menu). */
  facetFields: string[];
}) {
  const {
    filterFields,
    filtersLoading,
    activeFilters,
    activeFilterCount,
    toggleFilter,
    setDateFilter,
    clearAllFilters,
    searchMode,
    setSearchMode,
    sortBy,
    setSortBy,
  } = filters;

  const dateFields = Object.entries(filterFields).filter(([, c]) => c.type === 'date_range');
  const offeredFacets = facetFields.filter((f) => (filterFields[f]?.values ?? []).length > 0);
  const badgeCount =
    activeFilterCount + (searchMode !== 'hybrid' ? 1 : 0) + (sortBy !== 'relevance' ? 1 : 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs">
          <LuSlidersHorizontal className="size-3.5" aria-hidden />
          Suchoptionen
          {badgeCount > 0 && (
            <Badge className="ml-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
              {badgeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[70vh] w-[22rem] space-y-4 overflow-y-auto p-3"
      >
        <div className="space-y-1.5">
          <span className={SECTION_TITLE}>Sortierung</span>
          <OptionList options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} />
        </div>

        {dateFields.length > 0 && (
          <div className="space-y-2 border-t border-grey-200 pt-3 dark:border-grey-700">
            {filtersLoading && (
              <div className="h-3 w-20 animate-pulse rounded bg-grey-200 dark:bg-grey-700" />
            )}
            {dateFields.map(([field, config]) => {
              const value = activeFilters[field];
              return (
                <DateRangeField
                  key={field}
                  field={field}
                  config={config}
                  value={value && !Array.isArray(value) ? value : undefined}
                  onSetDateFilter={setDateFilter}
                  collapsible={false}
                />
              );
            })}
          </div>
        )}

        {offeredFacets.length > 0 && (
          <div className="space-y-3 border-t border-grey-200 pt-3 dark:border-grey-700">
            {offeredFacets.map((field) => {
              const active = activeFilters[field];
              return (
                <KeywordField
                  key={field}
                  field={field}
                  config={filterFields[field]}
                  selectedValues={Array.isArray(active) ? active : []}
                  onToggleFilter={toggleFilter}
                  collapsible={false}
                />
              );
            })}
          </div>
        )}

        <div className="space-y-1.5 border-t border-grey-200 pt-3 dark:border-grey-700">
          <span className={SECTION_TITLE}>Suchart</span>
          <OptionList options={MODE_OPTIONS} value={searchMode} onChange={setSearchMode} />
        </div>

        {badgeCount > 0 && (
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
}
