import { deriveIndexingState, type NotebookIndexingState } from '@gruenerator/contracts';
import { HiExclamationTriangle } from 'react-icons/hi2';
import { Link } from 'react-router-dom';

/**
 * The readiness to display, preferring the server's verdict over our own.
 *
 * "Leer" is the harshest thing this notice says — it tells people their sources
 * are gone. The client-side fallback cannot actually tell an empty notebook
 * apart from one whose documents did not arrive (a backend predating
 * `indexing_state`, an errored lookup), and both hand us the same empty array.
 * So `empty` is only ever repeated, never derived: unless the server states it,
 * an empty document list yields null and the notice stays silent. The other
 * states need real document rows as evidence and may be derived.
 */
export function resolveIndexingState(collection: {
  indexing_state?: NotebookIndexingState | null;
  documents?: ReadonlyArray<{ status?: string | null }> | null;
}): NotebookIndexingState | null {
  if (collection.indexing_state) return collection.indexing_state;
  const derived = deriveIndexingState(collection.documents ?? []);
  return derived === 'empty' ? null : derived;
}

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
      ? 'Dieses Notebook hat noch keine Quellen. Füge welche hinzu, damit es Fragen beantworten kann.'
      : state === 'failed'
        ? 'Keine der Quellen konnte gelesen werden. Dieses Notebook kann noch nichts beantworten.'
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
