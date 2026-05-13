import { Button } from '@gruenerator/ui';
import { HiCheckCircle, HiOutlineClock, HiX } from 'react-icons/hi';

import { cn } from '../../../utils/cn';

import { useDocumentStatusPolling } from '../hooks/useDocumentStatusPolling';

import type { DocumentStatusValue } from '@gruenerator/contracts';

interface DocumentMeta {
  id: string;
  title: string;
}

interface Props {
  notebookName: string;
  documents: DocumentMeta[];
  onClose: () => void;
}

const ROW_LABEL: Record<DocumentStatusValue, string> = {
  pending: 'Wartet',
  uploaded: 'Wartet',
  processing: 'Wird verarbeitet…',
  completed: 'Fertig',
  failed: 'Fehler',
};

const TERMINAL: ReadonlySet<DocumentStatusValue> = new Set(['completed', 'failed']);

const StatusIcon = ({ status }: { status: DocumentStatusValue }) => {
  if (status === 'completed') {
    return <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden />;
  }
  if (status === 'failed') {
    return <HiX className="w-5 h-5 text-red-500 shrink-0" aria-hidden />;
  }
  if (status === 'processing') {
    return (
      <span
        className="w-5 h-5 shrink-0 inline-block rounded-full border-2 border-primary-500 border-t-transparent animate-spin"
        aria-hidden
      />
    );
  }
  return <HiOutlineClock className="w-5 h-5 text-neutral-400 shrink-0" aria-hidden />;
};

const NotebookCreationProgress = ({ notebookName, documents, onClose }: Props) => {
  const ids = documents.map((d) => d.id);
  const { statuses, allDone } = useDocumentStatusPolling(ids, { enabled: ids.length > 0 });

  const doneCount = documents.filter((d) =>
    TERMINAL.has(statuses[d.id] ?? 'pending')
  ).length;
  const total = documents.length;
  const percent = total === 0 ? 100 : Math.round((doneCount / total) * 100);

  return (
    <div className="p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{notebookName || 'Notebook'} wird erstellt…</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Deine Dokumente werden verarbeitet. Das kann je nach Größe einige Sekunden dauern.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {documents.map((doc) => {
          const status = statuses[doc.id] ?? 'pending';
          const isFailed = status === 'failed';
          return (
            <li
              key={doc.id}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md bg-neutral-50 dark:bg-neutral-900',
                isFailed && 'bg-red-50 dark:bg-red-950/30'
              )}
            >
              <StatusIcon status={status} />
              <span className="flex-1 truncate text-sm">{doc.title}</span>
              <span
                className={cn(
                  'text-xs text-neutral-500',
                  status === 'completed' && 'text-emerald-600',
                  isFailed && 'text-red-600'
                )}
              >
                {ROW_LABEL[status]}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-neutral-500">
          <span>
            {doneCount} von {total} abgeschlossen
          </span>
          <span>{percent}%</span>
        </div>
        <div
          className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-primary-500 transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={onClose} disabled={!allDone}>
          {allDone ? 'Schließen' : 'Bitte warten…'}
        </Button>
      </div>
    </div>
  );
};

export default NotebookCreationProgress;
