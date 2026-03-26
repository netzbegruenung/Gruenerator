import React, { useCallback, type ReactNode } from 'react';

import { cn } from '../lib/cn';

export interface SettingOption {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface SettingConfig {
  key: string;
  label?: string;
  options: SettingOption[];
  multiple: boolean;
}

export const pillBase = cn(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
  'border transition-all cursor-pointer select-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50'
);

export const pillInactive = cn(
  'border-grey-200 dark:border-grey-700 text-grey-500 dark:text-grey-400',
  'hover:border-grey-300 dark:hover:border-grey-600 hover:text-foreground',
  'hover:bg-grey-50 dark:hover:bg-grey-800'
);

export const pillActive = cn(
  'border-primary-500 bg-primary-500/10 text-primary-700',
  'dark:border-primary-400 dark:bg-primary-400/10 dark:text-primary-300',
  'hover:bg-primary-500/15 dark:hover:bg-primary-400/15'
);

export function toggleSelection(
  multiple: boolean,
  currentValue: string | string[],
  optionId: string,
  onChange: (value: string | string[]) => void
): void {
  if (multiple) {
    const current = Array.isArray(currentValue) ? currentValue : [currentValue];
    const isSelected = current.includes(optionId);
    onChange(isSelected ? current.filter((id) => id !== optionId) : [...current, optionId]);
  } else {
    onChange(optionId);
  }
}

export function PillGroup({
  config,
  value,
  onChange,
}: {
  config: SettingConfig;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  const selectedSet = new Set(Array.isArray(value) ? value : [value]);

  const handleClick = useCallback(
    (optionId: string) => toggleSelection(config.multiple, value, optionId, onChange),
    [config.multiple, value, onChange]
  );

  return (
    <div className="flex flex-col gap-xs">
      {config.label && (
        <span className="text-xs text-grey-500 dark:text-grey-400">{config.label}</span>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={config.label ?? config.key}>
        {config.options.map((option) => {
          const isActive = selectedSet.has(option.id);
          return (
            <button
              key={option.id}
              type="button"
              role={config.multiple ? 'checkbox' : 'radio'}
              aria-checked={isActive}
              onClick={() => handleClick(option.id)}
              className={cn(pillBase, isActive ? pillActive : pillInactive)}
            >
              {option.icon && <span className="shrink-0 [&_svg]:size-3.5">{option.icon}</span>}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
