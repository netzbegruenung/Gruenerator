import { ChevronDown, Check } from 'lucide-react';
import React, { useCallback, useState } from 'react';

import { useIsMobile } from '../hooks/use-mobile';
import { cn } from '../lib/cn';

import {
  pillBase,
  pillActive,
  pillInactive,
  toggleSelection,
  type SettingConfig,
} from './pill-group';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './sheet';

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
    const isMobile = useIsMobile();
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

    const selectedOptions = config.options.filter((o) => selected.has(o.id));
    const hasIcons = config.options.some((o) => o.icon);

    const trigger = (
      <button
        type="button"
        className={cn(pillBase, selectedCount > 0 ? pillActive : pillInactive, 'gap-1', className)}
      >
        {hasIcons && selectedOptions.length > 0 && (
          <span className="flex items-center gap-0.5 shrink-0 sm:hidden [&_svg]:size-3.5">
            {selectedOptions.map((o) => (
              <span key={o.id}>{o.icon}</span>
            ))}
          </span>
        )}
        <span className={cn(hasIcons && selectedCount > 0 && 'hidden sm:inline')}>
          {selectedLabel}
        </span>
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>
    );

    const renderOptions = (itemClass: string) =>
      config.options.map((option) => {
        const isSelected = selected.has(option.id);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => handleToggle(option.id)}
            className={cn(itemClass, isSelected && 'text-primary-700 dark:text-primary-300')}
          >
            <span className="shrink-0 [&_svg]:size-4">{option.icon}</span>
            <span className="flex-1 text-left">{option.label}</span>
            {isSelected && <Check className="size-3.5 shrink-0 text-primary-500" />}
          </button>
        );
      });

    if (isMobile) {
      return (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="max-h-[70vh] rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-grey-300 dark:bg-grey-600" />
            <SheetTitle className="mb-2 text-sm font-semibold text-foreground">{label}</SheetTitle>
            <div className="overflow-y-auto">
              {renderOptions(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-grey-50 dark:hover:bg-grey-800 active:bg-grey-100 dark:active:bg-grey-700'
              )}
            </div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-56 p-1 bg-background-pure border border-grey-200 dark:border-grey-700 rounded-lg shadow-lg"
        >
          {renderOptions(
            'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-grey-50 dark:hover:bg-grey-800'
          )}
        </PopoverContent>
      </Popover>
    );
  }
);

SettingsDropdown.displayName = 'SettingsDropdown';

export { SettingsDropdown, type SettingsDropdownProps };
