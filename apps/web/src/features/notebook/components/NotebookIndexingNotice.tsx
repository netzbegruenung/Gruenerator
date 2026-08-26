import { type NotebookIndexingState } from '@gruenerator/contracts';
import { HiExclamationTriangle } from 'react-icons/hi2';
import { Link } from 'react-router-dom';

export interface NotebookIndexingNoticeProps {
  state: NotebookIndexingState | null | undefined;
  counts?: { ready: number; indexing: number; failed: number; total: number } | null;
  /** Slug or id used for the "Quellen verwalten" link. Omitted for read-only views. */
  editHref?: string;
}

/**
 * Explains, above the chat, why a notebook may not answer fully yet.
 *
 * Without it the only feedback was the answer itself: a notebook whose sources
 * were still being imported replied "nichts gefunden" to every question, which
 * is indistinguishable from a genuine miss. `ready` renders nothing.
 */
export default function NotebookIndexingNotice({
  state,
  counts,
  editHref,
}: NotebookIndexingNoticeProps) {
  if (state !== 'indexing' && state !== 'partial' && state !== 'failed' && state !== 'empty') {
    return null;
  }

  const shared = 'mx-auto flex w-full max-w-3xl items-start gap-2 rounded-lg px-3 py-2 text-sm';

  if (state === 'indexing') {
    const progress =
      counts && counts.total > 0 ? ` (${counts.ready} von ${counts.total} bereit)` : '';
    return (
      <div
        // Not an alert: this resolves on its own and must not interrupt a
        // screen reader mid-sentence. Polite means it is announced after the
        // current utterance.
        role="status"
        className={`${shared} bg-grey-50 text-grey-700 dark:bg-grey-800/50 dark:text-grey-200`}
      >
        <span
          className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-grey-300 border-t-primary-500"
          aria-hidden
        />
        <span>
          Die Quellen werden noch indexiert{progress}. Antworten können so lange unvollständig sein.
        </span>
      </div>
    );
  }

  const message =
    state === 'empty'
      ? 'Dieses Notizbuch hat noch keine Quellen. Füge welche hinzu, damit es Fragen beantworten kann.'
      : state === 'failed'
        ? 'Keine der Quellen konnte gelesen werden. Dieses Notizbuch kann noch nichts beantworten.'
        : `Einige Quellen konnten nicht gelesen werden${
            counts ? ` (${counts.failed} von ${counts.total})` : ''
          }. Antworten stützen sich nur auf die übrigen.`;

  return (
    <div
      role="status"
      className={`${shared} bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100`}
    >
      <HiExclamationTriangle size={18} aria-hidden className="mt-0.5 shrink-0" />
      <span>
        {message}{' '}
        {editHref && (
          <Link to={editHref} className="font-medium underline underline-offset-2">
            Quellen verwalten
          </Link>
        )}
      </span>
    </div>
  );
}
