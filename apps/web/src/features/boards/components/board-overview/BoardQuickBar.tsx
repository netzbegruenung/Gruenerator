import { Input } from '@gruenerator/ui';
import { memo } from 'react';
import { FiArchive, FiSearch, FiX } from 'react-icons/fi';

import type { QuickFilter } from '../../hooks/useViewData';

interface BoardQuickBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  quickFilters: QuickFilter[];
  onToggleQuickFilter: (filter: QuickFilter) => void;
  /** Hide the "Meine Aufgaben" chip when no user is known. */
  hasUser: boolean;
  /** Whether archived cards are currently shown. */
  includeArchived: boolean;
  /** Toggle visibility of archived cards. */
  onToggleArchived: () => void;
}

const CHIPS: { id: QuickFilter; label: string }[] = [
  { id: 'mine', label: 'Meine' },
  { id: 'overdue', label: 'Überfällig' },
  { id: 'unassigned', label: 'Ohne Zuständige' },
];

/**
 * Always-visible lightweight board-overview bar: full-text search (A5) plus
 * quick-filter toggle chips (A4). Transient — nothing here is persisted to the
 * view; the advanced Filter/Sort/Group toolbar stays expert-mode only.
 */
export const BoardQuickBar = memo(function BoardQuickBar({
  search,
  onSearchChange,
  quickFilters,
  onToggleQuickFilter,
  hasUser,
  includeArchived,
  onToggleArchived,
}: BoardQuickBarProps) {
  const chips = hasUser ? CHIPS : CHIPS.filter((c) => c.id !== 'mine');

  return (
    <div className="z-10 flex items-center gap-2 px-md sm:px-lg pb-xs">
      <div className="relative w-44 sm:w-56">
        <FiSearch
          size={14}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-grey-400"
        />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Suchen…"
          aria-label="Karten durchsuchen"
          className="h-7 pl-7 pr-7 text-xs"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            aria-label="Suche leeren"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center rounded p-0.5 text-grey-400 hover:text-foreground bg-transparent border-none cursor-pointer"
          >
            <FiX size={13} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto">
        {chips.map((chip) => {
          const active = quickFilters.includes(chip.id);
          return (
            <button
              key={chip.id}
              onClick={() => onToggleQuickFilter(chip.id)}
              aria-pressed={active}
              className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs border cursor-pointer transition-colors ${
                active
                  ? 'bg-primary-600/10 text-primary-600 dark:text-primary-400 border-primary-600/30'
                  : 'bg-transparent text-grey-500 hover:text-foreground border-grey-200 dark:border-grey-700 hover:bg-grey-100 dark:hover:bg-grey-800'
              }`}
            >
              {chip.label}
            </button>
          );
        })}

        <button
          onClick={onToggleArchived}
          aria-pressed={includeArchived}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs border cursor-pointer transition-colors ${
            includeArchived
              ? 'bg-primary-600/10 text-primary-600 dark:text-primary-400 border-primary-600/30'
              : 'bg-transparent text-grey-500 hover:text-foreground border-grey-200 dark:border-grey-700 hover:bg-grey-100 dark:hover:bg-grey-800'
          }`}
        >
          <FiArchive size={11} />
          Archiv
        </button>
      </div>
    </div>
  );
});
