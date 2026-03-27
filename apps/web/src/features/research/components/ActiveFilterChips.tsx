import { Badge } from '@gruenerator/ui';
import { HiXMark } from 'react-icons/hi2';

import { type ActiveFilters, type FilterFieldConfig } from '../useResearchFilters';

interface ActiveFilterChipsProps {
  filterFields: Record<string, FilterFieldConfig>;
  activeFilters: ActiveFilters;
  onRemoveValue: (field: string, value: string) => void;
  onClearFilter: (field: string) => void;
  onClearAll: () => void;
}

function formatDate(iso: string): string {
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

export default function ActiveFilterChips({
  filterFields,
  activeFilters,
  onRemoveValue,
  onClearFilter,
  onClearAll,
}: ActiveFilterChipsProps) {
  const entries = Object.entries(activeFilters);
  if (entries.length === 0) return null;

  const chips: React.ReactNode[] = [];
  let totalCount = 0;

  for (const [field, value] of entries) {
    const label = filterFields[field]?.label || field;

    if (Array.isArray(value)) {
      for (const v of value) {
        totalCount++;
        chips.push(
          <Badge key={`${field}:${v}`} variant="secondary" className="gap-1 pr-1">
            <span className="text-grey-500 dark:text-grey-400">{label}:</span> {v}
            <button
              type="button"
              onClick={() => onRemoveValue(field, v)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-grey-300 dark:hover:bg-grey-600"
            >
              <HiXMark className="size-3" />
            </button>
          </Badge>
        );
      }
    } else if (value.date_from || value.date_to) {
      totalCount++;
      const from = value.date_from ? formatDate(value.date_from) : '…';
      const to = value.date_to ? formatDate(value.date_to) : '…';
      chips.push(
        <Badge key={`${field}:date`} variant="secondary" className="gap-1 pr-1">
          <span className="text-grey-500 dark:text-grey-400">{label}:</span> {from} – {to}
          <button
            type="button"
            onClick={() => onClearFilter(field)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-grey-300 dark:hover:bg-grey-600"
          >
            <HiXMark className="size-3" />
          </button>
        </Badge>
      );
    }
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips}
      {totalCount > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-grey-500 hover:text-grey-700 dark:text-grey-400 dark:hover:text-grey-200"
        >
          Alle entfernen
        </button>
      )}
    </div>
  );
}
