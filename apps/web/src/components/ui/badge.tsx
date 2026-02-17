import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary-500 text-white',
        secondary:
          'border-transparent bg-grey-200 text-grey-800 dark:bg-grey-700 dark:text-grey-200',
        outline: 'border-grey-300 text-grey-700 dark:border-grey-600 dark:text-grey-300',
        destructive: 'border-transparent bg-red-600 text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
