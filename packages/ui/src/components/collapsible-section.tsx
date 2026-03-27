import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';

import { cn } from '../lib/cn';

interface CollapsibleSectionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  bordered?: boolean;
  className?: string;
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  bordered = false,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        bordered && 'border border-grey-200 dark:border-grey-700 rounded-lg overflow-hidden',
        !bordered && 'border-t border-grey-200 dark:border-grey-700 pt-md',
        className
      )}
    >
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center justify-between text-sm font-medium transition-colors select-none',
          bordered
            ? 'px-md py-sm text-foreground hover:bg-grey-50 dark:hover:bg-grey-800/50'
            : 'cursor-pointer text-grey-500 hover:text-foreground border-none bg-transparent'
        )}
      >
        <span className="flex items-center gap-xs">{title}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-grey-400 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && <div className={cn(bordered ? 'px-md pb-md' : 'mt-sm')}>{children}</div>}
    </div>
  );
}

export { CollapsibleSection, type CollapsibleSectionProps };
