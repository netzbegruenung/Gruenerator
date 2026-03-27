import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@gruenerator/ui';
import { memo, useCallback, useMemo, useState } from 'react';
import { FiFilter, FiArrowUp, FiArrowDown, FiX, FiPlus, FiColumns } from 'react-icons/fi';

import type { Field, BoardView, FilterRule, SortRule } from '../types';

interface ViewToolbarProps {
  fields: Field[];
  activeView: BoardView | null;
  onUpdateView: (viewId: string, updates: Partial<BoardView>) => void;
}

const FILTER_OPERATORS: Record<string, { label: string; types: string[] }[]> = {
  text: [
    { label: 'enthält', types: ['contains'] },
    { label: 'ist gleich', types: ['equals'] },
    { label: 'ist leer', types: ['isEmpty'] },
    { label: 'ist nicht leer', types: ['isNotEmpty'] },
  ],
  number: [
    { label: 'ist gleich', types: ['equals'] },
    { label: 'größer als', types: ['greaterThan'] },
    { label: 'kleiner als', types: ['lessThan'] },
  ],
  singleSelect: [
    { label: 'ist', types: ['equals'] },
    { label: 'ist nicht', types: ['notEquals'] },
  ],
  multiSelect: [
    { label: 'enthält', types: ['includes'] },
    { label: 'ist leer', types: ['isEmpty'] },
  ],
  date: [
    { label: 'vor', types: ['before'] },
    { label: 'nach', types: ['after'] },
    { label: 'ist leer', types: ['isEmpty'] },
  ],
  checkbox: [{ label: 'ist aktiv', types: ['equals'] }],
};

function getOperatorsForField(field: Field) {
  return FILTER_OPERATORS[field.type] ?? FILTER_OPERATORS.text;
}

