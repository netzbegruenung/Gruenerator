import * as React from 'react';

import { cn } from '../lib/cn';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-sm border-0 bg-input-bg px-sm py-sm text-sm text-input-text',
        'outline-none transition-all duration-200',
        'selection:bg-primary selection:text-primary-foreground',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        'placeholder:text-foreground/95',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:bg-background-alt disabled:opacity-80 disabled:cursor-not-allowed',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        'autofill:shadow-[inset_0_0_0_30px_var(--input-background)]',
        className
      )}
      {...props}
    />
  );
}

export { Input };
