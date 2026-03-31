import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '../lib/cn';

const sizeConfig = {
  sm: { circle: 'size-12', icon: 'text-lg', label: 'text-xs max-w-20' },
  default: { circle: 'size-16', icon: 'text-2xl', label: 'text-sm max-w-24' },
  lg: { circle: 'size-20', icon: 'text-3xl', label: 'text-base max-w-28' },
} as const;

const iconButtonVariants = cva(
  'flex flex-col items-center gap-sm cursor-pointer bg-transparent border-none p-0 group',
  {
    variants: {
      size: {
        sm: '',
        default: '',
        lg: '',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

function IconButton({
  className,
  size = 'default',
  asChild = false,
  icon,
  label,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof iconButtonVariants> & {
    asChild?: boolean;
    icon: React.ReactNode;
    label: string;
  }) {
  const Comp = asChild ? Slot.Root : 'button';
  const s = sizeConfig[size ?? 'default'];

  return (
    <Comp
      type={asChild ? undefined : 'button'}
      data-slot="icon-button"
      data-size={size}
      className={cn(iconButtonVariants({ size, className }))}
      {...props}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full',
          'bg-background-pure dark:bg-grey-700',
          'text-secondary-600 dark:text-grey-200',
          'transition-all duration-200',
          'group-hover:bg-grey-50 dark:group-hover:bg-grey-600',
          'group-hover:scale-105',
          'shadow-md dark:shadow-none',
          s.circle
        )}
      >
        <span className={s.icon}>{icon}</span>
      </div>
      <span className={cn('text-foreground text-center leading-tight', s.label)}>{label}</span>
    </Comp>
  );
}

const MemoizedIconButton = React.memo(IconButton);

const iconButtonRowVariants = cva('flex flex-wrap', {
  variants: {
    gap: {
      sm: 'gap-sm',
      md: 'gap-md',
      lg: 'gap-lg',
      xl: 'gap-xl',
    },
    padding: {
      none: '',
      sm: 'p-sm',
      md: 'p-md',
      lg: 'p-lg',
    },
  },
  defaultVariants: {
    gap: 'xl',
    padding: 'md',
  },
});

function IconButtonRow({
  className,
  gap,
  padding,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof iconButtonRowVariants>) {
  return (
    <div
      data-slot="icon-button-row"
      className={cn(iconButtonRowVariants({ gap, padding, className }))}
      {...props}
    />
  );
}

export {
  MemoizedIconButton as IconButton,
  iconButtonVariants,
  IconButtonRow,
  iconButtonRowVariants,
};
