import { useState } from 'react';
import { HiAdjustmentsHorizontal, HiCheck, HiChevronDown } from 'react-icons/hi2';

import { type ActiveFilters, type FilterFieldConfig } from '../useResearchFilters';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/cn';

interface ResearchFilterPanelProps {
  filterFields: Record<string, FilterFieldConfig>;
  activeFilters: ActiveFilters;
  dateFilterCount: number;
  filtersLoading: boolean;
  onSetDateFilter: (field: string, dateFrom?: string, dateTo?: string) => void;
  onClearDates: () => void;
  onFiltersOpen?: () => void;
  disabled?: boolean;
}

export function DateRangeField({
  field,
  config,
  value,
  onSetDateFilter,
  defaultOpen = false,
  collapsible = true,
}: {
  field: string;
  config: FilterFieldConfig;
  value: { date_from?: string; date_to?: string } | undefined;
  onSetDateFilter: (field: string, dateFrom?: string, dateTo?: string) => void;
  defaultOpen?: boolean;
  collapsible?: boolean;
}) {
  const hasActive = !!(value?.date_from || value?.date_to);
  const [open, setOpen] = useState(defaultOpen || hasActive);
  const showContent = !collapsible || open;

  return (
    <div className="space-y-1.5">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
            {config.label}
            {hasActive && <span className="inline-flex size-1.5 rounded-full bg-primary-500" />}
          </span>
          <HiChevronDown
            className={cn('size-3.5 text-grey-400 transition-transform', open && 'rotate-180')}
          />
        </button>
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
          {config.label}
          {hasActive && <span className="inline-flex size-1.5 rounded-full bg-primary-500" />}
        </span>
      )}
      {showContent && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value?.date_from || ''}
            min={config.min}
            max={value?.date_to || config.max}
            onChange={(e) => onSetDateFilter(field, e.target.value || undefined, value?.date_to)}
            className="h-8 flex-1 rounded-md border border-grey-300 bg-background px-2 text-xs text-foreground [color-scheme:light] dark:border-grey-600 dark:[color-scheme:dark]"
          />
          <span className="text-xs text-grey-400">–</span>
          <input
            type="date"
            value={value?.date_to || ''}
            min={value?.date_from || config.min}
            max={config.max}
            onChange={(e) => onSetDateFilter(field, value?.date_from, e.target.value || undefined)}
            className="h-8 flex-1 rounded-md border border-grey-300 bg-background px-2 text-xs text-foreground [color-scheme:light] dark:border-grey-600 dark:[color-scheme:dark]"
          />
          {hasActive && (
            <button
              type="button"
              className="shrink-0 text-xs text-primary-500 hover:underline"
              onClick={() => onSetDateFilter(field)}
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function KeywordField({
  field,
  config,
  selectedValues,
  onToggleFilter,
  defaultOpen = false,
  collapsible = true,
}: {
  field: string;
  config: FilterFieldConfig;
  selectedValues: string[];
  onToggleFilter: (field: string, value: string) => void;
  defaultOpen?: boolean;
  collapsible?: boolean;
}) {
  const hasActive = selectedValues.length > 0;
  const [open, setOpen] = useState(defaultOpen || hasActive);
  const showContent = !collapsible || open;

  if (!config.values?.length) return null;

  return (
    <div className="space-y-1.5">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
            {config.label}
            {hasActive && (
              <Badge className="h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
                {selectedValues.length}
              </Badge>
            )}
          </span>
          <HiChevronDown
            className={cn('size-3.5 text-grey-400 transition-transform', open && 'rotate-180')}
          />
        </button>
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
          {config.label}
          {hasActive && (
            <Badge className="h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
              {selectedValues.length}
            </Badge>
          )}
        </span>
      )}
      {showContent && (
        <div className="flex flex-wrap gap-1.5">
          {config.values.map((v) => {
            const active = selectedValues.includes(v.value);
            return (
              <button
                key={v.value}
                type="button"
                onClick={() => onToggleFilter(field, v.value)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  active
                    ? 'border-transparent bg-primary-500 text-white'
                    : 'border-grey-300 text-grey-700 hover:border-grey-400 dark:border-grey-600 dark:text-grey-300 dark:hover:border-grey-500'
                )}
              >
                {active && <HiCheck className="size-3" />}
                {v.value}
                <span className={cn('tabular-nums', active ? 'text-white/70' : 'text-grey-400')}>
                  ({v.count})
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ResearchFilterPanel({
  filterFields,
  activeFilters,
  dateFilterCount,
  filtersLoading,
  onSetDateFilter,
  onClearDates,
  onFiltersOpen,
  disabled,
}: ResearchFilterPanelProps) {
  const dateFields = Object.entries(filterFields).filter(([, c]) => c.type === 'date_range');

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) onFiltersOpen?.();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <HiAdjustmentsHorizontal className="size-4" />
          Zeitraum
          {dateFilterCount > 0 && (
            <Badge className="ml-1 h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]">
              {dateFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[20rem] p-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Zeitraum</span>
            {dateFilterCount > 0 && (
              <button
                type="button"
                className="text-xs text-primary-500 hover:underline"
                onClick={onClearDates}
              >
                Zurücksetzen
              </button>
            )}
          </div>

          {filtersLoading && (
            <div className="flex items-center justify-between py-1">
              <div className="h-3 w-20 animate-pulse rounded bg-grey-200 dark:bg-grey-700" />
              <div className="h-3 w-3 animate-pulse rounded bg-grey-200 dark:bg-grey-700" />
            </div>
          )}

          {dateFields.map(([field, config]) => {
            const dateValue = activeFilters[field];
            const parsed = dateValue && !Array.isArray(dateValue) ? dateValue : undefined;
            return (
              <DateRangeField
                key={field}
                field={field}
                config={config}
                value={parsed}
                onSetDateFilter={onSetDateFilter}
                collapsible={false}
              />
            );
          })}

          {!filtersLoading && dateFields.length === 0 && (
            <p className="py-2 text-center text-xs text-grey-400">Kein Zeitfilter verfügbar.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
