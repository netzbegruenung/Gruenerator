import { HiCheck, HiCog6Tooth } from 'react-icons/hi2';

import {
  type ActiveFilters,
  type CollectionInfo,
  type FilterFieldConfig,
  type SearchMode,
  type SortOption,
} from '../useResearchFilters';

import { DateRangeField, KeywordField } from './ResearchFilterPanel';

import { Badge } from '@/components/ui/badge';
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

interface ResearchSettingsPanelProps {
  collections: CollectionInfo[];
  collectionsLoading: boolean;
  selectedCollectionIds: string[];
  onSelectedCollectionIdsChange: (ids: string[]) => void;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  sortBy: SortOption;
  onSortByChange: (sort: SortOption) => void;
  filterFields: Record<string, FilterFieldConfig>;
  activeFilters: ActiveFilters;
  activeFilterCount: number;
  filtersLoading: boolean;
  onToggleFilter: (field: string, value: string) => void;
  onSetDateFilter: (field: string, dateFrom?: string, dateTo?: string) => void;
  onClearAll: () => void;
  onFiltersOpen?: () => void;
  disabled?: boolean;
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-transparent bg-primary-500 text-white'
          : 'border-grey-300 text-grey-700 hover:border-grey-400 dark:border-grey-600 dark:text-grey-300 dark:hover:border-grey-500'
      )}
    >
      {active && <HiCheck className="size-3" />}
      {children}
    </button>
  );
}

export default function ResearchSettingsPanel({
  collections,
  collectionsLoading,
  selectedCollectionIds,
  onSelectedCollectionIdsChange,
  searchMode,
  onSearchModeChange,
  sortBy,
  onSortByChange,
  filterFields,
  activeFilters,
  activeFilterCount,
  filtersLoading,
  onToggleFilter,
  onSetDateFilter,
  onClearAll,
  onFiltersOpen,
  disabled,
}: ResearchSettingsPanelProps) {
  const totalActiveCount =
    activeFilterCount +
    (selectedCollectionIds.length > 0 ? selectedCollectionIds.length : 0) +
    (searchMode !== 'hybrid' ? 1 : 0) +
    (sortBy !== 'relevance' ? 1 : 0);

  const toggleCollection = (id: string) => {
    onSelectedCollectionIdsChange(
      selectedCollectionIds.includes(id)
        ? selectedCollectionIds.filter((c) => c !== id)
        : [...selectedCollectionIds, id]
    );
  };

  const resetAll = () => {
    onSelectedCollectionIdsChange([]);
    onSearchModeChange('hybrid');
    onSortByChange('relevance');
    onClearAll();
  };

  const filterEntries = Object.entries(filterFields);

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) onFiltersOpen?.();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'relative flex items-center justify-center rounded-full border-none bg-transparent p-2 transition-colors',
            'text-foreground opacity-70 hover:text-primary-500 hover:opacity-100 hover:bg-background-alt',
            'disabled:cursor-not-allowed disabled:opacity-40'
          )}
          aria-label="Sucheinstellungen"
          title="Sucheinstellungen"
        >
          <HiCog6Tooth className="size-5" />
          {totalActiveCount > 0 && (
            <Badge className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
              {totalActiveCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[22rem] sm:w-[30rem] max-h-[32rem] sm:max-h-[36rem] overflow-y-auto p-3"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Sucheinstellungen</span>
            {totalActiveCount > 0 && (
              <button
                type="button"
                className="text-xs text-primary-500 hover:underline"
                onClick={resetAll}
              >
                Alle zurücksetzen
              </button>
            )}
          </div>

          {/* Collections */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
              Kollektionen
            </span>
            {collectionsLoading ? (
              <p className="text-xs text-grey-400">Werden geladen…</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {collections.map((col) => (
                  <PillButton
                    key={col.id}
                    active={selectedCollectionIds.includes(col.id)}
                    onClick={() => toggleCollection(col.id)}
                  >
                    {col.name}
                  </PillButton>
                ))}
              </div>
            )}
          </div>

          {/* Search Mode */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
              Suchmodus
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MODE_OPTIONS.map((opt) => (
                <PillButton
                  key={opt.value}
                  active={searchMode === opt.value}
                  onClick={() => onSearchModeChange(opt.value)}
                >
                  {opt.label}
                </PillButton>
              ))}
            </div>
          </div>

          {/* Sort */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
              Sortierung
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SORT_OPTIONS.map((opt) => (
                <PillButton
                  key={opt.value}
                  active={sortBy === opt.value}
                  onClick={() => onSortByChange(opt.value)}
                >
                  {opt.label}
                </PillButton>
              ))}
            </div>
          </div>

          {/* Filters */}
          {(filterEntries.length > 0 || filtersLoading) && (
            <>
              <div className="border-t border-grey-200 dark:border-grey-700" />
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
                  Filter{activeFilterCount > 0 && ` (${activeFilterCount} aktiv)`}
                </span>
              </div>

              {filtersLoading && (
                <div className="space-y-2 py-1">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="h-3 w-20 animate-pulse rounded bg-grey-200 dark:bg-grey-700" />
                      <div className="h-3 w-3 animate-pulse rounded bg-grey-200 dark:bg-grey-700" />
                    </div>
                  ))}
                </div>
              )}

              {filterEntries.map(([field, config]) => {
                if (config.type === 'date_range') {
                  const dateValue = activeFilters[field];
                  const parsed = dateValue && !Array.isArray(dateValue) ? dateValue : undefined;
                  return (
                    <DateRangeField
                      key={field}
                      field={field}
                      config={config}
                      value={parsed}
                      onSetDateFilter={onSetDateFilter}
                    />
                  );
                }

                const keywordValue = activeFilters[field];
                const selected = Array.isArray(keywordValue) ? keywordValue : [];
                return (
                  <KeywordField
                    key={field}
                    field={field}
                    config={config}
                    selectedValues={selected}
                    onToggleFilter={onToggleFilter}
                  />
                );
              })}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
