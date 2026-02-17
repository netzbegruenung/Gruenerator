import { ToggleGroup } from 'radix-ui';
import * as React from 'react';
import { type VariantProps } from 'class-variance-authority';

import { cn } from '@/utils/cn';
import { toggleVariants } from '@/components/ui/toggle';

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  size: 'default',
  variant: 'default',
});

function ToggleGroupRoot({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroup.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroup.Root
      data-slot="toggle-group"
      className={cn('flex items-center gap-1', className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroup.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroup.Item> & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroup.Item
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants({
          variant: variant || context.variant,
          size: size || context.size,
        }),
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroup.Item>
  );
}

export { ToggleGroupRoot as ToggleGroup, ToggleGroupItem };
