import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn';

const cardGridVariants = cva('grid', {
  variants: {
    columns: {
      '1': 'grid-cols-1',
      '2': 'grid-cols-2 max-sm:grid-cols-1',
      '3': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      '5': 'grid-cols-5 max-lg:grid-cols-4 max-md:grid-cols-3 max-sm:grid-cols-2',
      auto: 'grid-cols-[repeat(auto-fill,minmax(300px,1fr))] max-lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]',
    },
    gap: {
      sm: 'gap-sm',
      md: 'gap-md',
      lg: 'gap-lg',
      xl: 'gap-xl',
      '2xl': 'gap-2xl',
      '4': 'gap-4',
    },
  },
  defaultVariants: {
    columns: 'auto',
    gap: 'sm',
  },
});

function CardGrid({
  className,
  columns,
  gap,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof cardGridVariants>) {
  return (
    <div
      data-slot="card-grid"
      className={cn(cardGridVariants({ columns, gap, className }))}
      {...props}
    />
  );
}

export { CardGrid, cardGridVariants };
