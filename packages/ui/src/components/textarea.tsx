import * as React from 'react';

import { cn } from '../lib/cn';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-sm border-0 bg-input-bg px-sm py-sm text-sm text-input-text',
        'resize-none outline-none transition-all duration-200',
        'placeholder:text-foreground/95',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:bg-background-alt disabled:opacity-80 disabled:cursor-not-allowed',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        'scrollbar-thin',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
