'use client';

import { ListFilter } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@gruenerator/ui';
import { cn, composerToolbarButtonClass } from '../../lib/utils';

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={composerToolbarButtonClass}>
          <ListFilter
            className={cn('h-4 w-4', activeCount < collections.length && 'text-primary')}
          />
          {activeCount < collections.length && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-80 max-h-[20rem] overflow-y-auto">
        {collections.map((collection) => (
          <DropdownMenuCheckboxItem
            key={collection.id}
            checked={selectedIds.includes(collection.id)}
            onCheckedChange={() => onToggle(collection.id)}
          >
            <div className="flex flex-col">
              <span>{collection.name}</span>
              {(collection.documentCount || collection.description) && (
                <span className="text-xs text-foreground-muted">
                  {collection.documentCount
                    ? `${collection.documentCount} Dokumente`
                    : collection.description}
                </span>
              )}
            </div>
          </DropdownMenuCheckboxItem>
        ))}

        {(onSelectAll || onSelectNone) && (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1.5">
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
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
