import { cn } from '@gruenerator/shared/utils';
import { Skeleton as BaseSkeleton } from '@gruenerator/ui';
import { type ComponentProps, type ReactNode } from 'react';

// `bg-muted` disappears on the editor's dark header; the editor greys stay visible in both themes.
function Skeleton({ className, ...props }: ComponentProps<typeof BaseSkeleton>) {
  return <BaseSkeleton className={cn('bg-grey-200 dark:bg-grey-700', className)} {...props} />;
}

/**
 * Loading placeholder shaped like the editor (header, form column, preview),
 * so the editor lands in place instead of replacing a centred spinner.
 * `data-reduce-motion` on <html> already stops the pulse for reduced motion. `children` float
 * centred on top, e.g. the progress of a running generation.
 */
export function EditorSkeleton({ label, children }: { label: string; children?: ReactNode }) {
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
        <div className="hidden lg:flex flex-1 gap-xs">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-20" />
          ))}
        </div>
        <div className="flex gap-xs ml-auto">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr] h-[calc(100dvh-60px)] overflow-hidden max-lg:grid-cols-1">
        <div className="max-lg:hidden flex flex-col gap-lg p-md bg-grey-50 dark:bg-grey-900 border-r border-grey-200 dark:border-grey-700">
          <Skeleton className="h-6 w-48" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-xs">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-28 w-full" />
        </div>
        <div className="p-md max-lg:p-sm">
          <div className="h-full flex flex-col gap-md p-md bg-background-pure rounded-lg overflow-hidden">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}
