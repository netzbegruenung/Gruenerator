import { ChevronDown, Check } from 'lucide-react';
import React, { useCallback, useState } from 'react';

import { cn } from '../lib/cn';

import {
  pillBase,
  pillActive,
  pillInactive,
  toggleSelection,
  type SettingConfig,
} from './pill-group';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface SettingsDropdownProps {
  config: SettingConfig;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  triggerLabel?: string;
  className?: string;
}

const SettingsDropdown: React.FC<SettingsDropdownProps> = React.memo(
  ({ config, value, onChange, triggerLabel, className }) => {
    const [open, setOpen] = useState(false);
    const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
    const selectedCount = selected.size;

    const handleToggle = useCallback(
      (optionId: string) => {
        toggleSelection(config.multiple, value, optionId, onChange);
        if (!config.multiple) setOpen(false);
      },
      [config.multiple, value, onChange]
    );

    const label = triggerLabel ?? config.label ?? config.key;
    const selectedNames = config.options.filter((o) => selected.has(o.id)).map((o) => o.label);
    const selectedLabel = config.multiple
      ? selectedNames.length > 0
        ? selectedNames.join(', ')
        : label
      : (config.options.find((o) => selected.has(o.id))?.label ?? label);

    const firstSelectedOption = config.options.find((o) => selected.has(o.id));
    const hasIcons = config.options.some((o) => o.icon);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              pillBase,
              selectedCount > 0 ? pillActive : pillInactive,
              'gap-1',
              className
            )}
          >
            {hasIcons && firstSelectedOption?.icon && (
              <span className="shrink-0 [&_svg]:size-3.5">{firstSelectedOption.icon}</span>
            )}
            <span className={cn(hasIcons && 'max-sm:hidden')}>{selectedLabel}</span>
            <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-56 p-1 bg-background-pure border border-grey-200 dark:border-grey-700 rounded-lg shadow-lg"
        >
          {config.options.map((option) => {
            const isSelected = selected.has(option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleToggle(option.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
                  'hover:bg-grey-50 dark:hover:bg-grey-800',
                  isSelected && 'text-primary-700 dark:text-primary-300'
                )}
              >
                <span className="shrink-0 [&_svg]:size-4">{option.icon}</span>
                <span className="flex-1 text-left">{option.label}</span>
                {isSelected && <Check className="size-3.5 shrink-0 text-primary-500" />}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    );
  }
);

SettingsDropdown.displayName = 'SettingsDropdown';

export { SettingsDropdown, type SettingsDropdownProps };
