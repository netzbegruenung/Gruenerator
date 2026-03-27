import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

export interface SelectCardProps {
  label: string;
  description?: string;
  icon?: ReactNode;
  selected?: boolean;
  onClick: () => void;
  className?: string;
}

export function SelectCard({
  label,
  description,
  icon,
  selected = false,
  onClick,
  className,
}: SelectCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-sm rounded-lg border p-md text-left transition-all',
        selected
          ? 'border-primary-500 bg-primary-500/5 dark:border-primary-400 dark:bg-primary-400/5'
          : 'border-grey-200 dark:border-grey-700 hover:border-grey-300 dark:hover:border-grey-600 hover:bg-background-alt',
        className
      )}
    >
      {icon && <div className="shrink-0 text-lg">{icon}</div>}
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="text-xs text-grey-500 mt-0.5">{description}</div>}
      </div>
    </button>
  );
}
