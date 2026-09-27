import {
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from '@gruenerator/ui';
import { type ReactElement, type ReactNode } from 'react';
import { LuCheck, LuChevronDown, LuLayoutGrid, LuList } from 'react-icons/lu';

import { NOTEBOOK_ACCENT_TEXT } from '../notebookTheme';

import { type ResearchView } from './ResearchHitCard';
import {
  type FilterFieldConfig,
  type SearchMode,
  type SortOption,
  type useResearchFilters,
} from './useResearchFilters';

import { cn } from '@/utils/cn';

type ResearchFilters = ReturnType<typeof useResearchFilters>;

const MODE_OPTIONS: { value: SearchMode; label: string }[] = [
  { value: 'hybrid', label: 'Kombiniert' },
  { value: 'vector', label: 'Semantisch' },
  { value: 'text', label: 'Volltext' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'Relevanz' },
  { value: 'date_desc', label: 'Neueste' },
  { value: 'date_asc', label: 'Älteste' },
];

const FACET_COPY: Record<string, { all: string; search: string }> = {
  persons: { all: 'Alle Personen', search: 'Person suchen …' },
  themes: { all: 'Alle Themen', search: 'Thema suchen …' },
};

const DATE_FIELD = 'published_at';

// Neutral on/off for the view switch — brand green here read as a filter.
const VIEW_ITEM =
  'text-grey-500 data-[state=on]:bg-grey-100 data-[state=on]:text-foreground dark:data-[state=on]:bg-grey-800';

interface DateRange {
  date_from?: string;
  date_to?: string;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function datePresets(now: Date): { label: string; range: DateRange }[] {
  const daysAgo = (n: number) =>
    isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
  const year = now.getFullYear();
  return [
    { label: 'Jederzeit', range: {} },
    { label: 'Letzte 30 Tage', range: { date_from: daysAgo(30) } },
    { label: 'Letzte 12 Monate', range: { date_from: daysAgo(365) } },
    { label: String(year), range: { date_from: `${year}-01-01`, date_to: `${year}-12-31` } },
    {
      label: String(year - 1),
      range: { date_from: `${year - 1}-01-01`, date_to: `${year - 1}-12-31` },
    },
  ];
}

/** A control's trigger: the current value, in magenta once it differs from the default. */
function ControlTrigger({
  name,
  value,
  changed,
  ...props
}: { name: string; value: string; changed: boolean } & React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`${name}: ${value}`}
      className="h-8 gap-1 px-2 text-sm font-normal"
      {...props}
    >
      <span
        className={cn(
          'max-w-[9rem] truncate sm:max-w-[12rem]',
          changed ? cn(NOTEBOOK_ACCENT_TEXT, 'font-semibold') : 'text-foreground'
        )}
      >
        {value}
      </span>
      <LuChevronDown className="size-3 text-grey-500" aria-hidden />
    </Button>
  );
}

function Separator() {
  return (
    <span aria-hidden className="text-grey-300 max-sm:hidden dark:text-grey-600">
      ·
    </span>
  );
}

