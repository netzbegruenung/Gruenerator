import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn';

const statusBannerVariants = cva('rounded-md border p-md text-sm', {
  variants: {
    variant: {
      error:
        'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400',
      success:
        'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400',
      info: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      warning:
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400',
    },
  },
  defaultVariants: {
    variant: 'error',
  },
});

function StatusBanner({
  className,
  variant = 'error',
  role,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof statusBannerVariants>) {
  return (
    <div
      data-slot="status-banner"
      data-variant={variant}
      role={role ?? (variant === 'error' ? 'alert' : 'status')}
      className={cn(statusBannerVariants({ variant, className }))}
      {...props}
    />
  );
}

export { StatusBanner, statusBannerVariants };
