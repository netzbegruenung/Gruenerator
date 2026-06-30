import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn';

// `gap` on a multi-column box sets column-gap (horizontal). Vertical spacing
// between stacked items is handled by MasonryItem's bottom margin.
const masonryGridVariants = cva('w-full', {
  variants: {
    columns: {
      '2': 'columns-2',
      '3': 'columns-3',
      '4': 'columns-4',
    },
    gap: {
      sm: 'gap-sm',
      md: 'gap-md',
      lg: 'gap-lg',
    },
  },
  defaultVariants: {
    columns: '2',
    gap: 'sm',
  },
});

function MasonryGrid({
  className,
  columns,
  gap,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof masonryGridVariants>) {
  return (
    <div
      data-slot="masonry-grid"
      className={cn(masonryGridVariants({ columns, gap, className }))}
      {...props}
    />
  );
}

const masonryItemVariants = cva('break-inside-avoid', {
  variants: {
    gap: {
      sm: 'mb-sm',
      md: 'mb-md',
      lg: 'mb-lg',
    },
  },
  defaultVariants: {
    gap: 'sm',
  },
});

function MasonryItem({
  className,
  gap,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof masonryItemVariants>) {
  return (
    <div
      data-slot="masonry-item"
      className={cn(masonryItemVariants({ gap, className }))}
      {...props}
    />
  );
}

export { MasonryGrid, MasonryItem, masonryGridVariants };
