import * as React from 'react';

import { cn } from '../../utils/cn';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-grey-200 bg-white px-3 py-2 text-base transition-colors placeholder:text-grey-400 focus-visible:outline-none focus-visible:border-primary-600 focus-visible:ring-[3px] focus-visible:ring-primary-300/30 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export { Textarea };
