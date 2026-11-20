import { Skeleton } from '@gruenerator/ui';

/**
 * Loading placeholder shaped like the editor (header, form column, preview),
 * so the editor lands in place instead of replacing a centred spinner.
 * `data-reduce-motion` on <html> already stops the pulse for reduced motion.
 */
export function EditorSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="min-h-full flex flex-col bg-grey-100 dark:bg-grey-800"
    >
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
