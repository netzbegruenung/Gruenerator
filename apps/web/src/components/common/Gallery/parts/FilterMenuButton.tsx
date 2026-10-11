import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';

import type { JSX, ReactNode } from 'react';

import { cn } from '@/utils/cn';

export interface FilterMenuOption {
  id: string;
  label: string;
}

/**
 * Toolbar icon that opens a single-choice menu. While a non-default option is
 * chosen the icon turns primary and carries a dot, so the filter is visible
 * with the menu closed.
 */
export function FilterMenuButton({
  label,
  menuLabel,
  value,
  options,
  onChange,
  active,
  icon,
}: {
  /** Accessible name and tooltip of the trigger. */
  label: string;
  menuLabel: string;
  value: string;
  options: FilterMenuOption[];
  onChange: (value: string) => void;
  active: boolean;
  icon: ReactNode;
}): JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          className={cn('relative', active && 'text-primary-600 dark:text-primary-400')}
        >
          {icon}
          {active && (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary-600 dark:bg-primary-400"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
