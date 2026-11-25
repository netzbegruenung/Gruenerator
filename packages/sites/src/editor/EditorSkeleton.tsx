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
      className="relative min-h-full flex flex-col bg-grey-100 dark:bg-grey-800"
    >
      {children && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-md">
          {children}
        </div>
      )}
      <div className="flex items-center gap-sm py-sm px-md bg-background-pure border-b border-grey-200 dark:border-grey-700 min-h-14">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
        <div className="flex gap-xs ml-auto">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="relative h-[calc(100dvh-57px)] overflow-hidden bg-background-pure">
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
