'use client';

import { Filter } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@gruenerator/ui';
import { cn, composerToolbarButtonClass } from '../../lib/utils';

export interface CategoryFilterField {
  field: string;
  label: string;
  values: Array<{ value: string; count?: number }>;
}

export interface CategoryFilterDropdownProps {
  fields: CategoryFilterField[];
  activeFilters: Record<string, string[]>;
  onToggle: (field: string, value: string) => void;
  onClearAll?: () => void;
}

function FilterCheckboxItems({
  fieldConfig,
  activeFilters,
  onToggle,
}: {
  fieldConfig: CategoryFilterField;
  activeFilters: Record<string, string[]>;
  onToggle: (field: string, value: string) => void;
}) {
  const fieldActive = activeFilters[fieldConfig.field] || [];
  return (
    <>
      {fieldConfig.values.map(({ value, count }) => {
        const isChecked = fieldActive.length === 0 || fieldActive.includes(value);
        return (
          <DropdownMenuCheckboxItem
            key={value}
            checked={isChecked}
            onCheckedChange={() => onToggle(fieldConfig.field, value)}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="truncate">{value}</span>
              {count != null && (
                <span className="shrink-0 text-[10px] text-foreground-muted">{count}</span>
              )}
            </div>
          </DropdownMenuCheckboxItem>
        );
      })}
    </>
  );
}

export function CategoryFilterDropdown({
  fields,
  activeFilters,
  onToggle,
  onClearAll,
}: CategoryFilterDropdownProps) {
  const hasActiveFilters = Object.keys(activeFilters).length > 0;
  const activeCount = Object.values(activeFilters).reduce((sum, arr) => sum + arr.length, 0);
  const isSingleField = fields.length === 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={composerToolbarButtonClass}>
          <Filter className={cn('h-4 w-4', hasActiveFilters && 'text-primary')} />
          {hasActiveFilters && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-56 max-h-[20rem] overflow-y-auto">
        {isSingleField ? (
          <FilterCheckboxItems
            fieldConfig={fields[0]}
            activeFilters={activeFilters}
            onToggle={onToggle}
          />
        ) : (
          fields.map((fieldConfig) => (
            <DropdownMenuSub key={fieldConfig.field}>
              <DropdownMenuSubTrigger>
                {fieldConfig.label}
                {activeFilters[fieldConfig.field]?.length > 0 && (
                  <span className="ml-auto text-[10px] text-primary">
                    {activeFilters[fieldConfig.field].length}
                  </span>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[20rem] overflow-y-auto">
                <FilterCheckboxItems
                  fieldConfig={fieldConfig}
                  activeFilters={activeFilters}
                  onToggle={onToggle}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))
        )}

        {onClearAll && hasActiveFilters && (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs text-foreground-muted">{activeCount} Filter aktiv</span>
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
              >
                Zurücksetzen
              </button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