function SelectControl<T extends string>({
  name,
  options,
  value,
  defaultValue,
  onChange,
}: {
  name: string;
  options: { value: T; label: string }[];
  value: T;
  defaultValue: T;
  onChange: (value: T) => void;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ControlTrigger name={name} value={current} changed={value !== defaultValue} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A keyword facet: searchable multi-select with each value's count. */
function FacetControl({
  field,
  config,
  selected,
  onToggle,
}: {
  field: string;
  config: FilterFieldConfig;
  selected: string[];
  onToggle: (field: string, value: string) => void;
}) {
  const copy = FACET_COPY[field] ?? { all: `Alle: ${config.label}`, search: 'Suchen …' };
  const label = (v: string) => config.valueLabels?.[v] ?? v;
  const values = [...(config.values ?? [])].sort(
    (a, b) => Number(selected.includes(b.value)) - Number(selected.includes(a.value))
  );
  const current = selected.length
    ? label(selected[0]) + (selected.length > 1 ? ` +${selected.length - 1}` : '')
    : copy.all;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <ControlTrigger name={config.label} value={current} changed={selected.length > 0} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-0">
        <Command>
          <CommandInput placeholder={copy.search} />
          <CommandList className="max-h-72">
            <CommandEmpty>Nichts gefunden.</CommandEmpty>
            {values.map((v) => {
              const on = selected.includes(v.value);
              return (
                <CommandItem
                  key={v.value}
                  value={label(v.value)}
                  onSelect={() => onToggle(field, v.value)}
                  aria-checked={on}
                  className="gap-2"
                >
                  <span className={cn('min-w-0 flex-1 truncate', on && 'font-semibold')}>
                    {label(v.value)}
                  </span>
                  <span className="text-xs text-grey-500">{v.count.toLocaleString('de-DE')}</span>
                  <LuCheck
                    className={cn('size-3.5', NOTEBOOK_ACCENT_TEXT, !on && 'invisible')}
                    aria-hidden
                  />
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** True when anything in the toolbar differs from its default. */
export function researchOptionsAdjusted(filters: ResearchFilters): boolean {
  return (
    filters.activeFilterCount > 0 ||
    filters.searchMode !== 'hybrid' ||
    filters.sortBy !== 'relevance'
  );
}

export function resetResearchOptions(filters: ResearchFilters): void {
  filters.clearAllFilters();
  filters.setSearchMode('hybrid');
  filters.setSortBy('relevance');
}

/**
 * The hit list's controls in one line: search kind, order, time span and the
 * facets the composer's settings menu does not already carry — each shows its
 * current value, magenta once changed — plus the grid/list switch.
 */
export function ResearchResultsToolbar({
  filters,
  facetFields,
  view,
  onViewChange,
  children,
}: {
  filters: ResearchFilters;
  /** Keyword facets offered here (the rest come from the settings menu). */
  facetFields: string[];
  view: ResearchView;
  onViewChange: (view: ResearchView) => void;
  /** Extra chips after the controls (filters recognised in the query). */
  children?: ReactNode;
}) {
  const { filterFields, activeFilters, searchMode, setSearchMode, sortBy, setSortBy } = filters;

  const dateConfig = filterFields[DATE_FIELD];
  const dateValue = activeFilters[DATE_FIELD];
  const dateRange: DateRange = dateValue && !Array.isArray(dateValue) ? dateValue : {};
  const presets = datePresets(new Date());
  const presetKey = (r: DateRange) => `${r.date_from ?? ''}|${r.date_to ?? ''}`;

  const offeredFacets = facetFields.filter((f) => (filterFields[f]?.values ?? []).length > 0);

  const controls: ReactElement[] = [
    <SelectControl
      key="mode"
      name="Suchart"
      options={MODE_OPTIONS}
      value={searchMode}
      defaultValue="hybrid"
      onChange={setSearchMode}
    />,
    <SelectControl
      key="sort"
      name="Sortierung"
      options={SORT_OPTIONS}
      value={sortBy}
      defaultValue="relevance"
      onChange={setSortBy}
    />,
  ];
  if (dateConfig?.type === 'date_range') {
    controls.push(
      <SelectControl
        key="date"
        name="Zeitraum"
        options={presets.map((p) => ({ value: presetKey(p.range), label: p.label }))}
        value={presetKey(dateRange)}
        defaultValue="|"
        onChange={(key) => {
          const range = presets.find((p) => presetKey(p.range) === key)?.range ?? {};
          filters.setDateFilter(DATE_FIELD, range.date_from, range.date_to);
        }}
      />
    );
  }
  for (const field of offeredFacets) {
    const active = activeFilters[field];
    controls.push(
      <FacetControl
        key={field}
        field={field}
        config={filterFields[field]}
        selected={Array.isArray(active) ? active : []}
        onToggle={filters.toggleFilter}
      />
    );
  }

  // `contents`: the controls and the view switch join the list header's row.
  // On a phone the count and the switch share the first line and the controls
  // get their own, swipeable, instead of wrapping into a ragged block.
  return (
    <div className="contents">
      <div className="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-x-0.5 overflow-x-auto px-2 [scrollbar-width:none] sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {controls.map((control) => (
          <span key={control.key} className="flex shrink-0 items-center gap-0.5">
            <Separator />
            {control}
          </span>
        ))}
        {researchOptionsAdjusted(filters) && (
          <Button
            variant="link"
            size="sm"
            className={cn('h-8 shrink-0 px-2', NOTEBOOK_ACCENT_TEXT)}
            onClick={() => resetResearchOptions(filters)}
          >
            Zurücksetzen
          </Button>
        )}
        {children && <div className="flex shrink-0 items-center pl-1">{children}</div>}
      </div>
      <ToggleGroup
        type="single"
        value={view}
        onValueChange={(v) => v && onViewChange(v as ResearchView)}
        aria-label="Darstellung"
        className="ml-auto"
      >
        <ToggleGroupItem value="grid" size="sm" aria-label="Kacheln" className={VIEW_ITEM}>
          <LuLayoutGrid className="size-4" aria-hidden />
        </ToggleGroupItem>
        <ToggleGroupItem value="list" size="sm" aria-label="Liste" className={VIEW_ITEM}>
          <LuList className="size-4" aria-hidden />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