export const ViewToolbar = memo(function ViewToolbar({
  fields,
  activeView,
  onUpdateView,
}: ViewToolbarProps) {
  if (!activeView) return null;

  const filters = activeView.filters;
  const sorts = activeView.sorts;
  const hasFiltersOrSorts = filters.length > 0 || sorts.length > 0;

  return (
    <div className="flex items-center gap-1 px-md sm:px-lg pb-xs">
      <FilterButton
        fields={fields}
        filters={filters}
        onFiltersChange={(newFilters) => onUpdateView(activeView.id, { filters: newFilters })}
      />
      <SortButton
        fields={fields}
        sorts={sorts}
        onSortsChange={(newSorts) => onUpdateView(activeView.id, { sorts: newSorts })}
      />
      {activeView.layout === 'kanban' || activeView.layout === 'list' ? (
        <GroupByButton
          fields={fields}
          groupByFieldId={activeView.groupByFieldId}
          onGroupByChange={(fieldId) => onUpdateView(activeView.id, { groupByFieldId: fieldId })}
        />
      ) : null}
      {hasFiltersOrSorts && (
        <button
          onClick={() => onUpdateView(activeView.id, { filters: [], sorts: [] })}
          className="text-[10px] text-grey-400 hover:text-foreground bg-transparent border-none cursor-pointer transition-colors ml-1"
        >
          Zurücksetzen
        </button>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Filter Button
// ---------------------------------------------------------------------------

function FilterButton({
  fields,
  filters,
  onFiltersChange,
}: {
  fields: Field[];
  filters: FilterRule[];
  onFiltersChange: (filters: FilterRule[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const addFilter = useCallback(
    (fieldId: string) => {
      const field = fields.find((f) => f.id === fieldId);
      if (!field) return;
      const ops = getOperatorsForField(field);
      onFiltersChange([...filters, { fieldId, operator: ops[0]?.types[0] ?? 'equals', value: '' }]);
    },
    [fields, filters, onFiltersChange]
  );

  const removeFilter = useCallback(
    (index: number) => {
      onFiltersChange(filters.filter((_, i) => i !== index));
    },
    [filters, onFiltersChange]
  );

  const updateFilter = useCallback(
    (index: number, updates: Partial<FilterRule>) => {
      onFiltersChange(filters.map((f, i) => (i === index ? { ...f, ...updates } : f)));
    },
    [filters, onFiltersChange]
  );

  const filterableFields = useMemo(
    () => fields.filter((f) => !filters.some((r) => r.fieldId === f.id)),
    [fields, filters]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border-none cursor-pointer transition-colors ${
            filters.length > 0
              ? 'bg-primary-600/10 text-primary-600 dark:text-primary-400'
              : 'bg-transparent text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
          }`}
        >
          <FiFilter size={12} />
          Filter
          {filters.length > 0 && (
            <span className="ml-0.5 bg-primary-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
              {filters.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="space-y-2">
          {filters.map((rule, idx) => {
            const field = fields.find((f) => f.id === rule.fieldId);
            if (!field) return null;
            const ops = getOperatorsForField(field);
            const needsValue = !['isEmpty', 'isNotEmpty'].includes(rule.operator);
            return (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="text-xs text-grey-500 w-20 truncate shrink-0">{field.name}</span>
                <select
                  value={rule.operator}
                  onChange={(e) => updateFilter(idx, { operator: e.target.value })}
                  className="text-xs rounded border border-grey-200 dark:border-grey-700 bg-transparent px-1 py-0.5 outline-none"
                >
                  {ops.map((op) => (
                    <option key={op.types[0]} value={op.types[0]}>
                      {op.label}
                    </option>
                  ))}
                </select>
                {needsValue && (
                  <input
                    value={String(rule.value ?? '')}
                    onChange={(e) => updateFilter(idx, { value: e.target.value })}
                    className="flex-1 text-xs rounded border border-grey-200 dark:border-grey-700 bg-transparent px-1.5 py-0.5 outline-none focus:border-primary-500"
                    placeholder="Wert..."
                  />
                )}
                <button
                  onClick={() => removeFilter(idx)}
                  className="text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0.5"
                >
                  <FiX size={12} />
                </button>
              </div>
            );
          })}
          {filterableFields.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 text-xs text-grey-400 hover:text-foreground bg-transparent border-none cursor-pointer transition-colors">
                  <FiPlus size={11} />
                  Filter hinzufügen
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {filterableFields.map((f) => (
                  <DropdownMenuItem key={f.id} onClick={() => addFilter(f.id)}>
                    {f.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Sort Button
// ---------------------------------------------------------------------------

function SortButton({
  fields,
  sorts,
  onSortsChange,
}: {
  fields: Field[];
  sorts: SortRule[];
  onSortsChange: (sorts: SortRule[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const sortableFields = useMemo(
    () => fields.filter((f) => ['text', 'number', 'date', 'singleSelect'].includes(f.type)),
    [fields]
  );

  const addSort = useCallback(
    (fieldId: string) => {
      onSortsChange([...sorts, { fieldId, direction: 'asc' }]);
    },
    [sorts, onSortsChange]
  );

  const removeSort = useCallback(
    (index: number) => onSortsChange(sorts.filter((_, i) => i !== index)),
    [sorts, onSortsChange]
  );

  const toggleDirection = useCallback(
    (index: number) => {
      onSortsChange(
        sorts.map((s, i) =>
          i === index ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' } : s
        )
      );
    },
    [sorts, onSortsChange]
  );

  const availableFields = useMemo(
    () => sortableFields.filter((f) => !sorts.some((s) => s.fieldId === f.id)),
    [sortableFields, sorts]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border-none cursor-pointer transition-colors ${
            sorts.length > 0
              ? 'bg-primary-600/10 text-primary-600 dark:text-primary-400'
              : 'bg-transparent text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
          }`}
        >
          <FiArrowUp size={12} />
          Sortieren
          {sorts.length > 0 && (
            <span className="ml-0.5 bg-primary-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
              {sorts.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="space-y-2">
          {sorts.map((rule, idx) => {
            const field = fields.find((f) => f.id === rule.fieldId);
            return (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="text-xs text-grey-500 flex-1 truncate">
                  {field?.name ?? rule.fieldId}
                </span>
                <button
                  onClick={() => toggleDirection(idx)}
                  className="flex items-center gap-0.5 text-xs text-grey-500 hover:text-foreground bg-transparent border-none cursor-pointer"
                >
                  {rule.direction === 'asc' ? <FiArrowUp size={11} /> : <FiArrowDown size={11} />}
                  {rule.direction === 'asc' ? 'A→Z' : 'Z→A'}
                </button>
                <button
                  onClick={() => removeSort(idx)}
                  className="text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0.5"
                >
                  <FiX size={12} />
                </button>
              </div>
            );
          })}
          {availableFields.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 text-xs text-grey-400 hover:text-foreground bg-transparent border-none cursor-pointer transition-colors">
                  <FiPlus size={11} />
                  Sortierung hinzufügen
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {availableFields.map((f) => (
                  <DropdownMenuItem key={f.id} onClick={() => addSort(f.id)}>
                    {f.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Group-By Button
// ---------------------------------------------------------------------------

function GroupByButton({
  fields,
  groupByFieldId,
  onGroupByChange,
}: {
  fields: Field[];
  groupByFieldId?: string;
  onGroupByChange: (fieldId: string | undefined) => void;
}) {
  const groupableFields = useMemo(
    () => fields.filter((f) => ['singleSelect', 'checkbox'].includes(f.type)),
    [fields]
  );

  const currentField = useMemo(
    () => fields.find((f) => f.id === groupByFieldId),
    [fields, groupByFieldId]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border-none cursor-pointer transition-colors ${
            groupByFieldId
              ? 'bg-primary-600/10 text-primary-600 dark:text-primary-400'
              : 'bg-transparent text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
          }`}
        >
          <FiColumns size={12} />
          {currentField ? `Gruppiert: ${currentField.name}` : 'Gruppieren'}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {groupByFieldId && (
          <DropdownMenuItem onClick={() => onGroupByChange(undefined)}>
            <FiX className="mr-2" size={13} />
            Gruppierung entfernen
          </DropdownMenuItem>
        )}
        {groupableFields.map((f) => (
          <DropdownMenuItem
            key={f.id}
            onClick={() => onGroupByChange(f.id)}
            className={f.id === groupByFieldId ? 'bg-grey-100 dark:bg-grey-800' : ''}
          >
            {f.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
