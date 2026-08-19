'use client';

import { Skeleton } from '@gruenerator/ui';

import { cn } from '../../lib/utils';

/**
 * Placeholder shown while a thread's history is being fetched.
 *
 * `thread.isEmpty` is `messages.length === 0 && !isLoading`, so the welcome
 * screen deliberately stays hidden during a load — which left the thread body
 * completely blank between two conversations. Switching then read as
 * "old thread → blank → new thread", i.e. as a flicker, even when the switch
 * itself was correct.
 */
export function ThreadLoadingSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn('flex flex-col', compact ? 'gap-2' : 'gap-6')}
      aria-busy="true"
      aria-live="polite"
      aria-label="Unterhaltung wird geladen"
    >
      <div className="flex justify-end">
        <Skeleton className="h-10 w-[45%] rounded-2xl" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-[85%]" />
        <Skeleton className="h-4 w-[70%]" />
        <Skeleton className="h-4 w-[78%]" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-[35%] rounded-2xl" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-[80%]" />
        <Skeleton className="h-4 w-[60%]" />
      </div>
    </div>
  );
}
