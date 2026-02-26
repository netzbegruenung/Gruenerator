'use client';

import { ListFilter } from 'lucide-react';
import { Dropdown, DropdownItem, ToggleSwitch } from '../ui/Dropdown';
import { cn } from '../../lib/utils';

export interface SourceFilterCollection {
  id: string;
  name: string;
  description?: string;
  documentCount?: string | number;
}

export interface SourceFilterDropdownProps {
  collections: SourceFilterCollection[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
}

export function SourceFilterDropdown({
  collections,
  selectedIds,
  onToggle,
  onSelectAll,
  onSelectNone,
}: SourceFilterDropdownProps) {
  const activeCount = selectedIds.length;

  return (
    <Dropdown
      align="left"
      direction="up"
      width="w-80"
      maxHeight="20rem"
      showChevron={false}
      trigger={
        <ListFilter className={cn('h-4 w-4', activeCount < collections.length && 'text-primary')} />
      }
      badge={
        activeCount < collections.length ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        ) : undefined
      }
      footer={
        <div className="flex items-center justify-between">
          <p className="text-xs text-foreground-muted">
            {activeCount} von {collections.length} Quellen aktiv
          </p>
          <div className="flex gap-2">
            {onSelectAll && (
              <button
                type="button"
                onClick={onSelectAll}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Alle
              </button>
            )}
            {onSelectNone && (
              <button
                type="button"
                onClick={onSelectNone}
                className="text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
              >
                Keine
              </button>
            )}
          </div>
        </div>
      }
    >
      {collections.map((collection) => {
        const isEnabled = selectedIds.includes(collection.id);

        return (
          <DropdownItem
            key={collection.id}
            label={collection.name}
            description={
              collection.documentCount
                ? `${collection.documentCount} Dokumente`
                : collection.description
            }
            onClick={() => onToggle(collection.id)}
            trailing={<ToggleSwitch enabled={isEnabled} />}
          />
        );
      })}
    </Dropdown>
  );
}
