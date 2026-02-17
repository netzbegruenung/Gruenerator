import { cva, type VariantProps } from 'class-variance-authority';
import { Toggle } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/utils/cn';

const toggleVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors hover:bg-grey-100 hover:text-grey-600 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-grey-200 data-[state=on]:text-grey-900 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:hover:bg-grey-800 dark:hover:text-grey-300 dark:data-[state=on]:bg-grey-700 dark:data-[state=on]:text-grey-100',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-grey-300 bg-transparent shadow-xs hover:bg-grey-100 dark:border-grey-600',
      },
      size: {
        default: 'h-9 px-2 min-w-9',
        sm: 'h-8 px-1.5 min-w-8',
        lg: 'h-10 px-2.5 min-w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function ToggleComponent({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Toggle.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <Toggle.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { ToggleComponent as Toggle, toggleVariants };
