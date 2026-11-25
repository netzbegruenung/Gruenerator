import { cn } from '@gruenerator/shared/utils';
import { Skeleton as BaseSkeleton } from '@gruenerator/ui';
import { type ComponentProps, type ReactNode } from 'react';

// `bg-muted` disappears on the editor's dark header; the editor greys stay visible in both themes.
function Skeleton({ className, ...props }: ComponentProps<typeof BaseSkeleton>) {
  return <BaseSkeleton className={cn('bg-grey-200 dark:bg-grey-700', className)} {...props} />;
}

/**
 * Loading placeholder shaped like the editor (header, the page over the full width),
 * so the editor lands in place instead of replacing a centred spinner.
 * `data-reduce-motion` on <html> already stops the pulse for reduced motion. `children` float
 * centred on top, e.g. the progress of a running generation. `page` takes the place of the page
 * placeholder, e.g. the site while it is being written; the header stays a placeholder, so the
 * editor still lands in place.
 */
export function EditorSkeleton({
  label,
  children,
  page,
}: {
  label: string;
  children?: ReactNode;
  page?: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="relative flex h-dvh min-h-0 flex-col bg-grey-100 dark:bg-grey-800"
    >
      {children && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-md">
          {children}
        </div>
      )}
      {/* The editor's top bar (`EditorHeader`), zone by zone: back, site name and save state;
          the device widths in the middle; undo, redo, preview and publish. */}
      <div className="relative flex h-11 shrink-0 items-center gap-xxs border-b border-grey-200 bg-background-pure px-xs dark:border-grey-700">
        <Skeleton className="size-8" />
        <Skeleton className="ml-xs h-6 w-28" />
        <Skeleton className="ml-xs h-3 w-20 max-sm:hidden" />
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-xs max-canvas-mobile:hidden">
          <Skeleton className="size-6" />
          <Skeleton className="size-6" />
          <Skeleton className="size-6" />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-xs">
          <Skeleton className="size-6" />
          <Skeleton className="size-6 max-sm:hidden" />
          <Skeleton className="size-6" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background-pure">
        {page ?? <PagePlaceholder />}
      </div>
    </div>
  );
}

function PagePlaceholder() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-lg p-lg">
      <div className="grid items-center gap-lg md:grid-cols-[7fr_5fr]">
        <div className="flex flex-col gap-md">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        <Skeleton className="aspect-[4/5] w-full max-md:hidden" />
      </div>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
