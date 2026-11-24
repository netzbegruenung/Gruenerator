import { Suspense, lazy, useState } from 'react';

import { cn } from '@/utils/cn';

// The walkthrough pulls motion and its mock-ups: loaded on the first click only.
const NavigationAnnouncementDialog = lazy(() => import('./NavigationAnnouncementDialog'));

/** „Neu: …" under the start composer; opens the walkthrough of the new navigation. */
export function NavigationNewsPill({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRequested(true);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-1.5 text-[13.5px] font-semibold text-grey-900 shadow-sm transition-colors hover:bg-grey-50',
          'dark:border-white/10 dark:bg-grey-900 dark:text-grey-100 dark:hover:bg-grey-800',
          className
        )}
      >
        <span className="text-primary-700 dark:text-primary-300">Neu:</span>
        Entdecke die neue Navigation
      </button>
      {requested && (
        <Suspense fallback={null}>
          <NavigationAnnouncementDialog open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
