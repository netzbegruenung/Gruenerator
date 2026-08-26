import { type NotebookIndexingState } from '@gruenerator/contracts';
import { cn } from '@gruenerator/ui';
import { HiExclamationCircle } from 'react-icons/hi2';

export interface NotebookIndexingBadgeProps {
  state: NotebookIndexingState | null | undefined;
  className?: string;
}

/**
 * Says out loud whether a notebook can answer questions yet.
 *
 * Without this the card for a notebook whose sources are still being indexed
 * was pixel-identical to a finished one: the user opened it, asked a question
 * and got "nothing found" — indistinguishable from an empty result. `ready` and
 * `empty` render nothing; a finished notebook needs no badge, and an empty one
 * already says "0 Quellen" in its meta line.
 */
export default function NotebookIndexingBadge({ state, className }: NotebookIndexingBadgeProps) {
  if (state !== 'indexing' && state !== 'partial' && state !== 'failed') return null;

  const pill = cn(
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
    'bg-white/90 backdrop-blur-sm dark:bg-black/60',
    className
  );

  if (state === 'indexing') {
    return (
      <span className={cn(pill, 'text-grey-700 dark:text-grey-200')}>
        <span
          className="size-3 shrink-0 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500"
          aria-hidden
        />
        Wird indexiert
      </span>
    );
  }

  const failed = state === 'failed';
  return (
    <span className={cn(pill, 'text-red-700 dark:text-red-400')}>
      <HiExclamationCircle size={14} aria-hidden className="shrink-0" />
      {failed ? 'Nicht durchsuchbar' : 'Teilweise indexiert'}
    </span>
  );
}
