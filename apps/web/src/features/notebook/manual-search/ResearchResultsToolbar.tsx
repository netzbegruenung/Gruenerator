import { datePresets, type DateRange } from '@gruenerator/shared/utils';
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
import { type ReactElement } from 'react';
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

/** What the toolbar reads and sets — the filters hook itself, or a view over it
 *  that layers filters recognised in the query on top. */
export type ResearchOptions = Pick<
  ReturnType<typeof useResearchFilters>,
  | 'filterFields'
  | 'activeFilters'
  | 'searchMode'
  | 'setSearchMode'
  | 'sortBy'
  | 'toggleFilter'
  | 'setDateFilter'
  | 'clearAllFilters'
> & { setSortBy: (sortBy: SortOption) => void };

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

const RECOGNISED_TITLE = 'Aus der Eingabe erkannt';

// Neutral on/off for the view switch — brand green here read as a filter.
const VIEW_ITEM =
  'text-grey-500 data-[state=on]:bg-grey-100 data-[state=on]:text-foreground dark:data-[state=on]:bg-grey-800';

/** A control's trigger: the current value, in magenta once it differs from the
 *  default or was recognised in the query. */
function ControlTrigger({
  name,
  value,
  changed,
  recognised,
  ...props
}: { name: string; value: string; changed: boolean; recognised: boolean } & React.ComponentProps<
  typeof Button
>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`${name}: ${value}`}
      {...(recognised ? { title: RECOGNISED_TITLE } : {})}
      className="h-8 gap-1 px-2 text-sm font-normal"
      {...props}
    >
      <span
        className={cn(
          'max-w-[9rem] truncate sm:max-w-[12rem]',
          changed || recognised ? cn(NOTEBOOK_ACCENT_TEXT, 'font-semibold') : 'text-foreground'
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
  recognised,
  onChange,
}: {
  name: string;
  options: { value: T; label: string }[];
  value: T;
  defaultValue: T;
  recognised: boolean;
  onChange: (value: T) => void;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ControlTrigger
          name={name}
          value={current}
          changed={value !== defaultValue}
          recognised={recognised}
        />
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
  recognised,
  onToggle,
}: {
  field: string;
  config: FilterFieldConfig;
  selected: string[];
  recognised: boolean;
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
        <ControlTrigger
          name={config.label}
          value={current}
          changed={selected.length > 0}
          recognised={recognised}
        />
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
export function researchOptionsAdjusted(filters: ResearchOptions): boolean {
  return (
    Object.values(filters.activeFilters).some((v) =>
      Array.isArray(v) ? v.length > 0 : !!(v.date_from || v.date_to)
    ) ||
    filters.searchMode !== 'hybrid' ||
    filters.sortBy !== 'relevance'
  );
}

export function resetResearchOptions(filters: ResearchOptions): void {
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
  recognised = [],
  dateLabel,
}: {
  filters: ResearchOptions;
  /** Keyword facets offered here (the rest come from the settings menu). */
  facetFields: string[];
  view: ResearchView;
  onViewChange: (view: ResearchView) => void;
  /** Filter fields (and 'sortBy') whose current value was recognised in the query. */
  recognised?: string[];
  /** Label of a recognised time span that is none of the presets („seit 2023“). */
  dateLabel?: string;
}) {
  const { filterFields, activeFilters, searchMode, setSearchMode, sortBy, setSortBy } = filters;

  const dateConfig = filterFields[DATE_FIELD];
  const dateValue = activeFilters[DATE_FIELD];
  const dateRange: DateRange = dateValue && !Array.isArray(dateValue) ? dateValue : {};
  const presets = datePresets(new Date());
  const presetKey = (r: DateRange) => `${r.date_from ?? ''}|${r.date_to ?? ''}`;
  const dateOptions = presets.map((p) => ({ value: presetKey(p.range), label: p.label }));
  if (!dateOptions.some((o) => o.value === presetKey(dateRange))) {
    dateOptions.push({
      value: presetKey(dateRange),
      label: dateLabel ?? [dateRange.date_from, dateRange.date_to].filter(Boolean).join(' – '),
    });
  }

  const offeredFacets = facetFields.filter((f) => (filterFields[f]?.values ?? []).length > 0);

  const controls: ReactElement[] = [
    <SelectControl
      key="mode"
      name="Suchart"
      options={MODE_OPTIONS}
      value={searchMode}
      defaultValue="hybrid"
      recognised={false}
      onChange={setSearchMode}
    />,
    <SelectControl
      key="sort"
      name="Sortierung"
      options={SORT_OPTIONS}
      value={sortBy}
      defaultValue="relevance"
      recognised={recognised.includes('sortBy')}
      onChange={setSortBy}
    />,
  ];
  if (dateConfig?.type === 'date_range') {
    controls.push(
      <SelectControl
        key="date"
        name="Zeitraum"
        options={dateOptions}
        value={presetKey(dateRange)}
        defaultValue="|"
        recognised={recognised.includes(DATE_FIELD)}
        onChange={(key) => {
          if (key === presetKey(dateRange)) return;
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
        recognised={recognised.includes(field)}
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
