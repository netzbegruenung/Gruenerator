import * as Switch from '@radix-ui/react-switch';

import { cn } from '../../utils/cn';

import type { JSX } from 'react';

interface RequiredFieldToggleProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  showLabel?: boolean;
}

const RequiredFieldToggle = ({
  checked = false,
  onChange,
  disabled = false,
  label = 'Pflichtfeld',
  showLabel = true,
}: RequiredFieldToggleProps): JSX.Element => {
  const handleToggle = (newChecked: boolean): void => {
    if (!disabled && onChange) {
      onChange(newChecked);
    }
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-xs py-xxs',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <Switch.Root
        className={cn(
          '[all:unset] w-[38px] h-5 bg-background-alt [border:var(--border-subtle)] rounded-[20px] relative shadow-sm transition-all cursor-pointer shrink-0',
          'focus-visible:outline-2 focus-visible:outline-[var(--interactive-accent-color)] focus-visible:outline-offset-2',
          'data-[state=checked]:bg-[var(--button-color)] data-[state=checked]:border-[var(--button-color)]',
          'dark:data-[state=checked]:bg-[var(--klee)] dark:data-[state=checked]:border-[var(--klee)]',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={disabled}
        aria-label={label}
      >
        <Switch.Thumb
          className={cn(
            'block w-3.5 h-3.5 bg-background rounded-full shadow-sm transition-all translate-x-[3px] will-change-transform',
            'data-[state=checked]:translate-x-[21px] data-[state=checked]:bg-white'
          )}
        />
      </Switch.Root>
      {showLabel && (
        <span
          className={cn(
            'text-[0.85rem] text-foreground font-medium select-none whitespace-nowrap',
            disabled && 'text-[var(--font-color-disabled)]'
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default RequiredFieldToggle;
