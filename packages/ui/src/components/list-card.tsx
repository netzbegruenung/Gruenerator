import * as React from 'react';

import { cn } from '../lib/cn';

function ListCard({
  className,
  interactive = true,
  ...props
}: React.ComponentProps<'div'> & { interactive?: boolean }) {
  return (
    <div
      data-slot="list-card"
      className={cn(
        'group flex items-center gap-sm bg-background border border-grey-200 dark:border-grey-700 rounded-md px-md py-md min-h-[4rem]',
        interactive &&
          'cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md',
        className
      )}
      {...props}
    />
  );
}

function ListCardIcon({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-card-icon"
      className={cn('text-base text-secondary-600 shrink-0', className)}
      {...props}
    />
  );
}

function ListCardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-card-content"
      className={cn('flex flex-col flex-1 min-w-0', className)}
      {...props}
    />
  );
}

function ListCardTitle({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="list-card-title"
      className={cn('text-sm font-medium text-foreground-heading truncate', className)}
      {...props}
    />
  );
}

function ListCardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="list-card-description"
      className={cn('text-xs text-foreground mt-0.5 m-0 line-clamp-2', className)}
      {...props}
    />
  );
}

function ListCardMeta({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-card-meta"
      className={cn('flex items-center gap-xs mt-xs text-xs text-foreground-muted', className)}
      {...props}
    />
  );
}

function ListCardActions({ className, onClick, onKeyDown, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="list-card-actions"
      className={cn(
        'shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300',
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        onKeyDown?.(e);
      }}
      {...props}
    />
  );
}

export {
  ListCard,
  ListCardIcon,
  ListCardContent,
  ListCardTitle,
  ListCardDescription,
  ListCardMeta,
  ListCardActions,
};
