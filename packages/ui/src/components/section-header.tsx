import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { PlusIcon } from 'lucide-react';

import { cn } from '../lib/cn';

const sectionHeaderVariants = cva('flex items-center justify-between', {
  variants: {
    size: {
      default: 'mb-md',
      sm: 'mb-sm',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

const plusButtonClass =
  'flex items-center justify-center w-7 h-7 rounded-full text-primary-600 hover:bg-primary-600/10 transition-colors cursor-pointer border-none bg-transparent';

function SectionHeader({
  className,
  size = 'default',
  title,
  titleHref,
  onCreate,
  createLabel,
  createMenu,
  actions,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof sectionHeaderVariants> & {
    title: string;
    titleHref?: string;
    onCreate?: () => void;
    createLabel?: string;
    /** Wraps the plus button as a dropdown trigger. Receives the button as children. */
    createMenu?: (trigger: React.ReactNode) => React.ReactNode;
    actions?: React.ReactNode;
  }) {
  const Heading = size === 'sm' ? 'h3' : 'h2';
  const headingClass =
    size === 'sm'
      ? 'text-sm font-medium text-foreground m-0'
      : 'text-xl font-semibold text-foreground-heading m-0';

  const plusButton =
    onCreate || createMenu ? (
      <button
        type="button"
        onClick={createMenu ? undefined : onCreate}
        className={plusButtonClass}
        aria-label={createLabel ?? 'Neu erstellen'}
      >
        <PlusIcon className="size-[18px]" />
      </button>
    ) : null;

  return (
    <div
      data-slot="section-header"
      data-size={size}
      className={cn(sectionHeaderVariants({ size, className }))}
      {...props}
    >
      <div className="flex items-center gap-xs">
        {titleHref ? (
          <a href={titleHref} target="_blank" rel="noopener noreferrer" className="no-underline">
            <Heading className={cn(headingClass, 'hover:text-primary-600 transition-colors')}>
              {title}
            </Heading>
          </a>
        ) : (
          <Heading className={headingClass}>{title}</Heading>
        )}
        {createMenu && plusButton ? createMenu(plusButton) : plusButton}
      </div>
      {actions && <div className="flex items-center gap-xs">{actions}</div>}
    </div>
  );
}

const MemoizedSectionHeader = React.memo(SectionHeader);

export { MemoizedSectionHeader as SectionHeader, sectionHeaderVariants };
