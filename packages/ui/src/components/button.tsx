import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '../lib/cn';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
        outline:
          'border bg-background shadow-xs hover:bg-hover-alt dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-hover-alt',
        link: 'text-primary underline-offset-4 hover:underline',
        brand:
          'rounded-full bg-secondary-600 text-white border-none hover:bg-secondary-700 hover:-translate-y-px hover:shadow-lg focus-visible:ring-secondary-600/50 disabled:opacity-100 disabled:bg-grey-300 disabled:text-grey-500',
        'brand-outline':
          'rounded-full bg-background text-foreground border border-grey-200 dark:border-grey-700 hover:bg-background-alt hover:-translate-y-px disabled:opacity-100',
        'brand-ghost': 'rounded-full bg-transparent text-foreground hover:bg-background-alt',
        'brand-danger':
          'rounded-full bg-[#D32F2F] text-white border-none hover:bg-[#b71c1c] hover:-translate-y-px hover:shadow-lg focus-visible:ring-[#D32F2F]/50 disabled:opacity-100 disabled:bg-grey-300 disabled:text-grey-500',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
        brand: 'h-10 px-6 py-3',
        'brand-sm': 'h-8 px-4 py-2 text-xs',
        'brand-md': 'h-12 px-8 py-4 text-base',
        'brand-icon': "size-12 min-w-12 p-0 shadow-sm [&_svg:not([class*='size-'])]:text-xl",
        'brand-icon-sm': "size-9 min-w-9 p-0 [&_svg:not([class*='size-'])]:text-base",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
