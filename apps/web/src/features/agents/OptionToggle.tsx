import { PiCheck } from 'react-icons/pi';

import { cn } from '@/utils/cn';

interface OptionToggleProps {
  checked: boolean;
  onToggle: () => void;
  title: string;
  description?: string;
}

/**
 * Selectable option card used across the agent editor's Werkzeuge and Wissen
 * tabs. The whole card is clickable (a visually-hidden native checkbox keeps it
 * keyboard-accessible); the green tick + tint reflect the checked state.
 */
export function OptionToggle({ checked, onToggle, title, description }: OptionToggleProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-sm rounded-lg border p-sm transition-colors',
        description ? 'items-start' : 'items-center',
        checked
          ? 'border-secondary-600/50 bg-secondary-600/5'
          : 'border-grey-200 hover:border-grey-300 dark:border-grey-700 dark:hover:border-grey-600'
      )}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
      <span
        className={cn(
          'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
          description && 'mt-0.5',
          checked
            ? 'border-primary-600 bg-primary-600 text-white'
            : 'border-grey-300 bg-background dark:border-grey-600'
        )}
      >
        {checked && <PiCheck className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-snug text-foreground-muted">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
